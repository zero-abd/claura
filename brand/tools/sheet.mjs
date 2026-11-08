import fs from 'node:fs';
import { concepts } from './concepts.mjs';
import { layersToSvg } from './svg.mjs';
import { lockupSvg } from './lockup.mjs';
import { notes } from './notes.mjs';

const OUT = '/Users/abd/repos/claura-brand';
const top3 = new Set((process.env.TOP3 || '').split(',').filter(Boolean));
const rec = process.env.REC || '';
const list = concepts;
const zoom = [];
const cards = list.map((c, i) => {
  const b = c.build();
  const n = notes[c.slug] || { read16: '', pass: true };
  const svgC = (s, o = {}) => layersToSvg(b.color, { size: s, ...o });
  const svgM = (s) => layersToSvg(b.mono, { mono: true, size: s });
  const tags = (rec === c.slug ? '<span class="tag rec">Recommended</span>' : top3.has(c.slug) ? '<span class="tag top">Top 3</span>' : '');
  zoom.push({ id: `zc${i}`, svg: layersToSvg(b.color, { size: 16 }), bg: '#0B0C0E' });
  zoom.push({ id: `zm${i}`, svg: layersToSvg(b.mono, { mono: true, size: 16 }), bg: '#FFFFFF' });
  return `<section class="card ${top3.has(c.slug) ? 'is-top' : ''}">
  <header><span class="num">${String(i + 1).padStart(2, '0')}</span><h2>${c.name}</h2>${tags}<span class="dir">${c.direction}</span></header>
  <p class="why">${c.rationale}</p>
  <div class="grid">
    <div class="hero">${svgC(220)}</div>
    <div class="t light">${svgC(84)}</div><div class="t dark">${svgC(84)}</div>
    <div class="t light mono">${svgM(84)}</div><div class="t dark mono">${svgM(84)}</div>
  </div>
  <div class="sizes">
    <div class="s dark">${svgC(16)}${svgC(32)}</div>
    <div class="s light">${svgC(16)}${svgC(32)}</div>
    <div class="s light mono">${svgM(16)}${svgM(32)}</div>
    <div class="s dark mono">${svgM(16)}${svgM(32)}</div>
    <canvas id="zc${i}" width="16" height="16" class="z"></canvas>
    <canvas id="zm${i}" width="16" height="16" class="z"></canvas>
  </div>
  <p class="read ${n.pass ? 'ok' : 'warn'}"><b>${n.pass ? 'Reads at 16 px' : 'Weak at 16 px'}.</b> ${n.read16}</p>
  <div class="locks"><div class="lk light">${lockupSvg(b.color, { height: 52 })}</div><div class="lk dark">${lockupSvg(b.color, { dark: true, height: 52 })}</div></div>
</section>`;
}).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Claura logo concepts</title>
<style>
:root{--ink:#0B0C0E;--orange:#FF5A1F;--green:#2FBF71;--paper:#E9E9EC;--card:#FFFFFF;--muted:#5d6068;--line:#d7d8dd}
*{box-sizing:border-box}
body{margin:0;padding:44px 40px 48px;background:var(--paper);color:var(--ink);font:15px/1.4 -apple-system,"SF Pro Text","Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;width:1800px}
.top{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px}
h1{margin:0;font:600 40px/1.05 -apple-system,"SF Pro Display","Inter",sans-serif;letter-spacing:-0.025em}
.sub{margin:8px 0 0;color:var(--muted);font-size:15px;max-width:1100px}
.chips{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:13px}.chips i{display:inline-block;width:18px;height:18px;border-radius:6px;margin-right:5px;vertical-align:-4px;border:1px solid rgba(0,0,0,.12)}
.board{display:grid;grid-template-columns:repeat(3,560px);gap:20px}
.card{background:var(--card);border-radius:22px;padding:22px 24px 24px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 12px 32px -18px rgba(11,12,14,.25)}
.card.is-top{outline:2px solid var(--orange);outline-offset:-2px}
header{display:flex;align-items:center;gap:10px;height:30px}
.num{font:500 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
h2{margin:0;font:600 23px/1.1 -apple-system,"SF Pro Display","Inter",sans-serif;letter-spacing:-0.02em}
.tag{font-size:12px;font-weight:600;padding:3px 9px;border-radius:99px;align-self:center}
.tag.top{background:#FFE9DF;color:#B83A0C}.tag.rec{background:var(--orange);color:#fff}
.dir{margin-left:auto;color:var(--muted);font-size:13px}
.why{margin:6px 0 16px;color:#33363c;min-height:42px}
.grid{display:grid;grid-template-columns:236px 108px 108px;grid-template-rows:108px 108px;gap:12px 10px}
.hero{grid-row:1/3;border-radius:18px;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 120% at 25% 15%,#2c3158 0%,#14162a 45%,#0B0C0E 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 0 0 1px rgba(255,255,255,.05)}
.t{border-radius:16px;display:flex;align-items:center;justify-content:center}
.light{background:#fff;box-shadow:inset 0 0 0 1px var(--line);color:var(--ink)}
.dark{background:var(--ink);color:#fff}
.sizes{display:flex;gap:8px;margin:14px 0 8px;align-items:center}
.s{width:70px;height:62px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px}
.z{width:80px;height:80px;image-rendering:pixelated;border-radius:10px;box-shadow:inset 0 0 0 1px var(--line);margin-left:2px}
.read{margin:2px 0 14px;min-height:36px;font-size:13px;color:#33363c}.read b{color:#1a7d47}.read.warn b{color:#b3541a}
.locks{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lk{height:84px;border-radius:16px;display:flex;align-items:center;justify-content:center}
svg{display:block}
</style></head><body>
<div class="top"><div><h1>Claura logo concepts</h1><p class="sub">Nine directions survived. Dropped after round one: Sentinel eye (generic icon), Halo Orb (reads as Saturn), Halo Lock (padlock clip-art), Four Hands (lifebuoy), Nest (heavy blob), Ripple Wall (reads as the letters OI), Three Fields (muddy). Each card shows the mark large, at 16 and 32 px, in one colour, on light and dark, with the outlined wordmark. The two magnified squares are real 1x rasters of the 16 px mark.</p></div>
<div class="chips"><span><i style="background:#FF5A1F"></i>Signal orange</span><span><i style="background:#2FBF71"></i>Sealed green</span><span><i style="background:#0B0C0E"></i>Ink</span></div></div>
<div class="board">${cards}</div>
<script>
const Z=${JSON.stringify(zoom)};
Z.forEach(z=>{const c=document.getElementById(z.id),x=c.getContext('2d');x.fillStyle=z.bg;x.fillRect(0,0,16,16);
const im=new Image();im.onload=()=>x.drawImage(im,0,0,16,16);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(z.svg);});
document.documentElement.dataset.h=document.body.scrollHeight;</script></body></html>`;
fs.writeFileSync(`${OUT}/contact-sheet.html`, html);
console.log('sheet written', html.length);
