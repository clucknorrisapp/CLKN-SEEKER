# iOS TestFlight upload — `.github/workflows/ios-testflight.yml`

How to ship the pinned `ios` store-edition bundle (`store-edition.lock`) to TestFlight, and what
to do the first time it fails on signing. Companion to `docs/IOS_XCODE.md` (the Mac/Xcode
handoff) — this document is CI-side and needs no Mac.

## Signing — MANUAL signing, `.p12` identity + a `sigh`-fetched profile

This workflow signs with **manual signing** (`CODE_SIGN_STYLE=Manual`): a **pre-issued `.p12`
Apple Distribution identity**, imported into a throwaway CI keychain on every run, paired with an
**App Store provisioning profile fetched through fastlane's `sigh`**, authenticated with the App
Manager API key. That is not a fallback — it is the only path this workflow takes, and the
archive step fails fast (before touching Xcode) if the two `.p12` secrets below aren't both set.

- `IOS_DIST_P12_BASE64` — a pre-issued Apple Distribution identity, base64-encoded `.p12`
- `IOS_DIST_P12_PASSWORD` — that `.p12`'s export password

### Why manual signing, not automatic

Run 2 of this workflow
(https://github.com/clucknorrisapp/CLKN-SEEKER/actions/runs/36016225616) got all the way through
API-key parsing, `.p12` import ("1 identity imported"), Xcode/SDK selection and package
resolution, then failed at the archive step with:

> App has conflicting provisioning settings. App is automatically signed for development, but a
> conflicting code signing identity Apple Distribution has been manually specified. Set the code
> signing identity value to "Apple Development" in the build settings editor, or switch to manual
> signing.

That's automatic signing's own logic working as designed, not a fluke: `CODE_SIGN_STYLE=Automatic`
tells Xcode to pick its own identity and auto-manage a matching profile, and forcing
`CODE_SIGN_IDENTITY=Apple Distribution` on top of that is a direct contradiction — automatic
signing expects a development identity for a development-style automatic flow. This runner's
keychain holds only the imported Distribution identity from the `.p12` (by design: the App
Manager API key cannot mint a certificate of any kind, so there is no development identity for
automatic signing to fall back to either). The only way to use a Distribution identity here is to
tell Xcode exactly which identity and which profile to use — `CODE_SIGN_STYLE=Manual`,
`CODE_SIGN_IDENTITY=Apple Distribution`, `PROVISIONING_PROFILE_SPECIFIER=<profile name>` — and
supply that profile ourselves rather than asking `-allowProvisioningUpdates` (which only ever
pairs with automatic signing) to manage it.

The profile itself still comes from App Store Connect through the App Manager key — App Manager
**can** create and download an App Store provisioning profile, it just can't mint a certificate.
The workflow fetches it with **fastlane's `sigh`** (`fastlane sigh --api_key_path … --app_identifier
app.clucknorris.edu --team_id 6WAQ6L3CN3 --output_path … --filename AppStore.mobileprovision`),
reads the profile's `Name` and `UUID` back out with `security cms -D` + `plutil -extract` (fastlane
sets `SIGH_NAME`/`SIGH_UUID` as *lane* variables inside a `Fastfile`, which this workflow doesn't
use — it calls `sigh` directly as a shell command, so the name/UUID are parsed from the downloaded
`.mobileprovision` itself and exported to `$GITHUB_ENV` for the archive/export steps), and passes
that name as `PROVISIONING_PROFILE_SPECIFIER`. `ExportOptions.plist` is built the same way —
`signingStyle: manual`, `signingCertificate: Apple Distribution`, `provisioningProfiles: {
"app.clucknorris.edu": "<profile name>" }` — so the export/re-sign step doesn't fall back to
automatic either.

### Why not cloud (managed) signing?

`xcodebuild -allowProvisioningUpdates` *can* mint a brand-new distribution certificate on its
own, using nothing but an App Store Connect API key — but only when that key holds the **Admin**
role. The key on this repo (Account Holder, 2026-09-24: `ASC_API_KEY_P8`, `ASC_API_KEY_ID`,
`ASC_API_ISSUER_ID`) is deliberately **App Manager**, and that is staying App Manager — it is not
a temporary gap to fix later. **Do not ask for an Admin-role key to make cloud signing work.**
Admin on an App Store Connect API key can invite/remove users, manage other people's keys, and
change the team's agreements — well beyond what a CI signing step needs. App Manager is the
correct, narrower grant for what this workflow actually does: build and upload app binaries.

App Manager **can** still do the thing this workflow needs from it, just not through
`-allowProvisioningUpdates` (that flag only pairs with automatic signing, and automatic signing is
what run 2 proved doesn't work on this runner — see above): the `fastlane sigh` step fetches/creates
the **App Store provisioning profile** that pairs with the already-imported `.p12` certificate,
authenticated with the same App Manager key.

What App Manager **cannot** do is mint a brand-new **distribution certificate** from nothing —
that's the Admin-only step, and it's the one this workflow deliberately avoids needing by using a
certificate someone already created on a Mac (see below) instead of asking CI to create one.

**Team ID** (not a secret, it's public metadata): `6WAQ6L3CN3` — already written into
`ios/App/App.xcodeproj/project.pbxproj` (`DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE = Automatic`) and
into the workflow's `TEAM_ID` env and `ExportOptions.plist`. **`CODE_SIGN_STYLE = Automatic` in
the project file is intentional and left alone** — the owner's local Xcode should keep automatic
signing for day-to-day use; the workflow overrides it to `Manual` on the `xcodebuild` command line
only, which wins over the project setting for that one invocation.

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

⚠️ **Even a `submit=false` run is not a fully offline dry run.** The `fastlane sigh` step (before
archiving) authenticates to App Store Connect with the ASC API key and can create or renew the App
Store provisioning profile on the team account regardless of `submit`; the export step still
carries `-allowProvisioningUpdates` for the upload path. Only the final "upload the binary" action
is gated by `submit`.

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
  **App Manager**, needed for `fastlane sigh` to fetch/create the App Store provisioning profile

If the `fastlane sigh` step itself fails with a certificate mismatch (the App Store profile it
finds/creates doesn't pair with the `.p12` identity that was imported), the step prints both
identities' SHA-1 fingerprints — from `security find-identity -v -p codesigning` on the CI
keychain, and from the downloaded profile's own `DeveloperCertificates` via `openssl x509
-fingerprint`. Compare them; a mismatch means either the wrong `.p12` was exported, or App Store
Connect has more than one Apple Distribution certificate on the team and the profile is pinned to
a different one than the `.p12`.

Do not respond to either failure by requesting an Admin-role API key — see "Why not cloud
(managed) signing?" above for why that's off the table. The fix is always on the `.p12` / App
Manager side.

⚠️ **Uncertainty about `sigh`'s exact CLI surface.** No container running this workflow's author
has `fastlane` installed, so `fastlane sigh --help` was never run here — the flags used
(`--api_key_path`, `--app_identifier`, `--team_id`, `--output_path`, `--filename`,
`--skip_certificate_verification`) are fastlane's long-documented, stable names for `sigh`, and
the workflow calls `sigh` directly as a one-off shell command rather than through a `Fastfile`
lane, so the `SIGH_PROFILE_PATH` / `SIGH_UUID` / `SIGH_NAME` environment variables `sigh` is
documented to set on completion are **not** relied on — the profile's `Name` and `UUID` are read
back out of the downloaded `.mobileprovision` with `security cms -D` + `plutil -extract` instead,
which does not depend on fastlane's lane-context behavior at all. If a real run shows `sigh`
rejects one of these flags on the runner's installed fastlane version, that is the first thing to
adjust — the fallback of parsing the profile file directly should still hold.

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

No container running this workflow's author has Xcode, `fastlane`, or an Apple Developer login, so
neither `xcodebuild` nor `fastlane sigh` was ever run here — only `python3`/PyYAML validation of
the workflow YAML, `git diff --check`, the existing `scripts/prep-dist-guard-test.mjs`, and reading
the generated Xcode project by hand. The scheme, target name, bundle ID, versions and
`DEVELOPMENT_TEAM` were all read directly from `ios/App/App.xcodeproj/project.pbxproj`; a shared
scheme (`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`) was added because none
existed — `npx cap add ios` only ever produced Xcode's per-user, uncommitted scheme, which a fresh
CI checkout has no access to. The manual-signing `sigh` fetch was written from reading fastlane's
published `sigh` documentation, not from running it — see the "Uncertainty about `sigh`'s exact CLI
surface" note above. The first real run of this workflow is this project's first time an
`xcodebuild archive` of it has ever executed anywhere.

## Looking at develop in Xcode without a release

The workflow above ships a **pinned** `ios` bundle from `store-edition.lock` — that needs a git tag
only the owner pushes, which is correct for anything that ships. But looking at what's on the
school repo's `develop` branch in your own Xcode, on your own Mac, shouldn't need a tag at all.
`ios-dev` is that path: an unpinned, locally built copy of the education edition, installed under
its own app id so it sits beside the real store app instead of replacing it.

```
git pull origin claude/seeker-integration
npm run build:ios-dev
open ios/App/App.xcodeproj
```

`npm run build:ios-dev`:

1. clones (or updates a cached clone of) `clucknorrisapp/cluck-norris-school` at `develop` into
   `.cache/cluck-norris-school` (override the ref with `CLKN_REF=<branch|sha> npm run build:ios-dev`),
   `npm ci`s it, and runs `node scripts/build-store-edition.mjs ios` there — the exact same build
   the pinned release path consumes, just not tagged or checksummed against `store-edition.lock`;
2. drops the resulting tarball into `dist/` via `prep-dist.mjs ios-dev`, which runs the **same**
   education-only content scan the pinned `ios` build runs (`scanBundle("ios")` — no wallet
   script, no swap link, no CLKN mint, no referral, no on-chain signing; a bundle that fails this
   scan is refused here exactly as it would be on the real release path);
3. `npx cap sync ios` to wire the fresh `dist/` into the Xcode project.

**What the dev app id means.** `CLKN_TARGET=ios-dev` selects a separate entry in
`capacitor.config.ts`: appId `app.clucknorris.edu.dev`, name "Cluck Norris (dev)". It installs
**beside** the real `app.clucknorris.edu` store app on a simulator or device rather than
overwriting it — you can keep both.

⚠️ **This bundle is unpinned and must never be uploaded to TestFlight or the App Store.**
`dist/DEV_BUILD_DO_NOT_PUBLISH.txt` says so in the folder itself. What actually guarantees a real
release can't reach it: `build:ios` (the script the TestFlight workflow and `docs/IOS_XCODE.md`
both use) runs `prep:store` → `prep-dist.mjs store`, a **different mode** in that script than
`ios-dev` — the release path has no code path into the dev one, not a flag that happens to be off.
`scripts/prep-dist-guard-test.mjs` pins both directions: `build:ios` never mentions `ios-dev` (or
`play-dev`/`seeker-dev`), and `ios-dev` itself refuses to run at all without `CLKN_IOS_DEV=1` set
explicitly, so it can't be entered by a stray env var either.

If you just want to rebuild against whatever the cached clone already has (no fresh clone/`npm
ci`), run the steps by hand:

```
node scripts/build-edu-dev-bundle.mjs --ref develop   # prints the tarball path
CLKN_TARGET=ios-dev CLKN_IOS_DEV=1 CLKN_IOS_DEV_TGZ=<path printed> npm run prep:ios-dev
npx cap sync ios
```

## Checking a build's processing state

`ios-build-status.yml` is a separate, read-only workflow — `ubuntu-latest`, no Xcode, no
signing, just `GET /v1/apps` and `GET /v1/builds` against App Store Connect with the same
`ASC_API_KEY_ID` / `ASC_API_ISSUER_ID` / `ASC_API_KEY_P8` secrets above. It prints a table of the
last five builds for a given `MARKETING_VERSION` — build number, uploaded date, processing state
(`PROCESSING` / `VALID` / `FAILED` / `INVALID`), internal/external TestFlight beta state, and
whether the build has expired — both to the job log and to the run's summary page.

Trigger it from the CLI:

```
gh workflow run ios-build-status.yml --ref claude/seeker-integration -f version=1.1.1
```

or from the Actions tab (Run workflow → pick the branch → optionally override `version`, default
`1.1.1`).

A `FAILED` or `INVALID` processing state is reported, not a workflow failure — the job only fails
on an auth or network error (bad/missing secrets, App Store Connect unreachable) or a malformed
API response. The underlying script (`scripts/asc-build-status.mjs`) mints its own App Store
Connect API JWT with Node's built-in `crypto` (ES256) rather than pulling in a JWT library; run it
with `--selftest` to mint-and-verify a token against a throwaway EC P-256 key with no network
call, as a sanity check that the signing shape is still right.

The JWT-minting code itself (`base64url`, `mintToken`, the tiny fetch wrapper) was extracted on
2026-09-24 into `scripts/lib/asc-client.mjs` so a second script doesn't grow a second copy of it.
`asc-build-status.mjs` now imports from there; nothing about its behavior, output, or `--selftest`
changed.

## Distributing a build to testers from the API

`.github/workflows/ios-testflight-distribute.yml` runs `scripts/asc-testflight-distribute.mjs` to
take a build that's **already uploaded and already `VALID`** (check with `ios-build-status.yml`
first) and put it in front of testers — without touching Xcode, signing, or the upload step. Same
App Manager-role secrets as everything else here: `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`,
`ASC_API_KEY_P8`.

What it does, in order, and idempotently — re-running it is safe:

1. **Resolve the build.** By `version` (MARKETING_VERSION) and app bundle id
   `app.clucknorris.edu`; `build_number` (CURRENT_PROJECT_VERSION) narrows to one build if given,
   otherwise it picks the newest build in `PROCESSING`/`FAILED`/`INVALID`/`VALID` state that is
   actually `VALID`. A build that never finished processing, or exists only under a different
   build number, is a **fatal** error (exit 1) — there is nothing to distribute.
2. **Export compliance.** `GET`s the build's `usesNonExemptEncryption`; if Apple has no answer yet
   (`null`), `PATCH`es it to `false` — the app declares `ITSAppUsesNonExemptEncryption=false`.
   Already-set values are left alone.
3. **Beta group.** Looks up a group named `group` (default `testers`) on the app; creates it if
   missing. Tries an **internal** group first (`isInternalGroup:true`, `hasAccessToAllBuilds:true`,
   retried without `hasAccessToAllBuilds` if the API rejects that combination), and falls back to
   an **external** group of the same name if internal creation is refused outright — some
   App Manager keys can't create internal groups. An external group needs Apple's beta review
   for its first build; the script says so when it falls back.
4. **Attach the build** to the group. A 409 (already attached) is treated as success, not a
   warning.
5. **Testers**, from `--testers "a@b.com,c@d.com:First:Last"` (name parts optional): looked up by
   email, created if absent, or attached to the group if they already exist elsewhere. **Internal**
   groups require the tester to already be a team member (App Store Connect → Users and Access) —
   when Apple's error says so, the script prints the exact detail plus "add this person under
   Users and Access first, or use an external group" and moves on to the next tester rather than
   failing the run.
6. **Final table**: the build's internal/external beta state, the group, and every tester's invite
   state. Emails are **masked everywhere** — first two characters + `***` + domain — in the job
   log and the step summary alike; only the API calls themselves ever see a full address.

An optional `feedback_email` sets the app's beta-app-review contact email; it's best-effort and
never fails the run.

**Exit codes** (`scripts/asc-testflight-distribute.mjs`, same contract as `asc-build-status.mjs`):
0 on a completed run, even with per-tester or per-step warnings printed along the way; 1 only on a
missing/bad ASC secret, a network error, or a build that can't be resolved. `--selftest` mints and
verifies a JWT the same way `asc-build-status.mjs --selftest` does, plus checks the email-masking
and tester-parsing helpers, with no network call.

Trigger it from the CLI:

```
gh workflow run ios-testflight-distribute.yml --ref claude/seeker-integration \
  -f version=1.1.1 -f group=testers -f testers="a@example.com,b@example.com:First:Last"
```

or from the Actions tab (Run workflow → pick the branch → fill in `version`, `build_number`
(optional), `group`, `testers`, `feedback_email` (optional)).

⚠️ **Never verified end-to-end.** No container running this workflow's author has App Store
Connect credentials, so `resolveBuild`, `ensureBetaGroup`, `ensureTester`, and the export-compliance
PATCH were written from Apple's published `betaGroups`/`betaTesters`/`builds` schema, not from a
real run against it. In particular: whether an App Manager-role key can create an **internal**
group at all (vs. only external), and whether `hasAccessToAllBuilds` is accepted on creation, are
both untested — the two-attempt-then-external-fallback exists because that uncertainty is real, not
decorative. The `betaAppReviewDetails.contactEmail` shape for `feedback_email` is the same:
plausible from the schema, best-effort, never fatal if wrong. The first real run of this workflow
is this project's first live test of all of it.
