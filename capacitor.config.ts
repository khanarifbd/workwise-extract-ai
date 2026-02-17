import type { CapacitorConfig } from '@capacitor/cli';

// Optional live update URL:
// - If CAP_SERVER_URL is set, native app loads web assets from that URL.
// - If not set, native app uses bundled assets from `dist` (recommended for local debugging).
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.workwish.com',
  appName: 'Work Wish',
  webDir: 'dist',
  ...(serverUrl ? {
    server: {
      url: serverUrl,
      cleartext: true,
      allowNavigation: [
        'allsaints.builders',
        'www.allsaints.builders',
        'workwise-extract-ai.lovable.app',
        '32291fea-ae7a-4244-99d2-54f6e702d4c6.lovableproject.com',
        'lovable.dev',
        'www.lovable.dev',
        'maps.google.com',
        'www.google.com',
        'google.com',
      ],
    },
  } : {}),
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#F97316',
      style: 'LIGHT'
    }
  }
};

export default config;
