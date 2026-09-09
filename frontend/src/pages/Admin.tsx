import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';

interface Props {
  token: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  is_premium: boolean;
  daily_translation_count: number;
  created_at: string;
}

interface LanguageItem {
  name: string;
  count: number;
  color: string;
  enabled: boolean;
}

export default function Admin({ token }: Props) {
  const { darkMode } = useTheme();
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'languages' | 'analytics' | 'settings'>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [newLangName, setNewLangName] = useState('');
  const [settings, setSettings] = useState({
    registration: true,
    aiTranslation: true,
    voiceTranslation: true,
    videoSubtitles: true,
    analytics: true,
    cache: true,
  });

  const [languages, setLanguages] = useState<LanguageItem[]>([
    { name: 'Luganda', count: 17, color: '#667eea', enabled: true },
    { name: 'Acholi', count: 9, color: '#764ba2', enabled: true },
    { name: 'Rukiga', count: 6, color: '#2193b0', enabled: true },
    { name: 'Runyankole', count: 3, color: '#11998e', enabled: true },
    { name: 'Swahili', count: 2, color: '#f2994a', enabled: true },
    { name: 'Others', count: 12, color: '#e74c3c', enabled: true },
  ]);

  const [metrics, setMetrics] = useState({
    totalUsers: 4,
    premiumUsers: 2,
    totalTranslations: 368,
    dailyTranslations: 14,
  });

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        setMetrics(prev => ({ ...prev, totalUsers: data.length }));
      }
    } catch {
      setError('Backend not running');
    } finally {
      setLoading(false);
    }
  };

  const addUser = () => {
    if (newUserName && newUserEmail && newUserPassword) {
      const newUser: User = {
        id: Date.now(),
        username: newUserName,
        email: newUserEmail,
        is_premium: false,
        daily_translation_count: 0,
        created_at: new Date().toISOString(),
      };
      setUsers(prev => [...prev, newUser]);
      setMetrics(prev => ({ ...prev, totalUsers: prev.totalUsers + 1 }));
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setShowAddUser(false);
    }
  };

  const removeUser = (userId: number) => {
    if (!window.confirm('Remove this user?')) return;
    setUsers(prev => prev.filter(u => u.id !== userId));
    setMetrics(prev => ({ ...prev, totalUsers: Math.max(0, prev.totalUsers - 1) }));
  };

  const addLanguage = () => {
    if (newLangName) {
      setLanguages(prev => [...prev, {
        name: newLangName,
        count: 0,
        color: '#667eea',
        enabled: true,
      }]);
      setNewLangName('');
      setShowAddLanguage(false);
    }
  };

  const removeLanguage = (langName: string) => {
    setLanguages(prev => prev.filter(l => l.name !== langName));
  };

  const toggleLanguage = (langName: string) => {
    setLanguages(prev => prev.map(l => 
      l.name === langName ? { ...l, enabled: !l.enabled } : l
    ));
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalLangCount = languages.filter(l => l.enabled).reduce((a, b) => a + b.count, 0);

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      className={`slider-toggle ${checked ? 'on' : 'off'}`}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
    >
      <span className="slider-knob"></span>
    </button>
  );

  return (
    <div className={`admin-panel-root ${darkMode ? 'admin-dark' : 'admin-light'}`}>
      <div className="admin-panel-header">
        <h2>⚙️ Admin Control Panel</h2>
        <p>Manage users, languages, and platform settings</p>
      </div>

      <div className="admin-panel-tabs">
        <button className={`admin-panel-tab ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => setActiveSection('overview')}>📊 Overview</button>
        <button className={`admin-panel-tab ${activeSection === 'users' ? 'active' : ''}`} onClick={() => setActiveSection('users')}>👥 Users</button>
        <button className={`admin-panel-tab ${activeSection === 'languages' ? 'active' : ''}`} onClick={() => setActiveSection('languages')}>🌍 Languages</button>
        <button className={`admin-panel-tab ${activeSection === 'analytics' ? 'active' : ''}`} onClick={() => setActiveSection('analytics')}>📈 Analytics</button>
        <button className={`admin-panel-tab ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => setActiveSection('settings')}>🔧 Settings</button>
      </div>

      {/* OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="admin-overview">
          <div className="admin-metrics-grid">
            <div className="admin-metric-card purple"><span className="admin-metric-icon">👥</span><h3>Total Users</h3><p className="admin-metric-value">{metrics.totalUsers}</p></div>
            <div className="admin-metric-card blue"><span className="admin-metric-icon">⭐</span><h3>Premium Users</h3><p className="admin-metric-value">{metrics.premiumUsers}</p></div>
            <div className="admin-metric-card green"><span className="admin-metric-icon">🔄</span><h3>Translations</h3><p className="admin-metric-value">{metrics.totalTranslations}</p></div>
            <div className="admin-metric-card orange"><span className="admin-metric-icon">📅</span><h3>Today</h3><p className="admin-metric-value">{metrics.dailyTranslations}</p></div>
          </div>

          {/* PIE CHART */}
          <div className="admin-chart-card">
            <h3>📊 Language Distribution</h3>
            <div className="admin-pie-chart-container">
              <div className="admin-pie-chart" style={{
                background: `conic-gradient(${languages.filter(l => l.enabled).map((lang, i) => {
                  const startP = languages.filter(l => l.enabled).slice(0, i).reduce((a, b) => a + b.count, 0) / totalLangCount * 100;
                  const endP = languages.filter(l => l.enabled).slice(0, i + 1).reduce((a, b) => a + b.count, 0) / totalLangCount * 100;
                  return `${lang.color} ${startP}% ${endP}%`;
                }).join(', ')})`
              }}>
                <div className="admin-pie-hole">
                  <span className="admin-pie-total">{totalLangCount}</span>
                  <span className="admin-pie-label">Translations</span>
                </div>
              </div>
              <div className="admin-pie-legend">
                {languages.filter(l => l.enabled).map((lang) => {
                  const percent = Math.round((lang.count / totalLangCount) * 100);
                  return (
                    <div key={lang.name} className="admin-pie-legend-item">
                      <span className="admin-pie-dot" style={{ background: lang.color }}></span>
                      <span className="admin-pie-name">{lang.name}</span>
                      <span className="admin-pie-count">{lang.count}</span>
                      <span className="admin-pie-percent">{percent}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USERS */}
      {activeSection === 'users' && (
        <div className="admin-users-section">
          <div className="admin-toolbar">
            <input type="text" placeholder="🔍 Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="admin-search-input" />
            <button className="admin-add-user-btn" onClick={() => setShowAddUser(!showAddUser)}>➕ Add User</button>
          </div>

          {showAddUser && (
            <div className="admin-add-form">
              <input type="text" placeholder="Username" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
              <input type="email" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
              <input type="password" placeholder="Password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
              <button className="admin-save-btn" onClick={addUser}>✅ Add</button>
              <button className="admin-cancel-btn" onClick={() => setShowAddUser(false)}>✕</button>
            </div>
          )}

          <div className="admin-users-list">
            {users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase())).map((user) => (
              <div key={user.id} className="admin-user-row">
                <span className="admin-user-avatar">👤</span>
                <div className="admin-user-info">
                  <p className="admin-user-name">{user.username}</p>
                  <span className="admin-user-email">{user.email || 'No email'}</span>
                </div>
                <span className={`admin-user-plan ${user.is_premium ? 'premium' : 'free'}`}>{user.is_premium ? '⭐ Premium' : 'Free'}</span>
                <span className="admin-user-translations">{user.daily_translation_count || 0} translations</span>
                <button className="admin-remove-btn" onClick={() => removeUser(user.id)}>🗑️ Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LANGUAGES */}
      {activeSection === 'languages' && (
        <div className="admin-languages-section">
          <div className="admin-toolbar">
            <button className="admin-add-user-btn" onClick={() => setShowAddLanguage(!showAddLanguage)}>➕ Add Language</button>
          </div>

          {showAddLanguage && (
            <div className="admin-add-form">
              <input type="text" placeholder="Language name" value={newLangName} onChange={(e) => setNewLangName(e.target.value)} />
              <button className="admin-save-btn" onClick={addLanguage}>✅ Add</button>
              <button className="admin-cancel-btn" onClick={() => setShowAddLanguage(false)}>✕</button>
            </div>
          )}

          <div className="admin-languages-list">
            {languages.map((lang) => (
              <div key={lang.name} className="admin-language-row">
                <span className="admin-pie-dot" style={{ background: lang.color }}></span>
                <span className="admin-language-name">{lang.name}</span>
                <span className="admin-language-count">{lang.count} translations</span>
                <ToggleSwitch checked={lang.enabled} onChange={() => toggleLanguage(lang.name)} />
                <button className="admin-remove-btn" onClick={() => removeLanguage(lang.name)}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ANALYTICS */}
      {activeSection === 'analytics' && (
        <div className="admin-analytics-section">
          <div className="admin-chart-card">
            <h3>📈 Platform Growth</h3>
            <div className="admin-growth-chart">
              <div className="admin-growth-bar-row">
                <span className="admin-growth-label">Users</span>
                <div className="admin-growth-bar"><div className="admin-growth-fill" style={{ width: `${Math.min(metrics.totalUsers * 20, 100)}%` }}></div></div>
                <span className="admin-growth-value">{metrics.totalUsers}</span>
              </div>
              <div className="admin-growth-bar-row">
                <span className="admin-growth-label">Premium</span>
                <div className="admin-growth-bar"><div className="admin-growth-fill" style={{ width: `${Math.min(metrics.premiumUsers * 40, 100)}%`, background: '#f2994a' }}></div></div>
                <span className="admin-growth-value">{metrics.premiumUsers}</span>
              </div>
              <div className="admin-growth-bar-row">
                <span className="admin-growth-label">Translations</span>
                <div className="admin-growth-bar"><div className="admin-growth-fill" style={{ width: `${Math.min(metrics.totalTranslations / 5, 100)}%`, background: '#11998e' }}></div></div>
                <span className="admin-growth-value">{metrics.totalTranslations}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {activeSection === 'settings' && (
        <div className="admin-settings-section">
          <div className="admin-setting-row">
            <span className="admin-setting-label">🔒 Registration</span>
            <ToggleSwitch checked={settings.registration} onChange={() => toggleSetting('registration')} />
          </div>
          <div className="admin-setting-row">
            <span className="admin-setting-label">🤖 AI Translation</span>
            <ToggleSwitch checked={settings.aiTranslation} onChange={() => toggleSetting('aiTranslation')} />
          </div>
          <div className="admin-setting-row">
            <span className="admin-setting-label">🎤 Voice Translation</span>
            <ToggleSwitch checked={settings.voiceTranslation} onChange={() => toggleSetting('voiceTranslation')} />
          </div>
          <div className="admin-setting-row">
            <span className="admin-setting-label">🎬 Video Subtitles</span>
            <ToggleSwitch checked={settings.videoSubtitles} onChange={() => toggleSetting('videoSubtitles')} />
          </div>
          <div className="admin-setting-row">
            <span className="admin-setting-label">📊 Analytics</span>
            <ToggleSwitch checked={settings.analytics} onChange={() => toggleSetting('analytics')} />
          </div>
          <div className="admin-setting-row">
            <span className="admin-setting-label">💾 Cache</span>
            <ToggleSwitch checked={settings.cache} onChange={() => toggleSetting('cache')} />
          </div>
        </div>
      )}
    </div>
  );
}