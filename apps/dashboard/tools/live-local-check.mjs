// Checks live mode against the LOCAL appliance (ws://127.0.0.1:3000, db "claura") without the agent runner:
// the CLI owner plays the agents by calling the module's own reducers (open_incident, propose_action, ...), so the local
// runner's one-time code is never consumed. One console connects with ?live=1&stdb=local, enrolls with a code minted for it,
// sees the incident build up, and approves the pending quarantine with a real click. Then it cleans up (revokes its test
// operator, voids unused codes it made, reset_demo as owner).
//
//   node tools/live-local-check.mjs [--port 4317] [--out shots]
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4317");
const OUT = resolve(opt("out", "shots"));
const BACKEND = "/Users/abd/repos/claura-backend";
const S = "/Users/abd/.local/bin/spacetime";
const NAME = "Test Local Commander";
const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const sh = (cmd, a) => spawnSync(cmd, a, { encoding: "utf8", env: { ...process.env, NODE_USE_SYSTEM_CA: undefined } });
const access = (...a) => sh(`${BACKEND}/scripts/access.sh`, ["--local", ...a]);
const call = (reducer, ...a) => {
  const r = sh(S, ["call", "--server", "local", "claura", reducer, ...a.map((x) => (typeof x === "number" ? String(x) : JSON.stringify(x)))]);
  if (r.status !== 0) throw new Error(`${reducer} failed: ${(r.stderr || r.stdout).replace(/WARNING.*\n/, "").trim().slice(0, 200)}`);
};
const sql = (q) => sh(S, ["sql", "--server", "local", "claura", q]).stdout || "";
mkdirSync(OUT, { recursive: true });

let code = "";
const chrome = await launchChrome({ width: 1440, height: 900 });
let ok = true;
try {
  const r = access("code", "commander", NAME);
  code = (r.stdout || "").trim();
  if (r.status !== 0 || !/^[A-Za-z0-9_-]{12,64}$/.test(code)) throw new Error(`no code: ${(r.stderr || "").slice(0, 160)}`);
  log("issued a local commander code (never printed)");
  const page = await chrome.page(`http://127.0.0.1:${PORT}/?live=1&stdb=local`);
  await page.until("window.claura && window.claura.live && window.claura.live.applied", 20000, "local subscription applied");
  const srv = await page.eval("claura.live.server");
  log(`connected: ${JSON.stringify(srv)}`);
  if (srv.uri !== "ws://127.0.0.1:3000" || srv.label !== "local appliance") throw new Error("not the local appliance");
  const stranger = await page.eval("({ access: claura.live.access, inc: !!claura.data.incident(), ops: claura.data.operators().length, brief: !!claura.data.brief() })");
  log(`stranger on the local appliance sees: ${JSON.stringify(stranger)}`);
  await page.until("document.getElementById('joinSheet').dataset.open === '1'", 8000);
  await sleep(1100);
  await page.clickSel("#joinCode");
  await page.type(code);
  await page.clickSel("#joinBtn");
  await page.until("claura.live.access === 'enrolled' || document.getElementById('joinErr').textContent.length > 0", 20000, "enroll");
  code = "";
  const me = await page.eval("claura.data.me()");
  if (me.name !== NAME) throw new Error(`enroll failed: ${await page.eval("document.getElementById('joinErr').textContent")}`);
  log(`enrolled as "${me.name}" (${me.role})`);
  const quiet = await page.eval("({ brief: claura.data.brief() && claura.data.brief().text, stakeholders: claura.data.stakeholders().length, agents: Object.keys(claura.data.operators()).length })");
  log(`quiet room from the appliance: ${JSON.stringify(quiet)}`);
  await page.eval("claura.go('incident'), claura.popover('isolation'), true");
  await sleep(900);
  log(`isolation popover says: "${await page.eval("document.getElementById('srcLabel').textContent")}"`);
  await page.shot(join(OUT, "live-local-0-quiet.png"));
  await page.eval("claura.popover(null), true");

  // the owner plays the agents through the module's own reducers
  const T = "Local appliance check: suspected guest-to-host escape via the vGPU path";
  call("ingest_signal", "vmm", "VMM audit: unexpected ioctl 0xC0186441", "b14-gpu-07", "vm-7f3a");
  call("ingest_signal", "iommu", "IOMMU fault: DMA write outside guest range", "b14-gpu-07", "vm-7f3a");
  call("open_incident", T, "critical", "b14-gpu-07", "vm-7f3a");
  const id = parseInt((sql("SELECT id FROM incident_store").match(/\d+/g) || ["0"]).pop(), 10);
  if (!id) throw new Error("no incident id");
  call("set_agent_state", "sentry", "Escalated", `Incident #${id} opened (critical): ${T}`, "owner-driven check (no model)");
  call("record_finding", id, "triage", "blast_radius", "1 host, 11 co-resident guests, 2 exposed tokens.", 0.87);
  call("set_agent_state", "warden", "Executing", "Reversible steps first.", "owner-driven check (no model)");
  await page.until("claura.live.state().incident !== null", 15000, "console sees the incident");
  for (const [a, t] of [["isolate_network", "vm-7f3a"], ["revoke_credentials", "agent-7f3"], ["cordon_host", "b14-gpu-07"], ["pause_guest", "vm-7f3a"], ["capture_memory", "vm-7f3a"], ["failover_guests", "b14-gpu-07"]]) {
    call("propose_action", id, "warden", a, t, "local appliance check");
    await sleep(350);
  }
  call("propose_action", id, "warden", "reimage_host", "b14-gpu-07", "[RED-TEAM PROBE - owner-driven local check] expected: denied by policy");
  call("propose_action", id, "warden", "quarantine_host", "b14-gpu-07", "Local appliance check: the host showed a guest-to-host escape.");
  await page.until("claura.live.state().final && claura.live.state().final.startsWith('pending_approval')", 20000, "pending approval");
  await page.until("document.getElementById('sheet').dataset.open === '1'", 15000, "approval sheet");
  log(`steps: ${(await page.eval("claura.live.state().steps")).join(" ")}; blocked: ${JSON.stringify(await page.eval("claura.live.state().blocked"))}`);
  await sleep(900);
  await page.shot(join(OUT, "live-local-1-approval.png"));
  await page.clickSel("#approveBtn");
  await page.until("claura.live.state().incident && claura.live.state().incident.status === 'contained'", 20000, "contained");
  await sleep(3800);
  await page.shot(join(OUT, "live-local-2-contained.png"));
  const st = await page.eval("claura.live.state()");
  log(`contained on the local appliance; approver on record: ${st.final}; time to contain ${st.ttc.toFixed(1)} s`);
  const errs = page.logs.filter((l) => !/favicon|Download the React DevTools/.test(l));
  log(`console errors: ${errs.length}${errs.length ? " " + errs.slice(0, 2).join(" | ") : ""}`);
} catch (e) {
  ok = false;
  console.error("FAILED:", e.message);
} finally {
  chrome.close();
  // cleanup: the test operator, any unused code of ours, and the room
  if (code) access("void-code", code);
  for (const l of sql("SELECT identity, name, active FROM operator_store").split("\n")) {
    const c = l.split("|").map((x) => x.trim().replace(/^"|"$/g, ""));
    if (c.length >= 3 && c[1] === NAME && c[2] === "true") log(`revoked "${NAME}": ${/error/i.test(access("revoke", c[0].replace(/^0x/i, "")).stderr) ? "error" : "ok"}`);
  }
  const r = access("reset");
  const n = (t) => (sql(`SELECT COUNT(*) AS n FROM ${t}`).match(/\d+(?!.*\d)/) || ["?"])[0];
  log(`reset_demo (local, as owner): ${(r.stdout + r.stderr).replace(/\s+/g, " ").trim() || "ok"}; now incidents ${n("incident_store")}, proposals ${n("proposal_store")}`);
}
console.log(ok ? "local appliance check: PASS" : "local appliance check: FAILED");
process.exit(ok ? 0 : 1);
