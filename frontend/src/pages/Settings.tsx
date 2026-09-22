import React, { useState, useRef } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import Icon from '../components/Icon';

interface Props {
  token: string;
  username: string;
}

export default function Settings({ token, username }: Props) {
  const { darkMode, toggleDarkMode } = useTheme();
  const [profile, setProfile] = useState({
    fullName: username,
    email: '',
    phone: '',
    company: '',
    role: '',
    bio: '',
    location: '',
    website: '',
    preferredLanguage: 'english',
    profilePicture: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | ''>('');
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState('');
  const [cropScale, setCropScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    pushNotifications: true,
    translationAlerts: true,
    weeklyReports: false,
    securityAlerts: true,
  });

  const [preferences, setPreferences] = useState({
    autoTranslate: true,
    autoDetect: true,
    voiceOutput: true,
    speechToText: true,
  });

  const handleProfileChange = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (field: string) => {
    setNotifications(prev => ({ ...prev, [field]: !prev[field as keyof typeof notifications] }));
  };

  const handlePreferenceChange = (field: string) => {
    setPreferences(prev => ({ ...prev, [field]: !prev[field as keyof typeof preferences] }));
  };

  const handleProfilePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        setCropImage(imageData);
        setShowCropModal(true);
        setCropScale(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveCroppedImage = () => {
    setProfile(prev => ({ ...prev, profilePicture: cropImage }));
    setShowCropModal(false);
  };

  const saveProfile = async () => {
    setIsSaving(true);
    setSaveMessage('');
    setSaveStatus('');
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setSaveMessage('Profile saved successfully!');
        setSaveStatus('success');
      } else {
        setSaveMessage('Failed to save profile');
        setSaveStatus('error');
      }
    } catch {
      setSaveMessage('Failed to save profile');
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        setSaveMessage('');
        setSaveStatus('');
      }, 3000);
    }
  };

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      className={`toggle-switch ${checked ? 'on' : 'off'}`}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      type="button"
    >
      <span className="toggle-knob"></span>
    </button>
  );

  return (
    <div className={`settings-root ${darkMode ? 'settings-dark' : 'settings-light'}`}>
      <div className="settings-header">
        <h2><Icon name="settings" size={22} /> Settings</h2>
        <p>Manage your profile, preferences, and notifications</p>
      </div>

      {/* Profile Section */}
      <div className="settings-card">
        <h3><Icon name="user" size={18} /> Profile Information</h3>
        <div className="profile-header">
          <div className="profile-picture-container">
            {profile.profilePicture ? (
              <img
                src={profile.profilePicture}
                alt="Profile"
                className="profile-picture"
              />
            ) : (
              <div className="profile-picture-placeholder">
                {username.charAt(0).toUpperCase()}
              </div>
            )}
            <button className="profile-upload-btn" onClick={() => fileInputRef.current?.click()} type="button">
              <Icon name="camera" size={14} /> Change Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureUpload}
              style={{ display: 'none' }}
            />
          </div>
          <div className="profile-info-summary">
            <h4>{profile.fullName || username}</h4>
            <p>{profile.role || 'User'}</p>
            <p>{profile.bio || 'No bio added yet'}</p>
          </div>
        </div>

        <div className="settings-form">
          <div className="form-row">
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" value={profile.fullName} onChange={(e) => handleProfileChange('fullName', e.target.value)} placeholder="Enter your full name" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={profile.email} onChange={(e) => handleProfileChange('email', e.target.value)} placeholder="your@email.com" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={profile.phone} onChange={(e) => handleProfileChange('phone', e.target.value)} placeholder="+256 700 000 000" />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input type="text" value={profile.company} onChange={(e) => handleProfileChange('company', e.target.value)} placeholder="Company name" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <input type="text" value={profile.role} onChange={(e) => handleProfileChange('role', e.target.value)} placeholder="e.g., Field Agent, Translator" />
            </div>
            <div className="form-group">
              <label>Location</label>
              <input type="text" value={profile.location} onChange={(e) => handleProfileChange('location', e.target.value)} placeholder="City, Country" />
            </div>
          </div>
          <div className="form-group full-width">
            <label>Bio / Description</label>
            <textarea value={profile.bio} onChange={(e) => handleProfileChange('bio', e.target.value)} placeholder="Tell us about yourself..." rows={3} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Website</label>
              <input type="url" value={profile.website} onChange={(e) => handleProfileChange('website', e.target.value)} placeholder="https://example.com" />
            </div>
            <div className="form-group">
              <label>Preferred Language</label>
              <select value={profile.preferredLanguage} onChange={(e) => handleProfileChange('preferredLanguage', e.target.value)}>
                <option value="english">English</option>
                <option value="luganda">Luganda</option>
                <option value="swahili">Swahili</option>
                <option value="acholi">Acholi</option>
                <option value="alur">Alur</option>
                <option value="french">French</option>
              </select>
            </div>
          </div>
          <button className="settings-save-btn" onClick={saveProfile} disabled={isSaving} type="button">
            {isSaving ? (
              <><Icon name="loader" size={16} className="spin" /> Saving...</>
            ) : (
              <><Icon name="save" size={16} /> Save Profile</>
            )}
          </button>
          {saveMessage && (
            <p className={`save-message ${saveStatus}`}>
              <Icon name={saveStatus === 'success' ? 'check' : 'alert'} size={16} /> {saveMessage}
            </p>
          )}
        </div>
      </div>

      {/* Crop Modal */}
      {showCropModal && (
        <div className="crop-modal-overlay" onClick={() => setShowCropModal(false)}>
          <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
            <h3><Icon name="crop" size={18} /> Crop Profile Picture</h3>
            <p>Use slider to zoom</p>
            <div className="crop-preview-container">
              <img
                src={cropImage}
                alt="Crop preview"
                className="crop-preview-image"
                style={{
                  transform: `scale(${cropScale})`,
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            </div>
            <div className="crop-controls">
              <label>Zoom:</label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={cropScale}
                onChange={(e) => setCropScale(parseFloat(e.target.value))}
              />
              <span>{cropScale.toFixed(1)}x</span>
            </div>
            <div className="crop-buttons">
              <button className="crop-cancel-btn" onClick={() => setShowCropModal(false)} type="button">Cancel</button>
              <button className="crop-save-btn" onClick={saveCroppedImage} type="button">
                <Icon name="check" size={14} /> Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences */}
      <div className="settings-card">
        <h3><Icon name="settings" size={18} /> Translation Preferences</h3>
        <div className="toggle-list">
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="refresh" size={16} /> Auto Translate</span>
              <p className="toggle-desc">Translate as you type</p>
            </div>
            <ToggleSwitch checked={preferences.autoTranslate} onChange={() => handlePreferenceChange('autoTranslate')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="search" size={16} /> Auto Detect Language</span>
              <p className="toggle-desc">Automatically detect source language</p>
            </div>
            <ToggleSwitch checked={preferences.autoDetect} onChange={() => handlePreferenceChange('autoDetect')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="volume" size={16} /> Voice Output</span>
              <p className="toggle-desc">Hear translations spoken aloud</p>
            </div>
            <ToggleSwitch checked={preferences.voiceOutput} onChange={() => handlePreferenceChange('voiceOutput')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="moon" size={16} /> Dark Mode</span>
              <p className="toggle-desc">Toggle dark/light theme</p>
            </div>
            <ToggleSwitch checked={darkMode} onChange={toggleDarkMode} />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-card">
        <h3><Icon name="bell" size={18} /> Notification Settings</h3>
        <div className="toggle-list">
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="mail" size={16} /> Email Notifications</span>
              <p className="toggle-desc">Receive email updates</p>
            </div>
            <ToggleSwitch checked={notifications.emailNotifications} onChange={() => handleNotificationChange('emailNotifications')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="smartphone" size={16} /> Push Notifications</span>
              <p className="toggle-desc">Get mobile push alerts</p>
            </div>
            <ToggleSwitch checked={notifications.pushNotifications} onChange={() => handleNotificationChange('pushNotifications')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label"><Icon name="lock" size={16} /> Security Alerts</span>
              <p className="toggle-desc">Login and security notifications</p>
            </div>
            <ToggleSwitch checked={notifications.securityAlerts} onChange={() => handleNotificationChange('securityAlerts')} />
          </div>
        </div>
      </div>
    </div>
  );
}