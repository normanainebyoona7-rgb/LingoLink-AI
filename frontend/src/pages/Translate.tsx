import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import SearchableDropdown, { LANGUAGES } from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';

interface Props {
  token: string;
}

export default function Translate({ token }: Props) {
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('english');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState('');
  const liveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const fullDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRequestRef = useRef<number>(0);

  const detectLanguage = async (text: string) => {
    if (!text.trim()) return;
    try {
      const res = await fetch(`${API_URL}/translate/detect?text=${encodeURIComponent(text)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetectedLanguage(data.detected_language);
      }
    } catch {}
  };

  const translate = async (text: string, sourceOverride?: string) => {
    if (!text.trim()) {
      setTranslatedText('');
      setLiveText('');
      return;
    }
    const requestId = ++currentRequestRef.current;
    setIsTranslating(true);
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
          source_language: sourceOverride || sourceLanguage,
          target_language: targetLanguage,
        }),
      });
      if (requestId !== currentRequestRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setTranslatedText(data.translated_text);
        setLiveText('');
      } else {
        setError('Translation failed. Check backend.');
      }
    } catch {
      setError('Connection error. Is backend running?');
    } finally {
      if (requestId === currentRequestRef.current) {
        setIsTranslating(false);
      }
    }
  };

  const liveTranslate = async (text: string) => {
    if (!text.trim()) {
      setLiveText('');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/translate/quick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          source_language: sourceLanguage,
          target_language: targetLanguage,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiveText(data.translated_text);
      }
    } catch {}
  };

  const handleTextChange = (text: string) => {
    setInputText(text);

    if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);
    liveDebounceRef.current = setTimeout(() => {
      liveTranslate(text);
    }, 250);

    if (fullDebounceRef.current) clearTimeout(fullDebounceRef.current);
    fullDebounceRef.current = setTimeout(() => {
      if (sourceLanguage === 'auto') detectLanguage(text);
      translate(text);
    }, 800);
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    if (sourceLanguage === 'auto') detectLanguage(inputText);
    translate(inputText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscribed = (text: string) => {
    setInputText(text);
    // Force translation with 'auto' source so backend detects language
    translate(text, 'auto');
    if (sourceLanguage === 'auto') detectLanguage(text);
  };

  const speakTranslation = async () => {
    if (!translatedText) return;
    setIsSpeaking(true);
    try {
      const res = await fetch(`${API_URL}/tts/speak?text=${encodeURIComponent(translatedText)}&language=${targetLanguage}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = url;
          audioRef.current.play();
        } else {
          audioRef.current = new Audio(url);
          audioRef.current.play();
        }
      } else {
        setError('Audio generation failed.');
      }
    } catch {
      setError('Audio playback error.');
    }
    setIsSpeaking(false);
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  };

  const swapLanguages = () => {
    if (sourceLanguage !== 'auto') {
      const temp = sourceLanguage;
      setSourceLanguage(targetLanguage);
      setTargetLanguage(temp);
      const textTemp = inputText;
      setInputText(translatedText);
      setTranslatedText(textTemp);
      setLiveText('');
    }
  };

  const clearAll = () => {
    setTranslatedText('');
    setInputText('');
    setLiveText('');
    setDetectedLanguage('');
    setError('');
  };

  useEffect(() => {
    return () => {
      if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);
      if (fullDebounceRef.current) clearTimeout(fullDebounceRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const displayText = isTranslating && liveText ? liveText : translatedText;

  return (
    <div className="translate-page">
      <div className="lang-row fade-in-up">
        <SearchableDropdown
          value={sourceLanguage}
          onChange={setSourceLanguage}
          placeholder="Source language"
          includeAutoDetect
        />
        <button className="swap-btn" onClick={swapLanguages} title="Swap languages">⇄</button>
        <SearchableDropdown
          value={targetLanguage}
          onChange={setTargetLanguage}
          placeholder="Target language"
        />
      </div>

      {detectedLanguage && sourceLanguage === 'auto' && (
        <div className="detected-info fade-in-up">
          🔍 Detected: {LANGUAGES[detectedLanguage] || detectedLanguage}
        </div>
      )}

      <div className="text-panels">
        <div className="input-panel">
          <div className="panel-header">
            <span className="panel-label">INPUT</span>
            <span className="char-count">{inputText.length}</span>
          </div>
          <textarea
            placeholder="Type or paste text here... (translates as you type)"
            value={inputText}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="input-actions">
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || isTranslating}
            >
              {isTranslating ? '⏳ Translating...' : '➤ Send'}
            </button>
            {inputText && (
              <button className="clear-btn" onClick={clearAll}>🗑️ Clear</button>
            )}
          </div>
        </div>

        <div className="output-panel fade-in-up">
          <div className="panel-header">
            <span className="panel-label">TRANSLATION</span>
            {isTranslating && liveText && (
              <span className="live-indicator">⚡ live</span>
            )}
          </div>
          <div className="output-content">
            {isTranslating && !liveText ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p className="loading-text">Translating...</p>
              </div>
            ) : displayText ? (
              <span>{displayText}</span>
            ) : (
              <span className="placeholder-text">Translation appears here...</span>
            )}
          </div>
          {translatedText && !isTranslating && (
            <div className="output-actions">
              <button onClick={speakTranslation} disabled={isSpeaking} title="Speak">
                {isSpeaking ? '🔊...' : '🔊'}
              </button>
              {isSpeaking && (
                <button onClick={stopSpeaking} title="Stop">⏹️</button>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(translatedText)}
                title="Copy"
              >
                📋
              </button>
              <button onClick={clearAll} title="Clear">🗑️</button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="error-text">❌ {error}</p>}

      <div className="mic-section">
        <HoldToSpeak
          token={token}
          onTranscribed={handleVoiceTranscribed}
        />
      </div>
    </div>
  );
}