// The demo hosts: real OpenSSH. One user-space sshd per host, run as the current user, bound to
// 127.0.0.1 only. No sudo, no system configuration, no macOS Remote Login.
//
// Each sshd:
//   - presents a host key signed by the Claura host CA (HostCertificate)
//   - accepts ONLY user certificates signed by the Claura user CA (TrustedUserCAKeys), with the
//     principal checked against that host's AuthorizedPrincipalsFile; no keys, no passwords
//   - honours the shared revocation list (RevokedKeys)
//   - runs ForceCommand = the Node host shell simulator (hostshell/main.mjs)
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { SSHD, ensureHostIdentity } from './ca.mjs';
import { HOSTS } from './hosts.mjs';
import { sleep } from './util.mjs';

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HOST_SHELL = path.resolve(HERE, '..', 'hostshell', 'main.mjs');

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const CHILD_ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: os.homedir(), LANG: 'C', LC_ALL: 'C' };

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(500, () => { s.destroy(); resolve(false); });
  });
}

export class Targets {
  /**
   * @param {object} o
   * @param {object} o.ca        from ensureCa()
   * @param {string} o.runDir    0700 runtime dir (configs, pid files, logs, host state, audit)
   * @param {string} o.krlFile   shared revocation list
   * @param {number} o.portBase  first port; hosts take portBase+index (default 2201)
   * @param {number} o.t0        incident start (ms) so every host shell tells the same story
   * @param {object} o.log
   */
  constructor({ ca, runDir, krlFile, portBase = 2201, t0, log }) {
    this.ca = ca;
    this.runDir = runDir;
    this.krlFile = krlFile;
    this.portBase = portBase;
    this.t0 = t0;
    this.log = log;
    this.hosts = new Map();
    this.stateDir = path.join(runDir, 'state');
    this.user = os.userInfo().username;
  }

  portOf(hostId) {
    const h = HOSTS.find((x) => x.id === hostId);
    return h ? this.portBase + h.index : null;
  }

  async start() {
    await fsp.mkdir(this.runDir, { recursive: true, mode: 0o700 });
    await fsp.chmod(this.runDir, 0o700);
    await fsp.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await this.#killStale();
    await Promise.all(HOSTS.map((h) => this.#startOne(h)));
    const up = [...this.hosts.values()].filter((x) => x.up).length;
    this.log.info(`sshd targets up: ${up}/${HOSTS.length} (127.0.0.1:${this.portBase}-${this.portBase + HOSTS.length - 1})`);
  }

  async #killStale() {
    const file = path.join(this.runDir, 'pids.json');
    let pids = [];
    try {
      pids = JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch {
      return;
    }
    for (const pid of pids) {
      try {
        const { stdout } = await execFileP('/bin/ps', ['-p', String(pid), '-o', 'command='], { env: CHILD_ENV, timeout: 5000 });
        if (stdout.includes(this.runDir)) {
          process.kill(-pid, 'SIGTERM');
          this.log.warn(`stopped a stale sshd left over from a previous run (pid ${pid})`);
        }
      } catch {
        /* not running */
      }
    }
    await sleep(150);
  }

  async #startOne(host) {
    const port = this.portBase + host.index;
    const dir = path.join(this.runDir, 'targets', host.id);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await fsp.chmod(dir, 0o700);
    const id = await ensureHostIdentity(this.ca, host.id);
    const principals = host.profile === 'gpu-suspect'
      ? [`forensics@${host.id}`] // a suspect host accepts only the read-only forensic principal
      : [`operator@${host.id}`, `forensics@${host.id}`];
    const principalsFile = path.join(dir, 'authorized_principals');
    await fsp.writeFile(principalsFile, `${principals.join('\n')}\n`, { mode: 0o600 });
    await this.setState(host.id, host.baseStatus);

    const forceCmd = [process.execPath, HOST_SHELL, host.id, String(this.t0), this.stateDir].map(shq).join(' ');
    const cfg = [
      `# Claura Secure Shell demo target ${host.id} (generated; do not edit)`,
      `Port ${port}`,
      'ListenAddress 127.0.0.1',
      'AddressFamily inet',
      `HostKey ${id.key}`,
      `HostCertificate ${id.certPath}`,
      'HostKeyAlgorithms ssh-ed25519-cert-v01@openssh.com',
      `PidFile ${path.join(dir, 'sshd.pid')}`,
      'LogLevel VERBOSE',
      `TrustedUserCAKeys ${this.ca.user.pub}`,
      `AuthorizedPrincipalsFile ${principalsFile}`,
      `RevokedKeys ${this.krlFile}`,
      'AuthorizedKeysFile none',
      'AuthenticationMethods publickey',
      'PubkeyAuthentication yes',
      'PubkeyAcceptedAlgorithms ssh-ed25519-cert-v01@openssh.com',
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'GSSAPIAuthentication no',
      'PermitEmptyPasswords no',
      'PermitRootLogin no',
      'UsePAM no',
      'StrictModes no',
      `AllowUsers ${this.user}`,
      'AllowTcpForwarding no',
      'AllowAgentForwarding no',
      'AllowStreamLocalForwarding no',
      'X11Forwarding no',
      'PermitTunnel no',
      'GatewayPorts no',
      'PermitUserEnvironment no',
      'PermitUserRC no',
      'PermitTTY yes',
      'PrintMotd no',
      'PrintLastLog no',
      'UseDNS no',
      'LoginGraceTime 10',
      'MaxAuthTries 3',
      'MaxSessions 1',
      'MaxStartups 10:30:30',
      'ClientAliveInterval 20',
      'ClientAliveCountMax 3',
      'ExposeAuthInfo yes',
      `ForceCommand ${forceCmd}`,
      '',
    ].join('\n');
    const cfgFile = path.join(dir, 'sshd_config');
    await fsp.writeFile(cfgFile, cfg, { mode: 0o600 });
    try {
      await execFileP(SSHD, ['-t', '-f', cfgFile], { env: CHILD_ENV, timeout: 10_000 });
    } catch (err) {
      const msg = String(err.stderr || err.message).trim().split('\n').slice(-2).join(' | ');
      this.hosts.set(host.id, { host, port, up: false, error: `sshd config check failed: ${msg}` });
      this.log.error(`${host.id}: sshd -t failed: ${msg}`);
      return;
    }

    const logFile = path.join(dir, 'sshd.log');
    const logFd = fs.openSync(logFile, 'a', 0o600);
    const child = spawn(SSHD, ['-D', '-e', '-f', cfgFile], { env: CHILD_ENV, stdio: ['ignore', 'ignore', logFd], detached: true });
    fs.closeSync(logFd);
    const rec = { host, port, up: false, pid: child.pid, child, dir, logFile, error: null, exited: false };
    this.hosts.set(host.id, rec);
    child.once('exit', (code, sig) => {
      rec.exited = true;
      rec.up = false;
      if (!this.stopping) {
        rec.error = `sshd exited (${sig ?? code})`;
        this.log.warn(`${host.id}: sshd exited (${sig ?? code}); see ${logFile}`);
      }
    });
    child.once('error', (err) => {
      rec.error = err.message;
    });
    for (let i = 0; i < 100 && !rec.exited; i++) {
      if (await portOpen(port)) {
        rec.up = true;
        break;
      }
      await sleep(50);
    }
    if (!rec.up && !rec.error) rec.error = 'sshd did not start listening';
    if (!rec.up) {
      const tail = await this.logTail(host.id, 3);
      this.log.error(`${host.id}: sshd is not up: ${rec.error}${tail ? ` (${tail})` : ''}`);
    }
    await this.#savePids();
  }

  async #savePids() {
    const pids = [...this.hosts.values()].map((x) => x.pid).filter(Boolean);
    await fsp.writeFile(path.join(this.runDir, 'pids.json'), JSON.stringify(pids), { mode: 0o600 });
  }

  status(hostId) {
    const t = this.hosts.get(hostId);
    return t ? { up: t.up, port: t.port, pid: t.pid ?? null, error: t.error ?? null } : { up: false, port: this.portOf(hostId), pid: null, error: 'not started' };
  }

  async logTail(hostId, n = 5) {
    const t = this.hosts.get(hostId);
    if (!t?.logFile) return '';
    try {
      return (await fsp.readFile(t.logFile, 'utf8')).trim().split('\n').slice(-n).join(' | ');
    } catch {
      return '';
    }
  }

  /** Tell the host shell what phase the incident is in (it reads this at session start). */
  async setState(hostId, status) {
    await fsp.writeFile(path.join(this.stateDir, `${hostId}.json`), JSON.stringify({ status, at: Date.now() }), { mode: 0o600 });
  }

  /** Commands the host shell itself recorded for one certificate serial (independent of the gateway). */
  async auditFor(hostId, serial) {
    try {
      const text = await fsp.readFile(path.join(this.stateDir, `audit-${hostId}.jsonl`), 'utf8');
      return text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => String(r.serial) === String(serial));
    } catch {
      return [];
    }
  }

  stopSync() {
    this.stopping = true;
    for (const t of this.hosts.values()) {
      if (t.pid && !t.exited) {
        try {
          process.kill(-t.pid, 'SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }
  }

  async stop() {
    this.stopping = true;
    const waits = [];
    for (const t of this.hosts.values()) {
      if (!t.pid || t.exited) continue;
      waits.push(new Promise((resolve) => {
        const timer = setTimeout(() => {
          try { process.kill(-t.pid, 'SIGKILL'); } catch { /* gone */ }
          resolve();
        }, 2500);
        t.child.once('exit', () => { clearTimeout(timer); resolve(); });
        try { process.kill(-t.pid, 'SIGTERM'); } catch { clearTimeout(timer); resolve(); }
      }));
    }
    await Promise.all(waits);
    try {
      await fsp.writeFile(path.join(this.runDir, 'pids.json'), '[]', { mode: 0o600 });
    } catch {
      /* run dir may already be gone */
    }
  }
}
