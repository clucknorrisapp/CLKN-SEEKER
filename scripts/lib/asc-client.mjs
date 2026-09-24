// scripts/lib/asc-client.mjs — shared App Store Connect API client.
//
// Extracted out of scripts/asc-build-status.mjs (2026-09-24) so a second script
// (scripts/asc-testflight-distribute.mjs) doesn't grow a second copy of the JWT-minting code.
// Nothing here changed behavior for asc-build-status.mjs — same base64url, same mintToken
// (ES256 via Node's built-in crypto, `dsaEncoding: 'ieee-p1363'`), same 20-minute expiry, same
// selftest shape. It just now lives in one place.
//
// Auth: mints its own App Store Connect API JWT with Node's built-in `crypto` — no JWT library.
// Reads ASC_API_KEY_ID / ASC_API_ISSUER_ID / ASC_API_KEY_P8 from the environment, never from a
// file the repo ships, and never prints the private key.

import crypto from 'node:crypto';

export const API_BASE = 'https://api.appstoreconnect.apple.com/v1';
export const BUNDLE_ID = 'app.clucknorris.edu';

export function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function mintToken({ keyId, issuerId, privateKeyPem }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat,
    exp: iat + 1200, // Apple caps this token type at 20 minutes.
    aud: 'appstoreconnect-v1',
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

/** Reads the three ASC secrets from the environment. Returns null if any are missing. */
export function credsFromEnv() {
  const keyId = process.env.ASC_API_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID;
  const privateKeyPem = process.env.ASC_API_KEY_P8;
  if (!keyId || !issuerId || !privateKeyPem) return null;
  return { keyId, issuerId, privateKeyPem };
}

export function apiErrorMessage(status, json, text) {
  const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title;
  return `HTTP ${status}${detail ? ` — ${detail}` : text ? ` — ${text.slice(0, 300)}` : ''}`;
}

/**
 * A tiny App Store Connect API client: mints one token per instance (re-minted lazily if it's
 * gone stale mid-run — a long distribute run with many tester calls could otherwise outlive the
 * 20-minute token) and exposes a single `request(method, path, body)`.
 */
export class AscClient {
  constructor(creds) {
    this.creds = creds;
    this._token = null;
    this._tokenExp = 0;
  }

  _tokenValid() {
    const now = Math.floor(Date.now() / 1000);
    return this._token && this._tokenExp - now > 60;
  }

  token() {
    if (!this._tokenValid()) {
      this._token = mintToken(this.creds);
      this._tokenExp = Math.floor(Date.now() / 1000) + 1200;
    }
    return this._token;
  }

  /** method: 'GET' | 'POST' | 'PATCH' | 'DELETE'. body is JSON-serialized when present. */
  async request(method, path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token()}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // fall through — non-JSON body handled by the caller via `text`
    }
    return { res, json, text, ok: res.ok, status: res.status };
  }
}

/** Mint-and-verify a token against a throwaway EC P-256 key. No network call. */
export function runSelfTest() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const token = mintToken({ keyId: 'TESTKEYID', issuerId: 'test-issuer', privateKeyPem });
  const [encodedHeader, encodedPayload, encodedSig] = token.split('.');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const ok = crypto.verify(
    'sha256',
    Buffer.from(signingInput),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    sig
  );
  const header = JSON.parse(Buffer.from(encodedHeader.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const payload = JSON.parse(Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (!ok) {
    return { ok: false, reason: 'signature did NOT verify' };
  }
  if (header.alg !== 'ES256' || header.typ !== 'JWT' || header.kid !== 'TESTKEYID') {
    return { ok: false, reason: `header shape wrong: ${JSON.stringify(header)}` };
  }
  if (payload.aud !== 'appstoreconnect-v1' || payload.iss !== 'test-issuer' || payload.exp - payload.iat !== 1200) {
    return { ok: false, reason: `payload shape wrong: ${JSON.stringify(payload)}` };
  }
  return { ok: true };
}

/** Mask an email for logs: first 2 chars + *** + domain. Never print a full email in output. */
export function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}
