// Claura Secure Shell: demo page.   node dev.mjs        ->   http://localhost:8801
//
// Open it as http://localhost:8801 (not 127.0.0.1): WebAuthn passkeys need a real hostname as the relying-party id.
// The server itself listens on 127.0.0.1 only. Ctrl+C stops the page, the gateway and the four sshd targets.
import express from 'express';
import http from 'node:http';
import { mount } from './server.mjs';

const PORT = Number(process.env.PORT) || 8801;
const app = express();
app.disable('x-powered-by');

const ssh = mount(app, {
  ssh: {
    openRecordings: true, // the demo has no sign-in, so past recordings are downloadable from the page; production uses ctx.ssh.identity
    origins: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
  },
});

// DEMO_TTL_SECONDS=20 node dev.mjs  ->  every certificate lasts 20 seconds: watch the countdown and the automatic close
const demoTtl = Number(process.env.DEMO_TTL_SECONDS);
if (demoTtl >= 3 && demoTtl <= 900) {
  ssh.cfg.testTtlSeconds = demoTtl;
  console.log(`[dev] DEMO_TTL_SECONDS=${demoTtl}: certificates are shortened to ${demoTtl} s`);
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claura Secure Shell</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='%23FF3B30' d='M231.95 73.95A111 111 0 1 0 231.95 182.05A7.64 7.64 0 0 0 219.1 173.85A78 78 0 1 1 219.1 82.15A7.64 7.64 0 0 0 231.95 73.95Z'/%3E%3Cpath fill='%23FF3B30' d='M108 128a48 48 0 1 0 96 0a48 48 0 1 0-96 0z'/%3E%3C/svg%3E">
<style>
  :root { color-scheme: dark; --bg:#070707; --ink:rgba(249,249,249,.96); --ink-2:rgba(232,232,232,.7); --ink-3:rgba(222,222,222,.46); --accent:#ff3b30; --safe:#30d158;
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",system-ui,sans-serif; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font: 400 15px/1.45 var(--font); letter-spacing: -.006em; -webkit-font-smoothing: antialiased; }
  .wp { position: fixed; inset: 0; z-index: 0; overflow: hidden; background: radial-gradient(120% 100% at 50% -10%, #141414 0%, #0a0a0a 55%, #060606 100%); }
  .wp i { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; }
  .wp i:nth-child(1) { width: 52vw; height: 52vw; left: -12vw; top: -18vw; background: #404040; }
  .wp i:nth-child(2) { width: 44vw; height: 44vw; right: -10vw; top: 10vh; background: #7d110a; opacity: .45; }
  .wp i:nth-child(3) { width: 40vw; height: 40vw; left: 28vw; bottom: -24vw; background: #3a3a3a; opacity: .5; }
  main { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; padding: 40px 24px 80px; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  header svg { width: 38px; height: 38px; }
  header h1 { margin: 0; font: 600 26px/1.1 var(--font); letter-spacing: -.03em; }
  header small { color: var(--ink-3); font-size: 13px; letter-spacing: 0; }
  .lede { max-width: 640px; color: var(--ink-2); margin: 6px 0 28px; font-size: 16px; }
  .bar { display: flex; align-items: center; gap: 10px; margin: 0 0 18px; color: var(--ink-3); font-size: 13px; }
  .bar button { appearance: none; border: 0; cursor: pointer; height: 32px; padding: 0 14px; border-radius: 16px; font: 600 13px/1 var(--font); color: var(--ink); background: rgba(255,255,255,.1); box-shadow: inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px rgba(255,255,255,.08); }
  .bar button:hover { background: rgba(255,255,255,.16); }
  #claura-shell-slot { display: none; }
  body.slot main { max-width: 1480px; padding-top: 24px; display: grid; grid-template-columns: minmax(300px, 380px) 1fr; column-gap: 24px; align-items: start; }
  body.slot main > .top { grid-column: 1 / -1; }
  body.slot .lede { display: none; }
  body.slot #hosts { grid-column: 1; max-height: calc(100vh - 170px); overflow: auto; padding-right: 4px; }
  body.slot #hosts .cs-cards { grid-template-columns: 1fr; }
  body.slot #claura-shell-slot { grid-column: 2; grid-row: 2; display: flex; flex-direction: column; height: calc(100vh - 170px); min-height: 520px; border-radius: 38px; overflow: hidden;
    background: linear-gradient(155deg, rgba(255,255,255,.115), rgba(255,255,255,.02)), rgba(23,23,23,.36); -webkit-backdrop-filter: blur(34px) saturate(1.9); backdrop-filter: blur(34px) saturate(1.9);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.3), inset 0 0 0 1px rgba(255,255,255,.07), 0 30px 80px -30px rgba(0,0,0,.6); }
  .slot-empty { margin: auto; text-align: center; color: var(--ink-2); max-width: 380px; padding: 24px; }
  .slot-empty h2 { margin: 0 0 6px; font: 600 28px/1.1 var(--font); letter-spacing: -.03em; color: var(--ink); }
  #claura-shell-slot:has(> :not(.slot-empty)) > .slot-empty { display: none; }
</style>
</head>
<body>
<div class="wp"><i></i><i></i><i></i></div>
<main>
  <div class="top">
  <header>
    <svg viewBox="0 0 256 256" aria-hidden="true"><path fill="#FF3B30" d="M231.95 73.95A111 111 0 1 0 231.95 182.05A7.64 7.64 0 0 0 219.1 173.85A78 78 0 1 1 219.1 82.15A7.64 7.64 0 0 0 231.95 73.95Z"/><path fill="#FF3B30" d="M108 128a48 48 0 1 0 96 0a48 48 0 1 0-96 0z"/></svg>
    <div><h1>Claura Secure Shell</h1><small>Seal the breach before it spreads.</small></div>
  </header>
  <p class="lede">Click a host. Claura issues a short-lived SSH certificate once the policy is met (passkey, a second person, a reason) and opens a recorded terminal. Nothing static to steal.</p>
  <div class="bar"><span>Console integration:</span> <button id="mode">Show the Shells slot layout</button> <span id="note"></span></div>
  </div>
  <div id="hosts"></div>
  <div id="claura-shell-slot" role="region" aria-label="Secure shells"><div class="slot-empty"><h2>No shell open</h2><p>Pick a host and choose Open secure shell.</p></div></div>
</main>
<script type="module">
  import { mountUI } from '/api/ssh/ui.js';
  mountUI(document.getElementById('hosts'));
  const b = document.getElementById('mode');
  b.addEventListener('click', () => {
    const on = document.body.classList.toggle('slot');
    b.textContent = on ? 'Show the sheet overlay layout' : 'Show the Shells slot layout';
  });
  if (location.hash === '#slot') b.click();
</script>
</body>
</html>`;

app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(PAGE);
});

const server = http.createServer(app);
ssh.attach(server);

let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  console.log(`\n[dev] ${sig}: stopping gateway and sshd targets...`);
  const t = setTimeout(() => process.exit(1), 8000);
  t.unref();
  try {
    await ssh.stop();
    await new Promise((r) => server.close(r));
  } catch (err) {
    console.error('[dev] shutdown error:', err.message);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[dev] Claura Secure Shell demo: http://localhost:${PORT}  (listening on 127.0.0.1 only)`);
  try {
    await ssh.ready;
    console.log('[dev] gateway ready: open the page, click a host');
  } catch (err) {
    console.error('[dev] gateway failed to start:', err.message);
  }
});
