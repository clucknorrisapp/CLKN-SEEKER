# Cluck Norris → Google Play: Your Step-by-Step Runbook

A do-this-exactly guide so nothing gets missed. Work top to bottom. Each step has
a **✅ Done when** checkpoint and **⚠️** warnings for the easy-to-mess-up parts.
Three of these phases run in parallel (marked ⟲), so start the slow ones early.

**Who does what:**
- **YOU** = clicking in browsers / dashboards, safeguarding keys, approving.
- **MAIN SESSION** = a Claude session on the `cluck-norris-school` repo (the live site). Hand it `GATING-SPEC.md`.
- **WRAPPER SESSION** = a fresh Claude session on the new `clkn-store` repo. Hand it the new-repo brief.

---

## PHASE 0 — Confirm your starting line (5 min)
You already have:
- ✅ Cluck Norris live on the Solana dApp Store (separate repo, untouched)
- ✅ CLKN Productions LLC formed
- ✅ Privacy + Terms live at `clucknorris.app/privacy` and `/terms`
- ✅ Play listing assets built: `play-store/feature-graphic.png`, `icon.png`, `listing.yaml`
- ✅ `store-mode.jsx` (three-tier + UA detection) written and tested

**⚠️ Do NOT touch the CLKN-SEEKER repo or the live dApp Store app during any of this.** It's done and shipping. Everything below happens in *other* repos.

---

## PHASE 1 ⟲ — Google Play ORGANIZATION account (START TODAY; slowest track)

**1.1 — DUNS number for CLKN Productions LLC — APPLIED ✅ (waiting on issuance)**
- Applied at **dnb.com** (free). You need the 9-digit number *in hand* to finish org verification (1.4).
- **⚠️** The legal name + address you gave D&B must match what you enter in Google **character-for-character**.
- Issuance takes ~1–30 days — the reason this phase started first.

**1.2 — Prep before signup (do while the DUNS processes)**
- **Owner Google account:** use a dedicated one (`clucknorrisapp@gmail.com`), **NOT** a personal account. **Turn on 2FA first** — whoever controls this account controls the Play account forever.
- **Domain email:** set up `support@clucknorris.app` (or similar). Google's org verification prefers an email at your domain over gmail — and Apple will want the same later.
- **Business info** matching the DUNS record: legal name `CLKN Productions LLC`, address, phone, website `https://clucknorris.app`.
- A **card** for the $25 fee.

**1.3 — Create the account as an ORGANIZATION**
- Go to **play.google.com/console/signup**, sign in with the owner account.
- Account type → **"An organization or business"** (NOT "Yourself").
- Enter the organization details (matching the DUNS record) + the **D-U-N-S number**.
- Confirm your details as the **authorized representative**.
- Pay the **one-time $25**.
- Accept the **Developer Distribution Agreement**.
- **✅ Done when:** account created and verification submitted.
- **⚠️ Organization (not Individual) is what exempts you from the 12-tester/14-day rule AND shows "CLKN Productions LLC" as the public developer name instead of your personal name. You cannot change this later without a new account.**

**1.4 — Complete org + identity verification**
- Google verifies the org against the D-U-N-S record and your identity as the rep (email/phone confirmation, sometimes a document request). Respond promptly.
- **✅ Done when:** account status shows **verified** (a few days to ~2 weeks; gated on the DUNS being issued).
- **⚠️ Don't create the app listing until verified** — you can start filling it in, but it can't go live unverified.

---

## PHASE 2 ⟲ — Deploy the site gating (MAIN SESSION; do in parallel with Phase 1)

**2.1 — Hand the gating spec to the main session**
- Open a Claude session on the **`cluck-norris-school`** repo.
- Paste in the full contents of **`play-store/GATING-SPEC.md`**.
- Let it do Parts 1–3 (add `store-mode.jsx`, wrap `<App/>`, `FeatureGate` the UI, add the `server.js` middleware).

**2.2 — Verify on a branch BEFORE it hits `main`**
Ask the main session to run its own verification (Part 4 of the spec), then you personally spot-check on the deployed branch/preview:
- Load the site normally → **everything still there** (this protects the live app). 
- Load `…/?app=play` → **Bags, buy-CLKN, airdrop form, grant/investor links all GONE**; school + free tools still there.
- Load `…/?app=ios` → all that PLUS wallet/holder UI gone.
- **✅ Done when:** all three render correctly AND `curl -A "Mozilla/5.0 ClucknorrisPlay" https://clucknorris.app/bags` returns 404 (ask the session to run this).

**2.3 — Merge to `main` → Railway deploys**
- **⚠️ CRITICAL non-regression check:** immediately after deploy, open `clucknorris.app` in a normal browser and confirm the FULL site is 100% normal (Bags, buy links, everything). The live dApp Store app loads this — if the full site broke, the live app broke. If anything looks off, tell the session to roll back.
- **✅ Done when:** full site normal in a browser, and `?app=play` / `?app=ios` render stripped.

**⚠️ Nothing downstream works until Phase 2 is deployed and verified — the wrapper loads the live site, so if the site doesn't respond to the UA/param, the wrapper won't look stripped.**

---

## PHASE 3 ⟲ — Build the Android wrapper + AAB (WRAPPER SESSION)

**3.1 — Create the new repo**
- On GitHub, create a new **private** repo named **`clkn-store`** under the clucknorrisapp org (empty, no README needed).

**3.2 — Hand the brief to a fresh Claude session on `clkn-store`**
- Give it the **"NEW SESSION BRIEF — clkn-store"** (the wrapper brief from our chat). It will scaffold Capacitor, set `capacitor.config.ts` (appId `app.clucknorris.edu`, the two `appendUserAgent` markers), add Android, generate the upload keystore, and build the signed **AAB**.
- **⚠️ appId `app.clucknorris.edu` is PERMANENT once published.** Confirm you're happy with it before the first upload. It's fine and distinct from the Seeker's `app.clucknorris.school`.

**3.3 — SAFEGUARD THE NEW UPLOAD KEYSTORE**
- The session produces `clkn-edu-upload.jks` + a password. **Save both forever** (password manager + a backup), exactly like you did the dApp Store keystore.
- **⚠️ This is a DIFFERENT key from the Seeker keystore. Losing it means you can't update the Play app.** Do not skip this.

**3.4 — Get the AAB file**
- **✅ Done when:** you have `app-release.aab` saved on your machine.

---

## PHASE 4 — Capture stripped screenshots (after Phase 2 is live)

**4.1 — Load the stripped app view**
- On your phone/emulator or Appetize, open `https://clucknorris.app/?app=play`.
- **⚠️ Confirm it looks stripped** (no Bags, no buy-CLKN, no airdrop). If it still shows the full app, Phase 2 isn't deployed correctly — stop and fix that first.

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
- **iOS App Store** is the remaining track: same `clkn-store` repo (`npx cap add ios`), Mac + Xcode + your iOS-app skill, Apple Developer account ($99/yr) under CLKN Productions LLC, `ios` mode (education-only). Separate runbook when you're ready.

---

## The "don't mess this up" short list
1. **Never touch the live CLKN-SEEKER repo / dApp Store app.**
2. **Org account, not personal** (DUNS required, but no tester rule + LLC name shown).
3. **Save the new `clkn-edu` upload keystore + password forever** (separate from the Seeker key).
4. **Verify the FULL site is normal after the gating deploys** (the live app depends on it).
5. **Screenshots must be of the STRIPPED build** — never the dApp Store shots.
6. **Data Safety + content rating must be truthful** — under-claim if unsure.
7. **`app.clucknorris.edu` is permanent** — confirm before first upload.
8. **Don't submit to Production until you've installed the internal-test build and confirmed it's stripped.**
