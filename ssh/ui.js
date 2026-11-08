/* Claura Secure Shell: browser side. One ES module, no build step, no framework.
 *
 *   import { openShell, mountUI, mountTerminal } from '/api/ssh/ui.js';
 *   window.claura.openShell('b14-gpu-07');               // the whole sheet flow (the console's "Open secure shell" button)
 *   mountUI(document.querySelector('#hosts'));           // host list + approvals inbox + recent sessions
 *   mountTerminal(container, requestId);                 // just the terminal, for a request that is already approved
 *
 * Flow:  request (reason pre-filled)  ->  passkey (when the policy asks)  ->  waiting for the approver  ->
 *        terminal (xterm.js, recording, certificate countdown)  ->  summary (recording hash, ledger link, chain check)
 *
 * The browser never holds a key or a certificate. It holds an HttpOnly cookie for ITS OWN request and talks to the
 * gateway; the gateway signs the certificate, runs /usr/bin/ssh and records. window.claura.openShell is only
 * defined if the page has not defined it already; nothing else on window.claura is touched.
 */

const VERSION = '0.1.0';
const SELF = new URL(import.meta.url);
const CFG = {
  base: SELF.pathname.replace(/\/ui\.js$/, '') || '/api/ssh',
  origin: SELF.origin === location.origin ? '' : SELF.origin, // set when the module is served from another origin
  slotId: 'claura-shell-slot', // the console's Shells view mounts the flow here when it exists
  pollMs: 700,
};
export function configure(o = {}) {
  Object.assign(CFG, o);
}

// ------------------------------------------------------------------ small helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (root, sel) => root.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
const keep = {
  get(k) { try { return localStorage.getItem(`claura.ssh.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`claura.ssh.${k}`, v); } catch { /* storage may be blocked */ } },
};
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const url = (p) => `${CFG.origin}${CFG.base}${p}`;
const short = (h, n = 12) => (h ? `${h.slice(0, n)}…` : '');

async function http(method, path, body) {
  let res;
  try {
    res = await fetch(url(path), {
      method,
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      credentials: CFG.origin ? 'include' : 'same-origin',
      cache: 'no-store',
    });
  } catch (err) {
    throw Object.assign(new Error('The secure shell gateway is unreachable.'), { status: 0, cause: err });
  }
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  if (!res.ok || json?.ok === false) throw Object.assign(new Error(json?.error || `HTTP ${res.status}`), { status: res.status });
  return json;
}

// ------------------------------------------------------------------ icons + the Cradle mark
const PATHS = {
  terminal: '<path d="M4.5 6.5l5 5-5 5M12.5 18h7"/>',
  fingerprint: '<path d="M3.5 12a8.5 8.5 0 0 1 17 0c0 1.4-.1 2.6-.4 3.8"/><path d="M6.5 11a5.5 5.5 0 0 1 11 0v1.5c0 3-.6 5.5-1.6 7.5"/><path d="M9.5 20.5c.7-1.6 1-3.4 1-5.5v-4a1.5 1.5 0 0 1 3 0v4.5c0 1.5-.2 2.8-.6 4"/><path d="M12 11v4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.2 3-5 6-5s5.5 1.8 6 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16.5 14.7c2.4.2 4 1.8 4.5 4.8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  shield: '<path d="M12 3.5l7 2.5v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  server: '<rect x="3.5" y="4.5" width="17" height="6" rx="2"/><rect x="3.5" y="13.5" width="17" height="6" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  record: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8.5"/>',
};
const icon = (n, cls = '') => `<svg class="cs-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n] ?? ''}</svg>`;
// Cradle (brand/BRAND.md): the C is the ring, the orb is the breach. The orb is orange during a breach, green when sealed.
const mark = (size = 30) => `<svg class="cs-mark" viewBox="0 0 256 256" width="${size}" height="${size}" aria-hidden="true"><path class="cs-ring" d="M231.95 73.95A111 111 0 1 0 231.95 182.05A7.64 7.64 0 0 0 219.1 173.85A78 78 0 1 1 219.1 82.15A7.64 7.64 0 0 0 231.95 73.95Z"/><path class="cs-seal" d="M108 128a48 48 0 1 0 96 0a48 48 0 1 0-96 0z"/></svg>`;

// ------------------------------------------------------------------ styles
const CSS = `
.cs-scope{--cs-accent:var(--accent,#ff3b30);--cs-accent-rgb:var(--accent-rgb,255,59,48);--cs-safe:var(--safe,#30d158);--cs-safe-rgb:var(--safe-rgb,48,209,88);
  --cs-ink:var(--ink,rgba(249,249,249,.96));--cs-ink2:var(--ink-2,rgba(232,232,232,.7));--cs-ink3:var(--ink-3,rgba(222,222,222,.46));--cs-ink4:rgba(222,222,222,.26);
  --cs-hair:rgba(255,255,255,.09);--cs-f1:rgba(255,255,255,.055);--cs-f2:rgba(255,255,255,.095);--cs-f3:rgba(255,255,255,.15);
  --cs-font:var(--font,-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",system-ui,sans-serif);
  --cs-mono:var(--mono,ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace);--cs-ease:cubic-bezier(.22,1,.36,1);
  color:var(--cs-ink);font:400 15px/1.45 var(--cs-font);letter-spacing:-.006em;-webkit-font-smoothing:antialiased}
.cs-scope *,.cs-scope *::before,.cs-scope *::after{box-sizing:border-box}
.cs-scope button,.cs-scope select,.cs-scope textarea,.cs-scope input{font:inherit;color:inherit;letter-spacing:inherit}
.cs-scope h2,.cs-scope h3,.cs-scope p{margin:0}
.cs-scope :focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:2px}
.cs-mono{font-family:var(--cs-mono);font-feature-settings:"zero"}
.cs-ico{width:18px;height:18px;flex:none}
.cs-mark .cs-ring,.cs-mark .cs-seal{fill:#ff3b30;transition:fill .45s ease-out}
[data-tone="sealed"] .cs-mark .cs-seal,[data-tone="ok"] .cs-mark .cs-seal,.cs-mark.is-sealed .cs-seal{fill:#30d158}

/* ---- overlay + sheet */
.cs-root{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;padding:24px;animation:cs-fade .28s ease-out backwards}
.cs-root.is-leaving{animation:cs-fade-out .22s ease-in forwards}
.cs-scrim{position:absolute;inset:0;background:rgba(5,5,5,.6);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px)}
.cs-sheet{position:relative;width:min(580px,100%);max-height:calc(100vh - 48px);border-radius:38px;display:flex;flex-direction:column;overflow:hidden;
  background:linear-gradient(155deg,rgba(255,255,255,.11) 0%,rgba(255,255,255,.04) 42%,rgba(255,255,255,.02) 100%),rgba(19,19,19,.8);
  -webkit-backdrop-filter:blur(40px) saturate(1.9) brightness(1.08);backdrop-filter:blur(40px) saturate(1.9) brightness(1.08);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.07),inset 0 -1px 0 rgba(0,0,0,.3),inset 0 22px 34px -22px rgba(255,255,255,.12),0 1px 2px rgba(0,0,0,.3),0 24px 54px -16px rgba(0,0,0,.6),0 54px 110px -34px rgba(0,0,0,.55);
  transition:width .55s var(--cs-ease),height .55s var(--cs-ease),border-radius .4s var(--cs-ease);animation:cs-rise .5s var(--cs-ease) backwards}
.cs-sheet::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:3;
  background:linear-gradient(155deg,rgba(255,255,255,.6),rgba(255,255,255,.11) 22%,rgba(255,255,255,.03) 55%,rgba(255,255,255,.24));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.cs-sheet::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(110% 70% at 6% -4%,rgba(255,255,255,.1),transparent 55%)}
.cs-sheet>*{position:relative;z-index:1}
@supports (corner-shape:squircle){.cs-sheet,.cs-sheet::before,.cs-primary,.cs-chip,.cs-card{corner-shape:squircle}}
.cs-root[data-phase="terminal"] .cs-sheet{width:min(1180px,100%);height:min(780px,calc(100vh - 48px));border-radius:34px}
.cs-root.cs-slot{position:absolute;inset:0;z-index:2;padding:0;display:flex;animation:none}
.cs-root.cs-slot .cs-scrim{display:none}
.cs-root.cs-slot .cs-sheet{width:100%;height:100%;max-height:none;border-radius:inherit;background:none;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;animation:none}
.cs-root.cs-slot .cs-sheet::before,.cs-root.cs-slot .cs-sheet::after{display:none}
.cs-root.cs-slot[data-phase="terminal"] .cs-sheet{width:100%}
@keyframes cs-fade{from{opacity:0}to{opacity:1}}@keyframes cs-fade-out{to{opacity:0}}
@keyframes cs-rise{from{opacity:0;transform:translateY(18px) scale(.975)}to{opacity:1;transform:none}}
@keyframes cs-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes cs-ring{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes cs-spin{to{transform:rotate(360deg)}}

/* ---- header + steps */
.cs-head{display:flex;align-items:center;gap:14px;padding:20px 22px 0 26px}
.cs-title{display:flex;flex-direction:column;min-width:0;flex:1}
.cs-title b{font:600 15.5px/1.2 var(--cs-font);letter-spacing:-.012em}
.cs-title span{font-size:13px;color:var(--cs-ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-steps{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:14px 0 0;padding:0 28px}
.cs-steps li{display:flex;align-items:center;gap:7px;height:28px;padding:0 11px 0 8px;border-radius:14px;font-size:12.5px;font-weight:600;color:var(--cs-ink3);background:var(--cs-f1);transition:all .4s var(--cs-ease)}
.cs-steps li i{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:10px;background:var(--cs-f2);color:var(--cs-ink2)}
.cs-steps li.is-now{color:var(--cs-ink);background:rgba(var(--cs-accent-rgb),.16);box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.4)}
.cs-steps li.is-now i{background:var(--cs-accent);color:#fff}
.cs-steps li.is-done{color:var(--cs-safe);background:rgba(var(--cs-safe-rgb),.12)}
.cs-steps li.is-done i{background:var(--cs-safe);color:#101010}
.cs-steps li.is-done i .cs-ico{width:11px;height:11px;stroke-width:3}
.cs-x{appearance:none;border:0;cursor:pointer;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--cs-f2);color:var(--cs-ink2);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);transition:background .2s,transform .14s}
.cs-x:hover{background:var(--cs-f3)}.cs-x:active{transform:scale(.94)}
.cs-root[data-phase="terminal"] .cs-steps{display:none}
.cs-root.cs-slot .cs-steps{padding-left:26px}
.cs-root.cs-slot .cs-sticky{background:linear-gradient(180deg,transparent,rgba(15,15,15,.5) 45%)}

/* ---- body */
.cs-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:22px 28px 28px;overflow:auto}
.cs-root.cs-slot:not([data-phase="terminal"]) .cs-body{align-items:center;justify-content:center}
.cs-root.cs-slot:not([data-phase="terminal"]) .cs-body>.cs-page{width:min(560px,100%)}
.cs-page{display:flex;flex-direction:column;gap:16px;animation:cs-rise .4s var(--cs-ease) backwards}
.cs-page h2{font:600 28px/1.12 var(--cs-font);letter-spacing:-.034em}
.cs-sub{color:var(--cs-ink2);font-size:15.5px;line-height:1.45}
.cs-hero{width:68px;height:68px;border-radius:24px;display:grid;place-items:center;color:var(--cs-accent);background:rgba(var(--cs-accent-rgb),.16);position:relative;
  box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.45),inset 0 1px 0 rgba(255,255,255,.25),0 0 30px -4px rgba(var(--cs-accent-rgb),.4)}
.cs-hero .cs-ico{width:34px;height:34px}
.cs-hero.is-ok{color:var(--cs-safe);background:rgba(var(--cs-safe-rgb),.16);box-shadow:inset 0 0 0 1px rgba(var(--cs-safe-rgb),.45),inset 0 1px 0 rgba(255,255,255,.25),0 0 30px -4px rgba(var(--cs-safe-rgb),.4);border-radius:50%}
.cs-hero.is-pulse::after{content:"";position:absolute;inset:0;border-radius:inherit;border:2px solid rgba(var(--cs-accent-rgb),.6);animation:cs-ring 1.8s ease-out infinite}
.cs-hero.is-spin .cs-ico{animation:cs-spin 1.1s linear infinite}
.cs-chips{display:flex;flex-wrap:wrap;gap:8px}
.cs-chip{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:5px 12px 5px 9px;border-radius:15px;font-size:13px;font-weight:600;color:var(--cs-ink);background:var(--cs-f2);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 0 0 1px rgba(255,255,255,.06)}
.cs-chip .cs-ico{width:15px;height:15px}
.cs-chip.is-gate{background:rgba(var(--cs-accent-rgb),.15);box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.35);color:#ffccc9}
.cs-chip.is-ok{background:rgba(var(--cs-safe-rgb),.13);box-shadow:inset 0 0 0 1px rgba(var(--cs-safe-rgb),.32);color:#c9f5d4}
.cs-label{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;color:var(--cs-ink2)}
.cs-field{width:100%;border:0;border-radius:18px;padding:13px 15px;background:rgba(8,8,8,.45);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),inset 0 2px 6px rgba(0,0,0,.25);font-size:15.5px;line-height:1.4;resize:none;color:var(--cs-ink)}
.cs-field:focus{outline:none;box-shadow:inset 0 0 0 1.5px rgba(var(--cs-accent-rgb),.8),0 0 0 4px rgba(var(--cs-accent-rgb),.18)}
select.cs-field{appearance:none;-webkit-appearance:none;padding-right:34px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%23aab' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1.5 1.5L6 6l4.5-4.5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;background-color:rgba(8,8,8,.45)}
select.cs-field option{background:#171717;color:#f6f6f6}
.cs-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cs-primary{appearance:none;border:0;cursor:pointer;width:100%;height:60px;border-radius:30px;display:flex;align-items:center;justify-content:center;gap:12px;font:600 18px/1 var(--cs-font);letter-spacing:-.014em;color:#fff;
  background:linear-gradient(180deg,#ff5a50 0%,#ff3b30 52%,#d70015 100%);text-shadow:0 1px 1px rgba(120,7,0,.35);
  box-shadow:inset 0 1.5px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.16),inset 0 0 0 1px rgba(255,255,255,.12),0 2px 4px rgba(0,0,0,.3),0 16px 34px -10px rgba(var(--cs-accent-rgb),.7);transition:transform .14s ease,filter .2s ease,opacity .2s}
.cs-primary:hover{filter:brightness(1.06)}.cs-primary:active{transform:scale(.985)}.cs-primary[disabled]{opacity:.55;cursor:default;filter:saturate(.6)}
.cs-primary.is-green{background:linear-gradient(180deg,#52d875 0%,#30d158 55%,#25a947 100%);text-shadow:0 1px 1px rgba(51,51,51,.35);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.5),inset 0 -2px 0 rgba(0,0,0,.14),0 2px 4px rgba(0,0,0,.3),0 16px 34px -10px rgba(var(--cs-safe-rgb),.6)}
.cs-primary kbd{font:600 12px/1 var(--cs-font);padding:4px 7px;border-radius:7px;background:rgba(0,0,0,.18);color:rgba(255,255,255,.85)}
.cs-btn{appearance:none;border:0;cursor:pointer;height:38px;padding:0 17px;border-radius:19px;font-size:14.5px;font-weight:600;display:inline-flex;align-items:center;gap:8px;color:var(--cs-ink);background:var(--cs-f2);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 0 0 1px rgba(255,255,255,.08);transition:background .2s,transform .14s}
a.cs-btn{text-decoration:none}
.cs-btn:hover{background:var(--cs-f3)}.cs-btn:active{transform:scale(.97)}.cs-btn .cs-ico{width:16px;height:16px}
.cs-btn.is-quiet{background:transparent;box-shadow:none;color:var(--cs-ink2)}.cs-btn.is-quiet:hover{background:var(--cs-f1)}
.cs-btn.is-demo{background:rgba(var(--cs-safe-rgb),.15);color:#c9f5d4;box-shadow:inset 0 0 0 1px rgba(var(--cs-safe-rgb),.4)}.cs-btn.is-demo:hover{background:rgba(var(--cs-safe-rgb),.24)}
.cs-btn.is-danger{color:#ffa5a0;background:rgba(var(--cs-accent-rgb),.12);box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.3)}
.cs-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.cs-note{font-size:13px;color:var(--cs-ink3);line-height:1.45}
.cs-sticky{position:sticky;bottom:-28px;margin:0 -28px -28px;padding:16px 28px 28px;background:linear-gradient(180deg,rgba(19,19,19,0),rgba(19,19,19,.94) 42%);z-index:2}
.cs-err{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:rgba(var(--cs-accent-rgb),.12);box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.35);color:#ffccc9;font-size:14px}
.cs-err .cs-ico{margin-top:1px;color:var(--cs-accent)}
.cs-err[hidden]{display:none}

/* ---- waiting: checklist */
.cs-check{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.cs-check li{display:flex;align-items:center;gap:13px;padding:11px 4px;border-bottom:1px solid var(--cs-hair)}
.cs-check li:last-child{border-bottom:0}
.cs-check .dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--cs-f2);color:var(--cs-ink3);position:relative}
.cs-check .dot .cs-ico{width:14px;height:14px;stroke-width:2.6}
.cs-check li.is-done .dot{background:var(--cs-safe);color:#101010}
.cs-check li.is-now .dot{background:rgba(var(--cs-accent-rgb),.2);color:var(--cs-accent);box-shadow:inset 0 0 0 1.5px rgba(var(--cs-accent-rgb),.7)}
.cs-check li.is-now .dot::after{content:"";position:absolute;inset:-1px;border-radius:50%;border:2px solid rgba(var(--cs-accent-rgb),.5);animation:cs-ring 1.8s ease-out infinite}
.cs-check b{font-weight:600;display:block;letter-spacing:-.01em}
.cs-check small{display:block;color:var(--cs-ink3);font-size:13px}
.cs-check li.is-todo b{color:var(--cs-ink3)}
.cs-count{margin-left:auto;font:600 13px/1 var(--cs-mono);color:var(--cs-ink2)}

/* ---- terminal */
.cs-root[data-phase="terminal"] .cs-head{padding-bottom:0}
.cs-root[data-phase="terminal"] .cs-body{padding:14px 18px 18px;gap:12px;overflow:hidden}
.cs-termbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:44px;padding:8px 8px 8px 16px;border-radius:22px;background:var(--cs-f1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.14);font-size:13.5px;color:var(--cs-ink2)}
.cs-termbar b{color:var(--cs-ink);font-weight:600}.cs-termbar .sep{color:var(--cs-ink4)}
.cs-rec{display:inline-flex;align-items:center;gap:7px;color:#ffccc9;font-weight:600}
.cs-rec i{width:9px;height:9px;border-radius:50%;background:var(--cs-accent);box-shadow:0 0 10px 1px rgba(var(--cs-accent-rgb),.8);animation:cs-pulse 1.4s ease-in-out infinite}
.cs-termbar[data-warn="1"] .cs-left{color:#ffc36b}
.cs-termbar[data-warn="2"] .cs-left{color:#ff6259}
.cs-left{font-variant-numeric:tabular-nums;font-weight:600;color:var(--cs-ink)}
.cs-modechip{padding:3px 10px;border-radius:11px;font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;background:rgba(var(--cs-accent-rgb),.16);color:#ffccc9;box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.4)}
.cs-modechip.is-ops{background:rgba(var(--cs-safe-rgb),.14);color:#c9f5d4;box-shadow:inset 0 0 0 1px rgba(var(--cs-safe-rgb),.35)}
.cs-termbar .cs-end{margin-left:auto}
.cs-termframe{position:relative;flex:1;min-height:0;border-radius:24px;overflow:hidden;background:rgba(9,9,9,.82);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),inset 0 2px 10px rgba(0,0,0,.45),0 1px 0 rgba(255,255,255,.08)}
.cs-term{position:absolute;inset:0;padding:0}
.cs-term .xterm{height:100%;padding:14px 6px 8px 16px}.cs-term .xterm-viewport{background:transparent!important;scrollbar-width:thin}
.cs-banner{position:absolute;left:14px;right:14px;bottom:14px;z-index:4;padding:11px 15px;border-radius:16px;font-size:14px;font-weight:600;background:rgba(46,6,4,.92);color:#ffccc9;box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.5),0 12px 30px rgba(0,0,0,.4);animation:cs-rise .3s var(--cs-ease) backwards}
.cs-banner[hidden]{display:none}
.cs-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--cs-ink3);font-size:14px;z-index:2;pointer-events:none}

/* ---- summary */
.cs-facts{display:grid;grid-template-columns:auto 1fr;gap:0 18px;margin:0;border-radius:20px;background:var(--cs-f1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);padding:4px 16px}
.cs-facts dt,.cs-facts dd{margin:0;padding:10px 0;border-bottom:1px solid var(--cs-hair);font-size:14px}
.cs-facts dt{color:var(--cs-ink3)}.cs-facts dd{color:var(--cs-ink);min-width:0;overflow-wrap:anywhere}
.cs-facts dt:nth-last-of-type(1),.cs-facts dd:last-of-type{border-bottom:0}
.cs-hash{font:500 12.5px/1.5 var(--cs-mono);color:#e1e1e1;word-break:break-all;letter-spacing:0}
.cs-verify{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:16px;font-size:14px;background:var(--cs-f1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.cs-verify.is-ok{background:rgba(var(--cs-safe-rgb),.12);box-shadow:inset 0 0 0 1px rgba(var(--cs-safe-rgb),.35);color:#c9f5d4}
.cs-verify.is-bad{background:rgba(var(--cs-accent-rgb),.14);box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.45);color:#ffccc9}
.cs-verify .cs-ico{flex:none}

/* ---- host list (mountUI) */
.cs-list{display:flex;flex-direction:column;gap:22px}
.cs-list-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.cs-list-head h2{font:600 24px/1.1 var(--cs-font);letter-spacing:-.03em}
.cs-list-head span{color:var(--cs-ink3);font-size:13px}
.cs-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.cs-card{position:relative;display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:28px;overflow:hidden;
  background:linear-gradient(155deg,rgba(255,255,255,.11),rgba(255,255,255,.03) 45%,rgba(255,255,255,.02)),rgba(23,23,23,.36);-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 0 1px rgba(255,255,255,.07),0 18px 40px -18px rgba(0,0,0,.55)}
.cs-card h3{font:600 17px/1.2 var(--cs-mono);letter-spacing:-.01em;display:flex;align-items:center;gap:9px}
.cs-card p{color:var(--cs-ink3);font-size:13px;line-height:1.4}
.cs-card .where{color:var(--cs-ink2);font-size:13px}
.cs-status{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--cs-safe);box-shadow:0 0 10px 1px rgba(var(--cs-safe-rgb),.7)}
.cs-status.is-hot{background:var(--cs-accent);box-shadow:0 0 10px 1px rgba(var(--cs-accent-rgb),.8)}.cs-status.is-down{background:#818181;box-shadow:none}
.cs-card .cs-btn{align-self:flex-start;margin-top:auto}
.cs-sec{display:flex;flex-direction:column;gap:10px}
.cs-sec h3{font:600 13px/1 var(--cs-font);letter-spacing:.04em;text-transform:uppercase;color:var(--cs-ink3);display:flex;align-items:center;gap:10px}
.cs-rows{display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:var(--cs-f1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.cs-rowi{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--cs-hair);font-size:14px}
.cs-rowi:last-child{border-bottom:0}.cs-rowi .grow{flex:1;min-width:200px}.cs-rowi small{display:block;color:var(--cs-ink3);font-size:12.5px}
.cs-empty{padding:18px;color:var(--cs-ink3);font-size:14px;text-align:center}
.cs-mini{height:32px;padding:0 13px;font-size:13px}
.cs-sel{height:32px;border:0;border-radius:16px;padding:0 28px 0 12px;font-size:13px;font-weight:600;appearance:none;-webkit-appearance:none;background:var(--cs-f2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' fill='none' stroke='%23aab' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.2l4 4 4-4'/%3E%3C/svg%3E") no-repeat right 10px center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.cs-sel option{background:#171717;color:#f6f6f6}
.cs-banner-top{padding:10px 14px;border-radius:14px;font-size:13px;font-weight:600;background:rgba(var(--cs-accent-rgb),.14);color:#ffccc9;box-shadow:inset 0 0 0 1px rgba(var(--cs-accent-rgb),.4)}

@media (max-width:700px){
  .cs-root{padding:0;place-items:end center}
  .cs-sheet,.cs-root[data-phase="terminal"] .cs-sheet{width:100%;max-height:calc(100vh - 12px);border-radius:30px 30px 0 0}
  .cs-root[data-phase="terminal"] .cs-sheet{height:calc(100vh - 12px)}
  .cs-head{padding:16px 16px 0 20px}.cs-steps{padding:0 20px;gap:5px;flex-wrap:nowrap}.cs-steps li{height:26px;font-size:12px}.cs-steps li:not(.is-now) .lbl{display:none}.cs-steps li:not(.is-now){padding-right:8px}
  .cs-body{padding:14px 20px 22px}.cs-row{grid-template-columns:1fr}.cs-page{gap:13px}.cs-page h2{font-size:23px}.cs-sub{font-size:14.5px}
  .cs-hero{width:52px;height:52px;border-radius:19px}.cs-hero .cs-ico{width:26px;height:26px}.cs-chips{gap:6px}.cs-chip{font-size:12.5px;min-height:28px;padding:4px 10px 4px 8px}
  .cs-field{font-size:15px;padding:11px 13px}.cs-primary{height:54px;font-size:17px}.cs-sticky{bottom:-22px;margin:0 -20px -22px;padding:14px 20px 22px}
}
@media (prefers-reduced-motion:reduce){.cs-root,.cs-sheet,.cs-page,.cs-banner{animation:none!important}.cs-sheet,.cs-steps li,.cs-mark .cs-seal{transition:none!important}.cs-rec i,.cs-hero.is-pulse::after,.cs-check li.is-now .dot::after{animation:none!important}}
`;

let cssDone = false;
function injectStyles() {
  if (cssDone || document.getElementById('claura-ssh-css')) return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'claura-ssh-css';
  st.textContent = CSS;
  document.head.append(st);
}

let xtermCss;
function loadXtermCss() {
  xtermCss ??= new Promise((resolve) => {
    if (document.querySelector('link[data-claura-xterm]')) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url('/vendor/xterm.css');
    l.dataset.claura_xterm = '1';
    l.setAttribute('data-claura-xterm', '1');
    l.onload = () => resolve();
    l.onerror = () => resolve();
    document.head.append(l);
    setTimeout(resolve, 2000);
  });
  return xtermCss;
}
let xtermLib;
function loadXterm() {
  xtermLib ??= Promise.all([import(/* @vite-ignore */ url('/vendor/xterm.mjs')), import(/* @vite-ignore */ url('/vendor/addon-fit.mjs')), loadXtermCss()]).then(([x, f]) => ({ Terminal: x.Terminal, FitAddon: f.FitAddon }));
  return xtermLib;
}
let webauthnLib;
function loadWebAuthn() {
  webauthnLib ??= new Promise((resolve, reject) => {
    if (globalThis.SimpleWebAuthnBrowser) return resolve(globalThis.SimpleWebAuthnBrowser);
    const s = document.createElement('script');
    s.src = url('/vendor/webauthn.js');
    s.onload = () => (globalThis.SimpleWebAuthnBrowser ? resolve(globalThis.SimpleWebAuthnBrowser) : reject(new Error('passkey library did not load')));
    s.onerror = () => reject(new Error('could not load the passkey library'));
    document.head.append(s);
  });
  return webauthnLib;
}

// ------------------------------------------------------------------ gateway data
let hostsCache = null;
let hostsAt = 0;
async function getHosts(force = false) {
  if (!force && hostsCache && Date.now() - hostsAt < 4000) return hostsCache;
  hostsCache = await http('GET', '/hosts');
  hostsAt = Date.now();
  return hostsCache;
}

const REASONS = {
  'user-ended': 'You ended the session.',
  exit: 'You logged out.',
  'cert-expired': 'The certificate expired, so Claura closed the session. Nothing was left behind to reuse.',
  revoked: 'The certificate was revoked. The host refuses it now.',
  'client-closed': 'The browser disconnected.',
  'server-shutdown': 'The gateway shut down.',
  'ssh-failed': 'The SSH connection to the host failed.',
  cancelled: 'The request was cancelled.',
  error: 'The session ended with an error.',
};

const policyChips = (p) => {
  const c = [];
  if (p.stepUp) c.push(`<span class="cs-chip is-gate">${icon('fingerprint')}Passkey check</span>`);
  c.push(`<span class="cs-chip is-gate">${icon('users')}${p.approvals === 1 ? 'A second person approves' : `${p.approvals} people approve`}</span>`);
  c.push(p.readOnly
    ? `<span class="cs-chip is-gate">${icon('eye')}Read-only forensic session</span>`
    : `<span class="cs-chip is-ok">${icon('terminal')}Operator session, scratch space only</span>`);
  c.push(`<span class="cs-chip">${icon('clock')}Certificate lasts up to ${p.maxMinutes} min</span>`);
  c.push(`<span class="cs-chip">${icon('record')}Recorded and hash-chained</span>`);
  return c.join('');
};

// ------------------------------------------------------------------ terminal
/**
 * Mount an xterm.js terminal for an approved request. Returns once the sockets are wired:
 *   { term, ready, closed, end(), dispose() }
 * `ready` resolves with the gateway's ready message, `closed` with {reason, summary}.
 */
export async function mountTerminal(container, requestId, hooks = {}) {
  injectStyles();
  const { Terminal, FitAddon } = await loadXterm();
  const host = document.createElement('div');
  host.className = 'cs-term cs-scope';
  container.append(host);
  const term = new Terminal({
    fontFamily: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13.5,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowTransparency: true,
    macOptionIsMeta: true,
    theme: {
      background: 'rgba(0,0,0,0)', foreground: '#ebebeb', cursor: '#ff3b30', cursorAccent: '#0a0a0a', selectionBackground: 'rgba(255,59,48,.32)',
      black: '#171717', red: '#ff6157', green: '#3ddc66', yellow: '#ffbb57', blue: '#a7a7a7', magenta: '#a7a7a7', cyan: '#c6c6c6', white: '#dedede',
      brightBlack: '#656565', brightRed: '#ff8078', brightGreen: '#73e691', brightYellow: '#ffd08a', brightBlue: '#bdbdbd', brightMagenta: '#c2c2c2', brightCyan: '#d9d9d9', brightWhite: '#ffffff',
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  const doFit = () => { try { fit.fit(); } catch { /* not laid out yet */ } };
  doFit();

  const wsBase = CFG.origin ? CFG.origin.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  const ws = new WebSocket(`${wsBase}${CFG.base}/session?requestId=${encodeURIComponent(requestId)}&cols=${term.cols}&rows=${term.rows}`);
  ws.binaryType = 'arraybuffer';
  const enc = new TextEncoder();
  let readyMsg = null;
  let closedMsg = null;
  let disposed = false;
  let resolveReady;
  let resolveClosed;
  const ready = new Promise((r) => { resolveReady = r; });
  const closed = new Promise((r) => { resolveClosed = r; });
  const finish = (m) => {
    if (closedMsg) return;
    closedMsg = m;
    resolveClosed(m);
    hooks.onClosed?.(m);
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return term.write(new Uint8Array(ev.data));
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'ready') {
      readyMsg = m;
      resolveReady(m);
      hooks.onReady?.(m);
      term.focus();
    } else if (m.type === 'warn') hooks.onWarn?.(m);
    else if (m.type === 'closed') finish({ reason: m.reason, summary: m.summary });
    else if (m.type === 'error') {
      hooks.onError?.(m);
      resolveReady(null);
      finish({ reason: 'error', error: m.error, code: m.code });
    }
  };
  ws.onclose = () => {
    if (!closedMsg) finish({ reason: readyMsg ? 'client-closed' : 'error', error: readyMsg ? 'The connection to the gateway was lost.' : 'Could not reach the terminal.' });
    resolveReady(null);
  };
  ws.onerror = () => { /* onclose follows */ };

  term.onData((d) => { if (ws.readyState === WebSocket.OPEN && readyMsg) ws.send(enc.encode(d)); });
  term.onResize(({ cols, rows }) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows })); });
  let fitTimer = 0;
  const ro = new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(doFit, 40); });
  ro.observe(host);
  // the sheet animates its size: fit again when it settles
  const settle = setTimeout(doFit, 650);

  const api = {
    term,
    ready,
    closed,
    focus: () => term.focus(),
    end() { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end' })); },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(settle);
      clearTimeout(fitTimer);
      ro.disconnect();
      try { ws.close(); } catch { /* closed */ }
      try { term.dispose(); } catch { /* disposed */ }
      host.remove();
    },
  };
  return api;
}

// ------------------------------------------------------------------ the sheet flow
let active = null;
const STEP_LABELS = { request: 'Request', passkey: 'Passkey', approval: 'Approval', shell: 'Shell' };

class Flow {
  constructor({ hostId, container, onClose }) {
    this.hostId = hostId;
    this.container = container;
    this.slot = !!container;
    this.onClose = onClose;
    this.phase = 'loading';
    this.req = null;
    this.offset = 0; // server clock minus local clock
    this.timers = new Set();
    this.term = null;
    this.expiresAt = 0;
    this.alive = true;
    this.mounted = this.#mount();
  }

  now() { return Date.now() + this.offset; }

  #every(fn, ms) { const t = setInterval(fn, ms); this.timers.add(t); return t; }
  #stop(t) { clearInterval(t); this.timers.delete(t); }

  #mount() {
    injectStyles();
    const root = document.createElement('div');
    root.className = `cs-root cs-scope ${this.slot ? 'cs-slot' : 'cs-overlay'}`;
    root.dataset.phase = 'loading';
    root.dataset.tone = 'breach';
    root.innerHTML = `${this.slot ? '' : '<div class="cs-scrim" data-act="scrim"></div>'}
      <section class="cs-sheet" role="dialog" aria-modal="${this.slot ? 'false' : 'true'}" aria-label="Secure shell">
        <header class="cs-head">${mark(34)}<div class="cs-title"><b>Secure shell</b><span data-bind="sub">${esc(this.hostId)}</span></div>
          <button type="button" class="cs-x" data-act="close" aria-label="Close">${icon('x')}</button></header>
        <ol class="cs-steps" data-bind="steps" aria-label="Progress"></ol>
        <div class="cs-body" data-bind="body" aria-live="polite"></div>
      </section>`;
    if (this.container && getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
    (this.container ?? document.body).append(root);
    this.root = root;
    this.body = $(root, '[data-bind="body"]');
    root.addEventListener('click', (e) => this.#click(e));
    root.addEventListener('keydown', (e) => this.#key(e));
    this.#every(() => this.#tick(), 250);
    this.keyHandler = (e) => { if (e.key === 'Escape' && this.phase !== 'terminal' && !this.slot) this.close(); };
    document.addEventListener('keydown', this.keyHandler);
    return this;
  }

  #setPhase(p, tone) {
    this.phase = p;
    this.root.dataset.phase = p;
    if (tone) this.root.dataset.tone = tone;
    this.#steps();
  }

  #steps() {
    const el = $(this.root, '[data-bind="steps"]');
    const needs = !!this.host?.policy?.stepUp;
    const order = needs ? ['request', 'passkey', 'approval', 'shell'] : ['request', 'approval', 'shell'];
    const at = { loading: 0, request: 0, passkey: 1, waiting: needs ? 2 : 1, terminal: needs ? 3 : 2, summary: order.length, ended: -1, error: -1 }[this.phase] ?? 0;
    el.innerHTML = order.map((k, i) => {
      const cls = i < at ? 'is-done' : i === at ? 'is-now' : '';
      return `<li class="${cls}"><i>${cls === 'is-done' ? icon('check') : i + 1}</i><span class="lbl">${STEP_LABELS[k]}</span></li>`;
    }).join('');
  }

  #sub(text) { $(this.root, '[data-bind="sub"]').textContent = text; }

  #page(html) {
    this.body.innerHTML = `<div class="cs-page">${html}</div>`;
    const first = this.body.querySelector('[data-autofocus]');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  }

  #click(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'scrim' && this.phase !== 'terminal') return this.close();
    if (act === 'close') return this.phase === 'terminal' ? this.#confirmEnd(t) : this.close();
    const fn = this[`act_${act}`];
    if (typeof fn === 'function') fn.call(this, t, e);
  }

  #key(e) {
    if (this.phase === 'request' && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      this.act_submit();
    }
  }

  #confirmEnd(btn) {
    if (btn.dataset.armed === '1') return this.act_end();
    btn.dataset.armed = '1';
    const old = btn.innerHTML;
    btn.classList.add('is-danger');
    btn.innerHTML = 'End session?';
    setTimeout(() => { btn.dataset.armed = '0'; btn.classList.remove('is-danger'); btn.innerHTML = old; }, 3000);
  }

  /** The console's Shells view was not on screen after all: float the flow as an overlay instead. */
  toOverlay() {
    if (!this.slot || !this.alive) return;
    this.slot = false;
    this.root.classList.remove('cs-slot');
    this.root.classList.add('cs-overlay');
    this.root.insertAdjacentHTML('afterbegin', '<div class="cs-scrim" data-act="scrim"></div>');
    $(this.root, '.cs-sheet').setAttribute('aria-modal', 'true');
    document.body.append(this.root);
  }

  nudge() {
    const bar = $(this.root, '.cs-termbar');
    if (bar) bar.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
  }

  // ---------------------------------------------------------------- phases
  async start() {
    this.lastStatus = null;
    this.waitSig = null;
    this.warned = false;
    this.#setPhase('loading');
    this.#page(`<div class="cs-hero is-spin">${icon('shield')}</div><h2>Contacting the gateway</h2><p class="cs-sub">Checking the access policy for <span class="cs-mono">${esc(this.hostId)}</span>.</p>`);
    try {
      this.data = await getHosts(true);
      this.offset = this.data.serverNow - Date.now();
    } catch (err) {
      return this.#fail('Secure shell gateway unreachable', err.message, 'Try again', 'retry');
    }
    this.host = this.data.hosts.find((h) => h.id === this.hostId);
    if (!this.host) return this.#noTarget();
    this.#sub(`${this.host.id} · ${this.host.where}`);
    if (!this.host.up) return this.#fail(`${this.host.id} is not reachable`, this.host.error || 'The host did not answer. Nothing was requested.', 'Check again', 'retry');
    this.showRequest();
  }

  #noTarget() {
    const ok = this.data.hosts.filter((h) => h.up);
    this.#setPhase('error');
    this.#page(`<div class="cs-hero">${icon('server')}</div>
      <h2>No secure shell is enrolled for <span class="cs-mono">${esc(this.hostId)}</span></h2>
      <p class="cs-sub">Secure shell reaches hosts that run Claura's certificate-trusting sshd. In this deployment that is:</p>
      <div class="cs-chips">${ok.map((h) => `<button type="button" class="cs-btn" data-act="pick" data-host="${esc(h.id)}">${icon('terminal')}<span class="cs-mono">${esc(h.id)}</span></button>`).join('')}</div>
      <div class="cs-actions"><button type="button" class="cs-btn is-quiet" data-act="close">Close</button></div>`);
  }

  act_pick(btn) {
    this.hostId = btn.dataset.host;
    this.start();
  }

  act_retry() { this.start(); }

  #fail(title, message, cta, act) {
    this.#setPhase('error');
    this.#page(`<div class="cs-hero">${icon('alert')}</div><h2>${esc(title)}</h2><p class="cs-sub">${esc(message)}</p>
      <div class="cs-actions">${cta ? `<button type="button" class="cs-primary" data-act="${act}" data-autofocus>${esc(cta)}</button>` : ''}</div>
      <div class="cs-actions"><button type="button" class="cs-btn is-quiet" data-act="close">Close</button></div>`);
  }

  showRequest() {
    const h = this.host;
    const p = h.policy;
    const people = this.data.people.filter((x) => x.roles.includes('operator'));
    const last = keep.get('operator');
    const who = people.find((x) => x.id === last) ?? people.find((x) => !x.roles.includes('commander')) ?? people[0];
    const hot = p.class === 'suspect';
    this.#setPhase('request', hot ? 'breach' : 'ok');
    const mins = [5, 10, 15].filter((m) => m <= p.maxMinutes);
    this.#page(`
      <div class="cs-hero">${icon('terminal')}</div>
      <div><h2>Open a shell on <span class="cs-mono">${esc(h.id)}</span></h2>
        <p class="cs-sub" style="margin-top:8px">${hot ? 'This host is under investigation. ' : ''}Claura signs a one-time SSH certificate when the policy is met. No password, no saved key.</p></div>
      <div class="cs-chips">${policyChips(p)}</div>
      ${this.data.skipPasskey ? `<div class="cs-err">${icon('alert')}<span>Passkey check is switched off on this gateway (DEMO_SKIP_PASSKEY). Test mode only.</span></div>` : ''}
      <label class="cs-label">Why do you need access? <span style="font-weight:400;color:var(--cs-ink3)">It goes in the audit log.</span>
        <textarea class="cs-field" rows="2" maxlength="300" data-bind="reason" data-autofocus>${esc(h.reasonHint)}</textarea></label>
      <div class="cs-row">
        <label class="cs-label">Requesting as <select class="cs-field" data-bind="operator">${people.map((x) => `<option value="${esc(x.id)}" ${x.id === who.id ? 'selected' : ''}>${esc(x.initials)} · ${esc(x.title)}</option>`).join('')}</select></label>
        <label class="cs-label">Certificate lifetime <select class="cs-field" data-bind="minutes">${mins.map((m) => `<option value="${m}" ${m === p.defaultMinutes ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></label>
      </div>
      <div class="cs-err" data-bind="err" hidden></div>
      <div class="cs-sticky"><button type="button" class="cs-primary" data-act="submit" data-bind="go">Request access <kbd>${MOD}↵</kbd></button></div>`);
  }

  async act_submit() {
    if (this.phase !== 'request' || this.submitting) return;
    const reason = $(this.root, '[data-bind="reason"]').value.trim();
    const operator = $(this.root, '[data-bind="operator"]').value;
    const minutes = Number($(this.root, '[data-bind="minutes"]').value);
    const err = $(this.root, '[data-bind="err"]');
    const go = $(this.root, '[data-bind="go"]');
    err.hidden = true;
    if (reason.length < 5) {
      err.hidden = false;
      err.innerHTML = `${icon('alert')}<span>Say why you need access (at least a few words). It is written to the audit log.</span>`;
      return;
    }
    this.submitting = true;
    go.disabled = true;
    go.innerHTML = 'Requesting…';
    keep.set('operator', operator);
    try {
      const out = await http('POST', '/request', { host: this.hostId, operator, reason, minutes });
      this.offset = out.serverNow - Date.now();
      this.req = out.request;
      this.submitting = false;
      this.advance();
    } catch (e) {
      this.submitting = false;
      go.disabled = false;
      go.innerHTML = `Request access <kbd>${MOD}↵</kbd>`;
      err.hidden = false;
      err.innerHTML = `${icon('alert')}<span>${esc(e.message)}</span>`;
    }
  }

  advance() {
    const r = this.req;
    if (!this.alive || !r) return;
    if (this.lastStatus === r.status && this.phase !== 'request') return;
    this.lastStatus = r.status;
    switch (r.status) {
      case 'awaiting_passkey': return this.showPasskey();
      case 'awaiting_approval': return this.showWaiting();
      case 'approved':
      case 'active': return this.showTerminal();
      case 'denied': return this.#ended('Request denied', `${r.closeReason ?? 'An approver denied the request.'} Nothing was issued.`);
      case 'expired': return this.#ended('Request expired', 'Nobody approved in time, so the request closed. Nothing was issued.');
      case 'revoked': return this.#ended('Request closed', r.closeReason ? `${r.closeReason}.` : 'The request was withdrawn. Nothing is left to use.');
      default: return undefined;
    }
  }

  #poll(ms = CFG.pollMs) {
    this.#stopPoll();
    this.pollTimer = this.#every(async () => {
      if (!this.alive || this.polling) return;
      this.polling = true;
      try {
        const out = await http('GET', `/request/${this.req.id}`);
        this.offset = out.serverNow - Date.now();
        this.req = out.request;
        if (this.phase === 'waiting') this.#renderWaiting(false);
        this.advance();
      } catch (e) {
        if (e.status === 404) { this.#stopPoll(); this.#fail('The request is gone', 'The gateway no longer knows this request.', 'Start over', 'retry'); }
      } finally {
        this.polling = false;
      }
    }, ms);
  }

  #stopPoll() {
    if (this.pollTimer) this.#stop(this.pollTimer);
    this.pollTimer = null;
  }

  // -- passkey
  showPasskey() {
    this.#setPhase('passkey');
    this.#page(`
      <div class="cs-hero is-pulse" data-bind="hero">${icon('fingerprint')}</div>
      <div><h2>Confirm it is you</h2>
        <p class="cs-sub" style="margin-top:8px" data-bind="pk-text">Use Touch ID or your security key. This proves a person is at the keyboard, not malware riding this console session. The check is bound to this one request.</p></div>
      <div class="cs-err" data-bind="err" hidden></div>
      <button type="button" class="cs-primary" data-act="passkey" data-bind="go" data-autofocus>${icon('fingerprint')}Use passkey</button>
      <div class="cs-actions"><button type="button" class="cs-btn is-quiet" data-act="cancel">Cancel request</button></div>`);
    this.act_passkey();
  }

  async act_passkey() {
    if (this.passkeyBusy) return;
    this.passkeyBusy = true;
    const err = $(this.root, '[data-bind="err"]');
    const go = $(this.root, '[data-bind="go"]');
    const text = $(this.root, '[data-bind="pk-text"]');
    if (err) err.hidden = true;
    if (go) go.disabled = true;
    try {
      const SW = await loadWebAuthn();
      const opts = await http('POST', `/request/${this.req.id}/passkey/options`, {});
      if (opts.mode === 'register' && text) text.textContent = `First time on this device: create a passkey for ${this.req.operator.toUpperCase()}. Next time it is one touch.`;
      const response = opts.mode === 'register'
        ? await SW.startRegistration({ optionsJSON: opts.options })
        : await SW.startAuthentication({ optionsJSON: opts.options });
      const out = await http('POST', `/request/${this.req.id}/passkey/verify`, { mode: opts.mode, response });
      this.offset = out.serverNow - Date.now();
      this.req = out.request;
      this.passkeyBusy = false;
      this.advance();
    } catch (e) {
      this.passkeyBusy = false;
      if (!this.alive || this.phase !== 'passkey') return;
      if (go) { go.disabled = false; go.innerHTML = `${icon('fingerprint')}Try the passkey again`; }
      if (err) {
        err.hidden = false;
        const cancelled = e?.name === 'NotAllowedError' || /cancel|timed out|not allowed/i.test(e?.message ?? '');
        const ip = /^[\d.]+$|^\[/.test(location.hostname);
        err.innerHTML = `${icon('alert')}<span>${esc(ip ? `Passkeys need a hostname, not an IP address. Open this page as http://localhost:${location.port || 80}.` : cancelled ? 'The passkey prompt was cancelled or timed out. Nothing was issued.' : e.message)}</span>`;
      }
    }
  }

  // -- waiting for the approver
  showWaiting() {
    this.#setPhase('waiting');
    const r = this.req;
    this.#page(`
      <div class="cs-hero is-pulse">${icon('users')}</div>
      <div><h2 data-bind="w-title">Waiting for an approver</h2>
        <p class="cs-sub" style="margin-top:8px">No certificate exists yet. It is signed only after the checks below pass, and never for the person who asked.</p></div>
      <ul class="cs-check" data-bind="check"></ul>
      <div data-bind="demo"></div>
      <div class="cs-actions"><button type="button" class="cs-btn is-quiet" data-act="cancel">Cancel request</button>
        <span class="cs-note" style="margin-left:auto">Request expires in <b class="cs-mono" data-bind="decide">--:--</b></span></div>`);
    this.#renderWaiting(true);
    this.#poll();
  }

  #renderWaiting(force) {
    const r = this.req;
    const sig = `${r.status}|${r.approvals.length}|${r.stepUp.done}`;
    if (!force && sig === this.waitSig) return;
    this.waitSig = sig;
    const need = r.approvalsNeeded;
    const have = r.approvals.length;
    const names = r.approvals.map((a) => a.approver.toUpperCase()).join(', ');
    const items = [
      { s: 'is-done', t: 'Reason recorded', d: esc(r.reason) },
    ];
    if (r.stepUp.required) items.push({ s: r.stepUp.done ? 'is-done' : 'is-now', t: r.stepUp.done ? 'Passkey confirmed' : 'Passkey check', d: r.stepUp.done ? esc(`${r.stepUp.method}`) : 'Waiting for your passkey' });
    items.push({ s: have >= need ? 'is-done' : 'is-now', t: need === 1 ? 'A second person approves' : `${need} people approve`, d: have ? esc(`Approved by ${names}`) : 'Waiting. The requester cannot approve their own request.', c: `${have} / ${need}` });
    items.push({ s: r.cert ? 'is-done' : 'is-todo', t: 'Certificate signed', d: r.cert ? esc(`serial ${r.cert.serial}, principal ${r.cert.principal}`) : `One principal, chosen by policy: ${esc(r.policy.principal)}` });
    $(this.root, '[data-bind="check"]').innerHTML = items.map((i) => `<li class="${i.s}"><span class="dot">${i.s === 'is-done' ? icon('check') : ''}</span><span><b>${i.t}</b><small>${i.d}</small></span>${i.c ? `<span class="cs-count">${i.c}</span>` : ''}</li>`).join('');
    const approvers = this.data.demo?.approvers ?? [];
    const next = approvers.map((id) => this.data.people.find((p) => p.id === id)).find((p) => p && p.id !== r.operator && !r.approvals.some((a) => a.approver === p.id));
    const demo = $(this.root, '[data-bind="demo"]');
    demo.innerHTML = next && have < need
      ? `<button type="button" class="cs-primary is-green" data-act="demo-approve" data-who="${esc(next.id)}">${icon('check')}Approve as ${esc(next.title)} (${esc(next.initials)})</button>
         <p class="cs-note" style="margin-top:8px">Demo shortcut. In production the approver confirms in their own console, with their own passkey.</p>` : '';
  }

  #tick() {
    if (this.phase === 'waiting') {
      const el = $(this.root, '[data-bind="decide"]');
      if (el) el.textContent = mmss(this.req.decideBy - this.now());
    }
    if (this.phase === 'terminal') this.#tickTerm();
  }

  async 'act_demo-approve'(btn) {
    btn.disabled = true;
    try {
      const out = await http('POST', '/approve', { requestId: this.req.id, approver: btn.dataset.who });
      this.offset = out.serverNow - Date.now();
      this.req = out.request;
      this.#renderWaiting(true);
      this.advance();
    } catch (e) {
      btn.disabled = false;
      const demo = $(this.root, '[data-bind="demo"]');
      demo.insertAdjacentHTML('beforeend', `<div class="cs-err" style="margin-top:10px">${icon('alert')}<span>${esc(e.message)}</span></div>`);
    }
  }

  async act_cancel() {
    this.#stopPoll();
    try { await http('POST', `/request/${this.req.id}/cancel`, {}); } catch { /* already finished */ }
    this.close();
  }

  // -- terminal
  async showTerminal() {
    if (this.phase === 'terminal' || this.termStarting) return;
    this.termStarting = true;
    this.#stopPoll();
    const r = this.req;
    const hot = r.policy.readOnly;
    this.#setPhase('terminal', hot ? 'breach' : 'ok');
    this.#sub(`${r.host} · ${r.policy.label}`);
    this.expiresAt = r.cert ? r.cert.validBefore : 0;
    this.body.innerHTML = `
      <div class="cs-termbar" data-warn="0">
        <b class="cs-mono">${esc(r.host)}</b><span class="sep">·</span><span class="cs-mono">${esc(r.policy.principal)}</span><span class="sep">·</span>
        <span class="cs-rec"><i></i>Recording</span><span class="sep">·</span>
        <span>cert expires <span class="cs-left" data-bind="left">${mmss(this.expiresAt - this.now())}</span></span><span class="sep">·</span>
        <span class="cs-modechip ${hot ? '' : 'is-ops'}">${hot ? 'read-only forensic' : 'operator session'}</span>
        <button type="button" class="cs-btn cs-end" data-act="end" data-bind="endbtn">${icon('x')}End session</button>
      </div>
      <div class="cs-termframe"><div class="cs-loading" data-bind="loading">Connecting through the gateway…</div><div class="cs-banner" data-bind="banner" hidden></div></div>`;
    const frame = $(this.root, '.cs-termframe');
    try {
      this.term = await mountTerminal(frame, r.id, {
        onReady: (m) => {
          this.offset = m.serverNow - Date.now();
          this.expiresAt = m.expiresAt;
          const l = $(this.root, '[data-bind="loading"]');
          if (l) l.remove();
        },
        onWarn: (m) => this.#banner(`Certificate expires in ${m.secondsLeft} seconds. The session will close automatically.`),
        onClosed: (m) => this.#closed(m),
      });
    } catch (e) {
      this.#fail('Could not open the terminal', e.message, 'Close', 'close');
    }
    this.termStarting = false;
  }

  #tickTerm() {
    const left = this.expiresAt - this.now();
    const el = $(this.root, '[data-bind="left"]');
    if (el) el.textContent = mmss(left);
    const bar = $(this.root, '.cs-termbar');
    if (bar) bar.dataset.warn = left < 20_000 ? '2' : left < 60_000 ? '1' : '0';
    if (left < 60_000 && left > 0 && !this.warned) { this.warned = true; this.#banner(`Certificate expires in under a minute. The session will close automatically.`); }
  }

  #banner(text) {
    const b = $(this.root, '[data-bind="banner"]');
    if (!b) return;
    b.textContent = text;
    b.hidden = false;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.hidden = true; }, 7000);
  }

  act_end() {
    const b = $(this.root, '[data-bind="endbtn"]');
    if (b) b.disabled = true;
    this.term?.end();
  }

  async #closed(m) {
    if (!this.alive || this.phase === 'summary') return;
    const sum = m.summary;
    if (!sum) {
      this.term?.dispose();
      this.term = null;
      return this.#fail(m.reason === 'error' ? 'The terminal could not start' : 'The session ended', m.error || REASONS[m.reason] || 'The connection closed.', 'Close', 'close');
    }
    // let the last bytes of output land, then show the summary over the same sheet
    await sleep(350);
    this.term?.dispose();
    this.term = null;
    this.summary = sum;
    this.#summary(m.reason, sum);
  }

  // -- summary
  #summary(reason, s) {
    this.#setPhase('summary', 'sealed');
    this.#sub(`${s.host} · session sealed`);
    const dur = Math.max(1, Math.round(s.durationMs / 1000));
    this.#page(`
      <div class="cs-hero is-ok">${icon('shield')}</div>
      <div><h2>Session sealed</h2><p class="cs-sub" style="margin-top:8px">${esc(REASONS[reason] ?? REASONS[s.reason] ?? 'The session ended.')} The certificate is useless now and its keys are wiped.</p></div>
      <dl class="cs-facts">
        <dt>Host</dt><dd class="cs-mono">${esc(s.host)}</dd>
        <dt>Who</dt><dd>${esc(s.operator.toUpperCase())} as <span class="cs-mono">${esc(s.principal)}</span></dd>
        <dt>Duration</dt><dd>${dur < 60 ? `${dur} s` : `${Math.floor(dur / 60)} min ${dur % 60} s`} · ${s.commands.total} command${s.commands.total === 1 ? '' : 's'}${s.commands.denied ? `, <b style="color:#ffa5a0">${s.commands.denied} denied by policy</b>` : ''}</dd>
        <dt>Certificate</dt><dd class="cs-mono">serial ${esc(s.certSerial)} · ${esc(s.certId)}</dd>
        <dt>Recording</dt><dd><div class="cs-hash" data-bind="rechash">${esc(s.recording.sha256)}</div><div class="cs-note">SHA-256 of the asciicast v2 file, ${s.recording.bytes.toLocaleString()} bytes</div></dd>
        <dt>Ledger</dt><dd class="cs-mono">entry #${s.ledger.seq} · ${esc(short(s.ledger.hash, 16))} ← ${esc(short(s.ledger.prev, 8))}</dd>
      </dl>
      <div class="cs-verify" data-bind="verify">${icon('link')}<span>Checking the hash chains…</span></div>
      <div class="cs-actions">
        <a class="cs-btn" data-bind="dl" href="${url(`/recording/${encodeURIComponent(s.sessionId)}`)}" download="${esc(s.sessionId)}.cast">${icon('download')}Recording (.cast)</a>
        <button type="button" class="cs-btn" data-act="copyhash">${icon('copy')}Copy hash</button>
        <button type="button" class="cs-btn" data-act="reverify">${icon('link')}Verify again</button>
        <button type="button" class="cs-btn is-quiet" data-act="again" style="margin-left:auto">New session</button>
        <button type="button" class="cs-btn" data-act="close" data-autofocus>Done</button>
      </div>`);
    this.act_reverify();
  }

  async act_reverify() {
    const el = $(this.root, '[data-bind="verify"]');
    if (!el) return;
    el.className = 'cs-verify';
    el.innerHTML = `${icon('link')}<span>Checking the hash chains…</span>`;
    try {
      const v = await http('GET', '/ledger/verify');
      const ok = v.ledger.ok && v.recordings.ok;
      el.className = `cs-verify ${ok ? 'is-ok' : 'is-bad'}`;
      el.innerHTML = ok
        ? `${icon('shield')}<span><b>Audit chain intact.</b> ${v.ledger.count} ledger entries and ${v.recordings.count} recording${v.recordings.count === 1 ? '' : 's'} re-computed from disk; every hash matches.</span>`
        : `${icon('alert')}<span><b>Chain broken.</b> ${v.ledger.ok ? '' : `Ledger entry #${v.ledger.brokenAt} does not match. `}${v.recordings.problems?.[0]?.problem ?? ''}</span>`;
    } catch (e) {
      el.className = 'cs-verify is-bad';
      el.innerHTML = `${icon('alert')}<span>${esc(e.message)}</span>`;
    }
  }

  async act_copyhash(btn) {
    try {
      await navigator.clipboard.writeText(this.summary.recording.sha256);
      btn.innerHTML = `${icon('check')}Copied`;
    } catch {
      const r = document.createRange();
      r.selectNodeContents($(this.root, '[data-bind="rechash"]'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  act_again() { this.start(); }

  #ended(title, message) {
    this.#stopPoll();
    this.#setPhase('ended', 'breach');
    this.#page(`<div class="cs-hero">${icon('lock')}</div><h2>${esc(title)}</h2><p class="cs-sub">${esc(message)}</p>
      <div class="cs-actions"><button type="button" class="cs-primary" data-act="again" data-autofocus>Start over</button></div>
      <div class="cs-actions"><button type="button" class="cs-btn is-quiet" data-act="close">Close</button></div>`);
  }

  // ---------------------------------------------------------------- teardown
  close() {
    if (!this.alive) return;
    if (this.phase === 'terminal' && this.term) { this.act_end(); return; }
    const r = this.req;
    if (r && (this.phase === 'passkey' || this.phase === 'waiting') && (r.status === 'awaiting_passkey' || r.status === 'awaiting_approval')) {
      http('POST', `/request/${r.id}/cancel`, {}).catch(() => {}); // do not leave an approvable request behind
    }
    this.dispose();
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    for (const t of this.timers) clearInterval(t);
    this.timers.clear();
    clearTimeout(this.bannerT);
    document.removeEventListener('keydown', this.keyHandler);
    try { this.term?.dispose(); } catch { /* ok */ }
    const root = this.root;
    if (active === this) active = null;
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), this.slot ? 0 : 230);
    this.onClose?.();
  }
}

/**
 * The console's "Open secure shell" entry point.
 *   openShell('b14-gpu-07')                    -> sheet flow (in #claura-shell-slot when present, else an overlay)
 *   openShell('b14-gpu-07', {container: el})   -> into a specific element
 */
export async function openShell(hostId, opts = {}) {
  if (typeof hostId !== 'string' || !/^[a-z0-9][a-z0-9-]{2,30}$/.test(hostId)) throw new Error('openShell needs a host id like "b14-gpu-07"');
  injectStyles();
  if (active?.phase === 'terminal' && active.alive) {
    active.nudge();
    return active;
  }
  active?.dispose();
  const container = opts.container ?? document.getElementById(CFG.slotId) ?? null;
  const flow = new Flow({ hostId, container });
  active = flow;
  if (container) {
    const visible = () => container.getClientRects().length > 0;
    for (const ms of [120, 450, 900]) setTimeout(() => { if (flow.alive && flow.slot && !visible()) flow.toOverlay(); }, ms);
  }
  await flow.start();
  return flow;
}

// ------------------------------------------------------------------ host list + approvals inbox + recent sessions
export function mountUI(container, opts = {}) {
  injectStyles();
  container.classList.add('cs-scope');
  const state = { hosts: null, reqs: [], sessions: [], err: null, busy: false };
  let timer = 0;
  let alive = true;

  async function refresh() {
    if (!alive || state.busy) return;
    state.busy = true;
    try {
      const [h, r, s] = await Promise.all([getHosts(true), http('GET', '/requests?scope=pending'), http('GET', '/sessions')]);
      state.hosts = h;
      state.reqs = r.requests;
      state.sessions = s.finished;
      state.live = s.live;
      state.err = null;
    } catch (e) {
      state.err = e.message;
    }
    state.busy = false;
    if (alive) draw();
  }

  function draw() {
    if (!container.isConnected) { alive = false; clearInterval(timer); return; }
    if (container.contains(document.activeElement) && /SELECT|TEXTAREA|INPUT/.test(document.activeElement.tagName)) return; // do not yank a control out from under a click
    const h = state.hosts;
    if (!h) {
      container.innerHTML = `<div class="cs-list"><div class="cs-list-head"><h2>Secure shells</h2></div>${state.err ? `<div class="cs-banner-top">${esc(state.err)}</div>` : '<div class="cs-empty">Loading…</div>'}</div>`;
      return;
    }
    const sig = JSON.stringify([h.hosts, h.people, h.skipPasskey, state.reqs, state.sessions, state.live, state.err]);
    if (sig === state.sig) return;
    state.sig = sig;
    const approvers = h.people.filter((p) => p.roles.includes('approver'));
    container.innerHTML = `<div class="cs-list">
      <div class="cs-list-head"><h2>Secure shells</h2><span>${h.hosts.filter((x) => x.up).length} of ${h.hosts.length} hosts reachable · user CA ${esc(short(h.ca.user.replace('SHA256:', ''), 14))} · incident ${esc(h.incident)}</span></div>
      ${h.skipPasskey ? `<div class="cs-banner-top">Passkey check is switched off on this gateway (DEMO_SKIP_PASSKEY). Test mode only.</div>` : ''}
      ${state.err ? `<div class="cs-banner-top">${esc(state.err)}</div>` : ''}
      <div class="cs-cards">${h.hosts.map((x) => `
        <article class="cs-card">
          <h3><span class="cs-status ${x.up ? (x.policy.class === 'suspect' ? 'is-hot' : '') : 'is-down'}"></span>${esc(x.label)}</h3>
          <div class="where">${esc(x.where)} · ${esc(x.status)}</div>
          <p>${esc(x.note)}</p>
          <div class="cs-chips">${x.policy.stepUp ? `<span class="cs-chip is-gate">${icon('fingerprint')}Passkey</span>` : ''}<span class="cs-chip is-gate">${icon('users')}${x.policy.approvals === 1 ? 'Two-person' : `${x.policy.approvals} approvers`}</span><span class="cs-chip ${x.policy.readOnly ? 'is-gate' : 'is-ok'}">${icon(x.policy.readOnly ? 'eye' : 'terminal')}${x.policy.readOnly ? 'Read-only' : 'Operator'}</span></div>
          <button type="button" class="cs-btn" data-open="${esc(x.id)}" ${x.up ? '' : 'disabled'}>${icon('terminal')}Open secure shell</button>
        </article>`).join('')}</div>
      <div class="cs-sec"><h3>${icon('users')} Waiting for a decision</h3>
        <div class="cs-rows">${state.reqs.length ? state.reqs.map((r) => {
          const opts2 = approvers.filter((p) => p.id !== r.operator);
          return `<div class="cs-rowi"><div class="grow"><b>${esc(r.operator.toUpperCase())}</b> wants <span class="cs-mono">${esc(r.policy.principal)}</span> for ${r.minutes} min<small>${esc(r.reason)}${r.stepUp.required && !r.stepUp.done ? ' · passkey pending' : ''} · ${r.approvals.length}/${r.approvalsNeeded} approvals</small></div>
            <select class="cs-sel" data-who="${esc(r.id)}" aria-label="Decide as">${opts2.map((p) => `<option value="${esc(p.id)}">${esc(p.initials)} · ${esc(p.title)}</option>`).join('')}</select>
            <button type="button" class="cs-btn cs-mini is-demo" data-approve="${esc(r.id)}">${icon('check')}Approve</button>
            <button type="button" class="cs-btn cs-mini is-danger" data-deny="${esc(r.id)}">Deny</button></div>`;
        }).join('') : '<div class="cs-empty">No requests are waiting.</div>'}</div></div>
      <div class="cs-sec"><h3>${icon('record')} Sessions</h3>
        <div class="cs-rows">${(state.live ?? []).map((s) => `<div class="cs-rowi"><div class="grow"><b class="cs-mono">${esc(s.host)}</b> · ${esc(s.operator.toUpperCase())} as <span class="cs-mono">${esc(s.principal)}</span><small>live since ${esc(clock(s.startedAt))} · certificate expires ${esc(clock(s.expiresAt))}</small></div><span class="cs-chip is-gate">${icon('record')}Recording</span></div>`).join('')
          }${state.sessions.length ? state.sessions.slice(0, 6).map((s) => `<div class="cs-rowi"><div class="grow"><b class="cs-mono">${esc(s.host)}</b> · ${esc(s.operator.toUpperCase())} as <span class="cs-mono">${esc(s.principal)}</span><small>${esc(clock(s.startedAt))} · ${Math.max(1, Math.round(s.durationMs / 1000))} s · ${s.commands.total} commands, ${s.commands.denied} denied · sha256 <span class="cs-mono">${esc(short(s.recording.sha256, 16))}</span></small></div>
            <a class="cs-btn cs-mini" href="${url(`/recording/${encodeURIComponent(s.sessionId)}`)}" download="${esc(s.sessionId)}.cast">${icon('download')}.cast</a></div>`).join('') : (state.live?.length ? '' : '<div class="cs-empty">No sessions yet.</div>')}</div>
        <div class="cs-actions"><button type="button" class="cs-btn cs-mini" data-verify>${icon('link')}Verify the audit chains</button><span class="cs-note" data-vout></span></div></div>
    </div>`;
  }

  container.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) return opts.onOpen ? opts.onOpen(open.dataset.open) : openShell(open.dataset.open);
    const ap = e.target.closest('[data-approve],[data-deny]');
    if (ap) {
      const id = ap.dataset.approve ?? ap.dataset.deny;
      const who = container.querySelector(`[data-who="${id}"]`)?.value;
      ap.disabled = true;
      try {
        await http('POST', ap.dataset.approve ? '/approve' : '/deny', { requestId: id, approver: who, reason: 'denied from the approvals inbox' });
      } catch (err) {
        state.err = err.message;
      }
      return refresh();
    }
    if (e.target.closest('[data-verify]')) {
      const out = container.querySelector('[data-vout]');
      try {
        const v = await http('GET', '/ledger/verify');
        out.textContent = v.ledger.ok && v.recordings.ok ? `Intact: ${v.ledger.count} ledger entries, ${v.recordings.count} recordings.` : 'BROKEN: see /api/ssh/ledger/verify';
      } catch (err) {
        out.textContent = err.message;
      }
    }
  });

  refresh();
  timer = setInterval(refresh, 2500);
  return { refresh, destroy() { alive = false; clearInterval(timer); container.innerHTML = ''; } };
}

// ------------------------------------------------------------------ window.claura
export const api = { version: VERSION, configure, openShell, mountUI, mountTerminal, close: () => active?.dispose(), get active() { return active; } };
{
  const root = (globalThis.claura ??= {});
  // never overwrite what the console (or another module) already put there
  if (typeof root.openShell !== 'function') root.openShell = openShell;
  if (!root.ssh) root.ssh = api;
}
export default api;
