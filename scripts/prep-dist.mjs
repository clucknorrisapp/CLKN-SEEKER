#!/usr/bin/env node
// prep-dist.mjs — fill dist/ with the right web content for a build target.
//
//   node scripts/prep-dist.mjs solana   → minimal placeholder (server.url overrides it)
//   node scripts/prep-dist.mjs store     → the pinned Store/Seeker-edition release for the
//                                          current CLKN_TARGET (googlePlay | ios)
//
// The Store edition is a SEPARATE, versioned frontend release built in the main
// app repo (see play-store/STORE-EDITION-MANIFEST.md + DELIVERY-CONTRACT.md). We
// consume a PINNED, CHECKSUMMED version from store-edition.lock so (a) a routine
// website change can never alter the installed store app, and (b) we never bundle
// an artifact that doesn't match what was reviewed. Pinning freezes the bundled
// FRONTEND only — the app still calls the live backend, so backend/API changes
// must stay compatible with pinned frontend versions.
//
// If nothing is pinned, the "store" path fails loudly on purpose — you cannot
// accidentally ship a placeholder or an unverified artifact to a store.

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
// The pin file. CLKN_LOCK_FILE overrides it for scripts/prep-dist-guard-test.mjs ONLY, so the
// guard can be exercised against synthetic bundles without a test ever writing the real lock —
// an earlier manual run of this same check did write it, and only a backup made it recoverable.
// Nothing in a build path sets this; if it is ever set in CI for a real build, that is a bug.
const LOCK = process.env.CLKN_LOCK_FILE || join(ROOT, "store-edition.lock");

const mode = process.argv[2];
const target = process.env.CLKN_TARGET || "solana";

function resetDist() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
}

function writePlaceholder(note) {
  writeFileSync(
    join(DIST, "index.html"),
    `<!DOCTYPE html><meta charset="utf-8"><title>Cluck Norris</title>\n<!-- ${note} -->\n`
  );
}

// The bundle content scan, shared by BOTH consumers: the pinned `store` path and the unpinned
// `seeker-dev` path. It lives here as ONE function on purpose. "The same logic written twice and
// fixed once" is this project's most expensive recurring bug, and a dev build that skipped a
// check the release build makes would be exactly that shape — you would test a bundle the real
// build would have refused.
function scanBundle(variant) {
  const FORBIDDEN_EDUCATION = [
    ["buy/swap link (jup.ag/swap)", /jup\.ag\/swap/i],
    ["CLKN mint address (token funnel)", /DW6DF2mjtyx67vcNmMhFm9XdxAwREurorghZcS3CBAGS/],
    ["token referral link (bags.fm ?r=)", /bags\.fm[^\s"'<>]*[?&]r=/i],
    ["on-chain signing (signAndSendTransaction)", /signAndSendTransaction/i],
    ["wallet-connect revoke UI (syncRevokeUi)", /syncRevokeUi/i],
    ["wallet-connect button (wallet-btn)", /wallet-btn/i],
  ];
  // ⚠️ The seeker rules are NOT plain substrings, and that is deliberate. The first version of
  // this list was — and it failed on its first real bundle, refusing a correct artifact because
  // the word "jupverify" appears in a COMMENT in the shared cluck-util.js explaining an old XSS
  // bug. A guard that fires on prose is worse than none: it trains whoever hits it to weaken it.
  //
  // What we actually care about is whether an operator SURFACE ships, so that is what is checked:
  //   (a) a bundled FILE named after one — definitive, no interpretation, and
  //   (b) a quoted ABSOLUTE PATH to one, i.e. something that could navigate there.
  // A mention in a comment or a log line satisfies neither.
  const OPERATOR_SURFACES = [
    "hub-desk", "hub-pay", "hub-apply", "client-portal", "jupverify",
    "owners-snapshot", "buyspecial-dashboard", "cuna-payout", "cuna-staking", "lp-rescue",
  ];
  const FORBIDDEN_SEEKER = OPERATOR_SURFACES.map((slug) => [
    `operator surface (${slug}) reachable as a path`,
    // "/hub-desk , '/hub-desk , `/hub-desk , (/hub-desk  — a real navigation target.
    new RegExp(`["'\`(]/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  ]);
  const FORBIDDEN = variant === "seeker" ? FORBIDDEN_SEEKER : FORBIDDEN_EDUCATION;

  // (a) the filename check, which the regex pass cannot express.
  if (variant === "seeker") {
    const named = [];
    const walkNames = (dir) => {
      for (const name of readdirSync(dir)) {
        const fp = join(dir, name);
        if (statSync(fp).isDirectory()) { walkNames(fp); continue; }
        const lower = name.toLowerCase();
        for (const slug of OPERATOR_SURFACES) if (lower.includes(slug)) named.push(`${slug} → ${fp.replace(DIST + "/", "dist/")}`);
      }
    };
    walkNames(DIST);
    if (named.length) {
      console.error(
        `\nprep-dist: the pinned seeker bundle SHIPS an operator surface — refusing to build.\n  ` +
        named.join("\n  ") + `\n\n` +
        `docs/SEEKER_TOOLS_BUILD.md §2 lists these as deliberately not in the app; several are\n` +
        `owner-only. Fix the prune in the MAIN repo and republish.\n`
      );
      process.exit(1);
    }
  }
  console.log(
    `prep-dist: scanning with the ${variant === "seeker" ? "SEEKER (operator-surface)" : "EDUCATION-ONLY"} rule set ` +
    `(${FORBIDDEN.length} patterns).`
  );
  const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".html", ".htm", ".css", ".json", ".svg", ".txt", ".map"]);
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { scan(p); continue; }
      const dot = name.lastIndexOf(".");
      if (dot < 0 || !TEXT_EXT.has(name.slice(dot).toLowerCase())) continue;
      const text = readFileSync(p, "utf8");
      for (const [label, re] of FORBIDDEN) {
        if (re.test(text)) {
          console.error(
            `\nprep-dist: FORBIDDEN content in the pinned ${variant} bundle — refusing to build.\n` +
            `  ${label}\n  found in ${p.replace(DIST + "/", "dist/")}\n\n` +
            (variant === "seeker"
              ? `This release carries an OPERATOR surface. Those are desk work on a large screen and\n` +
                `several are owner-only; docs/SEEKER_TOOLS_BUILD.md §2 lists them as deliberately not in\n` +
                `the app. A hit here means the MAIN repo's excludeKeys prune regressed — fix it there and\n` +
                `republish; do NOT ship this bundle.\n\n` +
                `⚠️ If the label above names wallet-connect, signing or the CLKN mint, the rule set is\n` +
                `wrong, not the bundle. The Seeker edition is the full product and ships all three.\n`
              : `This release still contains an EXCLUDED flow (buy/swap, wallet-connect, on-chain\n` +
                `signing, or a token referral). It must be stripped in the MAIN repo and republished\n` +
                `as a new store-edition release; do NOT ship this bundle. See play-store/STORE-EDITION-MANIFEST.md.\n`)
          );
          process.exit(1);
        }
      }
    }
  };
  scan(DIST);
}

if (mode === "solana") {
  // FULL edition loads the live site via server.url; dist/ is just a required stub.
  resetDist();
  writePlaceholder("solana target: content loads remotely via capacitor server.url");
  console.log("prep-dist: wrote placeholder dist/ for the solana (remote) target.");
  process.exit(0);
}

if (mode === "store") {
  // googlePlay -> google, ios -> ios, seeker -> seeker. The seeker edition goes through the
  // SAME pinned + checksummed path as the store editions, on purpose: the reason pinning
  // exists ("a routine website change can never alter the installed app") applies just as
  // hard to a dApp Store app, and arguably harder — it carries a wallet.
  const variant = target === "ios" ? "ios" : target === "seeker" ? "seeker" : "google";
  let lock = {};
  try { lock = JSON.parse(readFileSync(LOCK, "utf8")); } catch {}
  const pin = lock?.[variant];

  // Require a fully pinned + checksummed release. sourceCommit is recommended for
  // traceability back to the exact main-repo build.
  if (!pin || !pin.url || !pin.version || !pin.sha256) {
    console.error(
      `\nprep-dist: Store-edition release for "${variant}" is not fully pinned.\n` +
      `store-edition.lock needs { version, url, sha256 } (sourceCommit recommended), e.g.:\n` +
      `  "${variant}": { "version": "1.0.0", "url": "https://…/store-edition-${variant}-1.0.0.tgz",\n` +
      `                 "sha256": "<hex>", "sourceCommit": "<main-repo commit sha>" }\n` +
      `Refusing to build a store target without a pinned, checksummed release.\n`
    );
    process.exit(1);
  }

  const commitNote = pin.sourceCommit ? ` (main@${String(pin.sourceCommit).slice(0, 9)})` : "";
  console.log(`prep-dist: fetching Store-edition ${variant} v${pin.version}${commitNote} …`);
  const res = await fetch(pin.url);
  if (!res.ok) { console.error(`prep-dist: download failed HTTP ${res.status}`); process.exit(1); }
  const bytes = Buffer.from(await res.arrayBuffer());

  // Verify checksum BEFORE we touch dist/ — never bundle an unverified artifact.
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest.toLowerCase() !== String(pin.sha256).toLowerCase()) {
    console.error(
      `prep-dist: CHECKSUM MISMATCH — refusing to bundle.\n` +
      `  expected ${pin.sha256}\n  got      ${digest}\n`
    );
    process.exit(1);
  }

  resetDist();
  const tgz = join(ROOT, ".store-edition.tgz");
  writeFileSync(tgz, bytes);
  // Artifact is a .tgz whose single top-level dir holds the built site.
  execFileSync("tar", ["-xzf", tgz, "-C", DIST, "--strip-components=1"], { stdio: "inherit" });
  rmSync(tgz, { force: true });
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("prep-dist: extracted release has no index.html at root — wrong artifact shape?");
    process.exit(1);
  }

  // Defense-in-depth: independently scan the extracted bundle for content that variant
  // must never carry. The main repo runs its OWN allow-list verifier, but the wrapper must
  // not trust that blindly — a gap there once shipped a live Jupiter swap + wallet-connect +
  // token-referral into the store build, and only a checksum was verified here.
  //
  // ⚠️ THE RULES ARE PER-VARIANT, and getting this wrong breaks a build in either direction.
  //
  // The list below started life as "forbidden content, full stop", written when the only
  // bundled variants were the EDUCATION-ONLY store editions. When the `seeker` variant was
  // added it was routed through this same code path — correctly, because it wants the pin and
  // the checksum — but it inherited these patterns too, and **the Seeker edition legitimately
  // ships every one of the wallet ones.** It is the full product: wallet-connect, signing,
  // the CLKN mint. Measured against a real `store-edition-seeker-0.1.0.tgz` built from the
  // main repo, the education list hits 5 times (airdrop-engine.js, cluck-gate.js,
  // cluck-wallet.js and the app bundle), so `npm run build:seeker` could never have
  // succeeded — not for a missing tag, but by refusing its own correct artifact. That would
  // have surfaced the night the release tag was pushed.
  //
  // So: education variants keep the original list unchanged. The seeker variant gets its own,
  // and it is NOT empty — an unguarded variant is how the store gap happened in the first
  // place. What must never reach a phone is the OPERATOR surface (docs/SEEKER_TOOLS_BUILD.md
  // §2 "Deliberately NOT in the app"): desk work, payout controls and owner-only screens. A
  // hit there means the main repo's excludeKeys prune regressed.
  scanBundle(variant);

  console.log(
    `prep-dist: dist/ now holds ${variant === "seeker" ? "Seeker" : "Store"}-edition ${variant} ` +
    `v${pin.version} (sha256 + content scan verified).`
  );
  process.exit(0);
}

if (mode === "seeker-dev") {
  // ── A SEEKER APK YOU CAN PUT ON A PHONE TODAY, WITHOUT A PUBLISHED RELEASE. ──
  //
  // Why this exists. The `seeker` target consumes a pinned, checksummed release, and publishing
  // one needs a git tag only the owner can push. That is correct for anything that ships. But it
  // also meant the mobile-first app had NEVER been installed on a device — the only APKs anyone
  // could build were the `solana` thin shell over the live website. "We built it" and "someone
  // can use it" were separated by a tag.
  //
  // This mode takes a LOCALLY BUILT bundle instead (main repo:
  // `node scripts/build-store-edition.mjs seeker` → release/store-edition-seeker-<v>.tgz).
  //
  // ⛔ IT CANNOT BE USED TO SHIP. Four independent reasons, not one:
  //   1. It is a separate MODE. `npm run build:seeker` calls `prep:seeker`, which is mode
  //      `store`. A release build never reaches this code.
  //   2. It demands CLKN_SEEKER_DEV=1 explicitly, so it cannot be entered by accident or by a
  //      stray CLKN_TARGET.
  //   3. `npm run build:seeker-dev` assembles DEBUG only, under its own applicationId
  //      (app.clucknorris.seeker.dev). A dev build therefore cannot overwrite, impersonate or be
  //      uploaded in place of the real app, and both install side by side on the same phone.
  //   4. It stamps dist/ with DEV_BUILD_DO_NOT_PUBLISH.txt.
  //
  // What it does NOT skip is the content scan. A dev build runs the SAME seeker rules as the
  // release path, through the same function — testing a bundle the real build would have refused
  // is worse than not testing at all.
  if (process.env.CLKN_SEEKER_DEV !== "1") {
    console.error(
      "\nprep-dist: seeker-dev refused — set CLKN_SEEKER_DEV=1 to mean it.\n" +
      "This mode bundles an UNPINNED, locally built frontend. It is for putting a debug APK on\n" +
      "your own device, never for anything that ships. Use `npm run build:seeker` for that.\n"
    );
    process.exit(1);
  }
  const tgz = process.env.CLKN_SEEKER_DEV_TGZ;
  if (!tgz || !existsSync(tgz)) {
    console.error(
      `\nprep-dist: seeker-dev needs CLKN_SEEKER_DEV_TGZ pointing at a local bundle.\n` +
      (tgz ? `  no such file: ${tgz}\n` : "  (unset)\n") +
      `Build one in the MAIN repo:\n  node scripts/build-store-edition.mjs seeker\n` +
      `then point this at release/store-edition-seeker-<version>.tgz\n`
    );
    process.exit(1);
  }

  resetDist();
  execFileSync("tar", ["-xzf", tgz, "-C", DIST, "--strip-components=1"], { stdio: "inherit" });
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("prep-dist: that tarball has no index.html at root — wrong artifact shape?");
    process.exit(1);
  }

  // Same rules as the release path. Not a relaxed copy.
  scanBundle("seeker");

  writeFileSync(
    join(DIST, "DEV_BUILD_DO_NOT_PUBLISH.txt"),
    "This bundle was assembled by `prep-dist.mjs seeker-dev` from an UNPINNED local build.\n" +
    "It exists so the Seeker app can be installed on a device before a release tag exists.\n" +
    "It is NOT checksummed against a published release and must never be shipped.\n" +
    "Ship with: npm run build:seeker (pinned, checksummed, store-edition.lock).\n"
  );

  console.log(
    "\nprep-dist: dist/ now holds an UNPINNED dev Seeker bundle.\n" +
    "  source: " + tgz + "\n" +
    "  ⚠️ debug only, appId app.clucknorris.seeker.dev — never publish this.\n"
  );
  process.exit(0);
}

if (mode === "play-dev") {
  // ── THE PLAY/iOS EDITION ON A PHONE TODAY, WITHOUT A PUBLISHED RELEASE. ──
  //
  // The twin of `seeker-dev`, for the EDUCATION edition (main repo store-edition v1.1.0: the
  // Seeker shell built with no wallet — docs/STORE_EDITION.md there). `npm run build:play`
  // consumes a pinned, checksummed release and that needs a tag only the owner pushes; this mode
  // takes a LOCALLY BUILT bundle (`node scripts/build-store-edition.mjs google` in the main repo
  // → release/store-edition-google-<v>.tgz) so the store shell can be looked at on a device
  // before the tag exists.
  //
  // ⛔ IT CANNOT BE USED TO SHIP, for the same four independent reasons as seeker-dev:
  //   1. a separate MODE — `build:play` calls `prep:store` and never reaches this code;
  //   2. it demands CLKN_PLAY_DEV=1 explicitly;
  //   3. `build:play-dev` assembles DEBUG only, under its own applicationId
  //      (app.clucknorris.edu.dev) — it cannot overwrite or impersonate the store app, and the
  //      two install side by side;
  //   4. it stamps dist/ with DEV_BUILD_DO_NOT_PUBLISH.txt.
  //
  // And it runs the SAME education-only scan the release path runs (scanBundle("google")): a
  // wallet script, a swap link, the mint, a referral, signing code — refused here exactly as
  // there. A dev build that skipped a check the store build makes would let you test something
  // the store build would have refused.
  if (process.env.CLKN_PLAY_DEV !== "1") {
    console.error(
      "\nprep-dist: play-dev refused — set CLKN_PLAY_DEV=1 to mean it.\n" +
      "This mode bundles an UNPINNED, locally built education-edition frontend. It is for putting\n" +
      "a debug APK on your own device, never for anything that ships. Use `npm run build:play` for that.\n"
    );
    process.exit(1);
  }
  const tgz = process.env.CLKN_PLAY_DEV_TGZ;
  if (!tgz || !existsSync(tgz)) {
    console.error(
      `\nprep-dist: play-dev needs CLKN_PLAY_DEV_TGZ pointing at a local bundle.\n` +
      (tgz ? `  no such file: ${tgz}\n` : "  (unset)\n") +
      `Build one in the MAIN repo:\n  node scripts/build-store-edition.mjs google\n` +
      `then point this at release/store-edition-google-<version>.tgz\n`
    );
    process.exit(1);
  }

  resetDist();
  execFileSync("tar", ["-xzf", tgz, "-C", DIST, "--strip-components=1"], { stdio: "inherit" });
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("prep-dist: that tarball has no index.html at root — wrong artifact shape?");
    process.exit(1);
  }

  // The EDUCATION rules — the same ones `build:play` enforces. Not a relaxed copy.
  scanBundle("google");

  writeFileSync(
    join(DIST, "DEV_BUILD_DO_NOT_PUBLISH.txt"),
    "This bundle was assembled by `prep-dist.mjs play-dev` from an UNPINNED local build.\n" +
    "It exists so the Google Play / iOS edition can be installed on a device before a release tag exists.\n" +
    "It is NOT checksummed against a published release and must never be shipped.\n" +
    "Ship with: npm run build:play (pinned, checksummed, store-edition.lock).\n"
  );

  console.log(
    "\nprep-dist: dist/ now holds an UNPINNED dev Play/iOS-edition bundle.\n" +
    "  source: " + tgz + "\n" +
    "  ⚠️ debug only, appId app.clucknorris.edu.dev — never publish this.\n"
  );
  process.exit(0);
}

console.error('prep-dist: usage — node scripts/prep-dist.mjs <solana|store|seeker-dev|play-dev>');
process.exit(1);
