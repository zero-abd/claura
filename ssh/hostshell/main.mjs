#!/usr/bin/env node
// ForceCommand target for the demo sshd instances: the "host shell" simulator.
//
//   node main.mjs <hostId> <incidentT0Ms> <stateDir>
//
// sshd has already verified the user certificate against the user CA and the host's
// AuthorizedPrincipalsFile before this runs. We still read the certificate that sshd exposes through
// ExposeAuthInfo (SSH_USER_AUTH) and fail closed if anything about it is off: that makes the host
// itself the last line of defence, independent of the gateway. SIMULATED: the "host" is this program.
import fs from 'node:fs';
import path from 'node:path';
import { parseUserAuthText } from '../lib/sshcert.mjs';
import { Shell } from './shell.mjs';
import { LineEditor } from './lineedit.mjs';
import { Vfs } from './vfs.mjs';
import { HOST_META, INCIDENT_ID, buildWorld } from './world.mjs';
import * as F from './fmt.mjs';

const [hostId, t0Arg, stateDir] = process.argv.slice(2);
const out = (s) => process.stdout.write(s);
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const die = (msg, code = 1) => {
  out(crlf(`\x1b[1;31mClaura: access denied: ${msg}\x1b[0m\n`));
  process.exit(code);
};

if (!hostId || !HOST_META[hostId]) die('unknown host');
const t0 = Number.isFinite(Number(t0Arg)) && Number(t0Arg) > 0 ? Number(t0Arg) : Date.now() - 12 * 60_000;

// ---- who is this? (read from the certificate sshd authenticated)
let cert = null;
const authFile = process.env.SSH_USER_AUTH;
try {
  if (authFile) cert = parseUserAuthText(fs.readFileSync(authFile, 'utf8'));
} catch {
  /* handled below */
}
if (!cert && process.env.CLAURA_HOSTSHELL_DEV === '1') {
  // local development only (no sshd in front): a synthetic certificate
  const role = process.env.CLAURA_HOSTSHELL_DEV_ROLE || (hostId === 'b14-gpu-07' ? 'forensics' : 'operator');
  cert = {
    type: 'user', serial: '1', keyId: 'dev|req_000000000000', principals: [`${role}@${hostId}`],
    validAfterMs: Date.now(), validBeforeMs: Date.now() + 15 * 60_000,
    keyFingerprint: 'SHA256:dev', caFingerprint: 'SHA256:dev', critical: {}, extensions: ['permit-pty'],
  };
}
if (!cert) die('no certificate was presented');
if (cert.type !== 'user') die('not a user certificate');
if (Date.now() >= cert.validBeforeMs) die('certificate expired');
if (!/^[a-z][a-z0-9._-]{1,31}\|req_[0-9a-f]{12}$/.test(cert.keyId) && !(process.env.CLAURA_HOSTSHELL_DEV === '1')) die('unexpected certificate identity');
if (cert.principals.length !== 1) die('certificate must carry exactly one principal');
const principal = cert.principals[0];
const m = /^(forensics|operator)@([a-z0-9-]+)$/.exec(principal);
if (!m || m[2] !== hostId) die('principal is not valid for this host');
const role = m[1];
if (HOST_META[hostId].kind === 'gpu-suspect' && role !== 'forensics') die('only the forensic read-only principal is accepted on a suspect host');
const mode = role === 'forensics' ? 'forensic' : 'ops';

// ---- host state pushed by the gateway (suspect vs quarantined)
let status = 'quarantined';
try {
  if (stateDir) status = JSON.parse(fs.readFileSync(path.join(stateDir, `${hostId}.json`), 'utf8')).status ?? status;
} catch {
  /* default */
}
const phase = status === 'suspect' || status === 'cordoned' || status === 'healthy' ? 'suspect' : 'quarantined';

const startedMs = Date.now();
const session = {
  user: role, principal, mode, certId: cert.keyId, serial: cert.serial, startedMs,
  validAfterMs: cert.validAfterMs, validBeforeMs: cert.validBeforeMs,
  keyFingerprint: cert.keyFingerprint, caFingerprint: cert.caFingerprint,
  tty: 'pts/0', pid: process.pid, sshdPid: Math.max(2, process.pid - 2),
  clientPort: Number((process.env.SSH_CLIENT || '').split(' ')[1]) || 51234,
};
const world = buildWorld({ hostId, t0, now: startedMs, phase, session });
const fsys = new Vfs(world);

const auditPath = stateDir ? path.join(stateDir, `audit-${hostId}.jsonl`) : null;
const audit = (rec) => {
  if (!auditPath) return;
  try {
    fs.appendFileSync(auditPath, `${JSON.stringify({ host: hostId, serial: cert.serial, certId: cert.keyId, principal, ...rec })}\n`, { mode: 0o600 });
  } catch {
    /* auditing must never break the session */
  }
};
audit({ ts: startedMs, cmd: '(session start)', verdict: 'allowed' });

const cols = () => process.stdout.columns || 80;
const shell = new Shell({ world, fs: fsys, mode, cols, audit, now: () => Date.now() });
shell.env.TERM = process.env.TERM || 'xterm-256color';

let finished = false;
function finish(code = 0) {
  if (finished) return;
  finished = true;
  audit({ ts: Date.now(), cmd: '(session end)', verdict: 'allowed' });
  process.exit(code);
}

// ---- non-interactive use (ssh host 'command' or piped stdin)
if (process.env.SSH_ORIGINAL_COMMAND || !process.stdin.isTTY) {
  const run = (line) => {
    const r = shell.runLine(line);
    out(r.out);
    return r.exit;
  };
  if (process.env.SSH_ORIGINAL_COMMAND) {
    run(process.env.SSH_ORIGINAL_COMMAND);
    finish(shell.last);
  } else {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { data += d; });
    process.stdin.on('end', () => {
      for (const line of data.split('\n')) if (run(line)) break;
      finish(shell.last);
    });
  }
} else {
  // ---- interactive session
  const forensic = mode === 'forensic';
  const left = () => Math.max(0, Math.round((cert.validBeforeMs - Date.now()) / 1000));
  const meta = HOST_META[hostId];
  const banner = [
    '',
    `\x1b[1mClaura Secure Shell\x1b[0m  ·  ${hostId}  ·  ${meta.where}`,
    `\x1b[2mAuthenticated by SSH certificate: serial ${cert.serial}, id ${cert.keyId}, principal ${principal}\x1b[0m`,
    `\x1b[2mSigned by ${cert.caFingerprint}; no password, no static key\x1b[0m`,
    forensic
      ? '\x1b[1;38;5;208mFORENSIC READ-ONLY SESSION\x1b[0m: state-changing commands are denied by policy and recorded.'
      : '\x1b[1;38;5;41mOPERATOR SESSION\x1b[0m: read-only diagnostics plus scratch space in /tmp. Everything is recorded.',
    `Certificate expires ${F.stamp(cert.validBeforeMs)} (in ${Math.floor(left() / 60)} min ${left() % 60} s).`,
    hostId === 'b14-gpu-07'
      ? `Host state: ${phase === 'quarantined' ? 'QUARANTINED' : 'SUSPECT, cordoned, quarantine awaiting approval'} · ${INCIDENT_ID} · guest vm-7f3a paused · vNIC detached · evidence sealed`
      : `Host state: healthy · ${world.domains.length} guest${world.domains.length === 1 ? '' : 's'} · no open alerts`,
    "Type 'help' for commands.",
    '',
  ];
  out(crlf(banner.join('\n')));

  const editor = new LineEditor({
    write: out,
    cols,
    prompt: () => shell.prompt(),
    history: () => shell.history,
    complete: (line, pos) => shell.complete(line, pos),
    onLine: (line) => {
      const r = shell.runLine(line);
      if (r.out) out(crlf(r.out));
      if (r.exit) return finish(0);
      editor.start();
    },
    onEof: () => {
      out('logout\r\n');
      finish(0);
    },
  });

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (d) => editor.feed(d));
  process.stdin.on('end', () => finish(0));
  process.on('SIGHUP', () => finish(0));
  process.on('SIGTERM', () => finish(0));

  // the host enforces the certificate lifetime too, not only the gateway
  const ms = cert.validBeforeMs - Date.now();
  if (Number.isFinite(ms)) {
    if (ms > 61_000) setTimeout(() => editor.notify('\x1b[33m[claura] certificate expires in 60 s; the session will close.\x1b[0m'), ms - 60_000).unref();
    setTimeout(() => {
      out(crlf('\n\x1b[1;31m*** Claura: session certificate expired. Disconnecting. ***\x1b[0m\n'));
      finish(0);
    }, Math.max(0, ms)).unref();
  }
  editor.start();
}
