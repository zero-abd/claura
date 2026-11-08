// Live sessions: the WebSocket <-> /usr/bin/ssh bridge, the recording, and the end-of-session ledger entry.
//
// The browser never sees a key, a certificate or a host address. It talks to this gateway over a
// WebSocket; the gateway runs the real OpenSSH client (`ssh -tt`) with the ephemeral certificate,
// StrictHostKeyChecking=yes and a known_hosts that contains one line: @cert-authority for the host CA.
import { spawn as spawnChild } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { SSH } from './ca.mjs';
import { hostById } from './hosts.mjs';
import { newId } from './util.mjs';

const WS_OPEN = 1;
const iso = (ms) => new Date(ms).toISOString();
const CHILD_ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: os.homedir(), TERM: 'xterm-256color', LANG: 'en_US.UTF-8' };

// ------------------------------------------------------------------------------------ transport
let ptyModule; // undefined: not tried yet, null: unavailable
async function loadPty(log) {
  if (ptyModule !== undefined) return ptyModule;
  try {
    const require = createRequire(import.meta.url);
    const dir = path.dirname(require.resolve('node-pty/package.json'));
    // npm drops the executable bit on the prebuilt helper; node-pty then fails with posix_spawnp.
    for (const sub of [`prebuilds/${process.platform}-${process.arch}/spawn-helper`, 'build/Release/spawn-helper']) {
      const f = path.join(dir, sub);
      try {
        if (fs.existsSync(f)) fs.chmodSync(f, 0o755);
      } catch {
        /* read-only install: nothing to do */
      }
    }
    ptyModule = require('node-pty');
  } catch (err) {
    log.warn(`node-pty is not available (${err.message}); using the pipe transport (fixed 80x24 remote terminal)`);
    ptyModule = null;
  }
  return ptyModule;
}

/** Start the OpenSSH client on a pseudo-terminal (node-pty), or on pipes if node-pty is missing. */
export async function spawnSsh(argv, { cols, rows, forcePipe, log }) {
  const pty = forcePipe ? null : await loadPty(log);
  if (pty) {
    try {
      const p = pty.spawn(SSH, argv, { name: 'xterm-256color', cols, rows, cwd: '/', env: CHILD_ENV });
      return {
        kind: 'pty',
        pid: p.pid,
        write: (s) => p.write(s),
        resize: (c, r) => { try { p.resize(c, r); } catch { /* exited */ } },
        kill: (sig = 'SIGTERM') => { try { p.kill(sig); } catch { /* exited */ } },
        onData: (cb) => p.onData(cb),
        onExit: (cb) => p.onExit(({ exitCode, signal }) => cb(exitCode, signal)),
      };
    } catch (err) {
      log.warn(`pty spawn failed (${err.message}); falling back to pipes`);
    }
  }
  const child = spawnChild(SSH, argv, { env: CHILD_ENV, cwd: '/', stdio: ['pipe', 'pipe', 'pipe'] });
  const dec = [new StringDecoder('utf8'), new StringDecoder('utf8')];
  let exited = false;
  return {
    kind: 'pipe',
    pid: child.pid,
    write: (s) => { if (!exited) child.stdin.write(s); },
    resize: () => {},
    kill: (sig = 'SIGTERM') => { try { child.kill(sig); } catch { /* exited */ } },
    onData: (cb) => {
      child.stdout.on('data', (b) => cb(dec[0].write(b)));
      child.stderr.on('data', (b) => cb(dec[1].write(b).replace(/\n/g, '\r\n')));
    },
    onExit: (cb) => child.once('exit', (code, sig) => { exited = true; cb(code ?? 255, sig); }),
  };
}

export function sshArgs({ files, hostId, port, user }) {
  return [
    '-F', '/dev/null', '-tt',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${files.knownHosts}`,
    '-o', 'GlobalKnownHostsFile=/dev/null',
    '-o', `HostKeyAlias=${hostId}`,
    '-o', 'HostKeyAlgorithms=ssh-ed25519-cert-v01@openssh.com',
    '-o', 'VerifyHostKeyDNS=no',
    '-o', 'UpdateHostKeys=no',
    '-o', 'IdentitiesOnly=yes',
    '-o', `IdentityFile=${files.key}`,
    '-o', `CertificateFile=${files.certPath}`,
    '-o', 'IdentityAgent=none',
    '-o', 'PreferredAuthentications=publickey',
    '-o', 'PubkeyAuthentication=yes',
    '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no',
    '-o', 'GSSAPIAuthentication=no',
    '-o', 'NumberOfPasswordPrompts=0',
    '-o', 'ForwardAgent=no',
    '-o', 'ForwardX11=no',
    '-o', 'ClearAllForwardings=yes',
    '-o', 'PermitLocalCommand=no',
    '-o', 'ControlMaster=no',
    '-o', 'ControlPath=none',
    '-o', 'EscapeChar=none', // no "~." / "~C" escapes: a user must not be able to add forwards from inside the session
    '-o', 'ConnectTimeout=6',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'LogLevel=ERROR',
    '-p', String(port),
    '-l', user,
    '127.0.0.1',
  ];
}

// ------------------------------------------------------------------------------------ recording
/** asciicast v2: https://docs.asciinema.org/manual/asciicast/v2/ (plays in asciinema-player). */
class Recorder {
  constructor(file, header) {
    this.file = file;
    this.fd = fs.openSync(file, 'w', 0o600);
    this.t0 = process.hrtime.bigint();
    this.events = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    fs.writeSync(this.fd, `${JSON.stringify(header)}\n`);
  }
  event(type, data) {
    if (this.fd === null) return;
    const t = Number(process.hrtime.bigint() - this.t0) / 1e9;
    fs.writeSync(this.fd, `${JSON.stringify([Number(t.toFixed(6)), type, data])}\n`);
    this.events++;
    if (type === 'i') this.bytesIn += Buffer.byteLength(data);
    if (type === 'o') this.bytesOut += Buffer.byteLength(data);
  }
  close() {
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
    const buf = fs.readFileSync(this.file);
    return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), events: this.events, bytesIn: this.bytesIn, bytesOut: this.bytesOut };
  }
}

// ------------------------------------------------------------------------------------ manager
export class SessionManager {
  constructor({ cfg, requests, targets, ledger, log, dataDir }) {
    Object.assign(this, { cfg, requests, targets, ledger, log });
    this.dir = path.join(dataDir, 'recordings');
    this.live = new Map(); // sessionId -> state
    this.finished = new Map(); // sessionId -> summary (this process)
    this.user = os.userInfo().username;
  }

  async init() {
    await fsp.mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  recordingPath(id) {
    return path.join(this.dir, `${id}.cast`);
  }

  liveFor(requestId) {
    for (const s of this.live.values()) if (s.requestId === requestId) return s;
    return null;
  }

  /** Summaries of finished sessions, newest last: from the ledger so they survive restarts. */
  listFinished() {
    return this.ledger.list({ kind: 'ssh.session.closed', limit: 500 }).map((e) => ({ ...e.data, ledger: { seq: e.seq, hash: e.hash, prev: e.prev } }));
  }

  listLive() {
    return [...this.live.values()].map((s) => this.#liveView(s));
  }

  #liveView(s) {
    return {
      sessionId: s.id, requestId: s.requestId, host: s.req.host, operator: s.req.operator, principal: s.req.cert.principal,
      certSerial: s.req.cert.serial, startedAt: s.startedAt, expiresAt: s.req.cert.validBeforeMs, status: 'live', transport: s.tr.kind,
    };
  }

  /**
   * Bridge an accepted WebSocket to ssh. The caller has already checked origin, request secret and
   * that the request is approved with a certificate that has not expired.
   */
  async open({ ws, req, cols, rows }) {
    const host = hostById(req.host);
    const port = this.targets.portOf(host.id);
    const id = newId('ses');
    const startedAt = Date.now();
    req.sessionId = id; // mark first: one session per approval, no second connection can race in
    const cert = req.cert;
    const rec = new Recorder(this.recordingPath(id), {
      version: 2, width: cols, height: rows, timestamp: Math.floor(startedAt / 1000),
      env: { SHELL: '/usr/local/bin/claura-shell', TERM: 'xterm-256color' },
      title: `${host.id} · ${cert.principal} · ${cert.keyId}`,
      claura: { sessionId: id, requestId: req.id, host: host.id, principal: cert.principal, certSerial: cert.serial, certId: cert.keyId, operator: req.operator, reason: req.reason, readOnly: req.policy.readOnly },
    });
    const state = { id, requestId: req.id, req, ws, rec, startedAt, timers: [], ending: null, tr: null };
    this.live.set(id, state);

    let tr;
    try {
      tr = await spawnSsh(sshArgs({ files: req.files, hostId: host.id, port, user: this.user }), { cols, rows, forcePipe: this.cfg.forcePipe, log: this.log });
    } catch (err) {
      this.log.error(`could not start ssh for ${req.id}: ${err.message}`);
      state.tr = { kind: 'none', kill() {} };
      await this.end(id, 'error');
      throw err;
    }
    state.tr = tr;

    await this.ledger.append({
      kind: 'ssh.session.opened', actor: req.operator, host: host.id, requestId: req.id, sessionId: id,
      text: `${req.operator.toUpperCase()} opened ${cert.principal} on ${host.id} (cert serial ${cert.serial}, expires ${iso(cert.validBeforeMs)}, recording on)`,
      data: { certSerial: cert.serial, certId: cert.keyId, principal: cert.principal, transport: tr.kind, readOnly: req.policy.readOnly },
    });

    const send = (obj) => { if (ws.readyState === WS_OPEN) ws.send(JSON.stringify(obj)); };
    state.send = send;
    send({
      type: 'ready', sessionId: id, requestId: req.id, host: host.id, where: host.where, principal: cert.principal, mode: req.policy.mode, readOnly: req.policy.readOnly,
      certSerial: cert.serial, certId: cert.keyId, expiresAt: cert.validBeforeMs, serverNow: Date.now(), transport: tr.kind, operator: req.operator,
    });

    tr.onData((data) => {
      rec.event('o', data);
      if (ws.readyState === WS_OPEN) ws.send(Buffer.from(data, 'utf8'), { binary: true });
    });
    tr.onExit((code, signal) => {
      state.exit = { code, signal };
      this.end(id, state.endReason ?? (code === 0 ? 'exit' : code === 255 ? 'ssh-failed' : 'exit')).catch((e) => this.log.error(`end: ${e.message}`));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const s = Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
        if (s.length > 65_536) return;
        rec.event('i', s);
        tr.write(s);
        return;
      }
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (msg.type === 'resize') {
        const c = Math.min(500, Math.max(20, Number(msg.cols) | 0));
        const r = Math.min(200, Math.max(5, Number(msg.rows) | 0));
        tr.resize(c, r);
        rec.event('r', `${c}x${r}`);
      } else if (msg.type === 'end') {
        this.end(id, 'user-ended').catch(() => {});
      } else if (msg.type === 'ping') {
        send({ type: 'pong', t: msg.t ?? null });
      }
    });
    ws.on('close', () => { this.end(id, 'client-closed').catch(() => {}); });
    ws.on('error', () => { this.end(id, 'client-closed').catch(() => {}); });

    // The certificate is the lease: when it runs out, so does the session.
    const left = cert.validBeforeMs - Date.now();
    state.timers.push(setTimeout(() => this.end(id, 'cert-expired').catch(() => {}), Math.max(0, left)));
    if (left > 61_000) state.timers.push(setTimeout(() => send({ type: 'warn', code: 'expiring', secondsLeft: 60 }), left - 60_000));
    state.timers.push(setInterval(() => { if (ws.readyState === WS_OPEN) ws.ping(); }, 15_000));
    return state;
  }

  /** End a live session (idempotent). Resolves to its summary. */
  end(id, reason) {
    const s = this.live.get(id);
    if (!s) return Promise.resolve(this.finished.get(id) ?? null);
    if (s.ending) return s.ending;
    s.endReason = reason;
    s.ending = this.#finalize(s, reason);
    return s.ending;
  }

  endByRequest(requestId, reason) {
    const s = this.liveFor(requestId);
    return s ? this.end(s.id, reason) : Promise.resolve(null);
  }

  async #finalize(s, reason) {
    for (const t of s.timers) { clearTimeout(t); clearInterval(t); }
    const alive = !s.exit;
    if (alive) {
      s.tr.kill('SIGTERM');
      const exited = new Promise((r) => { const iv = setInterval(() => { if (s.exit) { clearInterval(iv); r(); } }, 25); iv.unref(); });
      await Promise.race([exited, new Promise((r) => setTimeout(r, 1500))]);
      if (!s.exit) s.tr.kill('SIGKILL');
    }
    const recInfo = s.rec.close();
    const endedAt = Date.now();
    const req = s.req;
    const cert = req.cert;
    const audit = await this.targets.auditFor(req.host, cert.serial);
    const cmds = audit.filter((r) => r.cmd && !r.cmd.startsWith('('));
    const summary = {
      sessionId: s.id, requestId: req.id, host: req.host, operator: req.operator, principal: cert.principal, readOnly: req.policy.readOnly,
      certSerial: cert.serial, certId: cert.keyId, startedAt: s.startedAt, endedAt, durationMs: endedAt - s.startedAt, reason,
      transport: s.tr.kind, exitCode: s.exit?.code ?? null,
      recording: { file: `${s.id}.cast`, bytes: recInfo.bytes, sha256: recInfo.sha256, events: recInfo.events },
      bytesIn: recInfo.bytesIn, bytesOut: recInfo.bytesOut,
      commands: { total: cmds.length, denied: cmds.filter((r) => r.verdict === 'denied').length },
    };
    const entry = await this.ledger.append({
      kind: 'ssh.session.closed', actor: req.operator, host: req.host, requestId: req.id, sessionId: s.id,
      text: `${req.operator.toUpperCase()} closed ${cert.principal} on ${req.host} (${reason}); recording sha256 ${recInfo.sha256.slice(0, 16)}…; ${summary.commands.total} commands, ${summary.commands.denied} denied by policy`,
      data: summary,
    });
    summary.ledger = { seq: entry.seq, hash: entry.hash, prev: entry.prev };
    this.live.delete(s.id);
    this.finished.set(s.id, summary);
    await this.requests.sessionEnded(req, reason);
    if (s.ws.readyState === WS_OPEN) {
      s.ws.send(JSON.stringify({ type: 'closed', reason, summary }));
      setTimeout(() => { try { s.ws.close(1000, reason); } catch { /* closed */ } }, 50);
    }
    return summary;
  }

  async closeAll(reason = 'server-shutdown') {
    await Promise.all([...this.live.keys()].map((id) => this.end(id, reason).catch(() => {})));
  }

  killAllSync() {
    for (const s of this.live.values()) {
      try { s.tr.kill('SIGKILL'); } catch { /* gone */ }
    }
  }
}
