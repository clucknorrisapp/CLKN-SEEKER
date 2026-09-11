# Build the Google Play app bundle on your Mac

Goal: produce **`app-release.aab`** — the one signed file you upload to Google Play.
You do this on your Mac because the **signing key** should live on a machine you
control, not an ephemeral cloud container. Follow top to bottom. You run each
block in the macOS **Terminal** app (Applications → Utilities → Terminal).

The store bundle itself is already built, reviewed, and pinned (release
`store-google-v1.0.0`, sha256 `189557e7…b96d923`); `npm run build:play` downloads
and checksum-verifies it for you. You are only adding the native Android wrapper +
your signature.

---

## 0) One-time installs (skip any you already have)

**Node.js** — download the macOS **LTS** installer and run it (no Terminal needed):
https://nodejs.org  → then confirm in Terminal:
```bash
node -v && npm -v      # any node 18+ is fine
```

**Android Studio** — gives you the Android SDK *and* a bundled Java, so you don't
install Java separately. Download, drag to Applications, then **open it once** and
let it finish "Downloading Components" (this installs the SDK to
`~/Library/Android/sdk`). https://developer.android.com/studio

---

## 1) One-time: tell Terminal where the SDK + Java are

Paste this whole block once. It appends the two paths to your shell profile and
loads them now. (Uses Android Studio's bundled Java, so no separate JDK.)
```bash
cat >> ~/.zshrc <<'EOF'

# Android build (Cluck Norris)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
EOF
source ~/.zshrc
```
Check the tools now resolve (each should print a path / version, not "not found"):
```bash
echo "$ANDROID_HOME" && keytool -help >/dev/null 2>&1 && echo "keytool OK" && java -version
```
If `keytool` says "not found", your Android Studio is installed under a different
name — tell me and I'll adjust the `JAVA_HOME` line.

---

## 2) Get the wrapper repo on your Mac (once)

Pick a folder you like (example uses your home folder), clone, and check out the
working branch:
```bash
cd ~
git clone https://github.com/clucknorrisapp/CLKN-SEEKER.git
cd CLKN-SEEKER
git checkout claude/cluck-norris-capacitor-setup-jOSpk
git pull
npm install
```
Already have it cloned? Just: `cd ~/CLKN-SEEKER && git checkout claude/cluck-norris-capacitor-setup-jOSpk && git pull && npm install`.

---

## 3) One-time: create your signing key  ⚠️ the most important file

This makes `clkn-edu.jks`. Run it **inside** `~/CLKN-SEEKER`:
```bash
keytool -genkey -v -keystore clkn-edu.jks -alias clkn-edu \
  -keyalg RSA -keysize 2048 -validity 10000
```
It asks for a **keystore password**, then some name/org questions (any real values
are fine — first/last name or "CLKN Productions LLC"), then a **key password**
(press Return to reuse the keystore password — simplest).

> 🔐 **Back this up before you go further.** Copy `clkn-edu.jks` somewhere safe
> (password manager vault, encrypted drive) and save both passwords. If you lose
> them you can't ship updates from the same key. It is **gitignored** — never commit it.

Now tell the build where the key is. Replace `YOURPASSWORD` with what you just set
(if you reused it for both, use it in both lines):
```bash
cat > android/keystore.play.properties <<EOF
storeFile=$HOME/CLKN-SEEKER/clkn-edu.jks
storePassword=YOURPASSWORD
keyAlias=clkn-edu
keyPassword=YOURPASSWORD
EOF
```
(`keystore.play.properties` is also gitignored — it stays on your Mac.)

---

## 4) Build the bundle

```bash
cd ~/CLKN-SEEKER
npm run build:play
```
What happens: it downloads + checksum-verifies the reviewed store bundle, syncs the
Android project, and produces a signed `.aab`. First run compiles a lot — a few
minutes is normal. When it finishes, your file is here:
```
android/app/build/outputs/bundle/release/app-release.aab
```
Confirm it exists:
```bash
ls -lh android/app/build/outputs/bundle/release/app-release.aab
```

---

## 5) Upload to Google Play (internal testing first)

1. Play Console → your app → **Testing → Internal testing → Create new release**.
2. Upload `app-release.aab`. (First upload enrolls you in **Play App Signing** —
   accept it; Google then manages the release key and your `clkn-edu.jks` is your
   *upload* key.)
3. Add yourself as a tester, install on a phone, and **verify the stripped build**:
   the school + Ask Cluck + Wallet Checkup + Listing Checkup work; there is **no**
   swap / wallet-connect / buy / airdrop / prize anywhere.
4. Then fill **Store listing** (copy is in `play-store/listing.yaml`), **Data Safety**
   (mapped in `listing.yaml → data_safety`), and **Content Rating**, and promote to
   Production when you're happy.

Privacy policy URL for the listing: **https://clucknorris.app/privacy/store**
(terms, linked in-app: **https://clucknorris.app/terms/store**).

---

## Rebuilding later
When the store bundle is updated, I bump `store-edition.lock` and you just re-run
**step 4** (`npm run build:play`) — steps 0–3 are one-time. Bump `versionCode` in
`android/app/build.gradle` before each new Play upload (Play rejects a reused code).

## If something errors
Copy the last ~20 lines of output and paste them to me — most failures are a missing
SDK component or a keystore-path typo, both quick to fix.
