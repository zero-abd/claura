#!/usr/bin/env node
// Claura gateway: one loopback server for everything the console talks to besides SpacetimeDB.
//
//   npm start                      http://127.0.0.1:8787      (CLAURA_GATEWAY_PORT to change)
//   GET /api/health                { features: [{ name, title, track, status: 'live'|'mock'|'down', ui }] }
//   GET /client/claura-features.js the loader the console imports at boot
//   GET /features/<name>/...       the feature's browser module and assets (read-only allowlist, see lib/static.mjs)
//   /api/<name>/...                the feature's own API (mounted by its server.mjs)
//
// See README.md. Secrets are read from ~/.config/claura/.env into memory only; they are never logged or served.
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { GATEWAY_DIR, REPO, VERSION, loadConfig } from './lib/config.mjs';
import { discover } from './lib/discover.mjs';
import { loadEnv } from './lib/env.mjs';
import { Registry } from './lib/features.mjs';
import { INCIDENT_ID, makeIncidentSource } from './lib/incident.mjs';
import { makeLogger } from './lib/log.mjs';
import { freeBlock } from './lib/ports.mjs';
import { installGuards, installTail } from './lib/security.mjs';
import { featureRouter } from './lib/static.mjs';

const startedAt = Date.now();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function statusPage(h) {
  const rows = h.features
    .map((f) => `<tr><td><i class="${esc(f.status)}"></i></td><td><b>${esc(f.title)}</b><br><small>${esc(f.name)} · ${esc(f.kind)}</small></td><td>${esc(f.track)}</td><td>${esc(f.status)}</td><td><small>${esc(f.detail ?? f.error ?? '')}</small></td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claura gateway</title>
<style>:root{color-scheme:dark}body{margin:0;background:#05070d;color:#e8ecf8;font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;padding:32px 20px}main{max-width:820px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.02em}p{color:#9aa3bd;margin:0 0 20px}table{width:100%;border-collapse:collapse}td{padding:10px 8px;border-top:1px solid #1c2338;vertical-align:top}small{color:#8590ad}
i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#555}i.live{background:#2fbf71}i.mock{background:#e0a030}i.down{background:#e5484d}a{color:#ff8a5c}</style></head>
<body><main><h1>Claura gateway</h1><p>${esc(h.incident)} · v${esc(h.version)} · up ${Math.round(h.uptimeMs / 1000)} s · ${h.ready ? 'ready' : 'starting'} ·
<a href="/api/health">/api/health</a> · <a href="/client/claura-features.js">/client/claura-features.js</a></p>
<table>${rows || '<tr><td>No features found.</td></tr>'}</table></main></body></html>`;
}

async function main() {
  const cfg = loadConfig();
  const envInfo = loadEnv(cfg.envFile);
  const log = makeLogger(envInfo.secrets);
  process.on('unhandledRejection', (r) => log.error('unhandled rejection:', r));
  process.on('uncaughtException', (e) => log.error('uncaught exception:', e));

  log.info(`Claura gateway ${VERSION} on node ${process.version}`);
  log.info(
    envInfo.found
      ? `env: ${log.publicText(cfg.envFile)} read (${envInfo.names.length} variable names, values are never logged)`
      : `env: ${log.publicText(cfg.envFile)} not found; features that need secrets run in mock mode`,
  );
  if (envInfo.tooOpen) log.warn(`env: ${log.publicText(cfg.envFile)} is readable by other users; run: chmod 600 on it`);

  const incident = makeIncidentSource({ repo: REPO, log });
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', 'strong');
  const server = http.createServer(app);
  installGuards({ app, server, cfg });

  const origins = cfg.consoleOrigins;
  const perFeature = {
    ssh: { origins, corsOrigins: origins, openRecordings: cfg.sshOpenRecordings },
    voice: { allowedOrigins: origins, prewarm: cfg.voicePrewarm },
  };
  // ctx.server is deliberately not passed: ssh/server.mjs hits a temporal-dead-zone error when it is. The registry calls
  // handle.attach(server) after the mount instead, which every package that listens for WebSockets supports.
  const makeCtx = (name) => {
    const ctx = {
      env: { ...envInfo.env },
      log,
      getIncidentContext: incident.getIncidentContext,
      getBrief: incident.getBrief,
      gateway: { version: VERSION, consoleOrigins: origins, setIncidentSource: incident.set },
    };
    // A package reads its options from ctx.<key>: ssh -> ctx.ssh, voice -> ctx.voice, solana-anchor -> ctx.solana.
    // Offer them under the folder name and under its first dash-separated word.
    const opts = perFeature[name] ?? { origins, corsOrigins: origins, allowedOrigins: origins };
    for (const key of new Set([name, name.split('-')[0]])) if (!(key in ctx)) ctx[key] = { ...opts };
    return ctx;
  };

  const registry = new Registry({ app, server, cfg, log, makeCtx });
  const health = async () => ({
    ok: true,
    service: 'claura-gateway',
    version: VERSION,
    ready: registry.ready,
    incident: INCIDENT_ID,
    time: new Date().toISOString(),
    uptimeMs: Date.now() - startedAt,
    features: await registry.snapshot(),
  });

  app.get('/api/health', async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await health()); } catch (e) { next(e); }
  });
  app.get('/client/claura-features.js', (_req, res) => {
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.sendFile('claura-features.js', { root: path.join(GATEWAY_DIR, 'client'), cacheControl: false, dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) res.status(500).json({ ok: false, error: 'loader unavailable' });
    });
  });
  app.get('/', async (_req, res, next) => {
    try {
      res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY' });
      res.type('html').send(statusPage(await health()));
    } catch (e) { next(e); }
  });
  app.use('/features', featureRouter({ registry, log }));

  const candidates = discover(cfg, log);
  log.info(`features found: ${candidates.length ? candidates.map((c) => c.name).join(', ') : 'none'}`);

  // The four sshd targets want 127.0.0.1:2201-2204. If another sshd holds them, move to the next free block instead of failing.
  if (candidates.some((c) => c.name === 'ssh') && !envInfo.env.CLAURA_SSH_PORT_BASE) {
    const base = await freeBlock(2201, 4);
    if (base === null) log.warn('ssh: no free block of 4 ports found from 2201 up; the sshd targets will probably fail to start');
    else {
      if (base !== 2201) log.warn(`ssh: ports 2201-2204 are busy (another sshd?); using ${base}-${base + 3} for the sshd targets`);
      perFeature.ssh.portBase = base;
    }
  }
  await registry.loadAll(candidates);
  installTail({ app, log });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, resolve);
  });
  const { port } = server.address();
  await registry.probe(`http://127.0.0.1:${port}`);
  for (const f of await registry.snapshot()) {
    (f.status === 'down' ? log.warn : log.info)(`  ${f.status.padEnd(4)} ${f.name.padEnd(10)} ${f.status === 'down' ? f.error : (f.detail ?? '')}`);
  }
  log.info(`gateway ready: http://127.0.0.1:${port}  (loopback only; CORS for ${origins.join(' and ')})`);

  let closing = false;
  const shutdown = async (sig) => {
    if (closing) return;
    closing = true;
    log.info(`${sig}: stopping features and the server`);
    const hard = setTimeout(() => { log.error('shutdown took too long; exiting'); process.exit(1); }, 12_000);
    hard.unref();
    try {
      server.close();
      server.closeIdleConnections?.();
      await registry.stopAll();
      server.closeAllConnections?.();
    } catch (e) {
      log.error('shutdown error:', e);
    }
    log.info('stopped');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // No SIGHUP handler on purpose: a gateway started with nohup must survive its terminal closing.
}

main().catch((err) => {
  // Fall back to a plain write: the logger may not exist yet. Nothing secret is in an error from config or listen().
  process.stderr.write(`gateway failed to start: ${err?.code === 'EADDRINUSE' ? `port in use (${err.message})` : err?.message || err}\n`);
  process.exit(1);
});
