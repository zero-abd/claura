// The ONLY file that talks to the SpacetimeDB SDK.
//
// It imports the generated bindings from ./module_bindings (produced by
// `spacetime generate --lang typescript --out-dir src/module_bindings`). Every agent works against the plain
// `ClauraDb` interface in types.ts.
//
// IDENTITY. The module trusts nobody by default. This client connects, and if its identity is not yet an
// enrolled operator it calls `enroll(code, name)` with a one-time code an admin gave it out-of-band. The token
// of that identity is persisted (mode 0600) so the next run signs in as the same operator and the code is not
// needed again. The runner is role "agent": it can feed the incident but cannot approve, reset or add anyone.
//
// Bindings use camelCase accessors for the snake_case contract names:
//   reducer propose_action -> conn.reducers.proposeAction({ incidentId, ... })
//   view    guest_vm       -> conn.db.guestVm        (views keep the old table names)
//   column  blast_score    -> row.blastScore

import { DbConnection } from './module_bindings/index.ts';
import { eventsFor, tsToMs } from './dbCommon.ts';
import { forgetToken, readToken, tokenKey, writeToken } from './tokens.ts';
import type {
  AgentStateRow, AssetRow, BriefRow, ClauraDb, DecisionRow, EventRow, FindingRow, GuestRow, HostRow, IncidentRow,
  MessageRow, PolicyRow, ProposalRow, ReportRow, SignalRow, TaskRow, WhoAmI,
} from './types.ts';
import { errMsg, sleep } from './util.ts';

export interface DbAuth {
  /** Which identity of this runner: the agent itself, or the labelled auto-approve harness. */
  slot: 'agent' | 'approver';
  tokenFile: string;
  /** One-time enrollment code, used only if the stored identity is not (or no longer) an active operator. */
  enrollCode?: string;
  /** Display name asked for at enrollment; the admin's name_hint on the code wins. */
  displayName: string;
  /** 'all' = the full read model; 'operator' = just enough to know whether we are enrolled. */
  subscribe: 'all' | 'operator';
  /** Name of the env var holding the code, for error messages. */
  codeVar: string;
}

type Identity = { toHexString(): string; isEqual(o: Identity): boolean };

export class SpacetimeClauraDb implements ClauraDb {
  readonly kind = 'spacetimedb' as const;
  private conn: DbConnection | undefined;
  private connected = false;
  private identity: Identity | undefined;
  private approverReady: Promise<SpacetimeClauraDb> | undefined;

  constructor(
    private readonly uri: string,
    private readonly dbName: string,
    private readonly auth: DbAuth,
    /** Identity used for approve() when this one is not a commander/admin. Undefined = approve() is unavailable. */
    private readonly approverAuth?: DbAuth,
  ) {}

  // ---- connection + enrollment -------------------------------------------
  private open(token: string | undefined): Promise<{ conn: DbConnection; identity: Identity; token: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out connecting to ${this.uri} (db "${this.dbName}"). Is the server reachable and the module published?`)),
        15_000,
      );
      DbConnection.builder()
        .withUri(this.uri)
        .withDatabaseName(this.dbName)
        .withToken(token)
        .onConnect((c, identity, tok) => { clearTimeout(timer); resolve({ conn: c, identity: identity as Identity, token: tok }); })
        .onConnectError((_c, e) => { clearTimeout(timer); reject(new Error(`could not connect to ${this.uri} (db "${this.dbName}"): ${errMsg(e)}`)); })
        .onDisconnect(() => { this.connected = false; })
        .build();
    });
  }

  async connect(): Promise<void> {
    const key = tokenKey(this.uri, this.dbName, this.auth.slot);
    const stored = readToken(this.auth.tokenFile, key);
    let opened;
    try {
      opened = await this.open(stored);
    } catch (e) {
      if (!stored) throw e;
      // The stored token was refused (different server issuer, or the database was recreated elsewhere).
      forgetToken(this.auth.tokenFile, key);
      opened = await this.open(undefined);
    }
    this.conn = opened.conn;
    this.identity = opened.identity;
    this.connected = true;
    if (opened.token !== stored) writeToken(this.auth.tokenFile, key, opened.token);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for the initial subscription')), 15_000);
      const sub = opened.conn
        .subscriptionBuilder()
        .onApplied(() => { clearTimeout(timer); resolve(); })
        .onError(ctx => { clearTimeout(timer); reject(new Error(`subscription error: ${errMsg((ctx as { event?: unknown }).event)}`)); });
      if (this.auth.subscribe === 'all') sub.subscribeToAllTables();
      else sub.subscribe(['SELECT * FROM operator']);
    });

    await this.ensureEnrolled();
    this.warmApprover();
  }

  /**
   * Open the labelled approver identity in the background (only when --auto-approve-after configured one), so its
   * connect and first-time enrollment happen while the model works, not while the incident waits for approval.
   * A failure is kept and thrown by approve(), where it can be explained.
   */
  private warmApprover(): void {
    if (!this.approverAuth || this.approverReady) return;
    const a = new SpacetimeClauraDb(this.uri, this.dbName, this.approverAuth);
    this.approverReady = a.connect().then(() => a);
    this.approverReady.catch(() => undefined);
  }

  private myOperator() {
    const me = this.identity;
    if (!me || !this.conn) return undefined;
    return [...this.conn.db.operator.iter()].find(o => (o.identity as Identity).isEqual(me));
  }

  private async ensureEnrolled(): Promise<void> {
    const c = this.c();
    const hex = this.identity!.toHexString();
    // The operator row arrives with the initial subscription when we are enrolled; give it a moment anyway.
    for (let i = 0; i < 20 && !this.myOperator(); i++) await sleep(50);
    if (this.myOperator()?.active) return;

    const revoked = this.myOperator() && !this.myOperator()!.active;
    if (!this.auth.enrollCode) {
      throw new Error(
        `this identity (${hex.slice(0, 16)}…) is ${revoked ? 'REVOKED' : 'not an enrolled operator'} on ${this.uri} db "${this.dbName}". ` +
          `Ask an admin for a one-time enrollment code and set ${this.auth.codeVar}, or have an admin run add_operator with the full identity ${hex}.`,
      );
    }
    try {
      await c.reducers.enroll({ code: this.auth.enrollCode, name: this.auth.displayName });
    } catch (e) {
      throw new Error(`enrollment with ${this.auth.codeVar} failed: ${errMsg(e)} (a code works once; ask an admin for a fresh one)`);
    }
    for (let i = 0; i < 100 && !this.myOperator()?.active; i++) await sleep(50);
    if (!this.myOperator()?.active) throw new Error('enrollment was accepted but the operator row never arrived');
    // Views fill in right after the operator row; wait for the first data to land (an unseeded database stays empty).
    if (this.auth.subscribe === 'all') for (let i = 0; i < 60 && c.db.policy.count() === 0n; i++) await sleep(50);
  }

  who(): WhoAmI | null {
    const o = this.myOperator();
    if (!o || !this.identity) return null;
    return { identityHex: this.identity.toHexString(), name: o.name, role: o.role };
  }

  close(): void {
    void this.approverReady?.then(a => a.close(), () => undefined);
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
  recordToolCall(incidentId: bigint, agent: string, tool: string, args: string, result: string, model: string) {
    return this.call('record_tool_call', () => this.c().reducers.recordToolCall({ incidentId, agent, tool, args, result, model }));
  }
  recordFinding(incidentId: bigint, agent: string, kind: string, text: string, blastScore: number) {
    return this.call('record_finding', () => this.c().reducers.recordFinding({ incidentId, agent, kind, text, blastScore }));
  }
  proposeAction(incidentId: bigint, agent: string, action: string, target: string, reason: string) {
    return this.call('propose_action', () => this.c().reducers.proposeAction({ incidentId, agent, action, target, reason }));
  }
  async approve(proposalId: bigint, operator: string) {
    // The module checks the CALLER's role. If this identity can approve (admin/commander) use it; otherwise use
    // the separate, labelled approver identity (only configured for --auto-approve-after).
    const role = this.who()?.role;
    if (role === 'admin' || role === 'commander') {
      return this.call('approve', () => this.c().reducers.approve({ proposalId, operator }));
    }
    if (!this.approverAuth) {
      throw new Error(
        `this runner is role "${role ?? 'unknown'}" and cannot approve. Approval must come from a commander or admin identity ` +
          `(the dashboard). For --auto-approve-after, set CLAURA_APPROVER_CODE (see DEMO.md).`,
      );
    }
    this.warmApprover();
    const approver = await this.approverReady!;
    return approver.call('approve', () => approver.c().reducers.approve({ proposalId, operator }));
  }
  setPolicy(action: string, mode: string) {
    return this.call('set_policy', () => this.c().reducers.setPolicy({ action, mode }));
  }
  fileReport(incidentId: bigint, summary: string) {
    return this.call('file_report', () => this.c().reducers.fileReport({ incidentId, summary }));
  }
  postAgentMessage(incidentId: bigint, channel: string, agent: string, text: string) {
    return this.call('post_agent_message', () => this.c().reducers.postAgentMessage({ incidentId, channel, agent, text }));
  }
  setBrief(incidentId: bigint, text: string, known: string, unknown: string) {
    return this.call('set_brief', () => this.c().reducers.setBrief({ incidentId, text, known, unknown }));
  }
  setAssetStatus(id: bigint, status: string, note: string) {
    return this.call('set_asset_status', () => this.c().reducers.setAssetStatus({ id, status, note }));
  }
  setIncidentPhase(incidentId: bigint, phase: string) {
    return this.call('set_incident_phase', () => this.c().reducers.setIncidentPhase({ incidentId, phase }));
  }
  setIncidentClassification(incidentId: bigint, category: string, functionalImpact: string, informationImpact: string, recoverability: string) {
    return this.call('set_incident_classification', () =>
      this.c().reducers.setIncidentClassification({ incidentId, category, functionalImpact, informationImpact, recoverability }));
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
          blastScore: r.blastScore, category: r.category, nistPhase: r.nistPhase,
          functionalImpact: r.functionalImpact, informationImpact: r.informationImpact, recoverability: r.recoverability,
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
  assets(incidentId?: bigint): AssetRow[] {
    return [...this.c().db.dataAsset.iter()]
      .filter(r => incidentId === undefined || r.incidentId === incidentId)
      .map(r => ({
        id: r.id, incidentId: r.incidentId, name: r.name, system: r.system, classification: r.classification,
        records: r.records, status: r.status, note: r.note, updatedBy: r.updatedBy, updatedAtMs: tsToMs(r.updatedAt),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  tasks(incidentId?: bigint): TaskRow[] {
    return [...this.c().db.task.iter()]
      .filter(r => incidentId === undefined || r.incidentId === incidentId)
      .map(r => ({ id: r.id, incidentId: r.incidentId, title: r.title, ownerRole: r.ownerRole, status: r.status, atMs: tsToMs(r.at) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  decisions(incidentId?: bigint): DecisionRow[] {
    return [...this.c().db.decision.iter()]
      .filter(r => incidentId === undefined || r.incidentId === incidentId)
      .map(r => ({ id: r.id, incidentId: r.incidentId, text: r.text, byName: r.byName, atMs: tsToMs(r.at) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  messages(incidentId?: bigint): MessageRow[] {
    return [...this.c().db.message.iter()]
      .filter(r => incidentId === undefined || r.incidentId === incidentId)
      .map(r => ({
        id: r.id, incidentId: r.incidentId, channel: r.channel, authorName: r.authorName, authorRole: r.authorRole,
        kind: r.kind, text: r.text, atMs: tsToMs(r.at),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  briefs(): BriefRow[] {
    return [...this.c().db.brief.iter()].map(r => ({
      incidentId: r.incidentId, text: r.text, known: r.known, unknown: r.unknown, updatedAtMs: tsToMs(r.updatedAt), author: r.author,
    }));
  }
}
