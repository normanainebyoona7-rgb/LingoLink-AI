import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import './App.css';
import './landing.css';
import './auth.css';
import './pages.css';
import './admin.css';
import { API_URL } from './config';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Translate from './pages/Translate';
import History from './pages/History';
import Voice from './pages/Voice';
import TwoWay from './pages/TwoWay';
import LiveTranslation from './pages/LiveTranslation';
import Video from './pages/Video';
import CallCenter from './pages/CallCenter';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Icon, { IconName } from './components/Icon';

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  darkMode: true,
  toggleDarkMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const LANGUAGES: Record<string, string> = {
  english: 'English', spanish: 'Spanish', french: 'French', german: 'German',
  portuguese: 'Portuguese', italian: 'Italian', dutch: 'Dutch', russian: 'Russian',
  arabic: 'Arabic', hindi: 'Hindi', chinese: 'Chinese', japanese: 'Japanese',
  korean: 'Korean', turkish: 'Turkish',
  luganda: 'Luganda', rukiga: 'Rukiga', runyankole: 'Runyankole',
  acholi: 'Acholi', alur: 'Alur', ateso: 'Ateso', lango: 'Lango',
  lugbara: 'Lugbara', lusoga: 'Lusoga', lugwere: 'Lugwere',
  swahili: 'Swahili', kinyarwanda: 'Kinyarwanda', kirundi: 'Kirundi',
  amharic: 'Amharic', somali: 'Somali', oromo: 'Oromo', tigrinya: 'Tigrinya',
  kikuyu: 'Kikuyu', dholuo: 'Dholuo',
  yoruba: 'Yoruba', hausa: 'Hausa', igbo: 'Igbo', fulfulde: 'Fulfulde',
  wolof: 'Wolof', bambara: 'Bambara', twi: 'Twi', ewe: 'Ewe',
  lingala: 'Lingala', kikongo: 'Kikongo', bemba: 'Bemba', chichewa: 'Chichewa',
  zulu: 'Zulu', xhosa: 'Xhosa', afrikaans: 'Afrikaans', sesotho: 'Sesotho',
  setswana: 'Setswana', shona: 'Shona',
  kabyle: 'Kabyle', tachelhit: 'Tachelhit',
};

type Tab = 'dashboard' | 'translate' | 'history' | 'voice' | 'twoway' | 'live' | 'video' | 'callcenter' | 'admin' | 'settings';
type AuthPage = 'landing' | 'login' | 'register' | 'forgot';

interface SidebarItem {
  id: Tab;
  icon: IconName;
  label: string;
}

function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authPage, setAuthPage] = useState<AuthPage>('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const authBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('username');
    const savedDark = localStorage.getItem('darkMode');
    const savedAdmin = localStorage.getItem('is_admin');
    if (savedToken && savedUser) { setToken(savedToken); setUsername(savedUser); setIsLoggedIn(true); }
    if (savedDark !== null) setDarkMode(savedDark === 'true');
    if (savedAdmin !== null) setIsAdmin(savedAdmin === 'true');

    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleDarkMode = () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem('darkMode', String(newValue));
  };

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen(!mobileSidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  const handleAuthMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = authBoxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const maxTilt = 6;

    const tiltY = ((x - centerX) / centerX) * maxTilt;
    const tiltX = ((centerY - y) / centerY) * maxTilt;

    el.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
  };

  const handleAuthMouseLeave = () => {
    const el = authBoxRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  const handleNavigate = (tab: Tab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  const validatePassword = (pass: string): string => {
    if (pass.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pass)) return 'Password must contain uppercase letter';
    if (!/[a-z]/.test(pass)) return 'Password must contain lowercase letter';
    if (!/[0-9]/.test(pass)) return 'Password must contain a number';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain special character';
    return '';
  };

  const login = async () => {
    setAuthError('');
    setAuthSuccess('');
    if (!username || !password) { setAuthError('Please fill all fields'); return; }
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.access_token);
        setIsLoggedIn(true);
        setIsAdmin(data.is_admin || data.username === 'admin');
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('is_admin', String(data.is_admin || data.username === 'admin'));
      } else {
        setAuthError('Invalid username or password');
      }
    } catch { setAuthError('Backend not running. Start it first.'); }
  };

  const register = async () => {
    setAuthError('');
    setAuthSuccess('');
    if (!username || !email || !password || !confirmPassword) { setAuthError('Please fill all fields'); return; }
    if (!email.includes('@') || !email.includes('.')) { setAuthError('Please enter a valid email'); return; }
    const passError = validatePassword(password);
    if (passError) { setAuthError(passError); return; }
    if (password !== confirmPassword) { setAuthError('Passwords do not match'); return; }
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      if (res.ok) {
        setAuthSuccess('Registration successful! Please login.');
        setAuthPage('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setAuthError(data.detail || 'Registration failed');
      }
    } catch { setAuthError('Backend not running. Start it first.'); }
  };

  const forgotPassword = () => {
    setAuthError('');
    setAuthSuccess('');
    if (!email || !email.includes('@')) { setAuthError('Enter a valid email address'); return; }
    setAuthSuccess(`Password reset link sent to ${email}. Check your inbox.`);
    setTimeout(() => setAuthPage('login'), 2000);
  };

  const logout = () => {
    setToken('');
    setIsLoggedIn(false);
    setIsAdmin(false);
    setAuthPage('landing');
    setMobileSidebarOpen(false);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
  };

  const goHome = () => {
    setIsLoggedIn(false);
    setAuthPage('landing');
    setMobileSidebarOpen(false);
  };

  if (!isLoggedIn) {
    return (
      <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
        {authPage === 'landing' ? (
          <Landing onLoginClick={() => setAuthPage('login')} onRegisterClick={() => setAuthPage('register')} />
        ) : (
          <div className={`auth-full ${darkMode ? 'auth-dark' : 'auth-light'}`}>
            <div
              className="auth-box"
              ref={authBoxRef}
              onMouseMove={handleAuthMouseMove}
              onMouseLeave={handleAuthMouseLeave}
            >
              <div className="auth-logo">
                <img
                  src="/branding/logo.png"
                  alt="LingoLink AI"
                  className="auth-logo-img"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <h1>{authPage === 'login' ? 'Welcome Back' : authPage === 'register' ? 'Create Account' : 'Forgot Password'}</h1>
              <p>
                {authPage === 'login' ? 'Sign in to continue translating' :
                 authPage === 'register' ? 'Join thousands translating with AI' :
                 'Enter your email to reset password'}
              </p>

              {authError && <div className="auth-error">❌ {authError}</div>}
              {authSuccess && <div className="auth-success">✅ {authSuccess}</div>}

              {authPage === 'login' && (
                <>
                  <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                  <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} />
                  <button className="auth-btn" onClick={login}>Sign In</button>
                  <button className="auth-link" onClick={() => setAuthPage('forgot')}>Forgot Password?</button>
                  <button className="auth-link" onClick={() => setAuthPage('register')}>Don't have an account? Register</button>
                </>
              )}

              {authPage === 'register' && (
                <>
                  <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                  <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input placeholder="Password (min 8 chars, uppercase, number, special)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <input placeholder="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <button className="auth-btn" onClick={register}>Register</button>
                  <button className="auth-link" onClick={() => setAuthPage('login')}>Already have an account? Login</button>
                </>
              )}

              {authPage === 'forgot' && (
                <>
                  <input placeholder="Enter your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="auth-btn" onClick={forgotPassword}>Send Reset Link</button>
                  <button className="auth-link" onClick={() => setAuthPage('login')}>Back to Login</button>
                </>
              )}

              <button className="auth-link" onClick={() => setAuthPage('landing')}>← Back to Home</button>
            </div>
          </div>
        )}
      </ThemeContext.Provider>
    );
  }

  const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'translate', icon: 'translate', label: 'Translate' },
    { id: 'history', icon: 'history', label: 'History' },
    { id: 'voice', icon: 'voice', label: 'Voice' },
    { id: 'twoway', icon: 'twoway', label: 'Two-Way' },
    { id: 'live', icon: 'live', label: 'Live' },
    { id: 'video', icon: 'video', label: 'Video Studio' },
    { id: 'callcenter', icon: 'callcenter', label: 'Call Center' },
    ...(isAdmin ? [{ id: 'admin' as Tab, icon: 'admin' as IconName, label: 'Admin' }] : []),
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <div className={`app-root ${darkMode ? 'app-dark' : 'app-light'} ${sidebarCollapsed && !isMobile ? 'sb-collapsed' : ''}`}>
        {isMobile && mobileSidebarOpen && (
          <div className="mobile-overlay" onClick={() => setMobileSidebarOpen(false)} />
        )}

        <aside className={`sb-sidebar ${darkMode ? 'sb-dark' : 'sb-light'} ${isMobile ? (mobileSidebarOpen ? 'mobile-open' : 'mobile-closed') : ''}`}>
          <div className="sb-brand">
            <img
              src="/branding/logo.png"
              alt="LingoLink AI"
              className="sb-brand-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const fallback = document.createElement('span');
                  fallback.className = 'sb-brand-icon';
                  fallback.textContent = '🌍';
                  parent.insertBefore(fallback, e.currentTarget);
                }
              }}
            />
            {(!sidebarCollapsed || isMobile) && <span className="sb-brand-text">LingoLink AI</span>}
          </div>

          <div className="sb-home-section">
            <button className="sb-home-btn" onClick={goHome}>
              <Icon name="home" size={18} />
              {(!sidebarCollapsed || isMobile) && <span>Home</span>}
            </button>
          </div>

          <nav className="sb-menu">
            {sidebarItems.map((item) => (
              <button key={item.id} className={`sb-item ${activeTab === item.id ? 'sb-active' : ''}`}
                onClick={() => handleNavigate(item.id)}>
                <span className="sb-icon"><Icon name={item.icon} size={18} /></span>
                {(!sidebarCollapsed || isMobile) && <span className="sb-label">{item.label}</span>}
              </button>
            ))}
          </nav>

          <div className="sb-footer">
            <div className="sb-user">
              <Icon name="user" size={18} />
              {(!sidebarCollapsed || isMobile) && <span>{username}</span>}
            </div>
            <button className="sb-theme-btn" onClick={toggleDarkMode}>
              <Icon name={darkMode ? 'sun' : 'moon'} size={18} />
              {(!sidebarCollapsed || isMobile) && <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
            </button>
            <button className="sb-logout" onClick={logout}>
              <Icon name="logout" size={18} />
              {(!sidebarCollapsed || isMobile) && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <main className="sb-main">
          <header className="sb-topbar">
            <button className="sb-collapse" onClick={toggleSidebar}>
              <Icon name="menu" size={20} />
            </button>
            <h2 className="sb-title">{sidebarItems.find(i => i.id === activeTab)?.label || (activeTab === 'admin' ? 'Admin' : '')}</h2>
            <div className="sb-actions">
              <button className="sb-theme-toggle" onClick={toggleDarkMode}>
                <Icon name={darkMode ? 'sun' : 'moon'} size={18} />
              </button>
              <span className="sb-dot">●</span>
              <span className="sb-status">Online</span>
            </div>
          </header>

          <div className="sb-content">
            {activeTab === 'dashboard' && <Dashboard token={token} onNavigate={(tab) => handleNavigate(tab as Tab)} username={username} />}
            {activeTab === 'translate' && <Translate token={token} />}
            {activeTab === 'history' && <History token={token} />}
            {activeTab === 'voice' && <Voice token={token} />}
            {activeTab === 'twoway' && <TwoWay token={token} />}
            {activeTab === 'live' && <LiveTranslation token={token} />}
            {activeTab === 'video' && <Video token={token} />}
            {activeTab === 'callcenter' && <CallCenter token={token} />}
            {activeTab === 'admin' && isAdmin && <Admin token={token} />}
            {activeTab === 'admin' && !isAdmin && (
              <div className="gpanel">
                <h3>🔒 Access Denied</h3>
                <p>You need admin privileges to view this page.</p>
              </div>
            )}
            {activeTab === 'settings' && <Settings token={token} username={username} />}
          </div>
        </main>
      </div>
    </ThemeContext.Provider>
  );
}

export default App;