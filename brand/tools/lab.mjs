import fs from 'node:fs';
import * as g from './geo.mjs';
import { layersToSvg } from './svg.mjs';
const { circle, taperedRing, pt, D, S, U, cRingD } = g;
const V = [];
const mk = (name, layers) => V.push({ name, layers });
// L1 mouth east, pearl in mouth
{ const ring = taperedRing({ r: 84, wMax: 56, wMin: 20, a0: 38, a1: 322, p: 0.9, peak: 0.5 });
  mk('L1 east pearl', [{ d: D(ring), fill: 'O' }, { d: D(circle(...pt(128,128,84,0), 22)), fill: 'O', id: 'seal' }]); }
// L2 mouth NE, bigger pearl
{ const ring = taperedRing({ r: 84, wMax: 60, wMin: 18, a0: 5, a1: 285, p: 0.9, peak: 0.55 });
  mk('L2 NE pearl', [{ d: D(ring), fill: 'O' }, { d: D(circle(...pt(128,128,84,-38), 24)), fill: 'O', id: 'seal' }]); }
// L3 crescent-like, orb inside
{ const ring = taperedRing({ r: 80, wMax: 74, wMin: 12, a0: 30, a1: 330, p: 1.1, peak: 0.5 });
  mk('L3 crescent orb', [{ d: D(ring), fill: 'O' }, { d: D(circle(142,128,34)), fill: 'O', id: 'seal' }]); }
// L4 uniform ring + pearl
{ mk('L4 uniform', [{ d: cRingD(128,128,84,42,0,56), fill: 'O' }, { d: D(circle(...pt(128,128,84,0), 26)), fill: 'O', id: 'seal' }]); }
// L5 closed taper with pearl touching
{ const ring = taperedRing({ r: 86, wMax: 50, wMin: 16, a0: -10, a1: 258, p: 0.8, peak: 0.5 });
  mk('L5 near closed', [{ d: D(ring), fill: 'O' }, { d: D(circle(...pt(128,128,86,-46), 22)), fill: 'O', id: 'seal' }]); }
// L6 asymmetric hook (upper arm long), orb at centre
{ const ring = taperedRing({ r: 82, wMax: 64, wMin: 16, a0: 20, a1: 345, p: 0.9, peak: 0.42 });
  mk('L6 hook orb', [{ d: D(ring), fill: 'O' }, { d: D(circle(128,128,26)), fill: 'O', id: 'seal' }]); }
// L7 thick taper, pearl is bigger than ring tip and rides the ring line at the top
{ const ring = taperedRing({ r: 84, wMax: 62, wMin: 22, a0: -50, a1: 225, p: 0.8, peak: 0.45 });
  mk('L7 top pearl', [{ d: D(ring), fill: 'O' }, { d: D(circle(...pt(128,128,84,-92), 27)), fill: 'O', id: 'seal' }]); }
// L8 two tapered arcs facing each other (claw pair) around orb
{ const a = taperedRing({ r: 84, wMax: 46, wMin: 14, a0: 100, a1: 250, p: 1, peak: 0.5 });
  const b = taperedRing({ r: 84, wMax: 46, wMin: 14, a0: -80, a1: 70, p: 1, peak: 0.5 });
  mk('L8 twin arcs', [{ d: D(a), fill: 'O' }, { d: D(b), fill: 'O' }, { d: D(circle(128,128,28)), fill: 'O', id: 'seal' }]); }
let cards = V.map((v) => `<div class=c><div class=t>${v.name}</div><div class=r><div class=d>${layersToSvg(v.layers,{size:170})}</div><div class=l>${layersToSvg(v.layers,{size:170,mono:true})}</div></div><div class=r><div class=d>${layersToSvg(v.layers,{size:16})}${layersToSvg(v.layers,{size:32})}</div><div class=l>${layersToSvg(v.layers,{size:16,mono:true})}${layersToSvg(v.layers,{size:32})}</div></div></div>`).join('');
fs.writeFileSync('lab.html', `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#1a1b1e;font:13px -apple-system,sans-serif;color:#ddd;padding:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;width:1000px}.c{background:#25262a;border-radius:10px;padding:8px}.t{margin-bottom:6px;font-weight:600}.r{display:flex;gap:6px;margin-bottom:6px}.d,.l{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:6px;border-radius:8px}.d{background:radial-gradient(circle at 30% 20%,#2a2f4a,#0B0C0E)}.l{background:#f4f4f6;color:#0B0C0E}</style>${cards}`);
