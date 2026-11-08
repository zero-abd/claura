// Read-only static files for the feature UIs, under /features/<name>/.
//
// What can be served (everything else is a 404, never a listing, never server code):
//   ui.js                         the entry module
//   its relative imports          found by reading ui.js (and what it imports), so a UI can be split into files
//   public/ assets/ static/ ui/ dist/   asset folders, if the package has them
//   node_modules/**               read-only vendor assets (xterm.css, fonts...), web file types only
// Refused outright: dotfiles, .env, keys, certificates, tokens, server.mjs/dev.mjs/test scripts, package manifests,
// anything that resolves (after symlinks) outside the package folder, anything that is not a known web file type.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};
const ASSET_DIRS = new Set(['public', 'assets', 'static', 'ui', 'dist']);
const NEVER_NAME = /(^|\/)(server\.mjs|dev\.mjs|smoke\.mjs|shots\.mjs|package(-lock)?\.json|npm-shrinkwrap\.json|\.[^/]*)$/i;
const SECRET_NAME = /(\.env(\.|$)|\.pem$|\.key$|\.pub$|\.crt$|\.cer$|\.p12$|\.pfx$|\.jks$|\.keystore$|\.token|id_(rsa|dsa|ecdsa|ed25519)|secret|credential|passw)/i;
const MAX_GRAPH_FILES = 300;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Relative specifiers a browser module can pull in. Regexes (not a parser) are enough for an allowlist: a false positive can
// only allow a file that is a real web file inside the package and passes every other rule.
const SPEC_RES = [
  /\bfrom\s*(['"])(\.{1,2}\/[^'"\n]+)\1/g, // import x from './a.js'   export * from './a.js'
  /\bimport\s*(['"])(\.{1,2}\/[^'"\n]+)\1/g, // import './a.js'
  /\bimport\s*\(\s*(?:\/\*[^*]*\*\/\s*)?(['"])(\.{1,2}\/[^'"\n]+)\1\s*\)/g, // import('./a.js')
  /\bnew\s+URL\(\s*(['"])(\.{1,2}\/[^'"\n]+)\1\s*,\s*import\.meta\.url/g, // new URL('./a.css', import.meta.url)
];

const realOrNull = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const inside = (root, p) => p === root || p.startsWith(root + path.sep);

function webFile(real) {
  try {
    const st = fs.statSync(real);
    return st.isFile() && st.size <= MAX_FILE_BYTES;
  } catch {
    return false;
  }
}

/** The set of real file paths reachable from ui.js through relative imports (ui.js itself included). */
export function importGraph(dir, entry = 'ui.js') {
  const root = realOrNull(dir);
  const start = root && realOrNull(path.join(root, entry));
  const files = new Set();
  if (!root || !start) return { files, truncated: false };
  const queue = [start];
  let truncated = false;
  while (queue.length) {
    const file = queue.shift();
    if (files.has(file)) continue;
    if (files.size >= MAX_GRAPH_FILES) { truncated = true; break; }
    files.add(file);
    if (!/\.(m?js)$/i.test(file) || !webFile(file)) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const re of SPEC_RES) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(text)); ) {
        const spec = m[2].split(/[?#]/)[0];
        const target = realOrNull(path.resolve(path.dirname(file), spec));
        if (!target || !inside(root, target) || files.has(target)) continue;
        const rel = path.relative(root, target).split(path.sep).join('/');
        if (NEVER_NAME.test(rel) || SECRET_NAME.test(rel) || !TYPES[path.extname(target).toLowerCase()] || !webFile(target)) continue;
        queue.push(target);
      }
    }
  }
  return { files, truncated };
}

/** Resolve a request path inside a package to a real file we are willing to serve, or null. */
export function resolveStatic(dir, requested, graphFiles) {
  const rel = String(requested ?? '');
  if (!rel || rel.length > 300 || /[\0\\]/.test(rel) || rel.startsWith('/') || rel.endsWith('/')) return null;
  const segs = rel.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) return null;
  if (NEVER_NAME.test(rel) || SECRET_NAME.test(rel)) return null;
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!type) return null;
  const root = realOrNull(dir);
  const real = root && realOrNull(path.join(root, rel));
  if (!root || !real || !inside(root, real) || !webFile(real)) return null;
  const relReal = path.relative(root, real).split(path.sep).join('/');
  if (NEVER_NAME.test(relReal) || SECRET_NAME.test(relReal)) return null;
  const top = relReal.split('/')[0];
  const inGraph = graphFiles.has(real);
  const inAssets = ASSET_DIRS.has(top) && relReal.includes('/');
  const inVendor = top === 'node_modules' && !/\.json$/i.test(relReal) && !relReal.split('/').includes('.bin');
  if (!(inGraph || inAssets || inVendor)) return null;
  return { file: real, root, rel: relReal, type };
}

/** Express router mounted at /features. `registry.get(name)` returns the feature record (see features.mjs). */
export function featureRouter({ registry, log }) {
  const router = express.Router();
  const graphs = new Map(); // name -> { at, files }
  const graphOf = (rec) => {
    const hit = graphs.get(rec.name);
    if (hit && Date.now() - hit.at < 2000) return hit.files;
    const { files } = importGraph(rec.dir);
    graphs.set(rec.name, { at: Date.now(), files });
    return files;
  };
  // sendFile with a root: the dotfile and ".." checks then apply to the path inside the package only
  const send = (res, hit) => {
    res.set({ 'Content-Type': hit.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.sendFile(hit.rel, { root: hit.root, dotfiles: 'deny', cacheControl: false }, (err) => {
      if (err && !res.headersSent) res.status(err.code === 'ENOENT' ? 404 : 500).json({ ok: false, error: 'not found' });
    });
  };
  const live = (req, res) => {
    const rec = registry.get(String(req.params.name));
    if (!rec) { res.status(404).json({ ok: false, error: 'unknown feature' }); return null; }
    if (rec.status === 'down' || !registry.ready) {
      res.status(rec.status === 'down' ? 404 : 503).json({ ok: false, error: rec.status === 'down' ? 'feature is down' : 'gateway is starting' });
      return null;
    }
    return rec;
  };

  // The entry module. Features that locate their API from their own URL (ssh, voice) are loaded from their native path
  // through a one-line re-export, so import.meta.url (and so the API base and the cookie path) stays what the package expects.
  router.get('/:name/ui.js', (req, res) => {
    const rec = live(req, res);
    if (!rec) return;
    if (rec.useShim) {
      const target = JSON.stringify(`${rec.base}/ui.js`);
      const body = `// Claura gateway: "${rec.name}" finds its API from its own URL, so it is loaded from its native path.\nexport * from ${target};\n${rec.uiHasDefault ? `export { default } from ${target};\n` : ''}`;
      res.set({ 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }).send(body);
      return;
    }
    const hit = resolveStatic(rec.dir, 'ui.js', graphOf(rec));
    if (!hit) return res.status(404).json({ ok: false, error: 'not found' });
    send(res, hit);
  });

  router.get('/:name/*path', (req, res) => {
    const rec = live(req, res);
    if (!rec) return;
    const p = req.params.path;
    const rel = Array.isArray(p) ? p.join('/') : String(p ?? '');
    const hit = resolveStatic(rec.dir, rel, graphOf(rec));
    if (!hit) {
      log.debug(`static: refused /features/${rec.name}/${rel.slice(0, 120)}`);
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    send(res, hit);
  });
  return router;
}
