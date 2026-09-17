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

// VAD config
const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 900;
const MIN_CHUNK_MS = 1500;
const MAX_CHUNK_MS = 15000;

export default function LiveTranslation({ token }: Props) {
  const { darkMode } = useTheme();

  const [targetLang, setTargetLang] = useState('english');
  const [gender, setGender] = useState<Gender>('female');
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  const idCounterRef = useRef(1);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const recordingStartRef = useRef<number>(0);
  const lastSoundTimeRef = useRef<number>(0);

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
    } catch {}
  }, [segments]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments]);

  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // ---- Recording loop with VAD ----
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

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const checkVolume = () => {
        if (stopRef.current || !analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setVolume(avg);

        const now = Date.now();
        const isSound = avg > SILENCE_THRESHOLD;

        if (isSound) {
          lastSoundTimeRef.current = now;
        }

        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === 'recording' &&
          now - lastSoundTimeRef.current > SILENCE_DURATION_MS
        ) {
          mediaRecorderRef.current.stop();
        }

        if (
          (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') &&
          isSound
        ) {
          startChunk();
        }

        requestAnimationFrame(checkVolume);
      };

      const startChunk = () => {
        if (!streamRef.current || stopRef.current) return;

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
          const duration = Date.now() - recordingStartRef.current;

          if (chunks.length > 0 && duration >= MIN_CHUNK_MS) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            if (blob.size > 5000) {
              await processChunk(blob);
            }
          }
        };

        mediaRecorderRef.current = recorder;
        recordingStartRef.current = Date.now();
        lastSoundTimeRef.current = Date.now();
        recorder.start();

        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, MAX_CHUNK_MS);
      };

      checkVolume();
    } catch (err: any) {
      console.error('Mic error:', err);
      setError('Microphone access denied or unavailable');
      setIsRecording(false);
    }
  };

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
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const processChunk = async (blob: Blob) => {
    setProcessing(true);
    try {
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

      if (!tRes.ok) { setProcessing(false); return; }

      const tData = await tRes.json();
      const originalText = (tData.text || '').trim();
      const detectedLang = (tData.language || 'auto').toLowerCase();

      if (!originalText || originalText.length < 2) {
        setProcessing(false);
        return;
      }

      // ---- ALWAYS call /translate/text ----
      // Even if detectedLang is 'auto' or the same as target, let the backend decide.
      let translatedText = originalText;
      try {
        const trRes = await fetch(`${API_URL}/translate/text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: originalText,
            source_language: detectedLang === 'auto' ? 'auto' : detectedLang,
            target_language: targetLang,
          }),
        });

        if (trRes.ok) {
          const trData = await trRes.json();
          const result = (trData.translated_text || '').trim();
          if (result && result !== originalText) {
            translatedText = result;
          }
        }
      } catch (err) {
        console.error('Translation call failed:', err);
      }

      // Echo check — strict (exact match)
      const isEchoed = translatedText.trim() === originalText.trim();

      const segment: LiveSegment = {
        id: idCounterRef.current++,
        detectedLang,
        originalText,
        translatedText: isEchoed ? '' : translatedText,
        timestamp: Date.now(),
      };

      setSegments((prev) => [...prev, segment]);

      if (autoSpeak && translatedText && !isEchoed) {
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
        <p>Auto-detects language and translates on natural pauses</p>
      </div>

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
          <>
            <div className="live-volume-bar">
              <div
                className="live-volume-fill"
                style={{ width: `${Math.min(100, volume * 300)}%` }}
              />
            </div>
            <p className="live-status">
              {processing ? '⏳ Processing…' : volume > 0.02 ? '🎧 Hearing you…' : '🤫 Listening for speech…'}
            </p>
          </>
        )}
      </div>

      {error && <p className="live-error">❌ {error}</p>}

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
                {seg.translatedText ? (
                  <p className="live-segment-translated">→ {seg.translatedText}</p>
                ) : (
                  <p className="live-segment-no-translation">
                    (translation unavailable)
                  </p>
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