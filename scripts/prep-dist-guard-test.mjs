#!/usr/bin/env node
// prep-dist-guard-test.mjs — does the bundle content guard actually guard?
//
// WHY THIS EXISTS. scripts/prep-dist.mjs refuses to bundle a pinned release that carries content
// the variant must never ship. That guard was written for the EDUCATION-ONLY store editions
// (googlePlay / ios), whose rule is "no wallet, no signing, no token funnel". When the `seeker`
// variant was added it was routed through the same code path — correctly, because it wants the
// pin and the checksum — and silently inherited those rules too.
//
// The Seeker edition is the FULL product: wallet-connect, signing, the CLKN mint. Measured
// against a real store-edition-seeker tarball, the education rules hit five times. So
// `npm run build:seeker` could never have succeeded — not for a missing release tag, but by
// refusing its own correct artifact. Nothing would have revealed that until the night the tag
// was pushed, which is the worst possible moment to discover it.
//
// The fix made the rules per-variant. This test exists because a rule set that has only ever
// been seen to PASS is not known to guard anything — the repo has shipped exactly that before.
// Every case below is run against a bundle built here, and the guard must FAIL the bad ones.
//
//   node scripts/prep-dist-guard-test.mjs
//
// Self-contained: builds its own synthetic bundles, serves them over loopback, and points
// prep-dist at a TEMP lock file via CLKN_LOCK_FILE. It never touches store-edition.lock — an
// earlier manual version of this check did, and only a backup made that recoverable.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "prepguard-"));
const TOP = "store-edition-seeker-0.1.0";
let failures = 0;

// A minimal bundle shaped like the real Seeker edition: it legitimately contains wallet-connect,
// on-chain signing and the CLKN mint, because the real one does. If a future change makes the
// seeker rules reject THIS, the rules are wrong.
function baseBundle() {
  const dir = join(work, "src-" + Math.random().toString(36).slice(2), TOP);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!DOCTYPE html><title>Cluck Norris</title>\n");
  writeFileSync(
    join(dir, "cluck-wallet.js"),
    // Deliberately every education-forbidden marker: this is what the Seeker edition ships.
    'export const MINT = "DW6DF2mjtyx67vcNmMhFm9XdxAwREurorghZcS3CBAGS";\n' +
      'export async function send(p, tx) { return p.signAndSendTransaction(tx); }\n' +
      'export const BTN = "wallet-btn";\n' +
      'export function syncRevokeUi() {}\n' +
      'export const SWAP = "https://jup.ag/swap/SOL-CLKN";\n'
  );
  // Prose that MENTIONS an operator surface without shipping one. The first version of the
  // seeker rules was a plain substring scan and refused a correct bundle over exactly this —
  // the word "jupverify" inside a comment in the shared cluck-util.js.
  writeFileSync(
    join(dir, "cluck-util.js"),
    "// History: jupverify-admin.html once rendered an unauthenticated submitter's fields as\n" +
      "// live anchors. That is why esc() lives here, shared, instead of per-page.\n" +
      "export const esc = (s) => String(s);\n"
  );
  return dir;
}

function pack(dir) {
  const tgz = join(work, "b-" + Math.random().toString(36).slice(2) + ".tgz");
  execFileSync("tar", ["-czf", tgz, "-C", join(dir, ".."), TOP]);
  return tgz;
}

// One server for the whole run; each case swaps which bytes it serves.
// ⚠️ The child is run ASYNCHRONOUSLY, and that is not a style choice. The bundle server lives in
// THIS process, so a synchronous execFileSync would block the event loop for the whole child —
// the server could never answer its fetch, and every case failed with UND_ERR_HEADERS_TIMEOUT.
const execFileAsync = promisify(execFile);

let serving = Buffer.alloc(0);
const server = createServer((_q, r) => { r.writeHead(200); r.end(serving); });
await new Promise((res) => server.listen(0, "127.0.0.1", res));
const port = server.address().port;

async function runCase({ name, target, mutate, expect }) {
  const dir = baseBundle();
  if (mutate) mutate(dir);
  const tgz = pack(dir);
  serving = readFileSync(tgz);
  const sha = createHash("sha256").update(serving).digest("hex");

  const lockPath = join(work, "lock-" + Math.random().toString(36).slice(2) + ".json");
  const key = target === "seeker" ? "seeker" : target === "ios" ? "ios" : "google";
  writeFileSync(
    lockPath,
    JSON.stringify({ [key]: { version: "0.0.0-test", url: `http://127.0.0.1:${port}/b.tgz`, sha256: sha } })
  );

  let code = 0;
  let out = "";
  try {
    const r = await execFileAsync(process.execPath, [join(ROOT, "scripts", "prep-dist.mjs"), "store"], {
      cwd: ROOT,
      env: { ...process.env, CLKN_TARGET: target, CLKN_LOCK_FILE: lockPath },
      encoding: "utf8",
    });
    out = r.stdout + r.stderr;
  } catch (e) {
    code = e.code ?? 1;
    out = String(e.stdout || "") + String(e.stderr || "");
  }

  const want = expect === "pass" ? 0 : 1;
  const ok = code === want;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) {
    console.log(`      expected exit ${want}, got ${code}`);
    console.log(out.split("\n").filter(Boolean).slice(-6).map((l) => "      " + l).join("\n"));
  }
}

console.log("\nprep-dist bundle guard\n");

await runCase({
  name: "seeker: a correct Seeker bundle is ACCEPTED (wallet, signing and the mint are its job)",
  target: "seeker",
  expect: "pass",
});

await runCase({
  name: "seeker: a bundle that SHIPS an operator page is REFUSED (filename)",
  target: "seeker",
  mutate: (d) => writeFileSync(join(d, "hub-desk.html"), "<html>desk</html>"),
  expect: "fail",
});

await runCase({
  name: "seeker: a quoted absolute path to an operator surface is REFUSED",
  target: "seeker",
  mutate: (d) => writeFileSync(join(d, "nav.js"), 'location.href = "/cuna-payout";\n'),
  expect: "fail",
});

await runCase({
  name: "seeker: merely MENTIONING an operator surface in prose is ACCEPTED (no false positive)",
  target: "seeker",
  mutate: (d) => writeFileSync(join(d, "notes.js"), "// see hub-desk and lp-rescue for the desk flows\n"),
  expect: "pass",
});

await runCase({
  name: "googlePlay: the education rules still REFUSE wallet/signing content",
  target: "googlePlay",
  expect: "fail",
});

await runCase({
  name: "ios: the education rules still REFUSE wallet/signing content",
  target: "ios",
  expect: "fail",
});

await runCase({
  name: "googlePlay: a genuinely education-only bundle is ACCEPTED",
  target: "googlePlay",
  mutate: (d) => writeFileSync(join(d, "cluck-wallet.js"), "export const esc = (s) => String(s);\n"),
  expect: "pass",
});

// A wrong checksum must lose to nothing — the pin is the whole reason this path exists.
{
  const dir = baseBundle();
  const tgz = pack(dir);
  serving = readFileSync(tgz);
  const lockPath = join(work, "lock-badsha.json");
  writeFileSync(
    lockPath,
    JSON.stringify({ seeker: { version: "0.0.0-test", url: `http://127.0.0.1:${port}/b.tgz`, sha256: "00".repeat(32) } })
  );
  let code = 0;
  try {
    await execFileAsync(process.execPath, [join(ROOT, "scripts", "prep-dist.mjs"), "store"], {
      cwd: ROOT,
      env: { ...process.env, CLKN_TARGET: "seeker", CLKN_LOCK_FILE: lockPath },
      encoding: "utf8",
    });
  } catch (e) { code = e.code ?? 1; }
  const ok = code === 1;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} seeker: a CHECKSUM MISMATCH is refused before anything is bundled`);
}

server.close();
rmSync(work, { recursive: true, force: true });

console.log(failures === 0 ? "\nall passed\n" : `\n${failures} FAILING\n`);
process.exit(failures === 0 ? 0 : 1);
