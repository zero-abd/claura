// Hermetic test for the gateway: node smoke.mjs   (npm test)
//
// Boots the real gateway against FIXTURE feature packages in a temp folder (no ssh, no voice, no secrets, no network) and
// checks the contract, the failure isolation, the static allowlist, the browser guards, the log scrubbing and the shutdown.
// Real packages are covered by demo/start.sh and the browser check in the README.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRET = 'sk_test_9f8e7d6c5b4a3210zzTOPSECRET';
const CONSOLE = 'http://localhost:4317';
let pass = 0;
let failed = 0;
const check = (name, ok, info) => {
  if (ok) pass++; else failed++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${!ok && info !== undefined ? `\n         ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

// ------------------------------------------------------------------ fixtures
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claura-gw-smoke-'));
const alpha = path.join(tmp, 'alpha');
const ints = path.join(tmp, 'integrations');
const stopFlag = path.join(tmp, 'alpha-stopped.flag');

write(path.join(alpha, 'server.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export function mount(app, ctx) {
  ctx.log.info('alpha sees the token ' + ctx.env.FAKE_SECRET_TOKEN);
  app.get('/api/alpha/ping', (req, res) => res.json({ ok: true, hasToken: !!ctx.env.FAKE_SECRET_TOKEN, opts: ctx.alpha }));
  app.post('/api/alpha/act', (req, res) => res.json({ ok: true, acted: true }));
  app.get('/api/alpha/ctx', async (req, res) => res.json({ incident: await ctx.getIncidentContext(), brief: await ctx.getBrief() }));
  app.get('/api/alpha/ui.js', (req, res) => res.type('text/javascript').send(fs.readFileSync(path.join(HERE, 'ui.js'))));
  return { name: 'alpha', base: '/api/alpha', ready: Promise.resolve(), stop() { fs.writeFileSync(${JSON.stringify(stopFlag)}, 'stopped'); } };
}
`);
write(path.join(alpha, 'ui.js'), `const SELF = new URL(import.meta.url);\nexport const base = SELF.pathname.replace(/\\/ui\\.js$/, '');\nexport default { base };\n`);
write(path.join(alpha, 'package.json'), JSON.stringify({ name: 'alpha', claura: { title: 'Alpha Feature', track: 'Test Track' } }));

const good = path.join(ints, 'good');
write(path.join(good, 'server.mjs'), `export function mount(app) { app.get('/api/good/hello', (q, r) => r.json({ hi: 1 })); return { base: '/api/good' }; }\nexport const TITLE = 'Good Integration';\nexport const TRACK = 'Test Integration';\n`);
write(path.join(good, 'ui.js'), `import { n } from './helpers.js';\nexport const good = 'good ui ' + n;\nwindow.claura = window.claura || {};\n`);
write(path.join(good, 'helpers.js'), `export const n = 7;\n`);
write(path.join(good, 'public', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
write(path.join(good, 'lib', 'private.js'), `export const private_ = 1;\n`);
write(path.join(good, '.env'), `TOKEN=${SECRET}\n`);
write(path.join(good, 'secret.key'), `-----BEGIN PRIVATE KEY-----\n`);
write(path.join(good, 'public', 'id_ed25519'), 'nope');
write(path.join(good, 'package.json'), JSON.stringify({ name: 'good' }));
write(path.join(good, 'node_modules', 'vendorlib', 'dist.css'), 'body{}');
write(path.join(good, 'node_modules', 'vendorlib', 'package.json'), '{}');

const bad1 = path.join(ints, 'throws-on-import');
write(path.join(bad1, 'server.mjs'), `throw new Error('boom at import, token ${SECRET}');\n`);
write(path.join(bad1, 'ui.js'), 'export default 1;\n');
const bad2 = path.join(ints, 'throws-on-mount');
write(path.join(bad2, 'server.mjs'), `export function mount(app) { app.get('/api/throws-on-mount/leak', (q, r) => r.json({ leaked: true })); throw new Error('mount failed'); }\n`);
write(path.join(bad2, 'ui.js'), 'export default 1;\n');
const bad3 = path.join(ints, 'no-ui');
write(path.join(bad3, 'server.mjs'), `export function mount() { return {}; }\n`);
const bad4 = path.join(ints, 'slow');
write(path.join(bad4, 'server.mjs'), `export function mount() { return { ready: new Promise(() => {}) }; }\n`);
write(path.join(bad4, 'ui.js'), 'export default 1;\n');
const bad5 = path.join(ints, 'no-mount');
write(path.join(bad5, 'server.mjs'), `export const x = 1;\n`);
write(path.join(bad5, 'ui.js'), 'export default 1;\n');
const mocky = path.join(ints, 'mocky');
write(path.join(mocky, 'server.mjs'), `export function mount() { return { base: '/api/mocky', status: () => ({ status: 'mock', reason: 'no wallet funds' }) }; }\n`);
write(path.join(mocky, 'ui.js'), 'export default 1;\n');
write(path.join(ints, 'notes', 'README.md'), 'not a feature');
write(path.join(tmp, 'test.env'), `FAKE_SECRET_TOKEN=${SECRET}\nPLAIN_NAME=hello\n`);

// ------------------------------------------------------------------ helpers
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

function gatewayEnv(port, extra = {}) {
  return {
    ...process.env,
    CLAURA_GATEWAY_PORT: String(port),
    CLAURA_GATEWAY_PACKAGES: alpha,
    CLAURA_GATEWAY_ROOTS: ints,
    CLAURA_ENV: path.join(tmp, 'test.env'),
    CLAURA_GATEWAY_MOUNT_TIMEOUT_MS: '1500',
    ...extra,
  };
}
function startGateway(env) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: HERE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const g = { child, out: '', exit: null };
  child.stdout.on('data', (d) => { g.out += d; });
  child.stderr.on('data', (d) => { g.out += d; });
  g.done = new Promise((resolve) => child.once('exit', (code, sig) => { g.exit = { code, sig }; resolve(g.exit); }));
  return g;
}
async function waitReady(g, port, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end && g.exit === null) {
    try {
      const j = JSON.parse((await request(port, '/api/health')).body);
      if (j.ready) return j;
    } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error(`gateway not ready: ${g.out.slice(-600)}`);
}
/** http.request (not fetch): lets a test set Host, Origin and Sec-Fetch-* freely. */
function request(port, p, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}
function upgrade(port, p, headers) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    const done = (v) => { s.destroy(); resolve(v); };
    s.on('data', (d) => { buf += d; if (buf.includes('\r\n')) done(buf.split('\r\n')[0]); });
    s.on('close', () => done(buf.split('\r\n')[0] || 'closed'));
    s.on('error', () => done('error'));
    s.setTimeout(3000, () => done('timeout'));
    const h = { Host: `127.0.0.1:${port}`, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers };
    s.write(`GET ${p} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
  });
}
const json = (r) => { try { return JSON.parse(r.body); } catch { return null; } };

// ------------------------------------------------------------------ run
const port = await freePort();
const g = startGateway(gatewayEnv(port));
try {
  console.log(`gateway on 127.0.0.1:${port} with fixtures in ${tmp}`);
  const health = await waitReady(g, port);
  const by = Object.fromEntries(health.features.map((f) => [f.name, f]));

  console.log('\ncontract: /api/health');
  check('health is ok and ready', health.ok === true && health.ready === true && health.incident === 'INC-0419');
  check('every feature has name, title, track, status, ui', health.features.every((f) => f.name && f.title && f.track && ['live', 'mock', 'down'].includes(f.status) && f.ui === `/features/${f.name}/ui.js`), health.features);
  check('alpha: live, title/track from package.json "claura", api base', by.alpha?.status === 'live' && by.alpha.title === 'Alpha Feature' && by.alpha.track === 'Test Track' && by.alpha.api === '/api/alpha' && by.alpha.kind === 'feature', by.alpha);
  check('good: live integration, title/track from TITLE/TRACK exports', by.good?.status === 'live' && by.good.kind === 'integration' && by.good.title === 'Good Integration' && by.good.track === 'Test Integration', by.good);
  check('mocky: status() "mock" is reported as mock with its reason', by.mocky?.status === 'mock' && /no wallet funds/.test(by.mocky.detail ?? ''), by.mocky);
  check('throws-on-import is down with a reason', by['throws-on-import']?.status === 'down' && /boom at import/.test(by['throws-on-import'].error), by['throws-on-import']);
  check('throws-on-mount is down', by['throws-on-mount']?.status === 'down' && /mount failed/.test(by['throws-on-mount'].error), by['throws-on-mount']);
  check('no-ui is down ("ui.js not found")', by['no-ui']?.status === 'down' && /ui\.js not found/.test(by['no-ui'].error), by['no-ui']);
  check('no-mount is down (no mount export)', by['no-mount']?.status === 'down' && /mount\(app, ctx\)/.test(by['no-mount'].error), by['no-mount']);
  check('slow (ready never resolves) is down after the timeout', by.slow?.status === 'down' && /timed out/.test(by.slow.error), by.slow);
  check('a folder without package files (notes) is not a feature', !by.notes);
  check('down features expose no api path', ['throws-on-import', 'throws-on-mount', 'no-ui', 'no-mount', 'slow'].every((n) => by[n] && !('api' in by[n])));
  check('the secret value is not in the health JSON', !JSON.stringify(health).includes(SECRET));

  console.log('\nfailure isolation');
  check('a package that threw during mount left no route behind', (await request(port, '/api/throws-on-mount/leak')).status === 404);
  check('healthy packages still answer', json(await request(port, '/api/alpha/ping'))?.ok === true && json(await request(port, '/api/good/hello'))?.hi === 1);

  console.log('\nctx handed to features');
  const ping = json(await request(port, '/api/alpha/ping'));
  check('ctx.env carries the .env values (the feature can use them)', ping?.hasToken === true);
  check('ctx.<name> options are provided (console origins)', Array.isArray(ping?.opts?.origins) && ping.opts.origins.includes(CONSOLE), ping?.opts);
  const c = json(await request(port, '/api/alpha/ctx'));
  check('ctx.getIncidentContext() returns INC-0419', JSON.stringify(c?.incident ?? {}).includes('INC-0419'), Object.keys(c?.incident ?? {}));
  check('ctx.getBrief() returns the brief fields', c?.brief && ['happened', 'contained', 'impact', 'need', 'know', 'dont'].every((k) => k in c.brief), Object.keys(c?.brief ?? {}));

  console.log('\nclient loader');
  const client = await request(port, '/client/claura-features.js', { headers: { Origin: CONSOLE } });
  check('GET /client/claura-features.js is JavaScript with a default export', client.status === 200 && /javascript/.test(client.headers['content-type']) && /export default async function load/.test(client.body), client.status);
  check('loader is served with CORS for the console', client.headers['access-control-allow-origin'] === CONSOLE);

  console.log('\nstatic files under /features');
  const get = (p, o) => request(port, p, o);
  const shim = await get('/features/alpha/ui.js', { headers: { Origin: CONSOLE } });
  check('alpha ui.js (self-locating, serves itself natively) is a re-export of /api/alpha/ui.js', shim.status === 200 && /export \* from "\/api\/alpha\/ui\.js"/.test(shim.body) && /export \{ default \}/.test(shim.body), shim.body);
  const goodUi = await get('/features/good/ui.js');
  check('good ui.js (has a relative import, no native route) is served as the real file', goodUi.status === 200 && /good ui/.test(goodUi.body) && /javascript/.test(goodUi.headers['content-type']), goodUi.body.slice(0, 80));
  check('relative import helpers.js is served', (await get('/features/good/helpers.js')).status === 200);
  check('public/logo.svg is served as image/svg+xml', (await get('/features/good/public/logo.svg')).headers['content-type'] === 'image/svg+xml');
  check('node_modules vendor css is served', (await get('/features/good/node_modules/vendorlib/dist.css')).status === 200);
  const refused = [
    '/features/good/server.mjs', '/features/good/lib/private.js', '/features/good/.env', '/features/good/secret.key', '/features/good/public/id_ed25519',
    '/features/good/package.json', '/features/good/node_modules/vendorlib/package.json', '/features/good/', '/features/good',
    '/features/good/%2e%2e/alpha/server.mjs', '/features/good/..%2falpha%2fserver.mjs', '/features/good/public/../server.mjs', '/features/good/%2e%2e%2f%2e%2e%2ftest.env',
    '/features/good/public/%00.svg', '/features/good/public/..%5cserver.mjs', '/features/alpha/server.mjs', '/features/nope/ui.js',
    '/features/throws-on-mount/ui.js', '/features/no-ui/ui.js', '/features/slow/ui.js',
  ];
  for (const p of refused) {
    const r = await request(port, p, { headers: {} }).catch(() => ({ status: 'error' }));
    check(`refused: ${p}`, r.status === 404 || r.status === 400, r.status);
  }
  const rawDots = await new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write(`GET /features/good/public/../../alpha/server.mjs HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)); let b = ''; s.on('data', (d) => { b += d; }); s.on('close', () => resolve(b.split('\r\n')[0])); });
  check('refused: raw "../" path on the wire', /404|400/.test(rawDots), rawDots);
  check('no response ever contains the secret', !(await Promise.all(refused.map((p) => request(port, p).then((r) => r.body).catch(() => '')))).join('').includes(SECRET));

  console.log('\nbrowser guards');
  const pre = await get('/api/alpha/act', { method: 'OPTIONS', headers: { Origin: CONSOLE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  check('preflight from the console: 204 with methods, headers and credentials', pre.status === 204 && pre.headers['access-control-allow-origin'] === CONSOLE && /POST/.test(pre.headers['access-control-allow-methods']) && /content-type/.test(pre.headers['access-control-allow-headers']) && pre.headers['access-control-allow-credentials'] === 'true', pre.headers);
  const pre2 = await get('/api/alpha/act', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:4317', 'Access-Control-Request-Method': 'POST' } });
  check('preflight from http://127.0.0.1:4317 is allowed too', pre2.status === 204 && pre2.headers['access-control-allow-origin'] === 'http://127.0.0.1:4317');
  for (const o of ['http://evil.example', 'http://localhost:4318', 'https://localhost:4317', 'null', 'http://localhost']) {
    const r = await get('/api/alpha/ping', { headers: { Origin: o } });
    check(`origin ${o}: refused, no CORS headers`, r.status === 403 && !r.headers['access-control-allow-origin'], { status: r.status, h: r.headers['access-control-allow-origin'] });
  }
  const post = await get('/api/alpha/act', { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'text/plain' }, body: '{}' });
  check('cross-origin POST (text/plain, the CSRF shape) is refused before the feature runs', post.status === 403 && !/acted/.test(post.body), post.status);
  const ok = await get('/api/alpha/act', { method: 'POST', headers: { Origin: CONSOLE, 'Content-Type': 'application/json' }, body: '{}' });
  check('POST from the console is served', ok.status === 200 && json(ok)?.acted === true);
  const reb = await get('/api/alpha/ping', { headers: { Host: 'evil.example:8787' } });
  check('DNS rebinding: Host evil.example gets 421', reb.status === 421, reb.status);
  for (const h of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) check(`Host ${h} is served`, (await get('/api/health', { headers: { Host: h } })).status === 200);
  const cross = await get('/api/alpha/ping', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors' } });
  check('no Origin but Sec-Fetch-Site: cross-site (img/script tag from another site) is refused', cross.status === 403, cross.status);
  check('a top-level navigation (typing the URL) is served', (await get('/', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } })).status === 200);
  check('same-origin and same-site fetches are served', (await get('/api/health', { headers: { 'Sec-Fetch-Site': 'same-site', Origin: CONSOLE } })).status === 200);
  check('WebSocket upgrade from a foreign Origin is refused', /403/.test(await upgrade(port, '/api/alpha/ws', { Origin: 'http://evil.example' })));
  check('WebSocket upgrade with a bad Host is refused', /403/.test(await upgrade(port, '/api/alpha/ws', { Host: 'evil.example' })));
  const page = await get('/');
  check('GET / is a status page that lists the features (escaped)', page.status === 200 && /Alpha Feature/.test(page.body) && /frame-ancestors 'none'/.test(page.headers['content-security-policy']));
  const nf = await get('/nothing/here');
  check('unknown path: JSON 404', nf.status === 404 && json(nf)?.ok === false);
  check('security headers on every response', nf.headers['x-content-type-options'] === 'nosniff' && !nf.headers['x-powered-by']);

  console.log('\nlogs');
  check('the secret value never reaches the log, [redacted] does', !g.out.includes(SECRET) && g.out.includes('[redacted]'), g.out.split('\n').filter((l) => /alpha sees/.test(l)));
  check('every failure is logged as an error line', /feature throws-on-import is down/.test(g.out) && /feature slow is down/.test(g.out));

  console.log('\nstartup refusals');
  const p2 = await freePort();
  const busy = startGateway(gatewayEnv(port));
  const busyExit = await Promise.race([busy.done, sleep(15_000).then(() => null)]);
  check('a second gateway on the same port exits non-zero and says why', busyExit?.code === 1 && /port in use|EADDRINUSE/.test(busy.out), busy.out.slice(-300));
  if (!busyExit) busy.child.kill('SIGKILL');
  const nonLoop = startGateway(gatewayEnv(p2, { CLAURA_GATEWAY_HOST: '0.0.0.0' }));
  const nlExit = await Promise.race([nonLoop.done, sleep(8000).then(() => null)]);
  check('binding anything but loopback is refused', nlExit?.code === 1 && /loopback/.test(nonLoop.out), nonLoop.out.slice(-200));
  if (!nlExit) nonLoop.child.kill('SIGKILL');
  const badOrigin = startGateway(gatewayEnv(await freePort(), { CLAURA_GATEWAY_CONSOLE_ORIGINS: 'https://evil.example' }));
  const boExit = await Promise.race([badOrigin.done, sleep(8000).then(() => null)]);
  check('CLAURA_GATEWAY_CONSOLE_ORIGINS only accepts loopback http origins', boExit?.code === 1 && /CONSOLE_ORIGINS/.test(badOrigin.out), badOrigin.out.slice(-200));
  if (!boExit) badOrigin.child.kill('SIGKILL');

  console.log('\nmoved console (CLAURA_GATEWAY_CONSOLE_ORIGINS)');
  const p3 = await freePort();
  const moved = startGateway(gatewayEnv(p3, { CLAURA_GATEWAY_CONSOLE_ORIGINS: 'http://localhost:4400,http://127.0.0.1:4400' }));
  try {
    await waitReady(moved, p3);
    const a = await request(p3, '/api/alpha/ping', { headers: { Origin: 'http://localhost:4400' } });
    const b = await request(p3, '/api/alpha/ping', { headers: { Origin: CONSOLE } });
    check('the moved console origin is allowed', a.status === 200 && a.headers['access-control-allow-origin'] === 'http://localhost:4400', a.status);
    check('the default :4317 origin is no longer allowed on that gateway', b.status === 403 && !b.headers['access-control-allow-origin'], b.status);
  } finally {
    moved.child.kill('SIGTERM');
    await Promise.race([moved.done, sleep(10_000)]);
    if (moved.exit === null) moved.child.kill('SIGKILL');
  }

  console.log('\nshutdown');
  fs.rmSync(stopFlag, { force: true }); // the extra gateways above also wrote it; this check is about the main one
  const t0 = Date.now();
  g.child.kill('SIGTERM');
  const ex = await Promise.race([g.done, sleep(15_000).then(() => null)]);
  check('SIGTERM: exits 0 quickly', ex?.code === 0 && Date.now() - t0 < 10_000, ex);
  check('SIGTERM: every feature handle.stop() ran', fs.existsSync(stopFlag));
  check('nothing listens on the port afterwards', await new Promise((resolve) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(false); }); s.once('error', () => resolve(true)); }));
} catch (err) {
  failed++;
  console.log(` FAIL unexpected: ${err?.stack || err}`);
} finally {
  if (g.exit === null) g.child.kill('SIGKILL');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${failed ? 'FAILED' : 'PASSED'}: ${pass} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
