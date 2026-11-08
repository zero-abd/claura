// Live mode's adapter between SpacetimeDB rows and the incident UI.
//
// The scripted film is a function of a script clock (S.started, S.r, S.A). Rather than fork every view, live mode drives
// that same clock from the rows: the incident exists -> started; each containment proposal the policy gate executed moves
// the clock to where the film shows that step done; the pending quarantine holds it at the approval gate; the approval
// starts the post-approval clock. The 2D map, the 3D stage, the attack path, the approval sheet and phase() then behave as
// they always did, and the text (steps, agents, signals, blast radius, times) comes straight from the rows below.
import { APPROVAL_AT, ISOLATE_DUR, STEPS, type AgentDef } from "./script";
import { AMB_DT, AMB_PREFILL, CPS, LIVE, S, type AgentNow, type FinalState, type IncidentInfo, type LiveHooks, type StepState } from "./engine";
import { data, fmtClock, type EvidenceItem, type IncidentEvent, type IncidentRow, type Proposal } from "./data";
import type { AgentLine, LiveSource } from "./data/live";
import { fmtT } from "./util";

let src: LiveSource | null = null;
export const liveSource = (): LiveSource | null => src;

/** admin, commander, responder and agent read the response rows (proposals, the incident log, agent states, findings, hosts).
 *  legal, exec and comms read the incident row only, so for them the adapter follows incident.status instead. */
export const readsResponse = (): boolean => !!src && src.readsResponseRows();

/** What a console that cannot read proposals watched happen on the incident row: the moment the gate opened and the moment
 *  containment landed. It lets legal and exec show the same time-to-contain as the commander (a person's wait is never counted). */
const SEEN = { inc: 0, awaitingAt: 0, containedAt: 0 };
function observe() {
  const inc = src?.incident();
  if (!inc) return;
  if (SEEN.inc !== inc.id) {
    SEEN.inc = inc.id;
    SEEN.awaitingAt = 0;
    SEEN.containedAt = 0;
  }
  if (inc.status === "awaiting_approval" && !SEEN.awaitingAt) SEEN.awaitingAt = Date.now();
  if (inc.status === "contained" && SEEN.awaitingAt && !SEEN.containedAt) SEEN.containedAt = Date.now();
}

/** The six reversible steps the playbook runs, in STEPS order. quarantine_host is the seventh, behind the human gate. */
export const STEP_ACTIONS = ["isolate_network", "revoke_credentials", "cordon_host", "pause_guest", "capture_memory", "failover_guests"] as const;
const FINAL_ACTION = "quarantine_host";
const SETTLED = new Set(["executed", "approved"]);

// ------------------------------------------------------------------ a snapshot of the rows, once per version
interface Snap {
  inc: IncidentRow | null;
  props: Proposal[];
  step: (Proposal | null)[];
  final: Proposal | null;
  blocked: Proposal[];
  /** ms of the first signal (the film's T+0), else when the incident opened */
  t0: number;
  /** when a person approved, ms (null if nobody has) */
  approvedAt: number | null;
  ev: IncidentEvent[];
}
let snapV = -1;
let snapVal: Snap | null = null;
function snap(): Snap {
  const s = src;
  if (!s) throw new Error("live engine has no source");
  if (snapV === s.version() && snapVal) return snapVal;
  const inc = s.incident();
  const props = s.proposals();
  const latest = (action: string) => [...props].reverse().find((p) => p.action === action) ?? null;
  const ev = s.events();
  const firstSig = ev.find((e) => e.kind === "signal");
  const approved = [...ev].reverse().find((e) => e.kind === "approval");
  snapVal = {
    inc,
    props,
    step: STEP_ACTIONS.map(latest),
    final: latest(FINAL_ACTION),
    blocked: props.filter((p) => p.status === "blocked"),
    t0: firstSig?.at ?? inc?.openedAt ?? 0,
    approvedAt: approved?.at ?? null,
    ev,
  };
  snapV = s.version();
  return snapVal;
}
const rel = (sn: Snap, at: number) => Math.max(0, (at - sn.t0) / 1000);

// ------------------------------------------------------------------ hooks the engine calls (see engine.ts LIVE)
const settled = (p: Proposal | null) => !!p && p.status !== "pending_approval";

function stepState(i: number): StepState {
  const sn = snap();
  if (!sn.inc) return "idle";
  // no proposal rows for this role: awaiting_approval and contained both mean the six reversible steps have run
  if (!readsResponse()) return sn.inc.status === "open" ? "pending" : "done";
  if (settled(sn.step[i])) return "done"; // executed, approved or blocked: the gate has ruled
  const firstOpen = sn.step.findIndex((p) => !settled(p));
  const warden = src!.agentStates().warden?.status.toLowerCase();
  return i === firstOpen && warden === "executing" && sn.inc.status === "open" ? "running" : "pending";
}
function stepProgress(i: number): number {
  const s = stepState(i);
  if (s === "done") return 1;
  if (s !== "running") return 0;
  const sn = snap();
  const prev = sn.step.slice(0, i).reduce((t, p) => Math.max(t, p?.at ?? 0), sn.inc?.openedAt ?? 0);
  return Math.min(0.9, Math.max(0.05, (Date.now() - prev) / 7000)); // indeterminate: creeps toward done, never claims it
}
function toneOf(status: string): string {
  const s = status.toLowerCase();
  if (/^(idle|watching|standing by)/.test(s)) return "idle";
  if (/^(filed|closed)/.test(s)) return "done";
  if (/^contained/.test(s)) return "safe";
  if (/^(escalated|awaiting approval|blocked|scored)/.test(s)) return "hot";
  return "busy";
}
function agentNow(a: AgentDef): AgentNow {
  if (!readsResponse()) {
    const t = "Agent activity is shown to the response team.";
    return { text: t, full: t, typing: false, status: "Response team only", tone: "idle", stamp: "", index: 0 };
  }
  const st = src!.agentStates()[a.id];
  const idle = a.thoughts[0];
  if (!st || !st.thought.trim()) return { text: idle.text, full: idle.text, typing: false, status: idle.status, tone: idle.tone, stamp: "idle", index: 0 };
  const sn = snap();
  const el = Math.max(0, (Date.now() - st.updatedAt) / 1000);
  const n = S.animate ? Math.min(st.thought.length, Math.floor(el * CPS)) : st.thought.length;
  return {
    text: st.thought.slice(0, n),
    full: st.thought,
    typing: n < st.thought.length,
    status: st.status,
    tone: toneOf(st.status),
    stamp: sn.inc ? fmtT(rel(sn, st.updatedAt)) : fmtClock(st.updatedAt),
    index: 1,
  };
}
/** Time to contain, in seconds: first signal to contained. It holds while a person decides and never counts their time. */
function ttc(): number | null {
  const sn = snap();
  if (!sn.inc) return null;
  if (!readsResponse()) {
    // the first signal and the pending proposal are not this role's to read: count from the row's opened_at, hold at the gate,
    // and take off the wait this console watched, so Screen B shows the number Screen A shows (give or take the signal lag)
    const i = sn.inc;
    let ms = (i.containedAt ?? Date.now()) - i.openedAt;
    if (i.status === "awaiting_approval") ms = (SEEN.awaitingAt || Date.now()) - i.openedAt;
    else if (i.status === "contained" && SEEN.awaitingAt && SEEN.containedAt) ms -= SEEN.containedAt - SEEN.awaitingAt;
    return Math.max(0, ms) / 1000;
  }
  const f = sn.final;
  let ms = (sn.inc.containedAt ?? Date.now()) - sn.t0;
  if (f?.status === "pending_approval") ms = f.at - sn.t0;
  else if (f && f.policyMode === "approval" && sn.approvedAt) ms -= Math.max(0, sn.approvedAt - f.at);
  return Math.max(0, ms) / 1000;
}
/** Seconds the incident waited on a person (the part ttc() leaves out). */
export function waitedSeconds(): number {
  const sn = snap();
  const f = sn.final;
  if (!f || f.policyMode !== "approval") return 0;
  if (f.status === "pending_approval") return Math.max(0, Date.now() - f.at) / 1000;
  return sn.approvedAt ? Math.max(0, sn.approvedAt - f.at) / 1000 : 0;
}

function hostWhere(host: string): string {
  const h = src!.hostRow(host);
  if (h) return `Hall ${h.hall.toUpperCase()} · rack ${Number(h.rack)}`;
  const m = /^([a-d])(\d{2})-/.exec(host);
  return m ? `Hall ${m[1].toUpperCase()} · rack ${Number(m[2])}` : "";
}
function info(): IncidentInfo {
  const sn = snap();
  const inc = sn.inc;
  if (!inc) return { id: "", title: "", host: "", vm: "", agent: "", where: "", opened: "", resolution: { full: "", overview: "", hero: "" } };
  const guests = src!.guests();
  const moved = guests.filter((g) => g.host === inc.host && g.vm !== inc.vm && g.status === "failed_over").length;
  const captured = sn.props.some((p) => p.action === "capture_memory" && SETTLED.has(p.status));
  const t = ttc();
  const sees = readsResponse(); // legal and exec cannot read guests or proposals: say only what the incident row says
  const parts = [`Contained in ${(t ?? 0).toFixed(1)} s`, ...(sees ? [`${moved} guests failed over`] : []), ...(captured ? ["memory captured"] : [])];
  return {
    id: src!.incidentLabel(),
    title: inc.title,
    host: inc.host,
    vm: inc.vm,
    agent: guests.find((g) => g.vm === inc.vm)?.workload ?? "agent",
    where: hostWhere(inc.host),
    opened: `${fmtClock(inc.openedAt)} CST`,
    resolution: { full: parts.join(" · "), overview: parts.filter((p) => p !== "memory captured").join(" · "), hero: parts[1] ?? parts[0] },
  };
}
const HOOKS: LiveHooks = { stepState, stepProgress, agentNow, ttc, info };

// ------------------------------------------------------------------ the virtual script clock
const CLK = { lastInc: 0, lastPending: 0 };
/** Where the film's clock stands once this step has been done: the step's end. Capture stops just short of failover's start. */
const STEP_CLOCK = STEPS.map((s, i) => (i === 4 ? s.end - 0.01 : s.end));

/** Called every frame before render(). Drives S.started / S.r / S.A from the rows (S.running stays false). */
export function liveFrame(dt: number) {
  if (!src) return;
  const sn = snap();
  S.running = false;
  const snapNow = src.consumeSnap();
  if (!sn.inc) {
    if (S.started) {
      S.started = false;
      S.r = 0;
      S.A = null;
      S.ambFrozen = null;
      S.stepOv.clear();
      S.sheetDismissed = false;
    }
    CLK.lastInc = 0;
    return;
  }
  const arrived = !S.started || CLK.lastInc !== sn.inc.id; // this console is only now seeing this incident
  if (arrived) {
    if (!S.started) S.ambFrozen = AMB_PREFILL + Math.floor(S.amb / AMB_DT); // freeze the ambient fleet lines while an incident is on screen
    S.started = true;
    if (CLK.lastInc !== sn.inc.id) {
      S.r = 0;
      S.A = null;
      S.stepOv.clear();
      S.sheetDismissed = false;
      CLK.lastPending = 0;
    }
    CLK.lastInc = sn.inc.id;
  }
  // where the film's clock should be, from what the rows say has happened
  let target = 1.0; // incident open: Sentry's T+1.0
  sn.step.forEach((p, i) => {
    if (settled(p)) target = Math.max(target, STEP_CLOCK[i]);
  });
  const f = sn.final;
  if (f && (f.status === "pending_approval" || SETTLED.has(f.status))) target = Math.max(target, APPROVAL_AT);
  // incident.status is readable by every role, the proposals only by the response team: the gate and the end follow the row
  if (sn.inc.status === "awaiting_approval" || sn.inc.status === "contained") target = Math.max(target, APPROVAL_AT);
  const approved = sn.inc.status === "contained" || (!!f && SETTLED.has(f.status));
  observe();

  if (f && f.status === "pending_approval" && CLK.lastPending !== f.id) {
    CLK.lastPending = f.id;
    S.sheetDismissed = false; // a new approval request always opens the sheet
  }
  if (!approved) {
    S.A = null;
    if (snapNow || S.r > target) S.r = target;
    else S.r = Math.min(target, S.r + dt * (1 + Math.max(0, target - S.r) * 1.5)); // play at film speed, catch up when behind
    return;
  }
  if (S.A === null) {
    if (snapNow || (arrived && sn.inc.status === "contained")) {
      // opened after the fact (a reload, or a person enrolled after containment): show the end state, no animation
      S.A = APPROVAL_AT;
      S.r = sn.inc.status === "contained" ? APPROVAL_AT + ISOLATE_DUR + 1 : APPROVAL_AT;
    } else {
      S.r = Math.max(S.r, APPROVAL_AT);
      S.A = S.r;
    }
  } else S.r += dt;
}

let unwatch: (() => void) | null = null;
export function enterLive(s: LiveSource) {
  src = s;
  snapV = -1;
  unwatch?.();
  unwatch = s.watch(observe);
  LIVE.hooks = HOOKS;
  CLK.lastInc = 0;
  CLK.lastPending = 0;
}
export function leaveLive() {
  unwatch?.();
  unwatch = null;
  src = null;
  snapV = -1;
  LIVE.hooks = null;
}

// ------------------------------------------------------------------ text for the views
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export interface SigLine {
  key: string;
  t: string;
  src: string;
  msg: string;
  tone: string;
}
/** The Signals list: every signal, then the agents' and the gate's key moves, as the incident log filed them. */
export function signalLines(): SigLine[] {
  const sn = snap();
  const out: SigLine[] = [];
  for (const e of sn.ev) {
    const t = rel(sn, e.at).toFixed(2);
    const base = { key: `e${e.id}`, t };
    switch (e.kind) {
      case "signal":
        out.push({ ...base, src: e.actor, msg: e.text, tone: "hot" });
        break;
      case "incident":
        out.push({ ...base, src: "sentry", msg: clip(e.text, 170), tone: "info" });
        break;
      case "finding":
        out.push({ ...base, src: e.actor.toLowerCase(), msg: clip(e.text, 170), tone: "info" });
        break;
      case "action":
        out.push({ ...base, src: e.actor.toLowerCase(), msg: clip(e.text.split(" Reason:")[0], 170), tone: "act" });
        break;
      case "blocked":
        out.push({ ...base, src: "policy", msg: clip(e.text.split(" Reason given")[0], 170), tone: "hot" });
        break;
      case "approval_requested":
        out.push({ ...base, src: e.actor.toLowerCase(), msg: clip(e.text.split(" Reason:")[0], 170), tone: "hot" });
        break;
      case "approval":
        out.push({ ...base, src: "approval", msg: clip(e.text, 170), tone: "info" });
        break;
      case "report":
        out.push({ ...base, src: "scribe", msg: clip(e.text, 170), tone: "info" });
        break;
      case "state":
        if (/contained\.?$/i.test(e.text)) out.push({ ...base, src: "warden", msg: clip(e.text, 170), tone: "safe" });
        break;
    }
  }
  return out;
}
export const signalCount = () => snap().ev.filter((e) => e.kind === "signal").length;

export interface Blast {
  scored: boolean;
  host: string;
  guests: string;
  tokens: string;
  score: string;
  closed: boolean;
  note: string;
}
export function blast(): Blast {
  const sn = snap();
  const inc = sn.inc;
  if (!inc) return { scored: false, host: "–", guests: "–", tokens: "–", score: "–", closed: false, note: "Triage has not scored this incident yet." };
  const d = src!;
  const scored = inc.blastScore > 0 || d.findings().some((f) => f.agent === "triage");
  const co = d.guests().filter((g) => g.host === inc.host && g.vm !== inc.vm);
  const tokens = d.assets().find((a) => /workload tokens/i.test(a.name));
  const triage = [...d.findings()].reverse().find((f) => f.agent === "triage");
  const closed = inc.status === "contained";
  const moved = co.filter((g) => g.status === "failed_over").length;
  return {
    scored,
    host: scored ? "1" : "–",
    guests: scored && co.length ? String(co.length) : "–",
    tokens: scored && tokens ? String(tokens.records) : "–",
    score: scored ? inc.blastScore.toFixed(2) : "–",
    closed,
    note: !scored
      ? "Triage has not scored this incident yet."
      : closed
        ? co.length
          ? `Scope closed. ${moved} of ${co.length} co-resident guests moved to clean hosts.`
          : "Scope closed. The host is out of the pool."
        : triage
          ? clip(triage.text, 220)
          : "Triage has scored this incident.",
  };
}

const statusText = (p: Proposal) =>
  p.status === "executed"
    ? `executed by policy${p.reversible ? " · reversible" : ""}`
    : p.status === "approved"
      ? `approved by ${p.decidedBy}`
      : p.status === "pending_approval"
        ? "waiting for a human"
        : `BLOCKED by policy (${p.policyMode})`;

/** Reasoning rows for an Agents card: that agent's findings, then its current thought. */
export function trace(agentId: string): { time: string; text: string }[] {
  const sn = snap();
  const d = src!;
  const rows: { at: number; text: string }[] = d.findings().filter((f) => f.agent === agentId).map((f) => ({ at: f.at, text: f.text }));
  const st = d.agentStates()[agentId];
  if (st?.thought.trim() && rows[rows.length - 1]?.text !== st.thought) rows.push({ at: st.updatedAt, text: st.thought });
  rows.sort((a, b) => a.at - b.at);
  return rows.map((r) => ({ time: sn.inc ? fmtT(rel(sn, r.at)) : fmtClock(r.at), text: r.text }));
}
/** "fallback" or "scripted" for a call the model did not make; "" for one it did (the card's header already names the model). */
const callTag = (model: string): string => (/^scripted/i.test(model) ? "scripted" : /fallback/i.test(model) ? "fallback" : "");

/** Tool-call rows for an Agents card. The calls that write a row of their own (the incident, a finding, a proposal, the report, the
 *  brief) come from those structured tables; the rest (get_host_inventory, check_reachability, list_recent_signals, record_scope,
 *  get_policy, list_events, post_handoff) come from the runner's own log of each call (the module's record_tool_call). */
export function tools(agentId: string): { time: string; call: string; result: string; tag: string }[] {
  const sn = snap();
  const d = src!;
  const rows: { at: number; call: string; result: string; tag: string }[] = [];
  if (sn.inc && agentId === "sentry") rows.push({ at: sn.inc.openedAt, call: `open_incident(severity=${sn.inc.severity})`, result: src!.incidentLabel(), tag: "" });
  for (const f of d.findings()) if (f.agent === agentId) rows.push({ at: f.at, call: `record_finding(${f.kind})`, result: clip(f.text, 90), tag: "" });
  for (const p of sn.props) if (p.agent.toLowerCase() === agentId) rows.push({ at: p.at, call: `propose_action(${p.action}, ${p.target})`, result: statusText(p), tag: "" });
  const rep = d.report();
  if (agentId === "scribe" && rep) rows.push({ at: rep.filedAt, call: "file_report()", result: `filed · ${rep.summary.length} characters`, tag: "" });
  const b = d.brief();
  if (agentId === "scribe" && b && b.incidentId !== 0 && /scribe/i.test(b.author)) rows.push({ at: b.updatedAt, call: "set_brief()", result: "plain-language brief updated", tag: "" });
  for (const c of d.toolCalls()) if (c.agent === agentId) rows.push({ at: c.at, call: `${c.tool}(${clip(c.args, 120)})`, result: clip(c.result, 200), tag: callTag(c.model) });
  rows.sort((a, b2) => a.at - b2.at);
  return rows.map((r) => ({ time: sn.inc ? fmtT(rel(sn, r.at)) : fmtClock(r.at), call: r.call, result: r.result, tag: r.tag }));
}
/** The policy table's own words for an action ("Cut network for the suspect guest. Undo by restoring the security group."). */
export const policyNote = (action: string): string => src?.policies().find((p) => p.action === action)?.note ?? "";

/** The model behind the agents, as the rows say it (the runner writes it on every status update).
 *  An agent that is idle, or that only shows Scribe's interim template text, has not run without the model: it does not count
 *  as fallback. "mixed" needs an agent that has acted on something other than Nemotron, so the line can be spoken as it reads. */
export function modelLabel(): string {
  if (!readsResponse()) return "response team only";
  const rows = Object.values(src!.agentStates()).filter((a) => a.model);
  if (!rows.length) return "waiting for the agent runner";
  const onModel = (a: AgentLine) => /^nemotron/i.test(a.model);
  const interim = (a: AgentLine) => /^template text/i.test(a.model) || /^(idle|watching|standing by)/i.test(a.status);
  const tag = (a: AgentLine) => `${a.model.split(/\s+/)[0]} · on-prem`; // "nemotron-3-nano:4b (local, on-prem)" -> "nemotron-3-nano:4b · on-prem"
  const acted = rows.filter((a) => !interim(a));
  if (!acted.length) {
    const m = rows.find(onModel);
    return m ? tag(m) : rows[0].model;
  }
  const off = acted.filter((a) => !onModel(a));
  if (!off.length) return tag(acted[0]);
  if (off.length < acted.length) return "mixed: some agents on fallback";
  return off.every((a) => a.model === off[0].model) ? off[0].model : "fallback: no model";
}

// ------------------------------------------------------------------ the containment card and the approval sheet
export function stepRight(i: number, s: StepState): string {
  if (!readsResponse()) return "";
  const sn = snap();
  const p = sn.step[i];
  return s === "done" ? (p ? (p.status === "blocked" ? "Blocked" : fmtT(rel(sn, p.at))) : "") : s === "running" ? "Running" : s === "pending" ? "Queued" : "";
}
export function finalRight(fs: FinalState): string {
  return fs === "request" ? "Needs approval" : fs === "approved" ? "Running" : fs === "done" ? fmtT(ttc() ?? 0) : fs === "pending" ? "Queued" : "";
}
export function approvedLine(): string {
  const sn = snap();
  const f = sn.final;
  if (!f) return "";
  if (f.decidedBy && f.decidedBy !== "policy") {
    const t = sn.approvedAt ? ` · ${fmtClock(sn.approvedAt)} CST` : "";
    return `Approved by ${f.decidedBy}${t}`;
  }
  return "Allowed by policy, no approval needed";
}
export function finalScope(): string {
  const sn = snap();
  const inc = sn.inc;
  if (!inc) return "";
  const moved = src!.guests().filter((g) => g.host === inc.host && g.vm !== inc.vm && g.status === "failed_over").length;
  return moved ? `1 host · ${moved} guests failed over` : "1 host";
}
export function blockedProposals(): Proposal[] {
  return snap().blocked;
}
/** The pending (or latest) quarantine, in the words the approval sheet shows. */
export function sheetInfo(): { host: string; reason: string; scope: string; rollback: string; evidence: string; files: { name: string; meta: string }[]; busy: boolean } | null {
  const sn = snap();
  const p = sn.final;
  if (!p) return null;
  const sigs = sn.ev.filter((e) => e.kind === "signal");
  const sources = [...new Set(sigs.map((e) => e.actor))];
  const files: EvidenceItem[] = src!.evidence();
  return {
    host: p.target,
    reason: p.reason,
    scope: finalScope(),
    rollback: p.reversible ? "Reversible by an operator" : "Not undone automatically. A person returns the host to the pool",
    evidence: sigs.length ? `${sigs.length} correlated signals: ${sources.join(", ")}. Policy ruled: ${p.policyMode}.` : `Policy ruled: ${p.policyMode}.`,
    files: files.map((e) => ({ name: e.name, meta: `${e.size} · sha256 ${e.sha256.slice(0, 4)}…${e.sha256.slice(-4)}` })),
    busy: src!.approvingId() !== 0,
  };
}

/** Test and recorder aid: what the adapter thinks, in one object (window.claura.live.state()). */
export function debugState() {
  const sn = snap();
  return {
    incident: sn.inc ? { id: sn.inc.id, status: sn.inc.status, phase: sn.inc.nistPhase, host: sn.inc.host } : null,
    steps: STEP_ACTIONS.map((a, i) => `${a}:${stepState(i)}`),
    final: sn.final ? `${sn.final.status}${sn.final.decidedBy ? `(${sn.final.decidedBy})` : ""}` : null,
    blocked: sn.blocked.map((p) => `${p.action}@${p.target}`),
    clock: { started: S.started, r: Number(S.r.toFixed(2)), A: S.A === null ? null : Number(S.A.toFixed(2)) },
    ttc: ttc(),
    version: src?.version(),
    data: data().kind,
  };
}
