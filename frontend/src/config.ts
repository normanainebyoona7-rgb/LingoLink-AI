// ============================================
// LingoLink AI - API Configuration
// Auto-detects if running on PC or Phone
// ============================================

export const getApiUrl = (): string => {
  const hostname = window.location.hostname;
  
  // If running on localhost (PC development)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  
  // If running on phone or other device on same network
  return `http://${hostname}:8000`;
};

export const API_URL = getApiUrl();