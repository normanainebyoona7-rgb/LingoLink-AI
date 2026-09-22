import React, { useState, useRef } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import SearchableDropdown from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';
import VoiceSettings from '../components/VoiceSettings';
import Icon from '../components/Icon';

interface Props {
  token: string;
}

type Gender = 'male' | 'female';

export default function Voice({ token }: Props) {
  const { darkMode } = useTheme();
  const [sourceLanguage, setSourceLanguage] = useState('english');
  const [targetLanguage, setTargetLanguage] = useState('luganda');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversation, setConversation] = useState<{ speaker: string; text: string; translated: string; language: string }[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceGender, setVoiceGender] = useState<Gender>('female');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTranscribed = async (text: string) => {
    setSourceText(text);
    await translateVoice(text);
  };

  const translateVoice = async (text: string) => {
    if (!text.trim()) return;
    setIsTranslating(true);
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

        setConversation(prev => [...prev, {
          speaker: 'You',
          text,
          translated: data.translated_text,
          language: sourceLanguage,
        }]);

        if (autoSpeak && voiceEnabled) {
          speakTranslation(data.translated_text);
        }
      } else {
        console.error('Translation failed:', res.status);
      }
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  const speakTranslation = async (text: string) => {
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
          speed: voiceSpeed,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = url;
        audioRef.current.onended = () => setIsSpeaking(false);
        audioRef.current.play();
        setIsSpeaking(true);
      }
    } catch (err) {
      console.error('TTS failed:', err);
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
    const temp = sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(temp);
  };

  const clearConversation = () => {
    setConversation([]);
    setSourceText('');
    setTranslatedText('');
  };

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      className={`slider-toggle ${checked ? 'on' : 'off'}`}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
    >
      <span className="slider-knob"></span>
    </button>
  );

  return (
    <div className={`voice-root ${darkMode ? 'voice-dark' : 'voice-light'}`}>
      <div className="voice-header">
        <h2><Icon name="voice" size={22} /> Voice Translation</h2>
        <p>Speak in one language, hear translation in another</p>
      </div>

      <div className="voice-lang-row">
        <SearchableDropdown
          value={sourceLanguage}
          onChange={setSourceLanguage}
          placeholder="source language"
        />
        <button className="voice-swap-btn" onClick={swapLanguages}>
          <Icon name="swap" size={18} />
        </button>
        <SearchableDropdown
          value={targetLanguage}
          onChange={setTargetLanguage}
          placeholder="target language"
        />
      </div>

      <VoiceSettings
        language={targetLanguage}
        onVoiceChange={setVoiceGender}
        onSpeedChange={setVoiceSpeed}
      />

      <div className="voice-mic-section">
        <HoldToSpeak
          token={token}
          language={sourceLanguage}
          onTranscribed={handleTranscribed}
        />
      </div>

      <div className="voice-current">
        <div className="voice-source-box">
          <span className="voice-box-label">YOU SAID:</span>
          <p className="voice-box-text">{sourceText || 'Speak to see text here...'}</p>
        </div>
        <div className="voice-arrow"><Icon name="arrow-down" size={20} /></div>
        <div className="voice-target-box">
          <span className="voice-box-label">TRANSLATION:</span>
          <p className="voice-box-text">
            {isTranslating ? (
              <><Icon name="loader" size={16} className="spin" /> Translating...</>
            ) : (
              translatedText || 'Translation appears here...'
            )}
          </p>
          {translatedText && !isTranslating && (
            <button
              className="voice-speak-btn"
              onClick={isSpeaking ? stopSpeaking : () => speakTranslation(translatedText)}
            >
              <Icon name={isSpeaking ? 'speaker-off' : 'speaker'} size={16} />
              {isSpeaking ? ' Playing...' : ' Hear Translation'}
            </button>
          )}
        </div>
      </div>

      <div className="voice-settings">
        <div className="voice-setting-row">
          <div>
            <span className="voice-setting-label"><Icon name="volume" size={16} /> Voice Output</span>
            <p className="voice-setting-desc">Hear translations spoken aloud</p>
          </div>
          <ToggleSwitch checked={voiceEnabled} onChange={() => setVoiceEnabled(!voiceEnabled)} />
        </div>
        <div className="voice-setting-row">
          <div>
            <span className="voice-setting-label"><Icon name="mic" size={16} /> Auto-Speak Translation</span>
            <p className="voice-setting-desc">Automatically speak after translation</p>
          </div>
          <ToggleSwitch checked={autoSpeak} onChange={() => setAutoSpeak(!autoSpeak)} />
        </div>
      </div>

      {conversation.length > 0 && (
        <div className="voice-conversation">
          <div className="voice-conversation-header">
            <h3><Icon name="message-circle" size={18} /> Conversation</h3>
            <button className="voice-clear-btn" onClick={clearConversation}>
              <Icon name="trash" size={16} /> Clear
            </button>
          </div>
          <div className="voice-conversation-list">
            {conversation.map((item, index) => (
              <div key={index} className="voice-conversation-item">
                <div className="voice-convo-header">
                  <span className="voice-convo-speaker">{item.speaker}</span>
                  <span className="voice-convo-lang">{item.language}</span>
                </div>
                <p className="voice-convo-original">{item.text}</p>
                <p className="voice-convo-translated">{item.translated}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}