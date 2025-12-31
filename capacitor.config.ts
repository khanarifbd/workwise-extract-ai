import type { CapacitorConfig } from '@capacitor/cli';

// IMPORTANT:
// - When CAP_SERVER_URL is NOT set, the app loads the bundled web build from `dist/` (recommended for Android/iOS builds).
// - When CAP_SERVER_URL IS set, Capacitor will load that remote URL (useful for dev/hot-reload).
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.workwish.com',
  appName: 'workwise-extract-ai',
  webDir: 'dist',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: true,
          allowNavigation: [
            '32291fea-ae7a-4244-99d2-54f6e702d4c6.lovableproject.com',
            'lovable.dev',
            'www.lovable.dev',
            'maps.google.com',
            'www.google.com',
            'google.com',
          ],
        },
      }
    : {}),
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    StatusBar: {
      backgroundColor: '#EA580C',
      style: 'LIGHT'
    }
  }
};

export default config;
