// lib/wallet-gate.js — Phase 3 Seed Vault / Mobile Wallet Adapter holder gate.
//
// New model (CLKN payments are offline): premium tools unlock by HOLDING CLKN,
// not by paying. The flow is:
//   1. Client connects a wallet via MWA (Seed Vault on the Seeker; Phantom /
//      Solflare / Backpack on other Android phones).
//   2. Client asks the wallet to signMessage over a server-issued challenge.
//   3. Server verifies the ed25519 signature here → proves the user controls
//      the wallet (prevents someone pasting a whale's address they don't own).
//   4. Server independently reads that wallet's CLKN balance on-chain and, if
//      it's >= the holder threshold, grants unlock.
//
// Zero new dependencies: signature verification uses Node's built-in crypto
// (ed25519, same helpers server.js already imports on line 6), and the balance
// read uses global fetch against a Solana RPC.
//
// Why verify the signature AND read the balance server-side:
//   - Reading balance alone is spoofable (user submits any rich address).
//   - Signature alone proves ownership but not holdings.
//   - Both together = "this user controls a wallet that holds >= threshold."
//
// Store-safety note: this endpoint never sells anything. It reads a public
// on-chain balance to toggle a feature flag — compatible with Google Play /
// App Store policy in a way the old CLKN-payment flow was not.

const crypto = require("crypto");

const CLKN_MINT = "DW6DF2mjtyx67vcNmMhFm9XdxAwREurorghZcS3CBAGS";

// Holder threshold. The legacy "5× bonus" tier was 2,000,000 CLKN — reused
// here as the default unlock gate. Override with CLKN_HOLDER_THRESHOLD env.
const HOLDER_THRESHOLD = Number(process.env.CLKN_HOLDER_THRESHOLD || 2_000_000);

// Challenge freshness window (ms). Signed messages older than this are rejected
// to blunt replay. 5 minutes is generous for a mobile signing round-trip.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Prefer Helius if a key is present (higher rate limits), else public mainnet.
function rpcUrl() {
  const k = process.env.HELIUS_API_KEY;
  return k
    ? `https://mainnet.helius-rpc.com/?api-key=${k}`
    : "https://api.mainnet-beta.solana.com";
}

// ── minimal base58 decoder (no bs58 dependency) ───────────────────────────
const B58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(str) {
  const map = {};
  for (let i = 0; i < B58_ALPHABET.length; i++) map[B58_ALPHABET[i]] = i;
  const bytes = [0];
  for (const ch of str) {
    const value = map[ch];
    if (value === undefined) throw new Error("Invalid base58 character");
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; k < str.length && str[k] === "1"; k++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

// ── ed25519 signature verification via Node crypto ────────────────────────
// Wrap the raw 32-byte public key in the SPKI DER prefix for ed25519 so
// crypto.createPublicKey accepts it.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifyWalletSignature({ publicKey, message, signature }) {
  const rawPub = base58Decode(publicKey);
  if (rawPub.length !== 32) throw new Error("Public key must be 32 bytes");
  const der = Buffer.concat([ED25519_SPKI_PREFIX, rawPub]);
  const keyObject = crypto.createPublicKey({
    key: der,
    format: "der",
    type: "spki",
  });
  const msgBuf = Buffer.from(message, "utf8");
  // Signatures arrive base64 from the client (see useHolderGate.js).
  const sigBuf = Buffer.from(signature, "base64");
  return crypto.verify(null, msgBuf, keyObject, sigBuf);
}

// Parse and validate the challenge message the client signed. We control the
// message format, so we can enforce the wallet matches and the timestamp is
// fresh. Format (see issueChallenge):
//   "Cluck Norris holder verification\nWallet: <pk>\nNonce: <n>\nIssued: <ISO>"
function validateChallenge(message, expectedWallet) {
  const walletMatch = message.match(/Wallet:\s*([1-9A-HJ-NP-Za-km-z]+)/);
  const issuedMatch = message.match(/Issued:\s*([0-9TZ:.\-]+)/);
  if (!walletMatch || walletMatch[1] !== expectedWallet) {
    return { ok: false, reason: "wallet mismatch" };
  }
  if (!issuedMatch) return { ok: false, reason: "missing timestamp" };
  const issued = Date.parse(issuedMatch[1]);
  if (Number.isNaN(issued)) return { ok: false, reason: "bad timestamp" };
  const age = Date.now() - issued;
  if (age < -60_000 || age > CHALLENGE_TTL_MS) {
    return { ok: false, reason: "challenge expired" };
  }
  return { ok: true };
}

// Issue a fresh challenge string for the client to sign.
function issueChallenge(publicKey) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const issued = new Date().toISOString();
  return `Cluck Norris holder verification\nWallet: ${publicKey}\nNonce: ${nonce}\nIssued: ${issued}`;
}

// ── on-chain CLKN balance read (dependency-free JSON-RPC) ──────────────────
async function getClknBalance(ownerAddress) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [ownerAddress, { mint: CLKN_MINT }, { encoding: "jsonParsed" }],
  };
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  const accounts = (json && json.result && json.result.value) || [];
  let total = 0;
  for (const acc of accounts) {
    const ui =
      acc &&
      acc.account &&
      acc.account.data &&
      acc.account.data.parsed &&
      acc.account.data.parsed.info &&
      acc.account.data.parsed.info.tokenAmount &&
      acc.account.data.parsed.info.tokenAmount.uiAmount;
    if (typeof ui === "number") total += ui;
  }
  return total;
}

// ── Express mount helper ──────────────────────────────────────────────────
// Wire into server.js with:
//   const { mountWalletGate } = require("./lib/wallet-gate");
//   mountWalletGate(app);   // requires express.json() body parsing to be set up
function mountWalletGate(app) {
  // Step 1: client requests a challenge to sign.
  app.get("/api/wallet/challenge", (req, res) => {
    const pk = req.query.address;
    if (!pk) return res.status(400).json({ error: "address required" });
    try {
      base58Decode(pk); // validate format
      return res.json({
        challenge: issueChallenge(pk),
        threshold: HOLDER_THRESHOLD,
      });
    } catch (e) {
      return res.status(400).json({ error: "invalid address" });
    }
  });

  // Step 2+3+4: verify signature, then read balance, then grant/deny unlock.
  app.post("/api/wallet/verify", async (req, res) => {
    const { publicKey, message, signature } = req.body || {};
    if (!publicKey || !message || !signature) {
      return res
        .status(400)
        .json({ error: "publicKey, message, signature required" });
    }
    try {
      const fresh = validateChallenge(message, publicKey);
      if (!fresh.ok)
        return res.status(400).json({ verified: false, reason: fresh.reason });

      const sigOk = verifyWalletSignature({ publicKey, message, signature });
      if (!sigOk)
        return res
          .status(401)
          .json({ verified: false, reason: "bad signature" });

      const balance = await getClknBalance(publicKey);
      const isHolder = balance >= HOLDER_THRESHOLD;
      return res.json({
        verified: true,
        isHolder,
        balance,
        threshold: HOLDER_THRESHOLD,
        // The client stores this to unlock holder features for the session.
        // In production, mint a short-lived signed session token here instead
        // of trusting the client to remember `isHolder`.
        unlock: isHolder,
      });
    } catch (e) {
      return res.status(500).json({ verified: false, reason: e.message });
    }
  });
}

module.exports = {
  mountWalletGate,
  verifyWalletSignature,
  validateChallenge,
  issueChallenge,
  getClknBalance,
  base58Decode,
  _config: { CLKN_MINT, HOLDER_THRESHOLD, CHALLENGE_TTL_MS },
};
