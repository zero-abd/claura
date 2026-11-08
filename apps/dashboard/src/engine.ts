// Deterministic incident engine state + pure helpers. No DOM in here.
// Script timings live in script.ts and are untouched by the UI rewrite.
import {
  AGENTS,
  AMBIENT_TEMPLATES,
  APPROVAL_AT,
  CANON_APPROVE,
  CONTAINED_AT,
  ISOLATE_DUR,
  STEPS,
  type AgentDef,
} from "./script";
import { hash } from "./util";

export type Phase = "nominal" | "breach" | "approval" | "isolating" | "contained" | "report";
export type View = "overview" | "incident" | "warroom" | "scope" | "shells" | "agents" | "policy" | "reports" | "access";
export const VIEWS: View[] = ["overview", "incident", "warroom", "scope", "shells", "agents", "policy", "reports", "access"];
/** Floating panels that are not sheets: the "Isolated · out-of-band" popover. */
export type Popover = "isolation";

export const S = {
  started: false,
  running: false,
  r: 0, // script seconds since play()
  A: null as number | null, // script time of approval
  autoApprove: null as number | null,
  amb: 0, // ambient seconds (never touches the wall clock)
  ambFrozen: null as number | null,
  animate: true,
  // UI state that the engine's pure helpers need
  view: "overview" as View,
  prevView: null as View | null,
  open: new Map<string, boolean>(), // disclosure state by key
  stepOv: new Map<number, boolean>(), // manual override for step:N (auto = current step)
  sheetDismissed: false,
  hostSheet: null as string | null, // host id while the Host sheet is open
  shellNote: false, // "Secure shell module not loaded" note is showing
  micOn: false,
  demo: false,
  popover: null as Popover | null,
};

export const CPS = 66; // typewriter characters per second
export const AMB_DT = 0.9;
export const AMB_PREFILL = 16;
export const REPORT_KEY = "report:INC-0419";

export const U = () => (S.A === null ? -1e9 : S.r - S.A);

export function since(e: { t?: number; u?: number }): number {
  if (!S.started) return e.t !== undefined && e.t < 0 ? 1e9 : -1e9;
  if (e.t !== undefined) return S.r - e.t;
  if (S.A === null) return -1e9;
  return S.r - S.A - (e.u ?? 0);
}
export const at = (e: { t?: number; u?: number }) => (e.t !== undefined ? e.t : (S.A ?? CANON_APPROVE) + (e.u ?? 0));

export function phase(): Phase {
  if (!S.started) return "nominal";
  if (S.A === null) return S.r < APPROVAL_AT ? "breach" : "approval";
  if (U() < ISOLATE_DUR) return "isolating";
  return S.view === "reports" && S.open.get(REPORT_KEY) ? "report" : "contained";
}

/** Visual tone of the whole app: drives wallpaper tint and accents. */
export type Tone = "nominal" | "breach" | "contained";
export function tone(ph: Phase = phase()): Tone {
  return ph === "nominal" ? "nominal" : ph === "contained" || ph === "report" ? "contained" : "breach";
}

export function ttc(): number | null {
  if (!S.started) return null;
  if (S.A === null) return Math.min(S.r, CANON_APPROVE);
  const cA = Math.min(S.A, CANON_APPROVE);
  const u = U();
  if (u >= ISOLATE_DUR) return CONTAINED_AT;
  return cA + ((CONTAINED_AT - cA) * Math.max(0, u)) / ISOLATE_DUR;
}

// ------------------------------------------------------------------ steps
export type StepState = "idle" | "pending" | "running" | "done";
export function stepState(i: number): StepState {
  const st = STEPS[i];
  if (!S.started) return "idle";
  if (S.r < st.start) return "pending";
  if (S.r < st.end) return "running";
  return "done";
}
export const stepProgress = (i: number) => {
  const s = stepState(i);
  return s === "done" ? 1 : s === "running" ? (S.r - STEPS[i].start) / (STEPS[i].end - STEPS[i].start) : 0;
};
export type FinalState = "idle" | "pending" | "request" | "approved" | "done";
export function finalState(): FinalState {
  if (!S.started) return "idle";
  if (S.r < APPROVAL_AT) return "pending";
  if (S.A === null) return "request";
  if (U() < ISOLATE_DUR) return "approved";
  return "done";
}
export const stepsDone = () => STEPS.reduce((n, _s, i) => n + (stepState(i) === "done" ? 1 : 0), 0) + (finalState() === "done" ? 1 : 0);

// ------------------------------------------------------------------ disclosures
function autoOpen(key: string): boolean {
  const m = /^step:(\d+)$/.exec(key);
  if (!m) return false;
  const n = +m[1];
  if (n >= 1 && n <= STEPS.length) return stepState(n - 1) === "running";
  if (n === STEPS.length + 1) {
    const f = finalState();
    return f === "request" || f === "approved" || f === "done";
  }
  return false;
}
export function isOpen(key: string): boolean {
  const m = /^step:(\d+)$/.exec(key);
  if (m) {
    const ov = S.stepOv.get(+m[1]);
    return ov !== undefined ? ov : autoOpen(key);
  }
  return S.open.get(key) ?? false;
}
export function setOpen(key: string, open: boolean) {
  const m = /^step:(\d+)$/.exec(key);
  if (m) S.stepOv.set(+m[1], open);
  else S.open.set(key, open);
}

// ------------------------------------------------------------------ agents
export interface AgentNow {
  text: string; // typed so far
  full: string;
  typing: boolean;
  status: string;
  tone: string; // idle | busy | hot | safe | done
  stamp: string;
  index: number; // index of the current thought
}
export function agentNow(a: AgentDef): AgentNow {
  let cur = a.thoughts[0];
  let idx = 0;
  let el = 1e9;
  a.thoughts.forEach((th, i) => {
    const s = since(th);
    if (s >= 0) {
      cur = th;
      idx = i;
      el = s;
    }
  });
  const full = cur.text;
  const n = cur.quiet || !S.animate ? full.length : Math.min(full.length, Math.floor(el * CPS));
  const prev = a.thoughts[idx - 1] ?? cur;
  const stampT = !S.started || (cur.t !== undefined && cur.t < 0) ? null : at(cur.quiet ? prev : cur);
  return {
    text: full.slice(0, n),
    full,
    typing: n < full.length,
    status: cur.status,
    tone: cur.tone,
    stamp: stampT === null ? "idle" : `T+${stampT.toFixed(1)}s`,
    index: idx,
  };
}
export const agentById = (id: string) => AGENTS.find((a) => a.id === id)!;

// ------------------------------------------------------------------ ambient signal lines
export function ambientLine(k: number) {
  const host = `${"abcd"[k % 4]}${String(1 + Math.floor(hash(k, 3) * 32)).padStart(2, "0")}-gpu-${String(1 + Math.floor(hash(k, 5) * 16)).padStart(2, "0")}`;
  const tpl = AMBIENT_TEMPLATES[Math.floor(hash(k, 1) * AMBIENT_TEMPLATES.length)];
  return { src: "fleet", msg: tpl(host, k + 3) };
}
