// The feature registry: import each package, mount it, keep what it tells us, report honest status.
//
// A package is isolated three ways so one bad package cannot take the gateway (or the others) down:
//   * it is imported and mounted inside try/catch with a timeout;
//   * it gets its own Express sub-app, which is attached to the gateway only after the mount succeeded
//     (routes of a package that threw half-way are discarded with the sub-app);
//   * a package that fails is listed as status "down" with a short, scrubbed reason, and its files are not served.
import { pathToFileURL } from 'node:url';
import express from 'express';
import { importGraph } from './static.mjs';

export const withTimeout = (p, ms, label) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });

const STATUSES = new Set(['live', 'mock', 'down']);
const BASE_RE = /^\/[A-Za-z0-9_\-./]*$/;
const asStatus = (v) => (typeof v === 'string' && STATUSES.has(v) ? v : null);

/** How to read "is it really working" from the handle a package returns. Packages may also expose status() or mode(). */
const ADAPTERS = {
  ssh(h) {
    const hosts = h.targets?.hosts;
    if (!(hosts instanceof Map)) return { status: 'live' };
    const all = [...hosts.values()];
    const up = all.filter((x) => x.up).length;
    const ports = all.map((x) => x.port).filter(Number.isInteger);
    const range = ports.length ? ` (127.0.0.1:${Math.min(...ports)}-${Math.max(...ports)})` : '';
    return up > 0
      ? { status: 'live', detail: `${up}/${all.length} sshd targets up${range}` }
      : { status: 'down', detail: `no sshd target is up${range}: ${all.map((x) => x.error).find(Boolean) ?? 'see the gateway log'}` };
  },
  voice(h) {
    const live = typeof h.mode === 'function' ? h.mode() === 'live' : true;
    return live
      ? { status: 'live', detail: 'ElevenLabs voices, local Nemotron answers' }
      : { status: 'mock', detail: 'mock audio (no ElevenLabs key, or CLAURA_VOICE_MOCK is set)' };
  },
};

async function dynamicStatus(rec) {
  if (rec.status === 'down' || !rec.handle) return { status: 'down', detail: rec.error ?? 'not started' };
  const h = rec.handle;
  try {
    let r = ADAPTERS[rec.name]?.(h);
    if (!r && typeof h.status === 'function') r = await h.status();
    if (!r && typeof h.mode === 'function') r = h.mode();
    if (typeof r === 'string') r = { status: r };
    const detail = typeof r?.detail === 'string' ? r.detail : typeof r?.reason === 'string' ? r.reason : undefined;
    return { status: asStatus(r?.status) ?? 'live', detail };
  } catch (e) {
    return { status: 'down', detail: `status check failed: ${e.message}` };
  }
}

export class Registry {
  /** @param {{app: import('express').Express, server: import('node:http').Server, cfg: object, log: object, makeCtx: (name: string) => object}} o */
  constructor({ app, server, cfg, log, makeCtx }) {
    this.app = app;
    this.server = server;
    this.cfg = cfg;
    this.log = log;
    this.makeCtx = makeCtx;
    this.recs = [];
    this.byName = new Map();
    this.ready = false; // true once the gateway is listening and the UI entry points were probed
  }

  get(name) { return this.byName.get(name); }

  async #load(c) {
    const { log } = this;
    const rec = {
      name: c.name, dir: c.dir, kind: c.kind, title: c.title, track: c.track,
      status: 'down', error: null, handle: null, sub: null, base: null,
      nativeUi: false, useShim: false, uiHasDefault: false,
    };
    const down = (e) => {
      rec.status = 'down';
      rec.error = log.publicText(e?.message ?? e);
      log.error(`feature ${c.name} is down: ${rec.error}`);
      return rec;
    };
    const t = this.cfg.mountTimeoutMs;
    let handle;
    try {
      if (!c.hasServer) throw new Error('server.mjs not found');
      if (!c.hasUi) throw new Error('ui.js not found');
      const mod = await withTimeout(import(pathToFileURL(c.serverFile).href), t, 'import of server.mjs');
      // Title and track: export const meta = {title, track}, or the TITLE / TRACK constants (the Solana package does that)
      const meta = (mod.meta ?? mod.feature) && typeof (mod.meta ?? mod.feature) === 'object' ? (mod.meta ?? mod.feature) : { title: mod.TITLE, track: mod.TRACK };
      if (typeof meta.title === 'string' && meta.title.trim()) rec.title = meta.title.trim().slice(0, 60);
      if (typeof meta.track === 'string' && meta.track.trim()) rec.track = meta.track.trim().slice(0, 60);
      const mount = typeof mod.mount === 'function' ? mod.mount : typeof mod.default === 'function' ? mod.default : null;
      if (!mount) throw new Error('server.mjs does not export mount(app, ctx)');
      const sub = express();
      sub.disable('x-powered-by');
      handle = await withTimeout(mount(sub, this.makeCtx(c.name)), t, 'mount');
      if (handle && typeof handle.ready?.then === 'function') await withTimeout(handle.ready, t, 'start-up');
      try { handle?.attach?.(this.server); } catch (e) { log.warn(`feature ${c.name}: attach(server) failed: ${e.message}`); }
      rec.handle = handle ?? null;
      rec.sub = sub;
      rec.base = typeof handle?.base === 'string' && BASE_RE.test(handle.base) ? handle.base.replace(/\/+$/, '') : `/api/${c.name}`;
      rec.status = 'live';
      log.info(`feature ${c.name} mounted (${rec.kind}, api ${rec.base})`);
      return rec;
    } catch (e) {
      // undo whatever a half-started package left running (sshd children, timers)
      const stop = handle && (handle.stop ?? handle.close);
      if (typeof stop === 'function') await withTimeout(Promise.resolve().then(() => stop.call(handle)), 8000, 'cleanup').catch(() => {});
      return down(e);
    }
  }

  /** Import and mount every candidate (in parallel), then attach the sub-apps of the ones that worked, in discovery order. */
  async loadAll(candidates) {
    this.recs = await Promise.all(candidates.map((c) => this.#load(c)));
    for (const rec of this.recs) {
      this.byName.set(rec.name, rec);
      if (rec.sub && rec.status !== 'down') this.app.use(rec.sub);
    }
    return this.recs;
  }

  /** After listen(): does the package serve its own ui.js? Then /features/<name>/ui.js is a re-export of it (see static.mjs). */
  async probe(origin) {
    await Promise.all(
      this.recs.filter((r) => r.status !== 'down' && r.base).map(async (rec) => {
        try {
          const res = await fetch(`${origin}${rec.base}/ui.js`, { signal: AbortSignal.timeout(5000) });
          const text = res.ok ? await res.text() : '';
          rec.nativeUi = res.ok && /javascript/i.test(res.headers.get('content-type') ?? '') && text.length > 0;
          rec.uiHasDefault = rec.nativeUi && /^\s*export\s+default\b|\bexport\s*\{[^}]*\bas\s+default\b/m.test(text);
        } catch {
          rec.nativeUi = false;
        }
        // A shim only works for a self-contained module: with relative imports the files must come from /features/<name>/.
        rec.useShim = rec.nativeUi && importGraph(rec.dir).files.size === 1;
      }),
    );
    this.ready = true;
  }

  /** The public list (contract: name, title, track, status, ui) plus kind, api, detail, error. Nothing secret. */
  async snapshot() {
    return Promise.all(
      this.recs.map(async (rec) => {
        const { status, detail } = await dynamicStatus(rec);
        const item = { name: rec.name, title: rec.title, track: rec.track, kind: rec.kind, status, ui: `/features/${rec.name}/ui.js` };
        if (status !== 'down' && rec.base) item.api = rec.base;
        if (detail) item.detail = this.log.publicText(detail);
        if (status === 'down') item.error = rec.error ?? this.log.publicText(detail ?? 'down');
        return item;
      }),
    );
  }

  async stopAll() {
    await Promise.allSettled(
      this.recs.filter((r) => r.handle).map(async (rec) => {
        const h = rec.handle;
        const stop = h.stop ?? h.close;
        if (typeof stop !== 'function') return;
        try {
          await withTimeout(Promise.resolve().then(() => stop.call(h)), 8000, `${rec.name} stop`);
        } catch (e) {
          this.log.warn(`feature ${rec.name}: ${e.message}`);
        }
      }),
    );
  }
}
