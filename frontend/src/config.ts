// ============================================
// LingoLink AI - API Configuration
// ============================================

export const getApiUrl = (): string => {
  const hostname = window.location.hostname;

  // 1. If running on Vercel (Production Web)
  if (hostname.includes('vercel.app')) {
    return 'https://lingolink-ai.onrender.com';
  }

  // 2. If running in the Android App (Capacitor uses 'localhost' by default)
  // We force it to use your PC's Wi-Fi IP so the phone can reach the backend.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Check if we are inside the Android app (Capacitor)
    const isCapacitor = (window as any).Capacitor !== undefined;
    
    if (isCapacitor) {
      // Your PC's Wi-Fi IP address
      return 'http://192.168.1.3:8000';
    }
    
    // Standard PC browser development
    return 'http://localhost:8000';
  }

  // 3. If accessing the web app via network IP (e.g., on your phone's browser)
  return `http://${hostname}:8000`;
};

export const API_URL = getApiUrl();