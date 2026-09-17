import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import SearchableDropdown from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';

interface Props {
  token: string;
}

type Gender = 'male' | 'female';

interface Turn {
  speaker: 'A' | 'B';
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
}

const STORAGE_KEY = 'lingolink_twoway_conversation';
const STORAGE_SETTINGS = 'lingolink_twoway_settings';

export default function TwoWay({ token }: Props) {
  const { darkMode } = useTheme();

  // ---- Settings ----
  const [langA, setLangA] = useState('english');
  const [langB, setLangB] = useState('luganda');
  const [gender, setGender] = useState<Gender>('female');
  const [autoSpeak, setAutoSpeak] = useState(true);

  // ---- State ----
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<'A' | 'B'>('A');
  const [busySpeaker, setBusySpeaker] = useState<'A' | 'B' | null>(null);
  const [error, setError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // ---- Load from localStorage ----
  useEffect(() => {
    try {
      const savedTurns = localStorage.getItem(STORAGE_KEY);
      if (savedTurns) setTurns(JSON.parse(savedTurns));

      const savedSettings = localStorage.getItem(STORAGE_SETTINGS);
      if (savedSettings) {
        const s = JSON.parse(savedSettings);
        if (s.langA) setLangA(s.langA);
        if (s.langB) setLangB(s.langB);
        if (s.gender) setGender(s.gender);
        if (typeof s.autoSpeak === 'boolean') setAutoSpeak(s.autoSpeak);
      }
    } catch {}
  }, []);

  // ---- Save to localStorage ----
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
    } catch {}
  }, [turns]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_SETTINGS,
        JSON.stringify({ langA, langB, gender, autoSpeak })
      );
    } catch {}
  }, [langA, langB, gender, autoSpeak]);

  // ---- Auto-scroll transcript ----
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  // ---- Handle speech from a speaker ----
  const handleTranscribed = async (speaker: 'A' | 'B', text: string) => {
    if (!text.trim()) return;

    const sourceLang = speaker === 'A' ? langA : langB;
    const targetLang = speaker === 'A' ? langB : langA;

    setBusySpeaker(speaker);
    setError('');

    try {
      const res = await fetch(`${API_URL}/translate/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          source_language: sourceLang,
          target_language: targetLang,
        }),
      });

      if (!res.ok) {
        setError('Translation failed. Check backend.');
        setBusySpeaker(null);
        return;
      }

      const data = await res.json();
      const translatedText = data.translated_text || '';

      const turn: Turn = {
        speaker,
        original: text,
        translated: translatedText,
        sourceLang,
        targetLang,
        timestamp: Date.now(),
      };

      setTurns((prev) => [...prev, turn]);

      // Auto-speak the translation
      if (autoSpeak && translatedText) {
        speak(translatedText, targetLang);
      }

      // Move focus to the other speaker
      setActiveSpeaker(speaker === 'A' ? 'B' : 'A');
    } catch (err) {
      console.error('Translation failed:', err);
      setError('Connection error. Is backend running?');
    } finally {
      setBusySpeaker(null);
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
        body: JSON.stringify({
          text,
          language,
          gender,
          speed: 1.0,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.pause();
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch (err) {
      console.error('TTS failed:', err);
    }
  };

  const swapLanguages = () => {
    setLangA(langB);
    setLangB(langA);
  };

  const clearConversation = () => {
    if (!window.confirm('Clear entire conversation?')) return;
    setTurns([]);
    setActiveSpeaker('A');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  return (
    <div className={`twoway-root ${darkMode ? 'twoway-dark' : 'twoway-light'}`}>

      {/* Header */}
      <div className="twoway-header">
        <h2>💬 Two-Way Conversation</h2>
        <p>Two people, two languages — one phone</p>
      </div>

      {/* Shared settings */}
      <div className="twoway-settings">
        <div className="twoway-setting-group">
          <span className="twoway-setting-label">Voice</span>
          <div className="twoway-gender-toggle">
            <button
              type="button"
              className={`twoway-gender-btn ${gender === 'female' ? 'active' : ''}`}
              onClick={() => setGender('female')}
              title="Female voice"
            >
              👩 Female
            </button>
            <button
              type="button"
              className={`twoway-gender-btn ${gender === 'male' ? 'active' : ''}`}
              onClick={() => setGender('male')}
              title="Male voice"
            >
              👨 Male
            </button>
          </div>
        </div>
        <div className="twoway-setting-group">
          <span className="twoway-setting-label">Auto-Speak</span>
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

      {/* Speaker A */}
      <div className={`twoway-speaker ${activeSpeaker === 'A' ? 'twoway-active' : ''}`}>
        <div className="twoway-speaker-header">
          <div className="twoway-speaker-info">
            <span className="twoway-avatar">👤</span>
            <span className="twoway-speaker-name">Speaker A</span>
          </div>
          <SearchableDropdown
            value={langA}
            onChange={setLangA}
            placeholder="language"
          />
        </div>
        <div className="twoway-mic">
          <HoldToSpeak
            token={token}
            language={langA}
            onTranscribed={(text) => handleTranscribed('A', text)}
          />
        </div>
        {busySpeaker === 'A' && <p className="twoway-status">Translating…</p>}
      </div>

      {/* Swap */}
      <div className="twoway-swap-row">
        <button className="twoway-swap-btn" onClick={swapLanguages} title="Swap languages">
          ⇅
        </button>
      </div>

      {/* Speaker B */}
      <div className={`twoway-speaker ${activeSpeaker === 'B' ? 'twoway-active' : ''}`}>
        <div className="twoway-speaker-header">
          <div className="twoway-speaker-info">
            <span className="twoway-avatar">👤</span>
            <span className="twoway-speaker-name">Speaker B</span>
          </div>
          <SearchableDropdown
            value={langB}
            onChange={setLangB}
            placeholder="language"
          />
        </div>
        <div className="twoway-mic">
          <HoldToSpeak
            token={token}
            language={langB}
            onTranscribed={(text) => handleTranscribed('B', text)}
          />
        </div>
        {busySpeaker === 'B' && <p className="twoway-status">Translating…</p>}
      </div>

      {error && <p className="twoway-error">❌ {error}</p>}

      {/* Transcript */}
      <div className="twoway-transcript">
        <div className="twoway-transcript-header">
          <h3>💬 Conversation</h3>
          {turns.length > 0 && (
            <button className="twoway-clear-btn" onClick={clearConversation}>
              🗑️ Clear
            </button>
          )}
        </div>

        {turns.length === 0 ? (
          <div className="twoway-empty">
            <span className="twoway-empty-icon">💬</span>
            <p>No conversation yet</p>
            <span>Hold a mic above to start</span>
          </div>
        ) : (
          <div className="twoway-transcript-list">
            {turns.map((turn, index) => (
              <div
                key={index}
                className={`twoway-turn twoway-turn-${turn.speaker.toLowerCase()}`}
              >
                <div className="twoway-turn-header">
                  <span className={`twoway-turn-speaker twoway-turn-speaker-${turn.speaker.toLowerCase()}`}>
                    {turn.speaker === 'A' ? 'Speaker A' : 'Speaker B'}
                  </span>
                  <span className="twoway-turn-lang">
                    {turn.sourceLang} → {turn.targetLang}
                  </span>
                </div>
                <p className="twoway-turn-original">{turn.original}</p>
                <p className="twoway-turn-translated">{turn.translated}</p>
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