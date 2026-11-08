// The ONLY file that talks to the SpacetimeDB SDK.
//
// It imports the generated bindings from ./module_bindings (produced by
// `spacetime generate --lang typescript --out-dir src/module_bindings`). If the
// real module's generated bindings differ from the contract (renamed reducer,
// different column type), this is the single file to adjust: every agent works
// against the plain `ClauraDb` interface in types.ts.
//
// Bindings use camelCase accessors for the snake_case contract names:
//   reducer propose_action -> conn.reducers.proposeAction({ incidentId, ... })
//   table   guest_vm       -> conn.db.guestVm
//   column  blast_score    -> row.blastScore

import { DbConnection } from './module_bindings/index.ts';
import { eventsFor, tsToMs } from './dbCommon.ts';
import type {
  AgentStateRow, ClauraDb, EventRow, FindingRow, GuestRow, HostRow, IncidentRow,
  PolicyRow, ProposalRow, ReportRow, SignalRow,
} from './types.ts';
import { errMsg } from './util.ts';

export class SpacetimeClauraDb implements ClauraDb {
  readonly kind = 'spacetimedb' as const;
  private conn: DbConnection | undefined;
  private connected = false;

  constructor(
    private readonly uri: string,
    private readonly dbName: string,
  ) {}

  async connect(): Promise<void> {
    const conn = await new Promise<DbConnection>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out connecting to ${this.uri} (db "${this.dbName}"). Is "spacetime start" running and is the module published?`)),
        10_000,
      );
      DbConnection.builder()
        .withUri(this.uri)
        .withDatabaseName(this.dbName)
        .onConnect(c => { clearTimeout(timer); resolve(c); })
        .onConnectError((_c, e) => { clearTimeout(timer); reject(new Error(`could not connect to ${this.uri} (db "${this.dbName}"): ${errMsg(e)}. Is "spacetime start" running and is the module published under that name?`)); })
        .onDisconnect(() => { this.connected = false; })
        .build();
    });
    this.conn = conn;
    this.connected = true;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for the initial subscription')), 10_000);
      conn
        .subscriptionBuilder()
        .onApplied(() => { clearTimeout(timer); resolve(); })
        .onError(ctx => { clearTimeout(timer); reject(new Error(`subscription error: ${errMsg((ctx as { event?: unknown }).event)}`)); })
        .subscribeToAllTables();
    });
  }

  close(): void {
    this.conn?.disconnect();
    this.connected = false;
  }

  private c(): DbConnection {
    if (!this.conn || !this.connected) throw new Error('SpacetimeDB connection is not open');
    return this.conn;
  }

  private async call(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      throw new Error(`reducer ${name} failed: ${errMsg(e)}`);
    }
  }

  // ---- reducers -----------------------------------------------------------
  resetDemo() { return this.call('reset_demo', () => this.c().reducers.resetDemo({})); }
  ingestSignal(source: string, message: string, host: string, vm: string) {
    return this.call('ingest_signal', () => this.c().reducers.ingestSignal({ source, message, host, vm }));
  }
  openIncident(title: string, severity: string, host: string, vm: string) {
    return this.call('open_incident', () => this.c().reducers.openIncident({ title, severity, host, vm }));
  }
  setAgentState(agent: string, status: string, thought: string, model: string) {
    return this.call('set_agent_state', () => this.c().reducers.setAgentState({ agent, status, thought, model }));
  }
  recordFinding(incidentId: bigint, agent: string, kind: string, text: string, blastScore: number) {
    return this.call('record_finding', () => this.c().reducers.recordFinding({ incidentId, agent, kind, text, blastScore }));
  }
  proposeAction(incidentId: bigint, agent: string, action: string, target: string, reason: string) {
    return this.call('propose_action', () => this.c().reducers.proposeAction({ incidentId, agent, action, target, reason }));
  }
  approve(proposalId: bigint, operator: string) {
    return this.call('approve', () => this.c().reducers.approve({ proposalId, operator }));
  }
  setPolicy(action: string, mode: string) {
    return this.call('set_policy', () => this.c().reducers.setPolicy({ action, mode }));
  }
  fileReport(incidentId: bigint, summary: string) {
    return this.call('file_report', () => this.c().reducers.fileReport({ incidentId, summary }));
  }

  // ---- reads (local replica) ---------------------------------------------
  hosts(): HostRow[] {
    return [...this.c().db.host.iter()].map(r => ({ host: r.host, hall: r.hall, rack: r.rack, status: r.status }));
  }
  guests(): GuestRow[] {
    return [...this.c().db.guestVm.iter()].map(r => ({
      vm: r.vm, host: r.host, workload: r.workload, status: r.status, movedTo: r.movedTo,
    }));
  }
  signals(): SignalRow[] {
    return [...this.c().db.signal.iter()]
      .map(r => ({ id: r.id, atMs: tsToMs(r.at), source: r.source, message: r.message, host: r.host, vm: r.vm }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  incidents(): IncidentRow[] {
    return [...this.c().db.incident.iter()]
      .map(r => {
        const contained = tsToMs(r.containedAt); // Option<Timestamp>; a 0 sentinel also maps to null
        return {
          id: r.id, title: r.title, severity: r.severity, host: r.host, vm: r.vm, status: r.status,
          openedAtMs: tsToMs(r.openedAt), containedAtMs: contained > 0 ? contained : null,
          blastScore: r.blastScore,
        };
      })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  agentStates(): AgentStateRow[] {
    return [...this.c().db.agentState.iter()].map(r => ({
      agent: r.agent, status: r.status, thought: r.thought, model: r.model, updatedAtMs: tsToMs(r.updatedAt),
    }));
  }
  findings(incidentId?: bigint): FindingRow[] {
    return [...this.c().db.finding.iter()]
      .filter(r => incidentId === undefined || r.incidentId === incidentId)
      .map(r => ({ id: r.id, incidentId: r.incidentId, agent: r.agent, kind: r.kind, text: r.text, atMs: tsToMs(r.at) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  policies(): PolicyRow[] {
    return [...this.c().db.policy.iter()].map(r => ({ action: r.action, mode: r.mode, reversible: r.reversible, note: r.note }));
  }
  proposals(incidentId?: bigint): ProposalRow[] {
    return [...this.c().db.proposal.iter()]
      .filter(r => incidentId === undefined || r.incidentId === incidentId)
      .map(r => ({
        id: r.id, incidentId: r.incidentId, agent: r.agent, action: r.action, target: r.target,
        reason: r.reason, status: r.status, policyMode: r.policyMode, atMs: tsToMs(r.at), decidedBy: r.decidedBy,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  events(incidentId: bigint): EventRow[] {
    const all = [...this.c().db.incidentEvent.iter()].map(r => ({
      id: r.id, incidentId: r.incidentId, atMs: tsToMs(r.at), kind: r.kind, actor: r.actor, text: r.text,
    }));
    return eventsFor(all, incidentId);
  }
  reports(): ReportRow[] {
    return [...this.c().db.report.iter()].map(r => ({ incidentId: r.incidentId, summary: r.summary, filedAtMs: tsToMs(r.filedAt) }));
  }
}
