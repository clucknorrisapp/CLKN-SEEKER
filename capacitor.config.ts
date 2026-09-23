import type { CapacitorConfig } from '@capacitor/cli';

// Target-selected Capacitor config for the three build targets.
//   CLKN_TARGET=solana (default) → FULL edition, loads the live site remotely.
//                                   The live, approved dApp Store app — frozen.
//   CLKN_TARGET=googlePlay        → STORE edition, BUNDLED (dist/ = Store release).
//   CLKN_TARGET=ios               → STORE edition (iOS variant), BUNDLED.
//   CLKN_TARGET=seeker            → SEEKER edition, BUNDLED. The mobile-first app built
//                                   for the Solana dApp Store (CLOCK IN hackathon). Its own
//                                   appId so it can ship alongside the live `solana` listing
//                                   without touching it.
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
    // The webview's own background before the bundle paints. Without it the cold start is a
    // WHITE screen until the first paint (~19 s on a cold simulator, found 2026-09-22 on iOS) —
    // it reads as a crash. Matches seeker.html's theme-color / the shell's --bg.
    backgroundColor: '#0b0c0e',
    android: { appendUserAgent: 'ClucknorrisPlay' },
  },
  // ── SEEKER edition — bundled, no server.url. ──
  // Deliberately NOT a variant of `solana`. That target is the live, approved dApp Store app
  // and it loads the website remotely; this one bundles a purpose-built mobile client and
  // carries its own appId, so shipping it cannot disturb the live listing. It also means the
  // two can be installed side by side on the owner's device while the new one is tested.
  //
  // No appendUserAgent marker: the store-edition UA markers exist as backend defense-in-depth
  // for the EDUCATION-ONLY bundles, whose excluded endpoints the server refuses. The Seeker
  // edition is the full product — wallet, tools, signing — so it has nothing to be refused
  // from, and a marker would only invite someone to treat it as authorisation. It is not.
  seeker: {
    ...common,
    appId: 'app.clucknorris.seeker',
    backgroundColor: '#0b0c0e',
  },
  // ── STORE edition (Apple App Store) — bundled, no server.url. ──
  ios: {
    ...common,
    appId: 'app.clucknorris.edu',
    backgroundColor: '#0b0c0e',
    ios: { appendUserAgent: 'ClucknorrisIOS' },
  },
};

const config: CapacitorConfig = targets[TARGET] || targets.solana;

export default config;
