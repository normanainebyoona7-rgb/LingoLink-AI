import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import SearchableDropdown from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';
import Icon from '../components/Icon';
import AudioVisualizer from '../components/AudioVisualizer';

interface Props {
  token: string;
}

export default function LiveTranslation({ token }: Props) {
  const { darkMode } = useTheme();
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('english');
  const [isRecording, setIsRecording] = useState(false);
  
  const [subtitles, setSubtitles] = useState<{ original: string; translated: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new subtitles arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [subtitles]);

  const handleTranscribed = async (text: string) => {
    setIsRecording(false);
    if (!text.trim()) return;

    setIsProcessing(true);
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
        setSubtitles(prev => [...prev, {
          original: text,
          translated: data.translated_text
        }]);
      }
    } catch (err) {
      console.error('Live translation failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearSubtitles = () => {
    setSubtitles([]);
  };

  return (
    <div className="live-root savanna-theme" style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 0', fontSize: '24px' }}>
          <Icon name="live" size={24} /> Live Translation
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Push to speak, see live subtitles appear instantly.</p>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
        <SearchableDropdown
          value={sourceLanguage}
          onChange={setSourceLanguage}
          placeholder="source language"
          includeAutoDetect
        />
        <button className="swap-btn" onClick={() => {
          if (sourceLanguage !== 'auto') {
            const temp = sourceLanguage;
            setSourceLanguage(targetLanguage);
            setTargetLanguage(temp);
          }
        }}>
          <Icon name="swap" size={18} />
        </button>
        <SearchableDropdown
          value={targetLanguage}
          onChange={setTargetLanguage}
          placeholder="target language"
        />
      </div>

      <div 
        className="live-mic-section"
        onMouseDown={() => setIsRecording(true)}
        onMouseUp={() => setIsRecording(false)}
        onMouseLeave={() => setIsRecording(false)}
        onTouchStart={() => setIsRecording(true)}
        onTouchEnd={() => setIsRecording(false)}
      >
        <AudioVisualizer isRecording={isRecording} />
        <div style={{ opacity: isRecording ? 0 : 1, transition: 'opacity 0.2s' }}>
          <HoldToSpeak
            token={token}
            language={sourceLanguage}
            onTranscribed={handleTranscribed}
          />
        </div>
      </div>

      <div style={{ 
        background: 'var(--bg-surface)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '12px',
        height: '400px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, color: 'var(--gold-primary)' }}>Live Transcript</h3>
          <button 
            className="clear-btn" 
            onClick={clearSubtitles}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
          >
            <Icon name="trash" size={16} /> Clear
          </button>
        </div>
        
        <div 
          ref={scrollRef}
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {subtitles.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              Press and hold the mic to start translating...
            </p>
          ) : (
            subtitles.map((sub, idx) => (
              <div key={idx} style={{ 
                background: 'var(--bg-elevated)', 
                padding: '12px 16px', 
                borderRadius: '12px',
                borderLeft: '4px solid var(--gold-primary)'
              }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>{sub.original}</p>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-main)' }}>{sub.translated}</p>
              </div>
            ))
          )}
          {isProcessing && (
            <div style={{ textAlign: 'center', color: 'var(--gold-primary)' }}>
              <Icon name="loader" size={20} className="spin" /> Translating...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}