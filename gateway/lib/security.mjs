// Gateway-wide browser guards. They run before any feature sees a request, so a feature without its own checks (voice)
// is still covered:
//   Host      only localhost / 127.0.0.1 / [::1]               (DNS rebinding: a page on evil.example that resolves to 127.0.0.1)
//   Origin    CORS only for the console origins; any other Origin that is not this server itself is refused
//   no Origin a browser fetch from another site (Sec-Fetch-Site: cross-site, not a top-level navigation) is refused
//   upgrade   the same Host/Origin rules for WebSocket handshakes
import { URL } from 'node:url';

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const hostnameOf = (hostHeader) => {
  const h = String(hostHeader ?? '').toLowerCase();
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
};

// Headers the feature UIs may read from a cross-origin response (voice reads X-Voice-Mode).
const EXPOSE = ['X-Voice-Mode', 'X-Voice-Cache', 'X-Voice-Chars', 'X-Voice-Model', 'X-Voice-Translation', 'X-Claura-Recording-SHA256', 'X-Claura-Recording-Check', 'Content-Disposition'];

const sameOrigin = (origin, host) => {
  try { return new URL(origin).host === String(host ?? ''); } catch { return false; }
};

export function installGuards({ app, server, cfg }) {
  const allowed = new Set(cfg.consoleOrigins);

  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (!LOOPBACK_HOSTS.has(hostnameOf(req.headers.host))) return res.status(421).json({ ok: false, error: 'unexpected Host header' });

    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Expose-Headers': EXPOSE.join(', ') });
      res.vary('Origin');
      if (req.method === 'OPTIONS') {
        const asked = String(req.headers['access-control-request-headers'] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((h) => /^[a-z0-9-]{1,60}$/.test(h));
        res.set({
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': [...new Set(['content-type', 'authorization', ...asked])].join(', '),
          'Access-Control-Max-Age': '600',
        });
        if (req.headers['access-control-request-private-network'] === 'true') res.set('Access-Control-Allow-Private-Network', 'true');
        return res.status(204).end();
      }
      return next();
    }
    if (origin) {
      res.vary('Origin');
      if (!sameOrigin(origin, req.headers.host)) return res.status(403).json({ ok: false, error: 'origin not allowed' });
      return next();
    }
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate') {
      return res.status(403).json({ ok: false, error: 'cross-site request refused' });
    }
    next();
  });

  // Registered first, so it sees upgrades before any feature attaches its own listener.
  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    const ok = LOOPBACK_HOSTS.has(hostnameOf(req.headers.host)) && (!origin || allowed.has(origin) || sameOrigin(origin, req.headers.host));
    if (ok) return;
    try { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } catch { /* gone */ }
    socket.destroy();
    req.url = '/__refused__'; // listeners after this one see a path that is not theirs
  });
}

/** Last in the chain: JSON 404 and a quiet 500. */
export function installTail({ app, log }) {
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = Number(err?.status ?? err?.statusCode);
    const client = status >= 400 && status < 500;
    if (!client) log.error(`${req.method} ${String(req.path).slice(0, 120)}: ${err?.stack || err}`);
    if (res.headersSent) return res.destroy();
    res.status(client ? status : 500).json({ ok: false, error: client && err.expose ? String(err.message).slice(0, 160) : client ? 'bad request' : 'internal error' });
  });
}
