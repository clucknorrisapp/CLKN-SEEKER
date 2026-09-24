# iOS TestFlight upload — `.github/workflows/ios-testflight.yml`

How to ship the pinned `ios` store-edition bundle (`store-edition.lock`) to TestFlight, and what
to do the first time it fails on signing. Companion to `docs/IOS_XCODE.md` (the Mac/Xcode
handoff) — this document is CI-side and needs no Mac.

## Signing — the `.p12` Apple Distribution identity is the SUPPORTED path

This workflow signs with a **pre-issued `.p12` Apple Distribution identity**, imported into a
throwaway CI keychain on every run. That is not a fallback — it is the only path this workflow
takes, and the archive step fails fast (before touching Xcode) if the two secrets below aren't
both set.

- `IOS_DIST_P12_BASE64` — a pre-issued Apple Distribution identity, base64-encoded `.p12`
- `IOS_DIST_P12_PASSWORD` — that `.p12`'s export password

### Why not cloud (managed) signing?

`xcodebuild -allowProvisioningUpdates` *can* mint a brand-new distribution certificate on its
own, using nothing but an App Store Connect API key — but only when that key holds the **Admin**
role. The key on this repo (Account Holder, 2026-09-24: `ASC_API_KEY_P8`, `ASC_API_KEY_ID`,
`ASC_API_ISSUER_ID`) is deliberately **App Manager**, and that is staying App Manager — it is not
a temporary gap to fix later. **Do not ask for an Admin-role key to make cloud signing work.**
Admin on an App Store Connect API key can invite/remove users, manage other people's keys, and
change the team's agreements — well beyond what a CI signing step needs. App Manager is the
correct, narrower grant for what this workflow actually does: build and upload app binaries.

App Manager **can** still do two of the three things `-allowProvisioningUpdates` is used for
here, so the flag stays on the archive and export calls:

- create/renew the **App Store provisioning profile** that pairs with an *existing* certificate
- register app IDs / capabilities if the project ever needs a new one

What App Manager **cannot** do is mint a brand-new **distribution certificate** from nothing —
that's the Admin-only step, and it's the one this workflow deliberately avoids needing by using a
certificate someone already created on a Mac (see below) instead of asking CI to create one.

**Team ID** (not a secret, it's public metadata): `6WAQ6L3CN3` — already written into
`ios/App/App.xcodeproj/project.pbxproj` (`DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE = Automatic`) and
into the workflow's `TEAM_ID` env and `ExportOptions.plist`.

## The secrets

**Already set on this repo** (Account Holder, 2026-09-24) — names only, values are never in this
repo or in any workflow log:

- `ASC_API_KEY_P8` — the contents of the App Store Connect API key's `.p8` file
- `ASC_API_KEY_ID` — that key's ID
- `ASC_API_ISSUER_ID` — the App Store Connect issuer ID the key belongs to

These authenticate the provisioning-profile step and the export/upload — they do not sign the
binary. Signing is `IOS_DIST_P12_BASE64` / `IOS_DIST_P12_PASSWORD` below, and **both must be set
before the first run** — this is the prerequisite, not an optional add-on.

## Prerequisite (first run only): producing and adding the `.p12`

**Required before the workflow can archive anything.** Steps the owner runs once, on a Mac with
the Apple Developer account:

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
5. Run the workflow. It imports the identity into a throwaway CI keychain before archiving, and
   the keychain is deleted at the end of the run whether it succeeds or fails.

## How to trigger it

GitHub → this repo → **Actions** → **iOS TestFlight** (left sidebar) → **Run workflow**.

Inputs, all optional:

- **version** — MARKETING_VERSION to stamp. Leave blank to use whatever version is currently
  pinned for `ios` in `store-edition.lock` (the workflow reads the lock at run time, so this
  never goes stale).
- **build_number** — CURRENT_PROJECT_VERSION. Leave blank to use
  `<run number><run attempt>` (e.g. run 42, first attempt → `421`). ⚠️ **A re-run of a failed
  upload reuses the same `github.run_number`** — plain `github.run_number` alone would submit the
  same build number twice and TestFlight requires each one to be strictly higher than the last.
  Appending the run **attempt** number (which does increment on a re-run) keeps a retried run from
  colliding with the one that failed. If you type your own build number in by hand for a re-run,
  you're responsible for bumping it yourself.
- **submit** — `false` (default): archive and export only; the signed `.ipa` is attached to the
  run as the `cluck-ios-ipa` artifact and nothing is uploaded to Apple. The owner ticks this to
  `true` for a specific run when ready to actually publish to TestFlight — an upload only ever
  happens on that explicit per-run choice, never by default.

⚠️ **Even a `submit=false` run is not a fully offline dry run.** The archive and export steps both
pass `-allowProvisioningUpdates`, which authenticates to App Store Connect with the ASC API key
and can create or renew the App Store provisioning profile on the team account regardless of
`submit`. Only the final "upload the binary" action is gated by `submit`.

## A first-run failure on "no signing certificate" / provisioning

If the archive step fails before even reaching `xcodebuild` with a message naming
`IOS_DIST_P12_BASE64` / `IOS_DIST_P12_PASSWORD`, that's expected on a first run — see
"Prerequisite" above; add those two secrets and re-run.

If it fails **inside** `xcodebuild` with something like *"No signing certificate 'Apple
Distribution' found"* even though both `.p12` secrets are set, check:

- the `.p12` password secret matches what was set when it was exported (step 2 above)
- the certificate is an **Apple Distribution** (not "Apple Development" / "iOS Distribution" —
  Xcode 15+'s unified "Apple Distribution" type is what `CODE_SIGN_IDENTITY="Apple Distribution"`
  in the workflow expects)
- the ASC API key's role in App Store Connect → Users and Access → Integrations is still at least
  **App Manager**, needed for the provisioning-profile side of `-allowProvisioningUpdates`

Do not respond to this by requesting an Admin-role API key — see "Why not cloud (managed)
signing?" above for why that's off the table. The fix is always on the `.p12` / App Manager side.

## What a green run means, and what it doesn't

✅ the app archived, was signed/exported for App Store distribution, and (when `submit=true`)
uploaded to App Store Connect.

❌ it does **not** mean Apple has finished processing the build or that TestFlight review has
passed — that's Apple's own pipeline, typically 10–30 minutes after a successful upload, and
nothing in this workflow can see the outcome. Check **App Store Connect → TestFlight** for the
build's processing status.

## Xcode/SDK version and App Store post-processing rejection (ITMS-90725)

A `select Xcode and log its version` step runs before the build, picks the
highest-versioned `/Applications/Xcode*.app` on the runner, and prints both the Xcode version and
the available `iphoneos` SDK. This exists because Apple's post-upload processing can reject an
already-uploaded build **days later** with ITMS-90725 ("unsupported Xcode/SDK version") if the
runner's default Xcode is older than Apple currently requires — by the time that email arrives,
nothing else records which Xcode/SDK actually produced the rejected build. If that ever happens,
the fix is a newer `macos-*` runner image (which ships newer Xcode versions) — check that step's
log on the run in question first.

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
