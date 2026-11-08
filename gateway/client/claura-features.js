// Claura feature loader. Served by the gateway at /client/claura-features.js (ES module).
//
// The console loads it once at boot and keeps working if it is slow or missing:
//
//   const m = await import(/* @vite-ignore */ `${GATEWAY}/client/claura-features.js`);
//   const result = await m.default({ base: GATEWAY });      // { base, ok, features, loaded, failed }
//
// It asks GET /api/health which features exist, dynamic-imports the ui.js of every feature that is not "down", and
// makes sure window.claura carries what the console looks for:
//   openShell(hostId)                        Secure Shell
//   voice { toggle, playBrief, say, sting }  Voice
//   integrations[name] = { title, track, status, open(container) }, anchor(hash, label)    integrations (Solana ...)
// It never overwrites a key that already exists (and adds no other key), and it never throws: a feature that fails is
// listed in result.failed. Calling it twice is harmless.

const ORIGIN = (() => {
  try { return new URL(import.meta.url).origin; } catch { return ''; }
})();
export const GATEWAY = ORIGIN;
export const VERSION = '0.1.0';

const msg = (e) => String((e && e.message) || e || 'failed').slice(0, 200);
const withTimeout = (p, ms, what) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
const obj = (root, key) => (root[key] && typeof root[key] === 'object' ? root[key] : (root[key] = {}));

/** open(container) for an integration whose module did not provide one: a small honest status card. */
function statusCard(f) {
  return (container) => {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return null;
    const card = document.createElement('div');
    card.setAttribute('data-claura-integration', f.name);
    card.style.cssText = 'padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.06);color:inherit;font:13px/1.45 system-ui,sans-serif';
    const title = document.createElement('strong');
    title.textContent = `${f.title} · ${f.track}`;
    const line = document.createElement('div');
    line.style.opacity = '.7';
    line.textContent = f.status === 'down' ? `Not available: ${f.error || 'down'}` : `Status: ${f.status}`;
    card.append(title, line);
    el.replaceChildren(card);
    return card;
  };
}

/** Make sure the documented window.claura keys exist after a feature module was imported (or failed to). */
function adopt(root, f, mod) {
  const m = mod && typeof mod === 'object' ? mod : {};
  const d = m.default && typeof m.default === 'object' ? m.default : {};
  if (f.name === 'ssh' && typeof root.openShell !== 'function') {
    const fn = m.openShell || d.openShell;
    if (typeof fn === 'function') root.openShell = fn;
  }
  if (f.name === 'voice' && !root.voice) {
    const v = m.voice || (m.default && typeof m.default === 'object' ? m.default : null);
    if (v) root.voice = v;
  }
  if (typeof root.anchor !== 'function' && typeof (m.anchor || d.anchor) === 'function') root.anchor = m.anchor || d.anchor;

  // The integrations registry. An integration package always gets an entry (its own, or one we fill in: a down package gets a
  // status card as open()). A plain feature (Voice) gets one when its module can mount a panel, which is what the console's
  // Integrations page needs to enable its "Open" button. Secure Shell is left out on purpose: the console opens it through
  // its Shells view and window.claura.openShell().
  const open = m.open || d.open || m.mountUI || d.mountUI || m.mount;
  if (f.kind === 'integration' || (f.name !== 'ssh' && typeof open === 'function')) {
    const ints = obj(root, 'integrations');
    const e = ints[f.name];
    if (e && typeof e === 'object') {
      if (e.title === undefined) e.title = f.title;
      if (e.track === undefined) e.track = f.track;
      if (e.status === undefined) e.status = f.status;
      if (typeof e.open !== 'function') e.open = typeof open === 'function' && f.status !== 'down' ? (c) => open(c) : statusCard(f);
    } else {
      ints[f.name] = { title: f.title, track: f.track, status: f.status, open: f.status !== 'down' && typeof open === 'function' ? (c) => open(c) : statusCard(f) };
    }
  }
}

/**
 * localhost and 127.0.0.1 are the same machine but different SITES to a browser. The Secure Shell keeps its request secret in a
 * SameSite=Strict cookie and uses a passkey bound to the page's hostname, so it only works when the gateway is reached under
 * the page's own spelling. The console's default gateway is http://127.0.0.1:8787; when the page is on localhost (or the other
 * way round) the feature modules are loaded from the page's spelling instead. Anything that is not one of the two is left alone.
 */
function pageSpelling(base) {
  try {
    const u = new URL(base);
    const loopback = (h) => h === 'localhost' || h === '127.0.0.1';
    if (loopback(u.hostname) && loopback(location.hostname) && u.hostname !== location.hostname) {
      u.hostname = location.hostname;
      return u.origin;
    }
  } catch { /* keep what we were given */ }
  return base;
}

export default async function load(opts = {}) {
  const requested = String(opts.base || ORIGIN).replace(/\/+$/, '');
  const base = pageSpelling(requested);
  const timeout = Number.isFinite(opts.timeout) && opts.timeout > 0 ? opts.timeout : 5000;
  const result = { base, requestedBase: requested, ok: false, features: [], loaded: [], failed: [] };
  if (!base) { result.error = 'no gateway address'; return result; }
  const root = window.claura && typeof window.claura === 'object' ? window.claura : (window.claura = {});

  let features;
  try {
    const res = await withTimeout(fetch(`${base}/api/health`, { cache: 'no-store' }), timeout, 'health check');
    if (!res.ok) throw new Error(`health returned ${res.status}`);
    features = (await res.json()).features;
    if (!Array.isArray(features)) throw new Error('health has no feature list');
  } catch (e) {
    result.error = msg(e);
    return result;
  }
  result.ok = true;
  result.features = features;

  await Promise.all(
    features.map(async (f) => {
      let mod = null;
      if (f.status === 'down') {
        result.failed.push({ name: f.name, error: f.error || 'down' });
      } else if (!/^\/features\/[a-z0-9-]+\/ui\.js$/.test(String(f.ui))) {
        result.failed.push({ name: f.name, error: 'unexpected ui path' });
      } else {
        try {
          mod = await withTimeout(import(/* @vite-ignore */ `${base}${f.ui}`), timeout, `loading ${f.name}`);
          result.loaded.push(f.name);
        } catch (e) {
          result.failed.push({ name: f.name, error: msg(e) });
        }
      }
      try { adopt(root, f, mod); } catch (e) { result.failed.push({ name: f.name, error: `adopt: ${msg(e)}` }); }
    }),
  );
  return result;
}
