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
| Pinned frontend | `store-edition.lock` → `ios` **1.1.0** (the Seeker shell, education edition; release `store-ios-v1.1.0` cut by the owner 2026-09-22 23:38 UTC from main `12af876`, pinned at 23:40). Until then it was 1.0.3, the old reflowed website |
| Apple developer account | not set up. Not needed for the Simulator; needed for a device, TestFlight, and every native extension in the plan |
| App Store submission | never |

## First session on the Mac, in order

1. **Clone and install** (this branch, `claude/seeker-integration`):
   ```bash
   git clone https://github.com/clucknorrisapp/CLKN-SEEKER clkn-seeker && cd clkn-seeker
   git checkout claude/seeker-integration && npm install
   ```
2. **The 1.1.0 iOS bundle is released and pinned — DONE 2026-09-22** (`store-ios-v1.1.0` from
   main `12af876`, sha256 `36e1fa02…`, in `store-edition.lock`). For the NEXT bump, the procedure
   is: main repo → Actions → `store-edition-release` → Run workflow (`variant=ios`, the version in
   `store-edition.json`, the exact main commit), then paste the release body's
   `{ version, url, sha256, sourceCommit }` into the lock. (`scripts/prep-dist.mjs` refuses an
   unpinned or mismatched tarball on purpose — never fake the pin.)
3. **Create the Xcode project** (one-time; commit the generated `ios/` directory):
   ```bash
   npx cap add ios
   npm run build:ios        # CLKN_TARGET=ios → prep:store (verifies the pin) → cap sync ios
   npx cap open ios
   ```
4. **Run it in the Simulator** — no account needed. Pick a phone first (the shell is built and
   tested at 390×844); then the largest iPhone and an iPad to see how the layout stretches. Then the
   **iPhone Duo simulator** (Xcode 27.1 beta, iOS 27.1 runtime selected — see the section below):
   run every pose (closed, open, rotated, half-folded) and **write down the inner and outer
   logical dimensions in points** — the plan's two-pane layout is parameterized on them and nobody
   has those numbers.
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

## iPhone Duo — what Apple has published (checked 2026-09-22)

- **The device is official**: announced 2026-09-09, on sale 2026-10-23. Two displays — a
  **5.4-inch outer** (iPhone-mini-sized) and a **7.6-inch inner** (the largest iPhone display).
  Apple's name is **iPhone Duo** (the "Fold" / "Ultra" names were rumours).
- **The tooling exists**: **Xcode 27.1 beta** (released 2026-09-18) ships the iOS 27.1 SDK and an
  iPhone Duo simulator that opens, closes, rotates and partially folds the device. It needs an
  **Apple-silicon Mac on macOS 26.6 or later**, downloaded from developer.apple.com. ⚠️ The Duo
  simulator only appears once the **iOS 27.1 runtime** is installed and selected — early
  developers missed that and thought it was absent.
- **Apple's guidance page**: "Preparing your app for iPhone Duo" (developer.apple.com →
  technologyoverviews). The rules that matter for us, a Capacitor WebView app:
  1. **The fold is a live resize, not a relaunch.** The app must keep its state when the phone
     opens or closes. For us that is the WebView resizing: the React shell already re-flows on
     resize, but nothing has ever been tested across an inner↔outer switch mid-lesson (the plan's
     item 1 is exactly this test).
  2. **Size classes, not orientation checks.** Closed = ordinary iPhone size classes; open =
     regular×regular, i.e. **the inner display is iPad-shaped for layout**, and it does not honour
     the app's supported-orientation list. In CSS terms: design the open pose like the iPad width,
     with container queries, not `orientation:` media queries.
  3. **Safe areas are asymmetric.** Left and right insets differ; handle each side on its own
     (`env(safe-area-inset-left)` / `-right` separately, never one padding for both).
  4. **Reserved regions (iOS 27.1 API)**: `.division` is the fold line (active only when folded,
     zero-width when flat) and `.occlusion` is the under-display camera. A WebView does not see
     these; a Capacitor plugin would have to bridge `reservedRegions` to JavaScript if the two-pane
     layout ever needs to avoid the crease. Standard native containers avoid them for free; our
     shell is not native, so this is on us.
  5. **Apps built against the iOS 26 SDK need an iOS 27 rebuild** for basic Duo compatibility;
     apps built for **iOS 27.1** get the full inner display. So the Xcode project from step 3
     should be created and built with Xcode 27.1 from the start.
- Xcode 27.1 also ships an **App Resizability modernization skill** (a coding-agent skill that
  finds and fixes resizability issues) and a resizable Simulator. Worth running against the shell
  once it opens.

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
