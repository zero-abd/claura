import fs from 'node:fs';
import { concepts } from './concepts.mjs';
import { notes } from './notes.mjs';
import { layersToSvg } from './svg.mjs';
const OUT = '/Users/abd/repos/claura-brand/concepts';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const index = [];
concepts.forEach((c, i) => {
  const b = c.build(), n = String(i + 1).padStart(2, '0'), nt = notes[c.slug];
  const desc = c.rationale;
  const wrap = (x) => x;
  fs.writeFileSync(`${OUT}/${n}-${c.slug}.svg`, wrap(layersToSvg(b.color, { title: 'Claura concept ' + n + ': ' + c.name, desc })));
  fs.writeFileSync(`${OUT}/${n}-${c.slug}-mono.svg`, wrap(layersToSvg(b.mono, { mono: true, title: 'Claura concept ' + n + ' (mono): ' + c.name, desc })));
  index.push({ n, slug: c.slug, name: c.name, direction: c.direction, rationale: c.rationale, mono: `${n}-${c.slug}-mono.svg`, file: `${n}-${c.slug}.svg`, reads_at_16px: nt.pass, check_16px: nt.read16 });
});
fs.writeFileSync(`${OUT}/concepts.json`, JSON.stringify(index, null, 2));
console.log(index.length, 'concepts');
