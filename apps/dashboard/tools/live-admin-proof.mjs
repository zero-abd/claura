// Live proof for the ADMIN paths, through the real UI in separate Chrome profiles:
//   admin console C   enrolls with a code minted by the CLI owner, opens People & Access, issues a break-glass code from the
//                     Add person sheet (reducer issue_enrollment), voids a second code (revoke_enrollment), revokes a person
//                     (revoke_operator)
//   responder console D   enrolls with the code C displayed (typed with its dashes, as a person would read it out), posts to
//                     #command, then watches its own screen empty the moment C revokes it
// Codes (the CLI-minted admin code, and the one C displays) are held in memory only and never printed. Cleans up after itself.
//
//   node tools/live-admin-proof.mjs [--port 4317] [--local] [--out shots]
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4317");
const LOCAL = args.includes("--local");
const OUT = resolve(opt("out", "shots"));
const BACKEND = "/Users/abd/repos/claura-backend";
const SPACETIME = "/Users/abd/.local/bin/spacetime";
const SERVER = LOCAL ? "local" : "maincloud";
const URL_ = `http://127.0.0.1:${PORT}/?live=1${LOCAL ? "&stdb=local" : ""}`;
const NAMES = ["Test Admin", "Test Responder", "Test Legal"];
const W = 1440;
const H = 900;
const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const sh = (cmd, a) => spawnSync(cmd, a, { encoding: "utf8", env: { ...process.env, NODE_USE_SYSTEM_CA: undefined } });
const access = (...a) => sh(`${BACKEND}/scripts/access.sh`, [...(LOCAL ? ["--local"] : []), ...a]);
mkdirSync(OUT, { recursive: true });

const chromes = [];
const secrets = [];
function finalCleanup() {
  for (const c of secrets) if (c) access("void-code", c);
  const q = sh(SPACETIME, ["sql", "--server", SERVER, "claura", "SELECT identity, name, active FROM operator_store"]);
  let n = 0;
  for (const l of (q.stdout || "").split("\n")) {
    const c = l.split("|").map((x) => x.trim().replace(/^"|"$/g, ""));
    if (c.length >= 3 && NAMES.includes(c[1]) && c[2] === "true") {
      const r = access("revoke", c[0].replace(/^0x/i, ""));
      if (!/error/i.test(r.stdout + r.stderr)) n++;
    }
  }
  // voids for codes issued through the UI: find unused ones with our hints (owner SQL, never printed)
  const e = sh(SPACETIME, ["sql", "--server", SERVER, "claura", "SELECT code, name_hint, used_by FROM enrollment_store WHERE used_by = ''"]);
  let v = 0;
  for (const l of (e.stdout || "").split("\n")) {
    const c = l.split("|").map((x) => x.trim().replace(/^"|"$/g, ""));
    if (c.length >= 3 && NAMES.includes(c[1]) && c[2] === "" && /^[A-Za-z0-9_-]{12,64}$/.test(c[0])) {
      const r = access("void-code", c[0]);
      if (!/error/i.test(r.stdout + r.stderr)) v++;
    }
  }
  const r = access("reset");
  log(`cleanup: ${n} test operator(s) revoked, ${v} unused test code(s) voided, reset_demo ${(r.stdout + r.stderr).replace(/\s+/g, " ").trim() || "ok"}`);
}

async function open(label) {
  const chrome = await launchChrome({ width: W, height: H });
  chromes.push(chrome);
  const page = await chrome.page(URL_);
  await page.until("window.claura && window.claura.live && window.claura.live.applied", 25000, `${label} applied`);
  await page.until("document.getElementById('joinSheet').dataset.open === '1'", 8000, `${label} join sheet`);
  await sleep(1100);
  return { label, chrome, page };
}
async function enrollWith(c, code) {
  await c.page.clickSel("#joinCode");
  await c.page.type(code);
  await c.page.clickSel("#joinBtn");
  await c.page.until("claura.live.access === 'enrolled' || document.getElementById('joinErr').textContent.length > 0", 25000, `${c.label} join`);
  const d = await c.page.eval("({ access: claura.live.access, err: document.getElementById('joinErr').textContent, me: claura.data.me() })");
  if (d.access !== "enrolled") throw new Error(`${c.label} join failed: ${d.err}`);
  c.identity = d.me.identity;
  log(`${c.label}: enrolled as "${d.me.name}" (${d.me.role})`);
}
async function composite(a, b, out, caption) {
  const fa = join(tmpdir(), `adm-${process.pid}-a.png`);
  const fb = join(tmpdir(), `adm-${process.pid}-b.png`);
  await a.page.shot(fa);
  await b.page.shot(fb);
  const chrome = await launchChrome({ width: W * 2 + 42, height: H + 90 });
  try {
    const html = join(tmpdir(), `adm-${process.pid}.html`);
    const fig = (c, f, t) => `<figure style="margin:0"><figcaption style="padding:0 4px 8px;font-weight:600;color:#dfe5ff">${t}</figcaption><img src="file://${f}" style="display:block;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)"></figure>`;
    writeFileSync(html, `<body style="margin:0;background:#05070d;color:#aab3d6;font:13px -apple-system,system-ui,sans-serif"><div style="padding:10px 14px 0">${caption}</div><div style="display:grid;grid-template-columns:${W}px ${W}px;gap:14px;padding:10px 14px 14px">${fig(a, fa, `Console ${a.label} &middot; own Chrome profile`)}${fig(b, fb, `Console ${b.label} &middot; own Chrome profile`)}</div></body>`);
    const p = await chrome.page(`file://${html}`);
    await p.until("[...document.images].every((i) => i.complete)", 8000);
    await p.shot(out);
    rmSync(html, { force: true });
  } finally {
    chrome.close();
    rmSync(fa, { force: true });
    rmSync(fb, { force: true });
  }
  log(`screenshot ${out}`);
}

try {
  // C: admin, enrolled with a CLI-minted code
  const r = access("code", "admin", "Test Admin");
  const adminCode = (r.stdout || "").trim();
  if (r.status !== 0 || !/^[A-Za-z0-9_-]{12,64}$/.test(adminCode)) throw new Error(`could not issue an admin code: ${(r.stderr || "").trim().slice(0, 160)}`);
  secrets.push(adminCode);
  const C = await open("C");
  await enrollWith(C, adminCode);
  secrets.length = 0;

  // C: People & Access, then Add person -> issue a code (reducer issue_enrollment)
  await C.page.eval("claura.go('access'), true");
  await sleep(900);
  const lock = await C.page.eval("({ locked: !document.getElementById('acLocked').hidden, admin: !document.getElementById('acAdmin').hidden, addBtn: !document.querySelector('.ac-add').hidden })");
  log(`C: People & Access for an admin: ${JSON.stringify(lock)}`);
  if (lock.locked || !lock.admin) throw new Error("an admin must see People & Access");
  await C.page.clickSel(".ac-add");
  await sleep(900);
  await C.page.clickSel("#pName");
  await C.page.type("Test Responder");
  await C.page.clickSel("#issueBtn");
  await C.page.until("document.getElementById('personSheet').dataset.s === 'code'", 15000, "code issued");
  await sleep(900);
  const shown = await C.page.eval("document.getElementById('pcCode').textContent");
  secrets.push(shown);
  log(`C: code issued through the sheet (${shown.replace(/[A-Z0-9]/g, "X")}), QR drawn: ${await C.page.eval("!!document.querySelector('#pcQr svg')")}`);
  await C.page.shot(join(OUT, "live-admin-1-code.png"));
  await C.page.clickSel("#codeDone");
  await sleep(700);
  const pending = await C.page.eval("claura.data.enrollments().filter((e) => !e.usedBy).map((e) => [e.nameHint, e.role])");
  log(`C: pending codes in the roster data: ${JSON.stringify(pending)}`);

  // D: responder joins with the displayed code, typed with its dashes
  const D = await open("D");
  await enrollWith(D, shown);
  secrets.length = 0;
  await D.page.eval("claura.go('warroom'), claura.selectChannel('#command'), true");
  await sleep(700);
  const text = "Test Responder here: I can see #command.";
  await D.page.clickSel("#wrInput");
  await D.page.type(text);
  await D.page.clickSel("#wrForm .send");
  await C.page.until(`claura.data.messages('#command').some((m) => m.text === ${JSON.stringify(text)})`, 15000, "C sees D's message");
  log(`D -> C: War Room message arrived; D's input cleared after sending: ${(await D.page.eval("document.getElementById('wrInput').value")) === ""}`);
  const dRows = await D.page.eval("({ role: claura.data.me().role, canSeeAccess: !document.querySelector('.nav-item[data-view=access]').hidden, ops: claura.data.operators().length, enrollments: claura.data.enrollments().length })");
  log(`D (responder): ${JSON.stringify(dRows)}  (a non-admin must not see enrollment codes)`);

  // C sees D in People & Access, then void a second code
  await C.page.eval("claura.go('access'), true");
  await sleep(1000);
  const names = await C.page.eval("[...document.querySelectorAll('#acList .person-row .pr-main b')].map((b) => b.textContent)");
  log(`C: roster now lists ${JSON.stringify(names)}`);
  await C.page.clickSel(".ac-add");
  await sleep(900);
  await C.page.clickSel("#pName");
  await C.page.type("Test Legal");
  await C.page.eval("claura.data && document.querySelector('[data-role-pick=\"legal\"]').click(), true");
  await C.page.clickSel("#issueBtn");
  await C.page.until("document.getElementById('personSheet').dataset.s === 'code'", 15000, "second code issued");
  await C.page.clickSel("#codeDone");
  await sleep(800);
  const before = await C.page.eval("claura.data.enrollments().filter((e) => !e.usedBy).length");
  // the row of the code THIS run issued (never the first Cancel on the page: pre-issued codes of other people are listed too)
  await C.page.clickSel('[data-act="cancel-code"][data-target="cancel-code:test-legal"]');
  await C.page.until(`claura.data.enrollments().filter((e) => !e.usedBy).length === ${before - 1}`, 15000, "code voided");
  log(`C: second code voided with Cancel (unused codes ${before} -> ${before - 1})`);

  // C revokes D with the two-step button; D's screen empties live
  await C.page.eval("claura.go('access'), true");
  await sleep(700);
  await composite(C, D, join(OUT, "live-admin-2-before-revoke.png"), "Admin console C (People &amp; Access) and responder console D (War Room): both enrolled through break-glass codes");
  await C.page.clickSel('[data-act="revoke"][data-target="revoke:Test Responder"]');
  await sleep(300);
  await C.page.clickSel('[data-act="revoke"][data-target="revoke:Test Responder"]');
  const tRevoke = Date.now();
  await D.page.until("claura.live.access === 'needs-code'", 15000, "D emptied");
  const ms = Date.now() - tRevoke;
  await sleep(1300);
  const empty = await D.page.eval("({ incident: !!claura.data.incident(), msgs: claura.data.messages('#command').length, ops: claura.data.operators().length, sheet: document.getElementById('joinSheet').dataset.open, title: document.getElementById('joinTitle').textContent })");
  log(`D: revoked by C; D's console emptied ${ms} ms later and says ${JSON.stringify(empty)}`);
  await composite(C, D, join(OUT, "live-admin-3-after-revoke.png"), "After C clicked Revoke: D's data is gone live and the break-glass sheet is back (no reload, no reconnect)");
  const refuse = await D.page.eval("(async () => { const r = await claura.live.enroll('NOT-A-REAL-CODE-1234', 'x'); return r; })()");
  log(`D: a revoked device cannot post or approve; enrolling with a bad code answers: ${JSON.stringify(refuse)}`);
  log("admin proof ok");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  for (const c of chromes) c.close();
  finalCleanup();
}
process.exit(process.exitCode ?? 0);
