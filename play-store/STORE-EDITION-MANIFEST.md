# Store-Edition Manifest — Cluck Norris (Google Play v1, iOS later)

**What this is.** The page-by-page / capability-by-capability definition of the
**Store edition** — the education-focused build for Google Play (and later iOS).
Per the agreed architecture (Codex's guidance), the Store edition is a **separately
built, allow-listed frontend** — excluded items are **absent from the build**, not
hidden on the live site. This manifest is the source of truth for that build; it
lives in / drives the **main app repo**, and the wrapper repo's `googlePlay`/`ios`
targets consume the resulting Store-edition release.

**Editions:**
- **FULL** — website + Solana dApp Store (Seeker). Everything. Already live.
- **STORE-Google** — this manifest. Education + read-only research; no crypto
  payments, no holder-unlocks, no transaction tools, no promo/fundraising.
- **STORE-iOS** — STORE-Google **minus anything that needs a wallet** (Apple 3.1.1).

Legend: **IN** = ship in Store edition · **OUT** = excluded from the build ·
**ADAPT** = ship a modified/free version.

> Classifications below are from the live site on 2026-09-09. **Finalize against
> the current main-repo code** before building — names/routes may differ.

## School & learning — all IN
| Item | Store edition |
|---|---|
| Incubator (beginner lessons) | IN |
| School of Hard Knocks (lessons + belts) | IN |
| Ultimate Challenge (server-scored exam) | IN |
| Survival Simulator | IN |
| LP Lab + calculators | IN |
| Library / Chain Info / glossary | IN |
| 7 languages, progress, bookmarks, read-aloud | IN (make these solid — see functionality note) |
| Ask Cluck (AI tutor) | IN + **ADAPT**: add in-app reporting for AI-generated content (Google AI policy), and confirm chat data handling in the privacy disclosure |

## Research tools — read-only IN (paywalls removed), wallet-actions ADAPT/OUT
| Tool | Type (from /tools) | Store edition |
|---|---|---|
| Cluck Trace (fund-flow) | read-only, no connect | **IN** |
| Holders (concentration) | read-only, no connect | **IN** |
| Owners Snapshot | read-only, free | **IN** |
| Wallet Checkup | read-only scan **+ revoke tx** | **ADAPT**: ship the **scan only**. **Drop the revoke on BOTH stores in v1** — no wallet transactions in v1, either side (the revoke is a wallet tx) |
| Listing Checkup | read-only, "full needs pass" | **ADAPT**: ship free (remove the CLKN pass) or OUT |
| Wallet X-Ray | read-only, "requires pass" | **ADAPT**: ship free (remove pass) or OUT |
| Cluck Score / Token Autopsy | read-only (if still present) | **IN** (free) |

## Transactional tools — all OUT of v1
These mint / burn / lock / send / build transactions — OUT of the first Store build
(Codex: evaluate individually later).
| Tool | Why OUT |
|---|---|
| The Hatchery (mint SPL) | on-chain mint + CLKN/SOL pass |
| Firepit (burn + rent reclaim) | on-chain burn |
| Project Burn | on-chain burn |
| Token Metadata Lock | on-chain tx |
| Jup Locker Room (lock) | on-chain tx |
| LP Rescue (build withdrawal tx) | on-chain tx |
| Airdrop HOLD OR SOL (batch send) | on-chain send + 0.05 SOL/pass |
| Buy Special (buy competitions/prizes) | competitions/prizes + pass |
| Liquidity Engine | in development anyway |

## Token / financial / promo surfaces — OUT
| Surface | Why OUT |
|---|---|
| "Buy CLKN" button | token purchase promo |
| "Coinbase" buy link | token purchase funnel |
| Token price / market-cap banners | financial promo |
| Bags.fm live launch feed | launchpad promo/funnel |
| CLKN holder-based feature unlocks | Apple bans (3.1.1); deferred on Google too for v1 |
| SOL/CLKN payments to unlock tools | store-payment-policy violation |
| Investors page / grant / fundraising surfaces | project fundraising |

**Educational mentions of Bags/tokens can STAY** where they serve a lesson (e.g. a
"how a launchpad works" lesson) — it's promotional placement and transaction funnels
that are OUT, not factual education.

## Credentials / transcript — ADAPT
| Item | Store edition |
|---|---|
| Earn a transcript by passing the exam / finishing curriculum | IN |
| Transcript display / share card | IN (plain certificate) |
| **Wallet-address collection + airdrop signup** on claim | **OUT** (reward-for-tasks + wallet collection) — issue the certificate without collecting an address in the Store edition |

## STORE-iOS vs STORE-Google — v1 is IDENTICAL
For **v1 there is NO wallet on either store** — no connect, no holder-gate, no on-chain
transactions (Wallet Checkup ships scan-only on both). So the two variants are
**feature-identical in v1**; they're pinned separately only for future divergence.
Post-v1, if any wallet-capable feature returns on Google, iOS still drops it (Apple 3.1.1).

## Build / delivery guidance
- Build the Store edition as its **own controlled frontend release** (bundled into the
  app, or a dedicated `store.clucknorris.app`-style deployment) — **not** the live site
  with flags. Bundling also enables the offline lessons the stores like.
- Drive it from a **feature catalogue** in the main repo (my `store-mode.jsx` feature
  map is the seed for this — repurpose it as a build-time include list, not runtime hiding).
- Keep **server-side checks** too as defense-in-depth: any endpoint the Store edition
  must not reach (payments, mint/burn/lock/send, buy) should refuse Store-edition callers.
- Wrapper repo: `googlePlay` and `ios` targets point at the Store-edition release;
  `solana` target keeps loading the FULL live site. Distinct Android applicationId for
  Google (`app.clucknorris.edu`) vs Solana (`app.clucknorris.school`).

## Finalize-before-build checklist
- [ ] Reconcile every row against the CURRENT main-repo pages/routes
- [ ] Decide free-vs-OUT for the pass-gated read-only tools (Wallet X-Ray, Listing Checkup)
- [ ] Confirm Ask Cluck AI-content reporting + data inventory for privacy disclosures
- [ ] Confirm the transcript can issue without wallet-address collection in Store edition
- [ ] Minimum-functionality pass: back nav, saved progress, offline lessons, error recovery, accessibility
