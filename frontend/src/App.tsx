import React, { useState, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

const API_URL = 'http://127.0.0.1:8000';
const WEBRTC_URL = 'http://127.0.0.1:8001';

interface Language { code: string; name: string; }
interface LanguageGroup { label: string; languages: Language[]; }
interface Translation { id: number; source_text: string; translated_text: string; source_language: string; target_language: string; created_at: string; }
interface CallData { id: number; caller: string; language: string; queuePosition: number; status: string; timestamp: string; }
interface TranscriptLine { speaker: string; text: string; language: string; time: string; }

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '15px 20px',
    color: 'white',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  } as React.CSSProperties,
  footer: {
    background: '#1a1a2e',
    padding: '15px',
    textAlign: 'center',
    color: '#999',
    fontSize: '12px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    marginTop: 'auto',
  } as React.CSSProperties,
  mainContent: {
    flex: 1,
    display: 'flex',
    gap: '15px',
    maxWidth: '1400px',
    margin: '20px auto',
    padding: '0 20px',
    width: '100%',
    boxSizing: 'border-box',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  sidebar: {
    width: '200px',
    minWidth: '200px',
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    position: 'sticky',
    top: '80px',
  } as React.CSSProperties,
  card: {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '20px',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    flex: 1,
    minWidth: '280px',
  } as React.CSSProperties,
  select: {
    flex: 1,
    minWidth: '120px',
    padding: '14px',
    borderRadius: '12px',
    border: '2px solid #667eea',
    background: '#1a1a2e',
    color: 'white',
    fontSize: '15px',
    fontWeight: 600,
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    height: '140px',
    padding: '16px',
    fontSize: '16px',
    borderRadius: '14px',
    border: '2px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: 'white',
    resize: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  button: {
    padding: '14px',
    fontSize: '15px',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.3s ease',
  } as React.CSSProperties,
  resultCard: {
    marginTop: '20px',
    padding: '22px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '14px',
    marginBottom: '12px',
    borderRadius: '12px',
    border: '2px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: 'white',
    fontSize: '15px',
    boxSizing: 'border-box',
  } as React.CSSProperties,
};

const responsiveStyles = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
@media (max-width: 768px) {
  .sidebar { display: none !important; }
  .sidebar.open { display: block !important; position: fixed; top: 60px; left: 0; width: 100%; z-index: 99; border-radius: 0; }
  .main-content { padding: 10px !important; }
  .header-title { font-size: 16px !important; }
}
`;

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [isPremium, setIsPremium] = useState(localStorage.getItem('isPremium') === 'true' || false);
  const [showLogin, setShowLogin] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [activeTab, setActiveTab] = useState('translate');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<Translation[]>([]);
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('spanish');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceType, setVoiceType] = useState('female');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [translatedAudioURL, setTranslatedAudioURL] = useState<string | null>(null);
  const [callQueue, setCallQueue] = useState<CallData[]>([]);
  const [activeCall, setActiveCall] = useState<CallData | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [webrtcStatus, setWebrtcStatus] = useState('Disconnected');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoResult, setVideoResult] = useState<any>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState('luganda');
  const [adminDashboard, setAdminDashboard] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<any[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const translateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const languageGroups: LanguageGroup[] = [
    { label: '🌍 International', languages: [
      { code: 'english', name: 'English' }, { code: 'spanish', name: 'Spanish' },
      { code: 'french', name: 'French' }, { code: 'german', name: 'German' },
      { code: 'portuguese', name: 'Portuguese' }, { code: 'italian', name: 'Italian' },
      { code: 'dutch', name: 'Dutch' }, { code: 'russian', name: 'Russian' },
      { code: 'arabic', name: 'Arabic' }, { code: 'hindi', name: 'Hindi' },
      { code: 'chinese', name: 'Chinese' }, { code: 'japanese', name: 'Japanese' },
      { code: 'korean', name: 'Korean' }, { code: 'turkish', name: 'Turkish' },
      { code: 'polish', name: 'Polish' }, { code: 'swedish', name: 'Swedish' },
    ]},
    { label: '🇺🇬 Uganda', languages: [
      { code: 'luganda', name: 'Luganda' }, { code: 'rukiga', name: 'Rukiga' },
      { code: 'runyankole', name: 'Runyankole' }, { code: 'acholi', name: 'Acholi' },
      { code: 'alur', name: 'Alur' }, { code: 'ateso', name: 'Ateso' },
      { code: 'lango', name: 'Lango' }, { code: 'lugbara', name: 'Lugbara' },
      { code: 'lusoga', name: 'Lusoga' }, { code: 'lugwere', name: 'Lugwere' },
    ]},
    { label: '🌍 East Africa', languages: [
      { code: 'swahili', name: 'Swahili' }, { code: 'kinyarwanda', name: 'Kinyarwanda' },
      { code: 'kirundi', name: 'Kirundi' }, { code: 'amharic', name: 'Amharic' },
      { code: 'somali', name: 'Somali' }, { code: 'oromo', name: 'Oromo' },
      { code: 'tigrinya', name: 'Tigrinya' }, { code: 'kikuyu', name: 'Kikuyu' },
      { code: 'dholuo', name: 'Dholuo' },
    ]},
    { label: '🌍 West Africa', languages: [
      { code: 'yoruba', name: 'Yoruba' }, { code: 'hausa', name: 'Hausa' },
      { code: 'igbo', name: 'Igbo' }, { code: 'fulfulde', name: 'Fulfulde' },
      { code: 'wolof', name: 'Wolof' }, { code: 'bambara', name: 'Bambara' },
      { code: 'twi', name: 'Twi' }, { code: 'ewe', name: 'Ewe' },
    ]},
    { label: '🌍 Central Africa', languages: [
      { code: 'lingala', name: 'Lingala' }, { code: 'kikongo', name: 'Kikongo' },
      { code: 'bemba', name: 'Bemba' }, { code: 'chichewa', name: 'Chichewa' },
    ]},
    { label: '🌍 Southern Africa', languages: [
      { code: 'zulu', name: 'Zulu' }, { code: 'xhosa', name: 'Xhosa' },
      { code: 'afrikaans', name: 'Afrikaans' }, { code: 'sesotho', name: 'Sesotho' },
      { code: 'setswana', name: 'Setswana' }, { code: 'shona', name: 'Shona' },
    ]},
    { label: '🌍 North Africa', languages: [
      { code: 'kabyle', name: 'Kabyle' }, { code: 'tachelhit', name: 'Tachelhit' },
    ]},
  ];

  const getAllLanguages = (): Language[] => languageGroups.flatMap((group) => group.languages);

  const fetchHistory = async () => {
    if (!token) return;
    try { const r = await axios.get(`${API_URL}/translate/history`, { headers: { Authorization: `Bearer ${token}` } }); setHistory(r.data); } catch (e) {}
  };

  const handleLogin = async () => {
    try {
      const fd = new URLSearchParams(); fd.append('username', loginUsername); fd.append('password', loginPassword);
      const r = await axios.post(`${API_URL}/auth/login`, fd, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      setToken(r.data.access_token); setUsername(r.data.username);
      localStorage.setItem('token', r.data.access_token); localStorage.setItem('username', r.data.username);
      localStorage.setItem('isPremium', r.data.is_premium || false); setIsPremium(r.data.is_premium || false);
    } catch (e) { alert('Login failed'); }
  };

  const handleRegister = async () => {
    try { await axios.post(`${API_URL}/auth/register`, { username: regUsername, email: regEmail, password: regPassword }); alert('Registration successful!'); setShowLogin(true); } catch (e) { alert('Registration failed'); }
  };

  const handleLogout = () => {
    setToken(''); setUsername(''); localStorage.clear();
    setIsPremium(false); setSourceText(''); setTranslatedText(''); setHistory([]);
  };

  const autoTranslateText = (text: string, langA?: string, langB?: string) => {
    if (!autoTranslate || !text || !token) return;
    const src = langA || sourceLang;
    const tgt = langB || targetLang;
    if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
    translateTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await axios.post(`${API_URL}/translate/text`, { text, source_language: src, target_language: tgt, user_id: 1 }, { headers: { Authorization: `Bearer ${token}` } });
        setTranslatedText(r.data.translated_text);
      } catch (e) {}
      setLoading(false);
    }, 500);
  };

  const handleTranslate = async () => {
    if (!sourceText || !token) return;
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/translate/text`, { text: sourceText, source_language: sourceLang, target_language: targetLang, user_id: 1 }, { headers: { Authorization: `Bearer ${token}` } });
      setTranslatedText(r.data.translated_text);
      fetchHistory();
    } catch (e) { alert('Translation failed'); }
    setLoading(false);
  };

  const speakTranslation = async () => {
    if (!translatedText) return;
    setSpeaking(true);
    try {
      const r = await axios.post(`${API_URL}/tts/speak?text=${encodeURIComponent(translatedText)}&language=${targetLang}&voice=${voiceType}`, null, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data); setTranslatedAudioURL(url); new Audio(url).play();
    } catch (e) { alert('Could not play audio'); }
    setSpeaking(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr; audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecording(false);
        const fd = new FormData(); fd.append('file', blob, 'recording.wav');
        try {
          const r = await axios.post(`${API_URL}/speech/transcribe`, fd, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } });
          setSourceText(r.data.text); setSourceLang('auto'); autoTranslateText(r.data.text);
        } catch (e) { alert('Speech failed'); }
      };
      mr.start(); setRecording(true);
    } catch (e) { alert('Could not access microphone'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop()); }
  };

  const deleteTranslation = async (id: number) => {
    try { await axios.delete(`${API_URL}/translate/${id}`, { headers: { Authorization: `Bearer ${token}` } }); fetchHistory(); } catch (e) {}
  };

  const handleVideoSelect = (file: File) => { setVideoFile(file); setVideoURL(URL.createObjectURL(file)); };
  const handleVideoUpload = async () => {
    if (!videoFile || !token) return;
    setVideoLoading(true); setVideoResult(null);
    try {
      const fd = new FormData(); fd.append('file', videoFile);
      const r = await axios.post(`${API_URL}/video/extract-subtitles`, fd, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }, params: { target_language: targetLang } });
      setVideoResult(r.data);
    } catch (e) { alert('Video processing failed'); }
    setVideoLoading(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleVideoSelect(file); };

  const fetchAdminDashboard = async () => {
    try { const r = await axios.get(`${API_URL}/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } }); setAdminDashboard(r.data); } catch (e) {}
  };
  const fetchAdminUsers = async () => {
    try { const r = await axios.get(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }); setAdminUsers(r.data); } catch (e) {}
  };
  const fetchAgentMetrics = async () => {
    try { const r = await axios.get(`${API_URL}/admin/agent-metrics`, { headers: { Authorization: `Bearer ${token}` } }); setAgentMetrics(r.data); } catch (e) {}
  };
  const exportSRT = async () => {
    try { const r = await axios.get(`${API_URL}/admin/export-srt`, { headers: { Authorization: `Bearer ${token}` } }); downloadFile(r.data.srt_content, 'translations.srt'); } catch (e) {}
  };
  const exportVTT = async () => {
    try { const r = await axios.get(`${API_URL}/admin/export-vtt`, { headers: { Authorization: `Bearer ${token}` } }); downloadFile(r.data.vtt_content, 'translations.vtt'); } catch (e) {}
  };
  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const connectWebRTC = () => {
    const newSocket = io(WEBRTC_URL);
    newSocket.on('connect', () => { setWebrtcStatus('Connected'); newSocket.emit('agent_register', { name: username }); });
    newSocket.on('disconnect', () => setWebrtcStatus('Disconnected'));
    setSocket(newSocket);
  };
  const disconnectWebRTC = () => { if (socket) { socket.disconnect(); setSocket(null); setWebrtcStatus('Disconnected'); } };
  const simulateIncomingCall = () => {
    const newCall: CallData = { id: Date.now(), caller: `Caller ${Math.floor(Math.random() * 1000)}`, language: 'Luganda', queuePosition: callQueue.length + 1, status: 'waiting', timestamp: new Date().toLocaleTimeString() };
    setCallQueue((prev) => [...prev, newCall]);
  };
  const acceptCall = (callId: number) => {
    const call = callQueue.find((c) => c.id === callId);
    if (call) {
      setActiveCall(call);
      setCallQueue((prev) => prev.filter((c) => c.id !== callId));
      setTranscript([
        { speaker: 'Caller', text: 'Good morning, I need help', language: call.language, time: new Date().toLocaleTimeString() },
        { speaker: 'Agent', text: 'Good morning! How can I assist?', language: 'English', time: new Date().toLocaleTimeString() },
      ]);
    }
  };
  const endCall = () => { setActiveCall(null); setTranscript([]); };

  if (!token) {
    return (
      <div style={{ ...styles.container, minHeight: '100vh', justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <style>{responsiveStyles}</style>
        <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', borderRadius: '24px', padding: '40px', maxWidth: '400px', boxShadow: '0 25px 80px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', width: '90%', boxSizing: 'border-box' }}>
          <h1 style={{ textAlign: 'center', color: '#fff', marginBottom: '5px' }}>🌐 LingoLink AI</h1>
          <p style={{ textAlign: 'center', color: '#999', marginBottom: '25px' }}>Enterprise AI Translation</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
            <button onClick={() => setShowLogin(true)} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, background: showLogin ? '#667eea' : '#e0e0e0', color: showLogin ? 'white' : '#666' }}>Login</button>
            <button onClick={() => setShowLogin(false)} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, background: !showLogin ? '#667eea' : '#e0e0e0', color: !showLogin ? 'white' : '#666' }}>Register</button>
          </div>
          {showLogin ? (
            <div>
              <input placeholder="Username" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} style={styles.input} />
              <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={styles.input} />
              <button onClick={handleLogin} style={{ ...styles.button, width: '100%', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white' }}>Login</button>
            </div>
          ) : (
            <div>
              <input placeholder="Username" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} style={styles.input} />
              <input placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} style={styles.input} />
              <input type="password" placeholder="Password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} style={styles.input} />
              <button onClick={handleRegister} style={{ ...styles.button, width: '100%', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white' }}>Register</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{responsiveStyles}</style>

      {/* HEADER */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'white', fontSize: '22px' }}>☰</button>
          <h1 style={{ margin: 0, fontSize: '20px' }}>🌐 LingoLink AI</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px' }}>👤 {username} {isPremium ? '⭐' : ''}</span>
          <button onClick={handleLogout} style={{ padding: '8px 15px', background: 'rgba(231,76,60,0.8)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={styles.mainContent}>
        {/* SIDEBAR */}
        {sidebarOpen && (
          <aside className="sidebar" style={styles.sidebar}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {[
                { id: 'translate', icon: '🌐', label: 'Translate' },
                { id: 'history', icon: '📜', label: 'History' },
                { id: 'callcenter', icon: '📞', label: 'Call Center' },
                { id: 'video', icon: '🎬', label: 'Video' },
                ...(username === 'admin' ? [{ id: 'admin', icon: '⚙️', label: 'Admin' }] : []),
              ].map((item) => (
                <button key={item.id} onClick={() => { setActiveTab(item.id); if (item.id === 'history') fetchHistory(); if (item.id === 'admin') { fetchAdminDashboard(); fetchAdminUsers(); fetchAgentMetrics(); } }}
                  style={{ padding: '12px 15px', textAlign: 'left', background: activeTab === item.id ? '#667eea' : 'transparent', color: activeTab === item.id ? '#fff' : '#999', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: activeTab === item.id ? 600 : 400 }}>
                  {item.icon} {item.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* CARD */}
        <main style={styles.card}>
          {activeTab === 'admin' ? (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#fff', fontSize: '24px' }}>⚙️ Admin Dashboard</h2>
              {adminDashboard && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                  <div style={{ padding: '20px', background: 'linear-gradient(135deg, #667eea, #764ba2)', borderRadius: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '28px', margin: 0, color: '#fff', fontWeight: 'bold' }}>{adminDashboard.total_users}</p>
                    <small style={{ color: 'rgba(255,255,255,0.8)' }}>👥 Users</small>
                  </div>
                  <div style={{ padding: '20px', background: 'linear-gradient(135deg, #27ae60, #2ecc71)', borderRadius: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '28px', margin: 0, color: '#fff', fontWeight: 'bold' }}>{adminDashboard.premium_users}</p>
                    <small style={{ color: 'rgba(255,255,255,0.8)' }}>⭐ Premium</small>
                  </div>
                  <div style={{ padding: '20px', background: 'linear-gradient(135deg, #f39c12, #e67e22)', borderRadius: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '28px', margin: 0, color: '#fff', fontWeight: 'bold' }}>{adminDashboard.total_translations}</p>
                    <small style={{ color: 'rgba(255,255,255,0.8)' }}>🌐 Translations</small>
                  </div>
                  <div style={{ padding: '20px', background: 'linear-gradient(135deg, #e74c3c, #c0392b)', borderRadius: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '28px', margin: 0, color: '#fff', fontWeight: 'bold' }}>${adminDashboard.billing_estimate}</p>
                    <small style={{ color: 'rgba(255,255,255,0.8)' }}>💰 Revenue</small>
                  </div>
                </div>
              )}
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', marginBottom: '25px' }}>
                <h3 style={{ color: '#fff', margin: '0 0 15px' }}>👥 Users</h3>
                {adminUsers.map((user: any) => (
                  <div key={user.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', marginBottom: '8px', color: '#fff' }}>
                    <strong>{user.username}</strong> {user.is_admin && '(Admin)'} {user.is_premium ? '⭐' : ''}
                  </div>
                ))}
              </div>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                <h3 style={{ color: '#fff', margin: '0 0 15px' }}>📥 Downloads</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={exportSRT} style={{ ...styles.button, flex: 1, background: '#667eea', color: 'white' }}>📥 .SRT</button>
                  <button onClick={exportVTT} style={{ ...styles.button, flex: 1, background: '#8e44ad', color: 'white' }}>📥 .VTT</button>
                </div>
              </div>
            </div>
          ) : activeTab === 'video' ? (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#fff' }}>🎬 Video Studio</h2>
              <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={{ padding: '40px', textAlign: 'center', background: dragOver ? 'rgba(102,126,234,0.3)' : 'rgba(255,255,255,0.05)', borderRadius: '16px', border: dragOver ? '2px dashed #667eea' : '2px dashed rgba(255,255,255,0.2)', cursor: 'pointer' }} onClick={() => document.getElementById('video-input')?.click()}>
                <p style={{ fontSize: '48px', margin: '0 0 10px' }}>🎬</p>
                <p style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>{dragOver ? 'Drop it!' : 'Drag & Drop Video'}</p>
                <input id="video-input" type="file" accept="video/*,.mp4,.mov" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleVideoSelect(file); }} />
              </div>
              {videoURL && (
                <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(0,0,0,0.3)', borderRadius: '14px' }}>
                  <video src={videoURL} controls style={{ width: '100%', maxHeight: '400px', borderRadius: '12px' }} />
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '15px', flexWrap: 'wrap' }}>
                    <label style={{ color: '#fff' }}>🎬 Subtitle:</label>
                    <select value={subtitleLanguage} onChange={(e) => setSubtitleLanguage(e.target.value)} style={{ padding: '10px', borderRadius: '8px', background: '#1a1a2e', color: '#fff', border: '1px solid #667eea' }}>
                      {getAllLanguages().map((l) => <option key={l.code} value={l.code} style={{ background: '#1a1a2e', color: '#fff' }}>{l.name}</option>)}
                    </select>
                  </div>
                  <button onClick={handleVideoUpload} disabled={videoLoading} style={{ ...styles.button, marginTop: '10px', background: '#667eea', color: 'white' }}>{videoLoading ? '⏳...' : '📤 Extract Subtitles'}</button>
                  {videoResult && (
                    <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(255,255,255,0.08)', borderRadius: '14px' }}>
                      <p style={{ color: '#fff' }}>Detected: {videoResult.detected_language}</p>
                      <p style={{ color: '#e0e0e0' }}>{videoResult.translated_text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'callcenter' ? (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#fff' }}>📞 Call Center</h2>
              <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(102,126,234,0.15)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ color: '#fff' }}><strong>WebRTC:</strong> <span style={{ color: webrtcStatus === 'Connected' ? '#27ae60' : '#e74c3c' }}>{webrtcStatus}</span></div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {!socket ? <button onClick={connectWebRTC} style={{ ...styles.button, background: '#27ae60', color: 'white' }}>Connect</button> : <button onClick={disconnectWebRTC} style={{ ...styles.button, background: '#e74c3c', color: 'white' }}>Disconnect</button>}
                  <button onClick={simulateIncomingCall} style={{ ...styles.button, background: '#f39c12', color: 'white' }}>Simulate Call</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                  <h3 style={{ color: '#fff' }}>📋 Queue</h3>
                  {callQueue.length === 0 ? <p style={{ color: '#999' }}>Empty</p> : callQueue.map((call) => (
                    <div key={call.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px', marginBottom: '8px', color: '#fff' }}>
                      <strong>{call.caller}</strong> — {call.language}
                      <button onClick={() => acceptCall(call.id)} style={{ marginLeft: '10px', padding: '5px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Accept</button>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 2, minWidth: '250px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                  <h3 style={{ color: '#fff' }}>💬 Active Call</h3>
                  {!activeCall ? <p style={{ color: '#999' }}>No active call</p> : (
                    <div>
                      <div style={{ color: '#fff', marginBottom: '10px' }}><strong>{activeCall.caller}</strong> — {activeCall.language}</div>
                      {transcript.map((line, idx) => (
                        <div key={idx} style={{ padding: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px', marginBottom: '6px', color: '#fff' }}>
                          <strong>{line.speaker}</strong>: {line.text}
                        </div>
                      ))}
                      <button onClick={endCall} style={{ ...styles.button, background: '#e74c3c', color: 'white', marginTop: '10px' }}>End Call</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            <div>
              <h2 style={{ color: '#fff' }}>📜 History</h2>
              {history.length === 0 ? <p style={{ textAlign: 'center', color: '#999' }}>No translations yet.</p> : history.map((item) => (
                <div key={item.id} style={{ padding: '15px', marginBottom: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', color: '#fff', flexWrap: 'wrap', gap: '8px' }}>
                  <div><p style={{ fontWeight: 'bold', margin: 0 }}>{item.source_text}</p><p style={{ color: '#667eea', margin: '5px 0 0' }}>{item.translated_text}</p></div>
                  <button onClick={() => deleteTranslation(item.id)} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>Delete</button>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={sourceLang} onChange={(e) => { setSourceLang(e.target.value); if (sourceText) autoTranslateText(sourceText, e.target.value, targetLang); }} style={{ ...styles.select, flex: 2, minWidth: '150px' }}>
                  <option value="auto">⚡ Auto Detect</option>
                  {getAllLanguages().map((lang) => <option key={lang.code} value={lang.code} style={{ background: '#1a1a2e', color: '#fff' }}>{lang.name}</option>)}
                </select>
                <button onClick={() => { const search = prompt('🔍 Search source language:'); if (search) { const found = getAllLanguages().find(l => l.name.toLowerCase().includes(search.toLowerCase())); if (found) { setSourceLang(found.code); if (sourceText) autoTranslateText(sourceText, found.code, targetLang); } else alert('Language not found'); } }} style={{ ...styles.button, background: '#1a1a2e', color: 'white', border: '2px solid #667eea', padding: '14px 20px' }}>🔍</button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: '15px' }}><span style={{ color: '#fff', fontSize: '20px' }}>↓</span></div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={targetLang} onChange={(e) => { setTargetLang(e.target.value); if (sourceText) autoTranslateText(sourceText, sourceLang, e.target.value); }} style={{ ...styles.select, flex: 2, minWidth: '150px' }}>
                  {getAllLanguages().map((lang) => <option key={lang.code} value={lang.code} style={{ background: '#1a1a2e', color: '#fff' }}>{lang.name}</option>)}
                </select>
                <button onClick={() => { const search = prompt('🔍 Search target language:'); if (search) { const found = getAllLanguages().find(l => l.name.toLowerCase().includes(search.toLowerCase())); if (found) { setTargetLang(found.code); if (sourceText) autoTranslateText(sourceText, sourceLang, found.code); } else alert('Language not found'); } }} style={{ ...styles.button, background: '#1a1a2e', color: 'white', border: '2px solid #667eea', padding: '14px 20px' }}>🔍</button>
              </div>
              <textarea value={sourceText} onChange={(e) => { setSourceText(e.target.value); autoTranslateText(e.target.value); }} placeholder="Type here for instant translation..." style={styles.textarea} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
                <button onClick={() => setAutoTranslate(!autoTranslate)} style={{ ...styles.button, flex: 1, minWidth: '100px', background: autoTranslate ? '#27ae60' : 'rgba(255,255,255,0.1)', color: 'white' }}>{autoTranslate ? '⚡ Auto ON' : '⚡ Auto OFF'}</button>
                <button onClick={() => setVoiceMode(!voiceMode)} style={{ ...styles.button, flex: 1, minWidth: '100px', background: voiceMode ? '#8e44ad' : 'rgba(255,255,255,0.1)', color: 'white' }}>{voiceMode ? '🔊 Voice-to-Voice' : '🎤 Voice-to-Text'}</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button onClick={recording ? stopRecording : startRecording} style={{ ...styles.button, flex: 1, minWidth: '100px', background: recording ? '#e74c3c' : '#f39c12', color: 'white' }}>{recording ? '🛑 Stop' : '🎤 Speak'}</button>
                <button onClick={handleTranslate} disabled={loading || !sourceText} style={{ ...styles.button, flex: 1, minWidth: '100px', background: '#667eea', color: 'white' }}>{loading ? '⏳...' : '🌐 Translate'}</button>
              </div>
              {translatedText && (
                <div style={styles.resultCard}>
                  <h3 style={{ color: '#fff' }}>✨ Translation:</h3>
                  <p style={{ fontSize: '18px', color: '#fff' }}>{translatedText}</p>
                  <button onClick={speakTranslation} disabled={speaking} style={{ ...styles.button, marginTop: '15px', width: '100%', background: '#27ae60', color: 'white' }}>{speaking ? '🔊 Playing...' : '🔊 Hear Translation'}</button>
                  {translatedAudioURL && <audio controls src={translatedAudioURL} style={{ width: '100%', marginTop: '10px' }} />}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        © 2026 LingoLink AI — Enterprise AI Translation Platform. All rights reserved.
      </footer>
    </div>
  );
}

export default App;