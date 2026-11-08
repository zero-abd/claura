// Live proof for the dress-rehearsal fixes: three real consoles on the LOCAL appliance (ws://127.0.0.1:3000), each in its own
// headless Chrome profile, no mocks:
//   A = commander (approves), B = legal counsel (reads the incident row only), C = admin (People & Access).
//
//   node tools/legal-proof.mjs [--port 4431] [--scripted] [--out dir] [--maincloud]
//   --a-admin enrolls console A as an ADMIN instead of a commander: one screen that approves AND opens People & Access (the access beat)
//   (--maincloud runs the same three consoles against SpacetimeDB Maincloud instead of the local appliance; it resets the room as the owner at the end)
//
// It mints single-use codes with scripts/access.sh (as the CLI owner; codes live in this process only, never printed), enrolls the
// three consoles through the break-glass sheet, runs scripts/live.sh --local (real Nemotron unless --scripted), approves on A with a
// real click, and checks what each console shows: B flips to Contained, B's clock stops, the approval sheet's click guard, the Agents
// trace (tool-call rows, model tag), the Policy page, and C's Add person flow. Cleanup: revoke the test operators, void the codes,
// reset the room as the owner, stop the runner and every Chrome.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (k) => args.includes(`--${k}`);
const PORT = opt("port", "4431");
const OUT = resolve(opt("out", "legal-proof-out"));
const SCRIPTED = flag("scripted");
const MAIN = flag("maincloud");
const A_ADMIN = flag("a-admin");
const BACKEND = "/Users/abd/repos/claura-backend";
const SPACETIME = "/Users/abd/.local/bin/spacetime";
const URL_ = `http://127.0.0.1:${PORT}/?live=1${MAIN ? "" : "&stdb=local"}`;
const NAMES = { A: "Test Commander A", B: "Test Counsel B", C: "Test Admin C" };
const ROLES = { A: A_ADMIN ? "admin" : "commander", B: "legal", C: "admin" };
const W = 1440;
const H = 900;

const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: "utf8", env: { ...process.env, NODE_USE_SYSTEM_CA: undefined }, ...o });
const ACCESS = `${BACKEND}/scripts/access.sh`;
const access = (...a) => sh(ACCESS, [...(MAIN ? [] : ["--local"]), ...a]);
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
      f();
    } catch {}
  }
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};

async function openConsole(label, code) {
  const chrome = await launchChrome({ width: W, height: H });
  cleanups.push(() => chrome.close());
  const page = await chrome.page(URL_);
  await page.until("window.claura && window.claura.live", 20000, `${label} live api`);
  await page.until("window.claura.live.applied", 25000, `${label} subscription applied`);
  await page.until("document.getElementById('joinSheet').dataset.open === '1'", 8000, `${label} join sheet`);
  await sleep(1100);
  await page.clickSel("#joinCode");
  await page.type(code);
  await page.clickSel("#joinBtn");
  await page.until("claura.live.access === 'enrolled' || document.getElementById('joinErr').textContent.length > 0", 25000, `${label} enrolled`);
  const who = await page.eval("({ name: claura.data.me().name, role: claura.data.me().role, access: claura.live.access })");
  if (who.access !== "enrolled") throw new Error(`${label}: join failed`);
  log(`${label}: enrolled as "${who.name}" (${who.role})`);
  await sleep(500);
  return { label, chrome, page, who };
}

const finalCleanup = (codes) => {
  for (const c of codes) if (c) access("void-code", c);
  const q = sh(SPACETIME, ["sql", "--server", MAIN ? "maincloud" : "local", "claura", "SELECT identity, name, active FROM operator_store"]);
  for (const l of (q.stdout || "").split("\n")) {
    const c = l.split("|").map((x) => x.trim().replace(/^"|"$/g, ""));
    if (c.length >= 3 && Object.values(NAMES).includes(c[1]) && c[2] === "true") {
      access("revoke", c[0].replace(/^0x/i, ""));
      log(`revoked test operator "${c[1]}"`);
    }
  }
  const r = access("reset");
  log(`reset as owner: ${(r.stdout + r.stderr).replace(/\s+/g, " ").trim().slice(0, 100) || "ok"}`);
};

const codes = [];
let runner = null;
try {
  for (const k of ["A", "B", "C"]) {
    const r = access("code", ROLES[k], NAMES[k]);
    const code = (r.stdout || "").trim();
    if (r.status !== 0 || !/^[A-Za-z0-9_-]{12,64}$/.test(code)) throw new Error(`could not issue a ${ROLES[k]} code: ${(r.stderr || "").trim().slice(0, 200)}`);
    codes.push(code);
  }
  log("issued 3 fresh single-use codes (commander, legal, admin) as the CLI owner; never printed");
  const A = await openConsole("A", codes[0]);
  const B = await openConsole("B", codes[1]);
  const C = await openConsole("C", codes[2]);

  // ------------------------------------------------------------------ run the incident
  const logFile = join(tmpdir(), `claura-legalproof-runner-${process.pid}.log`);
  const fd = openSync(logFile, "w");
  cleanups.push(() => rmSync(logFile, { force: true }));
  const liveArgs = [...(MAIN ? [] : ["--local"]), ...(SCRIPTED ? ["--scripted", "--pace-ms", "700"] : []), "--approval-timeout", "300"];
  log(`starting scripts/live.sh ${liveArgs.join(" ")}`);
  const tRun = Date.now();
  runner = spawn(`${BACKEND}/scripts/live.sh`, liveArgs, { stdio: ["ignore", fd, fd], detached: true, env: { ...process.env, NODE_USE_SYSTEM_CA: undefined } });
  cleanups.push(() => {
    try {
      process.kill(-runner.pid, "SIGTERM");
    } catch {}
  });
  runner.on("exit", () => {});

  await A.page.until("claura.live.state().incident !== null", 120000, "A sees the incident");
  const tInc = Date.now() - tRun;
  await B.page.until("claura.live.state().incident !== null", 20000, "B sees the incident");
  log(`incident visible on A after ${(tInc / 1000).toFixed(1)} s (from starting live.sh)`);
  await B.page.until("document.title.startsWith('Breach')", 20000, "B shows the breach");
  check("B (legal) shows 'Breach in progress' while the incident is open", true, await B.page.eval("document.title"));

  await A.page.until("claura.live.state().steps.filter((s) => s.endsWith(':done')).length >= 3", 120000, "A: three containment steps");
  await A.page.eval("claura.go('agents'), claura.expand('agent:triage'), claura.expand('agent:sentry'), true");
  const midHeader = await A.page.eval("document.querySelector('#tl-triage').previousElementSibling.querySelector('.tag').textContent");
  const midStates = await A.page.eval("JSON.stringify(Object.values(claura.data.agentStates()).map((a) => a.agent + '=' + a.status + ' / ' + a.model))");
  log(`A agents header mid-run: "${midHeader}"; agent_state rows: ${midStates}`);

  // approval gate
  await A.page.until("claura.live.state().final && claura.live.state().final.startsWith('pending_approval')", 180000, "pending approval");
  await A.page.until("document.getElementById('sheet').dataset.open === '1'", 15000, "A approval sheet open");
  const tSheet = Date.now();
  const sheetOnB = await B.page.eval("document.getElementById('sheet').dataset.open");
  check("B (legal) gets no approval sheet", sheetOnB === "0", `sheet.open=${sheetOnB}`);
  await A.page.shot(join(OUT, "A-approval-sheet.png"));

  // the click guard: a click aimed at the stage the instant the sheet appears must not approve
  const rect = await A.page.eval("(() => { const b = document.getElementById('approveBtn').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()");
  await A.page.click(rect.x, rect.y); // immediately after the sheet opened
  await sleep(500);
  const afterEarly = await A.page.eval("claura.live.state().final");
  check("A: a click on the approve button right after the sheet opens does NOT approve", afterEarly.startsWith("pending_approval"), `final=${afterEarly}, ${Date.now() - tSheet} ms after the sheet opened`);
  await sleep(900);
  const tTtcHold = await B.page.eval("claura.live.state().ttc");
  await B.page.shot(join(OUT, "B-while-approval-pending.png"));

  // the sheet dismissed ("Not now"): ⌘↵ must not approve a proposal that is pending behind a closed sheet
  const meta = async (page) => {
    await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 4 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 4 });
  };
  await A.page.clickSel("#notNow");
  await A.page.until("document.getElementById('sheet').dataset.open === '0'", 5000, "sheet dismissed");
  await sleep(500);
  await meta(A.page);
  await sleep(700);
  const afterCmdClosed = await A.page.eval("claura.live.state().final");
  check("A: ⌘↵ with the approval sheet dismissed does NOT approve", afterCmdClosed.startsWith("pending_approval"), `final=${afterCmdClosed}`);
  await A.page.eval("claura.openApproval(), true");
  await A.page.until("document.getElementById('sheet').dataset.open === '1'", 5000, "sheet reopened");
  await sleep(1000);

  // approve with the demo's real cue, ⌘↵, on the open sheet
  const tApprove = Date.now();
  await meta(A.page);
  await A.page.until("claura.live.state().final && claura.live.state().final.startsWith('approved')", 20000, "A sees approved");
  await A.page.until("document.title.startsWith('Contained')", 40000, "A shows contained");
  const tA = Date.now() - tApprove;
  let tB = -1;
  try {
    await B.page.until("document.title.startsWith('Contained')", 20000, "B shows contained");
    tB = Date.now() - tApprove;
  } catch {}
  check("B (legal) flips to Contained after A approves", tB >= 0, tB >= 0 ? `A after ${tA} ms, B after ${tB} ms` : `A after ${tA} ms, B never (title=${await B.page.eval("document.title")})`);
  const bTone = await B.page.eval("document.body.dataset.tone");
  check("B: the whole console tone is contained", bTone === "contained", `tone=${bTone}`);
  await sleep(3500);
  const aTtc1 = await A.page.eval("claura.live.state().ttc");
  const bTtc1 = await B.page.eval("claura.live.state().ttc");
  await sleep(2500);
  const aTtc2 = await A.page.eval("claura.live.state().ttc");
  const bTtc2 = await B.page.eval("claura.live.state().ttc");
  check("B's time-to-contain stops ticking", Math.abs(bTtc2 - bTtc1) < 0.01, `B ${bTtc1.toFixed(2)} -> ${bTtc2.toFixed(2)} s; A ${aTtc1.toFixed(2)} -> ${aTtc2.toFixed(2)} s; B at the gate ${tTtcHold.toFixed(2)} s`);
  check("A's time-to-contain stops ticking", Math.abs(aTtc2 - aTtc1) < 0.01);
  const bHero = await B.page.eval("document.querySelector('#tbSub').textContent + ' | ' + (document.querySelector('.hero-line, .res-line, #heroRes') ? document.querySelector('.hero-line, .res-line, #heroRes').textContent : '')");
  log(`B overview: ${bHero}`);
  await B.page.shot(join(OUT, "B-contained.png"));
  await A.page.shot(join(OUT, "A-contained.png"));

  // wait for Scribe (brief, report) so the trace is complete
  await A.page.until("claura.data.report && claura.data.report() !== null", 90000, "report filed").catch(() => log("report not filed within 90 s"));
  await sleep(1500);

  // ------------------------------------------------------------------ Agents trace on A (response team)
  await A.page.eval("claura.go('agents'), ['sentry','triage','warden','scribe'].forEach((a) => claura.expand('agent:' + a)), true");
  await sleep(900);
  const trace = await A.page.eval(`(() => {
    const out = {};
    for (const a of ['sentry', 'triage', 'warden', 'scribe'])
      out[a] = { header: document.querySelector('#tl-' + a).previousElementSibling.querySelector('.tag').textContent,
                 rows: [...document.querySelectorAll('#tl-' + a + ' .tool')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()) };
    return out;
  })()`);
  for (const [a, v] of Object.entries(trace)) log(`Agents/${a} [${v.header}] ${v.rows.length} tool row(s):\n      ` + v.rows.map((r) => r.slice(0, 170)).join("\n      "));
  const triageRows = trace.triage.rows.join(" | ");
  check("Agents: Triage shows get_host_inventory and check_reachability rows", /get_host_inventory/.test(triageRows) && /check_reachability/.test(triageRows), `${trace.triage.rows.length} rows`);
  check("Agents: header does not say 'mixed' when every agent ran on the model", !/mixed/i.test(trace.sentry.header + trace.triage.header) || SCRIPTED, `header="${trace.triage.header}"`);
  await A.page.shot(join(OUT, "A-agents.png"));

  // ------------------------------------------------------------------ Policy page on A
  await A.page.eval("claura.go('policy'), true");
  await sleep(700);
  const pol = await A.page.eval(`(() => [...document.querySelectorAll('#v-policy .prow')].map((r) => r.querySelector('b').textContent + '=' + r.querySelector('.switch').getAttribute('aria-checked') + (r.querySelector('.pmode') && r.querySelector('.pmode').textContent ? ' (' + r.querySelector('.pmode').textContent + ')' : '')))()`);
  log(`Policy page: ${pol.join(" | ")}`);
  const onCount = await A.page.eval("document.querySelectorAll('#v-policy .pgroup:first-of-type .switch[aria-checked=true]').length");
  check("Policy: the 'Warden acts on its own' switches are ON (policy table says auto)", onCount >= 5, `${onCount} on`);
  await A.page.shot(join(OUT, "A-policy.png"));

  // ------------------------------------------------------------------ C: People & Access as an admin
  await C.page.eval("claura.go('access'), true");
  await sleep(700);
  const navHidden = await C.page.eval("document.querySelector('.nav-item[data-view=access]').hidden");
  check("C (admin) sees People & Access", navHidden === false);
  const aNav = await A.page.eval("document.querySelector('.nav-item[data-view=access]').hidden");
  if (A_ADMIN) {
    check("A (admin) approved the quarantine AND sees People & Access: one screen can do the whole run", aNav === false);
    log(`A as the console shows it: ${await A.page.eval("claura.data.me().role + ' / ' + claura.data.me().title")}`);
  } else check("A (commander) does not see People & Access (admin only)", aNav === true);
  await C.page.eval("claura.addPerson({ name: 'Outside counsel', role: 'legal', issue: true }), true");
  await C.page.until("!!document.querySelector('#personSheet [data-s=code], #personSheet .pc-code, #pcCode')", 15000, "code issued").catch(() => {});
  await sleep(1200);
  const issued = await C.page.eval("(() => { const e = claura.data.enrollments().find((x) => x.nameHint === 'Outside counsel' && !x.usedBy); return e ? { code: e.code, qr: !!document.querySelector('#pcQr svg') } : null; })()");
  check("C: Add person issues a single-use code, and the QR is drawn", !!issued, issued ? `qr=${issued.qr}` : "no enrollment row for 'Outside counsel'");
  if (issued) codes.push(issued.code); // voided in cleanup
  await C.page.shot(join(OUT, "C-add-person.png"));

  log(`results: ${results.filter((r) => r.ok).length}/${results.length} passed`);
  for (const r of results) if (!r.ok) log(`  FAILED: ${r.name} ${r.detail}`);
  const errs = [A, B, C].flatMap((c) => c.page.logs.filter((l) => !/favicon|Download the React DevTools|WebSocket|ERR_/.test(l)).map((l) => `${c.label}: ${l}`));
  if (errs.length) log(`console errors: ${errs.slice(0, 6).join(" | ")}`);
} catch (e) {
  console.log("PROOF ERROR:", e.stack || e.message);
  process.exitCode = 1;
} finally {
  await runCleanups();
  try {
    const tail = readFileSync(join(tmpdir(), `claura-legalproof-runner-${process.pid}.log`), "utf8").split("\n").slice(-4).join("\n");
    void tail;
  } catch {}
  finalCleanup(codes);
  if (runner) {
    try {
      process.kill(-runner.pid, "SIGTERM");
    } catch {}
  }
}
process.exit(process.exitCode ?? 0);
