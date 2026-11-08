// Mono theme, step 1 of 2: rewrite every literal colour in a stylesheet to the black · grey · red palette.
//
//   node tools/mono-remap.mjs src/style.css [more files]      rewrite in place, print a summary
//   node tools/mono-remap.mjs --dry src/style.css             print what would change, write nothing
//
// Value-level and idempotent (a mono colour maps to itself), so it is safe to re-run after other edits to the file.
// Step 2 is src/theme-mono.css (tokens, wallpaper, glass, component states), imported after style.css.
//
// Rules, by hue of the literal (HSL), alpha always kept:
//   neutral (sat < 0.08)                 -> unchanged
//   navy / ink / blue / purple / teal / pink, and every dark tint (L < 0.2)
//                                        -> neutral grey of the same luminance (no colour bleeds into the glass)
//   red .. orange (h < 28 or h >= 340)   -> Apple red family (#FF3B30, hue 3.4), same saturation and lightness
//   amber .. yellow (28 <= h < 62)       -> Apple orange family (#FF9F0A, hue 35.8)
//   green (62 <= h < 175)                -> Apple green family (#30D158, hue 135.6)
// plus a few exact brand pairs (EXACT) so the key colours land exactly on the system values.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EXACT = {
  ff5a1f: "ff3b30", // accent -> system red
  f24a0d: "d70015", // pressed accent -> pressed red
  e5460f: "d70015",
  ff7a45: "ff5147", // accent highlight -> red highlight
  ff7f4d: "ff5a50",
  ff8a5c: "ff6259",
  b8400b: "c4170f", // print accent (light paper) -> deep red
  "2fbf71": "30d158", // safe -> system green
  "5bd896": "5ee07f",
  "25a35f": "24a849",
  "13774a": "16803a", // print safe
  f5b83d: "ff9f0a", // amber -> system orange
  ffb08f: "ffb35c", // light orange label text (admin role, restricted class)
  "231503": "1c0d00",
};

const OUTS = new Set([...Object.values(EXACT), "ff3b30", "d70015", "ff9f0a", "30d158"]);
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (y) => Math.round(255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055));
const grey = (r, g, b) => {
  const v = delin(0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b));
  return [v, v, v];
};
function hsl(r, g, b) {
  (r /= 255), (g /= 255), (b /= 255);
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}
const hex2 = (n) => n.toString(16).padStart(2, "0");

/** [r,g,b] -> mono [r,g,b] */
export function mono(r, g, b) {
  const key = hex2(r) + hex2(g) + hex2(b);
  if (OUTS.has(key)) return [r, g, b]; // already a mono value: keep (idempotent)
  if (EXACT[key]) {
    const e = EXACT[key];
    return [parseInt(e.slice(0, 2), 16), parseInt(e.slice(2, 4), 16), parseInt(e.slice(4, 6), 16)];
  }
  const [h, s, l] = hsl(r, g, b);
  if (s < 0.08) return [r, g, b];
  if (l < 0.2 && !(h < 28 || h >= 340)) return grey(r, g, b);
  if (h < 28 || h >= 340) return fromHsl(3.4, Math.max(s, 0.85), l);
  if (h < 62) return fromHsl(35.8, Math.max(s, 0.9), l);
  if (h < 175) return fromHsl(135.6, Math.min(Math.max(s, 0.55), 0.7), l);
  return grey(r, g, b);
}

export function remapText(src) {
  const changes = [];
  let out = src.replace(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (m, h) => {
    let full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
    const a = full.length === 8 ? full.slice(6) : "";
    full = full.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    const [R, G, B] = mono(r, g, b);
    if (R === r && G === g && B === b) return m;
    const upper = /[A-F]/.test(h) && !/[a-f]/.test(h);
    let o = `#${hex2(R)}${hex2(G)}${hex2(B)}${a}`;
    if (upper) o = o.toUpperCase();
    changes.push([m, o]);
    return o;
  });
  out = out.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(\s*,\s*[\d.]+)?\s*\)/g, (m, r, g, b, a) => {
    [r, g, b] = [r, g, b].map(Number);
    const [R, G, B] = mono(r, g, b);
    if (R === r && G === g && B === b) return m;
    const sp = /,\s/.test(m) ? ", " : ",";
    const o = `${a ? "rgba" : "rgb"}(${R}${sp}${G}${sp}${B}${a ? sp + a.replace(/^\s*,\s*/, "") : ""})`;
    changes.push([m, o]);
    return o;
  });
  return { out, changes };
}

// compare real paths: a symlinked checkout (macOS /tmp -> /private/tmp) used to make this silently do nothing
const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  for (const f of args.filter((a) => !a.startsWith("--"))) {
    const { out, changes } = remapText(readFileSync(f, "utf8"));
    const uniq = new Map();
    for (const [a, b] of changes) uniq.set(a, b);
    console.log(`${f}: ${changes.length} literal colours rewritten (${uniq.size} distinct)`);
    for (const [a, b] of uniq) console.log(`   ${a}  ->  ${b}`);
    if (!dry) writeFileSync(f, out);
  }
}
