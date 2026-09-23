import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.lingolink.app',
  appName: 'LingoLink AI',
  webDir: 'build',

  server: {
    // Load the live site every time the app opens — auto-updates via Vercel
    url: 'https://lingolink-ai.vercel.app',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow the app to talk to your backend + external APIs
    allowNavigation: [
      'lingolink-ai.vercel.app',
      'lingolink-ai.onrender.com',
      'api.sunbird.ai',
      'api.groq.com',
      'generativelanguage.googleapis.com',
    ],
  },

  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a1208',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;