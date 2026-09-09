// Store-mode + feature-flag layer for the Cluck Norris React app.
//
// ONE website, THREE distribution tiers — driven by a URL param the native
// wrapper sets, so content still auto-updates from the single codebase:
//
//   mode "full"  → Solana dApp Store (Seeker). Loads clucknorris.app (no param).
//                  Everything on. Identical to today. NON-INTERFERENCE default.
//   mode "play"  → Google Play. Loads clucknorris.app?app=play.
//                  Education + free research tools + holder-gate for advanced
//                  tools. Google allows reading a balance to unlock (no purchase).
//   mode "ios"   → Apple App Store. Loads clucknorris.app?app=ios.
//                  Education ONLY. Apple Guideline 3.1.1 forbids using a crypto
//                  wallet to unlock functionality, so NO holder-gate on iOS.
//
// Why the policy split (verified Sep 2026):
//   - Paying any crypto (SOL/CLKN) to unlock in-app features violates Google
//     Play Billing / Apple IAP on BOTH stores. Never do it in a store build.
//   - Holder-gate (hold CLKN → unlock) is OK on Google (non-custodial balance
//     read), banned on Apple (3.1.1 names "cryptocurrencies and cryptocurrency
//     wallets" as forbidden unlock mechanisms).
//
// Non-interference guarantee: default is "full" with every flag true. The
// Seeker wrapper never sets a param, so nothing changes for the live app.

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SESSION_KEY = "clkn-store-mode";
const COOKIE_KEY = "clkn-store-mode";
const VALID_MODES = ["full", "play", "ios"];

// ── Feature flags per tier ────────────────────────────────────────────────
// Add a flag here, then gate UI with `const { features } = useStoreMode()` and
// `{features.someFlag && <Thing/>}`. Everything true in "full" so the Seeker
// build is unchanged.
const FEATURES = {
  full: {
    school: true,          // Incubator, School of Hard Knocks, Ultimate Challenge, Survival, LP Lab
    library: true,
    freeResearchTools: true, // Cluck Score, Token Autopsy, Wallet Checkup, Trace, Snapshot, Holders
    walletConnect: true,   // MWA / Seed Vault connect
    holderGate: true,      // hold CLKN → unlock advanced/operator tools
    advancedTools: true,   // the operator/premium tools themselves
    bagsFeed: true,        // live Bags.fm launch feed
    airdropClaim: true,    // transcript-claim wallet collection + airdrop list
    tokenPromo: true,      // "buy CLKN", Jupiter buy widget, CLKN price/promo
    hackathon: true,       // grant + hackathon pages/badges
  },
  // Google Play: education + free tools + holder-gated advanced tools.
  play: {
    school: true,
    library: true,
    freeResearchTools: true,
    walletConnect: true,   // needed for the holder-gate
    holderGate: true,      // allowed on Google (balance read, no purchase)
    advancedTools: true,   // unlocked via holder-gate only
    bagsFeed: false,       // dropped (you asked; also avoids token-launch promo)
    airdropClaim: false,   // reward-crypto-for-tasks risk → strip
    tokenPromo: false,     // no buy-CLKN / price promo in a store build
    hackathon: false,      // no grant/hackathon surfaces in a store build
  },
  // Apple App Store: education ONLY. No wallet, no holder unlock (3.1.1).
  ios: {
    school: true,
    library: true,
    freeResearchTools: true,
    walletConnect: false,  // Apple 3.1.1: no crypto-wallet unlock mechanism
    holderGate: false,
    advancedTools: false,  // no unlock path on iOS → not offered
    bagsFeed: false,
    airdropClaim: false,
    tokenPromo: false,
    hackathon: false,
  },
};

const StoreModeContext = createContext({
  mode: "full",
  features: FEATURES.full,
  isFull: true,
  isPlay: false,
  isIos: false,
  isStripped: false,
});

// Detection chain (first match wins), all wrapped so it never throws:
//   1. ?app=play / ?app=ios  → set mode (persist to session + cookie)
//   2. cookie clkn-store-mode → carried from a prior full-page navigation
//   3. sessionStorage         → in-session memory
//   4. otherwise              → "full"
// Legacy "?app=school" is treated as "play" for backward-compat with the
// earlier mockup wrappers.
function detectMode() {
  if (typeof window === "undefined") return "full";
  const persist = (m) => {
    try { window.sessionStorage.setItem(SESSION_KEY, m); } catch {}
    try {
      document.cookie = `${COOKIE_KEY}=${m}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  };
  try {
    const param = new URL(window.location.href).searchParams.get("app");
    if (param === "school") { persist("play"); return "play"; }
    if (param && VALID_MODES.includes(param) && param !== "full") {
      persist(param);
      return param;
    }
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/clkn-store-mode=(play|ios|full)/);
      if (m && m[1] !== "full") return m[1];
    }
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored && VALID_MODES.includes(stored) && stored !== "full") return stored;
  } catch {}
  return "full";
}

export function StoreModeProvider({ children }) {
  // Start "full" to avoid a hydration flash; upgrade post-mount. No-op for the
  // Seeker path since no param is ever present there.
  const [mode, setMode] = useState("full");
  useEffect(() => setMode(detectMode()), []);

  const value = useMemo(() => {
    const m = VALID_MODES.includes(mode) ? mode : "full";
    return {
      mode: m,
      features: FEATURES[m],
      isFull: m === "full",
      isPlay: m === "play",
      isIos: m === "ios",
      isStripped: m !== "full",
    };
  }, [mode]);

  return (
    <StoreModeContext.Provider value={value}>{children}</StoreModeContext.Provider>
  );
}

export function useStoreMode() {
  return useContext(StoreModeContext);
}

// Feature gate. Renders children only when the named feature is on for the
// current tier. Preferred usage:
//   <FeatureGate feature="bagsFeed"><BagsFeed/></FeatureGate>
export function FeatureGate({ feature, children, fallback = null }) {
  const { features } = useStoreMode();
  return features[feature] ? children : fallback;
}

// Back-compat helper from the earlier mockup (hideIn / showOnlyIn by mode).
export function StoreModeGate({ hideIn, showOnlyIn, children }) {
  const { mode } = useStoreMode();
  if (hideIn && (hideIn === mode || (hideIn === "school" && mode !== "full"))) return null;
  if (showOnlyIn && showOnlyIn !== mode) return null;
  return children;
}

export const STORE_MODE_FEATURES = FEATURES;

// ── Server-side note (server.js, main session) ────────────────────────────
// Mirror this on the backend so direct URL probes are blocked, not just hidden:
//   - Read the clkn-store-mode cookie (play|ios) on each request.
//   - In "play": 404 /airdrop, /buyspecial, /rose, /premium, /slots, /bags,
//     /grant, /investors, and the buy-CLKN endpoints.
//   - In "ios": all of the above PLUS the wallet/holder endpoints
//     (/api/wallet/*), since iOS has no wallet flow at all.
// Reviewers probe URLs — frontend flags alone are not enough.
