# Play / iOS "AI-correct" store edition — spec (next store build)

Grounded in the main repo's facts (relayed 2026-09-13). Build against
`docs/STORE_EDITION.md` + the `STORE_PAGES` allow-list in `src/edition.js`; every new
store surface must pass `scripts/store-edition-test.cjs` unchanged in policy — **no wallet,
no address, no referral, no CLKN promotion.** The wrapper's own content guard
(`scripts/prep-dist.mjs`) must also pass (no jup.ag/swap, CLKN mint, bags/?ref referral,
wallet-btn, syncRevokeUi, signAndSend).

## What Cluck Concierge actually is
The **"Where do I start?"** panel on the school home page: **journey cards** (brand new /
know the basics / liquidity pools / token research / just exploring) that route into the
right part of the app, with the **app-aware Ask Cluck box underneath**. Mirrors the Telegram
bot's `/start` guide. **Not a separate bot.** It already exists in the store build, but with
the CLKN, coins-and-chains and tools doors compiled out.

## THIS submission = "AI-correct + graceful web pointers"
**In:**
- **Ask Cluck prominent on the home screen**; the **Concierge as the landing surface**; every
  AI surface discoverable; the **Report control on every answer**.
- **Excluded tools get a "this tool lives on the web" pointer — never a dead end.**
  Store-safe on TWO axes:
  - *Wording:* neutral ("the full toolkit lives on clucknorris.app"), never "go here to do the
    crypto thing we can't show."
  - *Destination:* point at the **general site / education surface**, NOT a deep link into a
    transaction tool (e.g. not `/hatchery`, `/airdrop`). Deep-linking users to prohibited
    functionality is what trips Apple 3.1.1 / Google review, even from an education app.
- Concierge cards route **only** to surfaces the bundle carries (`STORE_PAGES`).

**Out forever (Play AND iOS):** swap, airdropper, mint, buy/pay, staking, gambling, wallet
connect.

## NEXT update (not this one)
- **Token Autopsy** — read-only, not pass-gated, not on the deny list → can ship read-only cleanly.
- **Wallet X-Ray, Token Holders, Trace** — **pass-gated server-side** (signed-session
  enforcement on `develop` → `main`). There is **no honest store-only bypass** — the app's
  user-agent marker is a hint, never authorization; freeing them in-store means freeing them for
  everyone, or shipping an extractable key. **Owner decision required.** Recommendation (main +
  wrapper): **no for now**, revisit post-hackathon with store usage numbers.
- **Cluck Score — RETIRED for good. Never rebuild, never in any store scope.**

## Delivery
Main repo builds this as the next `store-google-v*` (and `store-ios-v*`) release; the wrapper
re-pins from the published digest, re-verifies through its content guard, and Chuck does ONE
rebuild (`build:play`, bumped version code) + a single Play submission of the correct version.
