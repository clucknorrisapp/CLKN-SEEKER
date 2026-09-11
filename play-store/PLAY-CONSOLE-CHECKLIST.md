# Play Console checklist — Cluck Norris: Crypto School (app.clucknorris.edu)

Field-by-field companion for the Play Console screens. Copy values straight in.
Source of truth: `play-store/listing.yaml`. Package: **app.clucknorris.edu**.

---

## A. Create app
- App name: **Cluck Norris: Crypto School**
- Default language: **English (United States)**
- App or game: **App**  ·  Free or paid: **Free**
- Tick both declarations (Developer Program Policies; US export laws) → Create app.

## B. Internal testing → Create new release
- Accept **Play App Signing** when prompted (makes clkn-edu.jks the *upload* key).
- Upload `app-release.aab` (from Desktop). Confirm package shows **app.clucknorris.edu**.
- Release name: `1.0 (1)`  ·  Release notes: `Initial release — the free Cluck Norris crypto school.`
- Add yourself under Testers (create an email list with your address). Save → Review → Roll out to Internal testing.
- Install via the internal-testing link on your phone and verify: school + Ask Cluck + Wallet Checkup + Listing Checkup work; **no** swap / wallet-connect / buy / airdrop / prize anywhere.

## C. Store listing (Main store listing)
- **App name:** Cluck Norris: Crypto School
- **Short description (≤80):**
  `A free, no-hype crypto school. Learn wallets, DeFi, and how not to get rekt.`
- **Full description:** paste from `listing.yaml → full_description` (already trimmed to what ships).
- **App icon:** `play-store/icon.png` (512×512)
- **Feature graphic:** `play-store/feature-graphic.png` (1024×500)
- **Phone screenshots:** ⚠️ TODO — capture ≥2 from the INSTALLED internal-testing build
  (school + a tool). Do NOT reuse the Solana dApp Store shots.
- **App category:** Education  ·  **Contact email:** chuck@clucknorris.app
- **Privacy policy:** `https://clucknorris.app/privacy/store`

## D. Data Safety (map to Google's questions)  — full detail in `listing.yaml → data_safety`
Does your app collect or share user data? **Yes.** Declare:
- **App activity → App interactions** — collected; purposes App functionality + Analytics; NOT shared; not required to be optional; no analytics SDK.
- **Device or other IDs** — collected (app-generated random session id backing the certificate, 120-day idle expiry); purpose App functionality; NOT shared.
- **App activity → Other user-generated content** (Ask Cluck questions + reports) — collected; purpose App functionality; **Shared** (Anthropic for AI/translation; ElevenLabs for read-aloud).
- Security: **Encrypted in transit = Yes.** Users can request deletion = **Yes** (clucknorrisapp@gmail.com).
- Declare NOT collected: name/email/phone, location, contacts/photos/files, payment/financial info, wallet address, ads ID / ads SDK.
- Note: addresses pasted into research tools = **ephemeral processing, not "collected"** (sent once to a data provider, not stored).

## E. Content rating (questionnaire)
- Category: **Reference / Education**  ·  Email: chuck@clucknorris.app
- Answers: no gambling / simulated gambling; no real-money or in-app purchases; no user-to-user
  content/social; references crypto/finance concepts (educational). Mascot art shows a cartoon
  holding a stylized stick of dynamite + ammo bandolier — disclose it; may nudge the age rating.

## F. Other required sections (Play won't publish until these are green)
- **App access:** all features available without special access (no login) → declare that.
- **Ads:** app contains **no ads**.
- **Target audience & content:** target 18+ (crypto/finance educational) — keep it out of the
  child/family program.
- **Government apps / Financial features:** declare **not** a financial-products app — it's education
  + read-only research; no trading, no custody, no payments. (If a "crypto/financial features"
  declaration appears, answer that the app does not offer trading, exchange, wallet, or payments.)
- **News / Health:** No.

## Order that unblocks a Production submit
1. Internal-testing upload (B) → device-verify the stripped build.
2. Screenshots from that build (C).
3. Store listing (C) + Data Safety (D) + Content rating (E) + F declarations.
4. Promote the tested release to Production.
