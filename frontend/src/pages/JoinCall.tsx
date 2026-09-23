import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../App';
import { API_URL } from '../config';
import Icon from '../components/Icon';
import HoldToSpeak from '../components/HoldToSpeak';

type ConnState = 'connecting' | 'connected' | 'error' | 'closed';

interface ChatMsg {
  type: 'chat';
  role: 'agent' | 'caller' | 'ai';
  text: string;
  language: string;
  ts: number;
}

export default function JoinCall() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { darkMode } = useTheme();

  const [conn, setConn] = useState<ConnState>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [callerLanguage, setCallerLanguage] = useState('auto');

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!code) return;

    const wsUrl = API_URL.replace(/^http/, 'ws') + `/ws/call/${code.toUpperCase()}/caller`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConn('connected');

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.type === 'joined') {
          setMessages(msg.messages || []);
          if (msg.caller_language) setCallerLanguage(msg.caller_language);
        } else if (msg.type === 'chat') {
          setMessages((prev) => [...prev, msg as ChatMsg]);
        } else if (msg.type === 'ai_thinking') {
          setAiThinking(!!msg.value);
        } else if (msg.type === 'ai_audio') {
          playAudio(msg.audio, msg.format || 'mp3');
        } else if (msg.type === 'error') {
          setConn('error');
          setErrorMsg(msg.message || 'Connection error');
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onerror = () => {
      setConn('error');
      setErrorMsg('Could not connect. Session may be full or expired.');
    };

    ws.onclose = () => setConn('closed');

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [code]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const playAudio = (base64: string, format: string) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.onplay = () => setAiSpeaking(true);
      audioRef.current.onended = () => setAiSpeaking(false);
      audioRef.current.onerror = () => setAiSpeaking(false);
      audioRef.current.play().catch((e) => {
        console.warn('Audio play failed:', e);
        setAiSpeaking(false);
      });
    } catch (e) {
      console.error('Audio decode error:', e);
    }
  };

  const sendMessage = (text?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = (text ?? inputText).trim();
    if (!payload) return;
    ws.send(JSON.stringify({
      type: 'chat',
      text: payload,
      language: callerLanguage === 'auto' ? 'auto' : callerLanguage,
    }));
    if (text === undefined) setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTranscribed = (text: string) => {
    if (text && text.trim()) {
      sendMessage(text.trim());
    }
  };

  return (
    <div className={`joincall-root ${darkMode ? 'joincall-dark' : 'joincall-light'}`}>
      <div className="joincall-header">
        <button className="joincall-back" onClick={() => navigate('/')}>
          <Icon name="arrow-right" size={18} />
        </button>
        <h2><Icon name="bot" size={22} /> LingoLink AI</h2>
        <span className={`joincall-status joincall-status-${conn}`}>
          {conn === 'connecting' && <><Icon name="loader" size={14} className="spin" /> Connecting…</>}
          {conn === 'connected' && <><Icon name="circle-filled" size={10} /> Live</>}
          {conn === 'error' && <><Icon name="alert" size={14} /> Error</>}
          {conn === 'closed' && <><Icon name="phone-off" size={14} /> Disconnected</>}
        </span>
      </div>

      {errorMsg && (
        <p className="joincall-error"><Icon name="alert" size={16} /> {errorMsg}</p>
      )}

      <div className="joincall-transcript">
        {messages.length === 0 ? (
          <div className="joincall-empty">
            <Icon name="bot" size={48} strokeWidth={1.4} />
            <p>Say hello to begin</p>
            <span>Hold the mic button below and speak</span>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`joincall-msg joincall-msg-${m.role}`}>
              <div className="joincall-msg-head">
                <span className="joincall-msg-role">
                  {m.role === 'ai' ? <><Icon name="bot" size={12} /> AI</> : m.role === 'agent' ? 'Agent' : 'You'}
                </span>
                <span className="joincall-msg-lang">{m.language}</span>
              </div>
              <p className="joincall-msg-text">{m.text}</p>
            </div>
          ))
        )}
        {aiThinking && (
          <div className="joincall-thinking">
            <Icon name="loader" size={14} className="spin" /> AI is thinking…
          </div>
        )}
        {aiSpeaking && (
          <div className="joincall-thinking">
            <Icon name="speaker" size={14} /> AI is speaking…
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="joincall-mic-section">
        <HoldToSpeak
          token=""
          language={callerLanguage === 'auto' ? 'auto' : callerLanguage}
          onTranscribed={handleTranscribed}
        />
      </div>

      <div className="joincall-input-bar">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Or type your message…"
          disabled={conn !== 'connected'}
          rows={1}
          className="joincall-input"
        />
        <button
          className="joincall-send"
          onClick={() => sendMessage()}
          disabled={conn !== 'connected' || !inputText.trim()}
        >
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  );
}