import React, { useState, useRef } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [showLogin, setShowLogin] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [activeTab, setActiveTab] = useState('translate');
  const [history, setHistory] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [videoResult, setVideoResult] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('es');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [langA, setLangA] = useState('en');
  const [langB, setLangB] = useState('es');
  const [currentSpeaker, setCurrentSpeaker] = useState('A');
  const [audioURL, setAudioURL] = useState(null);
  const [translatedAudioURL, setTranslatedAudioURL] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const fetchHistory = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/translate/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(response.data);
    } catch (error) {
      console.error('History error:', error);
    }
  };

  const handleLogin = async () => {
    try {
      const formData = new URLSearchParams();
      formData.append('username', loginUsername);
      formData.append('password', loginPassword);

      const response = await axios.post(`${API_URL}/auth/login`, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      setToken(response.data.access_token);
      setUsername(response.data.username);
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('username', response.data.username);
      setLoginUsername('');
      setLoginPassword('');
    } catch (error) {
      alert('Login failed: ' + (error.response?.data?.detail || 'Unknown error'));
    }
  };

  const handleRegister = async () => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        username: regUsername,
        email: regEmail,
        password: regPassword
      });

      alert('Registration successful! Please login.');
      setShowLogin(true);
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
    } catch (error) {
      alert('Registration failed: ' + (error.response?.data?.detail || 'Unknown error'));
    }
  };

  const handleLogout = () => {
    setToken('');
    setUsername('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setSourceText('');
    setTranslatedText('');
    setHistory([]);
    setVideoResult(null);
    setVideoFile(null);
  };

  const handleTranslate = async () => {
    if (!sourceText || !token) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/translate/text`, {
        text: sourceText,
        source_language: sourceLang,
        target_language: targetLang,
        user_id: 1
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTranslatedText(response.data.translated_text);
      fetchHistory();
    } catch (error) {
      console.error('Translation error:', error);
      alert('Translation failed: ' + (error.response?.data?.detail || 'Unknown error'));
    }
    setLoading(false);
  };

  const speakTranslation = async () => {
    if (!translatedText) return;
    setSpeaking(true);
    try {
      const response = await axios.post(
        `${API_URL}/tts/speak?text=${encodeURIComponent(translatedText)}&language=${targetLang}`,
        null,
        { responseType: 'blob' }
      );

      const audioUrl = URL.createObjectURL(response.data);
      setTranslatedAudioURL(audioUrl);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      alert('Could not play audio.');
    }
    setSpeaking(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        setRecording(false);
        if (conversationMode) {
          await sendConversationAudio(audioBlob);
        } else if (voiceMode) {
          await sendAudioForVoiceTranslation(audioBlob);
        } else {
          await sendAudioForTranscription(audioBlob);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      alert('Could not access microphone. Please allow microphone access.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const sendConversationAudio = async (audioBlob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.wav');

      const sourceLangForThis = currentSpeaker === 'A' ? langA : langB;
      const targetLangForThis = currentSpeaker === 'A' ? langB : langA;

      const response = await axios.post(`${API_URL}/speech/voice-to-voice`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        params: {
          source_language: sourceLangForThis,
          target_language: targetLangForThis
        }
      });

      const data = response.data;
      setSourceText(data.original_text);
      setTranslatedText(data.translated_text);

      if (data.audio_base64) {
        const binaryString = atob(data.audio_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlobFromBase64 = new Blob([bytes], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlobFromBase64);
        setTranslatedAudioURL(audioUrl);
        const audio = new Audio(audioUrl);
        audio.play();
      }

      setCurrentSpeaker(currentSpeaker === 'A' ? 'B' : 'A');
      fetchHistory();
    } catch (error) {
      console.error('Conversation error:', error);
      alert('Conversation translation failed.');
    }
    setLoading(false);
  };

  const sendAudioForVoiceTranslation = async (audioBlob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.wav');

      const response = await axios.post(`${API_URL}/speech/voice-to-voice`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        params: {
          source_language: sourceLang,
          target_language: targetLang
        }
      });

      const data = response.data;
      setSourceText(data.original_text);
      setTranslatedText(data.translated_text);

      if (data.audio_base64) {
        const binaryString = atob(data.audio_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlobFromBase64 = new Blob([bytes], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlobFromBase64);
        setTranslatedAudioURL(audioUrl);
        const audio = new Audio(audioUrl);
        audio.play();
      }

      fetchHistory();
    } catch (error) {
      console.error('Voice translation error:', error);
      alert('Voice translation failed.');
    }
    setLoading(false);
  };

  const sendAudioForTranscription = async (audioBlob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.wav');

      const response = await axios.post(`${API_URL}/speech/transcribe`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });

      setSourceText(response.data.text);
      setSourceLang('auto');
    } catch (error) {
      console.error('Transcription error:', error);
      alert('Speech transcription failed.');
    }
    setLoading(false);
  };

  const handleVideoUpload = async () => {
    if (!videoFile) {
      alert('Please select a video file first');
      return;
    }
    setVideoLoading(true);
    setVideoResult(null);
    try {
      const formData = new FormData();
      formData.append('file', videoFile);

      const response = await axios.post(`${API_URL}/video/extract-subtitles`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        params: {
          target_language: targetLang
        }
      });

      setVideoResult(response.data);
    } catch (error) {
      console.error('Video upload error:', error);
      alert('Video processing failed: ' + (error.response?.data?.detail || 'Unknown error'));
    }
    setVideoLoading(false);
  };

  const deleteTranslation = async (id) => {
    try {
      await axios.delete(`${API_URL}/translate/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchHistory();
    } catch (error) {
      alert('Delete failed');
    }
  };

  if (!token) {
    return (
      <div style={{ padding: '30px', maxWidth: '500px', margin: '50px auto', fontFamily: 'Arial' }}>
        <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>🌐 LingoLink AI</h1>
        <p style={{ textAlign: 'center', color: '#7f8c8d' }}>Enterprise-grade AI translation platform</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => setShowLogin(true)} 
            style={{ 
              padding: '10px 20px', 
              backgroundColor: showLogin ? '#3498db' : '#bdc3c7', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px', 
              cursor: 'pointer' 
            }}
          >
            Login
          </button>
          <button 
            onClick={() => setShowLogin(false)} 
            style={{ 
              padding: '10px 20px', 
              backgroundColor: !showLogin ? '#3498db' : '#bdc3c7', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px', 
              cursor: 'pointer' 
            }}
          >
            Register
          </button>
        </div>

        {showLogin ? (
          <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h2 style={{ marginBottom: '15px' }}>Login</h2>
            <input
              type="text"
              placeholder="Username"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button
              onClick={handleLogin}
              style={{ width: '100%', padding: '12px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
            >
              Login
            </button>
          </div>
        ) : (
          <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h2 style={{ marginBottom: '15px' }}>Register</h2>
            <input
              type="text"
              placeholder="Username"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input
              type="email"
              placeholder="Email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button
              onClick={handleRegister}
              style={{ width: '100%', padding: '12px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
            >
              Register
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '30px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Arial' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>🌐 LingoLink AI</h1>
        <div>
          <span style={{ marginRight: '10px', color: '#7f8c8d' }}>👤 {username}</span>
          <button
            onClick={handleLogout}
            style={{ padding: '8px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('translate')}
          style={{ flex: 1, padding: '12px', backgroundColor: activeTab === 'translate' ? '#3498db' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
        >
          Translate
        </button>
        <button
          onClick={() => { setActiveTab('history'); fetchHistory(); }}
          style={{ flex: 1, padding: '12px', backgroundColor: activeTab === 'history' ? '#3498db' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('video')}
          style={{ flex: 1, padding: '12px', backgroundColor: activeTab === 'video' ? '#3498db' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
        >
          Video
        </button>
      </div>

      {activeTab === 'video' ? (
        <div>
          <h2 style={{ marginBottom: '20px', color: '#2c3e50' }}>🎬 Video Subtitle Studio</h2>
          
          <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '20px' }}>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files[0])}
              style={{ marginBottom: '15px', width: '100%' }}
            />
            
            <select 
              value={targetLang} 
              onChange={(e) => setTargetLang(e.target.value)} 
              style={{ width: '100%', padding: '10px', marginBottom: '15px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="sw">Swahili</option>
              <option value="lg">Luganda</option>
            </select>

            <button
              onClick={handleVideoUpload}
              disabled={videoLoading || !videoFile}
              style={{ width: '100%', padding: '12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
            >
              {videoLoading ? 'Processing video...' : 'Extract Subtitles'}
            </button>
          </div>

          {videoResult && (
            <div style={{ padding: '20px', backgroundColor: '#f0f4f8', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '15px' }}>📝 Results</h3>
              <p><strong>Detected Language:</strong> {videoResult.detected_language}</p>
              <p><strong>Segments:</strong> {videoResult.segment_count}</p>
              <p><strong>Video Duration:</strong> {Math.round(videoResult.video_duration)} seconds</p>
              
              <h4 style={{ marginTop: '20px', marginBottom: '10px' }}>Translated Text:</h4>
              <p style={{ fontSize: '16px', color: '#34495e' }}>{videoResult.translated_text}</p>
            </div>
          )}
        </div>
      ) : activeTab === 'translate' ? (
        <>
          {conversationMode && (
            <div style={{ padding: '15px', backgroundColor: '#fff3e0', borderRadius: '8px', marginBottom: '15px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#e67e22' }}>
                💬 Conversation Mode — {currentSpeaker === 'A' ? 'Person A speaking' : 'Person B speaking'}
              </p>
              <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#7f8c8d' }}>
                {langA} ↔ {langB}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
            <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} style={{ padding: '10px', fontSize: '16px' }}>
              <option value="auto">Auto Detect</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="sw">Swahili</option>
              <option value="lg">Luganda</option>
              <option value="ar">Arabic</option>
              <option value="ru">Russian</option>
              <option value="hi">Hindi</option>
              <option value="am">Amharic</option>
              <option value="ha">Hausa</option>
              <option value="yo">Yoruba</option>
              <option value="ig">Igbo</option>
              <option value="zu">Zulu</option>
            </select>
            
            <span style={{ fontSize: '24px', alignSelf: 'center' }}>→</span>
            
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} style={{ padding: '10px', fontSize: '16px' }}>
              <option value="es">Spanish</option>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="sw">Swahili</option>
              <option value="lg">Luganda</option>
              <option value="ar">Arabic</option>
              <option value="ru">Russian</option>
              <option value="hi">Hindi</option>
              <option value="am">Amharic</option>
              <option value="ha">Hausa</option>
              <option value="yo">Yoruba</option>
              <option value="ig">Igbo</option>
              <option value="zu">Zulu</option>
            </select>
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Enter text or click the microphone to speak..."
            style={{ width: '100%', height: '150px', marginBottom: '10px', padding: '15px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
          />

          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <button
              onClick={() => setVoiceMode(!voiceMode)}
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '14px',
                backgroundColor: voiceMode ? '#8e44ad' : '#bdc3c7',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {voiceMode ? '🔊 Voice-to-Voice: ON' : '🎤 Voice-to-Text: ON'}
            </button>

            <button
              onClick={() => setConversationMode(!conversationMode)}
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '14px',
                backgroundColor: conversationMode ? '#e67e22' : '#bdc3c7',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {conversationMode ? '💬 Conversation: ON' : '💬 Conversation: OFF'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <button
              onClick={recording ? stopRecording : startRecording}
              style={{
                flex: 1,
                padding: '15px',
                fontSize: '18px',
                backgroundColor: recording ? '#e74c3c' : '#f39c12',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {recording ? '🛑 Stop' : '🎤 Speak'}
            </button>

            <button
              onClick={handleTranslate}
              disabled={loading || !sourceText}
              style={{
                flex: 1,
                padding: '15px',
                fontSize: '18px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {loading ? 'Working...' : 'Translate'}
            </button>
          </div>

          {audioURL && (
            <div style={{ marginBottom: '10px' }}>
              <audio controls src={audioURL} style={{ width: '100%' }} />
            </div>
          )}

          {translatedText && (
            <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f0f4f8', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '10px', color: '#2c3e50' }}>Translation:</h3>
              <p style={{ fontSize: '20px', color: '#34495e' }}>{translatedText}</p>
              
              <button
                onClick={speakTranslation}
                disabled={speaking}
                style={{
                  marginTop: '10px',
                  padding: '12px 20px',
                  fontSize: '16px',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {speaking ? '🔊 Playing...' : '🔊 Hear Translation'}
              </button>

              {translatedAudioURL && (
                <audio controls src={translatedAudioURL} style={{ width: '100%', marginTop: '10px' }} />
              )}
            </div>
          )}
        </>
      ) : (
        <div>
          <h2 style={{ marginBottom: '20px', color: '#2c3e50' }}>📜 Translation History</h2>
          
          {history.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#7f8c8d', padding: '40px' }}>No translations yet.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} style={{ padding: '15px', marginBottom: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '16px' }}><strong>{item.source_text}</strong></p>
                  <p style={{ margin: '5px 0 0', fontSize: '16px', color: '#3498db' }}>{item.translated_text}</p>
                  <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#7f8c8d' }}>
                    {item.source_language} → {item.target_language} • {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteTranslation(item.id)}
                  style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default App;