import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.phllandcare.crm',
  appName: 'PHL Land Care',
  webDir: 'dist',
  server: {
    // Point the app at the live deployed site so it always shows the
    // latest version without needing to rebuild/resubmit the app.
    url: 'https://phllandcare.github.io/phl-crm/',
    androidScheme: 'https',
    allowNavigation: ['phllandcare.github.io', '*.supabase.co'],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
