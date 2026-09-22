import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import Icon from '../components/Icon';

interface Props {
  token: string;
}

interface Subtitle {
  id: number;
  startTime: number;
  endTime: number;
  originalText: string;
  translatedText: string;
}

export default function Video({ token }: Props) {
  const { darkMode } = useTheme();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [subtitleLanguage, setSubtitleLanguage] = useState('luganda');
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<Subtitle | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitlesRef = useRef<Subtitle[]>([]);
  const hasProcessedRef = useRef(false);

  const languages = [
    { code: 'luganda', name: 'Luganda' },
    { code: 'swahili', name: 'Swahili' },
    { code: 'acholi', name: 'Acholi' },
    { code: 'alur', name: 'Alur' },
    { code: 'ateso', name: 'Ateso' },
    { code: 'english', name: 'English' },
    { code: 'french', name: 'French' },
    { code: 'spanish', name: 'Spanish' },
    { code: 'german', name: 'German' },
  ];

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file. Upload MP4, MOV, AVI, or WebM.');
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setVideoUrl(url);
    setError('');
    setStatus('');
    setSubtitles([]);
    setCurrentSubtitle(null);
    hasProcessedRef.current = false;

    await processVideo(file);
  };

  const processVideo = async (file: File) => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    setIsProcessing(true);
    setStatus('Extracting audio from video...');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setStatus('Transcribing video audio with AI...');

      const res = await fetch(`${API_URL}/speech/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const transcribedText = data.text || data.transcribed_text || '';

        if (transcribedText && transcribedText.trim()) {
          setStatus('Translating subtitles...');

          const sentences = transcribedText
            .replace(/([.!?])\s+/g, '$1\n')
            .split('\n')
            .filter((s: string) => s.trim().length > 0);

          const duration = videoRef.current?.duration || 60;
          const subtitleList: Subtitle[] = [];

          for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            const startTime = (i / sentences.length) * duration;
            const endTime = ((i + 1) / sentences.length) * duration;

            try {
              const translateRes = await fetch(`${API_URL}/translate/text`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  text: sentence,
                  source_language: 'auto',
                  target_language: subtitleLanguage,
                }),
              });

              if (translateRes.ok) {
                const translateData = await translateRes.json();
                subtitleList.push({
                  id: i,
                  startTime,
                  endTime,
                  originalText: sentence,
                  translatedText: translateData.translated_text || sentence,
                });
              }
            } catch {}
          }

          subtitlesRef.current = subtitleList;
          setSubtitles(subtitleList);
          setStatus(`${subtitleList.length} subtitles ready! Just play the video.`);
        } else {
          setStatus('No speech detected. Using demo subtitles.');
          generateDemoSubtitles();
        }
      } else {
        setStatus('Backend unavailable. Using demo subtitles.');
        generateDemoSubtitles();
      }
    } catch (err) {
      console.error('Processing error:', err);
      setStatus('Processing failed. Using demo subtitles.');
      generateDemoSubtitles();
    } finally {
      setIsProcessing(false);
    }
  };

  const generateDemoSubtitles = () => {
    const duration = videoRef.current?.duration || 30;
    const demoData = [
      { start: 0, end: 5, original: 'Good morning everyone, welcome to our meeting', translated: 'Wasuze otya buli omu, tukwaniriza mu lukiiko lwaffe' },
      { start: 5, end: 10, original: 'Today we will discuss the new translation features', translated: 'Olwaleero tujja kwogera ku byuma by\'okuvvuunula ebipya' },
      { start: 10, end: 15, original: 'Our platform supports over fifty languages worldwide', translated: 'Enkola yaffe ewagira ennimi ezisukka mu ataano mu nsi yonna' },
      { start: 15, end: 20, original: 'Including African languages like Luganda and Swahili', translated: 'Mwe muli ennimi z\'Africa nga Luganda ne Swahili' },
      { start: 20, end: 25, original: 'Thank you for joining us today for this session', translated: 'Webale kwegatta ku ffe olwaleero mu lukiiko luno' },
      { start: 25, end: duration, original: 'Let us begin the presentation now', translated: 'Ka tutandike okwanjula kati' },
    ];

    const subtitleList: Subtitle[] = demoData.map((item, index) => ({
      id: index,
      startTime: item.start,
      endTime: item.end,
      originalText: item.original,
      translatedText: item.translated,
    }));

    subtitlesRef.current = subtitleList;
    setSubtitles(subtitleList);
    setStatus('Demo subtitles ready! Play the video.');
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      const active = subtitlesRef.current.find(
        (sub) => time >= sub.startTime && time <= sub.endTime
      );
      setCurrentSubtitle(active || null);
    }
  };

  const handleLanguageChange = async (lang: string) => {
    setSubtitleLanguage(lang);

    if (subtitlesRef.current.length > 0) {
      setIsProcessing(true);
      setStatus('Re-translating subtitles...');

      const updatedSubtitles = await Promise.all(
        subtitlesRef.current.map(async (sub) => {
          try {
            const res = await fetch(`${API_URL}/translate/text`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                text: sub.originalText,
                source_language: 'auto',
                target_language: lang,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              return { ...sub, translatedText: data.translated_text || sub.originalText };
            }
          } catch {}
          return sub;
        })
      );

      subtitlesRef.current = updatedSubtitles;
      setSubtitles(updatedSubtitles);
      setStatus(`Subtitles re-translated to ${languages.find(l => l.code === lang)?.name}!`);
      setIsProcessing(false);
    }
  };

  return (
    <div className={`video-root ${darkMode ? 'video-dark' : 'video-light'}`}>
      <div className="video-header">
        <h2><Icon name="video" size={22} /> Video Studio</h2>
        <p>Upload video — subtitles auto-generate and translate as it plays</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {!videoUrl && (
        <div className="video-upload-area" onClick={() => fileInputRef.current?.click()}>
          <span className="video-upload-icon"><Icon name="folder" size={48} strokeWidth={1.4} /></span>
          <h3>Upload Video</h3>
          <p>MP4, MOV, AVI, WebM — subtitles auto-generate</p>
        </div>
      )}

      {isProcessing && (
        <div className="video-processing">
          <div className="processing-spinner"></div>
          <p>{status}</p>
        </div>
      )}

      {videoUrl && (
        <div className="video-player-wrapper">
          <video
            ref={videoRef}
            src={videoUrl}
            className="video-player"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            controls
          />

          {currentSubtitle && isPlaying && (
            <div className="live-subtitle-overlay">
              <div className="subtitle-original">{currentSubtitle.originalText}</div>
              <div className="subtitle-translated">{currentSubtitle.translatedText}</div>
            </div>
          )}
        </div>
      )}

      {selectedFile && (
        <div className="video-controls-bar">
          <div className="video-file-info">
            <span className="video-file-icon"><Icon name="video" size={22} /></span>
            <div>
              <p className="video-file-name">{selectedFile.name}</p>
              <span className="video-file-size">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
          </div>
          <div className="video-actions">
            <select
              value={subtitleLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="video-lang-select"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <button
              className="video-remove-btn"
              onClick={() => {
                setSelectedFile(null);
                setVideoUrl('');
                setSubtitles([]);
                setCurrentSubtitle(null);
                subtitlesRef.current = [];
                hasProcessedRef.current = false;
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      )}

      {status && !isProcessing && (
        <p className="video-success">
          {status.toLowerCase().startsWith('demo') || status.toLowerCase().startsWith('no speech') || status.toLowerCase().startsWith('backend') || status.toLowerCase().startsWith('processing failed') ? (
            <><Icon name="alert" size={16} /> {status}</>
          ) : (
            <><Icon name="check" size={16} /> {status}</>
          )}
        </p>
      )}
      {error && <p className="video-error"><Icon name="alert" size={16} /> {error}</p>}

      {subtitles.length > 0 && (
        <div className="video-subtitle-timeline">
          <h3><Icon name="file-text" size={18} /> Subtitles ({subtitles.length})</h3>
          <p className="video-timeline-hint">Subtitles appear automatically as the video plays</p>
          {subtitles.map((sub) => (
            <div
              key={sub.id}
              className={`video-timeline-item ${currentSubtitle?.id === sub.id ? 'active' : ''}`}
            >
              <span className="video-timeline-time">
                {sub.startTime.toFixed(1)}s
              </span>
              <div className="video-timeline-texts">
                <p className="video-timeline-original">{sub.originalText}</p>
                <p className="video-timeline-translated">{sub.translatedText}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}