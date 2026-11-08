// Builds the film from src/: reads the placed voice-over's word times, then writes index.html (scene hosts on the
// voice clock, audio) and compositions/<id>.html from src/<id>.html, evaluating {{ expr }} with
//   w(i)  word i's start, scene-local      we(i)  word i's end, scene-local
//   W(i)  word i's start, film time        D      the scene's duration
// Usage: node tools/build.mjs [vo.json]
import fs from 'node:fs';

const voFile = process.argv[2] ?? (fs.existsSync('assets/vo/vo.json') ? 'assets/vo/vo.json' : 'assets/vo/vo-placeholder.json');
const vo = JSON.parse(fs.readFileSync(voFile, 'utf8'));

// words from characters, skipping [tags]; same tokenisation as the script listing
const words = [];
let cur = '', s = 0, e = 0, tag = false;
const push = () => { if (cur) words.push({ text: cur, s, e }); cur = ''; };
for (const c of vo.chars) {
  if (c.c === '[') tag = true;
  if (tag) { if (c.c === ']') tag = false; continue; }
  if (/\s/.test(c.c)) { push(); continue; }
  if (!cur) s = c.s;
  cur += c.c; e = c.e;
}
push();
const W = (i) => +words[i].s.toFixed(3);
const WE = (i) => +words[i].e.toFixed(3);

// scene id, first word; a scene starts LEAD before its first word, the first at 0
const SCENES = [
  ['fleet', 0], ['breach', 16], ['oldway', 33], ['reveal', 47], ['sentry', 54], ['triage', 73], ['warden', 88],
  ['evidence', 103], ['approve', 121], ['sealed', 141], ['scribe', 151], ['nemotron', 164], ['spacetime', 181], ['endcard', 202],
];
const LEAD = 0.25;
const TOTAL = +(WE(words.length - 1) + 3.4).toFixed(2);
const spans = SCENES.map(([id, first], k) => {
  const from = k === 0 ? 0 : +(W(first) - LEAD).toFixed(3);
  const to = k === SCENES.length - 1 ? TOTAL : +(W(SCENES[k + 1][1]) - LEAD).toFixed(3);
  return { id, first, from, to, dur: +(to - from).toFixed(3) };
});

const PLAN = fs.existsSync('src/plan.svg') ? fs.readFileSync('src/plan.svg', 'utf8') : '';
const COMMON = fs.readFileSync('src/common.css', 'utf8');
const render = (src, span) => src.replace('/*COMMON*/', COMMON).replace('<!--PLAN-->', PLAN).replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
  const w = (i) => +(W(i) - span.from).toFixed(3);
  const we = (i) => +(WE(i) - span.from).toFixed(3);
  const D = span.dur;
  // eslint-disable-next-line no-new-func
  const v = new Function('w', 'we', 'W', 'D', 'TOTAL', 'P', `return (${expr});`)(w, we, W, D, TOTAL, (span.id ?? 'main') + '-');
  return typeof v === 'number' ? String(+v.toFixed(3)) : String(v);
});

for (const span of spans) {
  const f = `src/${span.id}.html`;
  if (!fs.existsSync(f)) {
    console.warn('stub', f);
    fs.writeFileSync(`compositions/${span.id}.html`, `<template><style>#root { position: absolute; inset: 0; }</style><div id="root" data-composition-id="${span.id}" data-width="1920" data-height="1080" data-no-timeline><div style="position:absolute;left:120px;top:120px;font:700 60px sans-serif">${span.id}</div></div></template>`);
    continue;
  }
  fs.writeFileSync(`compositions/${span.id}.html`, render(fs.readFileSync(f, 'utf8'), span));
}
const shell = fs.readFileSync('src/index.html', 'utf8');
const hosts = spans.map((sp, k) => `      <div id="${sp.id}" data-composition-id="${sp.id}" data-composition-src="compositions/${sp.id}.html" data-start="${sp.from}" data-duration="${sp.dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:${k + 2}"></div>`).join('\n');
fs.writeFileSync('index.html', render(shell, { from: 0, dur: TOTAL }).replace('<!--SCENES-->', hosts).replace(/__TOTAL__/g, String(TOTAL)));
fs.writeFileSync('assets/vo/timing.json', JSON.stringify({ voFile, total: TOTAL, spans, words: words.map((x, i) => [i, x.text, W(i), WE(i)]) }, null, 1));
console.log('total', TOTAL, spans.map((s) => `${s.id}@${s.from}`).join(' '));
