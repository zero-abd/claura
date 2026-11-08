// The session ledger: an append-only, hash-chained log of everything the Secure Shell gateway does
// (requests, step-ups, approvals, certificates, sessions with the SHA-256 of their recording).
//
//   hash(n) = SHA-256( hash(n-1) + "\n" + canonicalJSON(entry n without its hash) )
//
// Changing, removing or re-ordering any past entry breaks every hash after it, and verify() says
// where. The default store is a JSONL file; pass `sink` (ctx.ledger from the SpacetimeDB backend)
// to mirror every chained record into the shared incident log as well.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, sha256hex } from './util.mjs';

export const GENESIS = '0'.repeat(64);

export class Ledger {
  /**
   * @param {object} o
   * @param {string|null} o.file  JSONL path (null = memory only)
   * @param {{append: Function}|null} o.sink  optional mirror (ctx.ledger)
   * @param {object} o.log
   */
  constructor({ file = null, sink = null, log }) {
    this.file = file;
    this.sink = sink;
    this.log = log;
    this.entries = [];
    this.queue = Promise.resolve();
  }

  async init() {
    if (!this.file) return;
    await fsp.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    try {
      const text = await fsp.readFile(this.file, 'utf8');
      this.entries = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const v = this.verify();
    if (!v.ok) this.log.error(`ledger: chain is BROKEN at seq ${v.brokenAt} in ${this.file}`);
    else this.log.info(`ledger: ${v.count} entries, chain verified (head ${v.head.slice(0, 12)}…)`);
  }

  head() {
    const last = this.entries[this.entries.length - 1];
    return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
  }

  static body(e) {
    const { hash, ...rest } = e;
    return canonicalJson(rest);
  }

  /**
   * Append one entry. `fields` is any JSON-safe object; it should carry `kind` and ideally
   * actor, host, requestId, sessionId and a human sentence in `text`.
   */
  append(fields) {
    // Deep copy: the stored entry must be exactly what was hashed, whatever the caller does with its object afterwards.
    const own = JSON.parse(JSON.stringify(fields));
    const p = this.queue.then(async () => {
      const prev = this.head().hash;
      const entry = {
        seq: this.entries.length + 1,
        ts: Date.now(),
        ...own,
        prev,
      };
      entry.hash = sha256hex(`${prev}\n${Ledger.body(entry)}`);
      this.entries.push(entry);
      if (this.file) await fsp.appendFile(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      if (this.sink?.append) {
        try {
          Promise.resolve(this.sink.append(entry)).catch((err) => this.log.warn(`ledger sink failed: ${err?.message ?? err}`));
        } catch (err) {
          this.log.warn(`ledger sink failed: ${err?.message ?? err}`);
        }
      }
      return entry;
    });
    this.queue = p.catch(() => {});
    return p;
  }

  list({ limit = 100, kind, requestId, sessionId } = {}) {
    let rows = this.entries;
    if (kind) rows = rows.filter((e) => e.kind === kind);
    if (requestId) rows = rows.filter((e) => e.requestId === requestId);
    if (sessionId) rows = rows.filter((e) => e.sessionId === sessionId);
    return rows.slice(-limit);
  }

  verify() {
    let prev = GENESIS;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.seq !== i + 1 || e.prev !== prev || e.hash !== sha256hex(`${prev}\n${Ledger.body(e)}`)) {
        return { ok: false, count: this.entries.length, brokenAt: e.seq ?? i + 1, head: prev };
      }
      prev = e.hash;
    }
    return { ok: true, count: this.entries.length, head: prev };
  }

  /** Recompute the chain from a JSONL file on disk (used by the smoke test to prove it independently). */
  static verifyFile(file) {
    const l = new Ledger({ file: null, log: console });
    l.entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
    return l.verify();
  }
}
