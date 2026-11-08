// Claura Secure Shell: server side.
//
//   import { mount } from './server.mjs';
//   const ssh = mount(app, { env, log, ledger, ssh: { /* options below */ } });
//   await ssh.ready;               // CA, ledger and the four sshd targets are up
//   ssh.attach(httpServer);        // only if the app does not use app.listen() (which is patched automatically)
//   await ssh.stop();              // ends sessions, stops the sshd targets, wipes ephemeral keys
//
// Click a host -> a just-in-time, short-lived OpenSSH-certificate session in the browser:
//
//   POST /request  ->  [passkey step-up]  ->  [independent approver(s)]  ->  ssh-keygen -s signs an ed25519
//   user certificate (identity "<operator>|<requestId>", ONE principal chosen by policy, valid 1..15 minutes,
//   no forwarding, unique serial)  ->  WebSocket  <->  /usr/bin/ssh -tt  ->  a real sshd  ->  host shell.
//
// REAL: the SSH CA (user CA + host CA, /usr/bin/ssh-keygen), the certificates, four user-space OpenSSH sshd
//       servers on 127.0.0.1:2201-2204 that trust ONLY the user CA, the OpenSSH client with StrictHostKeyChecking=yes
//       against a known_hosts that holds one @cert-authority line, WebAuthn passkeys (@simplewebauthn), the
//       asciicast v2 recordings and the SHA-256 hash chains.
// SIMULATED: what runs behind the sshd ForceCommand is a Node program (hostshell/) that prints incident-consistent
//       output. The sshd, the certificate checks and the policy denials in front of it are real.
//
// Routes (base /api/ssh):
//   GET  /hosts                       hosts, their policy, the people directory, demo flags
//   POST /request                     {host, operator, reason, minutes}     (sets an HttpOnly request cookie)
//   GET  /request/:id                 status of one request (secret-free)
//   GET  /requests?scope=pending|all  the approvers' inbox
//   POST /request/:id/passkey/options    -> {mode: 'register'|'authenticate', options}
//   POST /request/:id/passkey/verify     {mode, response}
//   POST /request/:id/cancel
//   POST /approve  {requestId, approver}        approver != requester, must hold the approver role
//   POST /deny     {requestId, approver, reason}
//   POST /revoke   {requestId, by, reason}      kills the live session and lists the certificate on the KRL
//   WS   /session?requestId=req_...[&cols=&rows=]   the terminal (binary = keystrokes, text = JSON control)
//   GET  /sessions                    live and finished sessions
//   GET  /recording/:id               the asciicast v2 file (X-Claura-Recording-SHA256 header)
//   GET  /ledger[?limit=&kind=]       the hash-chained audit log;  GET /ledger/verify recomputes every chain
//   GET  /ui.js, /vendor/*            the browser module and its vendored dependencies (xterm.js, SimpleWebAuthn)

import express from 'express';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Krl, defaultCaDir, ensureCa } from './lib/ca.mjs';
import { HOSTS, INCIDENT_ID, MAX_MINUTES, PEOPLE, STATUSES, hostById, personById, policyFor, reasonHint } from './lib/hosts.mjs';
import { Ledger } from './lib/ledger.mjs';
import { Passkeys } from './lib/passkeys.mjs';
import { Requests } from './lib/requests.mjs';
import { SessionManager } from './lib/session.mjs';
import { Targets } from './lib/targets.mjs';
import { HttpError, REQ_ID_RE, cleanText, intInRange, isHostId, isOperator, isReqId, isSesId, makeLogger, route, sha256hex } from './lib/util.mjs';

export const VERSION = '0.1.0';
export const BASE = '/api/ssh';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_MAX_AGE_S = 30 * 60;
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? ''));

// Vendored browser dependencies, served from node_modules by an allowlist (no path is ever built from input).
const VENDOR = {
  'xterm.mjs': ['@xterm/xterm/lib/xterm.mjs', 'text/javascript; charset=utf-8'],
  'xterm.css': ['@xterm/xterm/css/xterm.css', 'text/css; charset=utf-8'],
  'addon-fit.mjs': ['@xterm/addon-fit/lib/addon-fit.mjs', 'text/javascript; charset=utf-8'],
  'webauthn.js': ['@simplewebauthn/browser/dist/bundle/index.umd.min.js', 'text/javascript; charset=utf-8'],
};
const vendorCache = new Map();
function vendorFile(name) {
  const hit = Object.hasOwn(VENDOR, name) ? VENDOR[name] : null;
  if (!hit) return null;
  if (vendorCache.has(name)) return vendorCache.get(name);
  let dir = HERE;
  for (let i = 0; i < 6; i++) {
    const f = path.join(dir, 'node_modules', hit[0]);
    if (fs.existsSync(f)) {
      const v = { body: fs.readFileSync(f), type: hit[1] };
      vendorCache.set(name, v);
      return v;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function cookieValue(header, name) {
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
const cookieName = (id) => `claura_ssh_${id}`;
const hostnameOf = (hostHeader) => {
  const h = String(hostHeader ?? '').toLowerCase();
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
};

export function mount(app, ctx = {}) {
  const opt = ctx.ssh ?? {};
  const base = String(opt.base ?? BASE).replace(/\/+$/, '');
  const env = ctx.env && typeof ctx.env === 'object' ? ctx.env : process.env;
  const log = makeLogger(ctx.log, 'ssh');
  const dataDir = opt.dataDir || env.CLAURA_SSH_DATA || path.join(os.homedir(), '.config', 'claura', 'ssh-data');
  const caDir = opt.caDir || env.CLAURA_SSH_CA_DIR || defaultCaDir(env);
  const portBase = intInRange(opt.portBase ?? env.CLAURA_SSH_PORT_BASE ?? 2201, 1024, 65000) ?? 2201;
  const hasIdentityHook = typeof opt.identity === 'function';
  const cfg = {
    skipPasskey: opt.skipPasskey === true || truthy(env.DEMO_SKIP_PASSKEY),
    externalIdentity: hasIdentityHook,
    testTtlSeconds: undefined, // in-process test hook (smoke only): shortens the next certificates
    sourceAddress: opt.sourceAddress === undefined ? '127.0.0.1/32' : opt.sourceAddress, // the gateway's address; null = unbound
    forcePipe: opt.forcePipe === true,
  };
  const demoApprovers = opt.demo === false ? null : (Array.isArray(opt.demo?.approvers) ? opt.demo.approvers : ['rk', 'al']);
  const openRecordings = opt.openRecordings === true;
  const corsOrigins = new Set([...(opt.corsOrigins ?? [])]);
  const originList = String(opt.origins ?? env.CLAURA_SSH_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowedOrigins = new Set([...originList, ...corsOrigins]);
  const hostnameOfOrigin = (o) => { try { return new URL(o).hostname; } catch { return ''; } };
  // DNS-rebinding guard: only these Host headers are served (a page on evil.example resolving to 127.0.0.1 is not)
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...[...allowedOrigins].map(hostnameOfOrigin).filter(Boolean)]);
  for (const h of (opt.hosts ?? [])) allowedHosts.add(String(h).toLowerCase());
  const statusOverride = new Map();

  if (cfg.skipPasskey) log.warn('DEMO_SKIP_PASSKEY is set: passkey step-up is SKIPPED (smoke tests only). Every skip is written to the ledger.');

  // ---------------------------------------------------------------- state (filled by `ready`)
  const S = { ca: null, targets: null, ledger: null, passkeys: null, krl: null, requests: null, sessions: null, runDir: null };
  let lastSerial = 0;
  const nextSerial = async () => {
    const now = Date.now();
    lastSerial = now > lastSerial ? now : lastSerial + 1; // unique and increasing, also across restarts
    return lastSerial;
  };
  const hostStatus = async (id) => {
    if (typeof ctx.hostStatus === 'function') {
      const v = await ctx.hostStatus(id);
      if (STATUSES.includes(v)) return v;
    }
    return statusOverride.get(id) ?? hostById(id)?.baseStatus ?? 'healthy';
  };

  const ready = (async () => {
    await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
    await fsp.chmod(dataDir, 0o700);
    S.runDir = path.join(dataDir, 'run');
    await fsp.mkdir(S.runDir, { recursive: true, mode: 0o700 });
    await fsp.chmod(S.runDir, 0o700);
    await fsp.rm(path.join(S.runDir, 'sess'), { recursive: true, force: true }); // ephemeral keys never outlive a process
    S.ca = await ensureCa(caDir);
    S.ledger = new Ledger({ file: path.join(dataDir, 'ledger.jsonl'), sink: typeof ctx.ledger?.append === 'function' ? ctx.ledger : null, log });
    await S.ledger.init();
    S.krl = new Krl({ file: path.join(S.runDir, 'revoked.krl'), ca: S.ca });
    await S.krl.init();
    S.passkeys = new Passkeys({
      file: path.join(dataDir, 'passkeys.json'),
      attachment: opt.attachment ?? env.CLAURA_SSH_PASSKEY_ATTACHMENT ?? 'platform',
      log,
    });
    await S.passkeys.init();
    const t0 = Number(ctx.t0 ?? opt.t0) > 0 ? Number(ctx.t0 ?? opt.t0) : Date.now() - 12 * 60_000;
    S.targets = new Targets({ ca: S.ca, runDir: S.runDir, krlFile: S.krl.file, portBase, t0, log });
    await S.targets.start();
    S.requests = new Requests({ cfg, ca: S.ca, krl: S.krl, targets: S.targets, ledger: S.ledger, log, runDir: S.runDir, nextSerial, hostStatus });
    S.sessions = new SessionManager({ cfg, requests: S.requests, targets: S.targets, ledger: S.ledger, log, dataDir });
    await S.sessions.init();
    const up = HOSTS.filter((h) => S.targets.status(h.id).up).length;
    await S.ledger.append({
      kind: 'ssh.boot', actor: 'claura', text: `Secure Shell gateway started: ${up}/${HOSTS.length} targets up, user CA ${S.ca.user.fingerprint}, host CA ${S.ca.host.fingerprint}`,
      data: { version: VERSION, userCa: S.ca.user.fingerprint, hostCa: S.ca.host.fingerprint, targetsUp: up, skipPasskey: cfg.skipPasskey },
    });
    log.info(`ready: ${up}/${HOSTS.length} targets, base ${base}${cfg.skipPasskey ? ', PASSKEY STEP-UP SKIPPED' : ''}`);
  })();
  ready.catch((err) => log.error(`failed to start: ${err.stack || err.message}`));

  // ---------------------------------------------------------------- guards
  const hostOk = (req) => allowedHosts.has(hostnameOf(req.headers.host));
  const originOk = (req) => {
    const o = req.headers.origin;
    if (!o) return true; // not a browser: the request secret is still required wherever it matters
    if (allowedOrigins.has(o)) return true;
    const h = req.headers.host;
    return !!h && (o === `http://${h}` || o === `https://${h}`);
  };
  const originFor = (req) => {
    const o = req.headers.origin;
    if (!o || !originOk(req)) throw new HttpError(400, 'a browser Origin header is required for passkeys');
    return o;
  };
  const rpIdFor = (origin) => {
    const host = new URL(origin).hostname;
    if (opt.rpID && opt.rpID !== host) throw new HttpError(400, `passkeys are bound to ${opt.rpID}; open the console there`);
    return opt.rpID || host;
  };

  const secretOf = (req, id) => {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return cookieValue(req.headers.cookie, cookieName(id));
  };
  const holdsSecret = (req, r) => S.requests.hasSecret(r, secretOf(req, r.id));
  const mustHold = (req, r) => {
    if (!holdsSecret(req, r)) throw new HttpError(403, 'this request belongs to someone else');
  };
  const getRequest = (id) => {
    if (!isReqId(id)) throw new HttpError(404, 'unknown request');
    const r = S.requests.get(id);
    if (!r) throw new HttpError(404, 'unknown request');
    return r;
  };

  /** Who is acting? The identity hook (console session: SSO + passkey) wins; the demo directory is only a fallback. */
  async function actorOf(req, claimed) {
    if (hasIdentityHook) {
      const who = await opt.identity(req);
      if (!who) throw new HttpError(401, 'not signed in');
      const id = String(who.id ?? '').toLowerCase();
      if (!isOperator(id)) throw new HttpError(403, 'invalid identity');
      return { id, roles: Array.isArray(who.roles) ? who.roles.map(String) : [], source: 'identity' };
    }
    if (typeof claimed !== 'string' || !isOperator(claimed)) throw new HttpError(400, 'invalid person');
    const p = personById(claimed);
    if (!p) throw new HttpError(403, 'unknown person');
    return { id: p.id, roles: p.roles, source: 'demo-directory' };
  }

  // ---------------------------------------------------------------- router
  const router = express.Router();

  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    if (!hostOk(req)) return res.status(421).json({ ok: false, error: 'unexpected Host header' });
    const o = req.headers.origin;
    if (o && corsOrigins.has(o)) {
      res.set({ 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });
      if (req.method === 'OPTIONS') {
        res.set({ 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' });
        return res.status(204).end();
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (!originOk(req)) return res.status(403).json({ ok: false, error: 'cross-origin request refused' });
      if (!req.is('application/json')) return res.status(415).json({ ok: false, error: 'application/json required' });
    }
    next();
  });

  // static: the module and its vendored dependencies (no gateway state needed)
  router.get('/ui.js', (_req, res) => {
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }).send(fs.readFileSync(path.join(HERE, 'ui.js')));
  });
  router.get('/vendor/:name', (req, res) => {
    const v = vendorFile(req.params.name);
    if (!v) return res.status(404).json({ ok: false, error: 'not found' });
    res.set({ 'Content-Type': v.type, 'Cache-Control': 'public, max-age=3600' }).send(v.body);
  });

  // with a console identity hook, nothing below is reachable without a signed-in person
  if (hasIdentityHook) {
    router.use(async (req, res, next) => {
      try {
        if (!(await opt.identity(req))) return res.status(401).json({ ok: false, error: 'not signed in' });
        next();
      } catch (err) {
        next(err);
      }
    });
  }

  router.use(async (_req, res, next) => {
    try {
      await ready;
      next();
    } catch (err) {
      res.status(503).json({ ok: false, error: `secure shell failed to start: ${err.message}` });
    }
  });
  router.use(express.json({ limit: '64kb', strict: true }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true, version: VERSION, up: HOSTS.filter((h) => S.targets.status(h.id).up).length, hosts: HOSTS.length });
  });

  router.get('/hosts', route(async (_req, res) => {
    const hosts = [];
    for (const h of HOSTS) {
      const status = await hostStatus(h.id);
      const t = S.targets.status(h.id);
      hosts.push({
        id: h.id, label: h.label, where: h.where, role: h.role, note: h.note, status, up: t.up, error: t.up ? null : t.error,
        reasonHint: reasonHint(h), policy: policyFor(h, status),
      });
    }
    res.json({
      ok: true, version: VERSION, serverNow: Date.now(), incident: INCIDENT_ID, maxMinutes: MAX_MINUTES, hosts,
      people: PEOPLE.map((p) => ({ ...p, passkeys: S.passkeys.count(p.id) })),
      demo: demoApprovers ? { approvers: demoApprovers } : null,
      skipPasskey: cfg.skipPasskey,
      ca: { user: S.ca.user.fingerprint, host: S.ca.host.fingerprint },
    });
  }));

  router.post('/request', route(async (req, res) => {
    const b = req.body ?? {};
    if (!isHostId(b.host)) throw new HttpError(400, 'invalid host');
    const actor = await actorOf(req, b.operator);
    const { req: r, secret } = await S.requests.create({ host: b.host, operator: actor.id, reason: b.reason, minutes: b.minutes });
    res.cookie(cookieName(r.id), secret, { httpOnly: true, sameSite: 'strict', path: base, maxAge: COOKIE_MAX_AGE_S * 1000, secure: req.secure });
    res.status(201).json({ ok: true, request: S.requests.view(r), serverNow: Date.now() });
  }));

  router.get('/request/:id', route(async (req, res) => {
    const r = getRequest(req.params.id);
    res.json({ ok: true, request: S.requests.view(r), mine: holdsSecret(req, r), serverNow: Date.now() });
  }));

  router.get('/requests', route(async (req, res) => {
    const scope = req.query.scope === 'all' ? 'all' : 'pending';
    let rows = S.requests.list();
    if (scope === 'pending') rows = rows.filter((r) => !r.terminal && !r.cert);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ ok: true, requests: rows.slice(0, 50).map((r) => S.requests.view(r)), serverNow: Date.now() });
  }));

  // -- passkeys (WebAuthn): the requester proves presence AND user verification, with a challenge bound to this request
  router.post('/request/:id/passkey/options', route(async (req, res) => {
    const r = getRequest(req.params.id);
    mustHold(req, r);
    if (r.terminal) throw new HttpError(409, `request is ${r.terminal}`);
    if (!r.stepUp.required) throw new HttpError(409, 'this request does not need a passkey');
    if (r.stepUp.done) throw new HttpError(409, 'passkey already confirmed');
    const origin = originFor(req);
    const rpID = rpIdFor(origin);
    if (S.passkeys.count(r.operator) === 0) {
      // first use: enrol a passkey for this person (demo only; production enrols through admin onboarding)
      const p = personById(r.operator);
      const options = await S.passkeys.regOptions({ operator: r.operator, displayName: p ? `${p.name} · ${p.title}` : r.operator, rpID });
      return res.json({ ok: true, mode: 'register', options });
    }
    const options = await S.passkeys.authOptions({ requestId: r.id, operator: r.operator, rpID });
    res.json({ ok: true, mode: 'authenticate', options });
  }));

  router.post('/request/:id/passkey/verify', route(async (req, res) => {
    const r = getRequest(req.params.id);
    mustHold(req, r);
    if (r.terminal) throw new HttpError(409, `request is ${r.terminal}`);
    if (!r.stepUp.required || r.stepUp.done) throw new HttpError(409, 'no passkey is pending for this request');
    const origin = originFor(req);
    const rpID = rpIdFor(origin);
    const { mode, response } = req.body ?? {};
    if (!response || typeof response !== 'object') throw new HttpError(400, 'missing WebAuthn response');
    let result;
    if (mode === 'register') {
      if (S.passkeys.count(r.operator) !== 0) throw new HttpError(409, 'a passkey is already enrolled; authenticate with it');
      result = await S.passkeys.regVerify({ operator: r.operator, response, origin, rpID });
      if (result.verified) await S.requests.stepUpDone(r, { method: 'webauthn (enrolled + user verified)', credentialId: result.credentialId });
    } else if (mode === 'authenticate') {
      result = await S.passkeys.authVerify({ requestId: r.id, operator: r.operator, response, origin, rpID });
      if (result.verified) await S.requests.stepUpDone(r, { method: 'webauthn (user verified)', credentialId: result.credentialId });
    } else {
      throw new HttpError(400, 'mode must be register or authenticate');
    }
    if (!result.verified) {
      await S.ledger.append({ kind: 'ssh.stepup.failed', actor: r.operator, host: r.host, requestId: r.id, text: `passkey check failed for ${r.id}: ${cleanText(result.error, 120)}`, data: { mode } });
      throw new HttpError(401, `passkey not accepted: ${cleanText(result.error, 160)}`);
    }
    res.json({ ok: true, request: S.requests.view(r), serverNow: Date.now() });
  }));

  router.post('/request/:id/cancel', route(async (req, res) => {
    const r = getRequest(req.params.id);
    mustHold(req, r);
    await S.requests.cancel(r);
    await S.sessions.endByRequest(r.id, 'cancelled');
    res.json({ ok: true, request: S.requests.view(r) });
  }));

  // -- decisions
  router.post('/approve', route(async (req, res) => {
    const b = req.body ?? {};
    if (!isReqId(b.requestId)) throw new HttpError(400, 'invalid request id');
    const actor = await actorOf(req, b.approver);
    const r = await S.requests.approve(b.requestId, actor);
    res.json({ ok: true, request: S.requests.view(r), serverNow: Date.now() });
  }));

  router.post('/deny', route(async (req, res) => {
    const b = req.body ?? {};
    if (!isReqId(b.requestId)) throw new HttpError(400, 'invalid request id');
    const actor = await actorOf(req, b.approver);
    const r = await S.requests.deny(b.requestId, actor, b.reason);
    res.json({ ok: true, request: S.requests.view(r) });
  }));

  router.post('/revoke', route(async (req, res) => {
    const b = req.body ?? {};
    const r = getRequest(b.requestId);
    const actor = await actorOf(req, b.by);
    if (!actor.roles.includes('commander') && !(actor.id === r.operator && holdsSecret(req, r))) throw new HttpError(403, 'only the incident commander (or the requester) can revoke');
    await S.requests.revoke(r, actor.id, b.reason);
    await S.sessions.endByRequest(r.id, 'revoked');
    res.json({ ok: true, request: S.requests.view(r) });
  }));

  // -- sessions, recordings, audit
  router.get('/sessions', route(async (_req, res) => {
    res.json({ ok: true, live: S.sessions.listLive(), finished: S.sessions.listFinished().slice(-50).reverse(), serverNow: Date.now() });
  }));

  router.get('/recording/:id', route(async (req, res) => {
    const id = req.params.id;
    if (!isSesId(id)) throw new HttpError(404, 'no such recording');
    const sum = S.sessions.finished.get(id) ?? S.sessions.listFinished().find((s) => s.sessionId === id);
    if (!sum) throw new HttpError(404, 'no such recording');
    const owner = S.requests.get(sum.requestId);
    let allowed = openRecordings || (owner && holdsSecret(req, owner));
    if (!allowed && hasIdentityHook) {
      const who = await opt.identity(req);
      allowed = !!who && Array.isArray(who.roles) && who.roles.some((x) => x === 'approver' || x === 'commander' || x === 'auditor');
    }
    if (!allowed) throw new HttpError(403, 'recordings are available to the requester, approvers and auditors');
    const dir = await fsp.realpath(S.sessions.dir);
    let real;
    try {
      real = await fsp.realpath(S.sessions.recordingPath(id)); // dir + validated id + ".cast"; still checked, in case of a planted symlink
    } catch {
      throw new HttpError(404, 'recording file is missing');
    }
    if (path.dirname(real) !== dir) throw new HttpError(404, 'no such recording');
    const buf = await fsp.readFile(real);
    const sha = sha256hex(buf);
    res.set({
      'Content-Type': 'application/x-asciicast; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}.cast"`,
      'X-Claura-Recording-SHA256': sha,
      'X-Claura-Recording-Check': sha === sum.recording.sha256 ? 'matches the ledger' : 'DOES NOT MATCH THE LEDGER',
      'Access-Control-Expose-Headers': 'X-Claura-Recording-SHA256, X-Claura-Recording-Check',
    });
    res.send(buf);
  }));

  router.get('/ledger', route(async (req, res) => {
    const limit = intInRange(req.query.limit ?? 100, 1, 500);
    if (limit === null) throw new HttpError(400, 'limit must be 1..500');
    const kind = typeof req.query.kind === 'string' && /^[a-z][a-z.]{2,40}$/.test(req.query.kind) ? req.query.kind : undefined;
    const requestId = isReqId(req.query.requestId) ? req.query.requestId : undefined;
    res.json({ ok: true, entries: S.ledger.list({ limit, kind, requestId }), head: S.ledger.head(), verify: S.ledger.verify() });
  }));

  // Recompute from DISK, not from memory: someone editing the file under a running gateway is exactly what this must catch.
  router.get('/ledger/verify', route(async (_req, res) => {
    await S.ledger.queue.catch(() => {}); // let pending appends reach the file first
    const mem = S.ledger.verify();
    let disk;
    try {
      disk = Ledger.verifyFile(S.ledger.file);
    } catch (err) {
      disk = { ok: false, count: 0, brokenAt: 0, head: '', error: err.message };
    }
    res.json({
      ok: true,
      ledger: { ...disk, ok: disk.ok && mem.ok, source: 'disk', memory: { ok: mem.ok, count: mem.count } },
      recordings: await S.sessions.verifyRecordings(),
    });
  }));

  router.use((req, res) => res.status(404).json({ ok: false, error: 'not found' }));
  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (res.headersSent) return;
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large' || err?.status === 400) return res.status(err.status || 400).json({ ok: false, error: 'invalid JSON body' });
    log.error(`unhandled: ${err?.stack || err}`);
    res.status(500).json({ ok: false, error: 'internal error' });
  });

  app.use(base, router);

  // ---------------------------------------------------------------- WebSocket: /session
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false });
  const attached = new Set();

  function reject(socket, code, text) {
    try {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } catch { /* socket already gone */ }
    socket.destroy();
  }

  function onUpgrade(req, socket, head) {
    let u;
    try {
      u = new URL(req.url, 'http://placeholder');
    } catch {
      return;
    }
    if (u.pathname !== `${base}/session`) return; // not ours: leave it to whoever else listens (HMR, other modules)
    if (!hostOk(req)) return reject(socket, 421, 'Misdirected Request');
    if (!originOk(req)) return reject(socket, 403, 'Forbidden'); // cross-site WebSocket hijacking
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleSocket(ws, req, u).catch((err) => {
        log.error(`session socket: ${err.stack || err.message}`);
        try { ws.send(JSON.stringify({ type: 'error', error: 'internal error' })); ws.close(1011, 'internal error'); } catch { /* closed */ }
      });
    });
  }

  async function handleSocket(ws, req, u) {
    const fail = (code, error) => {
      try {
        ws.send(JSON.stringify({ type: 'error', code, error }));
        ws.close(code, error.slice(0, 100));
      } catch { /* closed */ }
    };
    try {
      await ready;
    } catch {
      return fail(4503, 'secure shell is not available');
    }
    const requestId = u.searchParams.get('requestId');
    if (!REQ_ID_RE.test(requestId ?? '')) return fail(4400, 'invalid request id');
    const r = S.requests.get(requestId);
    if (!r || !holdsSecret(req, r)) return fail(4401, 'not your request');
    if (hasIdentityHook) {
      const who = await Promise.resolve(opt.identity(req)).catch(() => null);
      if (!who || String(who.id ?? '').toLowerCase() !== r.operator) return fail(4401, 'not your request');
    }
    if (r.terminal) return fail(4409, `request is ${r.terminal}`);
    if (!r.cert) return fail(4412, 'not approved yet');
    if (r.sessionId) return fail(4409, 'this approval has already been used for a session');
    if (Date.now() >= r.cert.validBeforeMs) return fail(4410, 'certificate expired');
    const cols = intInRange(u.searchParams.get('cols') ?? 100, 20, 500) ?? 100;
    const rows = intInRange(u.searchParams.get('rows') ?? 30, 5, 200) ?? 30;
    try {
      await S.sessions.open({ ws, req: r, cols, rows });
    } catch (err) {
      log.error(`could not open session for ${r.id}: ${err.message}`);
      fail(4500, 'could not start the SSH client');
    }
  }

  function attach(server) {
    if (!server || typeof server.on !== 'function' || attached.has(server)) return handle;
    attached.add(server);
    server.on('upgrade', onUpgrade);
    return handle;
  }

  // app.listen() creates the server inside Express: catch it so the WebSocket route works with no extra wiring
  if (typeof app.listen === 'function' && !app.listen.__claura_ssh) {
    const orig = app.listen;
    const wrapped = function listen(...args) {
      const server = orig.apply(this, args);
      attach(server);
      return server;
    };
    wrapped.__claura_ssh = true;
    app.listen = wrapped;
  }
  if (ctx.server) attach(ctx.server);

  // ---------------------------------------------------------------- lifecycle
  const onExit = () => {
    try { S.sessions?.killAllSync(); } catch { /* exiting */ }
    try { S.targets?.stopSync(); } catch { /* exiting */ }
  };
  process.once('exit', onExit);

  let stopped = null;
  async function stop() {
    if (stopped) return stopped;
    stopped = (async () => {
      try { await ready; } catch { /* nothing started */ }
      for (const s of attached) s.off('upgrade', onUpgrade);
      attached.clear();
      try { S.requests?.stop(); } catch { /* ok */ }
      try { await S.sessions?.closeAll('server-shutdown'); } catch { /* ok */ }
      for (const c of wss.clients) { try { c.terminate(); } catch { /* ok */ } }
      wss.close();
      try { await S.targets?.stop(); } catch { /* ok */ }
      if (S.runDir) await fsp.rm(path.join(S.runDir, 'sess'), { recursive: true, force: true }).catch(() => {});
      try { await S.ledger?.queue; } catch { /* ok */ }
      process.off('exit', onExit);
      log.info('stopped');
    })();
    return stopped;
  }

  /** Server-side only (policy input): the console tells us a host became suspect / quarantined / healthy. */
  async function setHostStatus(hostId, status) {
    await ready;
    if (!hostById(hostId) || !STATUSES.includes(status)) throw new Error('unknown host or status');
    statusOverride.set(hostId, status);
    await S.targets.setState(hostId, status);
    await S.ledger.append({ kind: 'ssh.host.status', actor: 'claura', host: hostId, text: `${hostId} is now ${status}: new requests follow the ${policyFor(hostById(hostId), status).class} policy`, data: { status } });
  }

  const handle = {
    name: 'ssh',
    version: VERSION,
    base,
    cfg,
    ready,
    attach,
    stop,
    setHostStatus,
    get ca() { return S.ca; },
    get targets() { return S.targets; },
    get ledger() { return S.ledger; },
    get requests() { return S.requests; },
    get sessions() { return S.sessions; },
    get krl() { return S.krl; },
    get passkeys() { return S.passkeys; },
    get runDir() { return S.runDir; },
    get dataDir() { return dataDir; },
    close: stop,
  };
  return handle;
}

export default mount;
