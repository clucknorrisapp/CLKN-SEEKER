#!/usr/bin/env node
// The installed launcher icon must be the store-listing icon.
//
// Why this exists: Google Play rejected the education app on 2026-10-03 under its Misleading
// Claims policy — "your app's installed icon or name differs from its store listing" (evidence:
// the launcher icon). The listing carried play-store/icon.png (the Cluck Norris art), while
// android/app/src/main/res/mipmap-* still held the placeholder Capacitor generated with
// `cap add android`, a blue "X". Nothing compared the two: the listing icon is uploaded in the
// store console and the launcher icon ships in the binary, so every check looked at one side.
//
// This decodes every launcher PNG and the listing icon, scales the listing icon down to each
// launcher size, and requires the pixels to match (inside the visible area, after the launcher's
// own corner/circle mask). It also refuses the exact Capacitor placeholder by digest, so a fresh
// `cap add android` or a re-scaffold can never quietly bring it back.
//
// Regenerate the icons from the listing icon (cloud session or the Mac) rather than editing this
// threshold if it fails.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const RES = path.join(ROOT, "android/app/src/main/res");
const LISTING = path.join(ROOT, "play-store/icon.png");
// sha256 of the Capacitor placeholder mipmap-xxxhdpi/ic_launcher.png that shipped until 2026-10-03.
const CAPACITOR_PLACEHOLDER = new Set(["87cb2f2ffe992652bb4fa768c73719a37b5852ab17fbf8e170e888f7a42b0761"]);

let failures = 0;
const ok = (name, cond, extra) => { console.log(`  ${cond ? "✓" : "✗"} ${name}${cond || extra === undefined ? "" : "  — " + extra}`); if (!cond) failures++; };
const read = (f) => PNG.sync.read(fs.readFileSync(f));

// Box-average `src` down to w×h (src is square and larger), returning RGBA floats.
function scale(src, w, h) {
  const out = new Float64Array(w * h * 4);
  const sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
      const i = (yy * src.width + xx) * 4;
      r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]; n++;
    }
    const o = (y * w + x) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
  }
  return out;
}

// Mean absolute RGB difference over pixels the launcher actually shows (alpha > 200 in the
// launcher PNG), comparing the launcher image's region [ox, ox+side) against the scaled listing.
function diff(launcher, listingScaled, side, ox) {
  let sum = 0, n = 0;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const li = ((y + ox) * launcher.width + (x + ox)) * 4;
    if (launcher.data[li + 3] < 200) continue;
    const si = (y * side + x) * 4;
    for (let c = 0; c < 3; c++) sum += Math.abs(launcher.data[li + c] - listingScaled[si + c]);
    n += 3;
  }
  return n ? sum / n : Infinity;
}

const listing = read(LISTING);
console.log("\nlauncher icon == store-listing icon");
ok("play-store/icon.png is the 512×512 listing icon", listing.width === 512 && listing.height === 512, `${listing.width}×${listing.height}`);

const dapp = path.join(ROOT, "dapp-store/icon.png");
if (fs.existsSync(dapp)) {
  const d = read(dapp);
  const same = d.width === listing.width && diff(d, scale(listing, d.width, d.height), d.width, 0) < 6;
  ok("dapp-store/icon.png is the same art as the Play listing icon", same);
}

const dens = fs.readdirSync(RES).filter((d) => /^mipmap-(m|h|xh|xxh|xxxh)dpi$/.test(d));
ok("every density has launcher icons", dens.length === 5, dens.join(","));
for (const d of dens) {
  for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
    const f = path.join(RES, d, name);
    if (!fs.existsSync(f)) { ok(`${d}/${name} exists`, false); continue; }
    const digest = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    ok(`${d}/${name} is not the Capacitor placeholder`, !CAPACITOR_PLACEHOLDER.has(digest));
    const img = read(f);
    let score;
    if (name === "ic_launcher_foreground.png") {
      // Adaptive foreground (108dp canvas): the listing icon sits in the 66dp safe zone.
      const side = Math.round(img.width * 66 / 108), off = Math.round((img.width - side) / 2);
      score = diff(img, scale(listing, side, side), side, off);
    } else {
      score = diff(img, scale(listing, img.width, img.height), img.width, 0);
    }
    ok(`${d}/${name} shows the listing icon (mean RGB diff ${score.toFixed(1)} < 12)`, score < 12, score.toFixed(1));
  }
}
const bg = fs.readFileSync(path.join(RES, "values/ic_launcher_background.xml"), "utf8");
ok("adaptive background layer is black (the listing icon's own ground), not the white placeholder", /#000000/i.test(bg));

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
