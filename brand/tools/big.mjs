import fs from 'node:fs';
import { concepts } from './concepts.mjs';
import { layersToSvg } from './svg.mjs';
const only = process.argv[2].split(',');
const cards = concepts.filter(c=>only.includes(c.slug)).map(c=>{const b=c.build();return `<div class=c><div class=t>${c.name}</div><div class=r><div class=d>${layersToSvg(b.color,{size:300})}</div><div class=l>${layersToSvg(b.mono,{mono:true,size:300})}</div></div></div>`}).join('');
fs.writeFileSync('big.html',`<!doctype html><meta charset=utf-8><style>body{margin:0;background:#1a1b1e;font:13px -apple-system,sans-serif;color:#ddd;padding:12px;display:flex;flex-direction:column;gap:12px;width:680px}.c{background:#25262a;border-radius:10px;padding:8px}.t{margin-bottom:6px;font-weight:600}.r{display:flex;gap:8px}.d,.l{flex:1;display:flex;align-items:center;justify-content:center;padding:10px;border-radius:8px}.d{background:radial-gradient(circle at 30% 20%,#2a2f4a,#0B0C0E)}.l{background:#f4f4f6;color:#0B0C0E}</style>${cards}`);
