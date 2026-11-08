// Claura Evidence Anchoring: demo page.   node dev.mjs        ->   http://127.0.0.1:8802
//
// Mounts the feature on a tiny Express app (127.0.0.1 only) and shows the Liquid Glass card on a wallpaper.
// PORT=9000 node dev.mjs changes the port. Open http://127.0.0.1:8802/#autorun to click Anchor, then Verify, by itself.
// CLAURA_SOLANA_ANCHORS=/tmp/x.jsonl keeps the demo's anchors out of the real local anchor log.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mount } from './server.mjs';

const PORT = Number(process.env.PORT) || 8802;

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claura evidence anchoring</title>
<link rel="icon" href="data:,">
<style>
  :root { color-scheme: dark; --bg:#05070d; --ink:rgba(247,249,255,.96); --ink-2:rgba(226,232,250,.7);
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",system-ui,sans-serif; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font: 400 15px/1.45 var(--font); -webkit-font-smoothing: antialiased; }
  .wp { position: fixed; inset: 0; z-index: 0; overflow: hidden; background: radial-gradient(120% 100% at 50% -10%, #0c1328 0%, #070a15 55%, #04060b 100%); }
  .wp i { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; }
  .wp i:nth-child(1) { width: 52vw; height: 52vw; left: -12vw; top: -18vw; background: #1b3a8a; }
  .wp i:nth-child(2) { width: 44vw; height: 44vw; right: -10vw; top: 10vh; background: #4b2a8c; opacity: .45; }
  .wp i:nth-child(3) { width: 40vw; height: 40vw; left: 28vw; bottom: -24vw; background: #0f4a43; opacity: .5; }
  main { position: relative; z-index: 1; max-width: 560px; margin: 0 auto; padding: 48px 16px 80px; }
  h1 { margin: 0 0 6px; font: 600 26px/1.1 var(--font); letter-spacing: -.03em; }
  .lede { color: var(--ink-2); margin: 0 0 22px; }
</style>
</head>
<body>
<div class="wp"><i></i><i></i><i></i></div>
<main>
  <h1>Claura evidence anchoring</h1>
  <p class="lede">The integration card, as the console's integrations panel opens it.</p>
  <div id="card"></div>
</main>
<script type="module">
  import '/api/solana/ui.js';
  const card = document.getElementById('card');
  window.claura.integrations['solana-anchor'].open(card);
  if (location.hash.startsWith('#autorun')) {
    const sr = card.firstElementChild.shadowRoot;
    const until = async (fn, ms = 60000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 150)); };
    await until(() => sr.querySelector('[data-hash]').value.replace(/\\s/g, '').length === 64 && sr.querySelector('[data-pill]').dataset.state !== 'loading');
    sr.querySelector('[data-act="anchor"]').click();
    await until(() => !sr.querySelector('[data-result]').hidden);
    sr.querySelector('[data-act="verify"]').click();
    await until(() => !sr.querySelector('[data-verdict]').hidden && sr.querySelector('[data-act="verify"]').getAttribute('aria-busy') !== 'true');
    document.title = 'autorun done';
  }
</script>
</body>
</html>`;

/** Add the demo page to an Express app (used by the screenshot checks too). */
export function addPage(app) {
  app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(PAGE);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = express();
  app.disable('x-powered-by');
  const anchor = mount(app, {});
  addPage(app);
  const server = http.createServer(app);
  let closing = false;
  const shutdown = (sig) => {
    if (closing) return;
    closing = true;
    console.log(`\n[dev] ${sig}: stopping`);
    anchor.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(PORT, '127.0.0.1', async () => {
    console.log(`[dev] Claura evidence anchoring demo: http://127.0.0.1:${PORT}  (listening on 127.0.0.1 only)`);
    await anchor.ready;
    const s = anchor.status();
    console.log(`[dev] ${s.status.toUpperCase()}${s.reason ? ` (${s.reason})` : ''}, wallet ${s.publicKey}, ${s.balanceSol ?? '?'} SOL`);
  });
}
