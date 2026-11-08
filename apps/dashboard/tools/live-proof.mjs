// Live proof: two (or one) real consoles on the SpacetimeDB module "claura", driven like a person would, no mocks.
//
//   node tools/live-proof.mjs [--port 4317] [--consoles 2] [--scripted] [--local] [--out shots] [--keep]
//
// What it does, in order:
//   1. mints one fresh single-use commander code per console with scripts/access.sh (as the CLI owner). The codes live only in
//      this process's memory: they are never printed, never written to a file, and are typed into the page through the DevTools
//      protocol exactly like a person would type them.
//   2. starts each console in its OWN headless Chrome profile (separate localStorage, so a separate identity), loads
//      /?live=1 (add ?stdb=local with --local), checks the stranger state (0 rows, break-glass sheet), enrolls with the code.
//   3. runs the live incident with scripts/live.sh (resets as the owner, then real Nemotron; --scripted for the backup path).
//   4. watches both consoles in real time (every row they see is time-stamped in the page), approves in console A with a real
//      click on the approval sheet, then posts a War Room message from console B and finds it on A.
//   5. compares the two consoles row by row, writes side-by-side screenshots to <out>/live-*.png.
//   6. cleanup (unless --keep): revokes the test operators, resets the database as the owner, closes every Chrome, verifies.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (k) => args.includes(`--${k}`);
const PORT = opt("port", "4317");
const N = Math.max(1, Math.min(2, parseInt(opt("consoles", "2"), 10)));
const OUT = resolve(opt("out", "shots"));
const LOCAL = flag("local");
const SCRIPTED = flag("scripted");
const KEEP = flag("keep");
const BACKEND = "/Users/abd/repos/claura-backend";
const SPACETIME = "/Users/abd/.local/bin/spacetime";
const SERVER = LOCAL ? "local" : "maincloud";
const URL_ = `http://127.0.0.1:${PORT}/?live=1${LOCAL ? "&stdb=local" : ""}`;
const NAMES = ["Test Commander A", "Test Commander B"];
const W = 1440;
const H = 900;
const TOUR = flag("tour");

const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: "utf8", env: { ...process.env, NODE_USE_SYSTEM_CA: undefined }, ...o });
const access = (...a) => sh(ACCESS_SH, [...(LOCAL ? ["--local"] : []), ...a]);
const ACCESS_SH = `${BACKEND}/scripts/access.sh`;

mkdirSync(OUT, { recursive: true });
const cleanups = [];
const runCleanups = async () => {
  for (const f of cleanups.splice(0).reverse()) {
    try {
      await f();
    } catch (e) {
      console.log("cleanup:", e.message);
    }
  }
};
process.on("exit", () => {
  for (const f of cleanups.splice(0).reverse()) {
    try {
      const r = f();
      void r;
    } catch {}
  }
});

// ------------------------------------------------------------------ page-side helpers
const OBSERVER = `(() => {
  if (window.__seen) return true;
  const seen = (window.__seen = {});
  const mark = (k) => { if (!(k in seen)) seen[k] = Date.now(); };
  const chs = ['#command', '#legal', '#exec', '#comms-pr', '#vendors'];
  const tick = () => {
    const d = window.claura.data;
    const inc = d.incident();
    if (inc) mark('inc:' + inc.id + ':' + inc.status + ':' + inc.nistPhase);
    for (const e of d.events()) mark('ev:' + e.id);
    for (const p of d.proposals()) mark('prop:' + p.id + ':' + p.status);
    for (const c of chs) for (const m of d.messages(c)) mark('msg:' + c + ':' + m.id);
    for (const a of d.assets()) mark('asset:' + a.id + ':' + a.status);
    for (const x of d.decisions()) mark('dec:' + x.id);
    for (const x of d.tasks()) mark('task:' + x.id + ':' + x.status);
    const b = d.brief(); if (b) mark('brief:' + b.incidentId + ':' + b.updatedAt);
  };
  claura.live.watch(tick); // as the SDK delivers rows
  setInterval(tick, 250); tick();
  return true;
})()`;
const SNAP = `(() => {
  const d = window.claura.data;
  const chs = ['#command', '#legal', '#exec', '#comms-pr', '#vendors'];
  const b = d.brief();
  return JSON.stringify({
    inc: d.incident(),
    events: d.events().map((e) => [e.id, e.kind, e.actor, e.text]),
    props: d.proposals().map((p) => [p.id, p.action, p.target, p.status, p.decidedBy]),
    msgs: chs.map((c) => d.messages(c).map((m) => [m.id, m.authorName, m.text])),
    tasks: d.tasks().map((t) => [t.id, t.title, t.status]),
    decs: d.decisions().map((x) => [x.id, x.text, x.byName]),
    assets: d.assets().map((a) => [a.id, a.status, a.note, a.updatedBy]),
    brief: b ? b.text + '|' + b.known + '|' + b.unknown : null,
  });
})()`;
const sha = (s) => createHash("sha256").update(s).digest("hex");

class Console {
  constructor(label, name, chrome, page) {
    Object.assign(this, { label, name, chrome, page });
  }
  state() {
    return this.page.eval("claura.live.state()");
  }
  ev(x) {
    return this.page.eval(x);
  }
  async enroll(code) {
    await this.page.clickSel("#joinCode");
    await this.page.type(code);
    const typed = await this.page.eval("document.getElementById('joinCode').value.length");
    if (typed !== code.length) throw new Error(`${this.label}: the code did not land in the field (${typed}/${code.length} characters)`);
    await this.page.clickSel("#joinBtn");
    try {
      await this.page.until("claura.live.access === 'enrolled' || document.getElementById('joinErr').textContent.length > 0", 25000, `${this.label} enrolled`);
    } finally {
      const d = await this.page.eval("({ access: claura.live.access, link: claura.live.link, err: document.getElementById('joinErr').textContent, btn: document.querySelector('#joinBtn span').textContent })").catch(() => null);
      if (d && d.access !== "enrolled") throw new Error(`${this.label}: join failed: ${JSON.stringify(d)}`);
    }
    this.enrolledAt = Date.now();
  }
}

async function openConsole(i, code) {
  const chrome = await launchChrome({ width: W, height: H });
  cleanups.push(() => chrome.close());
  const page = await chrome.page(URL_);
  const label = String.fromCharCode(65 + i);
  const c = new Console(label, NAMES[i], chrome, page);
  await page.until("window.claura && window.claura.live", 20000, `${label} live api`);
  await page.until("window.claura.live.applied", 25000, `${label} subscription applied`);
  const stranger = await page.eval("({ access: claura.live.access, inc: !!claura.data.incident(), ops: claura.data.operators().length, msgs: claura.data.messages('#command').length, sheet: document.getElementById('joinSheet').dataset.open })");
  log(`${label}: stranger sees ${JSON.stringify(stranger)}`);
  if (stranger.access !== "needs-code" || stranger.ops !== 0 || stranger.msgs !== 0) throw new Error(`${label}: a stranger must see nothing`);
  await page.until("document.getElementById('joinSheet').dataset.open === '1'", 8000, `${label} join sheet open`);
  await sleep(1100); // the sheet springs in
  await c.enroll(code);
  await page.eval(OBSERVER);
  const who = await page.eval("({ name: claura.data.me().name, role: claura.data.me().role, id: claura.live.identity })");
  c.identity = who.id;
  log(`${label}: enrolled as "${who.name}" (${who.role}), identity ${who.id.slice(0, 12)}...`);
  await sleep(600);
  return c;
}

const quiet = []; // [from, to] spans where the harness itself is capturing screenshots (a capture stalls that page's main thread)
/** Two screenshots side by side (one Chrome renders the composite), or just the one. */
async function shot(name, consoles, caption) {
  const spanFrom = Date.now();
  const files = [];
  for (const c of consoles) {
    const f = join(tmpdir(), `claura-proof-${process.pid}-${c.label}-${name}.png`);
    await c.page.shot(f);
    files.push(f);
    cleanups.push(() => rmSync(f, { force: true }));
  }
  const out = join(OUT, `live-${name}.png`);
  if (files.length === 1) {
    const chrome = await launchChrome({ width: W, height: H + 40 });
    try {
      const html = join(tmpdir(), `claura-proof-${process.pid}-one.html`);
      writeFileSync(html, `<body style="margin:0;background:#05070d;color:#aab3d6;font:13px -apple-system,system-ui,sans-serif"><div style="padding:10px 16px">${caption}</div><img src="file://${files[0]}" style="display:block"></body>`);
      const p = await chrome.page(`file://${html}`);
      await p.until("[...document.images].every((i) => i.complete)", 8000);
      await p.shot(out);
      rmSync(html, { force: true });
    } finally {
      chrome.close();
    }
  } else {
    const chrome = await launchChrome({ width: W * 2 + 42, height: H + 90 });
    try {
      const html = join(tmpdir(), `claura-proof-${process.pid}-two.html`);
      const fig = (c, f) => `<figure style="margin:0"><figcaption style="padding:0 4px 8px;font-weight:600;color:#dfe5ff">Console ${c.label} &middot; ${c.name} &middot; own Chrome profile</figcaption><img src="file://${f}" style="display:block;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)"></figure>`;
      writeFileSync(
        html,
        `<body style="margin:0;background:#05070d;color:#aab3d6;font:13px -apple-system,system-ui,sans-serif"><div style="padding:10px 14px 0">${caption}</div><div style="display:grid;grid-template-columns:${W}px ${W}px;gap:14px;padding:10px 14px 14px">${fig(consoles[0], files[0])}${fig(consoles[1], files[1])}</div></body>`,
      );
      const p = await chrome.page(`file://${html}`);
      await p.until("[...document.images].every((i) => i.complete)", 8000);
      await p.shot(out);
      rmSync(html, { force: true });
    } finally {
      chrome.close();
    }
  }
  quiet.push([spanFrom - 100, Date.now() + 3500]);
  log(`screenshot ${out}`);
  return out;
}

/** Revoke every ACTIVE operator this harness may have enrolled (by name), void unused codes, reset the room. Safe to run twice. */
function finalCleanup(codes) {
  for (const code of codes ?? []) if (code) access("void-code", code); // a code that was used just answers "already used"
  const q = sh(SPACETIME, ["sql", "--server", SERVER, "claura", "SELECT identity, name, active FROM operator_store"]);
  let n = 0;
  for (const l of (q.stdout || "").split("\n")) {
    const c = l.split("|").map((x) => x.trim().replace(/^"|"$/g, ""));
    if (c.length >= 3 && NAMES.includes(c[1]) && c[2] === "true") {
      const r = access("revoke", c[0].replace(/^0x/i, ""));
      n += /error/i.test(r.stdout + r.stderr) ? 0 : 1;
      log(`revoked test operator "${c[1]}" (${c[0].replace(/^0x/i, "").slice(0, 12)}...)`);
    }
  }
  const r = access("reset");
  log(`reset_demo as owner: ${(r.stdout + r.stderr).replace(/\s+/g, " ").trim() || "ok"} (${n} test operator(s) revoked)`);
}

// ------------------------------------------------------------------ the run
let runner = null;
const codes = [];
try {
  // 1. fresh codes (memory only)
  for (let i = 0; i < N; i++) {
    const r = access("code", "commander", NAMES[i]);
    const code = (r.stdout || "").trim();
    if (r.status !== 0 || !/^[A-Za-z0-9_-]{12,64}$/.test(code)) throw new Error(`could not issue a code for ${NAMES[i]}: ${(r.stderr || "").trim().slice(0, 200)}`);
    codes.push(code);
  }
  log(`issued ${N} fresh commander code(s) as the CLI owner (never printed)`);

  // 2. open and enroll the consoles
  const consoles = [];
  for (let i = 0; i < N; i++) consoles.push(await openConsole(i, codes[i]));
  const [A, B] = consoles;
  await shot("0-enrolled", consoles, `Two enrolled consoles, quiet room. Server: ${LOCAL ? "local appliance ws://127.0.0.1:3000" : "SpacetimeDB Maincloud"}`);

  // 3. run the live incident
  const logFile = join(tmpdir(), `claura-proof-runner-${process.pid}.log`);
  const fd = openSync(logFile, "w");
  cleanups.push(() => rmSync(logFile, { force: true }));
  const liveArgs = [...(LOCAL ? ["--local"] : []), ...(SCRIPTED ? ["--scripted", "--pace-ms", "700"] : []), "--approval-timeout", "300"];
  log(`starting scripts/live.sh ${liveArgs.join(" ")} (resets as owner, then ${SCRIPTED ? "scripted runner" : "real NVIDIA Nemotron via local Ollama"})`);
  runner = spawn(`${BACKEND}/scripts/live.sh`, liveArgs, { stdio: ["ignore", fd, fd], detached: true, env: { ...process.env, NODE_USE_SYSTEM_CA: undefined } });
  cleanups.push(() => {
    try {
      process.kill(-runner.pid, "SIGTERM");
    } catch {}
  });
  const runnerExit = new Promise((res) => runner.on("exit", (c) => res(c)));

  // the consoles must see the incident appear, step by step
  const stepsDone = async (c) => (await c.state()).steps.filter((s) => s.endsWith(":done")).length;
  await A.page.until("claura.live.state().incident !== null", 120000, "A sees the incident");
  log(`A sees incident: ${JSON.stringify((await A.state()).incident)}`);
  if (B) await B.page.until("claura.live.state().incident !== null", 20000, "B sees the incident");
  await A.page.until("claura.live.state().steps.filter((s) => s.endsWith(':done')).length >= 3", 120000, "A: three containment steps done");
  await sleep(1200);
  await A.ev("claura.go('incident'), true");
  if (B) await B.ev("claura.go('incident'), true");
  await sleep(900);
  log(`containment steps done: A ${await stepsDone(A)}/6${B ? ` · B ${await stepsDone(B)}/6` : ""}`);
  await shot("1-containing", consoles, "Incident view while Warden runs the playbook: both consoles read the same rows");

  // approval gate
  await A.page.until("claura.live.state().final && claura.live.state().final.startsWith('pending_approval')", 180000, "pending approval");
  await A.page.until("document.getElementById('sheet').dataset.open === '1'", 15000, "A approval sheet open");
  if (B) await B.page.until("document.getElementById('sheet').dataset.open === '1'", 15000, "B approval sheet open");
  log(`approval card is up on ${B ? "both consoles" : "the console"}; blocked proposals: ${JSON.stringify((await A.state()).blocked)}`);
  await sleep(900);
  await shot("2-approval", consoles, "The pending quarantine proposal opens the approval sheet on every commander's console");

  // approve with a REAL click in console A
  const aState0 = await A.state();
  log(`A: clicking "Approve quarantine" (real mouse click); state before: final=${aState0.final}`);
  const tApprove = Date.now();
  await A.page.clickSel("#approveBtn");
  await A.page.until("claura.live.state().final && claura.live.state().final.startsWith('approved')", 20000, "A sees approved");
  const tA = Date.now() - tApprove;
  if (B) await B.page.until("claura.live.state().final && claura.live.state().final.startsWith('approved')", 20000, "B sees approved");
  const tB = Date.now() - tApprove;
  log(`approval from A reached A in ${tA} ms${B ? ` and B in ${tB} ms` : ""}; approver on record: ${(await A.state()).final}`);
  await A.page.until("claura.live.state().incident && claura.live.state().incident.status === 'contained'", 30000, "A sees contained");
  if (B) await B.page.until("claura.live.state().incident && claura.live.state().incident.status === 'contained'", 30000, "B sees contained");
  await sleep(3800); // the isolating animation settles
  await shot("3-contained", consoles, "After approval in console A: contained on both. The approver is recorded from A's identity by the module");

  // scope + tasks: A changes a data-asset status and a task through the UI (reducers set_asset_status, set_task_status); B sees both
  {
    const asset = await A.ev("claura.data.assets().find((a) => /billing/i.test(a.name))");
    const note = "Query logs reviewed by " + A.name + ": no reads outside the maintenance window.";
    await A.ev(`claura.go('scope'), claura.expand('asset:${asset.id}'), true`);
    await sleep(1100);
    await A.page.clickSel(`[data-asset-note="${asset.id}"]`);
    await A.page.type(note);
    await A.page.clickSel(`[data-set-status="intact"][data-asset="${asset.id}"]`);
    const tAsset = Date.now();
    if (B) await B.page.until(`claura.data.assets().some((a) => a.id === ${asset.id} && a.status === 'intact' && a.note.includes('maintenance window'))`, 15000, "B sees the asset change");
    log(`scope: "${asset.name}" ${asset.status} -> intact with a note, set from A${B ? `, on B after ${Date.now() - tAsset} ms` : ""}; recorded as "${await A.ev(`claura.data.assets().find((a) => a.id === ${asset.id}).updatedBy`)}"`);
    await A.ev("claura.go('warroom'), claura.expand('tasks'), true");
    await sleep(900);
    const task = await A.ev("claura.data.tasks().find((t) => t.status === 'open')");
    await A.page.clickSel(`.task-st[data-task="${task.id}"]`);
    if (B) await B.page.until(`claura.data.tasks().some((t) => t.id === ${task.id} && t.status === 'doing')`, 15000, "B sees the task change");
    log(`tasks: "${task.title}" open -> doing, set from A${B ? ", seen on B" : ""}`);
  }

  // war room: B posts, A sees it
  const text = `Copy. ${B ? B.name : A.name} here: quarantine confirmed on my console too.`;
  const poster = B ?? A;
  const reader = B ? A : null;
  await poster.ev("claura.selectChannel('#command'), true");
  await sleep(500);
  await poster.page.clickSel("#wrInput");
  await poster.page.type(text);
  const tPost = Date.now();
  await poster.page.clickSel("#wrForm .send");
  await poster.page.until(`claura.data.messages('#command').some((m) => m.text === ${JSON.stringify(text)})`, 15000, "poster sees its own message");
  let skew = 0;
  if (reader) {
    await reader.page.until(`claura.data.messages('#command').some((m) => m.text === ${JSON.stringify(text)})`, 15000, "reader sees the message");
    skew = Date.now() - tPost;
    await reader.ev("claura.selectChannel('#command'), true");
  }
  await sleep(900);
  log(`War Room message from ${poster.label} ${reader ? `reached ${reader.label} in ${skew} ms` : "posted"}: "${text}"`);
  await shot("4-warroom", consoles, `War Room #command: the message typed in console ${poster.label} appears in ${reader ? `console ${reader.label}` : "the thread"} with no refresh`);

  // a flaky network: B's socket drops; it keeps its rows, reconnects by itself with the stored token, and catches up
  let outage = null;
  if (B) {
    outage = { from: Date.now(), to: 0 };
    await B.ev("claura.live.dropConnection(), true");
    await sleep(150);
    const during = await B.ev("({ link: claura.live.link, access: claura.live.access, incident: !!claura.data.incident(), msgs: claura.data.messages('#command').length })");
    const missed = `While B was reconnecting, ${A.name} wrote this.`;
    await A.ev("claura.selectChannel('#command'), true");
    await A.page.clickSel("#wrInput");
    await A.page.type(missed);
    await A.page.clickSel("#wrForm .send");
    const tDrop = Date.now();
    await B.page.until("claura.live.link === 'ready'", 20000, "B reconnected");
    await B.page.until(`claura.data.messages('#command').some((m) => m.text === ${JSON.stringify(missed)})`, 15000, "B caught up");
    outage.to = Date.now();
    log(`reconnect: B's socket dropped (state right after: ${JSON.stringify(during)}); back to 'ready' and caught up on the message it missed in ${Date.now() - tDrop} ms, same identity ${(await B.ev("claura.live.identity")) === B.identity}`);
  }

  // let Scribe finish, then the report and agents
  const exit = await Promise.race([runnerExit, sleep(150000).then(() => "timeout")]);
  log(`runner exited: ${exit}`);
  await sleep(1500);
  await A.ev("claura.go('reports'), claura.expand('report:INC-0419'), true").catch(() => {});
  if (B) await B.ev("claura.go('agents'), true");
  await sleep(1500);
  await shot("5-report-and-agents", consoles, "Console A: Reports (live NIST record, anchor button). Console B: Agents (live agent lines, reasoning, tool calls)");

  if (TOUR) {
    // a look at every view on console A, for review
    const views = ["overview", "incident", "warroom", "scope", "agents", "policy", "reports", "integrations", "access"];
    for (const v of views) {
      await A.ev(`claura.go('${v}'), true`);
      await sleep(1100);
      await A.page.shot(join(OUT, `tour-${v}.png`));
    }
    await A.ev("claura.go('incident'), claura.expand('step:7'), claura.expand('blocked:' + claura.data.proposals().find((p) => p.status === 'blocked')?.id), window.scrollTo(0,0), document.querySelector('#scroll').scrollTop = 620, true");
    await sleep(1400);
    await A.page.shot(join(OUT, "tour-incident-containment.png"));
    await A.ev("document.querySelector('#scroll').scrollTop = 1500, true");
    await sleep(900);
    await A.page.shot(join(OUT, "tour-incident-lower.png"));
    await A.ev("claura.go('agents'), claura.expand('agent:warden'), true");
    await sleep(1200);
    await A.page.shot(join(OUT, "tour-agents-warden.png"));
    await A.ev("claura.go('reports'), claura.expand('rs:actions'), claura.expand('rs:evidence'), claura.expand('rs:timeline'), true");
    await sleep(1200);
    await A.ev("document.querySelector('#scroll').scrollTop = 700, true");
    await sleep(900);
    await A.page.shot(join(OUT, "tour-report-sections.png"));
    await A.ev("claura.popover('isolation'), true");
    await sleep(900);
    await A.page.shot(join(OUT, "tour-popover.png"));
    await A.ev("claura.popover(null), true");
    log("tour screenshots written");
  }

  // 4. rows, row by row
  const snaps = [];
  for (const c of consoles) snaps.push(await c.ev(SNAP));
  const same = snaps.length === 2 ? snaps[0] === snaps[1] : true;
  const parsed = JSON.parse(snaps[0]);
  const counts = `${parsed.events.length} events, ${parsed.props.length} proposals, ${parsed.msgs.reduce((n, m) => n + m.length, 0)} messages, ${parsed.tasks.length} tasks, ${parsed.decs.length} decisions, ${parsed.assets.length} assets`;
  log(`final rows: ${counts}`);
  if (snaps.length === 2) log(`row-for-row identical between A and B: ${same}  (sha256 ${sha(snaps[0]).slice(0, 16)}... vs ${sha(snaps[1]).slice(0, 16)}...)`);
  // when did each console first see each row?
  if (N === 2) {
    const seen = await Promise.all(consoles.map((c) => c.ev("window.__seen")));
    const live0 = Math.max(...consoles.map((c) => c.enrolledAt)) + 1500; // rows older than this were loaded at each console's own enrollment
    const keys = Object.keys(seen[0]).filter((k) => k in seen[1] && seen[0][k] > live0 && seen[1][k] > live0);
    const preExisting = Object.keys(seen[0]).filter((k) => k in seen[1]).length - keys.length;
    const d = keys.map((k) => Math.abs(seen[0][k] - seen[1][k])).sort((a, b) => a - b);
    const only = Object.keys(seen[0]).filter((k) => !(k in seen[1])).length + Object.keys(seen[1]).filter((k) => !(k in seen[0])).length;
    const p = (q) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
    log(`real-time check: ${keys.length} rows/state changes created while both consoles were open (${preExisting} older rows were skipped: each console loads those at its own enrollment), ${only} seen by only one; arrival skew A vs B: median ${p(0.5)} ms, p95 ${p(0.95)} ms, max ${d[d.length - 1]} ms`);
    const worst = keys.map((k) => [k, seen[0][k] - seen[1][k]]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 3);
    log(`largest skews (+ = B first): ${worst.map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v} ms`).join("; ")}`);
    {
      // where did the slow ones sit in time? (seconds since the run started; "commit" is the module's own timestamp for the row)
      const ats = await A.ev("(() => { const o = {}; const d = claura.data; for (const e of d.events()) o['ev:' + e.id] = e.at; for (const c of ['#command', '#legal', '#exec', '#comms-pr', '#vendors']) for (const m of d.messages(c)) o['msg:' + c + ':' + m.id] = m.at; return o; })()");
      const rel = (t) => ((t - t0) / 1000).toFixed(2) + "s";
      for (const [k] of worst) log(`  ${k}: commit ${ats[k] ? rel(ats[k]) : "n/a"}, A saw it at ${rel(seen[0][k])}, B at ${rel(seen[1][k])}`);
    }
    {
      // rows that arrive while a console's main thread is stalled by the harness's own screenshot capture, or while B's socket is
      // deliberately dropped, say nothing about latency: leave those windows out and report what is left
      const inWindow = (t) => quiet.some(([a, b]) => t >= a && t <= b) || (outage && t >= outage.from - 50 && t <= outage.to + 600);
      const clean = keys.filter((k) => ![0, 1].some((i) => inWindow(seen[i][k])));
      const dc = clean.map((k) => Math.abs(seen[0][k] - seen[1][k])).sort((a, b) => a - b);
      const q = (f) => dc[Math.min(dc.length - 1, Math.floor(dc.length * f))];
      log(`leaving out the ${keys.length - clean.length} rows that landed while a page was being screenshotted by this harness or while B was deliberately offline: ${clean.length} rows, skew A vs B median ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${dc[dc.length - 1]} ms`);
      var cleanStats = { rows: clean.length, median: q(0.5), p95: q(0.95), max: dc[dc.length - 1] };
    }
    // commit -> screen: the module stamps every event with its own clock when the reducer commits; the console stamps arrival
    // (clock offset between Maincloud and this Mac is included, so read it as an upper bound)
    {
      // signals that arrive before the incident exists are held back on purpose (the console shows them once the incident opens)
      const evs = (await A.ev("claura.data.events().map((e) => [e.id, e.at, e.kind])")).filter(([, at, kind]) => at > live0 && kind !== "signal");
      const lat = (i) => evs.map(([id, at]) => seen[i]['ev:' + id] - at).filter((x) => Number.isFinite(x) && x > -2000).sort((a, b) => a - b);
      const stat = (a) => ({ n: a.length, median: a[Math.floor(a.length * 0.5)], p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] });
      var latency = consoles.map((c, i) => ({ console: c.label, ...stat(lat(i)) }));
      log(`commit-to-screen latency (module commit timestamp to browser receipt, ${evs.length} log entries written after both consoles were open): ${latency.map((l) => `${l.console} median ${l.median} ms, p95 ${l.p95} ms`).join("; ")}`);
    }
    writeFileSync(join(OUT, "live-run.json"), JSON.stringify({ at: new Date().toISOString(), server: SERVER, scripted: SCRIPTED, rows: counts, identical: same, shared: keys.length, onlyOne: only, skewMs: { median: p(0.5), p95: p(0.95), max: d[d.length - 1] }, skewExcludingStallsMs: typeof cleanStats === "undefined" ? null : cleanStats, commitToScreenMs: typeof latency === "undefined" ? null : latency, approvalMs: { A: tA, B: tB }, warRoomMs: skew }, null, 2) + "\n");
  }
  const hexes = consoles.map((c) => c.identity);

  // a reload: the token persisted in localStorage, so A comes back as the same operator with no code, straight into the contained state
  {
    const idBefore = A.identity;
    await A.page.goto(URL_);
    await A.page.until("window.claura && window.claura.live && window.claura.live.applied", 25000, "A reloaded and applied");
    await sleep(1200);
    await A.ev("claura.go('incident'), true");
    await sleep(1200);
    const back = await A.ev("({ access: claura.live.access, id: claura.live.identity, sheet: document.getElementById('joinSheet').dataset.open, phase: claura.state, status: claura.data.incident() && claura.data.incident().status, ttc: claura.live.state().ttc, hero: document.getElementById('pillText').textContent })");
    log(`reload: A is back as the same operator without a code (${back.id === idBefore && back.access === 'enrolled' && back.sheet === '0'}), console phase "${back.phase}", incident ${back.status}, hero "${back.hero}", time to contain ${back.ttc.toFixed(1)} s`);
    if (!(back.id === idBefore && back.access === "enrolled" && back.phase !== "nominal")) throw new Error("reload did not restore the session: " + JSON.stringify(back));
  }

  // 5. the owner resets the room while both consoles are open: they must fall back to the quiet room by themselves
  if (!KEEP) {
    access("reset");
    for (const c of consoles) await c.page.until("claura.data.incident() === null && claura.live.state().clock.started === false", 20000, `${c.label} back to the quiet room`);
    await A.ev("claura.go('incident'), true");
    if (B) await B.ev("claura.go('overview'), true");
    await sleep(2200);
    log("owner reset_demo with both consoles open: both fell back to the quiet room (no incident, scope empty, clock stopped)");
    await shot("6-after-reset", consoles, "After the owner's reset_demo, with both consoles still open: nothing to reload, both are back to the quiet room");
  }

  // 6. cleanup
  await runCleanups();
  void hexes;
  if (!KEEP) {
    finalCleanup(codes);
    codes.fill("");
    const q = (sql) => (sh(SPACETIME, ["sql", "--server", SERVER, "claura", sql]).stdout || "").replace(/\s+/g, " ");
    log(`database now: incidents ${q("SELECT COUNT(*) AS n FROM incident_store").match(/\d+(?!.*\d)/)?.[0]}, proposals ${q("SELECT COUNT(*) AS n FROM proposal_store").match(/\d+(?!.*\d)/)?.[0]}, messages ${q("SELECT COUNT(*) AS n FROM message_store").match(/\d+(?!.*\d)/)?.[0]}, events ${q("SELECT COUNT(*) AS n FROM incident_event_store").match(/\d+(?!.*\d)/)?.[0]}`);
  } else log("--keep: test operators and the run were left in place");
  log("done");
} catch (e) {
  console.error("FAILED:", e.message);
  await runCleanups();
  if (!KEEP) finalCleanup(codes); // never leave a half-run behind: no test operators, no unused codes, a reset room
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
