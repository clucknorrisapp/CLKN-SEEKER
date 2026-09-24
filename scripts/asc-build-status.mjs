#!/usr/bin/env node
// Reports the App Store Connect processing state for builds of a given MARKETING_VERSION,
// without touching xcodebuild or any CI signing step. Read-only: GET /v1/apps and GET
// /v1/builds. Never prints the private key — only whether it parsed and how the request went.
//
// Auth: mints its own App Store Connect API JWT via scripts/lib/asc-client.mjs (Node's built-in
// `crypto`, ES256), the same three secrets ios-testflight.yml already uses — ASC_API_KEY_ID,
// ASC_API_ISSUER_ID, ASC_API_KEY_P8 — read from the environment, never from a file the repo
// ships.
//
// Exit codes: 0 on any well-formed API response, including a FAILED/INVALID build — that is
// information the caller asked for, not a script failure. 1 only on auth/network/malformed-input
// errors, printed with the HTTP status and Apple's own `detail` text when available.

import { AscClient, BUNDLE_ID, apiErrorMessage, credsFromEnv, runSelfTest } from './lib/asc-client.mjs';

async function apiGet(client, path) {
  return client.request('GET', path);
}

async function selfTest() {
  const result = runSelfTest();
  if (!result.ok) {
    console.error(`selftest: ${result.reason}`);
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

  const creds = credsFromEnv();
  if (!creds) {
    console.error('ASC_API_KEY_ID / ASC_API_ISSUER_ID / ASC_API_KEY_P8 are not all set in the environment.');
    process.exit(1);
  }

  let client;
  try {
    client = new AscClient(creds);
    client.token(); // mint eagerly so a bad key fails fast, matching the old behavior
  } catch (err) {
    console.error(`failed to mint the App Store Connect JWT: ${err.message}`);
    process.exit(1);
  }

  let appsResp;
  try {
    appsResp = await apiGet(client, `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
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
    buildsResp = await apiGet(client, buildsPath);
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
