import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vip.clucknorris.app',
  appName: 'Cluck Norris',
  webDir: 'dist',
  server: {
    // Load the live hybrid frontend (React school + all public/*.html tools)
    // straight from the Railway backend, which routes /, /score, /autopsy,
    // /api/*, etc. Keeps the app a thin client; UI ships without re-releasing.
    url: 'https://clucknorris.app',
    cleartext: false
  }
};

export default config;
