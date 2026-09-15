import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';

interface Props {
  token: string;
  onNavigate: (tab: string) => void;
  username: string;
}

export default function Dashboard({ token, onNavigate, username }: Props) {
  const { darkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState({
    totalTranslations: 0,
    totalUsers: 0,
    premiumUsers: 0,
    dailyTranslations: 0,
  });

  const [history, setHistory] = useState<any[]>([]);
  const [languageStats, setLanguageStats] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchAllData();
  }, [token]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const adminRes = await fetch(`${API_URL}/admin/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (adminRes.ok) {
        const data = await adminRes.json();
        setMetrics(prev => ({
          ...prev,
          totalTranslations: data.total_translations || 0,
          totalUsers: data.total_users || 0,
          premiumUsers: data.premium_users || 0,
        }));
      }

      const historyRes = await fetch(`${API_URL}/translate/history`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data);

        const langCount: Record<string, number> = {};
        data.forEach((item: any) => {
          if (item.target_language) {
            langCount[item.target_language] = (langCount[item.target_language] || 0) + 1;
          }
        });
        setLanguageStats(langCount);

        const today = new Date().toDateString();
        const daily = data.filter((item: any) => {
          const itemDate = new Date(item.created_at).toDateString();
          return itemDate === today;
        }).length;
        setMetrics(prev => ({ ...prev, dailyTranslations: daily }));
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalLangTranslations = Object.values(languageStats).reduce((a, b) => a + b, 0);
  const topLanguages = Object.entries(languageStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const quickActions = [
    { icon: '🔄', label: 'Translate', tab: 'translate', desc: 'Instant text translation' },
    { icon: '🎤', label: 'Voice', tab: 'voice', desc: 'Speech to text translation' },
    { icon: '🎬', label: 'Video', tab: 'video', desc: 'Video subtitle generation' },
    { icon: '📞', label: 'Call Center', tab: 'callcenter', desc: 'Live call translation' },
    { icon: '📜', label: 'History', tab: 'history', desc: 'View past translations' },
    { icon: '🔧', label: 'Settings', tab: 'settings', desc: 'Profile and preferences' },
  ];

  return (
    <div className={`dash-root ${darkMode ? 'dash-dark' : 'dash-light'}`}>
      <div className="dash-header">
        <div>
          <h2>Welcome Back, {username}</h2>
          <p>Here's your real-time translation activity overview</p>
        </div>
        <button className="dash-refresh" onClick={fetchAllData} disabled={loading}>
          {loading ? '⏳ Loading...' : '🔄 Refresh Data'}
        </button>
      </div>

      <div className="dash-cards">
        <div className="dash-card dc-purple">
          <span className="dc-icon">🌐</span>
          <h3>Total Translations</h3>
          <p className="dc-value">{metrics.totalTranslations || '—'}</p>
          <span className="dc-sub">All-time translations</span>
        </div>
        <div className="dash-card dc-blue">
          <span className="dc-icon">👥</span>
          <h3>Total Users</h3>
          <p className="dc-value">{metrics.totalUsers || '—'}</p>
          <span className="dc-sub">Registered accounts</span>
        </div>
        <div className="dash-card dc-green">
          <span className="dc-icon">📅</span>
          <h3>Today's Translations</h3>
          <p className="dc-value">{metrics.dailyTranslations || '—'}</p>
          <span className="dc-sub">Translations today</span>
        </div>
        <div className="dash-card dc-orange">
          <span className="dc-icon">⚡</span>
          <h3>System Status</h3>
          <p className="dc-value dc-online">Online</p>
          <span className="dc-sub">All systems operational</span>
        </div>
      </div>

      <div className="dash-charts">
        <div className="dash-section">
          <h3>🌍 Language Distribution</h3>
          <p className="dash-section-sub">Most translated languages</p>
          {topLanguages.length > 0 ? (
            <div className="dash-lang-list">
              {topLanguages.map(([lang, count]) => {
                const percentage = totalLangTranslations > 0
                  ? Math.round((count / totalLangTranslations) * 100)
                  : 0;
                return (
                  <div key={lang} className="dash-lang-row">
                    <span className="dash-lang-name">{lang}</span>
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
            <p className="dash-section-sub" style={{ textAlign: 'center', marginTop: '30px' }}>No translation data yet</p>
          )}
        </div>

        <div className="dash-section">
          <h3>📊 Activity Overview</h3>
          <p className="dash-section-sub">Translation metrics summary</p>
          <div className="dash-metrics-grid">
            <div className="dash-metric">
              <span className="dash-metric-value">{history.length || '—'}</span>
              <span className="dash-metric-label">Total Records</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-value">{Object.keys(languageStats).length || '—'}</span>
              <span className="dash-metric-label">Languages Used</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-value">{metrics.premiumUsers || '—'}</span>
              <span className="dash-metric-label">Premium Users</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-value">—</span>
              <span className="dash-metric-label">Active Sessions</span>
            </div>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="dash-section">
          <h3>🕐 Recent Activity</h3>
          <p className="dash-section-sub">Latest translations</p>
          <div className="dash-activity-list">
            {history.slice(0, 5).map((item) => (
              <div key={item.id} className="dash-activity-item">
                <p className="dash-activity-source">{item.source_text}</p>
                <p className="dash-activity-translated">{item.translated_text}</p>
                <span className="dash-activity-meta">
                  {item.source_language} → {item.target_language}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dash-quick-section">
        <h3>Quick Actions</h3>
        <div className="dash-quick-grid">
          {quickActions.map((action) => (
            <div key={action.tab} className="dash-quick-card" onClick={() => onNavigate(action.tab)}>
              <span className="dash-quick-icon">{action.icon}</span>
              <div className="dash-quick-info">
                <h4>{action.label}</h4>
                <p>{action.desc}</p>
              </div>
              <span className="dash-quick-arrow">→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}