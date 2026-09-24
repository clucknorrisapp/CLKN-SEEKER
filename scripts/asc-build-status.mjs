#!/usr/bin/env node
// Reports the App Store Connect processing state for builds of a given MARKETING_VERSION,
// without touching xcodebuild or any CI signing step. Read-only: GET /v1/apps and GET
// /v1/builds. Never prints the private key — only whether it parsed and how the request went.
//
// Auth: mints its own App Store Connect API JWT with Node's built-in `crypto` (ES256), the same
// three secrets ios-testflight.yml already uses — ASC_API_KEY_ID, ASC_API_ISSUER_ID,
// ASC_API_KEY_P8 — read from the environment, never from a file the repo ships.
//
// Exit codes: 0 on any well-formed API response, including a FAILED/INVALID build — that is
// information the caller asked for, not a script failure. 1 only on auth/network/malformed-input
// errors, printed with the HTTP status and Apple's own `detail` text when available.

import crypto from 'node:crypto';

const BUNDLE_ID = 'app.clucknorris.edu';
const API_BASE = 'https://api.appstoreconnect.apple.com/v1';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function mintToken({ keyId, issuerId, privateKeyPem }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat,
    exp: iat + 1200, // Apple caps this token type at 20 minutes; matches the header comment.
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

async function apiGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // fall through — non-JSON body handled below
  }
  return { res, json, text };
}

function apiErrorMessage(status, json, text) {
  const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title;
  return `HTTP ${status}${detail ? ` — ${detail}` : text ? ` — ${text.slice(0, 300)}` : ''}`;
}

async function selfTest() {
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
    console.error('selftest: signature did NOT verify');
    process.exit(1);
  }
  if (header.alg !== 'ES256' || header.typ !== 'JWT' || header.kid !== 'TESTKEYID') {
    console.error('selftest: header shape wrong', header);
    process.exit(1);
  }
  if (payload.aud !== 'appstoreconnect-v1' || payload.iss !== 'test-issuer' || payload.exp - payload.iat !== 1200) {
    console.error('selftest: payload shape wrong', payload);
    process.exit(1);
  }
  console.log('selftest: ok — JWT minted and verified with crypto.sign/crypto.verify (ES256, ieee-p1363)');
  process.exit(0);
}

async function main() {
  if (process.argv.includes('--selftest')) {
    await selfTest();
    return;
  }

  const versionArg = process.argv.find((a, i) => process.argv[i - 1] === '--version');
  const version = versionArg || process.env.BUILD_VERSION || '1.1.1';

  const keyId = process.env.ASC_API_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID;
  const privateKeyPem = process.env.ASC_API_KEY_P8;

  if (!keyId || !issuerId || !privateKeyPem) {
    console.error('ASC_API_KEY_ID / ASC_API_ISSUER_ID / ASC_API_KEY_P8 are not all set in the environment.');
    process.exit(1);
  }

  let token;
  try {
    token = mintToken({ keyId, issuerId, privateKeyPem });
  } catch (err) {
    console.error(`failed to mint the App Store Connect JWT: ${err.message}`);
    process.exit(1);
  }

  let appsResp;
  try {
    appsResp = await apiGet(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`, token);
  } catch (err) {
    console.error(`network error calling /v1/apps: ${err.message}`);
    process.exit(1);
  }
  if (!appsResp.res.ok) {
    console.error(`GET /v1/apps failed: ${apiErrorMessage(appsResp.res.status, appsResp.json, appsResp.text)}`);
    process.exit(1);
  }
  const app = appsResp.json?.data?.[0];
  if (!app) {
    console.log(`No app found in App Store Connect with bundle id "${BUNDLE_ID}".`);
    return;
  }
  const appId = app.id;

  const buildsPath =
    `/builds?filter[app]=${encodeURIComponent(appId)}` +
    `&filter[preReleaseVersion.version]=${encodeURIComponent(version)}` +
    `&sort=-uploadedDate&limit=5` +
    `&fields[builds]=version,uploadedDate,processingState,expired,minOsVersion,usesNonExemptEncryption` +
    `&include=buildBetaDetail` +
    `&fields[buildBetaDetails]=internalBuildState,externalBuildState`;

  let buildsResp;
  try {
    buildsResp = await apiGet(buildsPath, token);
  } catch (err) {
    console.error(`network error calling /v1/builds: ${err.message}`);
    process.exit(1);
  }
  if (!buildsResp.res.ok) {
    console.error(`GET /v1/builds failed: ${apiErrorMessage(buildsResp.res.status, buildsResp.json, buildsResp.text)}`);
    process.exit(1);
  }

  const builds = buildsResp.json?.data || [];
  const included = buildsResp.json?.included || [];
  const betaDetailsById = new Map(included.map((item) => [item.id, item]));

  console.log(`App: ${BUNDLE_ID} (id ${appId})`);
  console.log(`Builds for MARKETING_VERSION ${version}:`);
  if (builds.length === 0) {
    console.log(`  (none found)`);
    return;
  }

  const rows = builds.map((b) => {
    const attrs = b.attributes || {};
    const betaRel = b.relationships?.buildBetaDetail?.data;
    const betaDetail = betaRel ? betaDetailsById.get(betaRel.id) : null;
    const betaAttrs = betaDetail?.attributes || {};
    return {
      build: attrs.version ?? '',
      uploadedDate: attrs.uploadedDate ?? '',
      processingState: attrs.processingState ?? '',
      expired: String(attrs.expired ?? ''),
      internalBetaState: betaAttrs.internalBuildState ?? '',
      externalBetaState: betaAttrs.externalBuildState ?? '',
    };
  });

  const cols = [
    ['build', 'Build'],
    ['uploadedDate', 'Uploaded'],
    ['processingState', 'Processing'],
    ['expired', 'Expired'],
    ['internalBetaState', 'Internal Beta'],
    ['externalBetaState', 'External Beta'],
  ];
  const widths = cols.map(([key, label]) => Math.max(label.length, ...rows.map((r) => String(r[key]).length)));

  const formatRow = (values) => values.map((v, i) => String(v).padEnd(widths[i])).join('  |  ');
  console.log(formatRow(cols.map(([, label]) => label)));
  console.log(widths.map((w) => '-'.repeat(w)).join('--|--'));
  for (const row of rows) {
    console.log(formatRow(cols.map(([key]) => row[key])));
  }
}

main().catch((err) => {
  console.error(`unexpected error: ${err.stack || err.message}`);
  process.exit(1);
});
