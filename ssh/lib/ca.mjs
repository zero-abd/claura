// The Claura SSH certificate authority: a user CA and a host CA (ed25519), made and used with the
// system OpenSSH tools. Private keys live in ~/.config/claura/ssh-ca (0700 dir, 0600 files), never
// in the repo. Every external call is execFile with an argument array: no shell, no string building.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCertLine } from './sshcert.mjs';
import { isHostId, isOperator, isPrincipal, isReqId } from './util.mjs';

const execFileP = promisify(execFile);

export const SSH_KEYGEN = '/usr/bin/ssh-keygen';
export const SSHD = '/usr/sbin/sshd';
export const SSH = '/usr/bin/ssh';

const CHILD_ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: os.homedir(), LANG: 'C', LC_ALL: 'C' };

export async function keygen(args, opts = {}) {
  try {
    return await execFileP(SSH_KEYGEN, args, { env: CHILD_ENV, timeout: 15_000, maxBuffer: 1 << 20, ...opts });
  } catch (err) {
    const detail = String(err.stderr || err.message || '').split('\n').find(Boolean) ?? 'ssh-keygen failed';
    throw new Error(`ssh-keygen ${args.find((a) => a.startsWith('-') && a.length === 2) ?? ''}: ${detail}`);
  }
}

export function defaultCaDir(env = process.env) {
  return env.CLAURA_SSH_CA_DIR || path.join(os.homedir(), '.config', 'claura', 'ssh-ca');
}

const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/** Create a key pair at `priv` unless one is already there. Race-safe (hard-link publish). */
async function ensureKeyPair(priv, comment) {
  if (exists(priv) && exists(`${priv}.pub`)) return false;
  if (exists(priv) && !exists(`${priv}.pub`)) {
    const { stdout } = await keygen(['-y', '-f', priv]);
    await fsp.writeFile(`${priv}.pub`, stdout, { mode: 0o644 });
    return false;
  }
  const tmp = `${priv}.new-${process.pid}-${Date.now()}`;
  await keygen(['-q', '-t', 'ed25519', '-N', '', '-C', comment, '-f', tmp]);
  await fsp.chmod(tmp, 0o600);
  let created = true;
  for (const [from, to] of [[tmp, priv], [`${tmp}.pub`, `${priv}.pub`]]) {
    try {
      await fsp.link(from, to);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      created = false; // another process won the race: use its key pair
    }
    await fsp.rm(from, { force: true });
  }
  return created;
}

async function fingerprint(pubPath) {
  const { stdout } = await keygen(['-l', '-f', pubPath]);
  return stdout.trim().split(/\s+/)[1];
}

/**
 * Make (or load) the CA. Returns paths and public fingerprints; private keys are only ever handed to
 * ssh-keygen by path.
 */
export async function ensureCa(dir = defaultCaDir()) {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.chmod(dir, 0o700);
  const ca = { dir, user: {}, host: {} };
  for (const kind of ['user', 'host']) {
    const priv = path.join(dir, `${kind}_ca`);
    await ensureKeyPair(priv, `claura ${kind} CA`);
    await fsp.chmod(priv, 0o600);
    await fsp.chmod(`${priv}.pub`, 0o644);
    const pubText = (await fsp.readFile(`${priv}.pub`, 'utf8')).trim();
    const [type, b64] = pubText.split(/\s+/);
    ca[kind] = { priv, pub: `${priv}.pub`, type, b64, fingerprint: await fingerprint(`${priv}.pub`) };
  }
  return ca;
}

/** known_hosts content that trusts exactly one thing: the host CA, for exactly one host alias. */
export function knownHostsLine(ca, hostId) {
  if (!isHostId(hostId)) throw new Error('invalid host id');
  return `@cert-authority ${hostId} ${ca.host.type} ${ca.host.b64}\n`;
}

/** A persistent host key per demo host, signed by the host CA (valid ~90 days, renewed when <7 days left). */
export async function ensureHostIdentity(ca, hostId) {
  if (!isHostId(hostId)) throw new Error('invalid host id');
  const dir = path.join(ca.dir, 'hosts', hostId);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.chmod(dir, 0o700);
  const key = path.join(dir, 'ssh_host_ed25519_key');
  await ensureKeyPair(key, `claura demo host ${hostId}`);
  await fsp.chmod(key, 0o600);
  const certPath = `${key}-cert.pub`;
  let needsCert = !exists(certPath);
  if (!needsCert) {
    try {
      const c = parseCertLine(await fsp.readFile(certPath, 'utf8'));
      const left = c.validBeforeMs - Date.now();
      needsCert = left < 7 * 86_400_000 || !c.principals.includes(hostId);
    } catch {
      needsCert = true;
    }
  }
  if (needsCert) {
    await keygen([
      '-q', '-s', ca.host.priv, '-I', `host:${hostId}`, '-h',
      '-n', `${hostId},${hostId}.dfw2.claura.internal`, '-V', '-5m:+90d',
      '-z', String(Date.now()), `${key}.pub`,
    ]);
  }
  return { dir, key, certPath, cert: parseCertLine(await fsp.readFile(certPath, 'utf8')) };
}

/**
 * Issue a short-lived user certificate for one approved request.
 *  - fresh ed25519 key pair in a 0700 directory (the private key never leaves the gateway host)
 *  - identity "<operator>|<requestId>", exactly one principal chosen by policy
 *  - no port/agent/X11 forwarding, no user rc, bound to the gateway's source address
 *  - unique serial, validity +<ttl> from now
 */
export async function issueUserCert(ca, opts) {
  const { sessDir, operator, requestId, principal, ttlSeconds, serial, sourceAddress } = opts;
  if (!isOperator(operator)) throw new Error('invalid operator');
  if (!isReqId(requestId)) throw new Error('invalid request id');
  if (!isPrincipal(principal)) throw new Error('invalid principal');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 900) throw new Error('invalid ttl');
  if (!Number.isSafeInteger(serial) || serial < 1) throw new Error('invalid serial');
  if (sourceAddress !== undefined && sourceAddress !== null && !/^[0-9a-fA-F:.,/]{1,80}$/.test(sourceAddress)) {
    throw new Error('invalid source address');
  }

  await fsp.mkdir(sessDir, { recursive: true, mode: 0o700 });
  await fsp.chmod(sessDir, 0o700);
  const key = path.join(sessDir, 'id_ed25519');
  await keygen(['-q', '-t', 'ed25519', '-N', '', '-C', `claura-ephemeral ${requestId}`, '-f', key]);

  const validity = ttlSeconds % 60 === 0 ? `+${ttlSeconds / 60}m` : `+${ttlSeconds}s`;
  const args = [
    '-q', '-s', ca.user.priv,
    '-I', `${operator}|${requestId}`,
    '-n', principal,
    '-V', validity,
    '-z', String(serial),
    '-O', 'no-port-forwarding', '-O', 'no-agent-forwarding', '-O', 'no-x11-forwarding', '-O', 'no-user-rc',
  ];
  if (sourceAddress) args.push('-O', `source-address=${sourceAddress}`);
  args.push(`${key}.pub`);
  await keygen(args);

  const certPath = `${key}-cert.pub`;
  const cert = parseCertLine(await fsp.readFile(certPath, 'utf8'));
  return { sessDir, key, certPath, cert };
}

/** Key revocation list shared by every demo sshd (RevokedKeys). sshd re-reads it on each login. */
export class Krl {
  constructor({ file, ca }) {
    this.file = file;
    this.ca = ca;
    this.serials = new Set();
    this.ids = new Set();
    this.chain = Promise.resolve();
  }

  async init() {
    await this.#write();
  }

  revoke({ serial, keyId }) {
    if (serial !== undefined) this.serials.add(String(serial));
    if (keyId !== undefined) this.ids.add(String(keyId));
    this.chain = this.chain.then(() => this.#write());
    return this.chain;
  }

  async isRevoked(certPath) {
    try {
      await execFileP(SSH_KEYGEN, ['-Q', '-f', this.file, certPath], { env: CHILD_ENV, timeout: 10_000 });
      return false;
    } catch (err) {
      return err.code === 1; // exit 1 = revoked
    }
  }

  async #write() {
    const spec = [
      ...[...this.serials].filter((s) => /^\d{1,20}$/.test(s)).map((s) => `serial: ${s}`),
      ...[...this.ids].filter((s) => /^[a-z0-9._|-]{3,80}$/.test(s)).map((s) => `id: ${s}`),
    ].join('\n');
    const tmp = `${this.file}.tmp-${process.pid}`;
    const specFile = `${tmp}.spec`;
    try {
      if (spec) {
        await fsp.writeFile(specFile, `${spec}\n`, { mode: 0o600 });
        await keygen(['-k', '-f', tmp, '-s', this.ca.user.pub, specFile]);
      } else {
        await fsp.rm(tmp, { force: true });
        await keygen(['-k', '-f', tmp]);
      }
      await fsp.chmod(tmp, 0o644);
      await fsp.rename(tmp, this.file); // atomic: sshd never sees a half-written list
    } finally {
      await fsp.rm(specFile, { force: true });
    }
  }
}
