// Small shared helpers: ids, validation, hashing, canonical JSON, logging.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256hex = (data) => createHash('sha256').update(data).digest('hex');

/** Opaque random id, e.g. newId('req') -> req_9f3a1c2b7d04 */
export const newId = (prefix, bytes = 6) => `${prefix}_${randomBytes(bytes).toString('hex')}`;
export const newSecret = () => randomBytes(24).toString('base64url');

// Strict validators. Everything that reaches execFile or a file path goes through one of these.
export const REQ_ID_RE = /^req_[0-9a-f]{12}$/;
export const SES_ID_RE = /^ses_[0-9a-f]{12}$/;
export const HOST_ID_RE = /^[a-z0-9][a-z0-9-]{2,30}$/;
export const OPERATOR_RE = /^[a-z][a-z0-9._-]{1,31}$/;
export const PRINCIPAL_RE = /^[a-z][a-z0-9._-]{1,31}@[a-z0-9][a-z0-9-]{2,30}$/;

export const isReqId = (v) => typeof v === 'string' && REQ_ID_RE.test(v);
export const isSesId = (v) => typeof v === 'string' && SES_ID_RE.test(v);
export const isHostId = (v) => typeof v === 'string' && HOST_ID_RE.test(v);
export const isOperator = (v) => typeof v === 'string' && OPERATOR_RE.test(v);
export const isPrincipal = (v) => typeof v === 'string' && PRINCIPAL_RE.test(v);

/** Integer in [min, max] or null. Accepts numbers and numeric strings, never floats. */
export function intInRange(v, min, max) {
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Trim, drop control characters, cap length. For free text that ends up in logs and the ledger. */
export function cleanText(v, max = 300) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** JSON with sorted keys, so a hash over it is stable. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Accepts ctx.log as a function, an object with info/warn/error, or nothing. */
export function makeLogger(log, prefix = 'ssh') {
  const emit = (level, msg, meta) => {
    try {
      if (typeof log === 'function') return log(`[${prefix}] ${msg}`, meta, level);
      if (log && typeof log[level] === 'function') return log[level](`[${prefix}] ${msg}`, meta);
      if (log && typeof log.log === 'function') return log.log(`[${prefix}] ${msg}`, meta);
    } catch {
      /* logging must never throw */
    }
    if (!log && level !== 'debug') {
      const line = `[${prefix}] ${msg}`;
      (level === 'error' ? console.error : console.log)(meta === undefined ? line : `${line} ${safeJson(meta)}`);
    }
  };
  return {
    debug: (m, x) => emit('debug', m, x),
    info: (m, x) => emit('info', m, x),
    warn: (m, x) => emit('warn', m, x),
    error: (m, x) => emit('error', m, x),
  };
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Wrap an async Express handler so thrown HttpErrors become JSON responses. */
export const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof HttpError) {
      if (!res.headersSent) res.status(err.status).json({ ok: false, error: err.message, ...(err.extra ?? {}) });
      return;
    }
    next(err);
  }
};
