import fs from 'node:fs';
import * as g from './geo.mjs';
import { concepts, CRADLE } from './concepts.mjs';
import { layersToSvg } from './svg.mjs';
import { WM } from './lockup.mjs';

const OUT = '/Users/abd/repos/claura-brand';
const pick = (slug) => concepts.find((c) => c.slug === slug);
const k = g.cradleC(CRADLE);
const ORB = (() => { const { cx, cy, orb } = CRADLE; return `M${cx - orb} ${cy}a${orb} ${orb} 0 1 0 ${2 * orb} 0a${orb} ${orb} 0 1 0-${2 * orb} 0z`; })();
const bb = g.P(k.d).bounds;
const mark = (size, seal = '#FF5A1F') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.width} ${bb.height}" height="${size}" width="${(size * bb.width / bb.height).toFixed(1)}"><path fill="#FF5A1F" d="${k.d}"/><path fill="${seal}" d="${ORB}" style="transition:none"/></svg>`;
const word = (h, fill = '#fff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -${WM.capH + 1.5} ${WM.width} ${WM.capH + 3}" height="${h}" width="${(h * WM.width / (WM.capH + 3)).toFixed(1)}"><path fill="${fill}" d="${WM.d}"/></svg>`;
const big = (slug, size = 190) => { const b = pick(slug).build(); return layersToSvg(b.color, { size }); };
const small = (slug, size = 56) => { const b = pick(slug).build(); return layersToSvg(b.color, { size }); };

const cards = [
  ['cradle', 'Cradle', 'Recommended', 'A C-shaped aura holds the breach in a concentric socket. Two paths, one circle-built silhouette, clear at 16 px, and the orb is the part that turns green.'],
  ['glass-c', 'Glass C', 'Runner-up', 'The most native to the Liquid Glass UI: a solid pane with faint panes behind it. Safest read as a C, but the least ownable.'],
  ['split-doors', 'Bulkhead Doors', 'Runner-up', 'The most literal to the product: two doors and a bolt. Strong silhouette, but it drifts from the name and the C.'],
].map(([slug, name, tag, why]) => `
<article class="card ${slug === 'cradle' ? 'rec' : ''}">
  <div class="tiles"><div class="big">${big(slug)}</div><div class="side"><div class="lt">${small(slug, 64)}</div><div class="dk">${small(slug, 64)}</div></div></div>
  <h3>${name}<span class="tag ${slug === 'cradle' ? 'r' : ''}">${tag}</span></h3><p>${why}</p>
</article>`).join('');

const header = (state) => {
  const sealed = state === 'sealed';
  return `<div class="hdr ${sealed ? 'sealed' : ''}">
    <div class="brand">${mark(30, sealed ? '#2FBF71' : '#FF5A1F')}${word(19)}</div>
    <nav><a class="on">Incidents</a><a>Agents</a><a>Approvals</a><a>Audit log</a></nav>
    <div class="state">${sealed
      ? '<span class="pill ok"><i></i>Sealed</span><span class="meta">VM 7f3a contained, you approved the seal</span>'
      : '<span class="pill hot"><i></i>Breach</span><span class="meta">VM 7f3a escaping its sandbox</span><button>Approve seal</button>'}
    </div>
  </div>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Claura logo recommendation</title><style>
:root{--ink:#0B0C0E;--o:#FF5A1F;--g:#2FBF71;--paper:#E9E9EC;--muted:#5d6068}
*{box-sizing:border-box}
body{margin:0;width:1600px;padding:52px 56px 56px;background:var(--paper);color:var(--ink);font:15px/1.45 -apple-system,"SF Pro Text","Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1{margin:0;font:600 42px/1.05 -apple-system,"SF Pro Display","Inter",sans-serif;letter-spacing:-0.028em}
.lede{margin:10px 0 30px;color:var(--muted);font-size:17px;max-width:880px}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.card{background:#fff;border-radius:26px;padding:22px;box-shadow:0 14px 36px -22px rgba(11,12,14,.35)}
.card.rec{outline:2.5px solid var(--o);outline-offset:-2.5px}
.tiles{display:flex;gap:12px;height:230px}
.big{flex:1;border-radius:20px;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 120% at 25% 15%,#2c3158 0%,#14162a 45%,#0B0C0E 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}
.side{display:flex;flex-direction:column;gap:12px;width:104px}
.side div{flex:1;border-radius:18px;display:flex;align-items:center;justify-content:center}
.lt{background:#fff;box-shadow:inset 0 0 0 1px #d7d8dd}.dk{background:var(--ink)}
h3{margin:18px 0 6px;font:600 24px/1.1 -apple-system,"SF Pro Display","Inter",sans-serif;letter-spacing:-0.02em;display:flex;align-items:center;gap:10px}
.card p{margin:0;color:#33363c;font-size:15px;min-height:66px}
.tag{font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px;background:#eceef2;color:#4a4d55}.tag.r{background:var(--o);color:#fff}
.stage{display:grid;grid-template-columns:420px 1fr;gap:22px;margin-top:22px}
.iconbox{background:#fff;border-radius:26px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 14px 36px -22px rgba(11,12,14,.35)}
.iconbox img{width:340px;height:340px;display:block}
.iconrow{display:flex;align-items:flex-end;gap:16px;margin-top:6px}
.iconrow img{width:64px;height:64px}.iconrow img.s2{width:40px;height:40px}.iconrow img.s3{width:24px;height:24px}
.cap{margin:10px 0 0;color:var(--muted);font-size:13px;text-align:center}
.product{border-radius:26px;padding:26px;position:relative;overflow:hidden;color:#fff;display:flex;flex-direction:column;gap:18px;
 background:radial-gradient(90% 120% at 12% 0%,#3a3f86 0%,rgba(58,63,134,0) 60%),radial-gradient(70% 90% at 100% 100%,rgba(255,90,31,.55) 0%,rgba(255,90,31,0) 62%),linear-gradient(160deg,#1b1e45,#0d0e1c 55%,#0B0C0E)}
.hdr{display:flex;align-items:center;gap:18px;height:72px;padding:0 22px;border-radius:22px;background:rgba(255,255,255,.10);backdrop-filter:blur(26px) saturate(170%);-webkit-backdrop-filter:blur(26px) saturate(170%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 18px 40px -20px rgba(0,0,0,.6)}
.brand{display:flex;align-items:center;gap:12px}
nav{display:flex;gap:6px}nav a{white-space:nowrap;padding:8px 12px;border-radius:12px;color:rgba(255,255,255,.72);font-weight:500;font-size:15px}
nav a.on{background:rgba(255,255,255,.14);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}
.state{margin-left:auto;display:flex;align-items:center;gap:14px}
.meta{white-space:nowrap;color:rgba(255,255,255,.7);font-size:14px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;font-weight:600;font-size:14px;background:rgba(255,90,31,.2);color:#FFB08F;box-shadow:inset 0 0 0 1px rgba(255,140,90,.45)}
.pill i{width:8px;height:8px;border-radius:50%;background:var(--o);box-shadow:0 0 10px var(--o)}
.pill.ok{background:rgba(47,191,113,.18);color:#8FE8B5;box-shadow:inset 0 0 0 1px rgba(47,191,113,.5)}.pill.ok i{background:var(--g);box-shadow:0 0 10px var(--g)}
button{white-space:nowrap;font:600 14px -apple-system,sans-serif;border:0;color:#fff;background:linear-gradient(180deg,#FF7440,#FF5A1F);padding:10px 16px;border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 8px 20px -8px rgba(255,90,31,.8)}
.agents{display:flex;gap:12px}
.agent{flex:1;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}
.agent b{display:block;font-size:15px;font-weight:600}.agent span{font-size:13px;color:rgba(255,255,255,.62)}
.tl{display:flex;align-items:center;gap:0;padding:18px 22px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}
.tl .st{flex:1;position:relative;padding-top:20px;font-size:13px;color:rgba(255,255,255,.7)}.tl .st b{display:block;color:#fff;font-size:14px;font-weight:600}
.tl .st:before{content:"";position:absolute;left:0;top:2px;width:10px;height:10px;border-radius:50%;background:var(--o);box-shadow:0 0 10px rgba(255,90,31,.8)}
.tl .st:after{content:"";position:absolute;left:16px;right:8px;top:6px;height:2px;background:rgba(255,255,255,.18)}
.tl .st:last-child:after{display:none}.tl .st.ok:before{background:var(--g);box-shadow:0 0 10px rgba(47,191,113,.8)}
.label{font-size:13px;color:rgba(255,255,255,.55);margin:2px 0 -6px}
</style></head><body>
<h1>Claura logo: the shortlist</h1>
<p class="lede">Cradle is the pick. It is the only one of the three that is a letter, a metaphor and a state in one gesture, and it survives at 16 px and in a single colour.</p>
<div class="row">${cards}</div>
<div class="stage">
  <div class="iconbox"><img src="app-icon-1024.png" alt="App icon"><div class="iconrow"><img src="app-icon-1024.png"><img class="s2" src="app-icon-1024.png"><img class="s3" src="app-icon-1024.png"></div><p class="cap">Cradle as the macOS app icon, with its smaller sizes</p></div>
  <div class="product">
    <div class="label">Breach in progress: the orb is signal orange</div>${header('breach')}
    <div class="label">Contained: the same mark, only the orb tinted green</div>${header('sealed')}
    <div class="agents"><div class="agent"><b>Sentry</b><span>Detected the escape attempt</span></div><div class="agent"><b>Triage</b><span>Scored it as critical</span></div><div class="agent"><b>Warden</b><span>Sealed the VM network</span></div><div class="agent"><b>Scribe</b><span>Wrote the incident record</span></div></div>
    <div class="tl"><div class="st"><b>Detected</b>14:02:11 by Sentry</div><div class="st"><b>Triaged</b>14:02:13, critical</div><div class="st"><b>Contained</b>14:02:19 by Warden</div><div class="st ok"><b>Approved</b>14:03:02 by you</div></div>
  </div>
</div>
<script>document.documentElement.dataset.h=document.body.scrollHeight;</script>
</body></html>`;
fs.writeFileSync(`${OUT}/tools/recommendation.html`, html.replace(/src="app-icon-1024.png"/g, 'src="../app-icon-1024.png"'));
console.log('ok');
