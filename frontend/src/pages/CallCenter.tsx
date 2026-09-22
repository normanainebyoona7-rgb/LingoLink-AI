import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import Icon from '../components/Icon';

interface Props {
  token: string;
}

type CallState = 'idle' | 'waiting' | 'connected' | 'ended';

interface ChatMsg {
  type: 'chat';
  role: 'agent' | 'caller';
  text: string;
  language: string;
  ts: number;
}

export default function CallCenter({ token }: Props) {
  const { darkMode } = useTheme();

  // ---- State ----
  const [callState, setCallState] = useState<CallState>('idle');
  const [sessionCode, setSessionCode] = useState('');
  const [myLanguage, setMyLanguage] = useState('english');
  const [theirLanguage, setTheirLanguage] = useState('luganda');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [peerPresent, setPeerPresent] = useState(false);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartRef = useRef<number>(0);

  // ---- Auto-scroll transcript ----
  useEffect(() => {
    transcriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // ---- Duration timer ----
  useEffect(() => {
    if (callState === 'connected') {
      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ---- Create session ----
  const startNewCall = async () => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/call/create`, { method: 'POST' });
      if (!res.ok) {
        setError('Could not create session. Check backend.');
        return;
      }
      const data = await res.json();
      setSessionCode(data.code);
      setCallState('waiting');

      // Open agent WebSocket
      const wsUrl = API_URL.replace(/^http/, 'ws') + `/ws/call/${data.code}/agent`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Agent WS is ready, waiting for caller
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === 'joined') {
            setMessages(msg.messages || []);
            setPeerPresent(!!msg.other_present);
            if (msg.other_present) setCallState('connected');
          } else if (msg.type === 'peer_joined') {
            setPeerPresent(true);
            setCallState('connected');
          } else if (msg.type === 'peer_left') {
            setPeerPresent(false);
          } else if (msg.type === 'chat') {
            setMessages((prev) => [...prev, msg as ChatMsg]);
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onerror = () => {
        setError('WebSocket error. Check backend connection.');
      };

      ws.onclose = () => {
        // If we were connected and the socket closed, end the call
        setCallState((prev) => (prev === 'connected' ? 'ended' : prev));
      };
    } catch (err) {
      setError('Backend not running. Start it first.');
    }
  };

  // ---- End call ----
  const endCall = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCallState('ended');
  };

  // ---- Back to lobby ----
  const resetToLobby = () => {
    setCallState('idle');
    setSessionCode('');
    setMessages([]);
    setInputText('');
    setElapsed(0);
    setPeerPresent(false);
    setError('');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // ---- Send message ----
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

  // ---- Copy link ----
  const copyLink = async () => {
    const url = `${window.location.origin}/join/${sessionCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      window.prompt('Copy this link:', url);
    }
  };

  // ---- Format time ----
  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const joinUrl = sessionCode ? `${window.location.origin}/join/${sessionCode}` : '';

  // ============ RENDER ============
  return (
    <div className={`callcenter-root ${darkMode ? 'callcenter-dark' : 'callcenter-light'}`}>

      {/* ============ IDLE — LOBBY ============ */}
      {callState === 'idle' && (
        <div className="callcenter-lobby">
          <div className="callcenter-lobby-icon">
            <Icon name="callcenter" size={56} strokeWidth={1.4} />
          </div>
          <h2>AI Call Center</h2>
          <p>Start a real-time translated call with a caller</p>

          <div className="callcenter-lang-row">
            <div className="callcenter-lang-group">
              <label>Your language (agent)</label>
              <select value={myLanguage} onChange={(e) => setMyLanguage(e.target.value)}>
                <option value="english">English</option>
                <option value="luganda">Luganda</option>
                <option value="swahili">Swahili</option>
                <option value="acholi">Acholi</option>
                <option value="ateso">Ateso</option>
                <option value="runyankole">Runyankole</option>
                <option value="french">French</option>
              </select>
            </div>
            <div className="callcenter-lang-group">
              <label>Caller's language</label>
              <select value={theirLanguage} onChange={(e) => setTheirLanguage(e.target.value)}>
                <option value="luganda">Luganda</option>
                <option value="swahili">Swahili</option>
                <option value="acholi">Acholi</option>
                <option value="ateso">Ateso</option>
                <option value="runyankole">Runyankole</option>
                <option value="english">English</option>
                <option value="french">French</option>
              </select>
            </div>
          </div>

          <button className="callcenter-start-btn" onClick={startNewCall}>
            <Icon name="callcenter" size={18} /> Start New Call
          </button>

          {error && (
            <p className="callcenter-error">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
        </div>
      )}

      {/* ============ WAITING FOR CALLER ============ */}
      {callState === 'waiting' && (
        <div className="callcenter-waiting">
          <div className="callcenter-waiting-status">
            <span className="callcenter-pulse-dot"></span>
            Waiting for caller to join…
          </div>

          <h1 className="callcenter-code">{sessionCode}</h1>
          <p className="callcenter-code-label">Session Code</p>

          <div className="callcenter-qr-wrap">
            <QRCodeSVG
              value={joinUrl}
              size={200}
              bgColor="transparent"
              fgColor={darkMode ? '#d4a537' : '#8a6a1e'}
              level="M"
            />
          </div>

          <p className="callcenter-qr-hint">Caller scans this QR code with their phone</p>

          <div className="callcenter-link-box">
            <input
              type="text"
              value={joinUrl}
              readOnly
              className="callcenter-link-input"
            />
            <button className="callcenter-copy-btn" onClick={copyLink}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className="callcenter-waiting-hint">
            Or share the link above with the caller via WhatsApp, SMS, etc.
          </p>

          <button className="callcenter-cancel-btn" onClick={resetToLobby}>
            Cancel
          </button>
        </div>
      )}

      {/* ============ CONNECTED — IN CALL ============ */}
      {callState === 'connected' && (
        <div className="callcenter-callview">
          {/* Top bar */}
          <div className="callcenter-call-header">
            <div className="callcenter-call-info">
              <span className="callcenter-call-avatar">
                <Icon name="user" size={22} />
              </span>
              <div>
                <h3>Caller</h3>
                <span className="callcenter-call-status">
                  <Icon name="circle-filled" size={8} /> Live • {formatTime(elapsed)}
                </span>
              </div>
            </div>
            <div className="callcenter-call-langs">
              <span className="callcenter-lang-tag">
                <Icon name="user" size={12} /> Agent: {myLanguage}
              </span>
              <span className="callcenter-lang-tag">
                <Icon name="message-circle" size={12} /> Caller: {theirLanguage}
              </span>
            </div>
            <button className="callcenter-end-btn" onClick={endCall}>
              <Icon name="phone-off" size={16} /> End Call
            </button>
          </div>

          {/* Transcript */}
          <div className="callcenter-transcript">
            {messages.length === 0 ? (
              <div className="callcenter-transcript-empty">
                <Icon name="message-circle" size={40} strokeWidth={1.4} />
                <p>Connected. Start the conversation.</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`callcenter-msg callcenter-msg-${m.role}`}
                >
                  <div className="callcenter-msg-head">
                    <span className="callcenter-msg-role">
                      {m.role === 'agent' ? 'You (Agent)' : 'Caller'}
                    </span>
                    <span className="callcenter-msg-lang">{m.language}</span>
                    <span className="callcenter-msg-time">
                      {new Date(m.ts * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="callcenter-msg-text">{m.text}</p>
                </div>
              ))
            )}
            <div ref={transcriptRef} />
          </div>

          {/* Input bar */}
          <div className="callcenter-input-bar">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="callcenter-input"
            />
            <button
              className="callcenter-send-btn"
              onClick={sendMessage}
              disabled={!inputText.trim()}
            >
              <Icon name="send" size={16} />
            </button>
          </div>

          {!peerPresent && (
            <p className="callcenter-call-hint">
              <Icon name="alert" size={14} /> Caller disconnected. Waiting for them to rejoin…
            </p>
          )}
        </div>
      )}

      {/* ============ ENDED ============ */}
      {callState === 'ended' && (
        <div className="callcenter-ended">
          <div className="callcenter-ended-icon">
            <Icon name="phone-off" size={48} strokeWidth={1.4} />
          </div>
          <h2>Call Ended</h2>
          <div className="callcenter-ended-stats">
            <div className="callcenter-ended-stat">
              <span className="callcenter-ended-value">{formatTime(elapsed)}</span>
              <span className="callcenter-ended-label">Duration</span>
            </div>
            <div className="callcenter-ended-stat">
              <span className="callcenter-ended-value">{messages.length}</span>
              <span className="callcenter-ended-label">Messages</span>
            </div>
          </div>
          <button className="callcenter-start-btn" onClick={resetToLobby}>
            <Icon name="callcenter" size={18} /> New Call
          </button>
        </div>
      )}

      {/* Hidden token reference (for future API calls like save-to-history) */}
      <span style={{ display: 'none' }} data-token={token} />
    </div>
  );
}