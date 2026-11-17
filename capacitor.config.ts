import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.prosmart.field',
  appName: 'Pro Smart',
  webDir: 'dist',
  backgroundColor: '#003a5f',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
