#!/usr/bin/env node
// build-edu-dev-bundle.mjs — build the iOS education-edition tarball straight from the platform
// repo's `develop` (or any ref), without the owner cloning it by hand, so `npm run build:ios-dev`
// (prep-dist.mjs `ios-dev`) has something to point at.
//
//   node scripts/build-edu-dev-bundle.mjs [--ref develop]
//
// What it does:
//   1. clones (or updates, if already cached) clucknorrisapp/cluck-norris-school at --ref into
//      .cache/cluck-norris-school
//   2. `npm ci` there
//   3. `node scripts/build-store-edition.mjs ios` — the SAME build the release path uses
//      (store-edition/store-edition.json's "ios" variant; google and ios share this config, they
//      only differ in output filename), producing release/store-edition-ios-<version>.tgz
//   4. copies that tgz into THIS repo's .cache/, prints its path, and writes the path to
//      .cache/edu-dev-bundle.txt so `npm run build:ios-dev` can pick it up without the caller
//      having to parse this script's stdout.
//
// This is the unpinned dev path only. It never touches store-edition.lock and never writes
// anything a release build reads.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
const SCHOOL = join(CACHE, "cluck-norris-school");
const REPO_URL = "https://github.com/clucknorrisapp/cluck-norris-school";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ref = arg("--ref", process.env.CLKN_REF || "develop");

mkdirSync(CACHE, { recursive: true });

function run(cmd, args, opts = {}) {
  console.log(`[edu-dev-bundle] ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

if (!existsSync(join(SCHOOL, ".git"))) {
  console.log(`[edu-dev-bundle] cloning ${REPO_URL} @ ${ref} into .cache/cluck-norris-school …`);
  run("git", ["clone", "--depth", "1", "--branch", ref, REPO_URL, SCHOOL]);
} else {
  console.log(`[edu-dev-bundle] updating cached clone to ${ref} …`);
  run("git", ["fetch", "--depth", "1", "origin", ref], { cwd: SCHOOL });
  run("git", ["checkout", "-B", `dev-bundle/${ref}`, "FETCH_HEAD"], { cwd: SCHOOL });
}

const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: SCHOOL }).toString().trim();
console.log(`[edu-dev-bundle] school repo at ${headSha.slice(0, 9)} (ref: ${ref})`);

console.log("[edu-dev-bundle] npm ci (this can take a few minutes) …");
run("npm", ["ci"], { cwd: SCHOOL });

console.log("[edu-dev-bundle] node scripts/build-store-edition.mjs ios …");
run("node", ["scripts/build-store-edition.mjs", "ios"], { cwd: SCHOOL });

// Find the freshest store-edition-ios-*.tgz the build just produced.
const releaseDir = join(SCHOOL, "release");
const tgzName = readdirSync(releaseDir)
  .filter((f) => /^store-edition-ios-.*\.tgz$/.test(f))
  .map((f) => ({ f, mtime: statSync(join(releaseDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0]?.f;

if (!tgzName) {
  console.error(`[edu-dev-bundle] build-store-edition.mjs did not leave a store-edition-ios-*.tgz in ${releaseDir}`);
  process.exit(1);
}

const src = join(releaseDir, tgzName);
const dest = join(CACHE, tgzName);
copyFileSync(src, dest);

const pointerFile = join(CACHE, "edu-dev-bundle.txt");
writeFileSync(pointerFile, dest + "\n");

console.log(`\n[edu-dev-bundle] done.`);
console.log(`  school ref:    ${ref} (${headSha.slice(0, 9)})`);
console.log(`  tarball:       ${dest}`);
console.log(`  pointer file:  ${pointerFile}`);
console.log(`\nUse it with:`);
console.log(`  CLKN_TARGET=ios-dev CLKN_IOS_DEV=1 CLKN_IOS_DEV_TGZ="${dest}" npm run prep:ios-dev`);
console.log(`or just: npm run build:ios-dev\n`);
