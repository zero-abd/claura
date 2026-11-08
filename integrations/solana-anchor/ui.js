/* Claura Evidence Anchoring: browser side. One ES module, no build step, no framework. Solana DEVNET only.
 *
 *   <script type="module" src="/api/solana/ui.js"></script>       // or: await import('/api/solana/ui.js')
 *
 *   const r = await window.claura.anchor(sha256hex, 'ledger');     // -> { signature, slot, explorer, mock, memo, ... }
 *   const v = await window.claura.integrations['solana-anchor'].verify(r.signature, { hash: sha256hex });
 *   window.claura.integrations['solana-anchor'].open(container);   // the Liquid Glass card (shadow DOM, self-contained)
 *
 * Registry entry: { title: 'Evidence anchoring', track: 'MLH · Best Use of Solana', status, open(container, opts) }.
 * status is 'loading' | 'live' | 'mock' | 'offline' and updates itself. 'mock' means the server wallet has no devnet SOL:
 * anchors are SIMULATED and nothing is written to Solana (the card says so in plain words).
 *
 * window.claura.anchor and the registry entry are only defined when absent. If the console already created an entry
 * for 'solana-anchor', only the keys it lacks are added; nothing it set is replaced.
 *
 * open(container, opts): opts.hash (64 hex) | opts.getHash() (sync or async; may return a hash or {hash, label}) pre-fills
 * the fingerprint, opts.label pre-fills the label. Without them the card starts from the SHA-256 of a sample manifest.
 * Every successful anchor also fires  window 'claura:anchored'  with the result as event.detail.
 */

const VERSION = '0.1.0';
const SELF = new URL(import.meta.url);
const CFG = {
  base: SELF.pathname.replace(/\/ui\.js$/, '') || '/api/solana',
  origin: SELF.origin === location.origin ? '' : SELF.origin, // set when the module is served from another origin
};
export function configure(o = {}) {
  Object.assign(CFG, o);
}

// ------------------------------------------------------------------ helpers
const HASH_RE = /^[0-9a-f]{64}$/;
const normHash = (v) => {
  const s = String(v ?? '').replace(/\s+/g, '').toLowerCase().replace(/^sha-?256:/, '');
  return HASH_RE.test(s) ? s : null;
};
const short = (s, a = 6, b = 6) => (s && s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s || '');
const safeUrl = (u) => (typeof u === 'string' && u.startsWith('https://explorer.solana.com/') ? u : null);
const SAMPLE = 'claura-evidence-manifest/sample/v1';

/** SHA-256 as 64 lowercase hex. Accepts a string, bytes, or anything JSON-serialisable. */
export async function sha256Hex(input) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 needs a secure context (https or localhost)');
  const enc = new TextEncoder();
  const bytes = typeof input === 'string' ? enc.encode(input)
    : input instanceof ArrayBuffer ? new Uint8Array(input)
    : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : enc.encode(JSON.stringify(input));
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function http(method, path, body) {
  let res;
  try {
    res = await fetch(CFG.origin + CFG.base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the Claura server'), { code: 'offline' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || data?.ok === false) throw Object.assign(new Error(data?.error || `Request failed (HTTP ${res.status})`), { status: res.status, code: data?.code, data });
  return data;
}

// ------------------------------------------------------------------ state + API
const state = { status: 'loading', info: null, last: null };
const listeners = new Set();

export async function refreshStatus() {
  try {
    state.info = await http('GET', '/status');
    state.status = state.info.status === 'live' ? 'live' : 'mock';
  } catch (e) {
    state.status = e.code === 'offline' ? 'offline' : 'mock';
  }
  listeners.forEach((fn) => { try { fn(state); } catch { /* a listener must not break the others */ } });
  return state.info;
}

/** Anchor the SHA-256 of the ledger / evidence manifest. Resolves with the server result; never touches mainnet. */
export async function anchor(hash, label = 'evidence') {
  const h = normHash(hash);
  if (!h) throw new Error('anchor(hash, label): hash must be a SHA-256 digest, 64 hexadecimal characters');
  const r = await http('POST', '/anchor', { hash: h, label: String(label ?? 'evidence') });
  state.last = r;
  try { window.dispatchEvent(new CustomEvent('claura:anchored', { detail: r })); } catch { /* old browser */ }
  refreshStatus();
  return r;
}

/** Re-read the transaction from devnet and compare its memo with `hash` (or with what was anchored). */
export async function verify(signature, { hash, label } = {}) {
  const q = new URLSearchParams({ sig: String(signature ?? '') });
  if (hash) q.set('hash', String(hash));
  if (label) q.set('label', String(label));
  return http('GET', `/verify?${q}`);
}

// ------------------------------------------------------------------ the card
const ICON = {
  copy: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 4.5V4a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4v6.5A1.5 1.5 0 0 0 5 12h.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  out: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5V12M11.5 4h4.5v4.5M16 4l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ok: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor" opacity=".18"/><path d="m6 10.3 2.8 2.8L14.2 7.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8 18 16.5H2z" fill="currentColor" opacity=".18"/><path d="M10 8v3.6M10 14.2v.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bad: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor" opacity=".18"/><path d="m7 7 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const CSS = `
:host { display: block; max-width: 540px; color-scheme: dark; --ink: rgba(247,249,255,.96); --ink-2: rgba(226,232,250,.74); --ink-3: rgba(214,222,246,.52);
  --accent: #ff5a1f; --safe: #3ddc97; --warn: #ffb547; --bad: #ff6b6b; --ring: rgba(255,255,255,.34);
  font: 400 14px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif; letter-spacing: -.006em; color: var(--ink); }
* { box-sizing: border-box; }
.card { position: relative; border-radius: 28px; padding: 22px; overflow: hidden;
  background: linear-gradient(155deg, rgba(255,255,255,.15), rgba(255,255,255,.03) 55%), rgba(18,24,48,.46);
  -webkit-backdrop-filter: blur(30px) saturate(1.8); backdrop-filter: blur(30px) saturate(1.8);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.34), inset 0 0 0 1px rgba(255,255,255,.08), 0 26px 64px -30px rgba(0,0,0,.7); }
.card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: radial-gradient(120% 60% at 0% 0%, rgba(255,255,255,.16), transparent 60%), radial-gradient(70% 50% at 100% 100%, rgba(153,69,255,.12), transparent 70%); }
.card > * { position: relative; }
.head { display: flex; align-items: center; gap: 12px; }
.mark { flex: none; width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; background: rgba(255,255,255,.09);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 0 0 0 1px rgba(255,255,255,.08); }
.mark svg { width: 24px; height: 24px; }
.titles { min-width: 0; flex: 1; }
h3 { margin: 0; font-family: inherit; font-size: 18px; font-weight: 600; line-height: 1.15; letter-spacing: -.02em; }
.titles p { margin: 2px 0 0; color: var(--ink-3); font-size: 12px; }
.pill { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px 0 10px; border-radius: 14px; font-size: 12px; font-weight: 600; color: var(--ink-2);
  background: rgba(255,255,255,.09); box-shadow: inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px rgba(255,255,255,.07); }
.pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
.pill[data-state="live"] { color: var(--safe); } .pill[data-state="live"] i { background: var(--safe); box-shadow: 0 0 10px var(--safe); }
.pill[data-state="mock"] { color: var(--warn); } .pill[data-state="mock"] i { background: var(--warn); }
.pill[data-state="offline"] { color: var(--bad); } .pill[data-state="offline"] i { background: var(--bad); }
.lede { margin: 14px 0 0; color: var(--ink-2); }
.notice { margin: 14px 0 0; padding: 12px 14px; border-radius: 16px; color: var(--ink); font-size: 13px; background: rgba(255,181,71,.12); box-shadow: inset 0 0 0 1px rgba(255,181,71,.28); }
.notice b { color: var(--warn); font-weight: 600; }
.notice .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.field { display: block; margin-top: 16px; }
.field > span { display: block; margin: 0 2px 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); }
input, textarea { width: 100%; border: 0; outline: 0; color: var(--ink); background: rgba(0,0,0,.3); border-radius: 14px; padding: 12px 13px; font-family: inherit; font-size: 14px; font-weight: 500; line-height: 1.2;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), inset 0 2px 5px rgba(0,0,0,.35); }
textarea { display: block; resize: none; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
input.mono, textarea.mono, code, .mono { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace; }
input.mono, textarea.mono { font-size: 12.5px; letter-spacing: 0; }
input:focus-visible, textarea:focus-visible { box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 0 0 3px var(--ring); }
input[aria-invalid="true"], textarea[aria-invalid="true"] { box-shadow: inset 0 0 0 1px rgba(255,107,107,.7); }
.hint { margin: 6px 2px 0; min-height: 17px; font-size: 12px; color: var(--ink-3); }
.hint[data-bad="true"] { color: var(--bad); }
.actions { display: flex; gap: 10px; margin-top: 16px; }
.btn { appearance: none; border: 0; cursor: pointer; height: 44px; padding: 0 20px; border-radius: 22px; color: var(--ink); font-family: inherit; font-size: 14px; font-weight: 600; line-height: 1; letter-spacing: -.01em;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: rgba(255,255,255,.11);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.26), inset 0 0 0 1px rgba(255,255,255,.08); }
.btn.primary { flex: 1; color: #fff; background: linear-gradient(180deg, #ff7a45, #ff5a1f); box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 10px 24px -10px rgba(255,90,31,.8); }
.btn:hover:not(:disabled) { filter: brightness(1.08); }
.btn:focus-visible, .icon:focus-visible, a:focus-visible { outline: 0; box-shadow: 0 0 0 3px var(--ring); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn[aria-busy="true"]::before { content: ""; width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .8s linear infinite; }
.icon { appearance: none; border: 0; cursor: pointer; flex: none; width: 28px; height: 28px; border-radius: 9px; display: inline-grid; place-items: center; color: var(--ink-2); background: rgba(255,255,255,.08); }
.icon:hover { background: rgba(255,255,255,.16); color: var(--ink); }
.icon svg { width: 15px; height: 15px; }
.result { margin-top: 16px; padding: 14px; border-radius: 18px; background: rgba(0,0,0,.22); box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); }
.result[data-mock="true"] { box-shadow: inset 0 0 0 1px rgba(255,181,71,.3); }
.kv { display: grid; grid-template-columns: 78px 1fr auto; gap: 4px 10px; align-items: center; padding: 6px 0; }
.kv + .kv { border-top: 1px solid rgba(255,255,255,.06); }
.kv dt { color: var(--ink-3); font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.kv dd { margin: 0; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
.link { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; color: var(--ink); font-weight: 600; text-decoration: none; padding: 7px 12px; border-radius: 12px; background: rgba(255,255,255,.09);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.link:hover { background: rgba(255,255,255,.16); }
.link svg { width: 14px; height: 14px; }
.verdict { display: flex; gap: 10px; align-items: flex-start; margin-top: 12px; padding: 12px 14px; border-radius: 16px; font-size: 13px; }
.verdict svg { flex: none; width: 20px; height: 20px; margin-top: 1px; }
.verdict[data-tone="safe"] { color: var(--safe); background: rgba(61,220,151,.1); box-shadow: inset 0 0 0 1px rgba(61,220,151,.28); }
.verdict[data-tone="warn"] { color: var(--warn); background: rgba(255,181,71,.1); box-shadow: inset 0 0 0 1px rgba(255,181,71,.28); }
.verdict[data-tone="bad"] { color: var(--bad); background: rgba(255,107,107,.1); box-shadow: inset 0 0 0 1px rgba(255,107,107,.3); }
.verdict > div { color: var(--ink); } .verdict b { font-weight: 600; }
.foot { display: flex; align-items: center; gap: 8px; margin-top: 16px; color: var(--ink-3); font-size: 12px; flex-wrap: wrap; }
.foot code { color: var(--ink-2); font-size: 11.5px; }
[hidden] { display: none !important; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: no-preference) {
  .btn { transition: transform .18s cubic-bezier(.2,.9,.25,1.2), filter .15s, background .15s; } .btn:active:not(:disabled) { transform: scale(.97); }
  .result, .verdict, .notice { animation: rise .32s cubic-bezier(.2,.9,.25,1.1); }
}
@media (prefers-reduced-transparency: reduce) { .card { -webkit-backdrop-filter: none; backdrop-filter: none; background: #151b34; } }
@media (prefers-contrast: more) { .titles p, .field > span, .hint, .foot, .kv dt { color: var(--ink-2); } }
@media (max-width: 420px) { .card { padding: 18px; border-radius: 24px; } .kv { grid-template-columns: 1fr auto; } .kv dt { grid-column: 1 / -1; } }
`;

const HTML = `
<section class="card" aria-labelledby="t">
  <header class="head">
    <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs>
      <path d="M7 4.5h13.5L17 8.5H3.5z" fill="url(#g)"/><path d="M3.5 10H17l3.5 4H7z" fill="url(#g)"/><path d="M7 15.5h13.5L17 19.5H3.5z" fill="url(#g)"/></svg></div>
    <div class="titles"><h3 id="t">Evidence anchoring</h3><p>MLH · Best Use of Solana</p></div>
    <span class="pill" data-pill data-state="loading" role="status"><i></i><b data-pill-text>Checking</b></span>
  </header>
  <p class="lede">Pin the fingerprint of your evidence to Solana devnet. Change one byte of the ledger later and its fingerprint no longer matches the chain.</p>
  <div class="notice" data-notice hidden></div>
  <label class="field"><span>SHA-256 of the ledger or evidence manifest</span>
    <textarea class="mono" data-hash rows="2" spellcheck="false" autocomplete="off" autocapitalize="off" maxlength="120" aria-describedby="hh"></textarea></label>
  <div class="hint" id="hh" data-hint></div>
  <label class="field" style="margin-top:10px"><span>Label</span><input data-label spellcheck="false" autocomplete="off" maxlength="48" value="ledger"></label>
  <div class="actions"><button class="btn primary" data-act="anchor" type="button">Anchor to Solana</button><button class="btn" data-act="verify" type="button" disabled>Verify</button></div>
  <div class="result" data-result hidden>
    <dl style="margin:0">
      <div class="kv"><dt>Signature</dt><dd class="mono" data-sig></dd><button class="icon" data-copy="sig" type="button" aria-label="Copy signature">${ICON.copy}</button></div>
      <div class="kv"><dt>Slot</dt><dd class="mono" data-slot></dd><span></span></div>
      <div class="kv"><dt>Memo</dt><dd class="mono" data-memo></dd><button class="icon" data-copy="memo" type="button" aria-label="Copy memo">${ICON.copy}</button></div>
    </dl>
    <a class="link" data-explorer target="_blank" rel="noopener noreferrer" hidden>View on Solana Explorer ${ICON.out}</a>
  </div>
  <div class="verdict" data-verdict role="status" aria-live="polite" hidden></div>
  <footer class="foot" data-foot></footer>
</section>`;

const REASON_TEXT = {
  hash_mismatch: 'The hash on the chain differs from the hash in the field. The evidence has changed since it was anchored.',
  label_mismatch: 'The label on the chain differs from the one anchored.',
  signer_mismatch: 'The memo was not signed by the Claura wallet that anchored it.',
  tx_failed: 'The transaction failed on chain, so it proves nothing.',
  no_memo: 'That transaction carries no memo.',
  bad_memo: 'The memo on the chain is not in the claura:<label>:sha256:<hash> format.',
  not_found: 'Devnet has no such transaction yet. Wait a few seconds and press Verify again.',
  no_expected_hash: 'There is no hash to compare with. Paste the fingerprint into the field.',
};

/**
 * Render the card into `container`. Returns { destroy(), refresh(), setHash(hash, label?) }.
 * @param {Element} container
 * @param {{hash?: string, label?: string, getHash?: () => (string|{hash:string,label?:string}|Promise<any>)}} [opts]
 */
export function open(container, opts = {}) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('open(container): container must be a DOM element');
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>${HTML}`;
  container.appendChild(host);
  const $ = (s) => root.querySelector(s);
  const el = {
    pill: $('[data-pill]'), pillText: $('[data-pill-text]'), notice: $('[data-notice]'), hash: $('[data-hash]'), hint: $('[data-hint]'), label: $('[data-label]'),
    anchor: $('[data-act="anchor"]'), verify: $('[data-act="verify"]'), result: $('[data-result]'), sig: $('[data-sig]'), slot: $('[data-slot]'), memo: $('[data-memo]'),
    explorer: $('[data-explorer]'), verdict: $('[data-verdict]'), foot: $('[data-foot]'),
  };
  let last = null;
  let alive = true;

  const hint = (text, bad = false) => { el.hint.textContent = text; el.hint.dataset.bad = String(bad); };
  const busy = (btn, on, text) => {
    btn.setAttribute('aria-busy', String(on));
    btn.textContent = on ? text : btn === el.anchor ? 'Anchor to Solana' : 'Verify';
    el.anchor.disabled = on;
    el.verify.disabled = on || !last;
  };
  const verdict = (tone, html) => {
    el.verdict.hidden = !html;
    if (!html) return;
    el.verdict.dataset.tone = tone;
    el.verdict.innerHTML = `${tone === 'safe' ? ICON.ok : tone === 'warn' ? ICON.warn : ICON.bad}<div>${html}</div>`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function paintStatus() {
    const s = state.status;
    el.pill.dataset.state = s;
    el.pillText.textContent = s === 'live' ? 'Devnet · live' : s === 'mock' ? 'Simulated' : s === 'offline' ? 'Offline' : 'Checking';
    const info = state.info;
    const notice = [];
    if (s === 'mock' && info) {
      if (info.reason === 'unfunded' && info.publicKey) {
        notice.push(`<b>Simulated.</b> The Claura wallet has no devnet SOL yet, so anchors are not written to Solana. Fund <code>${esc(short(info.publicKey, 6, 6))}</code> at <a style="color:inherit" href="${esc(info.faucet?.url || 'https://faucet.solana.com')}" target="_blank" rel="noopener noreferrer">faucet.solana.com</a> (choose Devnet) and this card turns live on its own.`);
      } else if (info.reason === 'rpc-unreachable') notice.push('<b>Simulated.</b> Solana devnet cannot be reached right now. Anchors are not written until it returns.');
      else if (info.reason === 'dependency-missing') notice.push('<b>Simulated.</b> The Solana library is not installed on the server (npm install in integrations/solana-anchor).');
      else if (info.reason === 'not-devnet') notice.push('<b>Refusing to run.</b> The configured RPC is not Solana devnet, so nothing will be signed.');
      else notice.push('<b>Simulated.</b> Anchors are not written to Solana right now.');
    } else if (s === 'offline') notice.push('<b>Offline.</b> The Claura server did not answer.');
    el.notice.hidden = !notice.length;
    el.notice.innerHTML = notice.join('');
    if (info?.publicKey) {
      const sol = typeof info.balanceSol === 'number' ? `${info.balanceSol.toFixed(4)} SOL` : '';
      el.foot.innerHTML = `<span>Wallet</span><code title="${esc(info.publicKey)}">${esc(short(info.publicKey, 6, 6))}</code><button class="icon" data-copy="wallet" type="button" aria-label="Copy wallet address">${ICON.copy}</button><span>${esc(sol)}${sol ? ' · ' : ''}devnet</span>`;
    } else el.foot.textContent = 'devnet only · no mainnet funds are ever used';
  }
  listeners.add(paintStatus);
  paintStatus();

  function paintResult(r) {
    last = r;
    el.result.hidden = false;
    el.result.dataset.mock = String(!!r.mock);
    el.sig.textContent = r.signature;
    el.slot.textContent = r.slot == null ? 'none (simulated)' : String(r.slot);
    el.memo.textContent = r.memo;
    const url = safeUrl(r.explorer);
    el.explorer.hidden = !url;
    if (url) el.explorer.href = url;
    el.verify.disabled = false;
  }

  async function onAnchor() {
    const hash = normHash(el.hash.value);
    if (!hash) { el.hash.setAttribute('aria-invalid', 'true'); hint('Paste a SHA-256 digest: 64 hexadecimal characters.', true); el.hash.focus(); return; }
    el.hash.removeAttribute('aria-invalid');
    verdict('', '');
    busy(el.anchor, true, 'Anchoring…');
    try {
      const r = await anchor(hash, el.label.value);
      paintResult(r);
      el.label.value = r.label;
      hint(r.mock ? 'Simulated anchor: recorded locally, nothing was written to Solana.' : 'Anchored. Verify reads it back from devnet. Change a character above first to watch it fail.');
      if (r.mock) verdict('warn', '<b>Simulated.</b> This anchor is not on Solana. Fund the wallet to anchor for real.');
    } catch (e) {
      hint(e.message, true);
    } finally {
      busy(el.anchor, false);
    }
  }

  async function onVerify() {
    if (!last) return;
    const hash = normHash(el.hash.value);
    if (!hash) { el.hash.setAttribute('aria-invalid', 'true'); hint('Paste a SHA-256 digest: 64 hexadecimal characters.', true); return; }
    el.hash.removeAttribute('aria-invalid');
    busy(el.verify, true, 'Reading devnet…');
    try {
      const v = await verify(last.signature, { hash });
      if (v.verified) {
        verdict('safe', `<b>Verified.</b> The memo on Solana devnet${v.slot ? ` (slot ${esc(v.slot)})` : ''} equals this hash and was signed by the Claura wallet. The evidence has not changed since it was anchored.`);
      } else if (v.mock) {
        verdict('warn', '<b>Simulated.</b> This anchor exists only in the local log. Nothing on Solana proves it. Fund the wallet to anchor for real.');
      } else {
        verdict(v.reason === 'not_found' ? 'warn' : 'bad', `<b>${v.reason === 'not_found' ? 'Not found yet.' : 'Not verified.'}</b> ${esc(REASON_TEXT[v.reason] || 'The chain does not confirm this hash.')}`);
      }
    } catch (e) {
      verdict('bad', `<b>Could not verify.</b> ${esc(e.message)}`);
    } finally {
      busy(el.verify, false);
    }
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* clipboard blocked */ }
      ta.remove();
    }
    const old = btn.getAttribute('aria-label');
    btn.setAttribute('aria-label', 'Copied');
    btn.style.color = 'var(--safe)';
    setTimeout(() => { btn.setAttribute('aria-label', old); btn.style.color = ''; }, 1200);
  }

  root.addEventListener('click', (ev) => {
    const t = ev.target instanceof Element ? ev.target : null;
    const a = t?.closest('[data-act]');
    if (a?.dataset.act === 'anchor') return void onAnchor();
    if (a?.dataset.act === 'verify') return void onVerify();
    const c = t?.closest('[data-copy]');
    if (c) {
      const what = c.dataset.copy;
      copy(what === 'sig' ? last?.signature : what === 'memo' ? last?.memo : state.info?.publicKey, c);
    }
  });
  el.hash.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onAnchor(); } });
  el.hash.addEventListener('input', () => { el.hash.removeAttribute('aria-invalid'); if (!last) hint(''); });

  function setHash(h, label) {
    const clean = normHash(h);
    el.hash.value = clean ? `${clean.slice(0, 32)}\n${clean.slice(32)}` : String(h ?? '').trim();
    if (label) el.label.value = String(label);
  }

  (async () => {
    let h = opts.hash;
    let l = opts.label;
    try {
      if (!h && typeof opts.getHash === 'function') {
        const g = await opts.getHash();
        if (g && typeof g === 'object') { h = g.hash; l = l || g.label; } else h = g;
      }
      if (h) hint('Fingerprint of the current evidence. Press Anchor to pin it.');
      else { h = await sha256Hex(SAMPLE); hint('Sample fingerprint. Replace it with the SHA-256 of your ledger or evidence manifest.'); }
    } catch (e) {
      hint(e.message, true);
    }
    if (alive) setHash(h, l);
  })();
  refreshStatus();

  return {
    setHash,
    refresh: refreshStatus,
    destroy() { alive = false; listeners.delete(paintStatus); host.remove(); },
  };
}

// ------------------------------------------------------------------ window.claura
export const integration = {
  id: 'solana-anchor',
  version: VERSION,
  title: 'Evidence anchoring',
  track: 'MLH · Best Use of Solana',
  get status() { return state.status; },
  open,
  anchor,
  verify,
  sha256Hex,
  refresh: refreshStatus,
  configure,
};

/** Copy the keys `target` lacks from `source` (getters stay getters). Never replaces a key that exists. */
function fillMissing(target, source) {
  for (const k of Object.keys(Object.getOwnPropertyDescriptors(source))) {
    if (!(k in target)) Object.defineProperty(target, k, Object.getOwnPropertyDescriptor(source, k));
  }
  return target;
}

{
  const root = (globalThis.claura ??= {});
  if (typeof root.anchor !== 'function') root.anchor = anchor;
  if (root.integrations === undefined) root.integrations = {};
  if (root.integrations && typeof root.integrations === 'object') {
    if (!root.integrations['solana-anchor']) root.integrations['solana-anchor'] = integration;
    else if (typeof root.integrations['solana-anchor'] === 'object') fillMissing(root.integrations['solana-anchor'], integration);
  }
  refreshStatus();
}

export default integration;
