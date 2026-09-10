# Store-Edition Delivery Contract (main repo ⇄ wrapper repo)

The agreed interface between the **Store-edition frontend** (built + published by the
main `cluck-norris-school` repo) and the **wrapper** (which bundles it into the Google
Play / iOS apps). Both sides build to this so neither builds against assumptions. The
wrapper side is already scaffolded to these values (`scripts/prep-dist.mjs`,
`store-edition.lock`, `capacitor.config.ts`); if the main repo needs a different shape,
change it here first and I'll re-scaffold.

## 1. Package format
- A **gzipped tarball** (`.tgz`) per variant, named `store-edition-<variant>-<version>.tgz`
  (e.g. `store-edition-google-1.0.0.tgz`). Consistent names, one scheme.
- Entries under a **single top-level directory**, so
  `tar -xzf <artifact>.tgz -C dist --strip-components=1` leaves the built site at the root
  of `dist/` (`dist/index.html`, `dist/assets/…`). Exactly what `prep-dist.mjs` runs.
- Self-contained: JS/CSS/fonts/images bundled or from allow-listed remotes. No build step
  runs in the wrapper — it ships what's in the tarball.

## 2. Entry page & routing
- **`index.html` at the extracted root.** Single-page app.
- **Use hash routing** (`#/path`). A bundled app has no server to rewrite deep paths, so
  history-mode routes would 404 inside the app. Hash routing is the agreed choice.

## 3. Versioning, checksum & pinning
- **SemVer** per variant. Variants: **`store-google`**, **`store-ios`**.
- Each release is pinned in `store-edition.lock` as
  `{ version, url, sha256, sourceCommit }`:
  - `url` — stable HTTPS location (GitHub release asset / CDN / committed artifact; your call — just give the URL).
  - `sha256` — hex digest of the `.tgz`; the wrapper **verifies it before bundling** and refuses on mismatch.
  - `sourceCommit` — the main-repo commit the artifact was built from (traceability).
- **Pinning freezes the bundled FRONTEND only.** The installed app still calls the **live
  backend** and any remote content, so backend/API changes must remain **backward-compatible
  with every pinned frontend version still in the wild.** Treat the API as a versioned contract.
- Bumping the lock is the ONLY way the installed store app's frontend changes; a website
  deploy alone never affects it.

## 4. API address configuration  ← most important; breaks silently if wrong
- The store edition is **bundled**, so its in-app origin is `capacitor://localhost` (iOS) /
  `https://localhost` (Android). **Relative `/api` calls will NOT reach the backend.**
- Contract: build with an **absolute `API_BASE = https://clucknorris.app`** (inject via build
  env, e.g. `VITE_API_BASE`) and use it for every `/api/*` call and any absolute link.
- **Backend CORS:** allow the app webview origins on the endpoints the edition calls:
  - `capacitor://localhost`  (iOS)
  - `https://localhost`      (Android, Capacitor 5/6)
  - `http://localhost`       (older Android webview)
  (Main session: confirm the exact set against the shipped Capacitor version.) Without this,
  every tool/exam/Ask-Cluck request fails **only inside the installed app** — green in a
  browser, red in review.

## 5. Mode signal — and it is NOT authorization
- The store edition is **stripped at build time** — it does not use the UA or any URL flag to
  decide its own content. Excluded flows are absent from the bundle.
- The wrapper appends a **User-Agent marker** (`ClucknorrisPlay` / `ClucknorrisIOS`) to
  requests. This is a **hint for backend defense-in-depth only — NOT an authorization
  mechanism.** Never gate anything security-sensitive on the UA alone (it's trivially
  spoofable). Real enforcement = excluded flows absent from the build + the backend enforcing
  its own auth/entitlement rules server-side regardless of UA.

## 6. Supported native features (v1)
- v1 assumes a **plain WebView + Capacitor defaults**. **No native wallet / MWA bridge, no
  Seed Vault, no holder-gate, and NO on-chain-transaction affordances — on EITHER store.**
  (Wallet work is deferred out of v1 entirely, per the main session's correction.)
- Available to the frontend: standard web APIs, `localStorage`/IndexedDB (progress, bookmarks,
  offline lessons), Capacitor App/Browser basics. If the edition needs a specific plugin
  (share sheet, TTS for read-aloud, etc.), **name it here** and the wrapper adds/configures it.

## 7. Variant delta (google vs ios)
**For v1 the two variants are feature-identical** — no wallet, no transactions on either side —
so the same frontend can serve both; they remain separately pinned for future divergence.

| | store-google v1 | store-ios v1 |
|---|---|---|
| School + read-only tools (free) | yes | yes |
| Wallet connect / holder-gate / any on-chain tx | **no** | **no** |
| Difference | — | — (identical in v1) |

## 8. Ownership
- **Main repo:** builds + publishes the tarball(s) with their sha256 + sourceCommit; runs the
  backend; sets CORS + keeps the API backward-compatible; keeps the exam server-scored; adds
  Ask-Cluck AI-content reporting; provides the data-collection inventory for store privacy forms.
- **Wrapper repo:** pins versions (+verifies checksum), sets appId (`app.clucknorris.edu`) +
  signing per target, bundles the tarball, builds the AAB/IPA, preserves the live Solana target
  and all unique wrapper code.

## 9. Confirm together before implementation
- [ ] `API_BASE` value + the exact CORS origins the backend will allow
- [ ] The endpoint allow-list the store edition needs (from current code)
- [ ] Any Capacitor plugin the edition requires (else none)
- [ ] Where the tarballs are published (URL scheme) so `store-edition.lock` can point at them
- [ ] Backend API back-compat policy for pinned frontend versions
