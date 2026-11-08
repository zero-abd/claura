// WebAuthn passkeys (platform authenticator / Touch ID, or a Chrome DevTools virtual authenticator)
// via @simplewebauthn/server. Used as the step-up before a certificate is issued for a host that
// needs it: the person at the keyboard proves presence AND user verification (biometric/PIN), with a
// fresh server challenge bound to one request.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256hex } from './util.mjs';

const CHALLENGE_TTL_MS = 5 * 60_000;

export class Passkeys {
  /**
   * @param {object} o
   * @param {string|null} o.file       JSON file for credentials (null = memory only)
   * @param {string} o.rpName
   * @param {'platform'|'cross-platform'|'any'} o.attachment
   */
  constructor({ file, rpName = 'Claura Secure Shell', attachment = 'platform', log }) {
    this.file = file;
    this.rpName = rpName;
    this.attachment = attachment;
    this.log = log;
    this.creds = {}; // operator -> [{ id, publicKey(b64url), counter, transports, createdAt, lastUsedAt, deviceType, backedUp }]
    this.pendingReg = new Map(); // operator -> { challenge, exp }
    this.pendingAuth = new Map(); // requestId -> { challenge, operator, exp }
  }

  async init() {
    if (!this.file) return;
    await fsp.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    try {
      this.creds = JSON.parse(await fsp.readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn(`passkeys: could not read ${this.file}: ${err.message}`);
    }
  }

  async #save() {
    if (!this.file) return;
    const tmp = `${this.file}.tmp-${process.pid}`;
    await fsp.writeFile(tmp, JSON.stringify(this.creds, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, this.file);
  }

  count(operator) {
    return (this.creds[operator] ?? []).length;
  }

  describe(operator) {
    return (this.creds[operator] ?? []).map((c) => ({
      id: `${c.id.slice(0, 8)}…`, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt ?? null, deviceType: c.deviceType, backedUp: c.backedUp,
    }));
  }

  #prune() {
    const now = Date.now();
    for (const m of [this.pendingReg, this.pendingAuth]) for (const [k, v] of m) if (v.exp < now) m.delete(k);
  }

  #selection() {
    const sel = { residentKey: 'required', requireResidentKey: true, userVerification: 'required' };
    if (this.attachment !== 'any') sel.authenticatorAttachment = this.attachment;
    return sel;
  }

  async regOptions({ operator, displayName, rpID }) {
    this.#prune();
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID,
      userName: operator,
      userDisplayName: displayName ?? operator,
      userID: new Uint8Array(Buffer.from(sha256hex(`claura-ssh-user:${operator}`), 'hex')),
      attestationType: 'none',
      excludeCredentials: (this.creds[operator] ?? []).map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: this.#selection(),
      timeout: 120_000,
    });
    this.pendingReg.set(operator, { challenge: options.challenge, exp: Date.now() + CHALLENGE_TTL_MS });
    return options;
  }

  async regVerify({ operator, response, origin, rpID }) {
    const pending = this.pendingReg.get(operator);
    if (!pending || pending.exp < Date.now()) return { verified: false, error: 'registration challenge expired' };
    this.pendingReg.delete(operator);
    try {
      const v = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!v.verified) return { verified: false, error: 'registration not verified' };
      const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
      const rec = {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? response.response?.transports ?? [],
        createdAt: Date.now(),
        lastUsedAt: null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      };
      (this.creds[operator] ??= []).push(rec);
      await this.#save();
      return { verified: true, credentialId: rec.id, deviceType: rec.deviceType };
    } catch (err) {
      return { verified: false, error: err?.message ?? String(err) };
    }
  }

  async authOptions({ requestId, operator, rpID }) {
    this.#prune();
    const creds = this.creds[operator] ?? [];
    if (!creds.length) return null;
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
      userVerification: 'required',
      timeout: 120_000,
    });
    this.pendingAuth.set(requestId, { challenge: options.challenge, operator, exp: Date.now() + CHALLENGE_TTL_MS });
    return options;
  }

  async authVerify({ requestId, operator, response, origin, rpID }) {
    const pending = this.pendingAuth.get(requestId);
    if (!pending || pending.operator !== operator || pending.exp < Date.now()) return { verified: false, error: 'step-up challenge expired' };
    this.pendingAuth.delete(requestId); // one challenge, one attempt
    const cred = (this.creds[operator] ?? []).find((c) => c.id === response?.id);
    if (!cred) return { verified: false, error: 'unknown credential for this operator' };
    try {
      const v = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: cred.id, publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')), counter: cred.counter, transports: cred.transports },
        requireUserVerification: true,
      });
      if (!v.verified) return { verified: false, error: 'assertion not verified' };
      cred.counter = v.authenticationInfo.newCounter;
      cred.lastUsedAt = Date.now();
      await this.#save();
      return { verified: true, credentialId: cred.id, userVerified: v.authenticationInfo.userVerified };
    } catch (err) {
      return { verified: false, error: err?.message ?? String(err) };
    }
  }
}
