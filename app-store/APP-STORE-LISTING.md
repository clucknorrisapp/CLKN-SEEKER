# App Store (iOS) submission — Cluck Norris: Crypto School

The iOS counterpart to `play-store/`. The **store edition bundle is identical to Google** in
v1 (Ask Cluck + Concierge on home, both Checkups, no wallet/payments/token) — this file is the
Apple-specific listing + submission steps. Bundle id: **app.clucknorris.edu**. Publisher: **CLKN
Productions LLC**.

## App Store Connect — listing fields (iOS has different fields than Play)

- **App Name (≤30):** `Cluck Norris: Crypto School`  (27)
- **Subtitle (≤30):** `Learn crypto with an AI tutor`  (29)
- **Keywords (≤100, comma-separated, no spaces):**
  `crypto,DeFi,wallet,Solana,blockchain,web3,token,education,tutor,AI,beginner,safety,learn,course`
  *(iOS keywords are invisible search terms — don't repeat words already in the name/subtitle.)*
- **Promotional text (≤170, editable anytime without review):**
  `Meet Cluck Norris — a crypto school with a tough-love AI tutor on the home screen. Learn wallets, DeFi, and how to stay safe. No signup, no wallet, no hype.`
- **Description (≤4000):** *(Apple allows "free" here — no promo-word restriction like Play's short desc)*
  ```
  No participation trophies. No hand-holding. Just hard knocks.

  Cluck Norris is a free crypto school built to keep beginners alive long enough to actually understand crypto — before it teaches them the hard way. New here? Tell Cluck where you're starting and he points you to the right first step.

  YOUR AI TUTOR — free, no signup, no wallet:
  • Ask Cluck: a tough-love AI crypto tutor right on the home screen and inside every lesson — ask anything, get a straight answer
  • "Where do I start?": pick your path — brand new, know the basics, liquidity pools, token research — and jump straight in

  THE SCHOOL:
  • The Incubator: beginner lessons on wallets, tokens, on/off-ramps, DEXs, and liquidity
  • School of Hard Knocks: progressive lessons with a Freshman-to-Emeritus belt ranking
  • LP Lab: a hands-on liquidity course with interactive calculators
  • Seven languages, saved progress, and read-aloud

  FREE SAFETY TOOLS — read-only, no wallet connection:
  • Wallet Safety Checkup: scan any Solana address for lingering token approvals, honeypots, and freeze/mint risk
  • Listing Checkup: sanity-check a token's on-chain details before you touch it

  Guardrails first: the app never takes custody, never asks for your seed phrase, and shows a stay-safe checklist on every action. Learn the game before it costs you.
  ```
- **Support URL:** `https://clucknorris.app`
- **Marketing URL (optional):** `https://clucknorris.app`
- **Privacy Policy URL:** `https://clucknorris.app/privacy/store`
- **Category:** Primary **Education**; Secondary (optional) Reference or Finance — *avoid Finance* to
  stay education-forward.
- **Copyright:** `2026 CLKN Productions LLC`

## Assets
- **App icon: 1024×1024 PNG, NO alpha, NO rounded corners** (Apple rounds them). ⚠️ We only have
  512×512 today — need a 1024 (higher-res mascot export or a clean upscale).
- **Screenshots (required):** at least one **6.9"/6.7" iPhone** set (1290×2796 or 1284×2778).
  Capture from the **iOS Simulator** (no Apple account needed) once the store-ios bundle is pinned:
  home (Ask Cluck + Concierge), a lesson, Ask Cluck answering, a Checkup. iPad shots optional
  unless you enable iPad.

## App Privacy ("nutrition label") — mirror the Play Data Safety
Data collected, all **"not linked to you," not used for tracking:**
- **Identifiers** → an app-generated session id (certificate) — App Functionality.
- **Usage Data** → product interaction / lesson progress — App Functionality + Analytics.
- **User Content** → Ask Cluck questions + reports — App Functionality.
- **NOT collected:** name/email/phone, location, wallet address, contacts, financial info. No tracking, no ads SDK.

## Age rating
Answer the questionnaire like Google's: no violence/sexual/gambling/drugs; **unrestricted web
access = No** (bundled app, not a browser); references to crypto/finance = educational. Lands 4+.

## ⚠️ Apple review notes (Guideline 3.1.1 — the crypto one) — WRITE THIS IN "App Review Information → Notes"
> Cluck Norris is an education-only build. It contains NO cryptocurrency wallet, NO wallet
> connection, NO in-app purchases, NO token/crypto payments, and NO on-chain transactions of any
> kind. It teaches crypto safety and offers two read-only, informational lookups (Wallet Checkup,
> Listing Checkup) that never move funds or connect a wallet. The AI tutor (Ask Cluck) includes an
> in-app "report this answer" control. Nothing in the app unlocks features for money or tokens.

This is the single most important thing for Apple — it pre-empts a 3.1.1 rejection by making the
"no crypto mechanisms" case explicit. (Same reason we stripped the build.)

## Build → submit (once Apple account is active + store-ios pinned)
1. `npx cap add ios` (scaffold the iOS project) — one-time.
2. `npm run build:ios` (prep store-ios bundle + `cap sync ios`).
3. `npx cap open ios` → Xcode: set Team (your Apple Developer account), Bundle ID
   `app.clucknorris.edu`, version 1.0 / build 1.
4. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
5. In App Store Connect: attach the build to the version, fill the listing above, screenshots,
   privacy, age rating, the 3.1.1 review note → **Submit for Review**.

## Before the account is ready (do now — no Apple account needed)
- ✅ Draft listing copy (this file).
- ⬜ Produce the **1024×1024 icon**.
- ⬜ When store-ios is pinned: `build:ios` → run in **Simulator** → verify + capture iOS screenshots.
