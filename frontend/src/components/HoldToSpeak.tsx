import React, { useState, useRef, useCallback, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';

interface Props {
  token: string;
  language?: string;
  onTranscribed: (text: string) => void;
}

export default function HoldToSpeak({ token, language = 'auto', onTranscribed }: Props) {
  const { darkMode } = useTheme();
  const [isHolding, setIsHolding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('unknown');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchDeviceRef = useRef(false);

  useEffect(() => {
    checkPermission();
    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (isRecordingRef.current && mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const checkPermission = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setPermissionState(result.state);
        result.onchange = () => setPermissionState(result.state);
      }
    } catch (err) {
      console.log('Permissions API not supported');
    }
  };

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isProcessing) return;

    setError('');
    setIsProcessing(false);
    setShowPermissionModal(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100,
        }
      });

      isRecordingRef.current = true;
      streamRef.current = stream;
      setPermissionState('granted');

      const mimeTypes = [
        'audio/webm;codecs=opus', 'audio/webm',
        'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
        'audio/ogg;codecs=opus', 'audio/ogg', ''
      ];

      let selectedMimeType = '';
      for (const m of mimeTypes) {
        if (m === '' || MediaRecorder.isTypeSupported(m)) {
          selectedMimeType = m;
          break;
        }
      }

      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        setIsHolding(false);
        setIsProcessing(true);
        cleanupStream();

        if (chunks.length === 0) {
          setError('No audio recorded. Try again.');
          setIsProcessing(false);
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        await transcribeAudio(blob);
        setIsProcessing(false);
      };

      recorder.onerror = () => {
        isRecordingRef.current = false;
        setIsHolding(false);
        cleanupStream();
        setError('Recording error. Please try again.');
        setIsProcessing(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsHolding(true);

    } catch (err: any) {
      isRecordingRef.current = false;
      setIsHolding(false);
      cleanupStream();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
        setPermissionState('denied');
        setShowPermissionModal(true);
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Microphone is busy. Close other apps.');
      } else if (err.name === 'NotSupportedError') {
        setError('Your browser does not support audio recording.');
      } else {
        setError('Microphone error: ' + (err.message || err.name));
      }
    }
  }, [isProcessing, cleanupStream]);

  const stopRecording = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else if (isRecordingRef.current) {
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 200);
    }
  }, []);

  const transcribeAudio = async (blob: Blob) => {
    try {
      const formData = new FormData();
      const ext = blob.type.includes('webm') ? 'webm'
                : blob.type.includes('mp4') ? 'm4a'
                : blob.type.includes('ogg') ? 'ogg' : 'wav';
      formData.append('file', blob, `audio.${ext}`);
      formData.append('language', language);

      console.log(`📡 Sending audio (lang=${language})...`);

      const res = await fetch(`${API_URL}/speech/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.text || data.transcribed_text || '';
        console.log('✅ Transcribed:', text);
        if (text.trim()) {
          onTranscribed(text);
        } else {
          setError('No speech detected. Speak clearly.');
        }
      } else {
        setError('Transcription failed. Check backend.');
      }
    } catch (err) {
      console.error('Connection error:', err);
      setError('Connection error. Is backend running?');
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isTouchDeviceRef.current) return;
    startRecording();
  };
  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isTouchDeviceRef.current) return;
    stopRecording();
  };
  const handleMouseLeave = () => {
    if (isHolding && !isTouchDeviceRef.current) stopRecording();
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isTouchDeviceRef.current = true;
    startRecording();
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stopRecording();
  };
  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const requestPermission = async () => {
    setShowPermissionModal(false);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPermissionState('granted');
      setTimeout(() => startRecording(), 500);
    } catch (err: any) {
      setPermissionState('denied');
      setShowPermissionModal(true);
    }
  };

  return (
    <div className="hts-container">
      <button
        type="button"
        className={`hts-button ${isHolding ? 'holding' : ''} ${isProcessing ? 'processing' : ''} ${darkMode ? 'dark' : 'light'}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
        disabled={isProcessing}
        style={{
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: 'pointer',
        }}
      >
        <span className="hts-icon">{isProcessing ? '⏳' : isHolding ? '🔴' : '🎙️'}</span>
        <span className="hts-text">
          {isProcessing ? 'Processing...' : isHolding ? 'Release to Translate' : 'Hold to Speak'}
        </span>
      </button>

      {error && <p className="hts-error">❌ {error}</p>}
      {!error && !isHolding && !isProcessing && permissionState !== 'granted' && (
        <p className={`hts-hint ${darkMode ? 'dark' : 'light'}`}>
          {permissionState === 'denied'
            ? 'Microphone blocked. Tap to request access.'
            : 'Hold the button, speak clearly, then release'}
        </p>
      )}

      {showPermissionModal && (
        <div className="permission-modal-overlay" onClick={() => setShowPermissionModal(false)}>
          <div className="permission-modal" onClick={(e) => e.stopPropagation()}>
            <div className="permission-icon">🎤</div>
            <h3>Microphone Access Required</h3>
            <p>LingoLink AI needs access to your microphone to record and translate your speech.</p>

            <div className="permission-steps">
              <div className="permission-step">
                <span className="step-number">1</span>
                <span>Click <strong>"Request Permission"</strong> below</span>
              </div>
              <div className="permission-step">
                <span className="step-number">2</span>
                <span>When your browser asks, click <strong>"Allow"</strong></span>
              </div>
              <div className="permission-step">
                <span className="step-number">3</span>
                <span>If nothing happens, click the lock icon in the address bar</span>
              </div>
              <div className="permission-step">
                <span className="step-number">4</span>
                <span>Find "Microphone" and select <strong>"Allow"</strong></span>
              </div>
            </div>

            <div className="permission-browser-hint">
              <strong>Chrome:</strong> Settings → Privacy → Site Settings → Microphone → Allow
            </div>
            <div className="permission-browser-hint">
              <strong>Safari:</strong> Settings → Safari → Microphone → Allow
            </div>
            <div className="permission-browser-hint">
              <strong>Firefox:</strong> Settings → Privacy → Permissions → Microphone → Allow
            </div>

            <div className="permission-buttons">
              <button className="permission-close-btn" onClick={() => setShowPermissionModal(false)}>
                Close
              </button>
              <button className="permission-retry-btn" onClick={requestPermission}>
                🎤 Request Permission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}