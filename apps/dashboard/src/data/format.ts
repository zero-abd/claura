// Labels, colours and formatting shared by every view that reads the data layer. Pure functions, no engine state.
import type { AssetStatus, Classification, NistPhase, OperatorRole, TaskStatus, Ts } from "./types";
import { NIST_PHASES } from "./types";

// ------------------------------------------------------------------ roles
export const ROLE_LABEL: Record<OperatorRole, string> = {
  admin: "Admin",
  commander: "Incident Commander",
  legal: "Legal counsel",
  exec: "Executive",
  comms: "Comms and PR",
  vendor: "Vendor",
  responder: "Responder",
  agent: "Agent",
};
/** What each role may do. Shown on People & Access so access control is legible, not implied. */
export const ROLE_CAN: Record<OperatorRole, string> = {
  admin: "Everything: add and revoke people, approve, edit the brief and phase",
  commander: "Approve quarantine, set the phase and brief, post anywhere",
  legal: "Read the brief and scope, post, add tasks",
  exec: "Read the brief and scope, post, add tasks",
  comms: "Read the brief and scope, post, add tasks",
  vendor: "Post and update tasks in vendor channels",
  responder: "Post, update tasks and data-scope status",
  agent: "Service identity: writes findings, messages and status",
};
export const roleLabel = (r: string) => ROLE_LABEL[r as OperatorRole] ?? r;
/** Roles that may approve an agent proposal (backend: approve() requires admin or commander). */
export const canApprove = (r: OperatorRole) => r === "admin" || r === "commander";

// ------------------------------------------------------------------ data-scope statuses
export interface StatusMeta {
  label: string;
  /** short form for the summary line ("1 locked · 1 exfil suspected") */
  short: string;
  icon: string;
  /** what it means, in one line */
  gloss: string;
  /** severity rank: higher is worse (drives sort and the attention list) */
  rank: number;
}
export const STATUS: Record<AssetStatus, StatusMeta> = {
  locked_ransomware: { label: "Locked (ransomware)", short: "locked", icon: "lock", gloss: "Encrypted by ransomware. Not available to anyone.", rank: 6 },
  exfil_confirmed: { label: "Exfil confirmed", short: "exfil confirmed", icon: "outbound", gloss: "Data left the network. Confirmed by evidence.", rank: 7 },
  exfil_suspected: { label: "Exfil suspected", short: "exfil suspected", icon: "outbound", gloss: "Signs that data left. Not yet confirmed.", rank: 5 },
  accessed: { label: "Accessed", short: "accessed", icon: "eye", gloss: "Read by something that should not have. Copying not ruled out.", rank: 4 },
  intact: { label: "Intact", short: "intact", icon: "check", gloss: "No sign of access.", rank: 1 },
  restored: { label: "Restored", short: "restored", icon: "reset", gloss: "Was affected. Back in service and verified.", rank: 2 },
  evidence_preserved: { label: "Evidence preserved", short: "evidence preserved", icon: "seal", gloss: "Captured, hashed and held for the investigation.", rank: 3 },
};
export const statusLabel = (s: string) => STATUS[s as AssetStatus]?.label ?? s;
/** statuses that need a person's attention right now */
export const isAlertStatus = (s: AssetStatus) => s === "locked_ransomware" || s === "exfil_confirmed" || s === "exfil_suspected" || s === "accessed";
export const isHardAlert = (s: AssetStatus) => s === "locked_ransomware" || s === "exfil_confirmed" || s === "exfil_suspected";

export const CLASS_LABEL: Record<Classification, string> = { restricted: "Restricted", confidential: "Confidential", internal: "Internal" };

export const TASK_LABEL: Record<TaskStatus, string> = { open: "Open", doing: "In progress", done: "Done" };
export const TASK_TONE: Record<TaskStatus, string> = { open: "idle", doing: "busy", done: "done" };
export const nextTaskStatus = (s: TaskStatus): TaskStatus => (s === "open" ? "doing" : s === "doing" ? "done" : "open");

// ------------------------------------------------------------------ NIST SP 800-61 phases
export const PHASE: Record<NistPhase, { label: string; short: string; gloss: string }> = {
  detection_analysis: { label: "Detection and analysis", short: "Detect", gloss: "Confirm it is real, scope it, rate it." },
  containment: { label: "Containment", short: "Contain", gloss: "Stop it spreading. Preserve evidence." },
  eradication: { label: "Eradication", short: "Eradicate", gloss: "Remove the cause: patch, reimage, rotate." },
  recovery: { label: "Recovery", short: "Recover", gloss: "Return systems to service and watch them." },
  post_incident: { label: "Post-incident", short: "Review", gloss: "Lessons learned and control changes." },
};
export const phaseIndex = (p: NistPhase) => NIST_PHASES.indexOf(p);
export const phaseFromLabel = (label: string): NistPhase | null => {
  const l = label.trim().toLowerCase();
  return NIST_PHASES.find((p) => PHASE[p].label.toLowerCase() === l) ?? null;
};

// ------------------------------------------------------------------ time and numbers
const TZ_OFFSET_H = -6; // facility local time, "CST"
const pad = (n: number) => String(n).padStart(2, "0");
const local = (ts: Ts) => new Date(ts + TZ_OFFSET_H * 3600_000);
/** 02:14:12 */
export const fmtClock = (ts: Ts) => {
  const d = local(ts);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
/** 02:14 */
export const fmtHM = (ts: Ts) => fmtClock(ts).slice(0, 5);
/** Nov 8, 02:14 */
export const fmtDayTime = (ts: Ts) => {
  const d = local(ts);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${mon} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
/** Seconds since the incident opened: T+7.4 s */
export const fmtRel = (ts: Ts, base: Ts) => `T+${Math.max(0, (ts - base) / 1000).toFixed(1)}s`;

/** "just now", "3 min ago", "2 h ago", "yesterday", "5 days ago" */
export function ago(now: Ts, ts: Ts): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
/** "in 22 h", "in 40 min" */
export function until(now: Ts, ts: Ts): string {
  const s = Math.max(0, (ts - now) / 1000);
  if (s < 90) return "under a minute";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

/** 2418300 -> "2.4M", 184220 -> "184K", 14 -> "14" */
export function fmtCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The range of records a status could affect: unknown until analysis ends for accessed / suspected. */
export function scopeRange(status: AssetStatus, records: number): { text: string; exact: boolean } {
  const n = fmtCount(records);
  switch (status) {
    case "intact":
      return { text: `0 of ${n}`, exact: true };
    case "accessed":
    case "exfil_suspected":
      return { text: `0 to ${n}`, exact: false };
    case "exfil_confirmed":
      return { text: `${n} of ${n}`, exact: true };
    case "locked_ransomware":
      return { text: `${n} locked`, exact: true };
    case "restored":
      return { text: `${n} restored`, exact: true };
    case "evidence_preserved":
      return { text: `${n} held`, exact: true };
  }
}

// ------------------------------------------------------------------ people
export const initialsOf = (name: string) => {
  const t = name.trim();
  if (!t) return "?";
  if (/^[A-Z]{2,4}$/.test(t)) return t; // RK, CEO
  const parts = t.split(/\s+/).filter(Boolean);
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
const KNOWN_AV: Record<string, [string, string]> = {
  RK: ["#6d7cff", "#3a46c8"],
  JT: ["#38c2d6", "#1a7f96"],
  AL: ["#b873ff", "#7a38c8"],
  CEO: ["#8f9ab5", "#4a556f"],
  PR: ["#a6a2cf", "#5f5a93"],
  CV: ["#7eb5c8", "#3c7388"],
};
/** Avatar gradient: the six known people keep their colours; anyone enrolled later gets a stable one from their name. */
export function avatarGradient(initials: string): string {
  const k = KNOWN_AV[initials];
  if (k) return `linear-gradient(160deg, ${k[0]}, ${k[1]})`;
  let h = 0;
  for (const c of initials) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = 190 + (h % 150); // cool range: teal to violet, never orange or green (those mean breach and sealed)
  return `linear-gradient(160deg, hsl(${hue} 52% 62%), hsl(${hue} 48% 38%))`;
}
export const avatarStyle = (initials: string) => `background:${avatarGradient(initials)}`;
export const shortId = (hex: string) => (hex.length > 12 ? `${hex.slice(0, 4)}…${hex.slice(-4)}` : hex);
