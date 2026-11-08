// Mono theme for the prebuilt 3D facility (public/bulkhead-3d/facility.js). The module takes no colour options, but
// its palette is a handful of literals in the bundle, so this re-tints them in place (idempotent):
//   breach colour  xt  #FF5A1F -> #FF3B30 (system red)      sealed colour  Ys  #2FBF71 -> #30D158 (system green)
//   'lumen' look   racks, plinth, slab, aisle, hub, label, LED tint ("cool") and unlit LEDs ("off") -> neutral greys
//   every other quoted hex / rgba() literal -> tools/mono-remap.mjs rules (bluish greys and light tints -> neutral)
//   the Cradle ring the module draws around the sealed rack (material Dt, outline At) keeps the breach colour, which is now
//   the brand red #FF3B30: a red C around a green orb, the same mark as the 2D one (red C, orb red then green once sealed).
//   --grey-ring: the reference variant instead (light-grey C, as in /tmp/claura-mono): only if the brand C goes grey.
//   node tools/mono-3d.mjs public/bulkhead-3d/facility.js [--dry] [--grey-ring]
import { readFileSync, writeFileSync } from "node:fs";
import { mono } from "./mono-remap.mjs";

const file = process.argv[2];
const dry = process.argv.includes("--dry");
const greyRing = process.argv.includes("--grey-ring");
let s = readFileSync(file, "utf8");
const log = [];
const rep = (from, to, label) => {
  const n = s.split(from).length - 1;
  if (n) s = s.split(from).join(to);
  log.push(`${n ? "ok " : "-- "} ${label} (${n})`);
};

rep(
  'lumen:{bg:"#0c0f14",rack:"#7d8591",panel:"#07090d",blade:"#20262f",plinth:"#171b22",slab:"#1d222a",aisle:"#12151a",hub:"#8d95a1",cool:[.55,.86,1],off:[.035,.05,.075],label:"#e9eef6"}',
  'lumen:{bg:"#0b0b0d",rack:"#838388",panel:"#08080a",blade:"#232326",plinth:"#19191c",slab:"#1f1f22",aisle:"#131315",hub:"#929297",cool:[.84,.85,.88],off:[.045,.045,.05],label:"#f5f5f7"}',
  "lumen palette -> neutral greys",
);
// the C ring around the sealed rack: its own light-grey colour instead of the breach colour
rep('var xt=new Ve("#FF5A1F"),Ys=new Ve("#2FBF71")', greyRing ? 'var xt=new Ve("#FF3B30"),Ys=new Ve("#30D158"),__monoRing=new Ve("#D1D1D6")' : 'var xt=new Ve("#FF3B30"),Ys=new Ve("#30D158")', "breach/sealed colours" + (greyRing ? " + grey ring colour" : " (ring keeps the brand red)"));
if (greyRing) rep("Dt=new Kn({color:xt.clone(),", "Dt=new Kn({color:__monoRing.clone(),", "ring material (lumen, unlit)");
if (greyRing) rep('Dt=new Kt({color:"#1b1f26",emissive:xt.clone(),emissiveIntensity:1.2,', 'Dt=new Kt({color:"#1b1f26",emissive:__monoRing.clone(),emissiveIntensity:.55,', "ring material (lit)");
if (greyRing) rep("t?(Dt.color.copy(xt),rn.color.copy(Ye),", "t?(Dt.color.copy(__monoRing),rn.color.copy(Ye),", "ring colour per frame (unlit)");
if (greyRing) rep("At.color.copy(xt),on.color.copy(Ye)", "At.color.copy(__monoRing),on.color.copy(Ye)", "ring outline per frame");
if (greyRing) rep(":(Dt.emissive.copy(xt),rn.emissive.copy(Ye),Dt.emissiveIntensity=1*", ":(Dt.emissive.copy(__monoRing),rn.emissive.copy(Ye),Dt.emissiveIntensity=.5*", "ring colour per frame (lit)");

rep("wn.material.uniforms.uA.value=Ye*.9", "wn.material.uniforms.uA.value=Ye*.42", "sealed floor glow under the rack at half strength (green stays a small mark)");

// remaining literals: quoted hex strings and rgba() calls only (never bare #abc, which could be a private field)
let n = 0;
s = s.replace(/"#([0-9a-fA-F]{6})"/g, (m, h) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [R, G, B] = mono(r, g, b);
  if (R === r && G === g && B === b) return m;
  n++;
  const o = [R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `"#${/[A-F]/.test(h) ? o.toUpperCase() : o}"`;
});
s = s.replace(/rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),([\d.]+)\)/g, (m, r, g, b, a) => {
  const [R, G, B] = mono(+r, +g, +b);
  if (R === +r && G === +g && B === +b) return m;
  n++;
  return `rgba(${R},${G},${B},${a})`;
});
log.push(`ok  other quoted hex / rgba literals (${n})`);
console.log(log.join("\n"));
if (!dry) writeFileSync(file, s);
