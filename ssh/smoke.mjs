// End-to-end smoke test for Claura Secure Shell, against real OpenSSH.   node smoke.mjs
//
// Starts the gateway and the four user-space sshd targets (127.0.0.1:2201-2204), then walks the whole path:
// request -> approval -> ephemeral SSH certificate -> WebSocket -> /usr/bin/ssh -> sshd -> host shell, runs
// "hostname; dmesg | tail -3; rm -rf /", and checks the recording, both hash chains, expiry, revocation and the
// guards around all of it. DEMO_SKIP_PASSKEY semantics are used HERE ONLY (no authenticator in a terminal);
// every skip is written to the ledger. The passkey path itself is exercised by shots.mjs (virtual authenticator).
// Everything it starts is stopped before it exits. Exit code 0 = all checks passed.
import express from 'express';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { knownHostsLine } from './lib/ca.mjs';
import { sshArgs } from './lib/session.mjs';
import { GENESIS, Ledger } from './lib/ledger.mjs';
import { canonicalJson } from './lib/util.mjs';
import { mount } from './server.mjs';

const execFileP = promisify(execFile);
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// ------------------------------------------------------------------ tiny test harness
let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? '' : `  -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
  return ok;
}
const step = (s) => console.log(`\n== ${s}`);

// ------------------------------------------------------------------ gateway under test
process.env.DEMO_SKIP_PASSKEY = '1'; // smoke only: there is no authenticator in a terminal. shots.mjs covers the real WebAuthn path.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claura-ssh-smoke-'));
fs.chmodSync(dataDir, 0o700);
const app = express();
const gwLog = (msg, _meta, level) => { if (level === 'error' || level === 'warn') console.error(`  [gateway ${level}] ${msg}`); };
const ssh = mount(app, { log: gwLog, ssh: { dataDir, portBase: Number(process.env.SMOKE_PORT_BASE) || 2201 } });
const server = http.createServer(app);
ssh.attach(server);
let port = 0;
let origin = '';
let stopped = false;
let ssh2 = null;
let server2 = null;

async function stopAll() {
  if (stopped) return;
  stopped = true;
  if (ssh2) { try { await ssh2.stop(); } catch (e) { console.error('stop (identity gateway):', e.message); } }
  if (server2) { await new Promise((r) => server2.close(() => r())).catch(() => {}); server2.closeAllConnections?.(); }
  try { await ssh.stop(); } catch (e) { console.error('stop:', e.message); }
  await new Promise((r) => server.close(() => r())).catch(() => {});
  server.closeAllConnections?.();
}
const watchdog = setTimeout(async () => {
  console.error('\nSMOKE TIMEOUT after 150 s');
  await stopAll();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(2);
}, 150_000);

// ------------------------------------------------------------------ http / ws helpers
function raw(method, urlPath, { headers = {}, body, cookie, port: portOverride } = {}) {
  const P = portOverride ?? port;
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const h = { Host: `127.0.0.1:${P}`, ...headers };
    if (data !== null) {
      h['Content-Length'] = Buffer.byteLength(data);
      h['Content-Type'] ??= 'application/json';
    }
    if (cookie) h.Cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port: P, method, path: urlPath, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        if ((res.headers['content-type'] ?? '').includes('json')) {
          try { json = JSON.parse(buf.toString('utf8')); } catch { /* not json */ }
        }
        const setCookie = (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]);
        resolve({ status: res.statusCode, headers: res.headers, json, buf, setCookie, rawSetCookie: res.headers['set-cookie'] ?? [] });
      });
    });
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}
const api = (method, p, body, o = {}) => raw(method, `/api/ssh${p}`, { body, headers: { Origin: origin, ...(o.headers ?? {}) }, cookie: o.cookie });

function openTerm(requestId, { cookie, withOrigin = true, cols = 100, rows = 30 } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (withOrigin) headers.Origin = origin;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ssh/session?requestId=${requestId}&cols=${cols}&rows=${rows}`, { headers });
  const t = { ws, out: '', msgs: [], ready: null, closedMsg: null, errorMsg: null, closeCode: null, httpStatus: null, done: false, waiters: [] };
  const poke = () => { for (const w of [...t.waiters]) if (w.pred(t)) { t.waiters.splice(t.waiters.indexOf(w), 1); w.resolve(true); } };
  ws.on('message', (data, isBinary) => {
    if (isBinary) t.out += data.toString('utf8');
    else {
      let m;
      try { m = JSON.parse(data.toString('utf8')); } catch { return; }
      t.msgs.push(m);
      if (m.type === 'ready') t.ready = m;
      if (m.type === 'closed') t.closedMsg = m;
      if (m.type === 'error') t.errorMsg = m;
    }
    poke();
  });
  ws.on('close', (code) => { t.closeCode = code; t.done = true; poke(); });
  ws.on('unexpected-response', (_q, res) => { t.httpStatus = res.statusCode; t.done = true; poke(); });
  ws.on('error', () => {});
  t.waitFor = (pred, ms = 15_000) => new Promise((resolve) => {
    if (pred(t)) return resolve(true);
    const timer = setTimeout(() => { t.waiters = t.waiters.filter((w) => w !== entry); resolve(false); }, ms);
    const entry = { pred, resolve: (v) => { clearTimeout(timer); resolve(v); } };
    t.waiters.push(entry);
  });
  t.send = (s) => ws.send(Buffer.from(s, 'utf8'), { binary: true });
  return t;
}

const jar = (res) => res.setCookie.join('; ');
const hostsOf = async () => (await api('GET', '/hosts')).json;
async function request(host, operator, extra = {}) {
  const res = await api('POST', '/request', { host, operator, reason: `smoke test: ${host}`, ...extra });
  return { res, id: res.json?.request?.id, cookie: jar(res), view: res.json?.request };
}
const approve = (requestId, approver) => api('POST', '/approve', { requestId, approver });

// ------------------------------------------------------------------ the run
async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  origin = `http://127.0.0.1:${port}`;
  console.log(`Claura Secure Shell smoke test  (gateway http://127.0.0.1:${port}, data ${dataDir})`);
  await ssh.ready;

  // ---------------------------------------------------------------- A. gateway, targets, guards
  step('A. gateway, targets and guards');
  const hs = await hostsOf();
  check('four demo hosts are listed and all sshd targets are up', hs.hosts.length === 4 && hs.hosts.every((h) => h.up), hs.hosts.map((h) => [h.id, h.up, h.error]));
  const ports = [2201, 2202, 2203, 2204].map((p) => p - 2201 + (Number(process.env.SMOKE_PORT_BASE) || 2201));
  check('targets listen on 127.0.0.1:2201-2204 (or the configured block)', ports.every((p, i) => ssh.targets.portOf(hs.hosts[i].id) === p), ports);
  const b14 = hs.hosts.find((h) => h.id === 'b14-gpu-07');
  check('suspect host policy: passkey step-up + approver + read-only forensic principal',
    b14.policy.class === 'suspect' && b14.policy.stepUp && b14.policy.approvals >= 1 && b14.policy.readOnly && b14.policy.principal === 'forensics@b14-gpu-07', b14.policy);
  check('skip-passkey banner flag is exposed to the UI', hs.skipPasskey === true);
  check('ui.js and the vendored xterm.js are served', (await raw('GET', '/api/ssh/ui.js', { headers: {} })).status === 200 && (await raw('GET', '/api/ssh/vendor/xterm.mjs')).status === 200);
  check('vendor route has no path traversal', (await raw('GET', '/api/ssh/vendor/..%2f..%2fserver.mjs')).status === 404);
  check('DNS-rebinding guard: foreign Host header is refused (421)', (await raw('GET', '/api/ssh/hosts', { headers: { Host: 'evil.example' } })).status === 421);
  check('CSRF guard: foreign Origin on a POST is refused (403)', (await raw('POST', '/api/ssh/request', { headers: { Origin: 'http://evil.example' }, body: { host: 'b14-gpu-07', operator: 'jt', reason: 'csrf attempt' } })).status === 403);
  check('CSRF guard: form-encoded POST is refused (415)', (await raw('POST', '/api/ssh/request', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body: 'host=b14-gpu-07' })).status === 415);

  // ---------------------------------------------------------------- B. input validation and the approval rules
  step('B. validation and approval rules');
  check('unknown host id is 404', (await api('POST', '/request', { host: 'zz9-gpu-99', operator: 'jt', reason: 'smoke test' })).status === 404);
  check('shell-metacharacter host id is 400', (await api('POST', '/request', { host: 'b14; rm -rf /', operator: 'jt', reason: 'smoke test' })).status === 400);
  check('more than 15 minutes is 400', (await api('POST', '/request', { host: 'c05-gpu-02', operator: 'jt', reason: 'smoke test', minutes: 16 })).status === 400);
  check('non-integer minutes is 400', (await api('POST', '/request', { host: 'c05-gpu-02', operator: 'jt', reason: 'smoke test', minutes: 2.5 })).status === 400);
  check('a one-word reason is 400', (await api('POST', '/request', { host: 'c05-gpu-02', operator: 'jt', reason: 'x' })).status === 400);
  check('a person outside the directory is 403', (await api('POST', '/request', { host: 'c05-gpu-02', operator: 'mallory', reason: 'smoke test' })).status === 403);
  const selfReq = await request('c12-gpu-04', 'rk');
  check('a request is created for an approver-role person', selfReq.res.status === 201 && selfReq.view.status === 'awaiting_approval', selfReq.res.json);
  const self = await approve(selfReq.id, 'rk');
  check('the requester can never approve their own request (403)', self.status === 403 && /differ/.test(self.json?.error ?? ''), self.json);
  const nonApprover = await approve(selfReq.id, 'jt');
  check('a person without the approver role cannot approve (403)', nonApprover.status === 403 && /not an approver/.test(nonApprover.json?.error ?? ''), nonApprover.json);
  check('approving an unknown request is 404', (await approve('req_000000000000', 'rk')).status === 404);
  check('another browser cannot cancel it (403)', (await api('POST', `/request/${selfReq.id}/cancel`, {})).status === 403);
  const cancelled = await api('POST', `/request/${selfReq.id}/cancel`, {}, { cookie: selfReq.cookie });
  check('the requester can cancel with their own cookie', cancelled.status === 200 && cancelled.json.request.status === 'revoked', cancelled.json);

  // ---------------------------------------------------------------- C. the main path on the suspect host
  step('C. b14-gpu-07 (suspect): request -> approval -> certificate -> terminal -> recording');
  const r1 = await request('b14-gpu-07', 'jt', { minutes: 10 });
  check('request accepted; passkey step-up counted as skipped; no certificate yet', r1.res.status === 201 && r1.view.status === 'awaiting_approval' && r1.view.cert === null, r1.view);
  check('request cookie is HttpOnly + SameSite=Strict + scoped to the API', r1.res.rawSetCookie.some((c) => /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c) && /Path=\/api\/ssh/i.test(c)), r1.res.rawSetCookie);
  const early = openTerm(r1.id, { cookie: r1.cookie });
  await early.waitFor((t) => t.done);
  check('no terminal before approval (close 4412)', early.closeCode === 4412 || early.errorMsg?.code === 4412, [early.closeCode, early.errorMsg]);

  const a1 = await approve(r1.id, 'rk');
  const v1 = a1.json?.request;
  check('independent approver (RK) approves -> certificate issued', a1.status === 200 && v1.status === 'approved' && !!v1.cert, a1.json);
  check('principal is chosen by policy: forensics@b14-gpu-07', v1.cert.principal === 'forensics@b14-gpu-07', v1.cert);
  const lifetime = (v1.cert.validBefore - v1.cert.validAfter) / 1000;
  const toExpiry = (v1.cert.validBefore - a1.json.serverNow) / 1000;
  check('certificate expires in at most the 10 minutes asked for (window = 5 s skew allowance + 10 min)', toExpiry > 590 && toExpiry <= 600 && lifetime <= 10 * 60 + 6, { toExpiry, lifetime });
  check('key id is "<operator>|<requestId>"', v1.cert.keyId === `jt|${r1.id}`, v1.cert.keyId);

  const files1 = ssh.requests.get(r1.id).files;
  const lText = execFileSync('/usr/bin/ssh-keygen', ['-L', '-f', files1.certPath], { encoding: 'utf8' });
  check('ssh-keygen -L: user certificate for exactly one principal', /user certificate/.test(lText) && /Principals:\s*\n\s*forensics@b14-gpu-07\s*\n/.test(lText), lText);
  check('ssh-keygen -L: only permit-pty (no port, agent, X11 forwarding or user rc)', /Extensions:[\s\S]*permit-pty/.test(lText) && !/permit-(port|agent|X11)-forwarding|permit-user-rc/.test(lText), lText);
  check('ssh-keygen -L: bound to the gateway address', /source-address 127\.0\.0\.1\/32/.test(lText), lText);

  const noCookie = openTerm(r1.id, {});
  await noCookie.waitFor((t) => t.done);
  check('terminal without the request cookie is refused (4401)', noCookie.errorMsg?.code === 4401 || noCookie.closeCode === 4401, [noCookie.closeCode, noCookie.errorMsg]);
  const badOrigin = openTerm(r1.id, { cookie: r1.cookie, withOrigin: false });
  badOrigin.ws.terminate();
  const evilWs = new WebSocket(`ws://127.0.0.1:${port}/api/ssh/session?requestId=${r1.id}`, { headers: { Cookie: r1.cookie, Origin: 'http://evil.example' } });
  const evilStatus = await new Promise((resolve) => { evilWs.on('unexpected-response', (_q, res) => resolve(res.statusCode)); evilWs.on('open', () => resolve('open')); evilWs.on('error', () => resolve('error')); setTimeout(() => resolve('timeout'), 4000); });
  check('cross-site WebSocket (foreign Origin) is refused at the handshake (403)', evilStatus === 403, evilStatus);

  const term = openTerm(r1.id, { cookie: r1.cookie });
  check('terminal opens and the gateway sends "ready" with host, principal and expiry', await term.waitFor((t) => !!t.ready), term.errorMsg);
  check('the terminal runs on a real pseudo-terminal (node-pty)', term.ready?.transport === 'pty', term.ready?.transport);
  check('ready message carries read-only forensic mode', term.ready?.readOnly === true && term.ready?.mode === 'forensic' && term.ready?.principal === 'forensics@b14-gpu-07', term.ready);
  check('real sshd greets with the certificate details (banner)', await term.waitFor((t) => /Type 'help' for commands/.test(t.out)), term.out.slice(0, 400));
  await sleep(250);
  const cmd = 'hostname; dmesg | tail -3; rm -rf /';
  term.send(`${cmd}\r`);
  const denied = await term.waitFor((t) => /denied by Claura policy: forensic read-only session/.test(t.out), 15_000);
  check('"rm -rf /" is denied: "denied by Claura policy: forensic read-only session"', denied, term.out.slice(-600));
  const afterCmd = term.out.slice(term.out.indexOf(cmd) + cmd.length);
  check('hostname printed b14-gpu-07', /(^|\n)b14-gpu-07\r*\n/.test(afterCmd), afterCmd.slice(0, 300));
  const dmesgLines = afterCmd.split(/\r?\n/).filter((l) => /^\[\s*\d+\.\d+\]/.test(l));
  check('dmesg | tail -3 printed three kernel lines', dmesgLines.length === 3, dmesgLines);
  check('the filesystem is untouched: a second command still works', (term.send('ls /\r'), await term.waitFor((t) => /\bbin\b[\s\S]*\betc\b/.test(t.out.slice(t.out.lastIndexOf('ls /'))), 8000)));
  const markUp = term.out.length;
  term.send('\x1b[A\r'); // arrow up, enter: the line editor recalls "ls /"
  check('arrow-up recalls the previous command (line editing works over the pty)', await term.waitFor((t) => /\bbin\b[\s\S]*\betc\b/.test(t.out.slice(markUp)), 8000), term.out.slice(markUp, markUp + 200));
  term.send('exit\r');
  const closed = await term.waitFor((t) => !!t.closedMsg, 15_000);
  check('session ends cleanly and the gateway sends a summary', closed, term.msgs.slice(-3));
  const sum = term.closedMsg?.summary;
  check('summary: 64-hex recording hash, ledger link, >=3 commands, >=1 denied', !!sum && /^[0-9a-f]{64}$/.test(sum.recording.sha256) && /^[0-9a-f]{64}$/.test(sum.ledger.hash) && sum.commands.total >= 3 && sum.commands.denied >= 1, sum);
  check('summary records the principal and certificate serial', sum?.principal === 'forensics@b14-gpu-07' && sum?.certSerial === v1.cert.serial, sum);

  // recording + hash chains
  const rec = await api('GET', `/recording/${sum.sessionId}`, undefined, { cookie: r1.cookie });
  check('recording downloads for the requester', rec.status === 200, rec.status);
  check('recording sha256 == header == ledger', sha256(rec.buf) === rec.headers['x-claura-recording-sha256'] && sha256(rec.buf) === sum.recording.sha256, [sha256(rec.buf), sum.recording.sha256]);
  const castLines = rec.buf.toString('utf8').trim().split('\n');
  const castHead = JSON.parse(castLines[0]);
  const castEvents = castLines.slice(1).map((l) => JSON.parse(l));
  check('recording is asciicast v2 (header + [time, type, data] events)', castHead.version === 2 && castEvents.length > 5 && castEvents.every((e) => Array.isArray(e) && typeof e[0] === 'number' && typeof e[1] === 'string'), castHead);
  check('recording contains the denial and the typed command', castEvents.some((e) => e[1] === 'o' && /denied by Claura policy/.test(e[2])) && castEvents.some((e) => e[1] === 'i' && /rm -rf/.test(e[2])));
  check('recording is refused to someone without the requester cookie (403)', (await api('GET', `/recording/${sum.sessionId}`)).status === 403);
  check('recording id is validated (no traversal)', (await api('GET', '/recording/..%2f..%2fledger.jsonl', undefined, { cookie: r1.cookie })).status === 404);

  const ver = (await api('GET', '/ledger/verify')).json;
  check('GET /ledger/verify: ledger chain intact', ver.ledger.ok && ver.ledger.count >= 8, ver.ledger);
  check('GET /ledger/verify: recording chain intact', ver.recordings.ok && ver.recordings.count === 1, ver.recordings);
  const ledgerFile = path.join(dataDir, 'ledger.jsonl');
  const lines = fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let prev = GENESIS;
  let chainOk = true;
  for (const e of lines) {
    const { hash, ...rest } = e;
    if (e.prev !== prev || hash !== sha256(`${prev}\n${canonicalJson(rest)}`)) chainOk = false;
    prev = hash;
  }
  check('independent re-computation of the ledger chain from the file on disk', chainOk && prev === ver.ledger.head, [prev, ver.ledger.head]);
  check('ledger shows request, skipped step-up, approval, certificate, session open and close',
    ['ssh.request', 'ssh.stepup', 'ssh.approval', 'ssh.cert.issued', 'ssh.session.opened', 'ssh.session.closed'].every((k) => lines.some((e) => e.kind === k && e.requestId === r1.id)), lines.filter((e) => e.requestId === r1.id).map((e) => e.kind));
  // edit the LIVE ledger file under the running gateway: the verify route (which re-reads the disk) must notice, then recover
  const liveOriginal = fs.readFileSync(ledgerFile, 'utf8');
  const liveLines = liveOriginal.split('\n');
  const liveEntry = JSON.parse(liveLines[2]);
  liveEntry.text = `${liveEntry.text} (edited on disk)`;
  liveLines[2] = JSON.stringify(liveEntry);
  fs.writeFileSync(ledgerFile, liveLines.join('\n'));
  const verBad = (await api('GET', '/ledger/verify')).json;
  check('editing the live ledger file on disk is detected by GET /ledger/verify (broken at entry 3)', verBad.ledger.ok === false && verBad.ledger.brokenAt === 3, verBad.ledger);
  fs.writeFileSync(ledgerFile, liveOriginal);
  const verRestored = (await api('GET', '/ledger/verify')).json;
  check('...and it verifies again once the file is restored', verRestored.ledger.ok === true && verRestored.ledger.source === 'disk', verRestored.ledger);
  const tamper = path.join(dataDir, 'ledger.tampered.jsonl');
  const edited = lines.map((e) => ({ ...e }));
  edited[2].text = `${edited[2].text} (edited after the fact)`;
  fs.writeFileSync(tamper, `${edited.map((e) => JSON.stringify(e)).join('\n')}\n`);
  const tv = Ledger.verifyFile(tamper);
  check('tamper test: editing one past ledger entry breaks the chain at that entry', !tv.ok && tv.brokenAt === 3, tv);
  const flipped = Buffer.from(rec.buf);
  flipped[flipped.length - 3] ^= 1;
  check('tamper test: flipping one bit of the recording changes its hash', sha256(flipped) !== sum.recording.sha256);

  const replay = openTerm(r1.id, { cookie: r1.cookie });
  await replay.waitFor((t) => t.done);
  check('the approval is single-use: a second terminal is refused (4409)', replay.errorMsg?.code === 4409 || replay.closeCode === 4409, [replay.closeCode, replay.errorMsg]);
  const after = (await api('GET', `/request/${r1.id}`)).json.request;
  check('request is closed afterwards', after.status === 'closed', after.status);
  check('the ephemeral private key and certificate are wiped from disk', !fs.existsSync(path.join(ssh.runDir, 'sess', r1.id)));

  // ---------------------------------------------------------------- D. certificate expiry kills the session
  step('D. c05-gpu-02: the certificate is the lease (expiry kills the session)');
  ssh.cfg.testTtlSeconds = 6;
  const r2 = await request('c05-gpu-02', 'al');
  check('healthy host: no passkey step-up in the policy', r2.view.policy.class === 'healthy' && r2.view.stepUp.required === false, r2.view.policy);
  const a2 = await approve(r2.id, 'rk');
  check('certificate valid for the 6 seconds the test asked for', a2.status === 200 && (a2.json.request.cert.validBefore - a2.json.serverNow) / 1000 <= 6.5, a2.json);
  const t2 = openTerm(r2.id, { cookie: r2.cookie });
  const opened2 = Date.now();
  check('operator principal session opens', await t2.waitFor((t) => !!t.ready) && t2.ready.principal === 'operator@c05-gpu-02' && t2.ready.readOnly === false, t2.errorMsg);
  await t2.waitFor((t) => /Type 'help'/.test(t.out), 8000);
  await sleep(200);
  t2.send('hostname\r');
  check('operator session runs commands', await t2.waitFor((t) => /(^|\n)c05-gpu-02\r*\n/.test(t.out.slice(t.out.lastIndexOf('hostname'))), 6000));
  const killed = await t2.waitFor((t) => !!t.closedMsg, 14_000);
  const took = (Date.now() - opened2) / 1000;
  check('session is closed by the system when the certificate expires', killed && t2.closedMsg.reason === 'cert-expired', t2.closedMsg?.reason ?? t2.msgs.slice(-2));
  check('...within a couple of seconds of expiry', took < 11, took);
  ssh.cfg.testTtlSeconds = undefined;

  // ---------------------------------------------------------------- E. revocation: the host refuses the certificate
  step('E. c12-gpu-04: revocation (KRL) kills the session and the host refuses the certificate');
  const r3 = await request('c12-gpu-04', 'jt', { minutes: 5 });
  const a3 = await approve(r3.id, 'al');
  check('second approver (AL) can approve too', a3.status === 200 && a3.json.request.status === 'approved', a3.json);
  const f3 = ssh.requests.get(r3.id).files;
  const keep = fs.mkdtempSync(path.join(dataDir, 'kept-'));
  const kept = { key: path.join(keep, 'id'), certPath: path.join(keep, 'id-cert.pub'), knownHosts: path.join(keep, 'kh') };
  fs.copyFileSync(f3.key, kept.key); fs.chmodSync(kept.key, 0o600);
  fs.copyFileSync(f3.certPath, kept.certPath);
  fs.copyFileSync(f3.knownHosts, kept.knownHosts);
  const sshOnce = async (command) => {
    const argv = sshArgs({ files: kept, hostId: 'c12-gpu-04', port: ssh.targets.portOf('c12-gpu-04'), user: os.userInfo().username });
    argv.splice(argv.indexOf('-tt'), 1, '-T');
    try {
      const { stdout, stderr } = await execFileP('/usr/bin/ssh', [...argv, command], { timeout: 20_000, env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
      return { code: 0, stdout, stderr };
    } catch (e) {
      return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  };
  // a certificate is bound to ONE host: the principal list on every other host does not contain it
  const khOther = path.join(keep, 'kh-c05');
  fs.writeFileSync(khOther, knownHostsLine(ssh.ca, 'c05-gpu-02'));
  const sshAt = async (hostId, port, knownHosts, command) => {
    const argv = sshArgs({ files: { ...kept, knownHosts }, hostId, port, user: os.userInfo().username });
    argv.splice(argv.indexOf('-tt'), 1, '-T');
    try {
      const { stdout, stderr } = await execFileP('/usr/bin/ssh', [...argv, command], { timeout: 20_000, env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
      return { code: 0, stdout, stderr };
    } catch (e) {
      return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  };
  const wrongHost = await sshAt('c05-gpu-02', ssh.targets.portOf('c05-gpu-02'), khOther, 'hostname');
  check('the c12 certificate is refused by c05 (principal not authorised there)', wrongHost.code === 255 && /Permission denied/.test(wrongHost.stderr), wrongHost);
  const impostor = await sshAt('c12-gpu-04', ssh.targets.portOf('c05-gpu-02'), kept.knownHosts, 'hostname');
  check('host impersonation fails: c05 cannot pass for c12 (client checks the host certificate principals)', impostor.code === 255 && /Host key verification failed|host key/i.test(impostor.stderr), impostor);
  const before = await sshOnce('hostname');
  check('before revocation the same key+certificate logs in with real ssh', before.code === 0 && /c12-gpu-04/.test(before.stdout), before);
  const t3 = openTerm(r3.id, { cookie: r3.cookie });
  await t3.waitFor((t) => !!t.ready);
  await t3.waitFor((t) => /Type 'help'/.test(t.out), 8000);
  const revokedBy = await api('POST', '/revoke', { requestId: r3.id, by: 'jt', reason: 'smoke' });
  check('only the incident commander (or the requester) can revoke (403)', revokedBy.status === 403, revokedBy.json);
  const rv = await api('POST', '/revoke', { requestId: r3.id, by: 'rk', reason: 'smoke test: revoke' });
  check('commander revokes the certificate', rv.status === 200 && rv.json.request.status === 'revoked', rv.json);
  check('the live session is torn down immediately (reason "revoked")', await t3.waitFor((t) => !!t.closedMsg, 8000) && t3.closedMsg.reason === 'revoked', t3.closedMsg?.reason);
  check('the certificate is on the key revocation list', await ssh.krl.isRevoked(kept.certPath));
  const after3 = await sshOnce('hostname');
  check('after revocation the host (sshd RevokedKeys) refuses the same certificate', after3.code === 255 && /Permission denied/.test(after3.stderr), after3);

  // ---------------------------------------------------------------- F. host policy follows the incident state
  step('F. policy follows the host state');
  await ssh.setHostStatus('c12-gpu-04', 'quarantined');
  const hs2 = await hostsOf();
  const c12 = hs2.hosts.find((h) => h.id === 'c12-gpu-04');
  check('a host that becomes quarantined switches to the suspect policy (passkey + read-only forensic)', c12.policy.class === 'suspect' && c12.policy.principal === 'forensics@c12-gpu-04' && c12.policy.stepUp, c12.policy);
  await ssh.setHostStatus('c12-gpu-04', 'healthy');

  // ---------------------------------------------------------------- G. identity comes from the console, not from the body
  step('G. console identity hook: who you are comes from the console session, never from the request body');
  const base2 = (Number(process.env.SMOKE_PORT_BASE) || 2201) + 10;
  const roles = { jt: ['operator'], rk: ['operator', 'approver', 'commander'] };
  const app2 = express();
  ssh2 = mount(app2, {
    log: gwLog,
    ssh: {
      dataDir: path.join(dataDir, 'gw2'), portBase: base2,
      identity: (req) => { const u = String(req.headers['x-test-user'] ?? ''); return roles[u] ? { id: u, roles: roles[u] } : null; },
    },
  });
  server2 = http.createServer(app2);
  ssh2.attach(server2);
  await new Promise((r) => server2.listen(0, '127.0.0.1', r));
  const port2 = server2.address().port;
  const origin2 = `http://127.0.0.1:${port2}`;
  await ssh2.ready;
  const as = (user, o = {}) => ({ port: port2, headers: { Origin: origin2, ...(user ? { 'X-Test-User': user } : {}), ...(o.headers ?? {}) }, cookie: o.cookie, body: o.body });
  check('no console session: the API answers 401', (await raw('GET', '/api/ssh/hosts', as(null))).status === 401);
  check('with a console session the API answers', (await raw('GET', '/api/ssh/hosts', as('jt'))).status === 200);
  const g1 = await raw('POST', '/api/ssh/request', as('jt', { body: { host: 'c05-gpu-02', operator: 'rk', reason: 'identity hook test' } }));
  check('the requester is whoever the console says (body claiming "rk" is ignored)', g1.status === 201 && g1.json.request.operator === 'jt', g1.json);
  const gid = g1.json.request.id;
  const gcookie = g1.setCookie.join('; ');
  const noRole = await raw('POST', '/api/ssh/approve', as('jt', { body: { requestId: gid, approver: 'rk' } }));
  check('claiming "rk" in the body does not make jt an approver (403)', noRole.status === 403, noRole.json);
  const ok2 = await raw('POST', '/api/ssh/approve', as('rk', { body: { requestId: gid, approver: 'jt' } }));
  check('rk, signed in at the console, approves (the body field is ignored)', ok2.status === 200 && ok2.json.request.approvals[0].approver === 'rk', ok2.json);
  const wsOther = new WebSocket(`ws://127.0.0.1:${port2}/api/ssh/session?requestId=${gid}`, { headers: { Cookie: gcookie, Origin: origin2, 'X-Test-User': 'rk' } });
  const otherResult = await new Promise((resolve) => { wsOther.on('message', (d, bin) => { if (!bin) { try { const m = JSON.parse(d.toString()); if (m.type === 'error' || m.type === 'ready') resolve(m); } catch { /* ignore */ } } }); wsOther.on('close', (c) => resolve({ closed: c })); setTimeout(() => resolve({ timeout: true }), 5000); });
  check('a stolen request cookie is useless for someone else\'s console session (4401)', otherResult.code === 4401 || otherResult.closed === 4401, otherResult);
  const wsOwn = new WebSocket(`ws://127.0.0.1:${port2}/api/ssh/session?requestId=${gid}`, { headers: { Cookie: gcookie, Origin: origin2, 'X-Test-User': 'jt' } });
  let ownReady = null;
  const ownDone = new Promise((resolve) => { wsOwn.on('message', (d, bin) => { if (!bin) { try { const m = JSON.parse(d.toString()); if (m.type === 'ready') { ownReady = m; resolve(); } if (m.type === 'closed') resolve(); } catch { /* ignore */ } } }); setTimeout(resolve, 8000); });
  await ownDone;
  check('the requester\'s own session opens with cookie + console identity', ownReady?.principal === 'operator@c05-gpu-02', ownReady);
  wsOwn.send(JSON.stringify({ type: 'end' }));
  await sleep(1500);
  const sessions2 = (await raw('GET', '/api/ssh/sessions', as('jt'))).json?.finished ?? [];
  const sid2 = sessions2[0]?.sessionId;
  check('a finished session appears in the list', !!sid2);
  check('recording: a signed-in non-approver without the request cookie is refused (403)', (await raw('GET', `/api/ssh/recording/${sid2}`, as('jt'))).status === 403);
  check('recording: an approver/commander identity may download it (200)', (await raw('GET', `/api/ssh/recording/${sid2}`, as('rk'))).status === 200);

  const final = (await api('GET', '/ledger/verify')).json;
  check('final: ledger chain and recording chain still intact', final.ledger.ok && final.recordings.ok, final);
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error(`\nSMOKE ERROR: ${err.stack || err.message}`);
  failures.push(`exception: ${err.message}`);
} finally {
  clearTimeout(watchdog);
  step('teardown');
  const pidsFile = path.join(dataDir, 'run', 'pids.json');
  let pids = [];
  try { pids = JSON.parse(fs.readFileSync(pidsFile, 'utf8')); } catch { /* none */ }
  await stopAll();
  await sleep(200);
  let pidsAfter = [];
  try { pidsAfter = JSON.parse(fs.readFileSync(pidsFile, 'utf8')); } catch { /* none */ }
  const alive = pids.filter((p) => { try { process.kill(p, 0); return true; } catch { return false; } });
  check('every sshd target process was stopped', alive.length === 0 && pidsAfter.length === 0, { pids, alive });
  const { stdout: psOut } = await execFileP('/bin/ps', ['-axo', 'command='], { maxBuffer: 8 << 20 });
  check('no sshd or ssh process referencing the test directory is left', !psOut.split('\n').some((l) => l.includes(dataDir) && /ssh/.test(l)), psOut.split('\n').filter((l) => l.includes(dataDir)).slice(0, 3));
  fs.rmSync(dataDir, { recursive: true, force: true });
  check('temporary data directory removed', !fs.existsSync(dataDir));
  const secs = ((Date.now() - T0) / 1000).toFixed(1);
  if (failures.length) {
    console.log(`\nSMOKE FAILED: ${failures.length} failed, ${passed} passed (${secs} s)\n  - ${failures.join('\n  - ')}`);
    exitCode = 1;
  } else {
    console.log(`\nSMOKE PASSED: ${passed} checks (${secs} s)`);
  }
}
process.exit(exitCode);
