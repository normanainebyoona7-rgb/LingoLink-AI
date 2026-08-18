import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('es');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    if (!sourceText) return;
    setLoading(true);
    try {
      const response = await axios.post('http://127.0.0.1:8000/translate/text', {
        text: sourceText,
        source_language: sourceLang,
        target_language: targetLang,
        user_id: 1
      });
      setTranslatedText(response.data.translated_text);
    } catch (error) {
      console.error('Translation error:', error);
      alert('Translation failed. Make sure the backend server is running.');
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', fontFamily: 'Arial' }}>
      <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>🌐 LingoLink AI Translator</h1>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
        <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} style={{ padding: '10px', fontSize: '16px' }}>
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
        </select>
      </div>

      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Enter text to translate..."
        style={{ width: '100%', height: '150px', marginBottom: '10px', padding: '15px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
      />

      <button
        onClick={handleTranslate}
        disabled={loading || !sourceText}
        style={{
          width: '100%',
          padding: '15px',
          fontSize: '18px',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Translating...' : 'Translate'}
      </button>

      {translatedText && (
        <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f0f4f8', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '10px', color: '#2c3e50' }}>Translation:</h3>
          <p style={{ fontSize: '20px', color: '#34495e' }}>{translatedText}</p>
        </div>
      )}
    </div>
  );
}

export default App;