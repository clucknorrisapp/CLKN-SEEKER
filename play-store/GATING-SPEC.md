# Main-Session Gating Spec — make the live site render `play` / `ios` modes

> ## ⚠️ SUPERSEDED MECHANISM — read this first
> This spec originally implemented store modes by **hiding features on the live site**
> (a `?app=play` / User-Agent flag + server 404s). Per the agreed architecture
> (Codex's guidance), that is **not** how we ship the store editions: a client flag is
> not an authorization boundary, and a routine website change could leak an excluded
> flow into an already-reviewed store app.
>
> **The store editions are now built as a separate, allow-listed frontend**, defined by
> **`STORE-EDITION-MANIFEST.md`** — excluded flows are **absent from the build**, not hidden.
>
> Keep only: (1) the **server-side route refusal** in Part 3 as *defense-in-depth* — any
> endpoint the store edition must never reach (payments, mint/burn/lock/send, buy) should
> refuse store-edition callers; and (2) the verification discipline. **Ignore the
> "hide on the live site" mechanism in Parts 1–2 and build from the MANIFEST instead.**

**Paste this whole file into the session working on the public `cluck-norris-school` repo.**

## Context
Cluck Norris is live on the Solana dApp Store (full app). We're adding a stripped
Google Play build (`play` mode) and later an iOS build (`ios` mode), both loading
the live `clucknorris.app` as a thin Capacitor wrapper. The native wrappers signal
their mode via a custom **User-Agent** marker. This spec makes the website respond
to those modes. **Default (no marker) = `full` = today's behavior, unchanged.**

There are three parts: (1) add the store-mode module + provider, (2) hide UI with
feature flags, (3) block routes server-side. Do all three — hiding UI alone is not
enough because reviewers type URLs directly.

---

## ⚠️ FIRST — the live code has drifted; audit against it
This spec's specific code anchors were mapped from a **May 2026 snapshot**. The
live `clucknorris.app` has changed since. A fetch of the live site (2026-09-09)
shows:

**Already gone — no gating needed:** the Bags.fm live feed, the Jupiter buy
widget, the slots feature, on-page token price/market-cap.

**Present now — the REAL surfaces to gate for play/ios:**
- **"Buy CLKN" button** (nav + anywhere) → `tokenPromo`
- **"Coinbase" buy link** (nav) → `tokenPromo`
- **"Investors" link** (+ any grant page/badge still present) → `hackathon`
- Any remaining **airdrop / transcript wallet-address** collection → `airdropClaim`

**New tools since May — review each:** the site now has **Wallet X-Ray, Holders,
Trace** (read-only research → keep in all modes) and **Firepit (burn tokens)** +
**Jup Locker Room (token locking)**, which perform **on-chain transactions** and
need a connected wallet. Put Firepit + Jup Locker behind **`walletConnect`** so
they're **hidden on iOS** (Apple 3.1.1 allows no wallet). On Google they're fine
(user-initiated wallet action, not an in-app purchase) → keep them in `play`.

**Bottom line:** trust the *feature-flag model* and the *server middleware* below,
but **locate the CURRENT components/routes yourself** — the specific names and line
numbers in Parts 2–3 are from the old snapshot and several have changed or vanished.

---

## Part 1 — Add `src/store-mode.jsx` and wrap the app

Create `src/store-mode.jsx` with EXACTLY this content (it's already written and
tested in the CLKN-SEEKER wrapper repo):

```jsx
// Store-mode + feature-flag layer for the Cluck Norris React app.
//   mode "full" → Solana dApp Store (Seeker). No UA marker. Everything on.
//   mode "play" → Google Play. UA marker ClucknorrisPlay. Education + free
//                 tools + holder-gate; no Bags/airdrop/token-promo/hackathon.
//   mode "ios"  → Apple App Store. UA marker ClucknorrisIOS. Education ONLY
//                 (Apple 3.1.1 forbids crypto-wallet unlock → no holder-gate).
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SESSION_KEY = "clkn-store-mode";
const COOKIE_KEY = "clkn-store-mode";
const VALID_MODES = ["full", "play", "ios"];
const UA_MARKERS = { ClucknorrisPlay: "play", ClucknorrisIOS: "ios" };

const FEATURES = {
  full: { school:true, library:true, freeResearchTools:true, walletConnect:true,
    holderGate:true, advancedTools:true, bagsFeed:true, airdropClaim:true,
    tokenPromo:true, hackathon:true },
  play: { school:true, library:true, freeResearchTools:true, walletConnect:true,
    holderGate:true, advancedTools:true, bagsFeed:false, airdropClaim:false,
    tokenPromo:false, hackathon:false },
  ios:  { school:true, library:true, freeResearchTools:true, walletConnect:false,
    holderGate:false, advancedTools:false, bagsFeed:false, airdropClaim:false,
    tokenPromo:false, hackathon:false },
};

const StoreModeContext = createContext({
  mode: "full", features: FEATURES.full, isFull: true, isPlay: false, isIos: false, isStripped: false,
});

function detectMode() {
  if (typeof window === "undefined") return "full";
  const persist = (m) => {
    try { window.sessionStorage.setItem(SESSION_KEY, m); } catch {}
    try { document.cookie = `${COOKIE_KEY}=${m}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
  };
  try {
    const param = new URL(window.location.href).searchParams.get("app");
    if (param === "school") { persist("play"); return "play"; }
    if (param && VALID_MODES.includes(param) && param !== "full") { persist(param); return param; }
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    for (const marker in UA_MARKERS) {
      if (ua.indexOf(marker) !== -1) { persist(UA_MARKERS[marker]); return UA_MARKERS[marker]; }
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
  const [mode, setMode] = useState("full");
  useEffect(() => setMode(detectMode()), []);
  const value = useMemo(() => {
    const m = VALID_MODES.includes(mode) ? mode : "full";
    return { mode: m, features: FEATURES[m], isFull: m==="full", isPlay: m==="play", isIos: m==="ios", isStripped: m!=="full" };
  }, [mode]);
  return <StoreModeContext.Provider value={value}>{children}</StoreModeContext.Provider>;
}
export function useStoreMode() { return useContext(StoreModeContext); }
export function FeatureGate({ feature, children, fallback = null }) {
  const { features } = useStoreMode();
  return features[feature] ? children : fallback;
}
export const STORE_MODE_UA_MARKERS = UA_MARKERS;
```

Then wrap the app root (wherever `<App/>` is rendered, e.g. `src/main.jsx`):

```jsx
import { StoreModeProvider } from "./store-mode.jsx";
// ...
root.render(<StoreModeProvider><App /></StoreModeProvider>);
```

## Part 2 — Hide UI with feature flags (in `src/App.jsx`)

Import once: `import { useStoreMode, FeatureGate } from "./store-mode.jsx";`
Then wrap each surface below so it only renders when its flag is on. Everything is
`true` in `full`, so the live Seeker app is unchanged.

Gate the surfaces that are actually in the CURRENT code (see the audit above):

| Wrap this (find it in current code) | Flag |
|---|---|
| **"Buy CLKN" button/link** (nav + anywhere) | `tokenPromo` |
| **"Coinbase" buy link** (nav) | `tokenPromo` |
| Any **token price / market-cap / "buy the bird"** UI, if present | `tokenPromo` |
| **"Investors" link** + any **grant** page/badge | `hackathon` |
| Any **airdrop / transcript wallet-address collection** still present | `airdropClaim` |
| **Firepit (burn)** and **Jup Locker Room (lock)** — wallet-transaction tools | `walletConnect` (→ hidden on iOS, kept on play) |
| **Holder-gate / WalletWidget / advanced-tool entries** (when added) | `advancedTools` + `walletConnect` (hidden on iOS) |
| ~~Bags feed, slots, Jupiter widget~~ | already removed — no action |

Two patterns, use either:
```jsx
const { features } = useStoreMode();
{features.bagsFeed && <BagsTab />}

// or:
<FeatureGate feature="tokenPromo"><JupiterSwapButton .../></FeatureGate>
```

**Keep in ALL modes:** the School (Incubator, Hard Knocks, Ultimate Challenge,
Survival, LP Lab), the Library, and the free research tools (Cluck Score, Token
Autopsy, Wallet Checkup, Trace). Their flags are `true` everywhere.

**Judgment call:** the *"How Bags.fm Works"* **lesson** (`id: "bags"`) is educational
content, not the live feed — it can stay. Only gate the live Bags **feed** and the
Bags promo/signup links. If you'd rather scrub every Bags mention, also gate the
lesson behind `bagsFeed`. (The owner leans toward removing Bags surfaces, so gating
the lesson too is defensible — decide and be consistent.)

## Part 3 — Block routes server-side (in `server.js`)

Add this ABOVE the `app.get("/bags"...)` etc. route definitions (they're around
lines 4940–5017). It reads the same UA marker the wrappers set:

```js
// --- Store-mode detection + route gating (Google Play / iOS stripped builds) ---
app.use((req, res, next) => {
  const ua = req.headers["user-agent"] || "";
  req.storeMode = ua.includes("ClucknorrisPlay") ? "play"
                : ua.includes("ClucknorrisIOS")  ? "ios"
                : "full";
  next();
});

const STRIPPED_IN_STORE = new Set([
  "/bags", "/airdrop", "/buyspecial", "/rose", "/premium", "/slots", "/grant", "/investors",
]);
app.use((req, res, next) => {
  if (req.storeMode !== "full" && STRIPPED_IN_STORE.has(req.path)) {
    return res.status(404).send("Not found");
  }
  // iOS has no wallet flow at all:
  if (req.storeMode === "ios" && req.path.startsWith("/api/wallet/")) {
    return res.status(404).send("Not found");
  }
  next();
});
```

(If Phase 3's `mountWalletGate` is wired, its `/api/wallet/*` routes are what the
iOS branch blocks. In `play` they stay — Google allows the holder-gate.)

## Part 4 — Verify before you call it done

1. **Full app unaffected:** load `clucknorris.app` normally → everything present (Bags, buy links, etc.). This is the critical non-regression check for the LIVE Seeker app.
2. **Play mode (browser):** `clucknorris.app/?app=play` → Bags tab, buy-CLKN, airdrop form, grant/investor links all GONE; school + free tools present; holder-gate present.
3. **Play mode (server gate):** `curl -A "Mozilla/5.0 ClucknorrisPlay" https://clucknorris.app/bags` → **404**. Same for `/airdrop`, `/grant`, `/investors`, `/buyspecial`, `/rose`, `/premium`, `/slots`.
4. **iOS mode:** `clucknorris.app/?app=ios` → all of the above GONE **plus** wallet-connect / holder-gate gone; `curl -A "...ClucknorrisIOS" .../api/wallet/challenge` → **404**.
5. Deploy to `main` (Railway) only after 1–4 pass.

## Notes
- This is additive and default-safe: no marker/param = `full` = unchanged.
- The UA strings `ClucknorrisPlay` / `ClucknorrisIOS` MUST stay in exact sync with the wrapper repo's `capacitor.config.ts`. Don't rename one without the other.
- Also queue the two other public-repo items still outstanding: remove `STRATEGY.md` from tracking (it's meant to be local-only), and check question-bank drift if any lesson quizzes changed.
