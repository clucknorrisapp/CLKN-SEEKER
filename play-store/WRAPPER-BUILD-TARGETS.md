# Wrapper Repo — 3-Target Build Plan (solana / googlePlay / ios)

How this Capacitor wrapper grows from one live app into three build targets from a
single repo, **without disturbing the live Solana dApp Store app**. Two repos, two
editions, three targets:

| Target | appId | Edition / content | Delivery | Store | Signing |
|---|---|---|---|---|---|
| `solana` | `app.clucknorris.school` | FULL | **remote** — loads `https://clucknorris.app` | Solana dApp Store (LIVE) | existing keystore — **untouched** |
| `googlePlay` | `app.clucknorris.edu` | STORE-Google (per manifest) | **bundled** Store-edition build | Google Play (AAB) | new `clkn-edu` upload key |
| `ios` | `app.clucknorris.edu` | STORE-iOS (manifest minus wallet) | **bundled** Store-edition build | Apple App Store (IPA) | Apple cert on Mac |

**Guiding constraints**
- The `solana` target is live and approved — its config, appId, and signing must stay byte-for-byte as they are. Everything below is additive; `solana` is the default.
- Store targets are **bundled** (Codex's rule: excluded flows absent from the build, not hidden). Bundling also gives offline lessons.
- The wrapper is **packaging-only**: it consumes a versioned Store-edition frontend release built in the MAIN app repo — it does not contain product code.

---

## Step 0 — Slim the wrapper to packaging-only (AFTER porting)
This repo currently also carries a stale copy of the product code (`src/`, `public/`,
`lib/`, `server.js`, `data/`, `hatchery.js`) plus the Phase-3/4 prototypes
(`store-mode.jsx`, `wallet-*.jsx`, `useHolderGate.js`, `lib/wallet-gate.js`).

- **First** port the prototypes into the main app repo (they belong there — the
  feature catalogue seed + the FULL-edition wallet work). **Do not delete them here
  until they're safely in main.**
- Then remove the carried product code. The wrapper keeps only: `capacitor.config.ts`,
  `android/`, `ios/` (later), a generated `dist/`, build scripts, gitignored keystores,
  and the store-asset folders (`dapp-store/`, `play-store/`).

## Step 1 — Target-selected `capacitor.config.ts`
Replace the single config with an env-driven one:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const TARGET = process.env.CLKN_TARGET || 'solana'; // default = live app
const common = { appName: 'Cluck Norris', webDir: 'dist' as const };

const targets: Record<string, CapacitorConfig> = {
  // FULL edition — remote. The live, approved app. Identity + signing frozen.
  solana: {
    ...common,
    appId: 'app.clucknorris.school',
    server: { url: 'https://clucknorris.app', cleartext: false },
  },
  // STORE edition — BUNDLED (no server.url). dist/ is filled with the Store-edition
  // release before sync. The UA marker is kept ONLY as backend defense-in-depth:
  // the bundled free tools still call /api/*, and the server can refuse any endpoint
  // the store edition must never reach.
  googlePlay: {
    ...common,
    appId: 'app.clucknorris.edu',
    android: { appendUserAgent: 'ClucknorrisPlay' },
  },
  ios: {
    ...common,
    appId: 'app.clucknorris.edu',
    ios: { appendUserAgent: 'ClucknorrisIOS' },
  },
};

export default targets[TARGET];
```

## Step 2 — Web content per target (the `dist/` contract)
`npx cap sync` copies `dist/` into the native project. So each build first puts the
right content in `dist/`:
- `solana` → a **minimal placeholder** `dist/index.html` (server.url overrides it anyway).
- `googlePlay` / `ios` → the **Store-edition release** for that platform, fetched from
  the main app repo (see Step 5). iOS pulls the *store-ios* variant (wallet features
  dropped); Google pulls *store-google*.

## Step 3 — Android applicationId + signing per target (preserve Solana)
In `android/app/build.gradle`, make the id and keystore selectable **with Solana as the
default**, so a plain build still produces the exact live app:

```gradle
android {
  defaultConfig {
    applicationId project.hasProperty('clknAppId') ? project.clknAppId : "app.clucknorris.school"
  }
  signingConfigs {
    release {
      // keystore.properties is swapped per target by the build script (Step 4),
      // OR select two properties files by a project property. Solana default = the
      // existing app.clucknorris.school keystore, unchanged.
      def kp = new Properties()
      def f = rootProject.file(project.hasProperty('clknKeystore') ? project.clknKeystore : "keystore.properties")
      if (f.exists()) { kp.load(new FileInputStream(f)) ; storeFile file(kp['storeFile']); storePassword kp['storePassword']; keyAlias kp['keyAlias']; keyPassword kp['keyPassword'] }
    }
  }
}
```
- `solana` build passes nothing → id `app.clucknorris.school`, existing keystore. **Live app preserved.**
- `googlePlay` build passes `-PclknAppId=app.clucknorris.edu -PclknKeystore=keystore.play.properties` (the new `clkn-edu` upload key).

## Step 4 — Build scripts (`package.json`)
```jsonc
"scripts": {
  "prep:solana": "node scripts/prep-dist.mjs solana",     // writes placeholder dist/
  "prep:store":  "node scripts/prep-dist.mjs store",       // pulls Store-edition release into dist/ (variant by CLKN_TARGET)
  "build:solana": "CLKN_TARGET=solana npm run prep:solana && npx cap sync android && (cd android && ./gradlew :app:assembleRelease)",
  "build:play":   "CLKN_TARGET=googlePlay npm run prep:store && npx cap sync android && (cd android && ./gradlew :app:bundleRelease -PclknAppId=app.clucknorris.edu -PclknKeystore=keystore.play.properties)",
  "build:ios":    "CLKN_TARGET=ios npm run prep:store && npx cap sync ios"   // then archive in Xcode
}
```
- `build:solana` → `app-release.apk` (dApp Store), unchanged behavior.
- `build:play` → `app-release.aab` (Google Play), bundled Store edition, `app.clucknorris.edu`.
- **Always sync for the target before building** — never ship a stale sync.

## Step 5 — Consume a *versioned* Store-edition release (the repo boundary)
The main app repo publishes the Store edition as a versioned artifact (a tagged release,
a published tarball, or a committed `dist-store-<version>.zip`). `scripts/prep-dist.mjs`
downloads/unpacks the pinned version into `dist/`. This is the key insulation Codex
wanted: **a routine website change can't alter the installed store app** — the wrapper
only picks up a Store-edition version you explicitly bump.
- Pin the version in a `store-edition.lock` file in this repo.
- Two variants: `store-google` (keeps wallet-capable read tools) and `store-ios`
  (drops them) — `prep:store` selects by `CLKN_TARGET`.

## Step 6 — iOS target (on the Mac, later)
- `CLKN_TARGET=ios npx cap add ios` on macOS.
- Xcode: bundle id `app.clucknorris.edu`, CLKN Productions LLC signing team.
- `npm run build:ios` to sync the store-ios bundle, then Product → Archive → App Store Connect.
- Uses your desktop iOS-app skill; a Linux cloud session can't produce an IPA.

## Preserve-the-live-app checklist (do NOT skip)
- [ ] A no-arg `npm run build:solana` reproduces the current live APK exactly (same appId, same keystore, same remote server.url).
- [ ] The Solana keystore + `keystore.properties` are untouched; the new `clkn-edu` key lives in a separate `keystore.play.properties` (both gitignored).
- [ ] Adding the `googlePlay` target changed nothing about how `solana` builds.

## First-implementation order
1. Port the prototype code to the main repo; confirm; then slim this wrapper (Step 0).
2. Land the env-driven config + Gradle property + build scripts (Steps 1–4). Verify `build:solana` still equals the live app.
3. Once the main repo publishes a `store-google` release, wire `prep:store` (Step 5) and run `build:play` → AAB.
4. Test the AAB on a device (internal testing track) — confirm it's the bundled Store edition, offline-capable, no excluded flows present.
5. Add iOS (Step 6) when ready.
