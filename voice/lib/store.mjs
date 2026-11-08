// Disk cache for every generated clip plus a persistent usage ledger with a hard character budget.
//
// Every TTS / SFX result is cached on disk keyed by a hash of exactly what was sent to ElevenLabs, so a repeated
// request (a re-played brief, a re-run smoke test, a demo rehearsal) costs zero characters.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'claura', 'voice');
export const DEFAULT_BUDGET = 20000; // characters of generated audio during development

export class BudgetError extends Error {
  constructor(used, asked, budget) {
    super(`voice character budget reached (${used} used + ${asked} requested > ${budget}). Raise CLAURA_VOICE_CHAR_BUDGET to continue.`);
    this.name = 'BudgetError';
    this.code = 'voice_budget_exhausted';
    this.status = 429;
  }
}

/** Stable short hash of the parts that determine an output. */
export function sha(...parts) {
  const h = crypto.createHash('sha256');
  for (const p of parts) {
    h.update(String(p ?? ''));
    h.update('\u0000');
  }
  return h.digest('hex').slice(0, 32);
}

const EMPTY_USAGE = { ttsChars: 0, ttsCalls: 0, sfxChars: 0, sfxCalls: 0, sttCalls: 0, sttBytes: 0, since: null, updatedAt: null };

export function createStore({ dir = DEFAULT_CACHE_DIR, budget = DEFAULT_BUDGET, log } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const usageFile = path.join(dir, 'usage.json');
  const inflight = new Map();
  let reserved = 0; // chars promised to in-flight requests, not yet committed

  const readUsage = () => {
    try {
      return { ...EMPTY_USAGE, ...JSON.parse(fs.readFileSync(usageFile, 'utf8')) };
    } catch {
      return { ...EMPTY_USAGE, since: new Date().toISOString() };
    }
  };
  const writeUsage = (u) => {
    u.updatedAt = new Date().toISOString();
    u.since ??= u.updatedAt;
    const tmp = `${usageFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(u, null, 1));
    fs.renameSync(tmp, usageFile);
  };

  const file = (kind, id, ext = 'mp3') => path.join(dir, `${kind}-${id}.${ext}`);
  const has = (kind, id, ext = 'mp3') => fs.existsSync(file(kind, id, ext));
  const read = (kind, id, ext = 'mp3') => {
    try { return fs.readFileSync(file(kind, id, ext)); } catch { return null; }
  };
  const write = (kind, id, buf, ext = 'mp3') => {
    const dest = file(kind, id, ext);
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
    return dest;
  };
  const readJson = (kind, id) => {
    try { return JSON.parse(fs.readFileSync(file(kind, id, 'json'), 'utf8')); } catch { return null; }
  };
  const writeJson = (kind, id, obj) => write(kind, id, JSON.stringify(obj), 'json');

  /**
   * Reserve characters before calling the paid API. commit() records them, release() gives them back
   * (used when the API call fails, so failures never eat budget).
   */
  function reserve(chars, what = 'tts') {
    const u = readUsage();
    const used = u.ttsChars + u.sfxChars;
    if (budget > 0 && used + reserved + chars > budget) throw new BudgetError(used + reserved, chars, budget);
    reserved += chars;
    let settled = false;
    return {
      commit() {
        if (settled) return;
        settled = true;
        reserved -= chars;
        const cur = readUsage();
        if (what === 'sfx') { cur.sfxChars += chars; cur.sfxCalls += 1; } else { cur.ttsChars += chars; cur.ttsCalls += 1; }
        writeUsage(cur);
      },
      release() {
        if (settled) return;
        settled = true;
        reserved -= chars;
      },
    };
  }
  const recordStt = (bytes) => {
    const cur = readUsage();
    cur.sttCalls += 1;
    cur.sttBytes += bytes || 0;
    writeUsage(cur);
  };

  /** Single-flight: concurrent identical requests share one paid call. */
  function once(key, fn) {
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  function usage() {
    const u = readUsage();
    return { ...u, charsUsed: u.ttsChars + u.sfxChars, budget };
  }
  function stats() {
    let files = 0;
    try { files = fs.readdirSync(dir).filter((f) => /\.(mp3|wav|json)$/.test(f) && f !== 'usage.json').length; } catch { /* ignore */ }
    return { files };
  }

  log?.debug?.('store ready', { dir, budget });
  return { dir, budget, file, has, read, write, readJson, writeJson, reserve, recordStt, once, usage, stats };
}
