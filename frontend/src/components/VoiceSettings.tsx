import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface VoiceSettingsProps {
  language: string;
  onVoiceChange: (gender: 'male' | 'female') => void;
  onSpeedChange: (speed: number) => void;
}

// Languages where both genders are available
const LANGS_WITH_BOTH = new Set([
  'luganda', 'acholi', 'runyankole', 'runyankore', 'rukiga',
  'english', 'french', 'spanish', 'german', 'portuguese', 'italian',
  'dutch', 'russian', 'arabic', 'hindi', 'chinese', 'japanese',
  'korean', 'turkish', 'swahili',
]);

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
    if (LANGS_WITH_BOTH.has(lang)) {
      setAvailable({ male: true, female: true });
    } else {
      setAvailable({ male: false, female: true });
      setGender('female');
      onVoiceChange('female');
    }
  }, [language, onVoiceChange]);

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
            <Icon name="user-female" size={16} /> Female
          </button>
          <button
            type="button"
            className={`voice-gender-btn ${gender === 'male' ? 'active' : ''}`}
            onClick={() => handleGender('male')}
            disabled={!available.male}
            title={!available.male ? 'Not available for this language' : 'Male voice'}
          >
            <Icon name="user-male" size={16} /> Male
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