# CLOCK IN — the Mac's half: build, sign, install, test, record (2026-10-03)

The Solana Mobile CLOCK IN entry is filled in; what is left is **build → test → submit**.
Submissions close **Thu 2026-10-08 23:59 PT (2026-10-09 06:59 UTC)**.

The cloud session cannot do three things, and the Mac exists for exactly these:

1. **Sign the release APK.** The live dApp Store app is `app.clucknorris.school`, signed with the
   key in this repo's gitignored `keystore.properties` on the Mac. Owner, 2026-10-03: the Seeker
   edition **replaces** that listing, so it must be signed with that same key and carry a higher
   versionCode — Android refuses an update that is signed by anyone else.
2. **Talk to the real Seeker over USB** (`adb`): install, read `logcat`, inspect the WebView.
3. **Record the screen** for the demo video.

Everything else (code, releases, the pin, docs, the deck) is the cloud session's.

---

## 0. Paste this into Claude Code on the Mac

> Read `docs/CLOCK_IN_MAC_RUNBOOK.md` in `~/CLKN-SEEKER` (branch `claude/seeker-integration`,
> `git pull` first) and work through it with me. You are the Mac half of the CLOCK IN build: build
> and sign the Seeker release APK, install it on my Seeker over adb, walk me through the device
> checklist one step at a time while you watch `adb logcat`, and record the demo. Never commit
> `keystore*.properties` or any `.jks`. Never move funds yourself — I approve every transaction
> on the phone. Write what passed and what failed to `docs/CLOCK_IN_DEVICE_RESULTS.md` and push
> it to `claude/seeker-integration` so the cloud session can fix failures.

---

## 1. Preconditions (check, don't assume)

```bash
cd ~/CLKN-SEEKER && git checkout claude/seeker-integration && git pull && npm ci
node -v                         # Capacitor 8 needs Node 22+
echo "$ANDROID_HOME"; java -version
ls keystore.properties          # the dApp Store (app.clucknorris.school) key — must exist
adb devices                     # the Seeker, USB debugging on, "device" not "unauthorized"
node -p "require('./store-edition.lock').seeker"   # must be a real pin, not undefined
```

If `store-edition.lock` has no `seeker` entry yet, the cloud session has not cut the release —
stop and say so; do **not** fake a pin (the build refuses on purpose).

`keystore.properties` must be the key the **current dApp Store app** was signed with. Confirm it:

```bash
# fingerprint of the key you are about to sign with
keytool -list -v -keystore "$(grep storeFile keystore.properties | cut -d= -f2)" | grep SHA256
# fingerprint of the app already on the phone
adb shell pm path app.clucknorris.school          # → package:/data/app/.../base.apk
adb pull <that path> current.apk && "$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs current.apk | grep SHA-256
```

The two SHA-256 values must match. If they do not, **stop** — an APK signed with a different key
cannot replace the live app, and the dApp Store would reject it as an update.

## 2. Build + sign

```bash
npm run build:seeker
# → android/app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME"/build-tools/*/aapt dump badging android/app/build/outputs/apk/release/app-release.apk | head -1
#   expect: package: name='app.clucknorris.school' versionCode='10' versionName='2.0.0'
```

Copy it out with a name that reads on its own: `cluck-norris-seeker-2.0.0.apk`.

## 3. Install over the live app

```bash
adb install -r cluck-norris-seeker-2.0.0.apk
```

`-r` keeps the app's data. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means the signature does not
match (§1) — never "fix" it by uninstalling first without saying so, because that would hide
exactly the problem the dApp Store will hit.

Open a log window and leave it running for the whole checklist:

```bash
adb logcat --pid="$(adb shell pidof app.clucknorris.school)" | grep -i -E "CluckMWA|Capacitor|chromium|AndroidRuntime"
```

For the WebView console: desktop Chrome → `chrome://inspect` → the app's WebView → Console.

## 4. Device checklist (owner taps, the Mac watches)

Use a wallet holding only a little SOL. Every transaction is approved by the owner on the phone.
Record PASS / FAIL + the transaction signature for each step in `docs/CLOCK_IN_DEVICE_RESULTS.md`.

| # | Do | Pass when |
|---|---|---|
| 1 | Launch | Lands on the **school**, not a tools grid; no blank screen offline either (airplane mode, relaunch) |
| 2 | School → open a lesson, step through it, finish the quiz | Steps advance; quiz options are shuffled; completion sticks after relaunch |
| 3 | Ask Cluck — one beginner question | An answer arrives; language picker switches the UI |
| 4 | Connect wallet (any wallet pane) | The **MWA sheet** opens (OS hand-off to the wallet app), approve, address shows |
| 5 | Connect → cancel deliberately | Clean "not connected", no crash / spinner |
| 6 | Kill + reopen, wallet action again | Reconnects or asks cleanly (reauthorize) |
| 7 | Tools pass sheet (X-Ray or Holders, wallet that doesn't qualify) | Live CLKN / SKR amounts and SOL terms shown — never fixed numbers |
| 8 | Rent Reclaim / Firepit — close ONE empty account | The wallet's confirm sheet names the same SOL the app showed; app reports landed + explorer link; Rescan does not bring the row back |
| 9 | Swap — smallest amount, e.g. SOL → SKR | Quote → confirm sheet shows route + amounts → sign → landed |
| 10 | Wallet Checkup → an approval → Revoke | Wallet signs; the "chain re-read" line says cleared |
| 11 | Locker Room — open the flow up to the wallet sheet | Wallet asks to sign FIRST (no "may be malicious" warning); cancel unless a real lock is wanted |
| 12 | Airdropper — open it | No pass required (free for everyone) |
| 13 | SKR pass (only once its release is pinned) — pay the 7-day pass in SKR | Amount is live-priced; sign; pass unlocks a heavy tool |
| 14 | Disconnect & clean up card | App shows disconnected; wallet no longer lists the app |

Any FAIL: paste the logcat lines and the console error into the results file and push. Do not
patch app code on the Mac — the frontend is the pinned release from the platform repo; fixes go
there and come back as a new pin.

## 5. Record the demo

Shot list: `docs/SEEKER_DEMO_STORYBOARD.md` in `clucknorrisapp/cluck-norris-school` (90-second
cut; school first, MWA sheet and the wallet's own confirm sheet must be visible in one take).

```bash
brew install scrcpy                     # once
scrcpy --record=clkn-demo-take1.mp4 --no-audio-playback   # mirrors + records the phone
# or, phone-only: adb shell screenrecord --bit-rate 8M /sdcard/take1.mp4 (3-minute cap per file)
```

Upload the final cut to YouTube as **Unlisted**; the link goes in the submission.

## 6. Hand the APK over

Attach `cluck-norris-seeker-2.0.0.apk` to a GitHub release (the browser's "Attach binaries"
drop zone on the release page) — that asset URL is the "direct download link" the submission
asks for. Tell the cloud session the URL; it updates the submission text and the README.

## Never

- commit `keystore*.properties`, `*.jks`, `.env`, or any key
- publish to the dApp Store before the owner says so (only winners must publish, within 30 days)
- move funds from a script — every transaction is a human tap on the phone
