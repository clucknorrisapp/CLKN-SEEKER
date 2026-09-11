# Store-edition legal pages (privacy + terms) — spec for the MAIN repo to serve

**Why this exists.** The Google Play / iOS store edition is the *stripped* build: no CLKN
payments, no token, no premium unlock, no wallet connect, no airdrop, no transcript-with-address.
The live site's `/privacy` and `/terms` describe the **full** website (CLKN token purchases,
wallet-address collection for transcripts/airdrops, Jupiter/DexScreener embeds). If the Play
listing links those, two things break:

1. **Data Safety mismatch → rejection risk.** `play-store/listing.yaml` declares *no wallet
   address collected in v1*. Google requires the linked privacy policy to match the Data Safety
   form and the actual app. The live policy says wallet addresses are collected — contradiction.
2. **Crypto-policy own goal.** The listing copy deliberately carries no token/purchase language
   (Google crypto sensitivity). The live policy leads with "unlock via CLKN token transfers,"
   re-introducing exactly what we stripped.

**The ask (main repo `cluck-norris-school`, which serves these routes in `server.js`):**
serve store-edition-scoped versions of both pages and give the wrapper their stable HTTPS URLs.
Suggested routes (pick whatever fits the router): `/privacy/store` + `/terms/store`, or
`/privacy?edition=store` + `/terms?edition=store`. Must be **directly reachable HTTPS URLs**
(Play requires a privacy-policy URL that loads without login). Then tell the wrapper session the
final URLs so `play-store/listing.yaml` (`privacy_policy:`) and the in-app footer point at them.

The copy below is drafted to be **accurate to the stripped build** and **consistent with the
Data Safety form already in `listing.yaml`**. Operator named as the Play publisher: **CLKN
Productions LLC**. Adjust wording/branding to match the site's voice; keep the substance.

---

## STORE EDITION — Privacy Policy

*Applies to the Cluck Norris app distributed on Google Play and the App Store. The website at
clucknorris.app has a separate, fuller policy at /privacy.*

**What this app is.** A free crypto school plus two read-only research tools. It takes no
custody, has no accounts, no payments, and never asks for your seed phrase or private keys.

**What we collect**
- **Aggregate usage analytics** — page/lesson views and feature interactions, counted in a
  privacy-respecting way. We do **not** build advertising profiles or track you across other apps
  or sites.
- **Addresses you paste into the research tools** (Wallet Safety Checkup, Listing Checkup) — the
  public Solana address or token you enter is sent to on-chain data providers (Solana RPC /
  Solscan-class APIs, e.g. Helius) to perform the lookup and generate the report. These are public
  blockchain identifiers, not tied to your identity, and are only sent when you run a lookup.
- **Questions you ask the AI tutor (Ask Cluck)** — sent to our AI provider (Anthropic) to generate
  a response. Don't include personal information in your questions.
- **On-device storage** — lesson progress, bookmarks, language and read-aloud settings live in
  your device's local storage and stay on your device. A certificate of completion records your
  chosen name **on your device only** — no wallet address and no server account.

**What we do NOT collect**
- No name, email, or phone number.
- No wallet connection and **no wallet address** (this build has no connect, holder-gate, airdrop,
  or on-chain transactions).
- No precise or approximate location; no contacts, photos, or files.
- No payment or financial-account information (there are no in-app purchases).
- No private keys or seed phrases — ever.

**Sharing.** Only as needed to run the features above: on-chain data providers for lookups, and
our AI provider for the tutor. We don't sell data or share it for advertising.

**Security & retention.** All traffic is encrypted in transit (HTTPS). We keep only what's needed
to run the service.

**Your choices.** You can request deletion of any data associated with you at any time by emailing
**chuck@clucknorris.app**. Because the app has no accounts and collects no wallet address, most
data (progress, bookmarks, your certificate name) is on your device and clears when you clear app
storage.

**Children.** Not directed to children under 13. Crypto-related educational content is intended
for users of legal age in their jurisdiction.

**Changes.** We may update this policy; the effective date will change when we do.

**Contact:** CLKN Productions LLC — chuck@clucknorris.app.

---

## STORE EDITION — Terms of Use

*Applies to the Cluck Norris app distributed on Google Play and the App Store. The website at
clucknorris.app has separate, fuller terms at /terms.*

**Educational only.** Everything in this app is for **educational and informational purposes
only**. It is **not** financial, investment, legal, or tax advice. The research tools state what
is visible on-chain; they don't guarantee a token is safe and don't predict performance. Do your
own research.

**Free app, no purchases.** This app is free. It has **no in-app purchases, no subscriptions, no
cryptocurrency payments, and no token requirement**. No feature is unlocked by money or by holding
any token.

**No custody.** The app never takes custody of your funds, never holds your private keys, and
never asks for your seed phrase. It does not connect to a wallet or send on-chain transactions.

**AI tutor.** Ask Cluck generates responses with AI and may be inaccurate or incomplete — treat it
as a study aid, not authoritative advice. You can report objectionable AI-generated content from
within the app.

**Acceptable use.** Use the app lawfully. Don't attempt to break, overload, or misuse the service
or the on-chain data providers it calls.

**Age.** You may use the app only if you are of legal age and legally permitted to do so in your
jurisdiction. Not intended for children under 13.

**Disclaimer & liability.** The app is provided "as is," without warranties. To the extent
permitted by law, CLKN Productions LLC is not liable for losses arising from your use of the app
or from decisions you make based on it.

**Changes.** We may update these terms; the effective date will change when we do.

**Contact:** CLKN Productions LLC — chuck@clucknorris.app.

---

## After the pages are live (wrapper repo follow-ups)
- [ ] Set `play-store/listing.yaml` → `privacy_policy:` to the store privacy URL.
- [ ] Update the comment on the `# terms` line to the store terms URL, and link both from the
      in-app footer of the stripped build.
- [ ] Re-confirm the Data Safety answers in `listing.yaml` still match this policy (they should:
      analytics + pasted addresses to on-chain providers, nothing else).
