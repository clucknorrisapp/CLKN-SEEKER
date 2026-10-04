# CLOCK IN — the Mac's half: build, sign, install, test, record (2026-10-03)

The Solana Mobile CLOCK IN entry is filled in; what is left is **build → test → submit**.
Submissions close **Thu 2026-10-08 23:59 PT (2026-10-09 06:59 UTC)**.

The cloud session cannot do three things, and the Mac exists for exactly these:

1. **Sign the release APK.** Owner, 2026-10-04: the Seeker edition ships as its **own new dApp
   Store listing, `app.clucknorris.seeker`**, with a **fresh key generated in §2**. (The 2026-10-03
   plan — replace the live `app.clucknorris.school` listing — needed that listing's key, and it
   could not be located on any machine; an update signed by anyone else is refused by Android and
   by the store. The live 1.0 listing is left exactly as it is.)
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
ls android/keystore.seeker.properties 2>/dev/null || echo "no Seeker key yet — §2 makes it"
                                # Gradle resolves it via rootProject.file(), i.e. relative to
                                # android/, NOT the repo root
adb devices                     # the Seeker, USB debugging on, "device" not "unauthorized"
node -p "JSON.parse(require('fs').readFileSync('store-edition.lock','utf8')).seeker"   # a real pin, not undefined
```

If `store-edition.lock` has no `seeker` entry yet, the cloud session has not cut the release —
stop and say so; do **not** fake a pin (the build refuses on purpose).

**The signing key is NEW and made here, once.** Nothing about the live app's key is needed any
more — but if a `.jks` ever turns up, this is how to recognise it, read from the chain on
2026-10-04 (release NFT metadata `cert_fingerprint`, same value on the developer console's
Releases → Fingerprints card):

```
SHA256: 7A:95:5F:A4:7A:0D:47:FB:A3:45:7F:FF:CC:C3:2E:32:7C:14:B4:EC:7D:4E:87:40:EA:0A:C5:AB:05:D3:97:AA
```

`keytool -list -v -keystore <file>.jks | grep SHA256` printing that line = the live
`app.clucknorris.school` key (version 1.0 / versionCode 1). That would reopen the update path, but
it is not the plan and nothing waits on it.

**The publisher wallet** — fee payer of the live release mint and owner / update authority of both
its NFTs — is `4Ws6jXEGQ7MG61Ke8qiuGrXhdcYX2NNVCtg3xRMsuLs8` (App NFT
`AkZnKGXUdKz8MUGEjjgsqsgMH6xXr1LxhQ59sZiumWUs`, release NFT
`6rThiugqQHPMma6Qps8fv8YntktDDPJsnFoKs2XMLGvY`). It is in the owner's Phantom on his phone. The
`-k` keypair handed to `dapp-store` must derive that public key (`solana-keygen pubkey <file>`).
It held ~0.008 SOL on 2026-10-04 — a new app NFT + release NFT need roughly 0.03 SOL of rent and
fees, so **top it up to ~0.05 SOL** before `dapp-store create app`. The developer console's
Storage page is the portal-managed Cloudflare R2 bucket (no Arweave/Irys funding step), and CLI
submission uses an **API key from the console** — password manager / shell env, never
`config.yaml`, never committed.

## 1b. Test TODAY without the key or the pin — the dev build

Device testing does not need the release key. The dev build installs as its own app
(`app.clucknorris.seeker.dev`, debug-signed) BESIDE the live one, so nothing on the phone is
replaced. Build its bundle from the platform repo's `develop` (that is what production gets
once promoted):

```bash
cd ~/cluck-norris-school && git fetch origin develop && git checkout develop && git pull && npm ci
node scripts/build-store-edition.mjs seeker        # → release/store-edition-seeker-<v>.tgz
cd ~/CLKN-SEEKER
CLKN_SEEKER_DEV=1 CLKN_SEEKER_DEV_TGZ="$(ls ~/cluck-norris-school/release/store-edition-seeker-*.tgz | tail -1)" npm run build:seeker-dev
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Run the §4 checklist against it now (use `app.clucknorris.seeker.dev` in the logcat `pidof`).
⚠️ Until the cloud session says production is promoted, the swap, Revoke and the SKR pass call
endpoints the live backend may not have yet — a FAIL there before promotion is expected, note it
and move on. Everything that already worked on the website (school, Ask Cluck, Checkup, Rent
Reclaim, Firepit, tools pass) is a real test today.

## 2. Make the Seeker key (once, ~2 minutes), then build + sign

**2a. The key.** Generated on the Mac, kept in two places only: this gitignored folder and the
owner's password manager (the `.jks` file AND both passwords — losing this is exactly the hunt
that produced this plan). Ask for the passwords interactively; never put them on the command line
where shell history keeps them.

```bash
cd ~/CLKN-SEEKER/android
keytool -genkeypair -v -keystore clkn-seeker.jks -alias clkn-seeker -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Cluck Norris, O=Cluck Norris, C=US"
# it prompts for the keystore password (use one strong password for both store and key)
cat > keystore.seeker.properties <<'EOP'
storeFile=clkn-seeker.jks
storePassword=<the password>
keyAlias=clkn-seeker
keyPassword=<the password>
EOP
git status --short            # must show NOTHING under android/ — both files are gitignored
keytool -list -v -keystore clkn-seeker.jks | grep SHA256   # record this line in the password manager too
```

Then copy `clkn-seeker.jks` into the password manager as a file attachment together with the
password and the alias.

**2b. The build.**

```bash
cd ~/CLKN-SEEKER
npm run build:seeker
# → android/app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
#   the SHA-256 printed here must equal the keytool line from 2a
"$ANDROID_HOME"/build-tools/*/aapt dump badging android/app/build/outputs/apk/release/app-release.apk | head -1
#   expect: package: name='app.clucknorris.seeker' versionCode='1' versionName='1.0.1'
```

Copy it out with a name that reads on its own: `cluck-norris-seeker-1.0.1.apk`.

## 3. Install beside the live app

```bash
adb install -r cluck-norris-seeker-1.0.1.apk
```

It installs as its own app next to the live 1.0 and the `.dev` build; nothing on the phone is
replaced. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` can only mean an older `app.clucknorris.seeker`
signed with a different key is already on this phone (a throwaway from an earlier dry run) —
uninstall THAT one and say so; never touch `app.clucknorris.school`.

Open a log window and leave it running for the whole checklist:

```bash
adb logcat --pid="$(adb shell pidof app.clucknorris.seeker)" | grep -i -E "CluckMWA|Capacitor|chromium|AndroidRuntime"
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

Attach `cluck-norris-seeker-1.0.1.apk` to a GitHub release (the browser's "Attach binaries"
drop zone on the release page) — that asset URL is the "direct download link" the submission
asks for. Tell the cloud session the URL; it updates the submission text and the README.

## 7. Publish the new listing (only on the owner's word — not a hackathon requirement)

Same publisher account (developer console, verified 29 May 2026), same wallet, a NEW app. The
`dapp-store` CLI version the May release used is in `package.json`; `validate` first and let it
say what the console-era flow needs (it may or may not want a `publisher.address`).

```bash
cd ~/CLKN-SEEKER
cp dapp-store/config.seeker.yaml dapp-store/config.yaml.seeker-run.yaml   # work on a copy; the live config.yaml stays
cp android/app/build/outputs/apk/release/app-release.apk dapp-store/app-seeker-release.apk
export DAPP_STORE_API_KEY=...        # from the console's API Keys page (password manager), this shell only
npx dapp-store validate -k ~/path/to/publisher-keypair.json -b "$ANDROID_HOME"/build-tools/<ver> -c dapp-store/config.yaml.seeker-run.yaml
npx dapp-store create app     -k ~/path/to/publisher-keypair.json -c dapp-store/config.yaml.seeker-run.yaml     # mints the app.clucknorris.seeker App NFT
npx dapp-store create release -k ~/path/to/publisher-keypair.json -b "$ANDROID_HOME"/build-tools/<ver> -c dapp-store/config.yaml.seeker-run.yaml
npx dapp-store publish submit -k ~/path/to/publisher-keypair.json -c dapp-store/config.yaml.seeker-run.yaml --requestor-is-authorized --complies-with-solana-dapp-store-policies
```

The CLI writes the minted `address:` lines back into the config copy — that copy is the real
record; keep it (it holds only public addresses) and tell the cloud session the App and release
NFT addresses. The publisher keypair is the wallet `4Ws6…uLs8` exported from Phantom; the one-line
conversion from its base58 export to the JSON the CLI takes is the cloud session's to hand over
at that moment, and the JSON lives only in the password manager and a gitignored folder.

## Never

- commit `keystore*.properties`, `*.jks`, `.env`, or any key — `git status` before every commit
- keep the new `.jks` in only one place: it goes to the password manager the minute it exists
- publish to the dApp Store before the owner says so (only winners must publish, within 30 days)
- move funds from a script — every transaction is a human tap on the phone
