// In-process mirror of the shared contract (tables + reducers + policy gate).
// Used by unit tests and `--mem` so the entire pipeline can run with no server.
// It is NOT the production module; it exists to keep the runner testable and to
// document, in executable form, the semantics the runner relies on.

import { eventsFor } from './dbCommon.ts';
import type {
  AgentStateRow, ClauraDb, EventRow, FindingRow, GuestRow, HostRow, IncidentRow,
  PolicyRow, ProposalRow, ReportRow, SignalRow,
} from './types.ts';

const POLICIES: PolicyRow[] = [
  { action: 'isolate_network', mode: 'auto', reversible: true, note: 'Detach vNIC / drop flows.' },
  { action: 'revoke_credentials', mode: 'auto', reversible: true, note: 'Revoke workload tokens (re-issuable).' },
  { action: 'cordon_host', mode: 'auto', reversible: true, note: 'No new placements.' },
  { action: 'pause_guest', mode: 'auto', reversible: true, note: 'Freeze vCPUs (resumable).' },
  { action: 'capture_memory', mode: 'auto', reversible: true, note: 'Read-only forensic capture.' },
  { action: 'failover_guests', mode: 'auto', reversible: true, note: 'Move co-resident guests to clean hosts.' },
  { action: 'quarantine_host', mode: 'approval', reversible: false, note: 'High impact: removes the host from the pool.' },
  { action: 'reimage_host', mode: 'deny', reversible: false, note: 'Destroys forensic evidence.' },
  { action: 'power_off_hall', mode: 'deny', reversible: false, note: 'Catastrophic blast radius.' },
  { action: 'delete_vm', mode: 'deny', reversible: false, note: 'Irreversible data loss.' },
];

const HOSTS: Array<[string, string, string]> = [
  ['a03-gpu-01', 'A', '03'], ['a09-gpu-03', 'A', '09'],
  ['b02-gpu-01', 'B', '02'], ['b08-gpu-05', 'B', '08'], ['b14-gpu-07', 'B', '14'],
  ['c05-gpu-02', 'C', '05'], ['c12-gpu-04', 'C', '12'],
  ['d01-gpu-06', 'D', '01'], ['d10-gpu-02', 'D', '10'],
];

const GUESTS: Array<[string, string]> = [
  ['vm-7f3a', 'agent-7f3 (code-exec sandbox)'],
  ['vm-1c02', 'llm-inference tenant-41'], ['vm-2d77', 'rag-indexer tenant-12'],
  ['vm-3e90', 'agent-9a1 (browser sandbox)'], ['vm-4b13', 'finetune-job tenant-07'],
  ['vm-5a68', 'embedding-svc tenant-33'], ['vm-6c4d', 'agent-2b8 (code-exec sandbox)'],
  ['vm-81ef', 'llm-inference tenant-19'], ['vm-92a0', 'vector-db tenant-22'],
  ['vm-a3b5', 'agent-5c4 (code-exec sandbox)'], ['vm-b4c6', 'batch-eval tenant-03'],
  ['vm-c5d7', 'llm-inference tenant-58'],
];

export class MemClauraDb implements ClauraDb {
  readonly kind = 'memory' as const;
  private host = new Map<string, HostRow>();
  private guest = new Map<string, GuestRow>();
  private signal: SignalRow[] = [];
  private incident = new Map<bigint, IncidentRow>();
  private agentState = new Map<string, AgentStateRow>();
  private finding: FindingRow[] = [];
  private policy = new Map<string, PolicyRow>();
  private proposal = new Map<bigint, ProposalRow>();
  private event: EventRow[] = [];
  private report = new Map<bigint, ReportRow>();
  private seq = { signal: 1n, incident: 1n, finding: 1n, proposal: 1n, event: 1n };

  async connect() {}
  close() {}

  private now() { return Date.now(); }
  private log(incidentId: bigint, kind: string, actor: string, text: string) {
    this.event.push({ id: this.seq.event++, incidentId, atMs: this.now(), kind, actor, text });
  }

  async resetDemo() {
    this.host.clear(); this.guest.clear(); this.signal = []; this.incident.clear();
    this.agentState.clear(); this.finding = []; this.policy.clear(); this.proposal.clear();
    this.event = []; this.report.clear();
    this.seq = { signal: 1n, incident: 1n, finding: 1n, proposal: 1n, event: 1n };
    for (const [host, hall, rack] of HOSTS) this.host.set(host, { host, hall, rack, status: 'healthy' });
    for (const [vm, workload] of GUESTS) this.guest.set(vm, { vm, host: 'b14-gpu-07', workload, status: 'running', movedTo: '' });
    for (const agent of ['sentry', 'triage', 'warden', 'scribe'])
      this.agentState.set(agent, { agent, status: 'idle', thought: 'Standing by.', model: '', updatedAtMs: this.now() });
    for (const p of POLICIES) this.policy.set(p.action, { ...p });
  }

  async ingestSignal(source: string, message: string, host: string, vm: string) {
    this.signal.push({ id: this.seq.signal++, atMs: this.now(), source, message, host, vm });
    const open = [...this.incident.values()].sort((a, b) => (a.id < b.id ? 1 : -1))[0];
    this.log(open ? open.id : 0n, 'signal', source, message);
  }

  async openIncident(title: string, severity: string, host: string, vm: string) {
    const id = this.seq.incident++;
    this.incident.set(id, {
      id, title, severity, host, vm, status: 'open', openedAtMs: this.now(), containedAtMs: null, blastScore: 0,
    });
    const h = this.host.get(host);
    if (h) h.status = 'suspect';
    this.log(id, 'incident', 'sentry', `Incident opened (${severity}): ${title}`);
  }

  async setAgentState(agent: string, status: string, thought: string, model: string) {
    this.agentState.set(agent, { agent, status, thought, model, updatedAtMs: this.now() });
  }

  async recordFinding(incidentId: bigint, agent: string, kind: string, text: string, blastScore: number) {
    this.finding.push({ id: this.seq.finding++, incidentId, agent, kind, text, atMs: this.now() });
    const inc = this.incident.get(incidentId);
    if (inc && blastScore >= 0) inc.blastScore = blastScore;
    this.log(incidentId, 'finding', agent, `${kind}: ${text}`);
  }

  async proposeAction(incidentId: bigint, agent: string, action: string, target: string, reason: string) {
    const inc = this.incident.get(incidentId);
    if (!inc) throw new Error(`unknown incident ${incidentId}`);
    action = action.trim().toLowerCase();
    target = target.trim();
    const pol = this.policy.get(action);
    const mode = pol ? pol.mode : 'deny'; // unknown actions => deny (fail closed)
    // like the module: hallucinated hosts/vms must not silently "succeed"
    const hostLevel = ['cordon_host', 'quarantine_host', 'failover_guests'].includes(action);
    const badTarget = mode !== 'deny' && (hostLevel ? !this.host.has(target) : action === 'pause_guest' && !this.guest.has(target));
    const status = mode === 'deny' || badTarget ? 'blocked' : mode === 'auto' ? 'executed' : 'pending_approval';
    this.proposal.set(this.seq.proposal, {
      id: this.seq.proposal++, incidentId, agent, action, target, reason, status, policyMode: mode,
      atMs: this.now(), decidedBy: status === 'pending_approval' ? '' : 'policy',
    });
    if (badTarget) {
      this.log(incidentId, 'blocked', agent, `BLOCKED ${action} on ${target}: unknown host or vm`);
    } else if (status === 'executed') {
      this.log(incidentId, 'action', agent, `${action} -> ${target}: ${this.applyEffect(inc, action, target)}. Reason: ${reason}`);
    } else if (status === 'pending_approval') {
      inc.status = 'awaiting_approval';
      this.log(incidentId, 'approval_requested', agent, `${action} -> ${target} needs human approval. Reason: ${reason}`);
    } else {
      this.log(incidentId, 'blocked', agent, `${action} -> ${target} BLOCKED by policy (${pol ? 'deny' : 'unknown action'}). Reason: ${reason}`);
    }
  }

  private applyEffect(inc: IncidentRow, action: string, target: string): string {
    if (action === 'cordon_host') {
      const h = this.host.get(target);
      if (h) h.status = 'cordoned';
      return `host ${target} cordoned`;
    }
    if (action === 'pause_guest') {
      const g = this.guest.get(target);
      if (g) g.status = 'paused';
      return `guest ${target} paused`;
    }
    if (action === 'failover_guests') {
      const clean = [...this.host.values()].filter(h => h.hall === 'C' && h.status === 'healthy');
      let n = 0;
      for (const g of this.guest.values()) {
        if (g.host !== inc.host || g.vm === inc.vm || g.status === 'failed_over') continue;
        const dest = clean[n % Math.max(clean.length, 1)];
        if (!dest) break;
        g.status = 'failed_over';
        g.movedTo = dest.host;
        n++;
      }
      return `${n} co-resident guests failed over to hall C`;
    }
    return `${action} applied to ${target}`;
  }

  async approve(proposalId: bigint, operator: string) {
    const p = this.proposal.get(proposalId);
    if (!p) throw new Error(`unknown proposal ${proposalId}`);
    if (p.status !== 'pending_approval') throw new Error(`proposal ${proposalId} is ${p.status}`);
    p.status = 'approved';
    p.decidedBy = operator;
    this.log(p.incidentId, 'approval', operator, `${operator} approved ${p.action} -> ${p.target}`);
    if (p.action === 'quarantine_host') {
      const h = this.host.get(p.target);
      if (h) h.status = 'quarantined';
      const inc = this.incident.get(p.incidentId);
      if (inc) { inc.status = 'contained'; inc.containedAtMs = this.now(); }
      this.log(p.incidentId, 'state', 'warden', `Host ${p.target} quarantined. Incident contained.`);
    }
  }

  async setPolicy(action: string, mode: string) {
    if (!['auto', 'approval', 'deny'].includes(mode)) throw new Error(`bad mode ${mode}`);
    const row = this.policy.get(action);
    if (row) row.mode = mode;
    else this.policy.set(action, { action, mode, reversible: false, note: '' });
  }

  async fileReport(incidentId: bigint, summary: string) {
    this.report.set(incidentId, { incidentId, summary, filedAtMs: this.now() });
    this.log(incidentId, 'report', 'scribe', 'Report filed.');
  }

  // Reads return copies so callers cannot mutate the "database" by accident.
  hosts() { return [...this.host.values()].map(x => ({ ...x })); }
  guests() { return [...this.guest.values()].map(x => ({ ...x })); }
  signals() { return this.signal.map(x => ({ ...x })); }
  incidents() { return [...this.incident.values()].map(x => ({ ...x })); }
  agentStates() { return [...this.agentState.values()].map(x => ({ ...x })); }
  findings(incidentId?: bigint) { return this.finding.filter(f => incidentId === undefined || f.incidentId === incidentId).map(x => ({ ...x })); }
  policies() { return [...this.policy.values()].map(x => ({ ...x })); }
  proposals(incidentId?: bigint) {
    return [...this.proposal.values()].filter(p => incidentId === undefined || p.incidentId === incidentId).map(x => ({ ...x }));
  }
  events(incidentId: bigint) { return eventsFor(this.event.map(x => ({ ...x })), incidentId); }
  reports() { return [...this.report.values()].map(x => ({ ...x })); }
}
