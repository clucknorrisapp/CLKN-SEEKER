#!/usr/bin/env node
// prep-dist.mjs — fill dist/ with the right web content for a build target.
//
//   node scripts/prep-dist.mjs solana   → minimal placeholder (server.url overrides it)
//   node scripts/prep-dist.mjs store     → the pinned Store-edition release for the
//                                          current CLKN_TARGET (googlePlay | ios)
//
// The Store edition is a SEPARATE, versioned frontend release built in the main
// app repo (see play-store/STORE-EDITION-MANIFEST.md). We consume a PINNED version
// from store-edition.lock so a routine website change can never alter the installed
// store app. If nothing is pinned yet, the "store" path fails loudly on purpose —
// you cannot accidentally ship a placeholder to Google Play / the App Store.

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

  if (!pin || !pin.url || !pin.version) {
    console.error(
      `\nprep-dist: NO Store-edition release pinned for "${variant}".\n` +
      `The Store edition is built + published from the MAIN app repo, then pinned here.\n` +
      `Edit store-edition.lock, e.g.:\n` +
      `  { "${variant}": { "version": "1.0.0", "url": "https://<release-artifact>.tgz" } }\n` +
      `Refusing to build a store target without a real Store-edition release.\n`
    );
    process.exit(1); // hard-stops build:play / build:ios until a real release is pinned
  }

  console.log(`prep-dist: fetching Store-edition ${variant} v${pin.version} …`);
  resetDist();
  const tgz = join(ROOT, ".store-edition.tgz");
  const res = await fetch(pin.url);
  if (!res.ok) { console.error(`prep-dist: download failed HTTP ${res.status}`); process.exit(1); }
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  // Store-edition artifact is expected to be a .tgz whose top level is the built site.
  execFileSync("tar", ["-xzf", tgz, "-C", DIST, "--strip-components=1"], { stdio: "inherit" });
  rmSync(tgz, { force: true });
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("prep-dist: extracted release has no index.html — wrong artifact?");
    process.exit(1);
  }
  console.log(`prep-dist: dist/ now holds Store-edition ${variant} v${pin.version}.`);
  process.exit(0);
}

console.error('prep-dist: usage — node scripts/prep-dist.mjs <solana|store>');
process.exit(1);
