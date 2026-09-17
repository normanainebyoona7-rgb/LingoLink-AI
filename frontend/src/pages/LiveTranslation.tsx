import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import SearchableDropdown from '../components/SearchableDropdown';

interface Props {
  token: string;
}

type Gender = 'male' | 'female';

interface LiveSegment {
  id: number;
  detectedLang: string;
  originalText: string;
  translatedText: string;
  timestamp: number;
}

const STORAGE_KEY = 'lingolink_live_transcript';
const CHUNK_MS = 5000; // 5 seconds per chunk

export default function LiveTranslation({ token }: Props) {
  const { darkMode } = useTheme();

  const [targetLang, setTargetLang] = useState('english');
  const [gender, setGender] = useState<Gender>('female');
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  const idCounterRef = useRef(1);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Load transcript from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSegments(parsed);
        const maxId = Math.max(0, ...parsed.map((s: LiveSegment) => s.id));
        idCounterRef.current = maxId + 1;
      }
    } catch {}
  }, []);

  // Save transcript
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
    } catch {}
  }, [segments]);

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ---- Start continuous recording ----
  const startRecording = async () => {
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        }
      });

      streamRef.current = stream;
      setIsRecording(true);
      stopRef.current = false;

      // Loop: record 5s → process → record next 5s
      const recordChunk = () => {
        if (stopRef.current || !streamRef.current) return;

        const mimeTypes = [
          'audio/webm;codecs=opus', 'audio/webm',
          'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
          'audio/ogg;codecs=opus', 'audio/ogg', ''
        ];
        let mimeType = '';
        for (const m of mimeTypes) {
          if (m === '' || MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
        }

        const recorder = mimeType
          ? new MediaRecorder(streamRef.current, { mimeType })
          : new MediaRecorder(streamRef.current);

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            // Skip if blob is too small (< 5 KB = silence or nothing)
            if (blob.size > 5000) {
              await processChunk(blob);
            }
          }
          // Continue with next chunk
          if (!stopRef.current) recordChunk();
        };

        mediaRecorderRef.current = recorder;
        recorder.start();

        // Auto-stop after CHUNK_MS
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, CHUNK_MS);
      };

      recordChunk();
    } catch (err: any) {
      console.error('Mic error:', err);
      setError('Microphone access denied or unavailable');
      setIsRecording(false);
    }
  };

  // ---- Stop recording ----
  const stopRecording = () => {
    stopRef.current = true;
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // ---- Process a single chunk: transcribe → translate → speak ----
  const processChunk = async (blob: Blob) => {
    setProcessing(true);
    try {
      // 1) Transcribe with auto-detect
      const formData = new FormData();
      const ext = blob.type.includes('webm') ? 'webm'
                : blob.type.includes('mp4') ? 'm4a'
                : blob.type.includes('ogg') ? 'ogg' : 'wav';
      formData.append('file', blob, `chunk.${ext}`);
      formData.append('language', 'auto');
      formData.append('auto_detect', 'true');

      const tRes = await fetch(`${API_URL}/speech/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!tRes.ok) {
        setProcessing(false);
        return;
      }

      const tData = await tRes.json();
      const originalText = (tData.text || '').trim();
      const detectedLang = (tData.language || 'auto').toLowerCase();

      if (!originalText || originalText.length < 2) {
        setProcessing(false);
        return;
      }

      // Skip very short/common filler
      if (originalText.toLowerCase() === 'you' || originalText.toLowerCase() === 'thank you.') {
        // still process, but you could add a filter here
      }

      // 2) Translate to target language
      let translatedText = originalText;
      if (detectedLang !== targetLang && detectedLang !== 'auto') {
        const trRes = await fetch(`${API_URL}/translate/text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: originalText,
            source_language: detectedLang,
            target_language: targetLang,
          }),
        });

        if (trRes.ok) {
          const trData = await trRes.json();
          translatedText = trData.translated_text || originalText;
        }
      }

      const segment: LiveSegment = {
        id: idCounterRef.current++,
        detectedLang,
        originalText,
        translatedText,
        timestamp: Date.now(),
      };

      setSegments((prev) => [...prev, segment]);

      // 3) Auto-speak
      if (autoSpeak && translatedText) {
        speak(translatedText, targetLang);
      }
    } catch (err) {
      console.error('Chunk processing failed:', err);
    } finally {
      setProcessing(false);
    }
  };

  const speak = async (text: string, language: string) => {
    try {
      const res = await fetch(`${API_URL}/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text, language, gender, speed: 1.0 }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.pause();
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch {}
  };

  const clearTranscript = () => {
    if (!window.confirm('Clear the live transcript?')) return;
    setSegments([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className={`live-root ${darkMode ? 'live-dark' : 'live-light'}`}>

      <div className="live-header">
        <h2>🎙️ Live Translation</h2>
        <p>Auto-detects language and translates continuously</p>
      </div>

      {/* Controls */}
      <div className="live-controls">
        <div className="live-control-row">
          <span className="live-control-label">Show everything in</span>
          <div className="live-dropdown-wrap">
            <SearchableDropdown
              value={targetLang}
              onChange={setTargetLang}
              placeholder="target language"
            />
          </div>
        </div>

        <div className="live-control-row">
          <span className="live-control-label">Voice</span>
          <div className="live-gender-toggle">
            <button
              type="button"
              className={`live-gender-btn ${gender === 'female' ? 'active' : ''}`}
              onClick={() => setGender('female')}
            >👩 Female</button>
            <button
              type="button"
              className={`live-gender-btn ${gender === 'male' ? 'active' : ''}`}
              onClick={() => setGender('male')}
            >👨 Male</button>
          </div>
        </div>

        <div className="live-control-row">
          <span className="live-control-label">Auto-Speak</span>
          <button
            className={`slider-toggle ${autoSpeak ? 'on' : 'off'}`}
            onClick={() => setAutoSpeak(!autoSpeak)}
            role="switch"
            aria-checked={autoSpeak}
          >
            <span className="slider-knob"></span>
          </button>
        </div>
      </div>

      {/* Record button */}
      <div className="live-record-section">
        {!isRecording ? (
          <button className="live-record-btn" onClick={startRecording}>
            <span className="live-record-dot"></span>
            Start Live Record
          </button>
        ) : (
          <button className="live-record-btn live-record-btn-active" onClick={stopRecording}>
            <span className="live-record-dot-pulse"></span>
            Stop Recording
          </button>
        )}
        {isRecording && (
          <p className="live-status">
            {processing ? '⏳ Processing chunk…' : '🎧 Listening…'}
          </p>
        )}
      </div>

      {error && <p className="live-error">❌ {error}</p>}

      {/* Transcript */}
      <div className="live-transcript">
        <div className="live-transcript-header">
          <h3>💬 Live Transcript</h3>
          {segments.length > 0 && (
            <button className="live-clear-btn" onClick={clearTranscript}>
              🗑️ Clear
            </button>
          )}
        </div>

        {segments.length === 0 ? (
          <div className="live-empty">
            <span className="live-empty-icon">🎙️</span>
            <p>Nothing captured yet</p>
            <span>Press "Start Live Record" and speak</span>
          </div>
        ) : (
          <div className="live-transcript-list">
            {segments.map((seg) => (
              <div key={seg.id} className="live-segment">
                <div className="live-segment-header">
                  <span className="live-segment-lang">[{seg.detectedLang}]</span>
                  <span className="live-segment-time">
                    {new Date(seg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="live-segment-original">{seg.originalText}</p>
                {seg.translatedText && seg.translatedText !== seg.originalText && (
                  <p className="live-segment-translated">→ {seg.translatedText}</p>
                )}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}