import type { CapacitorConfig } from '@capacitor/cli';

// Target-selected Capacitor config for the three build targets.
//   CLKN_TARGET=solana (default) → FULL edition, loads the live site remotely.
//                                   The live, approved dApp Store app — frozen.
//   CLKN_TARGET=googlePlay        → STORE edition, BUNDLED (dist/ = Store release).
//   CLKN_TARGET=ios               → STORE edition (iOS variant), BUNDLED.
// The store targets keep a UA marker ONLY as backend defense-in-depth: their
// bundled free tools still call /api/*, so the server can refuse any endpoint
// the store edition must never reach. See play-store/WRAPPER-BUILD-TARGETS.md.
//
// Android applicationId + signing are selected in android/app/build.gradle via
// Gradle properties (Solana is the default there too), NOT here — see the plan.

const TARGET = process.env.CLKN_TARGET || 'solana';

const common = { appName: 'Cluck Norris', webDir: 'dist' };

const targets: Record<string, CapacitorConfig> = {
  // ── FULL edition — unchanged from the live app. Do not alter. ──
  solana: {
    ...common,
    appId: 'app.clucknorris.school',
    server: {
      // Load the live hybrid frontend (React school + all public/*.html tools)
      // straight from the Railway backend, which routes /, /score, /autopsy,
      // /api/*, etc. Keeps the app a thin client; UI ships without re-releasing.
      url: 'https://clucknorris.app',
      cleartext: false,
    },
  },
  // ── STORE edition (Google Play) — bundled, no server.url. ──
  googlePlay: {
    ...common,
    appId: 'app.clucknorris.edu',
    android: { appendUserAgent: 'ClucknorrisPlay' },
  },
  // ── STORE edition (Apple App Store) — bundled, no server.url. ──
  ios: {
    ...common,
    appId: 'app.clucknorris.edu',
    ios: { appendUserAgent: 'ClucknorrisIOS' },
  },
};

const config: CapacitorConfig = targets[TARGET] || targets.solana;

export default config;
