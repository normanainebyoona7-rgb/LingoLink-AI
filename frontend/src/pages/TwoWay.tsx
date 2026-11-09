import React, { useState } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import SearchableDropdown from '../components/SearchableDropdown';
import HoldToSpeak from '../components/HoldToSpeak';
import Icon from '../components/Icon';
import AudioVisualizer from '../components/AudioVisualizer';

interface Props {
  token: string;
}

interface Message {
  sender: 'A' | 'B';
  text: string;
  translated: string;
  language: string;
}

export default function TwoWay({ token }: Props) {
  const { darkMode } = useTheme();
  const [langA, setLangA] = useState('english');
  const [langB, setLangB] = useState('luganda');
  const [isRecordingA, setIsRecordingA] = useState(false);
  const [isRecordingB, setIsRecordingB] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTranscribed = async (text: string, sender: 'A' | 'B') => {
    if (sender === 'A') setIsRecordingA(false);
    if (sender === 'B') setIsRecordingB(false);
    
    if (!text.trim()) return;
    setIsProcessing(true);

    const sourceLang = sender === 'A' ? langA : langB;
    const targetLang = sender === 'A' ? langB : langA;

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

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          sender,
          text,
          translated: data.translated_text,
          language: sourceLang
        }]);
      }
    } catch (err) {
      console.error('Two-way translation failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const swapLanguages = () => {
    const temp = langA;
    setLangA(langB);
    setLangB(temp);
    setMessages([]);
  };

  return (
    <div className="twoway-root savanna-theme" style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginLeft: '8px' }}>Person A</span>
          <SearchableDropdown value={langA} onChange={setLangA} placeholder="Language A" />
        </div>
        
        <button className="swap-btn" onClick={swapLanguages} style={{ margin: '0 16px' }}>
          <Icon name="swap" size={18} />
        </button>

        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginLeft: '8px' }}>Person B</span>
          <SearchableDropdown value={langB} onChange={setLangB} placeholder="Language B" />
        </div>
      </div>

      <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
            Hold the mic for Person A or Person B to start a conversation.
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{
              alignSelf: msg.sender === 'A' ? 'flex-start' : 'flex-end',
              background: msg.sender === 'A' ? 'var(--bg-elevated)' : 'var(--gold-primary)',
              color: msg.sender === 'A' ? 'var(--text-main)' : '#ffffff',
              padding: '12px 16px',
              borderRadius: '16px',
              borderBottomLeftRadius: msg.sender === 'A' ? '4px' : '16px',
              borderBottomRightRadius: msg.sender === 'B' ? '4px' : '16px',
              maxWidth: '80%'
            }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.7 }}>{msg.text}</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>{msg.translated}</p>
            </div>
          ))
        )}
        {isProcessing && (
           <div style={{ alignSelf: 'center', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Icon name="loader" size={16} className="spin" /> Translating...
           </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Person A Mic */}
        <div 
          className="twoway-mic-section"
          style={{ 
            flex: 1, 
            background: 'var(--bg-surface)', 
            borderRadius: '12px', 
            border: '1px solid var(--border-color)', 
            margin: 0, 
            position: 'relative', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '120px' 
          }}
          onPointerDown={() => setIsRecordingA(true)}
          onPointerUp={() => setIsRecordingA(false)}
          onPointerLeave={() => setIsRecordingA(false)}
          onPointerCancel={() => setIsRecordingA(false)}
        >
          <AudioVisualizer isRecording={isRecordingA} />
          <div style={{
            opacity: isRecordingA ? 0 : 1,
            pointerEvents: isRecordingA ? 'none' : 'auto',
            transition: 'opacity 0.2s',
            position: 'relative',
            zIndex: 10
          }}>
             <HoldToSpeak token={token} language={langA} onTranscribed={(text) => handleTranscribed(text, 'A')} />
          </div>
        </div>

        {/* Person B Mic */}
        <div 
          className="twoway-mic-section"
          style={{ 
            flex: 1, 
            background: 'var(--bg-surface)', 
            borderRadius: '12px', 
            border: '1px solid var(--border-color)', 
            margin: 0, 
            position: 'relative', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '120px' 
          }}
          onPointerDown={() => setIsRecordingB(true)}
          onPointerUp={() => setIsRecordingB(false)}
          onPointerLeave={() => setIsRecordingB(false)}
          onPointerCancel={() => setIsRecordingB(false)}
        >
          <AudioVisualizer isRecording={isRecordingB} />
          <div style={{
            opacity: isRecordingB ? 0 : 1,
            pointerEvents: isRecordingB ? 'none' : 'auto',
            transition: 'opacity 0.2s',
            position: 'relative',
            zIndex: 10
          }}>
             <HoldToSpeak token={token} language={langB} onTranscribed={(text) => handleTranscribed(text, 'B')} />
          </div>
        </div>
      </div>
    </div>
  );
}