// Bundles src/facility.js (with its pinned three.js) into single copyable files. No other build step exists.
//   dist/facility.js         ES module, three.js inlined      -> import { createFacility } from './facility.js'
//   dist/facility.global.js  classic script, window.ClauraFacility
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const three = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version;
const banner = `/* Claura DFW-2 facility visualization. three.js r${three.split('.')[1]} (v${three}, MIT) bundled. API: createFacility(el, {look, background}) */`;
const common = { entryPoints: [path.join(root, 'src/facility.js')], bundle: true, minify: true, target: 'es2020', legalComments: 'none', banner: { js: banner }, logLevel: 'info' };

await build({ ...common, format: 'esm', outfile: path.join(root, 'dist/facility.js'), sourcemap: true });
await build({ ...common, format: 'iife', globalName: 'ClauraFacility', outfile: path.join(root, 'dist/facility.global.js') });
for (const f of ['facility.js', 'facility.global.js']) console.log(f, (fs.statSync(path.join(root, 'dist', f)).size / 1024).toFixed(0) + ' KB');
