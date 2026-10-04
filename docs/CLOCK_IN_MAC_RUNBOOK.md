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

## 2.0 First, two minutes: does the ORIGINAL key exist anywhere? (decides §2 vs §2-update)

Owner, 2026-10-04: updating the live listing is the better outcome **if and only if** its key
exists. What is known: the live 1.0 APK (downloaded from the portal's R2 store and read on
2026-10-04) is the wrapper's Capacitor `solana` shell, signed with a keytool-made certificate
"CN=Cluck Norris, OU=CLKN, O=Cluck Norris" created **2026-05-28 22:38 UTC**, built in a folder
with no git checkout (`NO_SUPPORTED_VCS_FOUND`) — i.e. a working session's folder, not this
repo, which only got its Capacitor project in September. The owner uploaded the APK to the portal
from an iPad / iPhone / the work desktop. So the key was made by that session and was never on
the work desktop. Places it can still be:

```bash
# the Mac, whole disk
find / \( -name "*.jks" -o -name "*.keystore" -o -name "keystore*.properties" \) 2>/dev/null | grep -v -e /System -e node_modules
```

- **the claude.ai conversation of 2026-05-28** that built the APK — a file it delivered (a
  `.jks` / `keystore.properties`) is still downloadable from that conversation;
- Downloads on the iPad / iPhone (Files app) and the work desktop, dated 28–29 May 2026;
- Android Studio → Build → Generate Signed Bundle / APK remembers its last keystore path.

Any candidate: `keytool -list -v -keystore <file> | grep SHA256` must print
`7A:95:5F:A4:7A:0D:47:FB:A3:45:7F:FF:CC:C3:2E:32:7C:14:B4:EC:7D:4E:87:40:EA:0A:C5:AB:05:D3:97:AA`.

**Found → §2-update.** Put the `.jks` and its password in the password manager FIRST, then write
`android/keystore.properties` exactly as §2a step 3 does (storeFile relative to `android/app/`,
`read -rs`, nothing in history) and run:

```bash
npm run build:seeker-update       # app.clucknorris.school, versionCode 10 / 2.0.0, the ORIGINAL key
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk | grep SHA-256   # must be 7a955fa4…
"$ANDROID_HOME"/build-tools/*/aapt dump badging android/app/build/outputs/apk/release/app-release.apk | head -1
#   expect: package: name='app.clucknorris.school' versionCode='10' versionName='2.0.0'
adb install -r cluck-norris-seeker-2.0.0.apk   # installs OVER the live 1.0; INSTALL_FAILED_UPDATE_INCOMPATIBLE = wrong key, stop
```

Then §4 onward as written (logcat pidof `app.clucknorris.school`), and in §7 the portal step is
the EXISTING "Cluck Norris" app → **New Version** → upload → Submit; no New dApp form, and the
saved `app.clucknorris.seeker` draft is simply never submitted.

**Not found → §2 below, unchanged.** Do not spend the day on it: the search above is the whole
search.

## 2. Make the Seeker key (once, ~2 minutes), then build + sign

**2a. The key.** Generated on the Mac, kept in exactly two places: the owner's password manager
and this gitignored folder (the `.jks` file AND the password — losing this is the hunt that
produced this plan). ⚠️ Codex on 059d26f, P1: a password typed inside a command — a here-doc, an
`export`, a `-storepass` flag — is written to `~/.zsh_history` in clear, where no `.gitignore`
helps. So every secret below is typed at a PROMPT that echoes nothing, never inside a command.

```bash
cd ~/CLKN-SEEKER/android
# 1. The password: generate it IN the password manager (one strong password, used for both the
#    store and the key), save the entry there FIRST, then come back here.
# 2. The keystore. keytool prompts for the password itself (nothing on the command line).
keytool -genkeypair -v -keystore clkn-seeker.jks -alias clkn-seeker -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Cluck Norris, O=Cluck Norris, C=US"
# 3. The properties file. `read -rs` echoes nothing and leaves nothing in history; the file is
#    written by the shell, not pasted. storeFile is RELATIVE TO android/app/ (Gradle's
#    `file()` in app/build.gradle resolves it from the app module — Codex on 059d26f, P2), hence `../`.
read -rs 'PW?keystore password: '; echo
umask 077 && printf 'storeFile=../clkn-seeker.jks\nstorePassword=%s\nkeyAlias=clkn-seeker\nkeyPassword=%s\n' "$PW" "$PW" > keystore.seeker.properties
unset PW
# 4. Prove the three things that matter before building anything.
ls -l clkn-seeker.jks keystore.seeker.properties   # both exist, properties is -rw-------
ls -l app/../clkn-seeker.jks                        # the storeFile path resolves from app/
git status --short                                 # must print NOTHING — both are gitignored
keytool -list -v -keystore clkn-seeker.jks | grep SHA256   # prompts for the password; record this line in the password manager
```

Then attach `clkn-seeker.jks` to the same password-manager entry (file attachment) with the alias
`clkn-seeker` and the SHA256 line. Two copies exist from this moment: the manager and this folder.

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

⚠️ Rewritten after Codex on 059d26f (P2): the config-driven `dapp-store validate / create app /
create release / publish submit` flow is **legacy and no longer in the CLI**, and this repo never
pinned the CLI. The current flow, from docs.solanamobile.com/dapp-store (`submit-new-app`,
`publishing-cli`, read 2026-10-04): **a NEW app is created in the Publisher Portal UI, and the CLI
only ships releases to an app that already exists there with its App NFT.** `dapp-store/
config.seeker.yaml` is therefore the SOURCE for the portal form (copy its texts and media into the
form), not a file the CLI reads.

**7a. Create the app in the portal (browser, publisher wallet in Phantom).**
https://publish.solanamobile.com → bottom-left menu → **Add a dApp → New dApp**. Fill the form
from `dapp-store/config.seeker.yaml` (name, package `app.clucknorris.seeker`, descriptions, URLs,
icon, banner, the seven screenshots). The portal asks the connected wallet — it must be the
publisher wallet `4Ws6…uLs8` (Phantom on the Mac, imported from the phone) — to sign the App NFT
mint; approve every prompt or assets go missing. Storage is already set to the portal-managed R2
bucket (Storage page), so no ArDrive top-up — but the wallet pays rent and fees, hence the ~0.05
SOL. The first release can be submitted right there: **Home → New Version → upload
`cluck-norris-seeker-1.0.1.apk` → Submit**, signing the release mint in the wallet. That is the
whole publish; the CLI below is optional for the first release and the normal path for later ones.

**7b. Later releases (and the first, if preferred) from the CLI.**

```bash
cd ~/CLKN-SEEKER
npx -y @solana-mobile/dapp-store-cli@latest --help      # read the real option list first; pin the version it prints into package.json devDependencies before relying on it
# API key: from the console's API Keys page, stored in the password manager. Typed at a silent
# prompt and fed on STDIN — never `export`ed, never on the command line (shell history).
read -rs 'DAPP_STORE_API_KEY?portal API key: '; echo
printf '%s' "$DAPP_STORE_API_KEY" | npx -y @solana-mobile/dapp-store-cli@<pinned> \
  --keypair ~/.config/solana/clkn-publisher.json \
  --apk-file cluck-norris-seeker-1.0.1.apk \
  --whats-new "First release of the Seeker edition: the school on the device, Rent Reclaim, Firepit, Project Burn, the Locker Room, the Airdropper, in-app swap, Revoke, and the tools pass payable in SKR."
unset DAPP_STORE_API_KEY
```

The portal matches the APK's package name to the app from 7a, mints the release NFT with the
keypair, and submits it. `--keypair` is the publisher wallet `4Ws6…uLs8`: the base58 export from
Phantom becomes a Solana-CLI JSON keypair with one line the cloud session hands over at that
moment; the JSON lives only in `~/.config/solana/` (mode 600) and the password manager, never in
this repo. After it lands, tell the cloud session the new App and release NFT addresses (public).

## Never

- commit `keystore*.properties`, `*.jks`, `.env`, or any key — `git status` before every commit
- keep the new `.jks` in only one place: it goes to the password manager the minute it exists
- type a password or API key inside a command (here-doc, `export`, `-storepass`) — history keeps it
- publish to the dApp Store before the owner says so (only winners must publish, within 30 days)
- move funds from a script — every transaction is a human tap on the phone
