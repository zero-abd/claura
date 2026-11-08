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
  approve(proposalId: bigint, operator: string): Promise<void>;
  setPolicy(action: string, mode: string): Promise<void>;
  fileReport(incidentId: bigint, summary: string): Promise<void>;

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
}
