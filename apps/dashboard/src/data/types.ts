// Models that mirror the SpacetimeDB module "claura" tables, in the camelCase the TS client generates.
//
// Rules of the mapping (so a LiveSource is a thin adapter, never a redesign):
//  - u64 columns arrive as bigint from the SDK. Here they are plain numbers (ids stay small); convert with Number().
//  - Identity columns are hex strings (identity.toHexString()).
//  - Timestamp columns are epoch milliseconds (Timestamp.microsSinceUnixEpoch / 1000).
//  - Enums are the exact strings the module stores.
// Tables that already existed (incident, incident_event, proposal, report) keep their column names; the new
// columns of `incident` are category, nistPhase, functionalImpact, informationImpact and recoverability.

export type Ts = number;

// ------------------------------------------------------------------ access control
export type OperatorRole = "admin" | "commander" | "legal" | "exec" | "comms" | "vendor" | "responder" | "agent";
/** Roles an admin can hand out with a break-glass code (agents are service identities, never enrolled by a person). */
export const ENROLLABLE_ROLES: OperatorRole[] = ["commander", "legal", "exec", "comms", "vendor", "responder", "admin"];

/** table `operator`: real identities only. */
export interface Operator {
  identity: string;
  name: string;
  role: OperatorRole;
  addedBy: string;
  addedAt: Ts;
  active: boolean;
}
/** table `enrollment`: a single-use break-glass code. usedBy === "" means it is still unused. */
export interface Enrollment {
  code: string;
  role: OperatorRole;
  nameHint: string;
  createdBy: string;
  createdAt: Ts;
  usedBy: string;
}
/** table `stakeholder`: display-only directory rows (not identities). The War Room people list reads this. */
export interface Stakeholder {
  name: string;
  /** a display title ("Incident Commander", "CISO"), not an access role */
  role: string;
  initials: string;
  verifiedOutOfBand: boolean;
}

// ------------------------------------------------------------------ war room
export type ChannelId = "#command" | "#legal" | "#exec" | "#comms-pr" | "#vendors";
export type MessageKind = "human" | "agent" | "system";
/** table `message` */
export interface Message {
  id: number;
  incidentId: number;
  channel: ChannelId;
  authorName: string;
  authorRole: string;
  kind: MessageKind;
  text: string;
  at: Ts;
  /** UI-only hint: show a "Review and approve" button while the approval is pending */
  action?: "review";
}
export type TaskStatus = "open" | "doing" | "done";
/** table `task` */
export interface Task {
  id: number;
  incidentId: number;
  title: string;
  ownerRole: string;
  status: TaskStatus;
  at: Ts;
}
/** table `decision` */
export interface Decision {
  id: number;
  incidentId: number;
  text: string;
  byName: string;
  at: Ts;
}
/** table `brief`: one row per incident. `text` is "Label: value" lines; known/unknown are newline-separated. */
export interface Brief {
  incidentId: number;
  text: string;
  known: string;
  unknown: string;
  updatedAt: Ts;
  author: string;
}

// ------------------------------------------------------------------ scope
export type Classification = "restricted" | "confidential" | "internal";
export type AssetStatus =
  | "intact"
  | "accessed"
  | "exfil_suspected"
  | "exfil_confirmed"
  | "locked_ransomware"
  | "restored"
  | "evidence_preserved";
export const ASSET_STATUSES: AssetStatus[] = [
  "locked_ransomware",
  "exfil_confirmed",
  "exfil_suspected",
  "accessed",
  "intact",
  "restored",
  "evidence_preserved",
];
/** table `data_asset` */
export interface DataAsset {
  id: number;
  incidentId: number;
  name: string;
  system: string;
  classification: Classification;
  records: number;
  status: AssetStatus;
  note: string;
  updatedBy: string;
  updatedAt: Ts;
}

// ------------------------------------------------------------------ incident documentation
export type NistPhase = "detection_analysis" | "containment" | "eradication" | "recovery" | "post_incident";
export const NIST_PHASES: NistPhase[] = ["detection_analysis", "containment", "eradication", "recovery", "post_incident"];

/** table `incident` (existing columns + the five documentation columns). */
export interface IncidentRow {
  id: number;
  title: string;
  severity: string;
  host: string;
  vm: string;
  /** open | awaiting_approval | contained */
  status: "open" | "awaiting_approval" | "contained";
  openedAt: Ts;
  containedAt: Ts | null;
  blastScore: number;
  category: string;
  nistPhase: NistPhase;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
}
/** table `incident_event` (the ship's log). Phase changes are kind "state" with text "Phase set to <label>". */
export interface IncidentEvent {
  id: number;
  incidentId: number;
  at: Ts;
  /** signal | incident | finding | action | blocked | approval_requested | approval | state | report */
  kind: string;
  actor: string;
  text: string;
}
/** table `proposal`: what an agent asked to do, and who authorized it ("policy" for auto, a name for a human). */
export interface Proposal {
  id: number;
  incidentId: number;
  agent: string;
  action: string;
  target: string;
  reason: string;
  /** executed | pending_approval | approved | blocked */
  status: string;
  /** auto | approval | deny */
  policyMode: string;
  at: Ts;
  decidedBy: string;
  /** from the `policy` table (joined by action) */
  reversible: boolean;
}
export interface CustodyStep {
  at: Ts;
  who: string;
  action: string;
}
/** Not a table in the contract yet: an evidence record with its SHA-256 and chain of custody. */
export interface EvidenceItem {
  id: number;
  name: string;
  size: string;
  sha256: string;
  source: string;
  collectedBy: string;
  collectedAt: Ts;
  custody: CustodyStep[];
}

// ------------------------------------------------------------------ session
export interface Me {
  identity: string;
  name: string;
  /** display title */
  title: string;
  role: OperatorRole;
}
export interface Presence {
  online: boolean;
  lastSeen: Ts | null;
}
export type Result = { ok: true } | { ok: false; error: string };
export const OK: Result = { ok: true };
export const fail = (error: string): Result => ({ ok: false, error });
