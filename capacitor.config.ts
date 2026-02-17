import type { CapacitorConfig } from '@capacitor/cli';

// Live Update Mode: The app always loads from the published web URL.
// This means every time you publish in Lovable, the iOS/Android app gets the update instantly.
// Set CAP_SERVER_URL env var to override (e.g. for local dev).
const serverUrl = process.env.CAP_SERVER_URL || 'https://allsaints.builders';

const config: CapacitorConfig = {
  appId: 'app.workwish.com',
  appName: 'Work Wish',
  webDir: 'dist',
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
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    StatusBar: {
      backgroundColor: '#F97316',
      style: 'LIGHT'
    }
  }
};

export default config;
