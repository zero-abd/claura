// Mono theme for the film's 3D facility (assets/vendor/facility.global.min.js), after the product's
// /tmp/claura-mono/tools/mono-3d.mjs. The module takes no colour options; its palette is a handful of literals in the
// bundle, so this re-tints them in place (idempotent; a second run changes nothing):
//   breach colour  xt  #FF5A1F -> #FF3B30 (system red)      sealed colour  Ys  #2FBF71 -> #30D158 (system green)
//   'lumen' look   racks, plinth, slab, aisle, hub, label, LED tint ("cool") and unlit LEDs ("off") -> neutral greys
//   the sealed floor glow under the rack at about half strength (green stays a small mark)
//   every other quoted hex / rgba() literal -> tools/mono-remap.mjs rules (bluish greys -> neutral, orange -> red)
// Brand rule (claura-brand/BRAND.md, mono palette; same as the product): the Cradle ring the module draws around the
// sealed rack (material Dt, outline At) is light grey (#D1D1D6) instead of the breach colour, and its orb takes the
// state colour (red in a breach, green once sealed), so the 3D mark matches the 2D one: grey C, red orb, green orb.
// (For a red C instead, drop the five "ring" lines below and re-run on the colour original.)
//   node tools/mono-3d.mjs assets/vendor/facility.global.min.js [--dry]
// The colour original is kept in .backup-v1-color/assets/vendor/.
import { readFileSync, writeFileSync } from "node:fs";
import { mono } from "./mono-remap.mjs";

const file = process.argv[2];
const dry = process.argv.includes("--dry");
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
rep('var xt=new Ve("#FF5A1F"),Ys=new Ve("#2FBF71")', 'var xt=new Ve("#FF3B30"),Ys=new Ve("#30D158"),__monoRing=new Ve("#D1D1D6")', "breach/sealed colours -> system red / green, + ring colour");
rep("Dt=new Kn({color:xt.clone(),", "Dt=new Kn({color:__monoRing.clone(),", "ring material (lumen, unlit)");
rep('Dt=new Kt({color:"#1b1f26",emissive:xt.clone(),emissiveIntensity:1.2,', 'Dt=new Kt({color:"#1b1f26",emissive:__monoRing.clone(),emissiveIntensity:.55,', "ring material (lit)");
rep("t?(Dt.color.copy(xt),rn.color.copy(Ye),", "t?(Dt.color.copy(__monoRing),rn.color.copy(Ye),", "ring colour per frame (unlit)");
rep("At.color.copy(xt),on.color.copy(Ye)", "At.color.copy(__monoRing),on.color.copy(Ye)", "ring outline per frame");
rep(":(Dt.emissive.copy(xt),rn.emissive.copy(Ye),Dt.emissiveIntensity=1*", ":(Dt.emissive.copy(__monoRing),rn.emissive.copy(Ye),Dt.emissiveIntensity=.5*", "ring colour per frame (lit)");
rep("wn.material.uniforms.uA.value=Ye*.9", "wn.material.uniforms.uA.value=Ye*.42", "sealed floor glow under the rack at half strength");
// lit look only (the film draws 'lumen', unlit): the two breach point lights and the two bluish key lights, as numbers
rep("new ds(16734751,", "new ds(16726832,", "breach point lights 0xFF5A1F -> 0xFF3B30");
rep("new fs(10335999,", "new fs(12105912,", "key light 0x9DB6FF -> 0xB8B8B8");
rep("new fs(13162751,", "new fs(14211288,", "fill light 0xC8D8FF -> 0xD8D8D8");

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
