import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dividosplit.app',
  appName: 'Divido',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
