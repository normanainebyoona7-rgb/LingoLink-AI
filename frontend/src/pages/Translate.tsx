import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import SearchableDropdown, { LANGUAGES } from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';
import Icon from '../components/Icon';
import { useOfflineTranslation } from '../offline/useOfflineTranslation';
import AudioVisualizer from '../components/AudioVisualizer';

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
  const [isRecording, setIsRecording] = useState(false);
  const [voiceGender, setVoiceGender] = useState<Gender>('female');
  const [error, setError] = useState('');
  const [offlineAudioBlob, setOfflineAudioBlob] = useState<Blob | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRequestRef = useRef<number>(0);
  const fromVoiceRef = useRef<boolean>(false);

  // ---- Offline mode ----
  const {
    isReady: offlineReady,
    progress: offlineProgress,
    downloading: offlineDownloading,
    error: offlineError,
    usageMB: offlineUsageMB,
    audioCounts: offlineAudioCounts,
    browserOffline,
    download: downloadOffline,
    translate: offlineTranslateFn,
  } = useOfflineTranslation();

  // Show banner if offline pack isn't installed and user hasn't dismissed recently
  useEffect(() => {
    if (!offlineReady) {
      const dismissed = localStorage.getItem('offline-banner-dismissed');
      const dismissedAt = dismissed ? parseInt(dismissed, 10) : 0;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (!dismissedAt || Date.now() - dismissedAt > sevenDays) {
        setShowBanner(true);
      }
    } else {
      setShowBanner(false);
    }
  }, [offlineReady]);

  const dismissBanner = () => {
    localStorage.setItem('offline-banner-dismissed', Date.now().toString());
    setShowBanner(false);
  };

  const totalAudioFiles = Object.values(offlineAudioCounts).reduce((a, b) => a + b, 0);

  // ---- Translation ----
  const translate = async (text: string, sourceOverride?: string, speakAfter = false) => {
    if (!text.trim()) {
      setTranslatedText('');
      setIsTranslating(false);
      return;
    }
    const requestId = ++currentRequestRef.current;
    setIsTranslating(true);
    setError('');
    setOfflineAudioBlob(null);

    const src = sourceOverride || sourceLanguage;

    // 1. Try offline first
    try {
      const offlineResult = await offlineTranslateFn(text, src, targetLanguage);
      if (requestId !== currentRequestRef.current) return;

      if (offlineResult && offlineResult.text) {
        const looksLikeNoop =
          !offlineResult.passthrough &&
          offlineResult.text.trim().toLowerCase() === text.trim().toLowerCase() &&
          src !== targetLanguage;

        if (!looksLikeNoop) {
          setTranslatedText(offlineResult.text);
          setOfflineAudioBlob(offlineResult.audio);
          if (offlineResult.passthrough) {
            setDetectedLanguage(targetLanguage);
          }
          if (speakAfter) {
            if (offlineResult.audio) {
              playAudioBlob(offlineResult.audio);
            } else {
              speakText(offlineResult.text);
            }
          }
          setIsTranslating(false);
          return;
        }
      }
    } catch (e) {
      // offline failure is non-fatal — fall through to online
    }

    // 2. Fall back to online API
    try {
      const res = await fetch(`${API_URL}/translate/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          source_language: src,
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
        if (speakAfter && data.translated_text) {
          speakText(data.translated_text);
        }
      } else {
        setError('Translation failed. Check backend.');
      }
    } catch {
      setError(
        offlineReady
          ? 'Offline translation unavailable for this phrase. Connect to the internet or try a shorter phrase.'
          : 'Connection error. Is backend running?',
      );
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
    setIsRecording(false);
    setInputText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    fromVoiceRef.current = true;
    translate(text, sourceLanguage === 'auto' ? 'auto' : sourceLanguage, true);
  };

  // ---- Audio playback ----
  const playAudioBlob = (blob: Blob) => {
    try {
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.onended = () => setIsSpeaking(false);
      audioRef.current.play();
      setIsSpeaking(true);
    } catch (err) {
      console.error('Offline audio failed:', err);
    }
  };

  const speakText = async (text: string) => {
    if (!text) return;
    try {
      const res = await fetch(`${API_URL}/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          language: targetLanguage,
          gender: voiceGender,
          speed: 1.0,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        playAudioBlob(blob);
      }
    } catch (err) {
      console.error('TTS failed:', err);
    }
  };

  const speakTranslation = async () => {
    if (!translatedText) return;
    setIsSpeaking(true);
    if (offlineAudioBlob) {
      playAudioBlob(offlineAudioBlob);
    } else {
      speakText(translatedText);
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
    setOfflineAudioBlob(null);
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
    <div className="translate-page savanna-theme">
      {/* Offline mode banner */}
      {showBanner && !offlineReady && (
        <div className="offline-banner fade-in-up">
          <div className="offline-banner-text">
            <strong>Work offline</strong>
            <span className="offline-banner-sub">
              Download English ↔ Luganda & Swahili (~4 MB). Translate without internet.
            </span>
            {offlineError && <span className="offline-banner-error">{offlineError}</span>}
          </div>
          <div className="offline-banner-actions">
            {offlineDownloading ? (
              <>
                <span className="offline-banner-progress">
                  {offlineProgress?.message || 'Downloading…'}
                  {offlineProgress && offlineProgress.bytesTotal > 0 && (
                    <> ({Math.round((offlineProgress.bytesLoaded / offlineProgress.bytesTotal) * 100)}%)</>
                  )}
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="offline-banner-primary"
                  onClick={() => downloadOffline()}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="offline-banner-dismiss"
                  onClick={dismissBanner}
                  title="Dismiss for 7 days"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Professional Unified Status Pill */}
      <div className="system-status-pill fade-in-up">
        <div className={`status-item ${browserOffline ? 'status-offline' : 'status-online'}`}>
          <span className="status-dot" />
          <span>{browserOffline ? 'Offline' : 'Online'}</span>
        </div>

        {offlineReady ? (
          <div className="status-item status-ready" title={`Luganda: ${offlineAudioCounts['luganda'] || 0} | Swahili: ${offlineAudioCounts['swahili'] || 0} audio files`}>
            <Icon name="check" size={12} strokeWidth={3} />
            <span>Offline {offlineUsageMB.toFixed(1)} MB</span>
            {totalAudioFiles > 0 && (
              <span className="status-subtext">· {totalAudioFiles} Audio</span>
            )}
          </div>
        ) : (
          <div className="status-item status-no-pack">
            <span>No offline pack</span>
          </div>
        )}
      </div>

      <div className="lang-row fade-in-up">
        <SearchableDropdown
          value={sourceLanguage}
          onChange={setSourceLanguage}
          placeholder="source language"
          includeAutoDetect
        />
        <button className="swap-btn" onClick={swapLanguages} title="Swap languages" type="button">
          <Icon name="swap" size={18} strokeWidth={2.2} />
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
            placeholder="Type, paste, or use the mic below... (Ctrl+Enter to translate)"
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
                  <Icon name="loader" size={16} className="spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Icon name="send" size={16} strokeWidth={2.2} />
                  Translate
                </>
              )}
            </button>
            {inputText && (
              <button type="button" className="clear-btn" onClick={clearAll} title="Clear">
                <Icon name="trash" size={16} />
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
                    <Icon name="user-female" size={16} />
                  </button>
                  <button
                    type="button"
                    className={`gender-btn ${voiceGender === 'male' ? 'active' : ''}`}
                    onClick={() => setVoiceGender('male')}
                    title="Male voice"
                  >
                    <Icon name="user-male" size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={isSpeaking ? stopSpeaking : speakTranslation}
                  className={`speak-btn ${isSpeaking ? 'speaking' : ''}`}
                  title={isSpeaking ? 'Stop' : 'Speak'}
                >
                  <Icon name={isSpeaking ? 'speaker-off' : 'speaker'} size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(translatedText)}
                  title="Copy"
                  className="icon-btn"
                >
                  <Icon name="copy" size={14} />
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

      {/* Mic Section with Pointer Events for Mobile */}
      <div 
        className="mic-section"
        style={{ 
          position: 'relative', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          marginTop: '20px',
          minHeight: '100px' 
        }}
        onPointerDown={() => setIsRecording(true)}
        onPointerUp={() => setIsRecording(false)}
        onPointerLeave={() => setIsRecording(false)}
        onPointerCancel={() => setIsRecording(false)}
      >
        {isRecording ? (
          // When recording, ONLY show the visualizer (button is completely unmounted)
          <AudioVisualizer isRecording={true} />
        ) : (
          // When not recording, show the button
          <HoldToSpeak
            token={token}
            language={sourceLanguage}
            onTranscribed={handleVoiceTranscribed}
          />
        )}
      </div>
    </div>
  );
}