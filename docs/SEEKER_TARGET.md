# The `seeker` build target

The fourth Capacitor target, added 2026-09-21 for the CLOCK IN (Solana Mobile) hackathon. It
builds the **Seeker edition** — the mobile-first Cluck Norris app (Rent Reclaim, Ask Cluck,
Wallet Checkup and the rest of the toolkit) — as a bundled Android app for the Solana dApp Store.

## Why it is a separate target, not a variant of `solana`

`solana` is the **live, approved dApp Store app**, and it loads clucknorris.app remotely. Touching
it risks the listing that already exists. The seeker target:

- **bundles** its frontend (no `server.url`), so the app works without the website being reachable;
- carries **its own appId, `app.clucknorris.seeker`**, so it ships alongside the live listing and
  both can be installed on the same device while the new one is tested;
- consumes a **pinned, checksummed artifact** exactly like `googlePlay` and `ios`.

It deliberately has **no `appendUserAgent` marker**. Those exist as backend defense-in-depth for
the education-only bundles, whose excluded endpoints the server refuses. The Seeker edition is the
full product — wallet, tools, signing — so it has nothing to be refused from, and a marker would
only invite someone to treat it as authorisation. It is not.

## Building it

```
npm run build:seeker
```

which runs `prep-dist.mjs store` with `CLKN_TARGET=seeker`, syncs Capacitor, and assembles a
release APK with `-PclknAppId=app.clucknorris.seeker`.

## ⛔ It does not build yet, and that is by design

`store-edition.lock` has no `seeker` entry, so `prep-dist` refuses:

```
prep-dist: Store-edition release for "seeker" is not fully pinned.
Refusing to build a store target without a pinned, checksummed release.
```

That refusal is the feature — the repo will not ship a placeholder or an unverified artifact to a
store. **Nothing here should be "fixed" by inventing a pin.**

## What closes it — owner action, a cloud session cannot do this

The artifact is built and published from the **main app repo**
(`clucknorrisapp/cluck-norris-school`), and publishing it needs a git tag, which a cloud session
cannot push.

1. In the main repo, on the promoted commit:
   `node scripts/build-store-edition.mjs seeker`
   → writes `release/store-edition-seeker-<version>.tgz` and prints a JSON manifest with its
   `sha256` and `sourceCommit`.
2. Push a `store-seeker-v<version>` tag so the release workflow publishes that tarball.
3. Add the entry to `store-edition.lock` in THIS repo, from the manifest the build printed:

```json
"seeker": {
  "version": "0.1.0",
  "url": "https://github.com/clucknorrisapp/cluck-norris-school/releases/download/store-seeker-v0.1.0/store-edition-seeker-0.1.0.tgz",
  "sha256": "<the hex digest the build printed>",
  "sourceCommit": "<the main-repo commit it was built from>"
}
```

4. `npm run build:seeker` then produces the APK — submission requirement #1 for the hackathon.

## Related

- `docs/MWA_PLUGIN.md` — the native Mobile Wallet Adapter plugin. **Until it is verified on a real
  device, the wallet does not connect inside this app**, so an APK built today opens, renders and
  reads, but cannot sign. The device checklist in that file is what closes it.
- Main repo: `docs/SEEKER_APP_PLAN.md` (what the app is), `docs/SEEKER_TOOLS_BUILD.md` (the tool
  surface and the pane contract).
