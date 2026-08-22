import React, { useState, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
const API_URL = 'http://192.168.100.173:8000';
const WEBRTC_URL = 'http://192.168.100.173:8001';

interface Language { code: string; name: string; }
interface LanguageGroup { label: string; languages: Language[]; }
interface Translation { id: number; source_text: string; translated_text: string; source_language: string; target_language: string; created_at: string; }
interface CallData { id: number; caller: string; language: string; queuePosition: number; status: string; timestamp: string; }
interface TranscriptLine { speaker: string; text: string; language: string; time: string; }
interface Alert { id: number | string; message: string; timestamp: string; }

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: '20px',
  } as React.CSSProperties,
  card: {
    maxWidth: '1200px',
    margin: '0 auto',
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '20px',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '25px',
    padding: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    color: 'white',
    flexWrap: 'wrap',
    gap: '10px',
  } as React.CSSProperties,
  tabButton: (active: boolean) => ({
    flex: 1,
    minWidth: '80px',
    padding: '14px',
    fontSize: '15px',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.3s ease',
    background: active ? '#667eea' : 'rgba(255,255,255,0.1)',
    color: active ? 'white' : '#999',
    transform: active ? 'scale(1.05)' : 'scale(1)',
  } as React.CSSProperties),
  select: {
    flex: 1,
    minWidth: '120px',
    padding: '14px',
    borderRadius: '12px',
    border: '2px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: 'white',
    fontSize: '15px',
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

const animationStyles = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
@media (max-width: 768px) {
  .tab-btn-text { font-size: 12px !important; }
  .textarea-resp { height: 100px !important; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .stack-mobile { flex-direction: column !important; }
}
@media (max-width: 480px) {
  .tab-btn-text { font-size: 10px !important; }
  .kpi-grid { grid-template-columns: 1fr !important; }
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
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [translatedAudioURL, setTranslatedAudioURL] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const [callQueue, setCallQueue] = useState<CallData[]>([]);
  const [callAlerts, setCallAlerts] = useState<Alert[]>([]);
  const [activeCall, setActiveCall] = useState<CallData | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [webrtcStatus, setWebrtcStatus] = useState('Disconnected');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoResult, setVideoResult] = useState<any>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [videoQueue, setVideoQueue] = useState<string[]>([]);
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
      { code: 'arabic', name: 'Arabic' }, { code: 'hindi', name: 'Hindi' },
      { code: 'chinese', name: 'Chinese' }, { code: 'japanese', name: 'Japanese' },
      { code: 'korean', name: 'Korean' }, { code: 'turkish', name: 'Turkish' },
    ]},
    { label: '🇺🇬 Uganda', languages: [
      { code: 'luganda', name: 'Luganda' }, { code: 'runyankole', name: 'Runyankole' },
      { code: 'rukiga', name: 'Rukiga' }, { code: 'acholi', name: 'Acholi' },
      { code: 'alur', name: 'Alur' }, { code: 'ateso', name: 'Ateso' },
      { code: 'lango', name: 'Lango' }, { code: 'lugbara', name: 'Lugbara' },
    ]},
    { label: '🌍 East Africa', languages: [
      { code: 'swahili', name: 'Swahili' }, { code: 'kinyarwanda', name: 'Kinyarwanda' },
      { code: 'kirundi', name: 'Kirundi' }, { code: 'amharic', name: 'Amharic' },
      { code: 'somali', name: 'Somali' }, { code: 'oromo', name: 'Oromo' },
      { code: 'tigrinya', name: 'Tigrinya' }, { code: 'kikuyu', name: 'Kikuyu' },
    ]},
    { label: '🌍 West Africa', languages: [
      { code: 'yoruba', name: 'Yoruba' }, { code: 'hausa', name: 'Hausa' },
      { code: 'igbo', name: 'Igbo' }, { code: 'fulfulde', name: 'Fulfulde' },
      { code: 'wolof', name: 'Wolof' }, { code: 'twi', name: 'Twi' },
    ]},
    { label: '🌍 Southern Africa', languages: [
      { code: 'zulu', name: 'Zulu' }, { code: 'xhosa', name: 'Xhosa' },
      { code: 'afrikaans', name: 'Afrikaans' }, { code: 'shona', name: 'Shona' },
      { code: 'chichewa', name: 'Chichewa' }, { code: 'bemba', name: 'Bemba' },
    ]},
    { label: '🌍 North Africa', languages: [
      { code: 'kabyle', name: 'Kabyle' }, { code: 'tachelhit', name: 'Tachelhit' },
      { code: 'tamazight', name: 'Tamazight' },
    ]},
  ];

  const renderOptions = (includeAuto: boolean) => (
    <>
      {includeAuto && <option value="auto">⚡ Auto Detect</option>}
      {languageGroups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </optgroup>
      ))}
    </>
  );

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
    disconnectWebRTC();
    setToken(''); setUsername(''); localStorage.clear();
    setIsPremium(false); setSourceText(''); setTranslatedText(''); setHistory([]);
  };

  const autoTranslateText = (text: string) => {
    if (!autoTranslate || !text || !token) return;
    if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
    translateTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await axios.post(`${API_URL}/translate/text`, { text, source_language: sourceLang, target_language: targetLang, user_id: 1 }, { headers: { Authorization: `Bearer ${token}` } });
        setTranslatedText(r.data.translated_text);
        setVoiceNote(r.data.translated_text === text ? '🔊 Voice still works!' : '');
      } catch (e) {}
      setLoading(false);
    }, 800);
  };

  const handleTranslate = async () => {
    if (!sourceText || !token) return;
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/translate/text`, { text: sourceText, source_language: sourceLang, target_language: targetLang, user_id: 1 }, { headers: { Authorization: `Bearer ${token}` } });
      setTranslatedText(r.data.translated_text);
      setVoiceNote(r.data.translated_text === sourceText ? '🔊 Voice still works!' : '');
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
        setAudioURL(URL.createObjectURL(blob)); setRecording(false);
        if (voiceMode) await sendVoiceTranslation(blob); else await sendTranscription(blob);
      };
      mr.start(); setRecording(true);
    } catch (e) { alert('Could not access microphone'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop()); }
  };

  const sendVoiceTranslation = async (blob: Blob) => {
    setLoading(true);
    try {
      const fd = new FormData(); fd.append('file', blob, 'recording.wav');
      const r = await axios.post(`${API_URL}/speech/voice-to-voice`, fd, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }, params: { source_language: sourceLang, target_language: targetLang } });
      setSourceText(r.data.original_text); setTranslatedText(r.data.translated_text);
      if (r.data.audio_base64) {
        const bs = atob(r.data.audio_base64); const bytes = new Uint8Array(bs.length);
        for (let i = 0; i < bs.length; i++) bytes[i] = bs.charCodeAt(i);
        new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))).play();
      }
    } catch (e) { alert('Voice translation failed'); }
    setLoading(false);
  };

  const sendTranscription = async (blob: Blob) => {
    setLoading(true);
    try {
      const fd = new FormData(); fd.append('file', blob, 'recording.wav');
      const r = await axios.post(`${API_URL}/speech/transcribe`, fd, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } });
      setSourceText(r.data.text); setSourceLang('auto'); autoTranslateText(r.data.text);
    } catch (e) { alert('Speech transcription failed'); }
    setLoading(false);
  };

  const deleteTranslation = async (id: number) => {
    try { await axios.delete(`${API_URL}/translate/${id}`, { headers: { Authorization: `Bearer ${token}` } }); fetchHistory(); } catch (e) {}
  };

  const handleVideoUpload = async () => {
    if (!videoFile || !token) return;
    setVideoLoading(true); setVideoResult(null);
    try {
      const fd = new FormData(); fd.append('file', videoFile);
      const r = await axios.post(`${API_URL}/video/extract-subtitles`, fd, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }, params: { target_language: targetLang } });
      setVideoResult(r.data);
      setVideoQueue((prev) => [...prev, videoFile.name]);
    } catch (e: any) { alert('Video processing failed'); }
    setVideoLoading(false); setVideoFile(null);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov')) setVideoFile(file);
      else alert('Please drop a video file (.mp4 or .mov)');
    }
  };

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
    newSocket.on('incoming_call', (callData: any) => {
      setCallAlerts((prev) => [...prev, { id: callData.call_id, message: `📞 PSTN Call from ${callData.caller_number} (${callData.language})`, timestamp: new Date().toLocaleTimeString() }]);
    });
    setSocket(newSocket);
  };

  const disconnectWebRTC = () => {
    if (socket) { socket.disconnect(); setSocket(null); setWebrtcStatus('Disconnected'); }
  };

  const simulatePSTNCall = () => {
    if (socket) socket.emit('simulate_incoming_call', { caller_number: `+256${Math.floor(Math.random() * 900000000 + 100000000)}`, language: 'Luganda' });
  };

  const simulateIncomingCall = () => {
    const callId = Date.now();
    const languages = ['Luganda', 'Swahili', 'Acholi', 'Rukiga', 'English'];
    const randomLang = languages[Math.floor(Math.random() * languages.length)];
    const newCall: CallData = { id: callId, caller: `Caller ${Math.floor(Math.random() * 1000)}`, language: randomLang, queuePosition: callQueue.length + 1, status: 'waiting', timestamp: new Date().toLocaleTimeString() };
    setCallQueue((prev) => [...prev, newCall]);
    setCallAlerts((prev) => [...prev, { id: callId, message: `📞 Incoming call from ${newCall.caller} (${randomLang})`, timestamp: new Date().toLocaleTimeString() }]);
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
      <div style={styles.container}>
        <style>{animationStyles}</style>
        <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', borderRadius: '24px', padding: '40px', maxWidth: '400px', margin: '100px auto', boxShadow: '0 25px 80px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', width: '90%', boxSizing: 'border-box' }}>
          <h1 style={{ textAlign: 'center', color: '#fff', marginBottom: '5px' }}>🌐 LingoLink AI</h1>
          <p style={{ textAlign: 'center', color: '#999', marginBottom: '25px' }}>Enterprise AI Translation</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
            <button onClick={() => setShowLogin(true)} style={styles.tabButton(showLogin)}>Login</button>
            <button onClick={() => setShowLogin(false)} style={styles.tabButton(!showLogin)}>Register</button>
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
      <style>{animationStyles}</style>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={{ margin: 0, fontSize: '22px' }}>🌐 LingoLink AI</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>👤 {username} {isPremium ? '⭐' : ''}</span>
            <button onClick={handleLogout} style={{ padding: '8px 15px', background: 'rgba(231,76,60,0.8)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Logout</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('translate')} style={styles.tabButton(activeTab === 'translate')}><span className="tab-btn-text">🌐 Translate</span></button>
          <button onClick={() => { setActiveTab('history'); fetchHistory(); }} style={styles.tabButton(activeTab === 'history')}><span className="tab-btn-text">📜 History</span></button>
          <button onClick={() => setActiveTab('callcenter')} style={styles.tabButton(activeTab === 'callcenter')}><span className="tab-btn-text">📞 Call Center</span></button>
          <button onClick={() => setActiveTab('video')} style={styles.tabButton(activeTab === 'video')}><span className="tab-btn-text">🎬 Video</span></button>
          {username === 'admin' && (
            <button onClick={() => { setActiveTab('admin'); fetchAdminDashboard(); fetchAdminUsers(); fetchAgentMetrics(); }} style={styles.tabButton(activeTab === 'admin')}><span className="tab-btn-text">⚙️ Admin</span></button>
          )}
        </div>

        {activeTab === 'admin' ? (
          <div>
            <h2 style={{ marginBottom: '20px', color: '#fff', fontSize: '24px' }}>⚙️ Admin & Analytics Dashboard</h2>

            {adminDashboard && (
              <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '14px', textAlign: 'center', animation: 'pulse 2s infinite' }}>
                  <p style={{ fontSize: '32px', margin: 0, color: '#fff', fontWeight: 'bold' }}>{adminDashboard.total_users}</p>
                  <small style={{ color: 'rgba(255,255,255,0.8)' }}>👥 Users</small>
                </div>
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)', borderRadius: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '32px', margin: 0, color: '#fff', fontWeight: 'bold' }}>{adminDashboard.premium_users}</p>
                  <small style={{ color: 'rgba(255,255,255,0.8)' }}>⭐ Premium</small>
                </div>
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)', borderRadius: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '32px', margin: 0, color: '#fff', fontWeight: 'bold' }}>{adminDashboard.total_translations}</p>
                  <small style={{ color: 'rgba(255,255,255,0.8)' }}>🌐 Translations</small>
                </div>
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)', borderRadius: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '32px', margin: 0, color: '#fff', fontWeight: 'bold' }}>${adminDashboard.billing_estimate}</p>
                  <small style={{ color: 'rgba(255,255,255,0.8)' }}>💰 Revenue</small>
                </div>
              </div>
            )}

            {adminDashboard && (
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', marginBottom: '25px' }}>
                <h3 style={{ color: '#fff', margin: '0 0 15px', fontSize: '18px' }}>📊 Billing Meters</h3>
                {[
                  { label: 'Text', count: adminDashboard.text_translations, color: '#667eea' },
                  { label: 'Voice', count: adminDashboard.voice_translations, color: '#8e44ad' },
                  { label: 'Video', count: adminDashboard.video_translations, color: '#e74c3c' },
                ].map((item) => (
                  <div key={item.label} style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', marginBottom: '5px' }}><span>{item.label}</span><span>{item.count}</span></div>
                    <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ width: `${adminDashboard.total_translations > 0 ? (item.count / adminDashboard.total_translations) * 100 : 0}%`, height: '100%', background: item.color, borderRadius: '5px', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '80px', textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px' }}><p style={{ fontSize: '20px', margin: 0, color: '#27ae60' }}>{adminDashboard.today_translations}</p><small style={{ color: '#999' }}>Today</small></div>
                  <div style={{ flex: 1, minWidth: '80px', textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px' }}><p style={{ fontSize: '20px', margin: 0, color: '#667eea' }}>{adminDashboard.week_translations}</p><small style={{ color: '#999' }}>Week</small></div>
                  <div style={{ flex: 1, minWidth: '80px', textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px' }}><p style={{ fontSize: '20px', margin: 0, color: '#f39c12' }}>{adminDashboard.free_users}</p><small style={{ color: '#999' }}>Free</small></div>
                </div>
              </div>
            )}

            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', marginBottom: '25px' }}>
              <h3 style={{ color: '#fff', margin: '0 0 15px' }}>🔐 Tenant Access</h3>
              {adminUsers.length === 0 ? <p style={{ color: '#999' }}>No users</p> : adminUsers.map((user: any) => (
                <div key={user.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', flexWrap: 'wrap', gap: '8px' }}>
                  <div><strong>{user.username}</strong> {user.is_admin && '(Admin)'}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', background: user.is_premium ? 'rgba(39,174,96,0.3)' : 'rgba(255,255,255,0.1)', color: user.is_premium ? '#27ae60' : '#999' }}>{user.is_premium ? '⭐' : 'Free'}</span>
                    <button onClick={async () => { try { await axios.delete(`${API_URL}/admin/users/${user.id}`, { headers: { Authorization: `Bearer ${token}` } }); fetchAdminUsers(); } catch (e) {} }} style={{ padding: '6px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', marginBottom: '25px' }}>
              <h3 style={{ color: '#fff', margin: '0 0 15px' }}>📈 Agent Metrics</h3>
              {agentMetrics.length === 0 ? <p style={{ color: '#999' }}>No agents</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '14px' }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}><th style={{ padding: '8px', textAlign: 'left' }}>Agent</th><th style={{ padding: '8px', textAlign: 'left' }}>Translations</th><th style={{ padding: '8px', textAlign: 'left' }}>Status</th></tr></thead>
                    <tbody>{agentMetrics.map((agent: any) => (
                      <tr key={agent.agent_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px' }}>{agent.username}</td>
                        <td style={{ padding: '8px' }}>{agent.total_translations}</td>
                        <td style={{ padding: '8px' }}><span style={{ color: agent.status === 'active' ? '#27ae60' : '#e74c3c' }}>{agent.status}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px' }}>
              <h3 style={{ color: '#fff', margin: '0 0 15px' }}>📥 Downloads</h3>
              <div className="stack-mobile" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
              <p style={{ color: '#999' }}>.mp4, .mov</p>
              <input id="video-input" type="file" accept="video/*,.mp4,.mov" style={{ display: 'none' }} onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
            </div>
            {videoFile && (
              <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ color: '#fff' }}><strong>📄 {videoFile.name}</strong></div>
                <button onClick={handleVideoUpload} disabled={videoLoading} style={{ ...styles.button, background: '#667eea', color: 'white' }}>{videoLoading ? '⏳...' : '📤 Process'}</button>
              </div>
            )}
            {videoResult && (
              <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(255,255,255,0.08)', borderRadius: '14px' }}>
                <h3 style={{ color: '#fff' }}>📝 Results</h3>
                <p style={{ color: '#fff' }}>Detected: {videoResult.detected_language}</p>
                <p style={{ color: '#fff' }}>Segments: {videoResult.segment_count}</p>
                <p style={{ color: '#e0e0e0' }}>{videoResult.translated_text}</p>
              </div>
            )}
          </div>
        ) : activeTab === 'callcenter' ? (
          <div>
            <h2 style={{ marginBottom: '20px', color: '#fff' }}>📞 Call Center</h2>
            <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(102,126,234,0.15)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ color: '#fff' }}><strong>WebRTC:</strong> <span style={{ color: webrtcStatus === 'Connected' ? '#27ae60' : '#e74c3c' }}>{webrtcStatus}</span></div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {!socket ? <button onClick={connectWebRTC} style={{ ...styles.button, background: '#27ae60', color: 'white' }}>Connect</button> : <button onClick={disconnectWebRTC} style={{ ...styles.button, background: '#e74c3c', color: 'white' }}>Disconnect</button>}
                <button onClick={simulatePSTNCall} style={{ ...styles.button, background: '#f39c12', color: 'white' }}>PSTN Call</button>
              </div>
            </div>
            <div className="stack-mobile" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
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
                {!activeCall ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                    <button onClick={simulateIncomingCall} style={{ ...styles.button, background: '#667eea', color: 'white' }}>📞 Simulate Call</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: '#fff', marginBottom: '10px' }}><strong>{activeCall.caller}</strong> — {activeCall.language}</div>
                    {transcript.map((line, idx) => (
                      <div key={idx} style={{ padding: '10px', background: line.speaker === 'Caller' ? 'rgba(227,242,253,0.15)' : 'rgba(232,245,233,0.15)', borderRadius: '8px', marginBottom: '6px', color: '#fff' }}>
                        <strong>{line.speaker}</strong>: {line.text}
                      </div>
                    ))}
                    <button onClick={endCall} style={{ ...styles.button, background: '#e74c3c', color: 'white', marginTop: '10px' }}>End Call</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'translate' ? (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} style={styles.select}>{renderOptions(true)}</select>
              <span style={{ fontSize: '20px', color: '#fff' }}>→</span>
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} style={styles.select}>{renderOptions(false)}</select>
            </div>
            <textarea className="textarea-resp" value={sourceText} onChange={(e) => { setSourceText(e.target.value); autoTranslateText(e.target.value); }} placeholder="Type here or click the mic..." style={styles.textarea} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
              <button onClick={() => setAutoTranslate(!autoTranslate)} style={{ ...styles.button, flex: 1, minWidth: '100px', background: autoTranslate ? '#27ae60' : 'rgba(255,255,255,0.1)', color: 'white' }}>{autoTranslate ? '⚡ Auto ON' : '⚡ Auto OFF'}</button>
              <button onClick={() => setVoiceMode(!voiceMode)} style={{ ...styles.button, flex: 1, minWidth: '100px', background: voiceMode ? '#8e44ad' : 'rgba(255,255,255,0.1)', color: 'white' }}>{voiceMode ? '🔊 Voice-to-Voice' : '🎤 Voice-to-Text'}</button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button onClick={recording ? stopRecording : startRecording} style={{ ...styles.button, flex: 1, minWidth: '100px', background: recording ? '#e74c3c' : '#f39c12', color: 'white' }}>{recording ? '🛑 Stop' : '🎤 Speak'}</button>
              <button onClick={handleTranslate} disabled={loading || !sourceText} style={{ ...styles.button, flex: 1, minWidth: '100px', background: '#667eea', color: 'white' }}>{loading ? '⏳...' : '🌐 Translate'}</button>
            </div>
            {voiceNote && <div style={{ padding: '12px', background: 'rgba(255,243,205,0.15)', borderRadius: '8px', marginTop: '15px', fontSize: '13px', color: '#f39c12' }}>{voiceNote}</div>}
            {translatedText && (
              <div style={styles.resultCard}>
                <h3 style={{ color: '#fff' }}>✨ Translation:</h3>
                <p style={{ fontSize: '18px', color: '#fff' }}>{translatedText}</p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                  <label style={{ color: '#999' }}>Voice:</label>
                  <select value={voiceType} onChange={(e) => setVoiceType(e.target.value)} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <option value="female">👩 Female</option>
                    <option value="male">👨 Male</option>
                  </select>
                </div>
                <button onClick={speakTranslation} disabled={speaking} style={{ ...styles.button, marginTop: '15px', width: '100%', background: '#27ae60', color: 'white' }}>{speaking ? '🔊 Playing...' : '🔊 Hear Translation'}</button>
                {translatedAudioURL && <audio controls src={translatedAudioURL} style={{ width: '100%', marginTop: '10px' }} />}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 style={{ color: '#fff' }}>📜 History</h2>
            {history.length === 0 ? <p style={{ textAlign: 'center', color: '#999' }}>No translations yet.</p> : history.map((item) => (
              <div key={item.id} style={{ padding: '15px', marginBottom: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', color: '#fff', flexWrap: 'wrap', gap: '8px' }}>
                <div><p style={{ fontWeight: 'bold', margin: 0 }}>{item.source_text}</p><p style={{ color: '#667eea', margin: '5px 0 0' }}>{item.translated_text}</p></div>
                <button onClick={() => deleteTranslation(item.id)} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;