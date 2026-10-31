import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fussky.app',
  appName: 'Fussky',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
