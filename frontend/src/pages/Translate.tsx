import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import SearchableDropdown, { LANGUAGES } from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';

interface Props {
  token: string;
}

type Gender = 'male' | 'female';

export default function Translate({ token }: Props) {
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('english');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceGender, setVoiceGender] = useState<Gender>('female');
  const [error, setError] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRequestRef = useRef<number>(0);

  const translate = async (text: string, sourceOverride?: string) => {
    if (!text.trim()) {
      setTranslatedText('');
      setIsTranslating(false);
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
        if (data.source_language && data.source_language !== 'auto') {
          setDetectedLanguage(data.source_language);
        }
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

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setTranslatedText('');
      setIsTranslating(false);
      setDetectedLanguage('');
      return;
    }
    debounceRef.current = setTimeout(() => {
      translate(text);
    }, 350);
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    translate(text, 'auto');
  };

  const speakTranslation = async () => {
    if (!translatedText) return;
    setIsSpeaking(true);
    try {
      const res = await fetch(`${API_URL}/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: translatedText,
          language: targetLanguage,
          gender: voiceGender,
          speed: 1.0,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = url;
          audioRef.current.onended = () => setIsSpeaking(false);
          audioRef.current.play();
        } else {
          audioRef.current = new Audio(url);
          audioRef.current.onended = () => setIsSpeaking(false);
          audioRef.current.play();
        }
      } else {
        setError('Audio generation failed.');
        setIsSpeaking(false);
      }
    } catch {
      setError('Audio playback error.');
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  };

  const swapLanguages = () => {
    if (sourceLanguage !== 'auto') {
      const temp = sourceLanguage;
      setSourceLanguage(targetLanguage);
      setTargetLanguage(temp);
      const textTemp = inputText;
      setInputText(translatedText);
      setTranslatedText(textTemp);
    }
  };

  const clearAll = () => {
    setTranslatedText('');
    setInputText('');
    setDetectedLanguage('');
    setError('');
    setIsTranslating(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    currentRequestRef.current++;
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return (
    <div className="translate-page">
      <div className="lang-row fade-in-up">
        <SearchableDropdown
          value={sourceLanguage}
          onChange={setSourceLanguage}
          placeholder="source language"
          includeAutoDetect
        />
        <button className="swap-btn" onClick={swapLanguages} title="Swap languages" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
        <SearchableDropdown
          value={targetLanguage}
          onChange={setTargetLanguage}
          placeholder="target language"
        />
      </div>

      {detectedLanguage && sourceLanguage === 'auto' && (
        <div className="detected-info fade-in-up">
          Detected: {LANGUAGES[detectedLanguage] || detectedLanguage}
        </div>
      )}

      <div className="text-panels">
        <div className="input-panel">
          <div className="panel-header">
            <span className="panel-label">INPUT</span>
            <span className="char-count">{inputText.length} chars</span>
          </div>
          <textarea
            placeholder="Type or paste text here... (Ctrl+Enter to translate)"
            value={inputText}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          <div className="input-actions">
            <button
              type="button"
              className="send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || isTranslating}
            >
              {isTranslating ? (
                <>
                  <span className="btn-spinner"></span>
                  Translating...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Translate
                </>
              )}
            </button>
            {inputText && (
              <button type="button" className="clear-btn" onClick={clearAll} title="Clear">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="output-panel fade-in-up">
          <div className="panel-header output-header">
            <span className="panel-label">TRANSLATION</span>
            {isTranslating && <span className="live-indicator">translating</span>}
            {translatedText && !isTranslating && (
              <div className="header-actions">
                <div className="gender-toggle">
                  <button
                    type="button"
                    className={`gender-btn ${voiceGender === 'female' ? 'active' : ''}`}
                    onClick={() => setVoiceGender('female')}
                    title="Female voice"
                  >
                    👩
                  </button>
                  <button
                    type="button"
                    className={`gender-btn ${voiceGender === 'male' ? 'active' : ''}`}
                    onClick={() => setVoiceGender('male')}
                    title="Male voice"
                  >
                    👨
                  </button>
                </div>
                <button
                  type="button"
                  onClick={isSpeaking ? stopSpeaking : speakTranslation}
                  className={`speak-btn ${isSpeaking ? 'speaking' : ''}`}
                  title={isSpeaking ? 'Stop' : 'Speak'}
                >
                  {isSpeaking ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(translatedText)}
                  title="Copy"
                  className="icon-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div className="output-content">
            {isTranslating && !translatedText ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p className="loading-text">Translating...</p>
              </div>
            ) : translatedText ? (
              <span>{translatedText}</span>
            ) : (
              <span className="placeholder-text">Translation appears here...</span>
            )}
          </div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="mic-section">
        <HoldToSpeak
          token={token}
          onTranscribed={handleVoiceTranscribed}
        />
      </div>
    </div>
  );
}