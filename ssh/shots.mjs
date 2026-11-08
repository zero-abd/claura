// Drives the real browser flow end to end and takes the screenshots in ./shots/   node shots.mjs
//
// Own headless Chrome (own profile, own debugging port on 127.0.0.1), a DevTools VIRTUAL WebAuthn authenticator
// (so the passkey step-up is the real WebAuthn ceremony, not a skip), and the real dev server + four sshd targets.
// First session: passkey ENROLMENT (b14-gpu-07). Second session: passkey AUTHENTICATION (mgmt-bmc-01).
// Everything it starts is stopped before it exits. Exit code 0 = every assertion held.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT) || 8801;
const ORIGIN = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();

let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail === undefined ? '' : `  -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); }
  return ok;
};
const step = (s) => console.log(`\n== ${s}`);

// ------------------------------------------------------------------ minimal DevTools protocol client
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
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
  close() { try { this.ws.close(); } catch { /* closed */ } }
}

async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

// ------------------------------------------------------------------ processes we own
const procs = [];
const tmpDirs = [];
function spawnOwned(cmd, args, opts) {
  const p = spawn(cmd, args, opts);
  procs.push(p);
  return p;
}
async function killAll() {
  for (const p of procs) {
    if (p.exitCode === null && p.signalCode === null) {
      try { p.kill('SIGTERM'); } catch { /* gone */ }
    }
  }
  const deadline = Date.now() + 8000;
  while (procs.some((p) => p.exitCode === null && p.signalCode === null) && Date.now() < deadline) await sleep(100);
  for (const p of procs) if (p.exitCode === null && p.signalCode === null) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
}

// ------------------------------------------------------------------ the run
async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claura-ssh-shots-data-'));
  const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claura-ssh-shots-chrome-'));
  tmpDirs.push(dataDir, chromeDir);

  step('start the dev server (real sshd targets) and own headless Chrome');
  const startDev = async (extraEnv = {}) => {
    const p = spawnOwned(process.execPath, [path.join(HERE, 'dev.mjs')], { env: { ...process.env, PORT: String(PORT), CLAURA_SSH_DATA: dataDir, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], cwd: HERE });
    const d = { p, out: '' };
    p.stdout.on('data', (x) => { d.out += x; });
    p.stderr.on('data', (x) => { d.out += x; });
    await waitFor(() => /gateway ready/.test(d.out) || (/failed/.test(d.out) && d.out), 40_000, 'dev server');
    return d;
  };
  const stopDev = async (d) => {
    d.p.kill('SIGTERM');
    await waitFor(() => d.p.exitCode !== null || d.p.signalCode !== null, 12_000, 'dev server to stop');
  };
  const dev = await startDev();
  check('dev server and gateway are ready', /gateway ready/.test(dev.out), dev.out.slice(-400));

  const chrome = spawnOwned(CHROME, ['--headless=new', `--user-data-dir=${chromeDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--hide-scrollbars', '--mute-audio', '--use-angle=metal', '--enable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeErr = '';
  chrome.stderr.on('data', (d) => { chromeErr += d; });
  const dbg = await waitFor(() => /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(chromeErr)?.[1], 20_000, 'Chrome DevTools port');
  const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.opened;
  const consoleErrors = [];
  cdp.on('Runtime.exceptionThrown', (p) => consoleErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  const viewport = (w, h, mobile = false) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  await viewport(1440, 900);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  check('virtual platform authenticator added (resident key + user verification)', !!authenticatorId);

  const shot = async (name) => {
    await sleep(750); // let the sheet's spring settle
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
    console.log(`       shot ${name}.png`);
  };
  const phase = () => cdp.eval(`document.querySelector('.cs-root')?.dataset.phase ?? null`);
  const waitPhase = (p, ms = 15_000) => waitFor(async () => (await phase()) === p, ms, `phase ${p}`);
  const click = (sel) => cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ${sel}'); el.click(); return true; })()`);
  const termText = () => cdp.eval(`(() => { const t = window.claura?.ssh?.active?.term?.term; if (!t) return ''; const b = t.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; })()`);
  const key = async (type, o) => cdp.send('Input.dispatchKeyEvent', { type, ...o });
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
  const run = async (line, until) => {
    await type(`${line}\r`);
    await waitFor(async () => until.test(await termText()), 10_000, `output of "${line}"`);
  };
  const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}/api/ssh${p}`)).json();

  // ---------------------------------------------------------------- 1. host list
  step('1. host list');
  await cdp.send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor(() => cdp.eval(`document.querySelectorAll('.cs-card').length === 4`), 15_000, 'four host cards');
  check('four enrolled hosts are shown and reachable', await cdp.eval(`[...document.querySelectorAll('[data-open]')].every((b) => !b.disabled)`));
  check('window.claura.openShell is defined by the module', await cdp.eval(`typeof window.claura?.openShell === 'function'`));
  await shot('01-hosts');

  // ---------------------------------------------------------------- 2. suspect host: request -> passkey enrolment -> approval -> terminal
  step('2. b14-gpu-07 (suspect): request, passkey (enrol), approval, terminal, summary');
  await cdp.eval(`window.claura.openShell('b14-gpu-07'); true`);
  await waitPhase('request');
  check('request sheet shows the policy and a pre-filled reason', await cdp.eval(`document.querySelector('[data-bind="reason"]').value.includes('INC-0419') && document.querySelectorAll('.cs-sheet .cs-chip').length >= 4`));
  await shot('02-request');
  // hold the passkey options request so the passkey screen can be photographed, then let the ceremony run
  let held = null;
  cdp.on('Fetch.requestPaused', (p) => { held = p.requestId; });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/passkey/options', requestStage: 'Request' }] });
  await click('[data-act="submit"]');
  await waitPhase('passkey');
  await waitFor(() => held, 5000, 'held passkey request');
  check('passkey step-up screen appears while the request is open (no certificate yet)', true);
  await shot('03-passkey');
  await cdp.send('Fetch.continueRequest', { requestId: held });
  await cdp.send('Fetch.disable');
  await waitPhase('waiting');
  const waitingReq = await cdp.eval(`window.claura.ssh.active.req`);
  check('after the passkey: waiting for the approver, and NO certificate exists yet', waitingReq.status === 'awaiting_approval' && waitingReq.cert === null && waitingReq.stepUp.done, waitingReq);
  check('step-up method recorded as a real WebAuthn ceremony (not skipped)', /^webauthn/.test(waitingReq.stepUp.method), waitingReq.stepUp.method);
  const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  check('the virtual authenticator now holds a resident passkey for localhost', creds.credentials.length === 1 && creds.credentials[0].isResidentCredential && creds.credentials[0].rpId === 'localhost', creds.credentials.map((c) => ({ rp: c.rpId, rk: c.isResidentCredential })));
  await shot('04-waiting');
  check('demo approver button reads "Approve as Incident Commander (RK)"', await cdp.eval(`document.querySelector('[data-act="demo-approve"]')?.textContent.trim()`) === 'Approve as Incident Commander (RK)');
  await click('[data-act="demo-approve"]');
  await waitPhase('terminal');
  await waitFor(async () => /Type 'help' for commands/.test(await termText()), 15_000, 'host banner in the terminal');
  check('terminal header: host, principal, recording, certificate countdown, read-only forensic',
    await cdp.eval(`(() => { const t = document.querySelector('.cs-termbar').textContent; return /b14-gpu-07/.test(t) && /forensics@b14-gpu-07/.test(t) && /Recording/.test(t) && /cert expires \\d\\d:\\d\\d/.test(t) && /read-only forensic/.test(t); })()`));
  await sleep(300);
  await run('hostname', /\nb14-gpu-07\n/);
  await run('dmesg | tail -3', /Link down[\s\S]*Link down/);
  await run('virsh list --all', /vm-7f3a/);
  await run('rm -rf /', /denied by Claura policy: forensic read-only session/);
  check('"rm -rf /" shows: denied by Claura policy: forensic read-only session', /denied by Claura policy: forensic read-only session/.test(await termText()));
  await shot('05-terminal');
  await click('[data-bind="endbtn"]');
  await waitPhase('summary', 15_000);
  await waitFor(() => cdp.eval(`document.querySelector('[data-bind="verify"]')?.classList.contains('is-ok')`), 10_000, 'chain verification');
  const sumInfo = await cdp.eval(`({ hash: document.querySelector('[data-bind="rechash"]')?.textContent, text: document.querySelector('.cs-facts')?.textContent })`);
  check('summary shows the 64-hex recording hash and the verified chain', /^[0-9a-f]{64}$/.test(sumInfo.hash) && /denied by policy/.test(sumInfo.text), sumInfo);
  await shot('06-summary');
  await click('[data-act="close"]');
  await sleep(500);

  // ---------------------------------------------------------------- 3. management plane: passkey AUTHENTICATION with the stored credential
  step('3. mgmt-bmc-01: passkey authentication with the enrolled credential');
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
  await cdp.eval(`window.claura.openShell('mgmt-bmc-01'); true`);
  await waitPhase('request');
  await click('[data-act="submit"]');
  await waitPhase('waiting', 15_000);
  const r2 = await cdp.eval(`window.claura.ssh.active.req`);
  check('second request used authentication (counter-checked assertion), not enrolment', /webauthn \(user verified\)/.test(r2.stepUp.method), r2.stepUp.method);
  await click('[data-act="demo-approve"]');
  await waitPhase('terminal');
  await waitFor(async () => /Type 'help' for commands/.test(await termText()), 15_000, 'host banner (bmc)');
  await sleep(300);
  await run('ipmitool lan print 1', /IP Address\s+:/);
  await shot('07-bmc-terminal');
  await click('[data-bind="endbtn"]');
  await waitPhase('summary', 15_000);
  await click('[data-act="close"]');
  await sleep(400);

  // ---------------------------------------------------------------- 4. healthy host: no passkey in the policy
  step('4. c05-gpu-02 (healthy): no passkey, operator session');
  await cdp.eval(`window.claura.openShell('c05-gpu-02'); true`);
  await waitPhase('request');
  await click('[data-act="submit"]');
  await waitPhase('waiting', 10_000);
  check('healthy host skips the passkey screen (policy: approver only)', (await cdp.eval(`window.claura.ssh.active.req.stepUp.required`)) === false);
  await click('[data-act="cancel"]');
  await sleep(500);

  // ---------------------------------------------------------------- 5. integration layouts
  step('5. console slot layout and a phone-width sheet');
  await cdp.send('Page.navigate', { url: `${ORIGIN}/?layout=slot#slot` });
  await waitFor(() => cdp.eval(`document.querySelectorAll('.cs-card').length === 4 && document.body.classList.contains('slot')`), 15_000, 'slot layout');
  await cdp.eval(`window.claura.openShell('b14-gpu-07'); true`);
  await waitPhase('request');
  check('with #claura-shell-slot on screen the flow mounts inside it', await cdp.eval(`!!document.querySelector('#claura-shell-slot > .cs-root.cs-slot')`));
  await shot('08-slot');
  await cdp.eval(`window.claura.ssh.close(); true`);
  await viewport(390, 844, true);
  await cdp.send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor(() => cdp.eval(`document.querySelectorAll('.cs-card').length === 4`), 15_000, 'cards (phone)');
  await cdp.eval(`window.claura.openShell('b14-gpu-07'); true`);
  await waitPhase('request');
  await shot('09-phone');
  check('no horizontal overflow at phone width', await cdp.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`));
  await viewport(1440, 900);

  // ---------------------------------------------------------------- 5b. a host with no secure shell enrolled (the console has hundreds)
  step('5b. a host the console shows but Secure Shell has not enrolled');
  await cdp.send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor(() => cdp.eval(`document.querySelectorAll('.cs-card').length === 4`), 15_000, 'cards');
  await cdp.eval(`window.claura.openShell('a21-gpu-03'); true`);
  await waitPhase('error');
  check('unknown host: says no secure shell is enrolled and offers the enrolled hosts', await cdp.eval(`(() => { const t = document.querySelector('.cs-page').textContent; return /No secure shell is enrolled for a21-gpu-03/.test(t) && document.querySelectorAll('[data-act="pick"]').length === 4; })()`));
  await shot('10-not-enrolled');
  await click('[data-act="pick"][data-host="c05-gpu-02"]');
  await waitPhase('request');
  check('picking an enrolled host continues to its request sheet', await cdp.eval(`document.querySelector('.cs-page h2').textContent.includes('c05-gpu-02')`));
  await cdp.eval(`window.claura.ssh.close(); true`);

  // ---------------------------------------------------------------- 6. server-side facts behind the screenshots
  step('6. what the gateway recorded');
  const led = await api('/ledger?limit=500');
  const kinds = led.entries.map((e) => e.kind);
  check('ledger: request, WebAuthn step-up, approval, certificate, session open/close for the suspect session', ['ssh.request', 'ssh.stepup', 'ssh.approval', 'ssh.cert.issued', 'ssh.session.opened', 'ssh.session.closed'].every((k) => kinds.includes(k)), kinds);
  check('ledger: no step-up was skipped (no DEMO_SKIP_PASSKEY in this run)', !led.entries.some((e) => /SKIPPED/.test(e.text ?? '')));
  const ver = await api('/ledger/verify');
  check('ledger chain and recording chain verify', ver.ledger.ok && ver.recordings.ok && ver.recordings.count === 2, ver);
  check('no uncaught page errors or console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3));

  // ---------------------------------------------------------------- 7. the certificate is the lease, as the operator sees it
  step('7. certificate expiry in the UI (dev server restarted with DEMO_TTL_SECONDS=20)');
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await stopDev(dev);
  const dev2 = await startDev({ DEMO_TTL_SECONDS: '20' });
  check('dev server restarted with 20-second certificates', /DEMO_TTL_SECONDS=20/.test(dev2.out), dev2.out.slice(-200));
  await cdp.send('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor(() => cdp.eval(`document.querySelectorAll('.cs-card').length === 4`), 15_000, 'cards (after restart)');
  await cdp.eval(`window.claura.openShell('c05-gpu-02'); true`);
  await waitPhase('request');
  await click('[data-act="submit"]');
  await waitPhase('waiting', 15_000);
  await click('[data-act="demo-approve"]');
  await waitPhase('terminal');
  await waitFor(async () => /Type 'help' for commands/.test(await termText()), 15_000, 'host banner (short certificate)');
  await run('hostname', /\nc05-gpu-02\n/);
  await waitFor(() => cdp.eval(`document.querySelector('.cs-termbar')?.dataset.warn === '2'`), 15_000, 'expiry warning colour');
  check('the header countdown turns to the warning state and a banner says the session will close', await cdp.eval(`!document.querySelector('[data-bind="banner"]').hidden`));
  await shot('11-expiring');
  await waitPhase('summary', 40_000);
  check('when the certificate runs out the session is closed for the operator and the summary says why', await cdp.eval(`/certificate expired/i.test(document.querySelector('.cs-page .cs-sub').textContent)`), await cdp.eval(`document.querySelector('.cs-page .cs-sub')?.textContent`));
  await shot('12-expired');
  const ver2 = await (await fetch(`http://127.0.0.1:${PORT}/api/ssh/ledger/verify`)).json();
  check('chains still verify after the restart (they continue from disk)', ver2.ledger.ok && ver2.recordings.ok && ver2.recordings.count === 3, ver2);
  check('no uncaught page errors or console errors (whole run)', consoleErrors.length === 0, consoleErrors.slice(0, 3));

  // ---------------------------------------------------------------- stop
  step('stop everything');
  try { await cdp.send('Browser.close'); } catch { /* closing */ }
  cdp.close();
}

try {
  await main();
} catch (err) {
  console.error(`\nSHOTS ERROR: ${err.stack || err.message}`);
  failures.push(`exception: ${err.message}`);
} finally {
  await killAll();
  const { execFileSync } = await import('node:child_process');
  const ps = execFileSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8', maxBuffer: 8 << 20 });
  const leftovers = ps.split('\n').filter((l) => /claura-ssh-shots-/.test(l));
  check('no process started by this run is left (Chrome, dev server, sshd)', leftovers.length === 0, leftovers.slice(0, 3));
  const secs = ((Date.now() - T0) / 1000).toFixed(1);
  if (failures.length) {
    console.log(`\nSHOTS FAILED: ${failures.length} failed, ${passed} passed (${secs} s)\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`\nSHOTS PASSED: ${passed} checks (${secs} s), screenshots in ${SHOTS}`);
  process.exit(0);
}
