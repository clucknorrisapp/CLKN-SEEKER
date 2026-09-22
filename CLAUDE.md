# CLAUDE.md — CLKN-SEEKER (the **apps** repo)

Operating notes for any session in this repo, **especially cloud sessions that start from a
fresh clone with no local files.** Read this first.

> ⚠️ **This file was a stale copy of the main repo's CLAUDE.md until 2026-09-19.** It described
> `cluck-norris-school` as "this repo", named retired features (Ultimate Challenge, Cluck Score),
> a closed grant, and a payment model that no longer exists — and granted standing permission to
> push to `main`, which is wrong here. If anything below ever reads like it is describing the
> website, it has drifted again; fix it rather than following it.

---

## What this repo is

**Every Cluck Norris client that ships to an app store.** Nothing else.

| Target | appId | Content | Store | Status |
|---|---|---|---|---|
| `solana` | `app.clucknorris.school` | FULL — **remote**, loads `https://clucknorris.app` | Solana dApp Store | **LIVE** |
| `googlePlay` | `app.clucknorris.edu` | STORE edition — **bundled**, pinned artifact | Google Play | LIVE |
| `ios` | `app.clucknorris.edu` | STORE edition (iOS variant) — bundled | Apple App Store | not submitted |
| `seeker` | TBD (see below) | FULL, mobile-first — **bundled** | Solana dApp Store | **planned** |

Build commands are in `package.json` (`build:solana`, `build:play`, `build:ios`).
`CLKN_TARGET` selects the Capacitor config; `android/app/build.gradle` selects the appId and
keystore from `-PclknAppId` / `-PclknKeystore` Gradle properties, defaulting to the `solana`
target.

## The boundary — decided, do not deviate

**This repo is PACKAGING-ONLY. It contains no product code.**

- Product code, business logic, UI, i18n and tests live in **`clucknorrisapp/cluck-norris-school`**
  (the platform repo). That is where anything that *decides something* belongs.
- This repo consumes a **versioned, checksummed frontend release** built and published there, and
  bundles it. See `play-store/DELIVERY-CONTRACT.md` for the artifact format and
  `store-edition.lock` for what is currently pinned.
- A website deploy therefore can never change an installed store app. That is the entire point —
  do not "simplify" it by pointing a bundled target at the live site.

⚠️ **This repo still carries a STALE COPY of the product code** (`src/`, `public/`, `lib/`,
`server.js`, `data/`, `hatchery.js`, `securitycoop.js`, plus Phase-3/4 prototypes). It is slated
for deletion by Step 0 of `play-store/WRAPPER-BUILD-TARGETS.md`, **after** the prototypes are
ported into the platform repo. **Do not treat any of it as live.** In particular
`src/wallet-provider.jsx` is part of that stale copy — it is not in any shipped build.

## Start of every session: attach the platform repo

You will need to read the platform's API surface. Attach it **read-only**:

1. Call `add_repo` with owner `clucknorrisapp`, repo `cluck-norris-school`, access `read`.
2. Clone it where the result tells you to.
3. Call `register_repo_root` so its CLAUDE.md loads on the next turn.

Do not copy code out of it. The contract between the two repos is the **HTTP API** and the
**pinned frontend artifact** — never shared source. If you find yourself copying logic across,
the boundary is wrong: put that logic behind an endpoint in the platform repo instead.

## The `seeker` target (planned) — the native app

A real mobile-first app for Seeker, as opposed to the remote shell that is live today. It fits
the existing model without changing it:

- Its **frontend is a fourth variant built in the platform repo** and published as a pinned
  `store-edition-seeker-<ver>.tgz`, exactly like `google` and `ios`.
- This repo adds the fourth Capacitor target, wires the **Mobile Wallet Adapter** native plugin,
  signs, and publishes to the dApp Store.
- Ship it under its **own appId**, not `app.clucknorris.school`, so the live listing carries no
  risk. Whether it later replaces the live listing is the owner's call, made after the fact.
- Extend `play-store/DELIVERY-CONTRACT.md` with the `seeker` variant before building against it.

## Working agreement

- **`main` is gated.** Open a PR; the owner merges. This is not the old "push freely at hackathon
  pace" grant — that line was inherited from a stale copy of the platform repo's rules and does
  not apply here.
- **Never commit a keystore or signing config.** `.gitignore` already covers `*.keystore`, `*.jks`,
  `keystore*.properties`, `key*.properties` — keep it that way. The tracked `gradle.properties`
  and `gradle/wrapper/gradle-wrapper.properties` are ordinary Gradle files and hold no secrets.
- **Releases are built on the owner's Mac**, not in a cloud container: signing needs the keystore,
  and iOS needs macOS outright. Cloud sessions write code and open PRs. See
  `play-store/BUILD-ON-MAC.md`.
- **The `solana` target is live and approved** — its config, appId and signing stay as they are.
  Anything new is additive.
- Never commit secrets. Don't put a model identifier in committed files.

## Where the real documentation is

Don't duplicate these — read them:

- `play-store/WRAPPER-BUILD-TARGETS.md` — the three-target plan and the packaging-only rule.
- `play-store/DELIVERY-CONTRACT.md` — the artifact interface between the two repos.
- `play-store/STORE-EDITION-MANIFEST.md` — what the store editions include and exclude.
- `play-store/GATING-SPEC.md`, `play-store/STORE-EDITION-LEGAL.md` — policy constraints.
- `play-store/BUILD-ON-MAC.md`, `play-store/RUNBOOK.md`, `play-store/PLAY-CONSOLE-CHECKLIST.md` —
  how a release actually gets made.
- `docs/IOS_XCODE.md` — **the Mac / Xcode handoff for the iOS target** (owner, 2026-09-22: the
  iPhone Duo work is looked at in Xcode on the Mac mini). Start there on a Mac: no `ios/`
  project exists yet, the 1.1.0 education bundle is pinned, Xcode 27.1 beta has the iPhone Duo
  simulator, and the scope is education-only — no wallet features.
- `dapp-store/config.yaml` — the Solana dApp Store listing. ⚠️ Marked DRAFT, its
  `privacy_policy_url` TODO is stale, and its listing copy still advertises retired features
  (Cluck Score, Survival Simulator, Ultimate Challenge) and the retired CLKN-micropayment model.
  **It needs a rewrite before the next republish.**
