import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../App';
import { API_URL } from '../config';
import Icon from '../components/Icon';

type ConnState = 'connecting' | 'connected' | 'error' | 'closed';

interface ChatMsg {
  type: 'chat';
  role: 'agent' | 'caller';
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
  const [myLanguage, setMyLanguage] = useState('auto');
  const [otherLanguage, setOtherLanguage] = useState('auto');
  const [peerPresent, setPeerPresent] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ---- WebSocket setup ----
  useEffect(() => {
    if (!code) return;

    const wsUrl = API_URL.replace(/^http/, 'ws') + `/ws/call/${code.toUpperCase()}/caller`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConn('connected');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.type === 'joined') {
          setMessages(msg.messages || []);
          setPeerPresent(!!msg.other_present);
        } else if (msg.type === 'chat') {
          setMessages((prev) => [...prev, msg as ChatMsg]);
        } else if (msg.type === 'peer_joined') {
          setPeerPresent(true);
        } else if (msg.type === 'peer_left') {
          setPeerPresent(false);
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

    ws.onclose = () => {
      setConn('closed');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [code]);

  // ---- Auto-scroll ----
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // ---- Send ----
  const sendMessage = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!inputText.trim()) return;

    ws.send(JSON.stringify({
      type: 'chat',
      text: inputText.trim(),
      language: myLanguage,
    }));
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ---- Render ----
  return (
    <div className={`joincall-root ${darkMode ? 'joincall-dark' : 'joincall-light'}`}>
      <div className="joincall-header">
        <button className="joincall-back" onClick={() => navigate('/')}>
          <Icon name="arrow-right" size={18} />
        </button>
        <h2><Icon name="callcenter" size={22} /> Call Session {code}</h2>
        <span className={`joincall-status joincall-status-${conn}`}>
          {conn === 'connecting' && <><Icon name="loader" size={14} className="spin" /> Connecting…</>}
          {conn === 'connected' && peerPresent && <><Icon name="circle-filled" size={10} /> Connected</>}
          {conn === 'connected' && !peerPresent && <><Icon name="loader" size={14} className="spin" /> Waiting for agent…</>}
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
            <Icon name="message-circle" size={40} strokeWidth={1.4} />
            <p>No messages yet</p>
            <span>Type below to start the conversation</span>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`joincall-msg joincall-msg-${m.role}`}>
              <div className="joincall-msg-head">
                <span className="joincall-msg-role">
                  {m.role === 'agent' ? 'Agent' : 'You'}
                </span>
                <span className="joincall-msg-lang">{m.language}</span>
              </div>
              <p className="joincall-msg-text">{m.text}</p>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>

      <div className="joincall-input-bar">
        <select
          value={myLanguage}
          onChange={(e) => setMyLanguage(e.target.value)}
          className="joincall-lang-select"
        >
          <option value="auto">Auto</option>
          <option value="english">English</option>
          <option value="luganda">Luganda</option>
          <option value="swahili">Swahili</option>
          <option value="acholi">Acholi</option>
          <option value="ateso">Ateso</option>
          <option value="runyankole">Runyankole</option>
          <option value="french">French</option>
        </select>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={peerPresent ? 'Type your message…' : 'Waiting for agent to connect…'}
          disabled={conn !== 'connected'}
          rows={1}
          className="joincall-input"
        />
        <button
          className="joincall-send"
          onClick={sendMessage}
          disabled={conn !== 'connected' || !inputText.trim()}
        >
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  );
}