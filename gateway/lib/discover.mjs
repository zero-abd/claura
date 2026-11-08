// Find feature packages: a folder with server.mjs (exports mount(app, ctx)) and ui.js (the browser module).
//   packages  explicit folders (ssh/, voice/)
//   roots     folders whose children are feature folders (integrations/*)
// Nothing is imported here; a broken or half-written package must not be able to stop discovery.
import fs from 'node:fs';
import path from 'node:path';
import { isValidFeatureName } from './config.mjs';

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** Names and tracks for the features we know about. A package can override them (package.json "claura", or export const meta). */
export const KNOWN = {
  ssh: { title: 'Secure Shell', track: 'Winstead' },
  voice: { title: 'Ask Claura (Voice)', track: 'ElevenLabs' },
  'solana-anchor': { title: 'Evidence anchoring', track: 'Solana' },
};

const titleCase = (s) => s.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const short = (v, dflt) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : dflt);

function readPackage(dir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

export function discover(cfg, log) {
  const out = [];
  const seen = new Set();

  const add = (dir, kind, explicit) => {
    const name = path.basename(dir).toLowerCase();
    if (!isValidFeatureName(name)) return log.warn(`discover: skipping "${dir}" (the folder name must be lowercase letters, digits and dashes)`);
    if (cfg.only.size && !cfg.only.has(name)) return log.info(`discover: ${name} is not in CLAURA_GATEWAY_FEATURES, skipped`);
    if (cfg.skip.has(name)) return log.info(`discover: ${name} is in CLAURA_GATEWAY_DISABLE, skipped`);
    if (seen.has(name)) return log.warn(`discover: a second package named "${name}" at ${dir} is ignored`);
    const serverFile = path.join(dir, 'server.mjs');
    const uiFile = path.join(dir, 'ui.js');
    const hasServer = isFile(serverFile);
    const hasUi = isFile(uiFile);
    const pkg = readPackage(dir);
    // A folder under integrations/ that holds none of the package files is not a feature (notes, shared helpers).
    if (!explicit && !hasServer && !hasUi && !pkg) return;
    seen.add(name);
    const claura = pkg && typeof pkg.claura === 'object' && pkg.claura ? pkg.claura : {};
    const known = KNOWN[name] ?? {};
    out.push({
      name,
      dir,
      kind: claura.kind === 'integration' || claura.kind === 'feature' ? claura.kind : kind,
      title: short(claura.title, known.title ?? titleCase(name)),
      track: short(claura.track, known.track ?? (kind === 'integration' ? 'Integration' : 'Feature')),
      serverFile,
      uiFile,
      hasServer,
      hasUi,
    });
  };

  for (const dir of cfg.packages) {
    // A package that should exist but does not is still listed (as "down"), not invisible.
    if (!isDir(dir)) log.warn(`discover: package folder ${dir} does not exist`);
    add(dir, 'feature', true);
  }
  for (const root of cfg.roots) {
    if (!isDir(root)) {
      log.info(`discover: ${root} does not exist yet, nothing to load from it`);
      continue;
    }
    const kind = path.basename(root) === 'integrations' ? 'integration' : 'feature';
    const entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) add(path.join(root, e.name), kind, false);
  }
  return out;
}
