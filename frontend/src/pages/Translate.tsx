import React, { useState, useRef } from 'react';
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
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const translate = async (text: string) => {
    if (!text.trim()) return;
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
          source_language: sourceLanguage,
          target_language: targetLanguage,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslatedText(data.translated_text);
      } else {
        setError('Translation failed. Check backend.');
      }
    } catch {
      setError('Connection error. Is backend running?');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (sourceLanguage === 'auto') detectLanguage(text);
      translate(text);
    }, 700);
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
      }
    } catch {}
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

  return (
    <div className="translate-page">
      <div className="lang-row fade-in-up">
        <SearchableDropdown
          value={sourceLanguage}
          onChange={setSourceLanguage}
          placeholder="source language"
          includeAutoDetect
        />
        <button className="swap-btn" onClick={swapLanguages} title="Swap languages">⇄</button>
        <SearchableDropdown
          value={targetLanguage}
          onChange={setTargetLanguage}
          placeholder="target language"
        />
      </div>

      {detectedLanguage && sourceLanguage === 'auto' && (
        <div className="detected-info fade-in-up">
          🔍 Detected: {LANGUAGES[detectedLanguage] || detectedLanguage}
        </div>
      )}

      <div className="text-panels">
        <textarea
          placeholder="Type or paste text here... (auto-translates)"
          value={inputText}
          onChange={(e) => handleTextChange(e.target.value)}
        />
        <div className="output-panel fade-in-up">
          {isTranslating ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">Translating...</p>
            </div>
          ) : translatedText ? (
            translatedText
          ) : (
            'Translation appears here...'
          )}
          {translatedText && !isTranslating && (
            <div className="output-actions">
              <button onClick={speakTranslation} disabled={isSpeaking}>
                {isSpeaking ? '🔊...' : '🔊'}
              </button>
              <button onClick={() => navigator.clipboard.writeText(translatedText)}>📋</button>
              <button onClick={() => { setTranslatedText(''); setInputText(''); }}>🗑️</button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="mic-section">
        <HoldToSpeak token={token} onTranscribed={(text) => { setInputText(text); translate(text); }} />
      </div>
    </div>
  );
}