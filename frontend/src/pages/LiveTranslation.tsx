import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import SearchableDropdown from '../components/SearchableDropdown';
import Icon from '../components/Icon';
import AudioVisualizer from '../components/AudioVisualizer';

interface Props {
  token: string;
}

export default function LiveTranslation({ token }: Props) {
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('english');
  const [isRecording, setIsRecording] = useState(false);
  const [subtitles, setSubtitles] = useState<{ original: string; translated: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [subtitles]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          chunksRef.current = [];
          await processAudioChunk(blob);
        }
      };

      mediaRecorder.start(4000);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Microphone access denied. Please allow permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const processAudioChunk = async (audioBlob: Blob) => {
    if (audioBlob.size < 2000) return;
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('language', sourceLanguage);

      const transcribeRes = await fetch(`${API_URL}/speech/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const transcribeData = await transcribeRes.json();
      const text = transcribeData.text || transcribeData.transcribed_text || '';

      if (!text.trim()) {
        setIsProcessing(false);
        return;
      }

      const translateRes = await fetch(`${API_URL}/translate/text`, {
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

      if (translateRes.ok) {
        const translateData = await translateRes.json();
        setSubtitles((prev) => [
          ...prev,
          { original: text, translated: translateData.translated_text },
        ]);
      }
    } catch (err) {
      console.error('Live processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearSubtitles = () => {
    setSubtitles([]);
  };

  return (
    <div className="live-root savanna-theme" style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '0 0 8px 0', fontSize: '24px' }}>
          <Icon name="live" size={24} /> Live Translation
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Tap Start, and the AI will automatically listen and translate in real-time.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', justifyContent: 'center' }}>
        <div style={{ flex: 1 }}>
          <SearchableDropdown
            value={sourceLanguage}
            onChange={setSourceLanguage}
            placeholder="source language"
            includeAutoDetect
          />
        </div>
        <button className="swap-btn" onClick={() => {
          if (sourceLanguage !== 'auto') {
            const temp = sourceLanguage;
            setSourceLanguage(targetLanguage);
            setTargetLanguage(temp);
          }
        }}>
          <Icon name="swap" size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <SearchableDropdown
            value={targetLanguage}
            onChange={setTargetLanguage}
            placeholder="target language"
          />
        </div>
      </div>

      {/* Fixed Alignment for the Start/Stop Button */}
      <div 
        className="live-mic-section"
        style={{ 
          position: 'relative', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '150px',
          marginBottom: '24px',
          width: '100%'
        }}
      >
        {isRecording && <AudioVisualizer isRecording={true} />}
        
        <button
          onClick={toggleRecording}
          style={{
            position: 'relative',
            zIndex: 10,
            padding: '16px 32px',
            fontSize: '16px',
            fontWeight: 'bold',
            borderRadius: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: isRecording ? '#ef4444' : 'linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-hover) 100%)',
            color: '#ffffff',
            border: 'none',
            boxShadow: isRecording ? '0 0 20px rgba(239, 68, 68, 0.5)' : '0 4px 12px rgba(245, 158, 11, 0.3)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            width: 'auto',
            maxWidth: '300px'
          }}
        >
          <Icon name={isRecording ? 'mic-off' : 'mic'} size={20} />
          {isRecording ? 'Stop Live Recording' : 'Start Live Translation'}
        </button>
      </div>

      <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--gold-primary)' }}>Live Transcript</h3>
          <button className="clear-btn" onClick={clearSubtitles} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
            <Icon name="trash" size={16} /> Clear
          </button>
        </div>
        
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {subtitles.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              Tap "Start Live Translation" and begin speaking...
            </p>
          ) : (
            subtitles.map((sub, idx) => (
              <div key={idx} style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: '12px', borderLeft: '4px solid var(--gold-primary)' }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>{sub.original}</p>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-main)' }}>{sub.translated}</p>
              </div>
            ))
          )}
          {isProcessing && (
            <div style={{ textAlign: 'center', color: 'var(--gold-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <Icon name="loader" size={20} className="spin" /> Listening & Translating...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}