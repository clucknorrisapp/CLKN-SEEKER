#!/usr/bin/env node
// Distributes an already-uploaded, already-VALID App Store Connect build to a TestFlight beta
// group: sets export compliance, finds-or-creates the beta group, attaches the build, adds
// testers, and prints a status table. It never uploads a binary — that's ios-testflight.yml.
// It never dispatches xcodebuild — the App Manager API key (ASC_API_KEY_ID / ASC_API_ISSUER_ID /
// ASC_API_KEY_P8, the same three secrets every ASC script here uses) is enough for all of this.
//
// Auth: scripts/lib/asc-client.mjs — same JWT minting as asc-build-status.mjs, no JWT library.
//
// Exit codes: 0 on a completed run, even with per-tester or per-step warnings — those are
// printed, not fatal, because a partially-succeeded distribution (e.g. nine testers added, one
// rejected because they're not a team member and the group is internal) is still useful
// information, not a script failure. 1 only on: missing/bad ASC secrets, a network error talking
// to Apple, or the requested build cannot be resolved (wrong version/build_number, or the newest
// build for that version never reached VALID).
//
// Never prints a full tester email — see maskEmail() in the shared lib. Full emails only ever
// travel to Apple's API, never to a log line or the job summary.

import { AscClient, BUNDLE_ID, apiErrorMessage, credsFromEnv, maskEmail, runSelfTest } from './lib/asc-client.mjs';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function parseTesters(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, firstName, lastName] = entry.split(':').map((s) => (s !== undefined ? s.trim() : s));
      return { email, firstName: firstName || undefined, lastName: lastName || undefined };
    });
}

async function selfTest() {
  const result = runSelfTest();
  if (!result.ok) {
    console.error(`selftest: ${result.reason}`);
    process.exit(1);
  }
  // Also exercise the pure helpers this script adds on top of the shared lib.
  const cases = [
    ['a@b.com', 'a***@b.com'],
    ['ab@example.com', 'ab***@example.com'],
    ['abcdef@example.com', 'ab***@example.com'],
  ];
  for (const [input, expected] of cases) {
    const got = maskEmail(input);
    if (got !== expected) {
      console.error(`selftest: maskEmail(${input}) = ${got}, expected ${expected}`);
      process.exit(1);
    }
  }
  const parsed = parseTesters('a@b.com,c@d.com:First:Last');
  if (parsed.length !== 2 || parsed[0].email !== 'a@b.com' || parsed[1].firstName !== 'First' || parsed[1].lastName !== 'Last') {
    console.error(`selftest: parseTesters shape wrong: ${JSON.stringify(parsed)}`);
    process.exit(1);
  }
  console.log('selftest: ok — JWT mint/verify, maskEmail, and parseTesters all match expectations');
  process.exit(0);
}

/** Resolves the app id for BUNDLE_ID. Throws {fatal:true} shaped errors on auth/network issues. */
async function resolveApp(client) {
  let resp;
  try {
    resp = await client.request('GET', `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
  } catch (err) {
    throw new Error(`network error calling /v1/apps: ${err.message}`);
  }
  if (!resp.ok) {
    throw new Error(`GET /v1/apps failed: ${apiErrorMessage(resp.status, resp.json, resp.text)}`);
  }
  const app = resp.json?.data?.[0];
  if (!app) {
    throw new Error(`No app found in App Store Connect with bundle id "${BUNDLE_ID}".`);
  }
  return app.id;
}

/**
 * Resolves the build to distribute. If buildNumber is given, requires exactly that build and
 * that it is VALID. Otherwise picks the newest VALID build for the given marketing version.
 */
async function resolveBuild(client, appId, version, buildNumber) {
  const params = new URLSearchParams();
  params.set('filter[app]', appId);
  params.set('filter[preReleaseVersion.version]', version);
  if (buildNumber) params.set('filter[version]', buildNumber);
  params.set('sort', '-uploadedDate');
  params.set('limit', '10');
  params.set('fields[builds]', 'version,uploadedDate,processingState,expired,usesNonExemptEncryption');

  let resp;
  try {
    resp = await client.request('GET', `/builds?${params.toString()}`);
  } catch (err) {
    throw new Error(`network error calling /v1/builds: ${err.message}`);
  }
  if (!resp.ok) {
    throw new Error(`GET /v1/builds failed: ${apiErrorMessage(resp.status, resp.json, resp.text)}`);
  }
  const builds = resp.json?.data || [];
  if (builds.length === 0) {
    const scope = buildNumber ? `build ${buildNumber} of version ${version}` : `version ${version}`;
    throw new Error(`No build found in App Store Connect for ${scope}.`);
  }

  if (buildNumber) {
    const build = builds.find((b) => b.attributes?.version === buildNumber);
    if (!build) {
      throw new Error(`Build ${buildNumber} of version ${version} was not found.`);
    }
    if (build.attributes?.processingState !== 'VALID') {
      throw new Error(
        `Build ${buildNumber} of version ${version} is ${build.attributes?.processingState || 'unknown'}, not VALID.`
      );
    }
    return build;
  }

  const validBuild = builds.find((b) => b.attributes?.processingState === 'VALID');
  if (!validBuild) {
    const states = builds.map((b) => `${b.attributes?.version}:${b.attributes?.processingState}`).join(', ');
    throw new Error(`No VALID build found for version ${version} (newest builds: ${states || 'none'}).`);
  }
  return validBuild;
}

/** Step 2: export compliance. Sets usesNonExemptEncryption=false only if it is currently null. */
async function ensureExportCompliance(client, buildId) {
  const resp = await client.request('GET', `/builds/${buildId}?fields[builds]=usesNonExemptEncryption`);
  if (!resp.ok) {
    return { ok: false, warning: `GET export compliance failed: ${apiErrorMessage(resp.status, resp.json, resp.text)}` };
  }
  const current = resp.json?.data?.attributes?.usesNonExemptEncryption;
  if (current !== null && current !== undefined) {
    return { ok: true, state: current, changed: false };
  }
  const patch = await client.request('PATCH', `/builds/${buildId}`, {
    data: { type: 'builds', id: buildId, attributes: { usesNonExemptEncryption: false } },
  });
  if (!patch.ok) {
    return { ok: false, warning: `PATCH export compliance failed: ${apiErrorMessage(patch.status, patch.json, patch.text)}` };
  }
  return { ok: true, state: false, changed: true };
}

/** Step 3: find-or-create the beta group. Tries internal first, falls back to external. */
async function ensureBetaGroup(client, appId, name) {
  const findResp = await client.request(
    'GET',
    `/betaGroups?filter[app]=${encodeURIComponent(appId)}&filter[name]=${encodeURIComponent(name)}`
  );
  if (!findResp.ok) {
    throw new Error(`GET /v1/betaGroups failed: ${apiErrorMessage(findResp.status, findResp.json, findResp.text)}`);
  }
  const existing = findResp.json?.data?.[0];
  if (existing) {
    return { id: existing.id, kind: existing.attributes?.isInternalGroup ? 'internal' : 'external', created: false };
  }

  // Attempt 1: internal group with hasAccessToAllBuilds.
  const internalAttempt = await client.request('POST', '/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: { name, isInternalGroup: true, hasAccessToAllBuilds: true, feedbackEnabled: true },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  });
  if (internalAttempt.ok) {
    return { id: internalAttempt.json.data.id, kind: 'internal', created: true };
  }
  const internalDetail = apiErrorMessage(internalAttempt.status, internalAttempt.json, internalAttempt.text);
  console.warn(`create internal betaGroup (with hasAccessToAllBuilds) failed: ${internalDetail}`);

  // Attempt 2: internal group without hasAccessToAllBuilds (some App Manager keys reject it).
  const internalAttempt2 = await client.request('POST', '/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: { name, isInternalGroup: true, feedbackEnabled: true },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  });
  if (internalAttempt2.ok) {
    return { id: internalAttempt2.json.data.id, kind: 'internal', created: true };
  }
  const internalDetail2 = apiErrorMessage(internalAttempt2.status, internalAttempt2.json, internalAttempt2.text);
  console.warn(`create internal betaGroup (without hasAccessToAllBuilds) failed: ${internalDetail2}`);
  console.warn('falling back to an EXTERNAL group of the same name — external needs beta review for the first build.');

  // Attempt 3: external group.
  const externalAttempt = await client.request('POST', '/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: { name, isInternalGroup: false, feedbackEnabled: true },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  });
  if (!externalAttempt.ok) {
    throw new Error(
      `create betaGroup failed on all attempts (internal x2, external): ${apiErrorMessage(
        externalAttempt.status,
        externalAttempt.json,
        externalAttempt.text
      )}`
    );
  }
  return { id: externalAttempt.json.data.id, kind: 'external', created: true };
}

/** Step 4: attach the build to the group. 409 (already attached) is treated as success. */
async function attachBuild(client, groupId, buildId) {
  const resp = await client.request('POST', `/betaGroups/${groupId}/relationships/builds`, {
    data: [{ type: 'builds', id: buildId }],
  });
  if (resp.ok || resp.status === 409) {
    return { ok: true };
  }
  return { ok: false, warning: `attach build to group failed: ${apiErrorMessage(resp.status, resp.json, resp.text)}` };
}

/** Step 5: add one tester — create if absent, otherwise attach to the group. */
async function ensureTester(client, groupId, tester) {
  const findResp = await client.request('GET', `/betaTesters?filter[email]=${encodeURIComponent(tester.email)}`);
  if (!findResp.ok) {
    return { ok: false, warning: `lookup failed: ${apiErrorMessage(findResp.status, findResp.json, findResp.text)}` };
  }
  const existing = findResp.json?.data?.[0];

  if (!existing) {
    const attrs = { email: tester.email };
    if (tester.firstName) attrs.firstName = tester.firstName;
    if (tester.lastName) attrs.lastName = tester.lastName;
    const createResp = await client.request('POST', '/betaTesters', {
      data: {
        type: 'betaTesters',
        attributes: attrs,
        relationships: { betaGroups: { data: [{ type: 'betaGroups', id: groupId }] } },
      },
    });
    if (createResp.ok) return { ok: true, action: 'created' };
    const detail = apiErrorMessage(createResp.status, createResp.json, createResp.text);
    if (/team member|not a member|internal/i.test(detail)) {
      return {
        ok: false,
        warning: `${detail} — add this person under Users and Access first, or use an external group.`,
      };
    }
    return { ok: false, warning: `create tester failed: ${detail}` };
  }

  const attachResp = await client.request('POST', `/betaGroups/${groupId}/relationships/betaTesters`, {
    data: [{ type: 'betaTesters', id: existing.id }],
  });
  if (attachResp.ok || attachResp.status === 409) {
    return { ok: true, action: 'attached' };
  }
  const detail = apiErrorMessage(attachResp.status, attachResp.json, attachResp.text);
  if (/team member|not a member|internal/i.test(detail)) {
    return {
      ok: false,
      warning: `${detail} — add this person under Users and Access first, or use an external group.`,
    };
  }
  return { ok: false, warning: `attach tester failed: ${detail}` };
}

/** Best-effort: set the app's beta app review contact email, when --feedback_email is given. */
async function setFeedbackEmail(client, appId, feedbackEmail) {
  const appResp = await client.request('GET', `/apps/${appId}?include=betaAppReviewDetail`);
  if (!appResp.ok) {
    return { ok: false, warning: `lookup betaAppReviewDetail failed: ${apiErrorMessage(appResp.status, appResp.json, appResp.text)}` };
  }
  const detailRel = appResp.json?.data?.relationships?.betaAppReviewDetail?.data;
  const included = appResp.json?.included || [];
  const detail = detailRel ? included.find((i) => i.id === detailRel.id) : null;
  if (!detail) {
    return { ok: false, warning: 'no betaAppReviewDetail found for this app — skipping feedback email.' };
  }
  const patch = await client.request('PATCH', `/betaAppReviewDetails/${detail.id}`, {
    data: { type: 'betaAppReviewDetails', id: detail.id, attributes: { contactEmail: feedbackEmail } },
  });
  if (!patch.ok) {
    return { ok: false, warning: `set feedback email failed: ${apiErrorMessage(patch.status, patch.json, patch.text)}` };
  }
  return { ok: true };
}

/** Step 6: final status table — group's testers with invite state, plus the build's beta state. */
async function printFinalTable(client, appId, buildId, groupId, groupKind) {
  const buildResp = await client.request(
    'GET',
    `/builds/${buildId}?include=buildBetaDetail&fields[buildBetaDetails]=internalBuildState,externalBuildState`
  );
  let internalBuildState = '';
  let externalBuildState = '';
  if (buildResp.ok) {
    const included = buildResp.json?.included || [];
    const betaDetail = included[0];
    internalBuildState = betaDetail?.attributes?.internalBuildState ?? '';
    externalBuildState = betaDetail?.attributes?.externalBuildState ?? '';
  } else {
    console.warn(`GET build beta detail failed: ${apiErrorMessage(buildResp.status, buildResp.json, buildResp.text)}`);
  }

  const testersResp = await client.request('GET', `/betaGroups/${groupId}/betaTesters?fields[betaTesters]=email,inviteType`);
  const testerRows = [];
  if (testersResp.ok) {
    for (const t of testersResp.json?.data || []) {
      testerRows.push({
        email: maskEmail(t.attributes?.email),
        inviteType: t.attributes?.inviteType ?? '',
      });
    }
  } else {
    console.warn(`GET group testers failed: ${apiErrorMessage(testersResp.status, testersResp.json, testersResp.text)}`);
  }

  console.log('');
  console.log('=== TestFlight distribution summary ===');
  console.log(`App: ${BUNDLE_ID} (id ${appId})`);
  console.log(`Build: ${buildId}`);
  console.log(`Group: ${groupId} (${groupKind})`);
  console.log(`Internal beta state: ${internalBuildState || '(unknown)'}`);
  console.log(`External beta state: ${externalBuildState || '(unknown)'}`);
  console.log('Testers:');
  if (testerRows.length === 0) {
    console.log('  (none found in group)');
  } else {
    for (const row of testerRows) {
      console.log(`  ${row.email}  —  invite: ${row.inviteType || '(unknown)'}`);
    }
  }
}

async function main() {
  if (process.argv.includes('--selftest')) {
    await selfTest();
    return;
  }

  const version = argValue('--version') || process.env.VERSION || '1.1.1';
  const buildNumber = argValue('--build_number') || process.env.BUILD_NUMBER || undefined;
  const groupName = argValue('--group') || process.env.GROUP || 'testers';
  const testersRaw = argValue('--testers') || process.env.TESTERS || '';
  const feedbackEmail = argValue('--feedback_email') || process.env.FEEDBACK_EMAIL || undefined;
  const testers = parseTesters(testersRaw);

  const creds = credsFromEnv();
  if (!creds) {
    console.error('ASC_API_KEY_ID / ASC_API_ISSUER_ID / ASC_API_KEY_P8 are not all set in the environment.');
    process.exit(1);
  }

  const client = new AscClient(creds);
  let hadWarning = false;

  let appId;
  let build;
  try {
    client.token(); // mint eagerly so a bad key fails fast
    appId = await resolveApp(client);
    build = await resolveBuild(client, appId, version, buildNumber);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const buildId = build.id;
  console.log(`Resolved build ${build.attributes?.version} of version ${version} (${buildId}), processingState=${build.attributes?.processingState}.`);

  // Step 2: export compliance.
  const compliance = await ensureExportCompliance(client, buildId);
  if (!compliance.ok) {
    hadWarning = true;
    console.warn(compliance.warning);
  } else {
    console.log(
      `Export compliance: usesNonExemptEncryption=${compliance.state} (${compliance.changed ? 'just set' : 'already set'}).`
    );
  }

  // Step 3: beta group.
  let group;
  try {
    group = await ensureBetaGroup(client, appId, groupName);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log(`Beta group "${groupName}": ${group.id} (${group.kind}${group.created ? ', just created' : ''}).`);

  // Step 4: attach build.
  const attach = await attachBuild(client, group.id, buildId);
  if (!attach.ok) {
    hadWarning = true;
    console.warn(attach.warning);
  } else {
    console.log(`Build ${buildId} attached to group ${group.id}.`);
  }

  // Optional: feedback email.
  if (feedbackEmail) {
    const fb = await setFeedbackEmail(client, appId, feedbackEmail);
    if (!fb.ok) {
      hadWarning = true;
      console.warn(fb.warning);
    } else {
      console.log(`Beta app review contact email set.`);
    }
  }

  // Step 5: testers.
  if (testers.length === 0) {
    console.log('No testers given — skipping tester step.');
  }
  for (const tester of testers) {
    const result = await ensureTester(client, group.id, tester);
    const masked = maskEmail(tester.email);
    if (!result.ok) {
      hadWarning = true;
      console.warn(`Tester ${masked}: ${result.warning}`);
    } else {
      console.log(`Tester ${masked}: ${result.action}.`);
    }
  }

  // Step 6: final table.
  await printFinalTable(client, appId, buildId, group.id, group.kind);

  if (hadWarning) {
    console.log('');
    console.log('Completed with warnings — see above. Exiting 0 (warnings are not fatal).');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`unexpected error: ${err.stack || err.message}`);
  process.exit(1);
});
