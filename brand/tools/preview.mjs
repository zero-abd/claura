import fs from 'node:fs';
import { concepts } from './concepts.mjs';
import { layersToSvg } from './svg.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : null;
let cards = '';
concepts.forEach((c, i) => {
  if (only && !only.includes(c.slug)) return;
  const b = c.build();
  const col = layersToSvg(b.color, { size: 150 }), mo = layersToSvg(b.mono, { mono: true, size: 150 });
  const s16 = layersToSvg(b.color, { size: 16 }), s32 = layersToSvg(b.color, { size: 32 });
  const m16 = layersToSvg(b.mono, { mono: true, size: 16 });
  cards += `<div class="card"><div class="t">${String(i + 1).padStart(2, '0')} ${c.name}</div>
  <div class="row"><div class="dark">${col}</div><div class="light">${mo}</div></div>
  <div class="row small"><div class="dark">${s16}${s32}</div><div class="light" style="color:#0B0C0E">${m16}${layersToSvg(b.color,{size:16})}${s32}</div></div></div>`;
});
fs.writeFileSync('preview.html', `<!doctype html><meta charset=utf-8><style>
body{margin:0;background:#1a1b1e;font:13px -apple-system,sans-serif;color:#ddd;padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:1000px;box-sizing:content-box}
.card{background:#25262a;border-radius:12px;padding:10px}.t{margin-bottom:6px;font-weight:600}
.row{display:flex;gap:8px}.dark,.light{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px;border-radius:8px}
.dark{background:radial-gradient(circle at 30% 20%,#2a2f4a,#0B0C0E)}.light{background:#f4f4f6;color:#0B0C0E}.small .dark,.small .light{padding:6px}
</style>${cards}`);
