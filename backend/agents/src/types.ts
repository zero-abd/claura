// Domain types shared by the whole runner. They are deliberately independent of
// the SpacetimeDB SDK: src/db.ts converts SDK rows (bigint ids, Timestamp
// objects, Option<T>) into these plain shapes, so agents never touch the SDK.

export type AgentName = 'sentry' | 'triage' | 'warden' | 'scribe';
export const AGENT_NAMES: readonly AgentName[] = ['sentry', 'triage', 'warden', 'scribe'];

export type PolicyMode = 'auto' | 'approval' | 'deny';

export interface HostRow {
  host: string;
  hall: string;
  rack: string;
  /** healthy | suspect | cordoned | quarantined */
  status: string;
}

export interface GuestRow {
  vm: string;
  host: string;
  workload: string;
  /** running | paused | failed_over */
  status: string;
  movedTo: string;
}

export interface SignalRow {
  id: bigint;
  /** epoch milliseconds (server timestamp) */
  atMs: number;
  source: string;
  message: string;
  host: string;
  vm: string;
}

export interface IncidentRow {
  id: bigint;
  title: string;
  severity: string;
  host: string;
  vm: string;
  /** open | awaiting_approval | contained */
  status: string;
  openedAtMs: number;
  /** null until contained (the module stores Option<Timestamp>; 0/undefined are normalised to null) */
  containedAtMs: number | null;
  /** 0.0 - 1.0 (the dashboard shows e.g. "Scored 0.87") */
  blastScore: number;
  /** NIST SP 800-61 documentation fields */
  category: string;
  /** detection_analysis | containment | eradication | recovery | post_incident */
  nistPhase: string;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
}

export interface AgentStateRow {
  agent: string;
  status: string;
  thought: string;
  model: string;
  updatedAtMs: number;
}

export interface FindingRow {
  id: bigint;
  incidentId: bigint;
  agent: string;
  kind: string;
  text: string;
  atMs: number;
}

export interface PolicyRow {
  action: string;
  mode: string;
  reversible: boolean;
  note: string;
}

export interface ProposalRow {
  id: bigint;
  incidentId: bigint;
  agent: string;
  action: string;
  target: string;
  reason: string;
  /** executed | pending_approval | approved | blocked */
  status: string;
  policyMode: string;
  atMs: number;
  decidedBy: string;
}

export interface EventRow {
  id: bigint;
  incidentId: bigint;
  atMs: number;
  /** signal|incident|finding|action|blocked|approval_requested|approval|state|report */
  kind: string;
  actor: string;
  text: string;
}

export interface ReportRow {
  incidentId: bigint;
  summary: string;
  filedAtMs: number;
}

export interface AssetRow {
  id: bigint;
  /** 0 = in the inventory, not yet adopted by an incident */
  incidentId: bigint;
  name: string;
  system: string;
  classification: string;
  records: bigint;
  /** intact | accessed | exfil_suspected | exfil_confirmed | locked_ransomware | restored | evidence_preserved */
  status: string;
  note: string;
  updatedBy: string;
  updatedAtMs: number;
}

export interface TaskRow {
  id: bigint;
  incidentId: bigint;
  title: string;
  ownerRole: string;
  /** open | doing | done */
  status: string;
  atMs: number;
}

export interface DecisionRow {
  id: bigint;
  incidentId: bigint;
  text: string;
  byName: string;
  atMs: number;
}

export interface MessageRow {
  id: bigint;
  incidentId: bigint;
  channel: string;
  authorName: string;
  authorRole: string;
  /** human | agent | system */
  kind: string;
  text: string;
  atMs: number;
}

export interface BriefRow {
  incidentId: bigint;
  text: string;
  known: string;
  unknown: string;
  updatedAtMs: number;
  author: string;
}

/** The identity this connection signed in as. */
export interface WhoAmI {
  identityHex: string;
  name: string;
  role: string;
}

/**
 * Everything the agents need from the backend. Two implementations:
 *  - SpacetimeClauraDb (src/db.ts): the real module through the official SDK.
 *  - MemClauraDb (src/memdb.ts): an in-process mirror of the contract, used by
 *    unit tests and `--mem` so the full pipeline runs with no server.
 *
 * Reducer methods resolve once the reducer has committed AND the local cache
 * reflects the result. Read methods return snapshots of the local replica.
 */
export interface ClauraDb {
  readonly kind: 'spacetimedb' | 'memory';
  connect(): Promise<void>;
  close(): void;

  resetDemo(): Promise<void>;
  ingestSignal(source: string, message: string, host: string, vm: string): Promise<void>;
  openIncident(title: string, severity: string, host: string, vm: string): Promise<void>;
  setAgentState(agent: string, status: string, thought: string, model: string): Promise<void>;
  /**
   * One tool call, for the console's Agents trace: an incident_event of kind 'tool' (not a finding, never read back into
   * a prompt: events() leaves it out). incidentId 0n = before an incident exists. Fire-and-forget callers must catch.
   */
  recordToolCall(incidentId: bigint, agent: string, tool: string, args: string, result: string, model: string): Promise<void>;
  /** blastScore < 0 leaves the incident's score unchanged */
  recordFinding(
    incidentId: bigint,
    agent: string,
    kind: string,
    text: string,
    blastScore: number,
  ): Promise<void>;
  proposeAction(
    incidentId: bigint,
    agent: string,
    action: string,
    target: string,
    reason: string,
  ): Promise<void>;
  /**
   * The module records the approver from the authenticated identity and ignores `operator`, which exists only for
   * log lines. Needs a commander or admin identity: the runner (role agent) cannot approve on its own.
   */
  approve(proposalId: bigint, operator: string): Promise<void>;
  setPolicy(action: string, mode: string): Promise<void>;
  fileReport(incidentId: bigint, summary: string): Promise<void>;
  /** Speak in a war-room channel as one of the four agents (agent role only). */
  postAgentMessage(incidentId: bigint, channel: string, agent: string, text: string): Promise<void>;
  /** The plain-language brief: text + what we know + what we do not know yet (one item per line). */
  setBrief(incidentId: bigint, text: string, known: string, unknown: string): Promise<void>;
  /** Scope: agents may say accessed / exfil_suspected / intact; confirming or restoring is human-only. */
  setAssetStatus(id: bigint, status: string, note: string): Promise<void>;
  /** NIST phase. Agents can only move forward. */
  setIncidentPhase(incidentId: bigint, phase: string): Promise<void>;
  /** '' leaves a field unchanged. */
  setIncidentClassification(
    incidentId: bigint,
    category: string,
    functionalImpact: string,
    informationImpact: string,
    recoverability: string,
  ): Promise<void>;
  /** Who this connection is signed in as (null for the in-process mirror). */
  who(): WhoAmI | null;

  hosts(): HostRow[];
  guests(): GuestRow[];
  signals(): SignalRow[];
  incidents(): IncidentRow[];
  agentStates(): AgentStateRow[];
  findings(incidentId?: bigint): FindingRow[];
  policies(): PolicyRow[];
  proposals(incidentId?: bigint): ProposalRow[];
  /** Events of one incident, oldest first. Pre-incident signal events (incident_id 0) are included. */
  events(incidentId: bigint): EventRow[];
  reports(): ReportRow[];
  assets(incidentId?: bigint): AssetRow[];
  tasks(incidentId?: bigint): TaskRow[];
  decisions(incidentId?: bigint): DecisionRow[];
  messages(incidentId?: bigint): MessageRow[];
  briefs(): BriefRow[];
}
