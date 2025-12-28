import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.workwish.com',
  appName: 'workwise-extract-ai',
  webDir: 'dist',
  server: {
    url: 'https://32291fea-ae7a-4244-99d2-54f6e702d4c6.lovableproject.com?forceHideBadge=true',
    cleartext: true,
    // Keep external navigations inside the app WebView (instead of opening Chrome)
    allowNavigation: [
      '32291fea-ae7a-4244-99d2-54f6e702d4c6.lovableproject.com',
      'maps.google.com',
      'www.google.com',
      'google.com',
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
