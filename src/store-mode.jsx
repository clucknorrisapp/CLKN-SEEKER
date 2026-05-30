// Store-mode detection + provider for the Cluck Norris React app.
//
// Why this exists:
//   The Solana dApp Store version is full-fat (CLKN payments, slots, airdrop,
//   diploma claim, etc.). The Google Play / Apple App Store version must be
//   stripped down to satisfy their policies (no custom payments for digital
//   goods, no gambling, no reward-crypto-for-tasks, no anti-steering).
//
// How it works (one website, two wrappers):
//   - The full-app wrapper (CLKN-SEEKER) loads https://clucknorris.app — no
//     URL param, mode defaults to "full", nothing changes.
//   - The stripped wrapper (CLKN-EDU, future) loads
//     https://clucknorris.app?app=school — the param flips mode to "school".
//   - Once flipped, the choice is persisted in sessionStorage AND a cookie,
//     so it survives cross-page navigation to the vanilla-HTML tool pages
//     (the cookie lets server.js gate routes too — see follow-up TODOs).
//
// Non-interference guarantee:
//   - Default state is "full". Identical to today's behavior.
//   - "school" mode is opt-in ONLY via a URL param set by the stripped
//     wrapper's capacitor.config.ts. The Seeker wrapper never sets it.
//   - Direct web visitors at clucknorris.app see the full app, same as today.
//   - Every gate is "hide in school mode" — nothing changes for the full app.

import { createContext, useContext, useEffect, useState } from "react";

const SESSION_KEY = "clkn-store-mode";
const COOKIE_KEY = "clkn-store-mode";

const StoreModeContext = createContext({
  mode: "full",
  isFullApp: true,
  isSchoolOnly: false,
});

/**
 * Detection chain (first match wins):
 *  1. URL has ?app=school   → school mode (persist to session + cookie)
 *  2. Cookie clkn-store-mode=school  → school mode (carried from a prior page)
 *  3. sessionStorage clkn-store-mode=school  → school mode (in-session memory)
 *  4. otherwise              → full app
 *
 * Wrapped in try/catch so SSR-ish environments or restrictive contexts
 * never throw — falls back to "full" safely.
 */
function detectInitialMode() {
  if (typeof window === "undefined") return "full";
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("app");
    if (param === "school") {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "school");
      } catch {}
      // Persist as cookie so server.js (and tool pages /score, /autopsy, etc.)
      // can detect store mode across full-page navigations.
      try {
        document.cookie = `${COOKIE_KEY}=school; path=/; max-age=31536000; SameSite=Lax`;
      } catch {}
      return "school";
    }
    if (typeof document !== "undefined" && document.cookie.includes(`${COOKIE_KEY}=school`)) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "school");
      } catch {}
      return "school";
    }
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "school") return "school";
    } catch {}
  } catch {}
  return "full";
}

export function StoreModeProvider({ children }) {
  // Start in "full" to avoid an SSR/hydration flash, then upgrade post-mount.
  // No-op for the Seeker / full-app path because no URL param is ever present.
  const [mode, setMode] = useState("full");

  useEffect(() => {
    setMode(detectInitialMode());
  }, []);

  const value = {
    mode,
    isFullApp: mode === "full",
    isSchoolOnly: mode === "school",
  };

  return (
    <StoreModeContext.Provider value={value}>{children}</StoreModeContext.Provider>
  );
}

export function useStoreMode() {
  return useContext(StoreModeContext);
}

/**
 * Convenience gate for inline JSX. Drop around any block you want hidden in
 * a particular store mode — defaults to passing children through.
 *
 *   // Hide in the stripped Play/App Store build:
 *   <StoreModeGate hideIn="school">
 *     <PremiumPaymentInstructions />
 *   </StoreModeGate>
 *
 *   // Show ONLY in the stripped build:
 *   <StoreModeGate showOnlyIn="school">
 *     <PlainCertificateNote />
 *   </StoreModeGate>
 */
export function StoreModeGate({ hideIn, showOnlyIn, children }) {
  const { mode } = useStoreMode();
  if (hideIn && hideIn === mode) return null;
  if (showOnlyIn && showOnlyIn !== mode) return null;
  return children;
}

// ── List of things the main session will need to gate (reference) ─────────
// Wrap with <StoreModeGate hideIn="school">…</StoreModeGate>:
//   • Premium-tool payment instructions (the "send X.123456 CLKN" UI)
//   • Links / nav to /slots
//   • Links / nav to /airdrop (batch sender) — entry, not the page itself
//   • Airdrop list signup + transcript-claim wallet-address form
//   • Links / nav to /rose, /buyspecial (buy-competition trackers, paid)
//   • "Buy CLKN" buttons + Jupiter buy widgets
//   • CLKN price/promo banners
//   • Live Bags.fm launches feed (debatable — safest to hide)
//
// Plus a follow-up server.js middleware so direct URL visits to /slots,
// /airdrop, /rose, /buyspecial, /premium 404 when the clkn-store-mode=school
// cookie is set. Frontend gating alone isn't enough — reviewers probe URLs.
