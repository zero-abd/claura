// In-process mirror of the shared contract (tables + reducers + policy gate).
// Used by unit tests and `--mem` so the entire pipeline can run with no server.
// It is NOT the production module; it exists to keep the runner testable and to
// document, in executable form, the semantics the runner relies on.

import { eventsFor } from './dbCommon.ts';
import type {
  AgentStateRow, AssetRow, BriefRow, ClauraDb, DecisionRow, EventRow, FindingRow, GuestRow, HostRow, IncidentRow,
  MessageRow, PolicyRow, ProposalRow, ReportRow, SignalRow, TaskRow, WhoAmI,
} from './types.ts';

const PHASES = ['detection_analysis', 'containment', 'eradication', 'recovery', 'post_incident'];
const CHANNELS = ['#command', '#legal', '#exec', '#comms-pr', '#vendors'];
const HUMAN_ONLY = ['exfil_confirmed', 'restored'];

/** [name, system, classification, records, status, note]: the scope inventory, same as the module's seed. */
const ASSET_SEED: Array<[string, string, string, bigint, string, string]> = [
  ['Tenant model weights', 'vm-7f3a (tenant agent-7f3)', 'restricted', 3n, 'intact', 'Fine-tuned model checkpoint (3 shards) held by the compromised guest.'],
  ['Guest memory image', 'vm-7f3a, 64 GiB', 'restricted', 1n, 'intact', 'Live guest memory. Not captured yet.'],
  ['Workload tokens', 'agent-7f3, 2 tokens', 'restricted', 2n, 'intact', 'Two workload tokens issued to agent-7f3.'],
  ['Management plane credentials', 'BMC / IPMI 10.0.0.1:623 (mgmt VLAN 40)', 'restricted', 2n, 'intact', 'BMC admin and IPMI user. Not yet probed.'],
  ['Co-resident tenant volumes', 'b14-gpu-07 (11 co-resident tenants)', 'confidential', 11n, 'intact', '11 tenant volumes share the suspect host.'],
  ['Corporate file share FIN-02', 'corporate IT, finance file server', 'confidential', 18400n, 'locked_ransomware', 'Parallel ransomware detonation on corporate IT, tracked in this war room.'],
  ['Customer billing DB', 'corporate IT, billing replica', 'restricted', 412000n, 'accessed', 'Investigating: unusual reads on the billing replica. No exfiltration confirmed.'],
];

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
  private asset = new Map<bigint, AssetRow>();
  private task: TaskRow[] = [];
  private decision: DecisionRow[] = [];
  private message: MessageRow[] = [];
  private brief = new Map<bigint, BriefRow>();
  private seq = { signal: 1n, incident: 1n, finding: 1n, proposal: 1n, event: 1n, asset: 1n, task: 1n, decision: 1n, message: 1n };

  async connect() {}
  close() {}
  who(): WhoAmI | null { return null; }

  private now() { return Date.now(); }
  private log(incidentId: bigint, kind: string, actor: string, text: string) {
    this.event.push({ id: this.seq.event++, incidentId, atMs: this.now(), kind, actor, text });
  }

  async resetDemo() {
    this.host.clear(); this.guest.clear(); this.signal = []; this.incident.clear();
    this.agentState.clear(); this.finding = []; this.policy.clear(); this.proposal.clear();
    this.event = []; this.report.clear();
    this.asset.clear(); this.task = []; this.decision = []; this.message = []; this.brief.clear();
    this.seq = { signal: 1n, incident: 1n, finding: 1n, proposal: 1n, event: 1n, asset: 1n, task: 1n, decision: 1n, message: 1n };
    for (const [name, system, classification, records, status, note] of ASSET_SEED) {
      const id = this.seq.asset++;
      this.asset.set(id, { id, incidentId: 0n, name, system, classification, records, status, note, updatedBy: 'seed', updatedAtMs: this.now() });
    }
    this.say(0n, '#command', 'scribe', 'system', 'Break-glass channel is quiet. 6 of 6 identities verified.');
    this.brief.set(0n, { incidentId: 0n, text: 'Nothing to report. All systems are normal.', known: 'No incident is open', unknown: 'Nothing is open right now', updatedAtMs: this.now(), author: 'scribe' });
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
      category: 'Unclassified (pending triage)', nistPhase: 'detection_analysis',
      functionalImpact: 'Not yet assessed', informationImpact: 'Not yet assessed', recoverability: 'Not yet assessed',
    });
    const h = this.host.get(host);
    if (h) h.status = 'suspect';
    this.log(id, 'incident', 'sentry', `Incident opened (${severity}): ${title}`);
    for (const [ttl, owner] of [['Assess notification obligations', 'legal'], ['Prepare a holding statement', 'comms'], ['Confirm the vGPU hypervisor patch', 'vendor']] as const) {
      this.task.push({ id: this.seq.task++, incidentId: id, title: ttl, ownerRole: owner, status: 'open', atMs: this.now() });
    }
    for (const [text, by] of [['Internal email and chat are treated as visible to the attacker.', 'standing order'], ['Reversible containment may run without a human. Quarantine needs a commander.', 'guest-escape playbook (policy)']] as const) {
      this.decision.push({ id: this.seq.decision++, incidentId: id, text, byName: by, atMs: this.now() });
    }
    for (const a of this.asset.values()) if (a.incidentId === 0n) a.incidentId = id;
    this.brief.set(id, { incidentId: id, text: 'An incident was just opened. Scribe is preparing the first plain-language brief.', known: `An incident was opened on one server, ${host}`, unknown: 'How far it went', updatedAtMs: this.now(), author: 'system' });
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
      const detail = this.applyEffect(inc, action, target);
      this.log(incidentId, 'action', agent, `${action} -> ${target}: ${detail}. Reason: ${reason}`);
      // like the module: quarantine_host under policy mode auto still contains the incident
      if (action === 'quarantine_host') this.contain(inc, detail);
    } else if (status === 'pending_approval') {
      inc.status = 'awaiting_approval';
      this.task.push({ id: this.seq.task++, incidentId, title: `Approve ${action === 'quarantine_host' ? 'quarantine' : action} of ${target}`, ownerRole: 'commander', status: 'open', atMs: this.now() });
      this.log(incidentId, 'approval_requested', agent, `${action} -> ${target} needs human approval. Reason: ${reason}`);
    } else {
      this.log(incidentId, 'blocked', agent, `${action} -> ${target} BLOCKED by policy (${pol ? 'deny' : 'unknown action'}). Reason: ${reason}`);
    }
  }

  private touch(incidentId: bigint, prefix: string, needle: string, status: string | null, note: string) {
    for (const a of this.asset.values()) {
      if (a.incidentId !== incidentId || !a.name.startsWith(prefix)) continue;
      if (needle && !a.system.includes(needle)) continue;
      a.status = status ?? a.status; a.note = note; a.updatedBy = 'policy gate'; a.updatedAtMs = this.now();
    }
  }

  private applyEffect(inc: IncidentRow, action: string, target: string): string {
    if (action === 'capture_memory') this.touch(inc.id, 'Guest memory image', target, 'evidence_preserved', 'Captured read-only and stored off the network.');
    if (action === 'revoke_credentials') this.touch(inc.id, 'Workload tokens', target, null, 'Revoked by the policy gate; they cannot be replayed.');
    if (action === 'pause_guest') this.touch(inc.id, 'Tenant model weights', target, 'evidence_preserved', 'Guest paused: weights frozen in place.');
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
      if (n > 0) this.touch(inc.id, 'Co-resident tenant volumes', inc.host, null, `${n} tenants failed over to clean hosts.`);
      return `${n} co-resident guests failed over to hall C`;
    }
    if (action === 'quarantine_host') {
      const h = this.host.get(target);
      if (h) h.status = 'quarantined';
      return `host ${target} quarantined`;
    }
    return `${action} applied to ${target}`;
  }

  /** Quarantine contains the incident whoever authorised it; an already-contained incident keeps its contained time. */
  private contain(inc: IncidentRow, detail: string) {
    if (inc.status !== 'contained') { inc.status = 'contained'; inc.containedAtMs = this.now(); }
    this.log(inc.id, 'state', 'system', `${detail}. Incident #${inc.id} contained.`);
  }

  async approve(proposalId: bigint, operator: string) {
    const p = this.proposal.get(proposalId);
    if (!p) throw new Error(`unknown proposal ${proposalId}`);
    if (p.status !== 'pending_approval') throw new Error(`proposal ${proposalId} is ${p.status}`);
    p.status = 'approved';
    p.decidedBy = operator;
    this.log(p.incidentId, 'approval', operator, `${operator} approved ${p.action} -> ${p.target}`);
    this.decision.push({ id: this.seq.decision++, incidentId: p.incidentId, text: `${p.action === 'quarantine_host' ? 'Quarantine' : p.action} ${p.target} approved by ${operator}`, byName: operator, atMs: this.now() });
    for (const tk of this.task) if (tk.incidentId === p.incidentId && tk.title.startsWith('Approve ') && tk.title.endsWith(` of ${p.target}`)) tk.status = 'done';
    if (p.action === 'quarantine_host') {
      const inc = this.incident.get(p.incidentId);
      const detail = this.applyEffect(inc!, p.action, p.target);
      if (inc) this.contain(inc, detail);
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

  private say(incidentId: bigint, channel: string, authorName: string, kind: string, text: string) {
    this.message.push({ id: this.seq.message++, incidentId, channel, authorName, authorRole: 'agent', kind, text, atMs: this.now() });
  }

  async postAgentMessage(incidentId: bigint, channel: string, agent: string, text: string) {
    if (!CHANNELS.includes(channel)) throw new Error(`unknown channel ${channel}`);
    if (!['sentry', 'triage', 'warden', 'scribe'].includes(agent)) throw new Error(`unknown agent ${agent}`);
    this.say(incidentId, channel, agent, 'agent', text);
  }

  async setBrief(incidentId: bigint, text: string, known: string, unknown: string) {
    this.brief.set(incidentId, { incidentId, text, known, unknown, updatedAtMs: this.now(), author: 'scribe' });
    this.log(incidentId, 'state', 'scribe', 'Brief updated by scribe.');
  }

  async setAssetStatus(id: bigint, status: string, note: string) {
    const a = this.asset.get(id);
    if (!a) throw new Error(`data asset ${id} not found`);
    if (HUMAN_ONLY.includes(status)) throw new Error(`agents cannot set '${status}': a human must confirm it`);
    a.status = status; a.note = note || a.note; a.updatedBy = 'mem-agent'; a.updatedAtMs = this.now();
    this.log(a.incidentId, 'state', 'mem-agent', `Scope: ${a.name} -> ${status}`);
  }

  async setIncidentPhase(incidentId: bigint, phase: string) {
    const inc = this.incident.get(incidentId);
    if (!inc) throw new Error(`incident ${incidentId} not found`);
    if (!PHASES.includes(phase)) throw new Error(`phase must be one of ${PHASES.join(', ')}`);
    if (PHASES.indexOf(phase) < PHASES.indexOf(inc.nistPhase)) throw new Error('agents can only move the phase forward');
    inc.nistPhase = phase;
    this.log(incidentId, 'state', 'mem-agent', `NIST SP 800-61 phase -> ${phase}`);
  }

  async setIncidentClassification(incidentId: bigint, category: string, functionalImpact: string, informationImpact: string, recoverability: string) {
    const inc = this.incident.get(incidentId);
    if (!inc) throw new Error(`incident ${incidentId} not found`);
    if (category) inc.category = category;
    if (functionalImpact) inc.functionalImpact = functionalImpact;
    if (informationImpact) inc.informationImpact = informationImpact;
    if (recoverability) inc.recoverability = recoverability;
    this.log(incidentId, 'state', 'mem-agent', 'Classification updated.');
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
  assets(incidentId?: bigint) { return [...this.asset.values()].filter(a => incidentId === undefined || a.incidentId === incidentId).map(x => ({ ...x })); }
  tasks(incidentId?: bigint) { return this.task.filter(a => incidentId === undefined || a.incidentId === incidentId).map(x => ({ ...x })); }
  decisions(incidentId?: bigint) { return this.decision.filter(a => incidentId === undefined || a.incidentId === incidentId).map(x => ({ ...x })); }
  messages(incidentId?: bigint) { return this.message.filter(a => incidentId === undefined || a.incidentId === incidentId).map(x => ({ ...x })); }
  briefs() { return [...this.brief.values()].map(x => ({ ...x })); }
}
