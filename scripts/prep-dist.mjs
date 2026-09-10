#!/usr/bin/env node
// prep-dist.mjs — fill dist/ with the right web content for a build target.
//
//   node scripts/prep-dist.mjs solana   → minimal placeholder (server.url overrides it)
//   node scripts/prep-dist.mjs store     → the pinned Store-edition release for the
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

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const LOCK = join(ROOT, "store-edition.lock");

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

if (mode === "solana") {
  // FULL edition loads the live site via server.url; dist/ is just a required stub.
  resetDist();
  writePlaceholder("solana target: content loads remotely via capacitor server.url");
  console.log("prep-dist: wrote placeholder dist/ for the solana (remote) target.");
  process.exit(0);
}

if (mode === "store") {
  const variant = target === "ios" ? "ios" : "google"; // googlePlay -> google
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
  console.log(`prep-dist: dist/ now holds Store-edition ${variant} v${pin.version} (sha256 verified).`);
  process.exit(0);
}

console.error('prep-dist: usage — node scripts/prep-dist.mjs <solana|store>');
process.exit(1);
