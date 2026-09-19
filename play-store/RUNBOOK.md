# Cluck Norris → Google Play: Your Step-by-Step Runbook

A do-this-exactly guide so nothing gets missed. Work top to bottom. Each step has
a **✅ Done when** checkpoint and **⚠️** warnings for the easy-to-mess-up parts.
Three of these phases run in parallel (marked ⟲), so start the slow ones early.

**Who does what:**
- **YOU** = clicking in browsers / dashboards, safeguarding keys, approving.
- **MAIN SESSION** = a Claude session on the `cluck-norris-school` repo (the live site). Hand it `MAIN-REPO-HANDOFF.md` + `STORE-EDITION-MANIFEST.md` (draft) + `DELIVERY-CONTRACT.md`.
- **WRAPPER SESSION** = a session on the **existing wrapper repo (CLKN-SEEKER, this repo)** — where the live Solana app already lives. The Google/iOS build targets are added *here* (no new repo); the Solana target stays untouched.

---

## PHASE 0 — Confirm your starting line (5 min)
You already have:
- ✅ Cluck Norris live on the Solana dApp Store (separate repo, untouched)
- ✅ CLKN Productions LLC formed
- ✅ Privacy + Terms live at `clucknorris.app/privacy` and `/terms`
- ✅ Play listing assets built: `play-store/feature-graphic.png`, `icon.png`, `listing.yaml`
- ✅ Wrapper 3-target scaffolding landed in this repo (`capacitor.config.ts`, `scripts/prep-dist.mjs`, `store-edition.lock`, `build:play`)

**⚠️ The Google/iOS targets are added in THIS wrapper repo — that's expected.** What you must NOT disturb is the **Solana target** itself: its `app.clucknorris.school` appId, its keystore/signing, and its remote `server.url`. A no-arg `build:solana` must always reproduce the live app. The live *published* dApp Store app is unaffected regardless (it's already out); this is about keeping future Solana rebuilds identical.

---

## PHASE 1 ⟲ — Google Play ORGANIZATION account (START TODAY; slowest track)

**1.1 — DUNS number for CLKN Productions LLC — OBTAINED ✅**
- Received (kept in your password manager / with the LLC docs — deliberately **not** committed to this repo). You'll reuse the same number for the Apple org enrollment later.
- **⚠️** When you enter it in Google, the legal name + address must match the D&B / DUNS record **character-for-character**.
- **Note:** a brand-new DUNS can take a few days to become verifiable by Google — if signup can't validate it, wait 2–3 days and retry (do **not** re-apply for a second DUNS).

**1.2 — Prep before signup (do while the DUNS processes)**
- **Owner Google account:** `clucknorrisapp@gmail.com` (decided — a gmail login is fine; it's the private owner and is never shown publicly). **Turn on 2FA** (authenticator app) — whoever controls this account controls the Play account forever. *(Can migrate the owner to a Workspace `@clucknorris.app` account later; not required.)*
- **Public support/contact email:** `chuck@clucknorris.app` (Cloudflare forward). This goes in the listing's support-email field, so what the public sees is the LLC name + a domain email — not the gmail login.
- **Business info** matching the DUNS record: legal name `CLKN Productions LLC`, address, phone, website `https://clucknorris.app`.
- A **card** for the $25 fee.

**1.3 — Create the account as an ORGANIZATION — DONE ✅** (org account created + $25 paid)
- Go to **play.google.com/console/signup**, sign in with the owner account.
- Account type → **"An organization or business"** (NOT "Yourself").
- Enter the organization details (matching the DUNS record) + the **D-U-N-S number**.
- Confirm your details as the **authorized representative**.
- Pay the **one-time $25**.
- Accept the **Developer Distribution Agreement**.
- **✅ Done when:** account created and verification submitted.
- **⚠️ Organization (not Individual) is what exempts you from the 12-tester/14-day rule AND shows "CLKN Productions LLC" as the public developer name instead of your personal name. You cannot change this later without a new account.**

**1.4 — Complete org + identity verification — DONE ✅** (account fully verified)

> **PHASE 1 COMPLETE.** Google Play org account is live + verified under CLKN Productions LLC.
> The account is no longer a blocker — the only thing gating launch now is the **build**
> (Store edition → wrapper AAB), then the listing (Phase 5) + submit.
- Google verifies the org against the D-U-N-S record and your identity as the rep (email/phone confirmation, sometimes a document request). Respond promptly.
- **✅ Done when:** account status shows **verified** (a few days to ~2 weeks; gated on the DUNS being issued).
- **⚠️ Don't create the app listing until verified** — you can start filling it in, but it can't go live unverified.

---

## PHASE 2 ⟲ — Build the Store edition (MAIN SESSION; parallel with Phase 1)

The Google Play / iOS app is a **separate, bundled, allow-listed frontend** — NOT the
live site with hidden flags. The main repo builds it and publishes a versioned artifact
the wrapper bundles.

**2.1 — Hand the build to the main-repo session**
- Open a Claude session on **`cluck-norris-school`**.
- Give it `play-store/MAIN-REPO-HANDOFF.md`, plus `STORE-EDITION-MANIFEST.md` (a **DRAFT** — it reconciles against current code) and `DELIVERY-CONTRACT.md`.
- It reconciles scope, then builds the Store edition per the contract: bundled, **hash routing**, absolute **`API_BASE=https://clucknorris.app`**, backend **CORS** for the webview origins, exam still server-scored, Ask-Cluck AI-content reporting.

**2.2 — Both sessions agree the contract §9 items FIRST**
- `API_BASE` + exact CORS origins; the endpoint allow-list; any Capacitor plugin; the artifact publish URL. Lock these before implementation so neither side builds on assumptions.

**2.3 — Publish the artifact + protect the live app**
- Main repo publishes `store-edition-google-<version>.tgz` and hands back its **URL + sha256 (+ sourceCommit)**.
- **⚠️** The main session must NOT change the live full-site experience — the Solana app loads it. The Store edition is an ADDITIONAL build. Confirm `clucknorris.app` is 100% normal in a browser after any main-repo deploy.
- **✅ Done when:** a published `store-google` artifact URL + sha256 is in hand.

**⚠️ Nothing downstream builds until this artifact exists — the wrapper bundles it.**

---

## PHASE 3 — Build the Google Play AAB (THIS wrapper repo; after the artifact exists)

**No new repo.** The existing wrapper repo grows a `googlePlay` target (already
scaffolded: `capacitor.config.ts`, `scripts/prep-dist.mjs`, `store-edition.lock`, the
`build:play` script). The Solana target is preserved and unchanged.

**3.1 — Pin the Store-edition artifact**
- In `store-edition.lock`, set `google` → `{ version, url, sha256, sourceCommit }` from what the main repo published. (Come back to this wrapper session and I'll do it + verify the checksum wiring.)

**3.2 — Land the build.gradle change + build**
- Apply the Gradle-property appId/keystore selection from `WRAPPER-BUILD-TARGETS.md`, then `npm run build:play` → signed `app-release.aab`, bundling the pinned, checksum-verified Store edition. Runs on a **toolchain** (your Mac / a provisioned session), not this container (no Android SDK here).
- **⚠️ Preserve Solana:** a no-arg `npm run build:solana` must still reproduce the live app (appId `app.clucknorris.school`, same keystore, remote `clucknorris.app`). Verify once on the toolchain before shipping any Solana update.

**3.3 — SAFEGUARD THE NEW UPLOAD KEYSTORE**
- `build:play` signs with a **NEW `clkn-edu` upload key** (separate from the Seeker key), referenced via `keystore.play.properties` (gitignored). **Save the `.jks` + password forever** — losing it = can't update the Play app. Google Play App Signing manages the final signing key.
- **⚠️ appId `app.clucknorris.edu` is PERMANENT once published** — distinct from the Seeker's `app.clucknorris.school` so both coexist.

**3.4 — Get the AAB file**
- **✅ Done when:** you have a signed `app-release.aab` built from the pinned Store edition.

---

## PHASE 4 — Capture stripped screenshots (after Phase 2 is live)

**4.1 — Load the stripped Store-edition view**
- Best: install the **internal-testing AAB** on a device (Phase 7.1) and screenshot there. Alternatively, screenshot the main repo's Store-edition preview build.
- **⚠️ Confirm it looks stripped** (no Bags, no buy-CLKN, no airdrop, no wallet). If it shows the full app, the wrong artifact got bundled — stop and fix (check `store-edition.lock` / the published artifact).

**4.2 — Capture ≥ 4 phone screenshots**
- Good ones: home/landing (stripped), a lesson, the Ultimate Challenge, LP Lab, a free tool (Cluck Score). **Portrait.**
- **⚠️ Do NOT reuse the dApp Store screenshots** — they show the Bags feed / full app and will contradict the stripped listing (a rejection risk and a policy inconsistency).
- **✅ Done when:** you have 4–8 portrait screenshots of the *stripped* app saved.

---

## PHASE 5 — Create the Play listing (after account is verified)

**5.1 — Create the app in Play Console**
- Play Console → **Create app**. Name: `Cluck Norris: Crypto School`. Default language: English (US). Type: **App**. Free.
- Accept the declarations.

**5.2 — Fill the store listing** (copy from `play-store/listing.yaml`)
- **App name:** `Cluck Norris: Crypto School`
- **Short description** and **Full description:** paste from `listing.yaml` (the education-forward copy).
- **App icon:** upload `play-store/icon.png` (512×512).
- **Feature graphic:** upload `play-store/feature-graphic.png` (1024×500).
- **Phone screenshots:** upload the Phase 4 stripped screenshots.
- **Category:** Education. **Contact email:** `clucknorrisapp@gmail.com`.
- **✅ Done when:** the listing page shows all green/complete.

**5.3 — Privacy policy**
- Enter `https://clucknorris.app/privacy`.
- **✅ Done when:** saved (it's live, so it validates).

---

## PHASE 6 — Compliance forms (mandatory; be accurate)

**6.1 — Data Safety form**
- Use the DRAFT in `play-store/listing.yaml` (`data_safety:`) as your answer sheet, but **read each answer and confirm it's true for the stripped build** before submitting.
- Key answers: collects analytics (app activity) + optional wallet/lookup addresses; **encrypted in transit: yes**; **deletion available: yes** (via email); **nothing sold**; **no** name/email/location/financial-account/keys collected.
- **⚠️ Data Safety is a binding declaration. If in doubt on any line, under-claim what you collect and confirm with the main session what the stripped build actually sends.** Getting this wrong is a common rejection/enforcement cause.

**6.2 — Content rating questionnaire**
- Category: Reference/Education. Answer honestly: **no gambling** (slots dropped), **no real-money transactions**, no user-generated content.
- **⚠️** When asked about violence/imagery, disclose that the mascot holds a **stylized cartoon stick of dynamite + ammo bandolier** (brand art). It's cartoonish, not realistic — but declare it; it may bump the age rating a notch, which is fine.
- **✅ Done when:** a rating is issued.

**6.3 — Other declarations**
- **Target audience & content:** select the age groups; if you don't want a "designed for children" designation, keep it general-audience/adult (crypto content → not for kids). 
- **Ads:** declare whether the app shows ads (it doesn't → "No").
- **News/COVID/Financial features:** answer as applicable (it's educational; not a regulated financial product — the stripped build has no payments and no exchange/wallet-custody features).

---

## PHASE 7 — Upload, test, submit

**7.1 — Upload the AAB to a testing track first**
- Play Console → **Testing → Internal testing → Create release**.
- Upload `app-release.aab`. Add yourself as a tester. 
- **⚠️ As an ORG account you don't need the 12-tester/14-day closed test — but still install the internal-testing build on a real device and click through it once.** Confirm it loads the STRIPPED site (no Bags/buy/airdrop) and the school works.
- **✅ Done when:** you've installed it from the internal-test link and verified it's the stripped experience.

**7.2 — Promote to Production**
- Play Console → **Production → Create release** → add the same AAB (or promote the tested one).
- Fill "Release notes" (from `listing.yaml` `whats_new`).
- Review the summary; resolve any red warnings.
- **Roll out to Production.**
- **✅ Done when:** status shows "In review."

**7.3 — Review wait**
- Google review is typically **hours to a few days** for a verified org account.
- Result emails to `clucknorrisapp@gmail.com`.
- **✅ Done when:** status = "Published" → live on Google Play.

---

## PHASE 8 — After it's live
- Grab the Play Store URL, add it wherever you list the dApp Store link.
- For updates: bump `versionCode` in the wrapper, rebuild the AAB with the SAME upload keystore, upload a new Production release. Content changes need no new AAB (they flow from the live site, same as the Seeker app).
- **iOS App Store** is the remaining track — and it is **NOT a prerequisite for the Play launch; Google Play ships first.** Same wrapper repo (CLKN-SEEKER): `CLKN_TARGET=ios npx cap add ios` on a Mac + Xcode + your iOS-app skill, Apple Developer account ($99/yr) under CLKN Productions LLC, bundling the `store-ios` artifact (education-only). Separate runbook when you're ready.

---

## The "don't mess this up" short list
1. **Never disturb the Solana target** — appId `app.clucknorris.school`, its keystore/signing, remote `server.url`. The Google/iOS targets are additive in this same wrapper repo; a no-arg `build:solana` must still reproduce the live app.
2. **Org account, not personal** (DUNS required, but no tester rule + LLC name shown).
3. **Save the new `clkn-edu` upload keystore + password forever** (separate from the Seeker key).
4. **Verify the FULL site is normal after any main-repo deploy** (the live Solana app loads it).
5. **Screenshots must be of the STRIPPED build** — never the dApp Store shots.
6. **Data Safety + content rating must be truthful** — under-claim if unsure.
7. **`app.clucknorris.edu` is permanent** — confirm before first upload.
8. **Don't submit to Production until you've installed the internal-test build and confirmed it's stripped.**
