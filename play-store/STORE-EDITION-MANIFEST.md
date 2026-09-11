# Store-Edition Manifest — Cluck Norris (Google Play v1, iOS later)

Defines the **Store edition** — the education build for Google Play (later iOS). It's a
**separately built, allow-listed frontend** (Codex's model): excluded surfaces are
**absent from the build**, not hidden. This manifest is the source of truth for that build.

## ⚠️ READ FIRST — the live app is large and policy-sensitive → ALLOW-LIST, default-deny
As of 2026-09 the live `clucknorris.app` repo has **~48 tool pages** plus `normie-quest/`,
a token **swap**, an **order book**, a **prize wheel**, **RoseHorses**, **CUNA staking/payout**,
buy competitions, market-making dashboards, and paid B2B tools. Many are exactly what Google
gates hardest (exchange, gambling, financial products). **Do NOT build the store edition as
"the app minus a list"** — the OUT set is huge and grows every week, and a single miss ships
an exchange or gambling screen into a reviewed store app.

**Build it as a strict ALLOW-LIST:** only the explicitly listed education + read-only pages
below are included; **everything else is excluded by default.** New pages added to the live
app are OUT unless someone deliberately adds them to this allow-list.

## Editions
- **FULL** — website + Solana dApp Store (Seeker). Everything. Already live.
- **STORE-Google / STORE-iOS** — this manifest. Education + read-only research only.
  v1 has **NO wallet, NO holder-gate, NO on-chain transactions** on either store → the two
  variants are **feature-identical in v1**.

---

## ✅ THE ALLOW-LIST (only these ship — verify each against current code)
**Education core (the React app):** the school (Incubator, School of Hard Knocks, Ultimate
Challenge — keep it **server-scored**, never ship the answer key), plus LP Lab and Library
(`src/sections/`). 7 languages, progress, bookmarks, read-aloud. *(Note: "Survival Simulator"
was removed from the product months ago — nothing to ship there.)* The React school is the
store edition's entry page.

**Ask Cluck** (AI tutor) — **ADAPT:** add in-app reporting for AI-generated content (Google
AI policy) + a data-collection inventory for the store privacy forms.

**Read-only research tools — SHIPPED in v1 (final, per PR #288):** `wallet-checkup` (scan-only;
revoke/connect compiled out) and `listing-checkup` (free; its gate was client-only). The other
research tools (`wallet-xray`, `trace`, `token-holders`, `owners-snapshot`) are **OUT of v1** —
their gate is server-side, and freeing them would require a backend bypass keyed to the app's
marker (UA-as-authorization), which the contract forbids. Revisit once real entitlements exist.

**Transcript → certificate of completion** (implemented in PR #288: `POST /api/claim/certificate`,
`GET /certificate/:id`): verified against the same server-side lesson ledger as the wallet claim,
but with **no wallet and no address collected** — the name stays on the device.

Everything not named above is OUT.

## ❌ EXPLICITLY OUT (present in the live app; must NOT be in the store build)
These are the reasons the allow-list must be default-deny — grouped by why:

- **Exchange / trading** (Google crypto-exchange policy): `swap` (Token Swap), `order-book`,
  `whale-panel`, `engine-dashboard`, `pool-monitor`, `whirlpool-mm`, `order`/market-making.
- **Gambling / prizes:** `prize-wheel`, `rosehorses`, `buyspecial-*` (buy competitions,
  draws, opt-ins, dashboards, pro), any reward wheel.
- **Financial products / yield:** `cuna-staking` (lock-to-earn), `cuna-payout`, any staking,
  lending, or earn/payout stream.
- **Payments / passes:** any SOL/CLKN tools-pass or payment leg; `premium`; anything that
  unlocks a feature for money or token holdings.
- **On-chain transaction tools:** `hatchery` (mint), `firepit` / `project-burn` (burn),
  `token-lock` / `locker-room` (lock), `lp-rescue`, `liquidity-locked`, `airdrop` /
  `airdrop-signup` (batch send).
- **Token promo / purchase funnels:** `clkn` (token page), "Buy CLKN", Coinbase buy link,
  `bags` (launchpad feed), price/market-cap banners.
- **Fundraising / B2B / paid services:** `investors`, grant surfaces, `client-portal`
  (project portal), `jupverify` (paid verification), `alpha` (daily market signals).
- **Admin / private panels:** `buycomp-admin`, `jupverify-admin`, `cuna-payout` (owner),
  `whale-panel` (private), any owner/admin console.
- **`normie-quest/`** — a separate holder-gated module with claims + burn. **OUT entirely**
  (owner's decision to evaluate it separately, and its holder gate/rewards can't ship on iOS).

> This OUT list is illustrative, not exhaustive — that's the whole point of default-deny.
> If it isn't on the allow-list, it doesn't ship.

## STORE-iOS vs STORE-Google — v1 IDENTICAL
v1 has no wallet on either store (no connect, no holder-gate, no on-chain tx). The two
variants are feature-identical for v1; pinned separately only for future divergence.

## Build / delivery guidance
- Build the Store edition as its own controlled frontend release (a bundle), driven by an
  explicit **include list** (allow-list) — excluded pages/components **compiled out**, not
  runtime-hidden. Emit the versioned `.tgz` per DELIVERY-CONTRACT.md.
- Bundle is local to the app; it still calls the live backend at absolute
  `API_BASE=https://clucknorris.app` (backend needs CORS for the webview origins).
- The wrapper's `googlePlay` target consumes the release; the `solana` target keeps loading
  the FULL live site. See WRAPPER-BUILD-TARGETS.md.

## Finalize-before-build checklist
- [ ] Build the **allow-list** from current code — confirm which education pages + read-only
      tools are genuinely education-only, free, wallet-free
- [ ] Confirm each read-only tool: no pass/paywall, no wallet connect, no on-chain write
- [ ] Transcript issues without wallet-address collection in the store edition
- [ ] Ask Cluck AI-content reporting + data inventory for privacy/Data-Safety forms
- [ ] Nothing from the OUT categories (exchange/gambling/financial/tx/promo/admin/normie-quest)
      is reachable — routes, deep links, and API calls all absent
- [ ] Minimum-functionality pass: back nav, saved progress, offline lessons, error recovery, accessibility
