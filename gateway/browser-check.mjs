// Console-origin check: node browser-check.mjs [--ssh] [--say]      (npm run check:browser)
//
// Own headless Chrome (own profile, own debugging port on 127.0.0.1) opens the CONSOLE page and does what the console does at
// boot: import the gateway's loader across origins and call it. Then it checks window.claura, the Voice and Solana modules, and
// (with --ssh) the whole Secure Shell flow across the two origins: cookies, CORS, WebAuthn (a DevTools VIRTUAL authenticator),
// the WebSocket terminal.
//
//   CONSOLE_URL  default http://localhost:4317/?demo=1     (open it as localhost: passkeys and SameSite cookies need a hostname)
//   GATEWAY      default http://localhost:8787
//   --ssh        runs the Secure Shell flow. It enrols a virtual passkey and writes a recording: start the gateway with
//                CLAURA_SSH_DATA=<scratch dir> first, never against the real demo data (a stale virtual passkey would
//                make the real Touch ID step fail).
//   --say        speaks one 15-character phrase through ElevenLabs (a few credits) to prove the whole voice path
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CONSOLE_URL = process.env.CONSOLE_URL || 'http://localhost:4317/?demo=1';
const GATEWAY = (process.env.GATEWAY || 'http://localhost:8787').replace(/\/+$/, '');
const WITH_SSH = process.argv.includes('--ssh');
const WITH_SAY = process.argv.includes('--say');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail === undefined ? '' : `\n         ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); }
  return ok;
};
const step = (s) => console.log(`\n== ${s}`);

async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.opened = new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej); });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`)); else p.res(m.result);
      } else if (m.method) for (const h of this.handlers.get(m.method) ?? []) h(m.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej, method }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  on(method, cb) { (this.handlers.get(method) ?? this.handlers.set(method, []).get(method)).push(cb); }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'claura-gw-chrome-'));
let chrome;
let cdp;
const cleanup = async () => {
  try { cdp?.ws.close(); } catch { /* closed */ }
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    const end = Date.now() + 6000;
    while (chrome.exitCode === null && chrome.signalCode === null && Date.now() < end) await sleep(100);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
  fs.rmSync(profile, { recursive: true, force: true });
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

try {
  console.log(`console ${CONSOLE_URL}\ngateway ${GATEWAY}`);
  chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--mute-audio', '--use-angle=metal', '--enable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeErr = '';
  chrome.stderr.on('data', (d) => { chromeErr += d; });
  const dbg = await waitFor(() => /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(chromeErr)?.[1], 20_000, 'Chrome DevTools port');
  const page = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find((t) => t.type === 'page');
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.opened;
  const pageErrors = [];
  cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  let authenticatorId = null;
  if (WITH_SSH) {
    await cdp.send('WebAuthn.enable', { enableUI: false });
    ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } }));
  }

  step('1. the console page, then the loader the way the console imports it');
  await cdp.send('Page.navigate', { url: CONSOLE_URL });
  await waitFor(() => cdp.eval(`document.readyState === 'complete' && !!document.body`), 20_000, 'console page');
  const origin = await cdp.eval('location.origin');
  check(`the page origin is ${origin} (cross-origin to the gateway ${GATEWAY})`, origin !== new URL(GATEWAY).origin);
  const consoleKeys = await cdp.eval(`Object.keys(window.claura || {}).length`);
  const result = await cdp.eval(`(async () => {
    const t0 = performance.now();
    const m = await import(${JSON.stringify(`${GATEWAY}/client/claura-features.js`)});
    const r = await m.default({ base: ${JSON.stringify(GATEWAY)} });
    return { ...r, ms: Math.round(performance.now() - t0) };
  })()`);
  console.log(`       loader ran in ${result.ms} ms: loaded ${JSON.stringify(result.loaded)}, failed ${JSON.stringify(result.failed)}`);
  check('the loader module imports across origins (CORS) and returns ok', result.ok === true, result);
  check('it answers well inside the console\'s 800 ms boot budget', result.ms < 800, `${result.ms} ms`);
  const names = result.features.map((f) => f.name);
  check('health lists ssh and voice', names.includes('ssh') && names.includes('voice'), names);
  check('every feature that is not down was imported', result.features.filter((f) => f.status !== 'down').every((f) => result.loaded.includes(f.name)), result.failed);

  step('2. window.claura after the load');
  const w = await cdp.eval(`(() => { const c = window.claura || {}; return {
    openShell: typeof c.openShell,
    voice: ['toggle', 'playBrief', 'say', 'sting'].map((k) => typeof c.voice?.[k]).join(','),
    anchor: typeof c.anchor,
    integrations: Object.fromEntries(Object.entries(c.integrations || {}).map(([k, v]) => [k, { title: !!v.title, track: !!v.track, status: v.status, open: typeof v.open }])),
    keys: Object.keys(c).length,
  }; })()`);
  check('window.claura.openShell(hostId) is a function', w.openShell === 'function', w);
  check('window.claura.voice has toggle, playBrief, say, sting', w.voice === 'function,function,function,function', w.voice);
  check('integrations.voice.open(container) exists (the console\'s Integrations "Open" button) and integrations.ssh is left to the console', w.integrations.voice?.open === 'function' && !('ssh' in w.integrations), w.integrations);
  const solana = result.features.find((f) => f.kind === 'integration');
  if (solana && solana.status !== 'down') {
    check(`integrations["${solana.name}"] = {title, track, status, open()}`, w.integrations[solana.name]?.title && w.integrations[solana.name]?.track && w.integrations[solana.name]?.status && w.integrations[solana.name]?.open === 'function', w.integrations);
    check('window.claura.anchor(hash, label) is a function', w.anchor === 'function', w.anchor);
  } else console.log('       (no live integration to check)');
  check('the console\'s own window.claura API is still there (nothing overwritten)', w.keys >= consoleKeys, { before: consoleKeys, after: w.keys });
  const second = await cdp.eval(`(async () => { const m = await import(${JSON.stringify(`${GATEWAY}/client/claura-features.js`)}); const before = window.claura.openShell; await m.default({ base: ${JSON.stringify(GATEWAY)} }); return window.claura.openShell === before; })()`);
  check('loading twice changes nothing (idempotent)', second === true);

  step('3. Voice across origins');
  const vcfg = await cdp.eval(`window.claura.voice.configure().base`);
  check(`voice API base is ${result.base}/api/voice (the loader uses the page's spelling of the gateway address)`, vcfg === `${result.base}/api/voice`, vcfg);
  const vstatus = await cdp.eval(`window.claura.voice.status().then((s) => ({ mode: s.mode, nemotron: s.nemotron?.up, present: s.nemotron?.present, tier: s.elevenlabs?.account?.tier }))`);
  console.log(`       voice status ${JSON.stringify(vstatus)}`);
  check('voice.status() works cross-origin and Nemotron is reachable', ['live', 'mock'].includes(vstatus.mode) && vstatus.nemotron === true && vstatus.present === true, vstatus);
  const ask = await cdp.eval(`fetch(${JSON.stringify(`${GATEWAY}/api/voice/ask`)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'Is the host contained?' }) }).then(async (r) => ({ status: r.status, body: await r.json() }))`);
  check('a JSON POST to /api/voice/ask passes the preflight and answers from Nemotron', ask.status === 200 && ask.body.answer && /nemotron|policy|template/.test(String(ask.body.source ?? '')), { status: ask.status, source: ask.body.source, answer: ask.body.answer });
  const hdr = await cdp.eval(`fetch(${JSON.stringify(`${GATEWAY}/api/voice/sting`)}).then((r) => ({ status: r.status, mode: r.headers.get('x-voice-mode'), type: r.headers.get('content-type') }))`);
  check('X-Voice-Mode is readable cross-origin (Access-Control-Expose-Headers)', hdr.status === 200 && !!hdr.mode, hdr);
  if (WITH_SAY) {
    const say = await cdp.eval(`fetch(${JSON.stringify(`${GATEWAY}/api/voice/tts`)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Host contained.' }) }).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), mode: r.headers.get('x-voice-mode'), bytes: (await r.arrayBuffer()).byteLength }))`);
    check('one short phrase through the real voice path returns audio', say.status === 200 && /audio/.test(say.type) && say.bytes > 1000, say);
    console.log(`       tts mode=${say.mode}`);
  }

  if (WITH_SSH) {
    step('4. Secure Shell through the console origin: request, passkey, approval, terminal, sealed');
    const phase = () => cdp.eval(`document.querySelector('.cs-root')?.dataset.phase ?? null`);
    const waitPhase = (p, ms = 20_000) => waitFor(async () => (await phase()) === p, ms, `phase ${p}`);
    const click = (sel) => cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ${sel}'); el.click(); return true; })()`);
    const termText = () => cdp.eval(`(() => { const t = window.claura?.ssh?.active?.term?.term; if (!t) return ''; const b = t.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; })()`);
    const key = (type, o) => cdp.send('Input.dispatchKeyEvent', { type, ...o });
    const type = async (text) => {
      for (const ch of text) {
        if (ch === '\r') {
          await key('rawKeyDown', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
          await key('char', { text: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
          await key('keyUp', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        } else {
          await key('keyDown', { text: ch, unmodifiedText: ch, key: ch });
          await key('keyUp', { key: ch });
        }
        await sleep(12);
      }
    };
    const run = async (line, until) => { await type(`${line}\r`); await waitFor(async () => until.test(await termText()), 10_000, `output of "${line}"`); };

    await cdp.eval(`window.claura.openShell('b14-gpu-07'); true`);
    await waitPhase('request');
    check('the request sheet opens inside the console page and is pre-filled', await cdp.eval(`document.querySelector('[data-bind="reason"]').value.includes('INC-0419')`));
    await click('[data-act="submit"]');
    await waitPhase('waiting', 25_000);
    const req = await cdp.eval(`window.claura.ssh.active.req`);
    check('request cookie + CORS worked: waiting for an approver, NO certificate yet', req.status === 'awaiting_approval' && req.cert === null, req);
    check('the passkey step-up was a real WebAuthn ceremony for rpId localhost', /^webauthn/.test(req.stepUp?.method ?? '') && (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.every((c) => c.rpId === 'localhost'), req.stepUp);
    await click('[data-act="demo-approve"]');
    await waitPhase('terminal');
    await waitFor(async () => /Type 'help' for commands/.test(await termText()), 20_000, 'host banner');
    check('WebSocket terminal works cross-origin (cookie + Origin check)', true);
    await sleep(300);
    await run('hostname', /\nb14-gpu-07\n/);
    await run('rm -rf /', /denied by Claura policy: forensic read-only session/);
    check('a real sshd answered; "rm -rf /" is denied by policy', true);
    await click('[data-bind="endbtn"]');
    await waitPhase('summary', 15_000);
    await waitFor(() => cdp.eval(`document.querySelector('[data-bind="verify"]')?.classList.contains('is-ok')`), 10_000, 'chain verification');
    check('session sealed and the audit chain verifies', true);
    await click('[data-act="close"]');
  }

  check('no uncaught exception in the page', pageErrors.length === 0, pageErrors.slice(0, 3));

  step(`${WITH_SSH ? 5 : 4}. a page from a foreign origin cannot use the gateway`);
  // A data: page has an opaque origin ("null"), which is not the console's: the browser must refuse to hand the response over.
  await cdp.send('Page.navigate', { url: 'data:text/html,<title>foreign</title>' });
  await waitFor(() => cdp.eval(`document.title === 'foreign'`), 10_000, 'foreign page');
  const foreign = await cdp.eval(`(async () => {
    const probe = async (url, init) => { try { const r = await fetch(url, init); return { ok: true, status: r.status }; } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 60) }; } };
    return {
      health: await probe(${JSON.stringify(`${GATEWAY}/api/health`)}),
      tts: await probe(${JSON.stringify(`${GATEWAY}/api/voice/tts`)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"x"}' }),
      loader: await import(${JSON.stringify(`${GATEWAY}/client/claura-features.js`)}).then(() => 'imported', () => 'blocked'),
    };
  })()`);
  check('fetch(/api/health) from a foreign origin is blocked by CORS', foreign.health.ok === false, foreign.health);
  check('a JSON POST to the voice API from a foreign origin is blocked', foreign.tts.ok === false, foreign.tts);
  check('the loader module cannot be imported from a foreign origin', foreign.loader === 'blocked', foreign.loader);
} catch (err) {
  failures.push('unexpected error');
  console.log(`  FAIL ${err?.stack || err}`);
} finally {
  await cleanup();
}
console.log(`\n${failures.length ? `FAILED (${failures.length}): ${failures.join('; ')}` : 'PASSED'}  ${pass} checks ok`);
process.exit(failures.length ? 1 : 0);
