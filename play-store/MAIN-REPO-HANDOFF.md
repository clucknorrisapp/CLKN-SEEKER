# Main-Repo Handoff — build the Cluck Norris "Store edition"

**Paste everything below the line into a fresh Claude Code session on the
`cluck-norris-school` (main app) repo. It's self-contained.**

---

## TASK: Build the "Store edition" of Cluck Norris for Google Play & iOS

### Who/what
Cluck Norris (`clucknorris.app`) is a free Solana crypto school + token-research
tools, published by **CLKN Productions LLC**. The FULL app is already live on the
**Solana dApp Store** as a thin Capacitor wrapper that loads the live site. We're now
adding **Google Play** and (later) **iOS** apps. Those stores don't allow the full
crypto feature set, so they get a deliberately smaller **"Store edition."**

### Architecture — DECIDED, do not deviate
The Store edition is a **separate, allow-listed frontend build** — excluded flows are
**ABSENT from the build**, not hidden on the live site with a flag. Reasons:
- A client-side flag is not an authorization boundary.
- The store apps are installed and reviewed; if they loaded the unrestricted live
  site, a routine website change could silently inject a disallowed flow (e.g. a
  "Buy CLKN" link) into an already-approved store app.

So: **do NOT** implement this by pointing the store wrapper at the live site and
hiding buttons, and **do NOT** ship it behind a `?store=1`-type URL flag. Build a
controlled, bundled edition instead.

### Your deliverable
1. A **Store-edition frontend build** produced from this repo's shared code, containing
   ONLY the allow-listed pages/features below. Excluded routes, components, deep links,
   and their API calls must not exist in the build.
2. Published as a **versioned artifact** the mobile wrapper repo pins and bundles — a
   **gzipped tarball** whose entries sit under a single top-level directory such that
   `tar -xzf <artifact>.tgz -C dist --strip-components=1` leaves the built site's
   `index.html` at the root of `dist/`. Name it with a version (e.g. `store-edition-google-1.0.0.tgz`).
3. **Two variants:** `store-google` and `store-ios`. iOS drops everything wallet-related
   (see below); Google keeps the read-only tools' wallet-optional actions.
4. **Server-side defense-in-depth** in `server.js`: any endpoint the Store edition must
   never reach (payments, mint/burn/lock/send, buy, competitions) should refuse callers
   identifying as a store edition. The store wrapper's WebView sends a User-Agent marker
   `ClucknorrisPlay` (Google) / `ClucknorrisIOS` (iOS); gate on that header. (This is
   belt-and-suspenders — the excluded flows are already absent from the build.)

### What's IN / OUT / ADAPT
> ⚠️ **FIRST audit this against the CURRENT code** — the tool lineup drifts. As of a
> 2026-09-09 check the live site has: nav = Education, Tools, Ask Cluck, Enter School,
> Buy CLKN, Coinbase, Investors; tools = Wallet Checkup, Listing Checkup, Wallet X-Ray,
> Cluck Trace, Holders, Owners Snapshot (read-only) and Jup Locker Room, Airdrop,
> Firepit, Token Metadata Lock, Project Burn, LP Rescue, The Hatchery, Buy Special
> (transactional). Reconcile the lists below with what actually exists now.

**IN (Store edition):**
- Entire School: Incubator, School of Hard Knocks, Ultimate Challenge (keep it
  **server-scored** — never ship the answer key to the client), Survival Simulator, LP Lab + calculators
- Library / Chain Info / glossary
- 7 languages, learning progress, bookmarks, read-aloud
- Ask Cluck (AI tutor) — **ADAPT:** add in-app reporting for AI-generated content
  (Google AI policy) and inventory its data collection for the store privacy forms
- Read-only research tools: Cluck Trace, Holders, Owners Snapshot, Wallet Checkup
  (scan only), Listing Checkup, Wallet X-Ray — **ADAPT:** remove any CLKN "pass"/paywall;
  offer these free in the Store edition (or drop the ones that can't be freed)

**OUT (excluded from the build):**
- SOL/CLKN payments to unlock anything; CLKN holder-based unlocks
- Transaction tools: The Hatchery (mint), Firepit (burn), Project Burn, Token Metadata
  Lock, Jup Locker Room (lock), LP Rescue, Airdrop (batch send)
- Buy Special / buy competitions / prizes / reward wheels
- "Buy CLKN" button, "Coinbase" buy link, token price/market-cap banners
- Bags.fm live launch feed
- Investors / grant / fundraising surfaces
- Airdrop signup + transcript **wallet-address collection** (see ADAPT)

**ADAPT:**
- Transcript/credential: keep the certificate, but in the Store edition issue it
  **without collecting a Solana address or offering an airdrop**
- Wallet Checkup's revoke action = an on-chain transaction → keep it in `store-google`
  (user-initiated, not a purchase), **drop it in `store-ios`** (Apple 3.1.1 allows no
  wallet)
- **Educational mentions of Bags/tokens may STAY** where they serve a lesson (e.g. a
  "how a launchpad works" lesson) — it's promotional placement + transaction funnels
  that are OUT, not factual education

**store-ios delta:** everything above, plus no wallet connect at all → drop Wallet
Checkup's revoke and anything that opens/requires a wallet. iOS = pure read + learn.

### Hard constraints
- **Do not break the live full site.** The Seeker dApp Store app loads it; a normal
  visit to `clucknorris.app` must stay 100% unchanged. The Store edition is an
  additional build, not a modification of the live experience.
- Keep exam integrity: `/api/exam/*` stays server-scored; the answer key never ships.
- **Minimum functionality** for store approval: reliable back navigation, saved
  progress, offline lessons if practical (bundling helps), loading/error recovery,
  accessible layouts.
- Reuse shared code — do NOT fork the whole app into a duplicate.

### Suggested approach
Introduce a **feature catalogue / edition** concept: a single declaration of which
pages/components/routes belong to `full` vs `store-google` vs `store-ios`, and generate
the build (navigation, routes, bundled pages, API surface) from it — excluded items
compiled out, not runtime-hidden. (A `store-mode.jsx` feature-flag map already exists in
the wrapper repo as a seed for this; repurpose it as a **build-time include list**, not
runtime hiding.) Then emit the two variant tarballs.

### Done when
- [ ] A `store-google` and a `store-ios` build exist, each containing ONLY allow-listed
      pages/features; excluded routes return nothing / don't exist in the bundle
- [ ] Server refuses store-forbidden endpoints for `ClucknorrisPlay`/`ClucknorrisIOS` UA
- [ ] The live full site + Solana app are provably unaffected
- [ ] Each build is published as a versioned `.tgz` in the artifact format above
- [ ] Exam still server-scored; Ask Cluck has AI-content reporting; a data-collection
      inventory is ready for the store privacy/Data-Safety forms
- [ ] Hand the two artifact URLs + versions back so the wrapper repo pins them in
      `store-edition.lock` and builds the AAB/IPA

### Also queue (separate, small)
- Remove `STRATEGY.md` from git tracking (meant to be local-only) and add to `.gitignore`.
- Check question-bank drift: if any lesson quizzes changed, sync `data/question-bank.json`.

---
*(The wrapper repo's `scripts/prep-dist.mjs` consumes the artifact and `store-edition.lock`
pins the version; that's already scaffolded — you just need to produce and publish the
two `.tgz` builds.)*
