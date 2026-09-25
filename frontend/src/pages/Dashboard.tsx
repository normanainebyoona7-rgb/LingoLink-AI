import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import Icon, { IconName } from '../components/Icon';

interface Props {
  token: string;
  onNavigate: (tab: string) => void;
  username: string;
}

interface RecentItem {
  id: number;
  source_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  created_at: string;
}

interface Stats {
  total_translations: number;
  today_translations: number;
  week_translations: number;
  languages_used: number;
  top_languages: { language: string; count: number }[];
  recent: RecentItem[];
}

export default function Dashboard({ token, onNavigate, username }: Props) {
  const { darkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    total_translations: 0,
    today_translations: 0,
    week_translations: 0,
    languages_used: 0,
    top_languages: [],
    recent: [],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, [token]);

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/translate/stats/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setError('Could not load stats');
      }
    } catch {
      setError('Backend not running');
    } finally {
      setLoading(false);
    }
  };

  const totalTop = stats.top_languages.reduce((a, b) => a + b.count, 0);

  const quickActions: { icon: IconName; label: string; tab: string; desc: string }[] = [
    { icon: 'translate', label: 'Translate', tab: 'translate', desc: 'Instant text translation' },
    { icon: 'voice', label: 'Voice', tab: 'voice', desc: 'Speech to text translation' },
    { icon: 'video', label: 'Video', tab: 'video', desc: 'Video subtitle generation' },
    { icon: 'callcenter', label: 'Call Center', tab: 'callcenter', desc: 'Live call translation' },
    { icon: 'history', label: 'History', tab: 'history', desc: 'View past translations' },
    { icon: 'settings', label: 'Settings', tab: 'settings', desc: 'Profile and preferences' },
  ];

  return (
    <div className="dash-root">
      <div className="dash-header">
        <div>
          <h2>Welcome back, {username}</h2>
          <p>Your personal translation activity</p>
        </div>
        <button className="dash-refresh" onClick={fetchStats} disabled={loading}>
          <Icon name={loading ? 'loader' : 'refresh'} size={16} />
          {loading ? ' Loading...' : ' Refresh'}
        </button>
      </div>

      {error && (
        <p className="dash-error">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <div className="dash-cards">
        <div className="dash-card dc-purple">
          <span className="dc-icon"><Icon name="translate" size={28} /></span>
          <h3>Your Translations</h3>
          <p className="dc-value">{stats.total_translations}</p>
          <span className="dc-sub">All time</span>
        </div>
        <div className="dash-card dc-blue">
          <span className="dc-icon"><Icon name="calendar" size={28} /></span>
          <h3>Today</h3>
          <p className="dc-value">{stats.today_translations}</p>
          <span className="dc-sub">Translations today</span>
        </div>
        <div className="dash-card dc-green">
          <span className="dc-icon"><Icon name="clock" size={28} /></span>
          <h3>This Week</h3>
          <p className="dc-value">{stats.week_translations}</p>
          <span className="dc-sub">Last 7 days</span>
        </div>
        <div className="dash-card dc-orange">
          <span className="dc-icon"><Icon name="globe" size={28} /></span>
          <h3>Languages Used</h3>
          <p className="dc-value">{stats.languages_used}</p>
          <span className="dc-sub">Distinct languages</span>
        </div>
      </div>

      <div className="dash-charts">
        <div className="dash-section">
          <h3><Icon name="bar-chart" size={18} /> Your Top Languages</h3>
          <p className="dash-section-sub">Most used target languages</p>
          {stats.top_languages.length > 0 ? (
            <div className="dash-lang-list">
              {stats.top_languages.map(({ language, count }) => {
                const percentage = totalTop > 0 ? Math.round((count / totalTop) * 100) : 0;
                return (
                  <div key={language} className="dash-lang-row">
                    <span className="dash-lang-name">{language}</span>
                    <div className="dash-lang-bar-wrap">
                      <div className="dash-lang-bar" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <span className="dash-lang-pct">
                      {percentage}%
                      <span className="dash-lang-count">({count})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="dash-section-sub" style={{ textAlign: 'center', marginTop: '30px' }}>
              No translations yet. Start translating to see your stats.
            </p>
          )}
        </div>

        <div className="dash-section">
          <h3><Icon name="clock" size={18} /> Recent Activity</h3>
          <p className="dash-section-sub">Your latest translations</p>
          {stats.recent.length > 0 ? (
            <div className="dash-activity-list">
              {stats.recent.map((item) => (
                <div key={item.id} className="dash-activity-item">
                  <p className="dash-activity-source">{item.source_text}</p>
                  <p className="dash-activity-translated">{item.translated_text}</p>
                  <span className="dash-activity-meta">
                    {item.source_language} → {item.target_language}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dash-section-sub" style={{ textAlign: 'center', marginTop: '30px' }}>
              No recent activity
            </p>
          )}
        </div>
      </div>

      <div className="dash-quick-section">
        <h3>Quick Actions</h3>
        <div className="dash-quick-grid">
          {quickActions.map((action) => (
            <div key={action.tab} className="dash-quick-card" onClick={() => onNavigate(action.tab)}>
              <span className="dash-quick-icon"><Icon name={action.icon} size={24} /></span>
              <div className="dash-quick-info">
                <h4>{action.label}</h4>
                <p>{action.desc}</p>
              </div>
              <span className="dash-quick-arrow"><Icon name="arrow-right" size={18} /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}