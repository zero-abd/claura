// Outline "Claura" from Inter SemiBold (SIL OFL) into SVG path data. Writes wordmark.json.
import opentype from 'opentype.js';
import fs from 'node:fs';
const font = opentype.loadSync('node_modules/@fontsource/inter/files/inter-latin-600-normal.woff');
const size = 100, tracking = -0.025; // em
const p = font.getPath('Claura', 0, 0, size, { kerning: true, letterSpacing: tracking });
const bb = p.getBoundingBox();
// normalise: baseline y=0, left edge x=0 (glyph ink), report metrics
const capH = font.tables.os2.sCapHeight * size / font.unitsPerEm;
const xH = font.tables.os2.sxHeight * size / font.unitsPerEm;
p.commands.forEach((c) => { for (const k of ['x', 'x1', 'x2']) if (k in c) c[k] -= bb.x1; });
const d = p.toPathData(2);
const out = { d, width: +(bb.x2 - bb.x1).toFixed(2), top: +bb.y1.toFixed(2), bottom: +bb.y2.toFixed(2), capH: +capH.toFixed(2), xH: +xH.toFixed(2), font: 'Inter SemiBold (OFL)', size, tracking };
fs.writeFileSync('wordmark.json', JSON.stringify(out, null, 1));
console.log(out.width, out.top, out.bottom, out.capH, d.length);
