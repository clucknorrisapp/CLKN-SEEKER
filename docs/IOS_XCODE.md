# iOS in Xcode — the Mac mini handoff (2026-09-22)

Owner: *"the iphone duo stuff should be in the mac mini program to look at xcode."* This is the
starting point for that session. Xcode only runs on macOS, so everything below is Mac-side; cloud
sessions write code and docs and cannot open, build or run any of it.

The product plan is in the main repo: `docs/IOS_NATIVE_APP_PLAN.md` — **education-only, no wallet
features** (owner, 2026-09-22), eleven native increments in build order. Nothing starts before the
Seeker submission closes (2026-10-09 06:59 UTC). This document is only *how to get the iOS target
open in Xcode and looking at the right thing.*

## Where the iOS target actually stands

| | State |
|---|---|
| Capacitor target | `ios` in `capacitor.config.ts` — appId `app.clucknorris.edu`, UA marker `ClucknorrisIOS`, bundled (no `server.url`) |
| Xcode project | **does not exist yet.** There is no `ios/` directory; `npx cap add ios` has never been run |
| Pinned frontend | `store-edition.lock` → `ios` **1.0.3** (sourceCommit `dd115d2`, the old reflowed website). The main repo's store edition is **1.1.0** (the Seeker shell, education edition) and **no `store-ios-v1.1.0` release exists yet** |
| Apple developer account | not set up. Not needed for the Simulator; needed for a device, TestFlight, and every native extension in the plan |
| App Store submission | never |

## First session on the Mac, in order

1. **Clone and install** (this branch, `claude/seeker-integration`):
   ```bash
   git clone https://github.com/clucknorrisapp/CLKN-SEEKER clkn-seeker && cd clkn-seeker
   git checkout claude/seeker-integration && npm install
   ```
2. **Get the 1.1.0 iOS bundle released**, otherwise you are looking at last month's website, not
   the app. In the MAIN repo: Actions → `store-edition-release` → Run workflow with
   `variant=ios`, `version=1.1.0`, commit = `main` (`12af876` as of this doc). The release body
   prints `{ version, url, sha256, sourceCommit }`. Paste those four into `store-edition.lock`
   under `ios` and commit. (`scripts/prep-dist.mjs` refuses to build from an unpinned or
   mismatched tarball on purpose — do not fake the pin.)
3. **Create the Xcode project** (one-time; commit the generated `ios/` directory):
   ```bash
   npx cap add ios
   npm run build:ios        # CLKN_TARGET=ios → prep:store (verifies the pin) → cap sync ios
   npx cap open ios
   ```
4. **Run it in the Simulator** — no account needed. Pick a phone first (the shell is built and
   tested at 390×844); then the largest iPhone and an iPad to see how the layout stretches. If
   this Xcode ships a foldable simulator, use it and **write down the inner and outer logical
   dimensions** — the plan's two-pane layout is parameterized on them and nobody has those numbers.
5. **What to look at, and what not to**:
   - The five tabs: School first, Ask Cluck, Wallet Checkup (scan only), Listing Checkup, Daily.
     Certificate of completion at the end of a course. Seven languages from the language pill.
   - Every network call goes to `https://clucknorris.app` from origin `capacitor://localhost`; the
     backend grants CORS to that origin only on the education contract (`STORE_API_RE`) and
     refuses the `ClucknorrisIOS` UA on everything else (403). A wallet-shaped call failing is
     correct, not a bug.
   - Do **not** add wallet connect, signing, a pass sheet or a payment. Owner's scope.
6. **Report back with**: screenshots per device size, the dimensions from step 4, and anything that
   renders wrong at widths the phone build never saw. Those go into the plan's item 1.

## When the Apple account exists

Enrol as an **organization** at sign-up (it is a one-time choice). Then, in Xcode → Signing &
Capabilities, sign `app.clucknorris.edu` with the team, and the plan's extension targets become
buildable in this order: App Clip, Share Extension, Widget/Live Activity, App Intents. The Wallet
pass (plan item 2) needs a Pass Type ID certificate from the developer portal; the `.pkpass` is
generated server-side in the main repo, so that certificate goes to Railway as a secret, never
into either repo.

## Rules that carry over

- The store's legal pages `/privacy/store` and `/terms/store` must stay true to this bundle: no
  wallet, no payments, no address.
- Never commit signing material, the developer-portal certificate, or any key. Never commit a
  model identifier.
- Releases are built on the Mac (`play-store/BUILD-ON-MAC.md` is the Android precedent); a cloud
  session cannot push tags or run Xcode.
