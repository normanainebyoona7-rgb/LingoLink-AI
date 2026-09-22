import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import Icon from '../components/Icon';

interface Props {
  token: string;
}

interface Call {
  id: number;
  caller: string;
  language: string;
  duration: string;
  status: 'ringing' | 'active' | 'ended';
  transcript: { speaker: string; text: string; language: string }[];
}

export default function CallCenter({ token }: Props) {
  const { darkMode } = useTheme();
  const [callQueue, setCallQueue] = useState<Call[]>([]);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  const [callTimer, setCallTimer] = useState(0);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const languages = ['Luganda', 'Swahili', 'Acholi', 'English', 'Alur', 'Ateso'];
  const callers = ['John Mukasa', 'Sarah Achieng', 'Peter Okello', 'Grace Nakato', 'David Ochen'];

  const aiResponses: Record<string, string[]> = {
    'Luganda': [
      'Wasuze otya! Nze ndi assistenti wa LingoLink AI. Nsobola kukuyamba ki olwaleero?',
      'Webale kukyala. Osobola okwogera mpola?',
      'Ntegeera bulungi. Ka nkuyambe.',
    ],
    'Swahili': [
      'Habari! Mimi ni msaidizi wa LingoLink AI. Ninawezaje kukusaidia leo?',
      'Asante kwa kupiga simu. Unaweza kuzungumza polepole?',
      'Nimeelewa vizuri. Ngoja nikusaidie.',
    ],
    'Acholi': [
      'Kop anga! An atero kony pa LingoLink AI. Amito konyi nining tin?',
      'Apwoyo pi lwongo. Itwero lok mot mot?',
      'Aniang maber. Wek akonyi.',
    ],
    'English': [
      'Hello! I am the LingoLink AI assistant. How can I help you today?',
      'Thank you for calling. Could you speak slowly please?',
      'I understand perfectly. Let me help you.',
    ],
    'Alur': [
      'Kop anga! An atye jakony pa LingoLink AI. Amito konyi nining?',
      'Apwoyo pi lwongo. Itwero lok mot?',
      'Aniang maber. Wek akonyi.',
    ],
    'Ateso': [
      'Ejoka! Arai ekonikiro ka LingoLink AI. Akipak konyi nai?',
      'Alakara pi elomit. Iboi bok bok?',
      'Ayenun noi. Akipak konyi.',
    ],
  };

  const ttsLanguageCodes: Record<string, string> = {
    'Luganda': 'luganda',
    'Swahili': 'swahili',
    'Acholi': 'acholi',
    'English': 'english',
    'Alur': 'alur',
    'Ateso': 'ateso',
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const simulateIncomingCall = () => {
    const randomLang = languages[Math.floor(Math.random() * languages.length)];
    const randomCaller = callers[Math.floor(Math.random() * callers.length)];
    const newCall: Call = {
      id: Date.now(),
      caller: randomCaller,
      language: randomLang,
      duration: '00:00',
      status: 'ringing',
      transcript: [],
    };
    setCallQueue(prev => [...prev, newCall]);

    if (autoAnswer) {
      setTimeout(() => {
        acceptCall(newCall.id);
      }, 2000);
    }
  };

  const acceptCall = (callId: number) => {
    const call = callQueue.find(c => c.id === callId) || callQueue[0];
    if (!call) return;

    const initialTranscript = [
      { speaker: call.caller, text: 'Hello! I need help with translation', language: call.language },
    ];

    const activeCallData: Call = {
      ...call,
      status: 'active',
      transcript: initialTranscript,
    };

    setActiveCall(activeCallData);
    setCallQueue(prev => prev.filter(c => c.id !== callId));

    setCallTimer(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCallTimer(prev => prev + 1);
    }, 1000);

    aiRespond(activeCallData);
  };

  const aiRespond = (call: Call) => {
    setAiProcessing(true);

    setTimeout(() => {
      const responses = aiResponses[call.language] || aiResponses['English'];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      setActiveCall(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          transcript: [...prev.transcript, {
            speaker: 'AI Assistant',
            text: randomResponse,
            language: call.language,
          }],
        };
      });
      setAiProcessing(false);

      speakResponse(randomResponse, call.language);
    }, 2000);
  };

  const speakResponse = async (text: string, language: string) => {
    const ttsLang = ttsLanguageCodes[language] || 'english';
    try {
      const res = await fetch(`${API_URL}/tts/speak?text=${encodeURIComponent(text)}&language=${ttsLang}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          setIsSpeaking(true);
        }
      }
    } catch (err) {
      console.error('TTS failed:', err);
    }
  };

  const endCall = () => {
    if (activeCall) {
      const endedCall: Call = {
        ...activeCall,
        status: 'ended',
        duration: formatTime(callTimer),
      };
      setCallHistory(prev => [endedCall, ...prev]);
      setActiveCall(null);
      if (timerRef.current) clearInterval(timerRef.current);
      setCallTimer(0);
      setIsSpeaking(false);
      if (audioRef.current) audioRef.current.pause();
    }
  };

  const declineCall = (callId: number) => {
    setCallQueue(prev => prev.filter(c => c.id !== callId));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className={`cc-root ${darkMode ? 'cc-dark' : 'cc-light'}`}>
      <div className="cc-header">
        <h2><Icon name="callcenter" size={22} /> AI Call Center</h2>
        <p>AI auto-answers and responds in caller's language with voice</p>
        <div className="cc-auto-answer-toggle">
          <span><Icon name="bot" size={16} /> Auto-Answer</span>
          <button
            className={`slider-toggle ${autoAnswer ? 'on' : 'off'}`}
            onClick={() => setAutoAnswer(!autoAnswer)}
          >
            <span className="slider-knob"></span>
          </button>
        </div>
        <button className="cc-simulate-btn" onClick={simulateIncomingCall}>
          <Icon name="callcenter" size={16} /> Simulate Incoming Call
        </button>
      </div>

      {activeCall && (
        <div className="cc-active-call">
          <div className="cc-active-header">
            <div className="cc-caller-info">
              <span className="cc-avatar"><Icon name="user" size={20} /></span>
              <div>
                <h3>{activeCall.caller}</h3>
                <span className="cc-status-active">
                  <Icon name="circle-filled" size={8} /> Active — {formatTime(callTimer)}
                </span>
              </div>
            </div>
            <div className="cc-controls">
              {isSpeaking && (
                <span className="cc-speaking-indicator">
                  <Icon name="speaker" size={16} /> AI Speaking...
                </span>
              )}
              <button className="cc-end-btn" onClick={endCall}>
                <Icon name="phone-off" size={16} /> End Call
              </button>
            </div>
          </div>
          <div className="cc-language-bar">
            <span><Icon name="message-circle" size={14} /> Caller: {activeCall.language}</span>
            <span className="cc-lang-arrow">→</span>
            <span><Icon name="bot" size={14} /> AI Responds in: {activeCall.language} (with audio)</span>
          </div>
          <div className="cc-transcript">
            {activeCall.transcript.map((line, index) => (
              <div key={index} className={`cc-transcript-line ${line.speaker === 'AI Assistant' ? 'cc-ai' : 'cc-caller-line'}`}>
                <span className="cc-speaker">{line.speaker}:</span>
                <span className="cc-text">{line.text}</span>
                <span className="cc-line-lang">{line.language}</span>
              </div>
            ))}
            {aiProcessing && (
              <div className="cc-ai-thinking">
                <span className="cc-thinking-dot"></span>
                <span>AI is thinking...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cc-queue-section">
        <h3><Icon name="file-text" size={18} /> Call Queue ({callQueue.length})</h3>
        {callQueue.length === 0 ? (
          <p className="cc-empty">No calls in queue — AI will auto-answer incoming calls</p>
        ) : (
          callQueue.map((call) => (
            <div key={call.id} className="cc-queue-item">
              <span className="cc-avatar"><Icon name="user" size={20} /></span>
              <div className="cc-queue-info">
                <p className="cc-queue-caller">{call.caller}</p>
                <span className="cc-queue-lang">
                  <Icon name="message-circle" size={14} /> {call.language}
                </span>
              </div>
              <span className="cc-ringing">
                <Icon name="bell" size={14} /> Auto-answering...
              </span>
              <div className="cc-queue-actions">
                <button className="cc-accept-btn" onClick={() => acceptCall(call.id)}>
                  <Icon name="check" size={14} /> Answer Now
                </button>
                <button className="cc-decline-btn" onClick={() => declineCall(call.id)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cc-history-section">
        <h3><Icon name="clock" size={18} /> Call History ({callHistory.length})</h3>
        {callHistory.length === 0 ? (
          <p className="cc-empty">No previous calls</p>
        ) : (
          callHistory.map((call) => (
            <div key={call.id} className="cc-history-item">
              <span className="cc-avatar"><Icon name="user" size={20} /></span>
              <div className="cc-history-info">
                <p className="cc-history-caller">{call.caller}</p>
                <span className="cc-history-lang">{call.language} → AI Auto-Translated + Voice</span>
              </div>
              <span className="cc-history-duration">
                <Icon name="clock" size={14} /> {call.duration}
              </span>
              <span className="cc-history-status">
                <Icon name="check" size={14} /> Completed
              </span>
            </div>
          ))
        )}
      </div>

      <audio
        ref={audioRef}
        onEnded={() => setIsSpeaking(false)}
        style={{ display: 'none' }}
      />
    </div>
  );
}