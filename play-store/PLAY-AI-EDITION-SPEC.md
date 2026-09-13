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

## Owner calls (2026-09-13)
- **Token Autopsy — OUT.** Keep it out of the store edition (owner decision). Simpler.
- **Wallet X-Ray, Token Holders, Trace — OUT** (pass-gated server-side; no honest store-only
  bypass — the UA marker is a hint, never authorization; freeing them in-store = free for
  everyone or an extractable key). Revisit post-hackathon with store usage numbers.
- **Cluck Score — RETIRED for good. Never rebuild, never in any store scope.**

## Web / Solana-only — NEVER in a store build (Play or iOS), free or paid
On-chain / financial features stay out of the store binaries regardless of pricing; the store
app only *points* to the web (general destination, never a deep link into them):
- **Airdropper** — on-chain batch send. Making it **free on the website** is a great top-of-funnel
  ad; it still cannot ship inside the Play/iOS app. Funnel via a neutral "full toolkit on the web".
- **CUNA lock-and-earn / staking** — a financial product → hard-out on both stores. Lives on the
  website + the Solana dApp Store app when it lands. (Doesn't affect the hackathon entry.)
- Gambling — retired from the product entirely; nothing to exclude.

## Delivery
Main repo builds this as the next `store-google-v*` (and `store-ios-v*`) release; the wrapper
re-pins from the published digest, re-verifies through its content guard, and Chuck does ONE
rebuild (`build:play`, bumped version code) + a single Play submission of the correct version.
