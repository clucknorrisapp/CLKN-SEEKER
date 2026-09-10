# Store-Edition Delivery Contract (main repo ⇄ wrapper repo)

The agreed interface between the **Store-edition frontend** (built + published by the
main `cluck-norris-school` repo) and the **wrapper** (which bundles it into the Google
Play / iOS apps). Both sides build to this so neither builds against assumptions. The
wrapper side is already scaffolded to these values (`scripts/prep-dist.mjs`,
`store-edition.lock`, `capacitor.config.ts`); if the main repo needs a different shape,
change it here first and I'll re-scaffold.

## 1. Package format
- A **gzipped tarball** (`.tgz`) per variant.
- Entries sit under a **single top-level directory**, so that
  `tar -xzf <artifact>.tgz -C dist --strip-components=1` leaves the built site at the
  root of `dist/` (i.e. `dist/index.html`, `dist/assets/…`). This is exactly what the
  wrapper's `prep-dist.mjs` runs.
- Self-contained: all JS/CSS/fonts/images either bundled or from allow-listed remotes.
  No build step runs in the wrapper — it ships what's in the tarball.

## 2. Entry page
- **`index.html` at the extracted root.** Single-page app entry.
- Client-side routing must work under a bundled origin (no server rewrites available in
  the app) — use hash routing or ensure the SPA handles unknown paths itself.

## 3. Versioning & pinning
- **SemVer** per variant. Two variants: **`store-google`** and **`store-ios`**.
- Artifact naming: `store-edition-<variant>-<version>.tgz`
  (e.g. `store-edition-google-1.0.0.tgz`).
- Published at a **stable HTTPS URL** the wrapper can fetch (a GitHub release asset, a
  CDN path, or a committed artifact — your call; just give the URL).
- The wrapper pins `{version, url}` per variant in `store-edition.lock`; bumping it is the
  ONLY way the installed store app changes. A website deploy alone never affects it.

## 4. API address configuration  ← most important, breaks silently if wrong
- The store edition is **bundled**, so its origin in the app is `capacitor://localhost`
  (iOS) / `https://localhost` (Android) — **relative `/api` calls will NOT reach the
  backend.** The frontend build MUST call an **absolute API base**.
- Contract: build the Store edition with `API_BASE = https://clucknorris.app` (inject via
  build env, e.g. `VITE_API_BASE`), and use it for every `/api/*` call and any absolute
  link back to the site.
- **Backend CORS:** the API must allow the app's webview origins —
  `capacitor://localhost`, `http://localhost`, `https://localhost` — for the endpoints the
  store edition calls. Without this, every tool/exam/Ask-Cluck request fails in the app.
- The wrapper appends a **User-Agent marker** (`ClucknorrisPlay` / `ClucknorrisIOS`) to all
  requests. Backend uses it for defense-in-depth gating, and must **allow** the endpoints
  the store edition legitimately needs (exam scoring, read-only tools, Ask Cluck,
  school-stats, transcript-issue-without-wallet) while refusing the excluded ones.

## 5. Mode signal
- The store edition is **already stripped at build time** — it does NOT depend on the UA
  or a URL flag to decide its own content. The UA marker is **backend-only** (gating).
- No `?app=` param, no runtime hiding. (That old mechanism is retired.)

## 6. Supported native features (v1)
- v1 store edition assumes a **plain WebView + Capacitor defaults** — **no native wallet /
  MWA bridge**, no Seed Vault, no holder-gate.
- Available to the frontend: standard web APIs, `localStorage`/IndexedDB (for progress,
  bookmarks, offline lessons), and the Capacitor App/Browser basics. If the edition needs
  any specific Capacitor plugin (e.g. a share sheet, TTS for read-aloud), **name it here**
  and the wrapper will add + configure it.
- **iOS variant:** no wallet capability at all — the build must contain zero wallet-connect
  or on-chain-transaction affordances.

## 7. Variant delta (google vs ios)
| | store-google | store-ios |
|---|---|---|
| Read-only tools (free) | yes | yes |
| Wallet Checkup *revoke* (wallet tx) | optional (user-initiated) | **omit** |
| Any wallet connect / holder-gate | omit (deferred) | **omit** |
| Everything else | identical | identical |

## 8. Ownership
- **Main repo** builds + publishes the two tarballs, runs the backend, sets CORS, keeps the
  exam server-scored, adds Ask-Cluck AI-content reporting, provides the data-collection
  inventory for store privacy forms.
- **Wrapper repo** pins the versions, sets appId (`app.clucknorris.edu`) + signing per
  target, bundles the tarball, builds the AAB/IPA, preserves the live Solana target.

## 9. Confirm together before implementation
- [ ] Package format + entry-page routing style (hash vs history) workable for both
- [ ] `API_BASE` value + the exact CORS origins the backend will allow
- [ ] The endpoint allow-list the store edition needs (from current code)
- [ ] Any Capacitor plugin the edition requires (else none)
- [ ] Where the tarballs are published (URL scheme) so `store-edition.lock` can point at them
