import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import Icon from '../components/Icon';

interface Props {
  token: string;
}

type Gender = 'male' | 'female';
type CallState = 'idle' | 'connecting' | 'active' | 'ended';

interface Turn {
  role: 'user' | 'ai';
  text: string;
  language: string;
  ts: number;
  spoke?: boolean; // did the AI voice play for this turn?
}

const LANGS: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'english', label: 'English' },
  { code: 'luganda', label: 'Luganda' },
  { code: 'swahili', label: 'Swahili' },
  { code: 'acholi', label: 'Acholi' },
  { code: 'ateso', label: 'Ateso' },
  { code: 'runyankole', label: 'Runyankole' },
  { code: 'french', label: 'French' },
  { code: 'spanish', label: 'Spanish' },
];

const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 900;
const MIN_CHUNK_MS = 1200;
const MAX_CHUNK_MS = 15000;

export default function CallCenter({ token }: Props) {
  const { darkMode } = useTheme();

  const [callState, setCallState] = useState<CallState>('idle');
  const [language, setLanguage] = useState('auto');
  const [gender, setGender] = useState<Gender>('female');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [callStartTs, setCallStartTs] = useState<number>(0);
  const [micMuted, setMicMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [micStatus, setMicStatus] = useState<'listening' | 'hearing' | 'paused'>('listening');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef<boolean>(false);
  const currentAudioAbortRef = useRef<AbortController | null>(null);
  const contextRef = useRef<{ role: string; content: string }[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartRef = useRef<number>(0);
  const lastSoundTimeRef = useRef<number>(0);
  const loopActiveRef = useRef<boolean>(false);
  const muteRef = useRef<boolean>(false);
  const speakingRef = useRef<boolean>(false);
  const thinkingRef = useRef<boolean>(false);
  const callActiveRef = useRef<boolean>(false);

  useEffect(() => { muteRef.current = micMuted; }, [micMuted]);
  useEffect(() => { speakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { thinkingRef.current = isThinking; }, [isThinking]);
  useEffect(() => { callActiveRef.current = callState === 'active'; }, [callState]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, isThinking]);

  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - callStartTs) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState, callStartTs]);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ============ AUDIO UNLOCK ============
  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    try {
      // Play a silent 100ms buffer to open the audio channel
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(ctx.currentTime + 0.05);
      setTimeout(() => ctx.close().catch(() => {}), 300);
      audioUnlockedRef.current = true;
      console.log('🔊 Audio unlocked');
    } catch (e) {
      console.warn('Audio unlock failed:', e);
    }
  };

  // ============ TTS ============
  const speakAI = async (text: string, lang: string, turnIndex: number) => {
    // Cancel any in-flight TTS
    if (currentAudioAbortRef.current) {
      currentAudioAbortRef.current.abort();
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
    }

    const abort = new AbortController();
    currentAudioAbortRef.current = abort;

    try {
      const res = await fetch(`${API_URL}/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          language: lang === 'auto' ? 'english' : lang,
          gender,
          speed: 1.0,
        }),
        signal: abort.signal,
      });
      if (!res.ok) {
        console.error('TTS HTTP error:', res.status);
        return;
      }
      const blob = await res.blob();
      if (abort.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.onplay = () => {
        setIsSpeaking(true);
        setMicStatus('paused');
      };
      audioRef.current.onended = () => {
        setIsSpeaking(false);
        if (callActiveRef.current) setMicStatus('listening');
        // Mark this turn as successfully spoken
        setTurns((prev) => {
          const next = [...prev];
          if (next[turnIndex]) next[turnIndex] = { ...next[turnIndex], spoke: true };
          return next;
        });
      };
      audioRef.current.onerror = () => {
        console.error('Audio element error');
        setIsSpeaking(false);
        if (callActiveRef.current) setMicStatus('listening');
      };
      try {
        await audioRef.current.play();
      } catch (playErr: any) {
        console.warn('Audio play blocked:', playErr);
        setIsSpeaking(false);
        if (callActiveRef.current) setMicStatus('listening');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('TTS failed:', e);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
    if (callActiveRef.current) setMicStatus('listening');
  };

  // Retry voice for a specific AI turn
  const replayTurn = (index: number) => {
    const turn = turns[index];
    if (!turn || turn.role !== 'ai') return;
    speakAI(turn.text, turn.language, index);
  };

  // ============ AI ============
  const sendToAI = async (text: string, detectedLang?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setError('');
    const lang = detectedLang && detectedLang !== 'auto'
      ? detectedLang
      : (language === 'auto' ? 'english' : language);

    const userTurn: Turn = {
      role: 'user',
      text: trimmed,
      language: lang,
      ts: Date.now(),
    };
    setTurns((prev) => [...prev, userTurn]);

    setIsThinking(true);
    setMicStatus('paused');
    try {
      const res = await fetch(`${API_URL}/ai/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          caller_text: trimmed,
          caller_language: lang,
          context: contextRef.current,
        }),
      });

      if (!res.ok) {
        setError('AI failed to reply. Check backend.');
        setIsThinking(false);
        if (callActiveRef.current) setMicStatus('listening');
        return;
      }

      const data = await res.json();
      contextRef.current = data.context || contextRef.current;

      const aiTurn: Turn = {
        role: 'ai',
        text: data.ai_reply_original || data.ai_reply_english || '',
        language: lang,
        ts: Date.now(),
        spoke: false,
      };

      // Compute index this turn will have
      let newIndex = 0;
      setTurns((prev) => {
        newIndex = prev.length;
        return [...prev, aiTurn];
      });
      setIsThinking(false);

      // Speak it (every AI reply speaks)
      if (aiTurn.text) {
        // small delay to let state update
        setTimeout(() => speakAI(aiTurn.text, lang, newIndex), 0);
      } else {
        if (callActiveRef.current) setMicStatus('listening');
      }
    } catch (e) {
      console.error('AI request failed:', e);
      setError('Connection error. Is backend running?');
      setIsThinking(false);
      if (callActiveRef.current) setMicStatus('listening');
    }
  };

  // ============ MIC / VAD ============
  const stopMic = () => {
    loopActiveRef.current = false;

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolume(0);
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      loopActiveRef.current = true;
      setMicStatus('listening');

      const startChunk = () => {
        if (!streamRef.current || !loopActiveRef.current) return;
        if (muteRef.current || speakingRef.current || thinkingRef.current) return;
        if (recorderRef.current && recorderRef.current.state === 'recording') return;

        const mimeTypes = [
          'audio/webm;codecs=opus', 'audio/webm',
          'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
          'audio/ogg;codecs=opus', 'audio/ogg', '',
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
              await transcribeAndSend(blob);
            }
          }
        };

        recorderRef.current = recorder;
        recordingStartRef.current = Date.now();
        lastSoundTimeRef.current = Date.now();
        try { recorder.start(); } catch {}

        setTimeout(() => {
          if (recorder.state === 'recording') {
            try { recorder.stop(); } catch {}
          }
        }, MAX_CHUNK_MS);
      };

      const checkVolume = () => {
        if (!loopActiveRef.current || !analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setVolume(avg);

        const paused = muteRef.current || speakingRef.current || thinkingRef.current;
        if (paused) {
          setMicStatus('paused');
          if (recorderRef.current && recorderRef.current.state === 'recording') {
            try { recorderRef.current.stop(); } catch {}
          }
          requestAnimationFrame(checkVolume);
          return;
        }

        const now = Date.now();
        const isSound = avg > SILENCE_THRESHOLD;

        if (isSound) {
          lastSoundTimeRef.current = now;
          setMicStatus('hearing');
        } else if (!recorderRef.current || recorderRef.current.state === 'inactive') {
          setMicStatus('listening');
        }

        if (
          recorderRef.current &&
          recorderRef.current.state === 'recording' &&
          now - lastSoundTimeRef.current > SILENCE_DURATION_MS
        ) {
          try { recorderRef.current.stop(); } catch {}
        }

        if (
          (!recorderRef.current || recorderRef.current.state === 'inactive') &&
          isSound
        ) {
          startChunk();
        }

        requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err: any) {
      console.error('Mic error:', err);
      setError('Microphone unavailable. Type instead.');
      setMicMuted(true);
    }
  };

  const transcribeAndSend = async (blob: Blob) => {
    try {
      const formData = new FormData();
      const ext = blob.type.includes('webm') ? 'webm'
                : blob.type.includes('mp4') ? 'm4a'
                : blob.type.includes('ogg') ? 'ogg' : 'wav';
      formData.append('file', blob, `chunk.${ext}`);
      formData.append('language', language === 'auto' ? 'auto' : language);
      formData.append('auto_detect', language === 'auto' ? 'true' : 'false');

      const res = await fetch(`${API_URL}/speech/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) return;
      const data = await res.json();
      const text = (data.text || '').trim();
      const detected = (data.language || 'auto').toLowerCase();

      if (!text || text.length < 2) return;

      await sendToAI(text, detected);
    } catch (e) {
      console.error('Transcribe failed:', e);
    }
  };

  // ============ CALL CONTROL ============
  const startCall = async () => {
    setTurns([]);
    contextRef.current = [];
    setError('');
    setElapsed(0);
    setCallStartTs(Date.now());
    setCallState('connecting');

    // Unlock audio BEFORE first AI reply
    unlockAudio();

    setTimeout(async () => {
      setCallState('active');
      await startMic();

      const greetingLang = language === 'auto' ? 'english' : language;
      const greeting = "Hello! I'm the LingoLink AI assistant. How can I help you today?";
      sendToAI(greeting, greetingLang);
    }, 700);
  };

  const endCall = () => {
    stopSpeaking();
    stopMic();
    setCallState('ended');
  };

  const newCall = () => {
    stopMic();
    setTurns([]);
    contextRef.current = [];
    setElapsed(0);
    setError('');
    setVolume(0);
    setCallState('idle');
  };

  const toggleMute = () => setMicMuted((m) => !m);

  const handleSendText = () => {
    const t = inputText.trim();
    if (!t) return;
    setInputText('');
    sendToAI(t);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // ============ RENDER ============
  return (
    <div className={`callcenter-root ${darkMode ? 'callcenter-dark' : 'callcenter-light'}`}>

      {callState === 'idle' && (
        <div className="cc-idle">
          <div className="cc-idle-avatar">
            <Icon name="bot" size={64} strokeWidth={1.3} />
          </div>
          <h2 className="cc-idle-title">AI Call Center</h2>
          <p className="cc-idle-sub">Press Start Call — then just talk.</p>

          <div className="cc-idle-controls">
            <div className="cc-idle-control">
              <label>Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="cc-idle-control">
              <label>Voice</label>
              <div className="cc-idle-gender">
                <button
                  type="button"
                  className={`cc-gender-btn ${gender === 'female' ? 'active' : ''}`}
                  onClick={() => setGender('female')}
                >
                  <Icon name="user-female" size={16} /> Female
                </button>
                <button
                  type="button"
                  className={`cc-gender-btn ${gender === 'male' ? 'active' : ''}`}
                  onClick={() => setGender('male')}
                >
                  <Icon name="user-male" size={16} /> Male
                </button>
              </div>
            </div>
          </div>

          <button className="cc-start-btn" onClick={startCall}>
            <Icon name="phone-call" size={22} />
            Start Call
          </button>
        </div>
      )}

      {callState === 'connecting' && (
        <div className="cc-connecting">
          <div className="cc-idle-avatar cc-connecting-pulse">
            <Icon name="bot" size={64} strokeWidth={1.3} />
          </div>
          <h2>Connecting…</h2>
          <p>Setting up your AI call</p>
        </div>
      )}

      {callState === 'active' && (
        <div className="cc-active">
          <div className="cc-active-header">
            <div className="cc-active-avatar">
              <Icon name="bot" size={28} />
            </div>
            <div className="cc-active-info">
              <h3>AI Assistant</h3>
              <span className="cc-active-meta">
                {language === 'auto' ? 'Auto' : LANGS.find(l => l.code === language)?.label} • {gender === 'female' ? 'Female' : 'Male'} voice
              </span>
            </div>
            <div className="cc-active-timer">
              <Icon name="clock" size={14} />
              {formatTime(elapsed)}
            </div>
          </div>

          <div className={`cc-mic-bar cc-mic-${micMuted ? 'muted' : micStatus}`}>
            <span className="cc-mic-status">
              {micMuted ? (
                <><Icon name="mic-off" size={14} /> Muted</>
              ) : micStatus === 'paused' ? (
                <><Icon name="speaker" size={14} /> AI is speaking…</>
              ) : micStatus === 'hearing' ? (
                <><Icon name="mic" size={14} /> Hearing you…</>
              ) : (
                <><Icon name="mic" size={14} /> Listening…</>
              )}
            </span>
            <div className="cc-volume-bar">
              <div
                className="cc-volume-fill"
                style={{ width: `${micMuted ? 0 : Math.min(100, volume * 320)}%` }}
              />
            </div>
          </div>

          <div className="cc-active-transcript">
            {turns.map((t, i) => (
              <div key={i} className={`cc-turn cc-turn-${t.role}`}>
                <div className="cc-turn-head">
                  <span className="cc-turn-role">
                    {t.role === 'ai' ? <><Icon name="bot" size={12} /> AI</> : <><Icon name="user" size={12} /> You</>}
                  </span>
                  <span className="cc-turn-lang">{t.language}</span>
                  {t.role === 'ai' && (
                    <button
                      className="cc-replay-btn"
                      onClick={() => replayTurn(i)}
                      title="Replay voice"
                    >
                      <Icon name="speaker" size={12} />
                    </button>
                  )}
                </div>
                <p className="cc-turn-text">{t.text}</p>
              </div>
            ))}

            {isThinking && (
              <div className="cc-thinking">
                <Icon name="loader" size={14} className="spin" /> AI is thinking…
              </div>
            )}
            {isSpeaking && (
              <div className="cc-speaking">
                <Icon name="speaker" size={14} /> AI is speaking…
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="cc-active-input-bar">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Or type your message…"
              rows={1}
              className="cc-active-input"
            />
            <button
              className="cc-active-send-btn"
              onClick={handleSendText}
              disabled={!inputText.trim() || isThinking}
            >
              <Icon name="send" size={16} />
            </button>
          </div>

          <div className="cc-active-controls">
            <button
              className={`cc-ctrl-btn ${micMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={micMuted ? 'Unmute' : 'Mute'}
            >
              <Icon name={micMuted ? 'mic-off' : 'mic'} size={20} />
              <span>{micMuted ? 'Muted' : 'Mic'}</span>
            </button>

            <button
              className={`cc-ctrl-btn ${isSpeaking ? 'active' : ''}`}
              onClick={stopSpeaking}
              disabled={!isSpeaking}
              title="Stop voice"
            >
              <Icon name="speaker-off" size={20} />
              <span>Stop</span>
            </button>

            <button className="cc-end-btn" onClick={endCall}>
              <Icon name="phone-off" size={22} />
              <span>End Call</span>
            </button>
          </div>
        </div>
      )}

      {callState === 'ended' && (
        <div className="cc-ended">
          <div className="cc-ended-icon">
            <Icon name="phone-off" size={56} strokeWidth={1.3} />
          </div>
          <h2>Call Ended</h2>
          <div className="cc-ended-stats">
            <div className="cc-ended-stat">
              <span className="cc-ended-value">{formatTime(elapsed)}</span>
              <span className="cc-ended-label">Duration</span>
            </div>
            <div className="cc-ended-stat">
              <span className="cc-ended-value">{turns.filter(t => t.role === 'user').length}</span>
              <span className="cc-ended-label">You spoke</span>
            </div>
            <div className="cc-ended-stat">
              <span className="cc-ended-value">{turns.filter(t => t.role === 'ai').length}</span>
              <span className="cc-ended-label">AI replied</span>
            </div>
          </div>
          <button className="cc-start-btn" onClick={newCall}>
            <Icon name="phone-call" size={22} />
            Start New Call
          </button>
        </div>
      )}

      {error && <p className="cc-error"><Icon name="alert" size={16} /> {error}</p>}
    </div>
  );
}