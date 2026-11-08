// Access requests: the policy state machine in front of the certificate authority.
//
//   request -> [passkey step-up] -> [N approvals, none of them the requester] -> certificate issued
//           -> session (once) -> closed        (or denied / revoked / expired at any point)
//
// The certificate does not exist until every condition of the policy is met. Nothing the browser
// sends can skip a step: the server decides.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { issueUserCert, knownHostsLine } from './ca.mjs';
import { hostById, policyFor } from './hosts.mjs';
import { HttpError, cleanText, intInRange, newId, newSecret, safeEqual, sha256hex } from './util.mjs';

export const DECISION_WINDOW_MS = 10 * 60_000; // time to get a request approved
export const STEPUP_MAX_AGE_MS = 5 * 60_000; // a passkey assertion is good for 5 minutes
const KEEP_FINISHED_MS = 60 * 60_000;
const MAX_PENDING_PER_OPERATOR = 8;
const MAX_REQUESTS = 300;

const iso = (ms) => new Date(ms).toISOString();

export class Requests {
  constructor({ cfg, ca, krl, targets, ledger, log, runDir, nextSerial, hostStatus }) {
    Object.assign(this, { cfg, ca, krl, targets, ledger, log, runDir, nextSerial, hostStatus });
    this.map = new Map();
    this.sweeper = setInterval(() => this.#sweep().catch((e) => this.log.warn(`sweep: ${e.message}`)), 1000);
    this.sweeper.unref();
  }

  stop() {
    clearInterval(this.sweeper);
  }

  get(id) {
    return this.map.get(id) ?? null;
  }

  list() {
    return [...this.map.values()];
  }

  status(req) {
    if (req.terminal) return req.terminal;
    if (req.sessionId) return 'active';
    if (req.cert) return 'approved';
    if (req.stepUp.required && !req.stepUp.done) return 'awaiting_passkey';
    return 'awaiting_approval';
  }

  /** Public, secret-free view. */
  view(req) {
    const c = req.cert;
    return {
      id: req.id,
      host: req.host,
      operator: req.operator,
      reason: req.reason,
      minutes: req.minutes,
      status: this.status(req),
      hostStatus: req.hostStatus,
      policy: { ...req.policy },
      createdAt: req.createdAt,
      decideBy: req.decideBy,
      stepUp: { required: req.stepUp.required, done: req.stepUp.done, at: req.stepUp.at ?? null, method: req.stepUp.method ?? null },
      approvals: req.approvals.map((a) => ({ approver: a.approver, at: a.at })),
      approvalsNeeded: req.policy.approvals,
      cert: c ? {
        serial: c.serial, keyId: c.keyId, principal: c.principal, validAfter: c.validAfterMs, validBefore: c.validBeforeMs,
        keyFingerprint: c.keyFingerprint, caFingerprint: c.caFingerprint,
      } : null,
      sessionId: req.sessionId ?? null,
      closedAt: req.closedAt ?? null,
      closeReason: req.closeReason ?? null,
    };
  }

  hasSecret(req, secret) {
    return typeof secret === 'string' && secret.length > 8 && safeEqual(sha256hex(secret), req.secretHash);
  }

  async create({ host, operator, reason, minutes }) {
    const h = hostById(host);
    if (!h) throw new HttpError(404, 'unknown host');
    if (!this.targets.status(h.id).up) throw new HttpError(503, `${h.id} is not reachable right now`);
    const status = await this.hostStatus(h.id);
    const policy = policyFor(h, status);
    const mins = intInRange(minutes ?? policy.defaultMinutes, 1, policy.maxMinutes);
    if (mins === null) throw new HttpError(400, `minutes must be a whole number from 1 to ${policy.maxMinutes}`);
    const text = cleanText(reason, 300);
    if (text.length < 5) throw new HttpError(400, 'a reason of at least 5 characters is required');
    if (this.map.size >= MAX_REQUESTS) throw new HttpError(429, 'too many requests in flight');
    const open = this.list().filter((r) => r.operator === operator && !r.terminal && !r.cert).length;
    if (open >= MAX_PENDING_PER_OPERATOR) throw new HttpError(429, 'too many open requests for this operator');

    const secret = newSecret();
    const now = Date.now();
    const req = {
      id: newId('req'), host: h.id, hostStatus: status, operator, reason: text, minutes: mins, policy,
      createdAt: now, decideBy: now + DECISION_WINDOW_MS,
      stepUp: { required: policy.stepUp, done: false, at: null, method: null },
      approvals: [], cert: null, files: null, terminal: null, sessionId: null, secretHash: sha256hex(secret),
    };
    if (policy.stepUp && this.cfg.skipPasskey) {
      req.stepUp.done = true;
      req.stepUp.at = now;
      req.stepUp.method = 'skipped (DEMO_SKIP_PASSKEY)';
    }
    this.map.set(req.id, req);
    await this.ledger.append({
      kind: 'ssh.request', actor: operator, host: h.id, requestId: req.id,
      text: `${operator.toUpperCase()} requested ${policy.principal} on ${h.id} for ${mins} min: ${text}`,
      data: { policyClass: policy.class, stepUp: policy.stepUp, approvalsNeeded: policy.approvals, readOnly: policy.readOnly, hostStatus: status, minutes: mins },
    });
    if (req.stepUp.method?.startsWith('skipped')) {
      await this.ledger.append({
        kind: 'ssh.stepup', actor: operator, host: h.id, requestId: req.id,
        text: `passkey step-up SKIPPED for ${req.id} (DEMO_SKIP_PASSKEY is set: smoke tests only)`, data: { method: req.stepUp.method },
      });
    }
    await this.#maybeIssue(req);
    return { req, secret };
  }

  async stepUpDone(req, { method, credentialId }) {
    if (req.terminal) throw new HttpError(409, `request is ${req.terminal}`);
    req.stepUp.done = true;
    req.stepUp.at = Date.now();
    req.stepUp.method = method;
    await this.ledger.append({
      kind: 'ssh.stepup', actor: req.operator, host: req.host, requestId: req.id,
      text: `${req.operator.toUpperCase()} confirmed with a passkey (user verification) for ${req.id}`,
      data: { method, credential: credentialId ? `${credentialId.slice(0, 10)}…` : null },
    });
    await this.#maybeIssue(req);
  }

  /** @param {{id: string, roles: string[]}} actor  who is approving: the server resolves this, the body only claims it */
  async approve(requestId, actor) {
    const req = this.#open(requestId);
    const approver = actor.id;
    if (req.cert) throw new HttpError(409, 'already approved');
    if (approver === req.operator) throw new HttpError(403, 'approver must differ from the requester');
    if (!actor.roles?.includes('approver')) throw new HttpError(403, `${approver.toUpperCase()} is not an approver`);
    if (req.approvals.some((a) => a.approver === approver)) throw new HttpError(409, `${approver.toUpperCase()} already approved this request`);
    req.approvals.push({ approver, at: Date.now() });
    await this.ledger.append({
      kind: 'ssh.approval', actor: approver, host: req.host, requestId: req.id,
      text: `${approver.toUpperCase()} approved ${req.operator.toUpperCase()}'s ${req.policy.principal} request (${req.approvals.length}/${req.policy.approvals})`,
      data: { approvals: req.approvals.length, needed: req.policy.approvals },
    });
    await this.#maybeIssue(req);
    return req;
  }

  async deny(requestId, actor, reason) {
    const req = this.#open(requestId);
    const approver = actor.id;
    if (req.cert) throw new HttpError(409, 'already approved; revoke it instead');
    if (approver === req.operator) throw new HttpError(403, 'use cancel to withdraw your own request');
    if (!actor.roles?.includes('approver')) throw new HttpError(403, `${approver.toUpperCase()} is not an approver`);
    await this.#finish(req, 'denied', `denied by ${approver}`, approver, { reason: cleanText(reason, 200) });
    return req;
  }

  async cancel(req) {
    if (req.terminal) return req;
    await this.#finish(req, 'revoked', 'cancelled by the requester', req.operator);
    return req;
  }

  /** Revoke: kill the live session (caller does that), list the certificate on the KRL, wipe the keys. */
  async revoke(req, by, reason) {
    if (req.terminal === 'revoked') return req;
    if (req.cert) {
      await this.krl.revoke({ serial: req.cert.serial, keyId: req.cert.keyId });
    }
    await this.#finish(req, 'revoked', `revoked by ${by}`, by, { reason: cleanText(reason, 200), serial: req.cert?.serial ?? null });
    return req;
  }

  /** Called when the session ends. */
  async sessionEnded(req, reason) {
    if (req.terminal) return;
    req.terminal = reason === 'cert-expired' ? 'expired' : 'closed';
    req.closedAt = Date.now();
    req.closeReason = reason;
    await this.#cleanup(req);
  }

  #open(id) {
    const req = this.map.get(id);
    if (!req) throw new HttpError(404, 'unknown request');
    if (req.terminal) throw new HttpError(409, `request is ${req.terminal}`);
    return req;
  }

  async #finish(req, terminal, text, actor, extra = {}) {
    req.terminal = terminal;
    req.closedAt = Date.now();
    req.closeReason = text;
    await this.#cleanup(req);
    await this.ledger.append({
      kind: `ssh.${terminal}`, actor, host: req.host, requestId: req.id,
      text: `${req.id} ${text}`, data: extra,
    });
  }

  async #cleanup(req) {
    const dir = req.files?.sessDir;
    req.files = null;
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  }

  async #maybeIssue(req) {
    if (req.cert || req.terminal) return;
    if (req.issuing) return req.issuing;
    const p = req.policy;
    if (req.approvals.length < p.approvals) return;
    if (p.stepUp) {
      if (!req.stepUp.done) return;
      if (Date.now() - req.stepUp.at > STEPUP_MAX_AGE_MS) {
        req.stepUp.done = false; // stale: ask again
        return;
      }
    }
    req.issuing = (async () => {
      const serial = await this.nextSerial();
      const ttl = this.cfg.testTtlSeconds ?? req.minutes * 60;
      const sessDir = path.join(this.runDir, 'sess', req.id);
      const u = await issueUserCert(this.ca, {
        sessDir, operator: req.operator, requestId: req.id, principal: p.principal, ttlSeconds: ttl, serial, sourceAddress: this.cfg.sourceAddress,
      });
      const knownHosts = path.join(sessDir, 'known_hosts');
      await fsp.writeFile(knownHosts, knownHostsLine(this.ca, req.host), { mode: 0o600 });
      req.files = { sessDir, key: u.key, certPath: u.certPath, knownHosts };
      req.cert = {
        serial: u.cert.serial, keyId: u.cert.keyId, principal: p.principal, validAfterMs: u.cert.validAfterMs, validBeforeMs: u.cert.validBeforeMs,
        keyFingerprint: u.cert.keyFingerprint, caFingerprint: u.cert.caFingerprint, issuedAt: Date.now(),
      };
      await this.ledger.append({
        kind: 'ssh.cert.issued', actor: 'claura-ca', host: req.host, requestId: req.id,
        text: `certificate ${req.cert.keyId} serial ${req.cert.serial} issued for ${p.principal}, valid until ${iso(req.cert.validBeforeMs)}`,
        data: {
          serial: req.cert.serial, keyId: req.cert.keyId, principal: p.principal, validBefore: iso(req.cert.validBeforeMs),
          keyFingerprint: req.cert.keyFingerprint, caFingerprint: req.cert.caFingerprint, sourceAddress: this.cfg.sourceAddress ?? null,
          options: ['no-port-forwarding', 'no-agent-forwarding', 'no-x11-forwarding', 'no-user-rc'],
        },
      });
    })()
      .catch((err) => {
        this.log.error(`certificate issuance failed for ${req.id}: ${err.message}`);
        req.issueError = err.message;
      })
      .finally(() => { req.issuing = null; });
    return req.issuing;
  }

  async #sweep() {
    const now = Date.now();
    for (const req of this.map.values()) {
      if (req.terminal) {
        if (now - (req.closedAt ?? now) > KEEP_FINISHED_MS) this.map.delete(req.id);
        continue;
      }
      if (!req.cert && now > req.decideBy) {
        await this.#finish(req, 'expired', 'not approved in time', 'claura');
      } else if (req.cert && !req.sessionId && now > req.cert.validBeforeMs) {
        await this.#finish(req, 'expired', 'certificate expired before the session was opened', 'claura');
      } else if (!req.cert && req.stepUp.required && req.stepUp.done && now - req.stepUp.at > STEPUP_MAX_AGE_MS && !req.stepUp.method?.startsWith('skipped')) {
        req.stepUp.done = false;
      }
    }
  }
}
