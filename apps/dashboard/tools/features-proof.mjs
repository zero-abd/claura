// Proves the feature loader, the Integrations page and the Solana anchor button against tools/mock-gateway.mjs.
//
//   node tools/features-proof.mjs [--port 4317] [--out shots]
//
// 1. gateway DOWN at boot            -> Integrations shows the empty state, the console works, anchor hook absent
// 2. gateway UP (started mid-session) -> the 8 s poll (or "Check again") fills the page: title, track, status badge, Open
// 3. Open on a card                   -> the feature's own open(container) mounts into the card
// 4. Reports -> "Anchor evidence on Solana devnet" -> window.claura.anchor(sha256, 'INC-0419') -> signature + explorer link
// 5. gateway stopped again            -> back to the empty state
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";
import { startMockGateway } from "./mock-gateway.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4317");
const OUT = resolve(opt("out", "shots"));
const GW = 8791;
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
let ok = true;
const check = (name, cond, extra = "") => {
  log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) ok = false;
};

const chrome = await launchChrome({ width: 1440, height: 900 });
let gw = null;
try {
  // 1. gateway down
  const page = await chrome.page(`http://127.0.0.1:${PORT}/?demo=1&view=integrations&gateway=http://127.0.0.1:${GW}`);
  await page.until("window.claura && window.claura.features && window.claura.features.gateway === 'down'", 15000, "gateway down detected");
  await sleep(800);
  check("down: empty state shown", (await page.eval("document.getElementById('intBody').dataset.state")) === "down", await page.eval("document.querySelector('.int-empty h2').textContent"));
  check("down: no anchor/openShell hooks", (await page.eval("typeof claura.anchor + '/' + typeof claura.openShell")) === "undefined/undefined");
  check("down: console still works (scripted replay seeks)", await page.eval("(claura.seek(14, { approveAt: 7.4 }), claura.state === 'contained')"));
  await page.eval("claura.go('integrations'), true");
  await sleep(600);
  await page.shot(join(OUT, "integrations-down.png"));

  // 2. gateway up mid-session
  gw = await startMockGateway(GW);
  log("mock gateway started (127.0.0.1:" + GW + ")");
  await page.clickSel('[data-act="int-retry"]');
  await page.until("claura.features.gateway === 'up' && claura.features.moduleLoaded", 8000, "gateway up and module loaded");
  await sleep(900);
  const cards = await page.eval("[...document.querySelectorAll('.int-card')].map((c) => ({ name: c.dataset.feature, title: c.querySelector('h3').textContent, track: c.querySelector('.int-track').textContent, badge: c.querySelector('.int-badge span').textContent, open: !c.querySelector('.int-open').disabled }))");
  log(`cards: ${JSON.stringify(cards)}`);
  check("up: 4 cards with title, track and status badge", cards.length === 4 && cards.every((c) => c.title && c.track && c.badge));
  check("up: badges are Live / Mock / Mock / Down", cards.map((c) => c.badge).join() === "Live,Mock,Mock,Down");
  check("up: Open enabled for live and mock features, disabled for the down one", cards.map((c) => c.open).join() === "true,true,true,false");
  check("up: features attached to window.claura", (await page.eval("typeof claura.anchor + '/' + typeof claura.openShell + '/' + typeof claura.voice.toggle")) === "function/function/function");
  check("up: existing keys were not overwritten", (await page.eval("typeof claura.seek + '/' + typeof claura.go")) === "function/function");
  await page.shot(join(OUT, "integrations-up.png"));

  // 3. Open mounts the feature's panel
  await page.clickSel('.int-card[data-feature="solana"] .int-open');
  await sleep(500);
  check("Open: the feature mounted its own panel into the card", (await page.eval("!!document.querySelector('.int-card[data-feature=solana] [data-mock-panel=solana]')")) === true);
  check("Open: button now says Close", (await page.eval("document.querySelector('.int-card[data-feature=solana] .int-open').textContent")) === "Close");
  await page.shot(join(OUT, "integrations-open.png"));

  // 4. anchor from Reports
  await page.eval("claura.seek(14, { approveAt: 7.4 }), claura.openReport(), true");
  await sleep(1200);
  check("Reports: the anchor button is enabled and its tooltip says what it does", (await page.eval("document.getElementById('anchorBtn').getAttribute('aria-disabled')")) === "false", await page.eval("document.getElementById('anchorBtn').dataset.tip"));
  await page.clickSel("#anchorBtn");
  await page.until("document.getElementById('anchorOut').dataset.s === 'ok'", 8000, "anchor result");
  const call = await page.eval("window.__anchorCall");
  check("anchor called with (sha256, 'INC-0419')", /^[0-9a-f]{64}$/.test(call[0]) && call[1] === "INC-0419", `${call[0].slice(0, 12)}..., ${call[1]}`);
  const out = await page.eval("({ text: document.getElementById('anchorOut').textContent, href: document.querySelector('#anchorOut a')?.href, rel: document.querySelector('#anchorOut a')?.rel })");
  check("result shows the signature and an explorer link (https, noopener)", /Anchored on Solana devnet/.test(out.text) && /^https:\/\/explorer\.solana\.com\/tx\//.test(out.href) && /noopener/.test(out.rel), out.href.slice(0, 60) + "...");
  await page.eval("document.querySelector('#scroll').scrollTop = 120, true");
  await sleep(500);
  await page.shot(join(OUT, "reports-anchor.png"));
  // the digest is stable for the same record
  const d1 = await page.eval("document.querySelector('#anchorOut code').title");
  await page.eval("claura.seek(14, { approveAt: 7.4, report: true }), true");
  await sleep(300);
  await page.clickSel("#anchorBtn");
  await page.until("document.getElementById('anchorOut').dataset.s === 'ok'", 8000);
  const d2 = await page.eval("document.querySelector('#anchorOut code').title");
  check("the digest of an unchanged record is repeatable", d1 === d2, d1.slice(0, 16));

  // 5. gateway stops
  await gw.close();
  gw = null;
  log("mock gateway stopped");
  await page.eval("claura.go('integrations'), true");
  await page.clickSel('[data-act="int-open"]').catch(() => {});
  await page.until("claura.features.gateway === 'down'", 16000, "gateway down again (poll)");
  await sleep(700);
  check("stopped: back to the empty state", (await page.eval("document.getElementById('intBody').dataset.state")) === "down");
  const errs = page.logs.filter((l) => !/favicon|ERR_CONNECTION_REFUSED|Failed to load resource|Download the React DevTools/.test(l));
  check("no console errors besides the refused connections", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) {
  ok = false;
  console.error("FAILED:", e.message);
} finally {
  if (gw) await gw.close();
  chrome.close();
}
console.log(ok ? "features proof: ALL PASS" : "features proof: FAILURES");
process.exit(ok ? 0 : 1);
