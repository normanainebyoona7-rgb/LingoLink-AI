import React, { useState, useEffect } from 'react';

interface VoiceSettingsProps {
  language: string;
  onVoiceChange: (gender: 'male' | 'female') => void;
  onSpeedChange: (speed: number) => void;
}

const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  language,
  onVoiceChange,
  onSpeedChange,
}) => {
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [speed, setSpeed] = useState(1.0);
  const [available, setAvailable] = useState<{ male: boolean; female: boolean }>({
    male: true,
    female: true,
  });

  useEffect(() => {
    const lang = language.toLowerCase();
    if (lang === 'swahili') {
      setAvailable({ male: true, female: false });
      setGender('male');
      onVoiceChange('male');
    } else if (
      ['luganda', 'acholi', 'ateso', 'runyankole', 'runyankore', 'lugbara'].includes(lang)
    ) {
      setAvailable({ male: false, female: true });
      setGender('female');
      onVoiceChange('female');
    } else {
      setAvailable({ male: true, female: true });
    }
  }, [language]);

  const handleGender = (g: 'male' | 'female') => {
    setGender(g);
    onVoiceChange(g);
  };

  const handleSpeed = (s: number) => {
    setSpeed(s);
    onSpeedChange(s);
  };

  return (
    <div className="voice-settings-panel">
      <div className="voice-settings-row">
        <span className="voice-settings-label">Voice:</span>
        <div className="voice-settings-buttons">
          <button
            type="button"
            className={`voice-gender-btn ${gender === 'female' ? 'active' : ''}`}
            onClick={() => handleGender('female')}
            disabled={!available.female}
            title={!available.female ? 'Not available for this language' : 'Female voice'}
          >
            👩 Female
          </button>
          <button
            type="button"
            className={`voice-gender-btn ${gender === 'male' ? 'active' : ''}`}
            onClick={() => handleGender('male')}
            disabled={!available.male}
            title={!available.male ? 'Not available for this language' : 'Male voice'}
          >
            👨 Male
          </button>
        </div>
      </div>

      <div className="voice-settings-row">
        <span className="voice-settings-label">Speed:</span>
        <input
          type="range"
          min="0.7"
          max="1.3"
          step="0.1"
          value={speed}
          onChange={(e) => handleSpeed(parseFloat(e.target.value))}
          className="voice-speed-slider"
        />
        <span className="voice-speed-value">{speed.toFixed(1)}x</span>
      </div>
    </div>
  );
};

export default VoiceSettings;