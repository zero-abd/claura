// Minimal OpenSSH certificate parser (ed25519 certificates only, which is all Claura's CAs issue).
// Used by the gateway (to know what it just issued) and by the host shell (to read the certificate
// that sshd authenticated, from the SSH_USER_AUTH file that ExposeAuthInfo writes).
import { createHash } from 'node:crypto';

class Reader {
  constructor(buf) {
    this.b = buf;
    this.o = 0;
  }
  u32() {
    if (this.o + 4 > this.b.length) throw new Error('truncated certificate');
    const v = this.b.readUInt32BE(this.o);
    this.o += 4;
    return v;
  }
  u64() {
    if (this.o + 8 > this.b.length) throw new Error('truncated certificate');
    const v = this.b.readBigUInt64BE(this.o);
    this.o += 8;
    return v;
  }
  str() {
    const n = this.u32();
    if (this.o + n > this.b.length) throw new Error('truncated certificate');
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
  done() {
    return this.o >= this.b.length;
  }
}

const fp = (blob) => `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
const FOREVER = 0xffffffffffffffffn;

function pairs(buf) {
  const r = new Reader(buf);
  const out = {};
  while (!r.done()) {
    const name = r.str().toString('utf8');
    const data = r.str();
    // option data is itself a string-encoded value for some options
    let value = '';
    if (data.length >= 4) {
      try {
        const inner = new Reader(data);
        value = inner.str().toString('utf8');
      } catch {
        value = data.toString('utf8');
      }
    }
    out[name] = value;
  }
  return out;
}

/** Parse the base64 body of an OpenSSH certificate. */
export function parseCertBlob(b64) {
  const blob = Buffer.from(String(b64).trim(), 'base64');
  const r = new Reader(blob);
  const keyType = r.str().toString('latin1');
  if (keyType !== 'ssh-ed25519-cert-v01@openssh.com') throw new Error(`unsupported certificate type ${keyType}`);
  r.str(); // nonce
  const pk = r.str(); // 32 bytes
  const serial = r.u64();
  const certType = r.u32();
  const keyId = r.str().toString('utf8');
  const principalsBuf = r.str();
  const validAfter = r.u64();
  const validBefore = r.u64();
  const critical = pairs(r.str());
  const extBuf = r.str();
  r.str(); // reserved
  const sigKey = r.str();

  const principals = [];
  const pr = new Reader(principalsBuf);
  while (!pr.done()) principals.push(pr.str().toString('utf8'));

  const extensions = [];
  const er = new Reader(extBuf);
  while (!er.done()) {
    extensions.push(er.str().toString('utf8'));
    er.str();
  }

  // The certified key as a public key blob: string "ssh-ed25519" + string pk
  const keyBlob = Buffer.concat([lenStr(Buffer.from('ssh-ed25519')), lenStr(pk)]);
  return {
    keyType,
    type: certType === 1 ? 'user' : certType === 2 ? 'host' : 'unknown',
    serial: serial.toString(),
    keyId,
    principals,
    validAfterMs: validAfter === 0n ? 0 : Number(validAfter) * 1000,
    validBeforeMs: validBefore === FOREVER ? Infinity : Number(validBefore) * 1000,
    critical,
    extensions,
    keyFingerprint: fp(keyBlob),
    caFingerprint: fp(sigKey),
  };
}

function lenStr(buf) {
  const h = Buffer.alloc(4);
  h.writeUInt32BE(buf.length);
  return Buffer.concat([h, buf]);
}

/** Parse a certificate file as written by ssh-keygen ("<type> <base64> [comment]"). */
export function parseCertLine(line) {
  const parts = String(line).trim().split(/\s+/);
  if (parts.length < 2) throw new Error('not a certificate line');
  return parseCertBlob(parts[1]);
}

/** The first certificate in an SSH_USER_AUTH file ("publickey <type> <base64>" lines). */
export function parseUserAuthText(text) {
  for (const raw of String(text).split('\n')) {
    const m = /^publickey\s+(\S+-cert-v01@openssh\.com)\s+(\S+)/.exec(raw.trim());
    if (m) return parseCertBlob(m[2]);
  }
  return null;
}
