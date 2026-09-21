# CluckMWA — the native Mobile Wallet Adapter plugin

Status: **COMPILES, and is present in a real APK** — verified 2026-09-21 by the `android build`
workflow (run 35598997202, `assembleDebug` on the `solana` target, green in 1m50s). This replaces
the previous "written, not compiled" status, which stood because no session container had an
Android SDK.

What that run actually proves, checked against the produced artifact rather than inferred from a
green tick:

| Claim | How it was checked |
|---|---|
| The Kotlin compiles | `assembleDebug` succeeded; `MainActivity.java` *imports* `CluckMWAPlugin`, so javac would have failed had kotlinc not produced the class |
| The plugin is in the shipped app | `app.clucknorris.school.mwa.CluckMWAPlugin` found in `classes6.dex`/`classes7.dex` of the debug APK |
| Every bridged method survived | `connectOrReauthorize`, `signMessages`, `signTransactions`, `signAndSendTransactions`, `deauthorize` all present as dex entries |
| The MWA clientlib resolved | 213 `com/solana/mobilewalletadapter` references in the dex, including `MobileWalletAdapter`, `ActivityResultSender`, `Blockchain`, `Solana` |

⛔ **It does NOT prove a wallet connects, or that anything signs.** That still needs a real device
with a real wallet — the 10-step checklist under "What is unverified" below is unchanged and is
still entirely unexercised. A compiled bridge that has never been handed a wallet is exactly the
kind of thing this repo has shipped broken before.

Branch: `claude/cluck-mwa-plugin` (plugin), `claude/android-ci-compile-check` (the workflow).

## Why this exists

`cluck-norris-school`'s `public/cluck-wallet.js` (the platform repo's one shared wallet layer,
used by ~24 tool pages) already has a Mobile Wallet Adapter code path. It looks for
`Capacitor.Plugins.CluckMWA` and, finding nothing, falls through to legacy/Wallet-Standard
detection — which finds nothing inside a Capacitor WebView either. Until this plugin exists and
ships, **no wallet tool works inside the Cluck Norris Android app.** This plugin is that bridge.

Search `cluck-wallet.js` for `CluckMWA` / `mwaBridge` — its comment block there is the actual
specification this plugin was written against; this document explains the native side of it.

## Where this fits in this repo's architecture (read this before assuming "seeker" target)

This repo (`clkn-seeker`) is **packaging-only** — see its own `CLAUDE.md`. Today it builds three
Capacitor targets from one `android/app` module, selected by `CLKN_TARGET` / Gradle properties:

| Target | Content | Loads |
|---|---|---|
| `solana` (default) | FULL edition, **remote** | `https://clucknorris.app` live — **this is what `cluck-wallet.js`'s MWA path runs inside** |
| `googlePlay` | STORE edition, bundled | this repo's local `dist/` (a pinned platform artifact) |
| `ios` | STORE edition, bundled | same, iOS variant |

There is only **one** Android app module (`android/app`), shared by all three targets — Gradle
properties pick the `applicationId` and keystore, not a separate module. So the plugin added here
compiles into every APK/AAB this module produces:

- For `solana`, it's live and load-bearing: the remote page's `cluck-wallet.js` will find
  `Capacitor.Plugins.CluckMWA` and use it.
- For `googlePlay`/`ios`, it's inert but harmless: per `play-store/STORE-EDITION-MANIFEST.md` /
  `docs/STORE_EDITION.md` (platform repo), the bundled Store edition has no wallet UI to call it
  from, so it just adds a small amount of dead code/APK size.

This repo's own `CLAUDE.md` also describes a **planned, not-yet-created** fourth target, `seeker`
("a real mobile-first app for Seeker... wires the Mobile Wallet Adapter native plugin"). That
target does not exist in `capacitor.config.ts` or `package.json` yet — there is no `build:seeker`
script to run. **This plugin's code does not need to change when that target is created** — it's
already in the one shared `android/app` module. Only `capacitor.config.ts` and `package.json`
would gain a fourth entry. Until then, the device checklist below builds and verifies against the
**`solana`** target, since that's the one that actually loads `cluck-wallet.js` today.

Also confirmed while researching this: `src/wallet-provider.jsx` (this repo's own React
`CluckWalletProvider`, using `@solana-mobile/wallet-adapter-mobile`'s deep-link-based
`SolanaMobileWalletAdapter`) is **not used by any shipped build** — this repo's own `CLAUDE.md`
lists `src/` as a stale copy of product code slated for deletion, and calls out
`wallet-provider.jsx` by name as "not in any shipped build." It is a different, deep-link-based
approach to MWA (works in a plain mobile browser, no native plugin needed) that simply isn't
wired into any of the three live Capacitor targets. **Left in place, not removed** — removing
stale code wasn't in scope here and the repo's own docs already flag it for deletion on its own
schedule (Step 0 of `play-store/WRAPPER-BUILD-TARGETS.md`). Don't confuse it with `CluckMWAPlugin`;
they solve the same problem two different ways and only one of them is live.

## The wire contract

Registered as `CluckMWA` (`@CapacitorPlugin(name = "CluckMWA")`), so JS reaches it at
`Capacitor.Plugins.CluckMWA`. Every method returns a Promise.

```
authorize({ cluster, identity })                              -> { address, authToken }
reauthorize({ authToken })                                     -> { address, authToken }
deauthorize({ authToken })                                     -> {}
signTransactions({ authToken, transactions })                  -> { signedTransactions }  (base64[])
signAndSendTransactions({ authToken, transactions, options })  -> { signatures }          (base58[])
signMessages({ authToken, addresses, messages })                -> { signedMessages }      (base64[])
```

`identity` is `{ name, uri, icon }`. `cluster` is `"mainnet-beta"` in practice (this app is
mainnet-only); `"testnet"` / `"devnet"` are also accepted defensively, anything else defaults to
mainnet.

**Encoding, exactly as specified — do not "fix" the asymmetry:**
- `address`, every transaction/message in and out, and every address are **base64**.
- `signatures` (the array `signAndSendTransactions` returns) is **base58**. This one exception
  matches the Phantom-shaped provider `cluck-wallet.js` builds on top of the bridge, where
  `signAndSendTransaction()` conventionally returns a base58 tx signature and everything else on
  that provider is base64.

**`signMessages`'s `signedMessages[i]` is the raw signature bytes, base64-encoded — not the
signed message.** `cluck-wallet.js`'s `signMessage()` does `b64decode(signedMessages[0])` and
hands that straight back as `{ signature, publicKey }`, matching the standard Phantom
`signMessage()` shape. This is a real, load-bearing detail — get it backwards and every wallet
signature check downstream silently breaks. See the comment on `CluckMWAPlugin.signMessages()`.

**Error codes** (`call.reject(message, code)` — Capacitor surfaces `code` as the rejected error's
`.code` in JS):

| Code | Meaning |
|---|---|
| `MWA_NO_WALLET` | No MWA-capable wallet app is installed/reachable. |
| `MWA_CANCELLED` | The user backed out of the wallet's own UI. **Normal, not a bug** — the JS layer should show "connection cancelled", not an error toast. |
| `MWA_INVALID_ARGS` | The call from JS was missing/malformed a required field. |
| `MWA_FAILED` | Anything else (timeout, protocol error, IO error, invalid/expired auth token, ...). The message carries the library's own diagnostic string. |

`cluck-wallet.js` does not currently branch on these codes (it surfaces whatever the bridge
promise rejects with as a generic error) — giving cancellation its own stable code is what lets a
future small change there show "cancelled" instead of an error message, per the task this plugin
was built for. That JS-side branching was **not** added in this branch (out of scope — this
branch is `clkn-seeker` only) and is a natural next step in the platform repo.

## Exact changes made

### `android/build.gradle`
Added, inside `buildscript`: `ext.kotlin_version = '2.2.21'` and a
`classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"` line. Nothing else in this
file changed — `allprojects.repositories` already had `mavenCentral()`, which is all the new
dependencies below need.

### `android/app/build.gradle`
- `apply plugin: 'kotlin-android'` added right after `apply plugin: 'com.android.application'`.
- `kotlinOptions { jvmTarget = "21" }` added inside the `android { }` block, to match the Java
  `sourceCompatibility`/`targetCompatibility` (`VERSION_21`) that `capacitor.build.gradle` sets —
  a mismatch here is a hard Gradle error ("Inconsistent JVM-target compatibility"), not a warning.
- Two new dependencies:
  - `com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.1.1`
  - `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0`

**Version pins, and why 2.1.1 and not "latest":** the newest stable (non-beta) release on Maven
Central as of writing is `2.2.0` (confirmed via Maven Central's own metadata), but it requires
`compileSdk 37` — this app's `compileSdk` (`android/variables.gradle`) is `36`. Using it would
force an unrelated compileSdk/AGP bump. `2.1.1` requires `compileSdk 36` — an exact match — and
diffing the library's own source between the `v2.1.1` tag and current `main` in
`solana-mobile/mobile-wallet-adapter` shows **zero differences** in every file this plugin uses
(`MobileWalletAdapter.kt`, `AdapterOperations.kt`, `DataModels.kt`, `ActivityResultSender.kt`,
`TransactionParams.kt`, and the underlying `MobileWalletAdapterClient.java`, `Base58.java`). So
2.1.1 costs nothing in capability and avoids a bump nobody asked for. `kotlinx-coroutines-android`
1.11.0 and the Kotlin Gradle plugin version 2.2.21 are the exact versions Solana Mobile's own
`android/gradle/libs.versions.toml` pins at that same `v2.1.1` tag — a combination known to
compile together, not independently guessed version numbers.

**Transitive dependencies pulled in (not extra things to add by hand):**
`mobile-wallet-adapter-clientlib` (the JSON-RPC/session client), `mobile-wallet-adapter-common`
(protocol constants, and `com.solana.mobilewalletadapter.common.util.Base58` — the plugin uses
this for signature encoding; **do not add a second base58 library or hand-roll one**), and
`com.solanamobile:web3-solana` (only present because `clientlib-ktx` depends on it for an
unrelated convenience API this plugin doesn't call).

**AndroidManifest.xml — deliberately NOT touched, and here's why that's correct, not an
oversight:** the `mobile-wallet-adapter-clientlib` module ships its own manifest
(`android/clientlib/src/main/AndroidManifest.xml` in the library) declaring:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<queries>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="solana-wallet" />
    </intent>
</queries>
```
Android's manifest merger folds a library's manifest into the app's automatically. `INTERNET` is
already declared in this app's own manifest; `ACCESS_NETWORK_STATE` and the `<queries>` block for
the `solana-wallet` scheme (needed so the association intent can find an installed wallet app
under Android 11+ package-visibility rules) arrive from the dependency. **Do not add a second
`<queries>` block for `solana-wallet` in `app/src/main/AndroidManifest.xml`** — it would be
redundant at best. This is asserted from reading the library's own manifest source, not verified
by an actual build (see "What is unverified" below for exactly how to check it for real).

### New file: `android/app/src/main/java/app/clucknorris/school/mwa/CluckMWAPlugin.kt`

The plugin itself. One `MobileWalletAdapter` + one `ActivityResultSender` per Activity instance.
Key design points (all explained in inline comments at the relevant spot in the file):

- **`ActivityResultSender` is built once, in `load()`, never lazily inside a method.** Its
  constructor calls `ComponentActivity.registerForActivityResult(...)`, which AndroidX throws on
  if called after the Activity reaches `STARTED`. `Plugin.load()` runs synchronously inside
  `BridgeActivity.onCreate()` (traced through Capacitor 8.3.4's own source:
  `PluginHandle.loadInstance()` calls `setBridge()` then `load()`, and that happens while
  `Bridge.Builder.create()` runs from `BridgeActivity.load()`, called from `onCreate()`), so this
  is provably before `STARTED`.
- **A fresh `MobileWalletAdapter` per call**, not one shared mutable instance — avoids any
  cross-call state bleed (auth token, blockchain) between concurrent or rapid calls.
- **`MobileWalletAdapter.blockchain` defaults to Devnet, not Mainnet** (confirmed from the
  library's own `DataModels.kt`) — every construction site explicitly sets `Solana.Mainnet`. This
  was a real bug caught and fixed while writing this: on an MWA protocol-1 wallet, the `chain`
  parameter is sent even on what's logically "just a reauthorize before signing," so leaving the
  library default in place could have silently targeted the wrong network on those wallets.
- **Cancellation vs. real failure is distinguished by exception type**, not message string
  (message text isn't a documented stable API and can change wording between library versions):
  `InterruptedException` (association intent dismissed), a plain `CancellationException` that
  isn't a `TimeoutCancellationException` (coroutine cancelled outright, e.g. Activity torn down
  mid-flow), or a `JsonRpc20RemoteException` whose code is `ProtocolContract.ERROR_NOT_SIGNED`
  (the wallet's own UI reported the user declined). See `rejectFailure()`'s doc comment for the
  full mapping, cited against the exact upstream `MobileWalletAdapter.kt` catch clauses it mirrors.
- **`authToken` is never a field, never persisted.** Every method takes it as a parameter (from
  the JS call) or a local variable for the duration of one suspend call. The web layer owns
  session lifetime, per the task this plugin was built for.
- **No transaction/signature/authToken is ever logged.** Grep the file for `Log.` — there is none
  touching those values.

### `android/app/src/main/java/app/clucknorris/school/MainActivity.java`

Now overrides `onCreate()` to call `registerPlugin(CluckMWAPlugin.class)` **before**
`super.onCreate(savedInstanceState)`. This is Capacitor's own documented pattern for a plugin that
ships inside the app itself (as opposed to an installed `@capacitor/*` npm package, which gets
auto-discovered via a generated `capacitor.plugins.json` that this plugin, living only in this
app's own source, is never listed in). `registerPlugin()` just appends to the `Bridge.Builder`
that `BridgeActivity` already constructed as a field initializer before `onCreate()` even ran, so
calling it before `super.onCreate()` is safe and is what makes the class available by the time the
Bridge is actually built a few lines later.

## How to build

There is no `build:seeker` script yet (see "Where this fits" above — that target doesn't exist).
To exercise this plugin today, build the **`solana`** target, which is the one that actually loads
`cluck-wallet.js` from the live site:

```
npm install
npm run build:solana
```

That runs `prep:solana`, `npx cap sync android` (which regenerates `capacitor.build.gradle` and
`capacitor.settings.gradle` — do not hand-edit those, they're marked "DO NOT EDIT" in the repo
and this branch doesn't touch them), then `cd android && ./gradlew :app:assembleRelease`, signing
with the existing `keystore.properties` (gitignored, not present in this container — release
builds happen on the owner's Mac per this repo's `play-store/BUILD-ON-MAC.md`).

For a debug build that doesn't need the release keystore (enough for on-device testing):
```
cd android && ./gradlew :app:assembleDebug
```
then install with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## Device checklist — what the owner must do on a real Seeker

**Nothing above this line has been compiled.** This checklist is what actually proves the plugin
works, and it needs a real device (Seeker or any Android phone with a Mobile Wallet Adapter
compatible wallet — Phantom, Solflare, and Backpack all support MWA) plus a real wallet with at
least a tiny amount of SOL for the sign-and-send step. Do it in order; each step assumes the
previous one passed.

1. **Build and install.** `npm run build:solana` (or the debug variant above), install the APK on
   the device, confirm it launches and the WebView loads `https://clucknorris.app` (you should see
   the live Cluck Norris site, not a blank screen or a "can't load" error).
2. **Confirm the bridge is present.** With the app open, get a remote debug console on the WebView
   (`chrome://inspect` on a connected desktop Chrome, since this is a Capacitor Android WebView)
   and evaluate `Capacitor.Plugins.CluckMWA` — it should be a non-null object with the six method
   names on it (`authorize`, `reauthorize`, `deauthorize`, `signTransactions`,
   `signAndSendTransactions`, `signMessages`). If it's `undefined`, the plugin didn't register —
   check `adb logcat` for a `PluginLoadException` around app startup before going further.
3. **Open any wallet tool page in the app** (e.g. `/wallet-checkup` or `/holders`) and tap
   Connect. A wallet chooser (or the device's one installed MWA wallet directly) should appear —
   this is the OS association intent firing, driven by `ActivityResultSender`.
4. **Cancel it deliberately.** Back out of the wallet chooser / decline the connection in the
   wallet's own UI. The page should show a clean "connection cancelled" / not-connected state —
   **no crash, no red error screen, no stuck spinner.** This is the `MWA_CANCELLED` path.
5. **Connect for real.** Pick your wallet, approve the connection. The page should show your
   wallet's address (short form) as connected.
6. **Kill and reopen the app**, or navigate to a different tool page, then hit a wallet-gated
   action again. Confirm it reconnects (or clearly asks you to reconnect) rather than getting
   stuck — this exercises `reauthorize` and confirms the JS layer's own session handling, not just
   a fresh `authorize`.
7. **Sign a message** if any page exposes that (e.g. a "verify wallet ownership" step) — approve
   it in the wallet, confirm the page accepts the result rather than erroring on a malformed
   signature. This is the one that would silently break if `signedMessages[i]`'s meaning (see
   above) were ever inverted.
8. **The real test — sign and send a transaction that moves real value**, on a page that does one
   (a lock-to-earn deposit, a tools-pass SOL payment, anything with a genuine on-chain transfer).
   Approve it in the wallet. Confirm:
   - the wallet showed the CORRECT transaction details before you approved (recipient, amount) —
     this plugin does not alter what it's asked to sign, but this is the step that would catch it
     if something upstream did;
   - the app reports success with a real transaction signature;
   - that signature actually resolves on-chain (paste it into a Solana explorer) and shows the
     expected transfer.
9. **Disconnect** from the wallet UI in the app. Confirm the app's own state clears (shows
   disconnected) and, if easy to check, that the wallet app itself no longer lists Cluck Norris as
   an authorized/connected app.
10. **Repeat steps 3–9 with a second wallet app** if more than one MWA-compatible wallet is
    installed, since different wallets are known to vary slightly in protocol-version behavior
    (see the protocol-1-vs-2 note on `blockchain` above) — this is the scenario that specific fix
    was for, and it can only really be confirmed on-device.

If any step fails, `adb logcat` filtered to the app's process, combined with the WebView remote
console, is the fastest way to see which side (native plugin vs. `cluck-wallet.js`) is at fault —
a native-side rejection surfaces in JS as an `Error` whose `.code` is one of the four codes above.

## What is unverified — read before trusting this on a real device

This was written and reviewed against the actual current source of
`solana-mobile/mobile-wallet-adapter` (cloned read-only while researching this) and Capacitor
8.3.4 (also cloned read-only), not from memory or guessed API shapes. That said, none of it has
been compiled, and the following are real gaps:

1. **It has never been compiled.** No Android SDK / Gradle toolchain was available in the session
   that wrote this. There could be a typo, an import ordering issue, or a Kotlin/Java interop
   detail that only a real `./gradlew` run surfaces. Run a debug build (see above) before relying
   on any of this.
2. **The merged AndroidManifest.xml was reasoned about, not inspected.** The claim that
   `INTERNET`, `ACCESS_NETWORK_STATE`, and the `solana-wallet` `<queries>` entry arrive via the
   library's own manifest (see above) is based on reading that manifest's source in the library
   repo, not on inspecting this app's actual merged manifest. After a real build, check
   `android/app/build/intermediates/merged_manifests/<variant>/AndroidManifest.xml` (path may
   differ by AGP version) and confirm all three are present. If they're missing, add the
   `<queries>` block and `ACCESS_NETWORK_STATE` permission to
   `android/app/src/main/AndroidManifest.xml` by hand.
3. **The exact chain from `Bridge.Builder.create()` to each queued plugin class actually being
   turned into a `PluginHandle` (and thus `load()` called) was traced through
   `BridgeActivity.onCreate()` → `PluginHandle.loadInstance()` (confirmed: `setBridge()` then
   `load()`, in that order) but the `Bridge` constructor's own internal registration of the
   `plugins` list it's constructed with was not read line-by-line.** This is a very standard,
   widely-relied-on Capacitor pattern (their own docs recommend registering exactly this way for
   an app-local plugin), so confidence is high, but it's the one link in the "why `load()` timing
   is safe" argument that wasn't independently verified against Capacitor's own source in full.
4. **Kotlin/Java interop specifics** — e.g. whether `AppCompatActivity` (returned by
   `Plugin.getActivity()`) needs any cast to satisfy `ActivityResultSender`'s
   `androidx.activity.ComponentActivity` constructor parameter — were reasoned from the Java type
   hierarchy (`AppCompatActivity extends FragmentActivity extends ComponentActivity`, so no cast
   should be needed) but not confirmed by an actual compile.
5. **`kotlinOptions { jvmTarget = "21" }` inside the `apply plugin: 'kotlin-android'` DSL** is the
   classic (non-`compilerOptions`) Kotlin Gradle Plugin API. It should still work under Kotlin
   Gradle Plugin 2.2.21 (used in "legacy DSL" compatibility mode), but if Gradle complains about
   it, switch to the newer `kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_21 } }` form
   (the upstream MWA library's own `clientlib-ktx/build.gradle` uses exactly that newer form, for
   reference).
6. **The `rejectFailure()` cancellation detection depends on internal exception shapes** of
   `mobile-wallet-adapter-clientlib-ktx` (`InterruptedException`, `CancellationException` vs.
   `TimeoutCancellationException`, `JsonRpc20RemoteException.code`) that are real as of the pinned
   2.1.1 release but are not a documented, versioned public contract of that library. A future
   library upgrade could restructure them silently. If cancellation ever stops showing as
   "cancelled" and starts showing as a hard error (or vice versa), this is the first place to
   check, and step 4 of the device checklist is what would catch a regression here.
7. **`parseTransactionParams()`'s field names for `options`** (`commitment` /
   `preflightCommitment`, `skipPreflight`, `maxRetries`, `minContextSlot`,
   `waitForCommitmentToSendNextTransaction`) were chosen to match `TransactionParams`'s own
   constructor and common `wallet-adapter`/`web3.js` `SendOptions` naming, but `cluck-wallet.js`'s
   `signAndSendTransaction(tx, options)` never actually constrains what shape `options` is beyond
   "whatever the caller passed" — if a tool page ever passes an `options` object with different
   key names, those fields will just silently read as absent (falling back to `DefaultTransactionParams`
   behavior for that field) rather than erroring. Not a safety issue (nothing is signed
   differently because of it), but worth knowing if a "why didn't skipPreflight take effect"
   question ever comes up.
8. **No integration test exercises any of this**, per the task this was built under — a fake-bridge
   unit test (the way `scripts/wallet-standard-test.cjs` in the platform repo drives a fake
   standard wallet) would only test `cluck-wallet.js`'s JS-side logic, not this native code, and
   was explicitly out of scope: a real connect-and-sign on real hardware, per the checklist above,
   is what closes this out.
