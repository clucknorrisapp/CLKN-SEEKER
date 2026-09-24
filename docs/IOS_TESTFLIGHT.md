# iOS TestFlight upload — `.github/workflows/ios-testflight.yml`

How to ship the pinned `ios` store-edition bundle (`store-edition.lock`) to TestFlight, and what
to do the first time it fails on signing. Companion to `docs/IOS_XCODE.md` (the Mac/Xcode
handoff) — this document is CI-side and needs no Mac.

## The secrets

**Already set on this repo** (Account Holder, 2026-09-24) — names only, values are never in this
repo or in any workflow log:

- `ASC_API_KEY_P8` — the contents of the App Store Connect API key's `.p8` file
- `ASC_API_KEY_ID` — that key's ID
- `ASC_API_ISSUER_ID` — the App Store Connect issuer ID the key belongs to

These three are enough for **cloud (managed) signing**: `xcodebuild -allowProvisioningUpdates`
uses them to mint or renew the distribution certificate and provisioning profile itself, and the
same key authenticates the upload. No certificate secret is required for this path.

**Optional, not yet set** — only needed if cloud signing ever fails for an account-permission
reason:

- `IOS_DIST_P12_BASE64` — a pre-issued Apple Distribution identity, base64-encoded `.p12`
- `IOS_DIST_P12_PASSWORD` — that `.p12`'s export password

The workflow checks for both together; if either is missing it skips the fallback cleanly and
relies on cloud signing alone. Setting only one does nothing (both are required to import).

**Team ID** (not a secret, it's public metadata): `6WAQ6L3CN3` — already written into
`ios/App/App.xcodeproj/project.pbxproj` (`DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE = Automatic`) and
into the workflow's `TEAM_ID` env and `ExportOptions.plist`.

## How to trigger it

GitHub → this repo → **Actions** → **iOS TestFlight** (left sidebar) → **Run workflow**.

Inputs, all optional:

- **version** — MARKETING_VERSION to stamp. Leave blank to use whatever version is currently
  pinned for `ios` in `store-edition.lock` (the workflow reads the lock at run time, so this
  never goes stale).
- **build_number** — CURRENT_PROJECT_VERSION. Leave blank to use the run's own number
  (`github.run_number`), which is unique and monotonically increasing — good enough for
  TestFlight's "each build number must be higher than the last" rule as long as runs aren't
  re-triggered out of order.
- **submit** — `true` (default): archive, export, and upload to App Store Connect. `false`:
  archive and export only; the signed `.ipa` is attached to the run as the `cluck-ios-ipa`
  artifact and nothing is sent to Apple.

## A first-run failure on "no signing certificate" / provisioning

If the archive step fails with something like *"No signing certificate 'iOS Distribution'
found"* or *"Communication with Apple failed"* even though the three ASC secrets are set, it
usually means the App Store Connect API key's role can't create a NEW distribution certificate
by itself (Apple caps how many exist, and the key's assigned role matters). Two ways forward,
in order:

1. Check the key's role in App Store Connect → Users and Access → Integrations. It needs at
   least **App Manager** to manage certificates/profiles on your behalf via
   `-allowProvisioningUpdates`.
2. If that's not enough, add the **optional `.p12` fallback** — a certificate and private key
   pre-issued on someone's Mac, imported into a throwaway CI keychain for the run. Steps the
   owner runs once, on the Mac with the Apple Developer account:

   1. **Xcode → Settings → Accounts** → select the Apple ID / team → **Manage Certificates…** →
      **+** → **Apple Distribution**. Xcode creates the certificate and private key in the login
      keychain.
   2. **Keychain Access** (Applications → Utilities) → find the new **Apple Distribution:
      Cluck Norris Productions (or team name)** certificate under *login* → expand it so both
      the certificate and its private key are visible → select **both** → right-click →
      **Export 2 items…** → format **Personal Information Exchange (.p12)** → save as
      `cert.p12` → set an export password (needed again in step 3).
   3. In Terminal:
      ```
      base64 -i cert.p12 | pbcopy
      ```
      Paste the clipboard as the repo secret `IOS_DIST_P12_BASE64` (GitHub → Settings →
      Secrets and variables → Actions → New repository secret). Add the export password from
      step 2 as `IOS_DIST_P12_PASSWORD`.
   4. Delete the local `cert.p12` once both secrets are saved — it's the plaintext export of a
      distribution identity.
   5. Re-run the workflow. It picks up both secrets automatically (no workflow edit needed) and
      imports the identity before archiving.

## What a green run means, and what it doesn't

✅ the app archived, was signed/exported for App Store distribution, and (when `submit=true`)
uploaded to App Store Connect.

❌ it does **not** mean Apple has finished processing the build or that TestFlight review has
passed — that's Apple's own pipeline, typically 10–30 minutes after a successful upload, and
nothing in this workflow can see the outcome. Check **App Store Connect → TestFlight** for the
build's processing status.

## What this workflow cannot verify

No container running this workflow's author has Xcode or an Apple Developer login, so
`xcodebuild` itself was never run here — only `node --check`-equivalent validation (YAML
structure, the existing `scripts/prep-dist-guard-test.mjs`) and reading the generated Xcode
project by hand. The scheme, target name, bundle ID, versions and `DEVELOPMENT_TEAM` were all
read directly from `ios/App/App.xcodeproj/project.pbxproj`; a shared scheme
(`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`) was added because none existed —
`npx cap add ios` only ever produced Xcode's per-user, uncommitted scheme, which a fresh CI
checkout has no access to. The first real run of this workflow is this project's first time an
`xcodebuild archive` of it has ever executed anywhere.
