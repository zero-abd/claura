/*
 * Shared helpers: roles and the access matrix, input cleaning, audit logging,
 * the simulated effect of containment actions, and the demo seed data.
 * Nothing here is registered with SpacetimeDB (no reducer or view lives in this file).
 */
import { SenderError, type Infer } from 'spacetimedb/server';
import { Identity } from 'spacetimedb';
import {
  type Ctx,
  dataAssetTable,
  hostTable,
  incidentTable,
  operatorTable,
  proposalTable,
} from './schema';

export type IncidentRow = Infer<typeof incidentTable.rowType>;
export type HostRow = Infer<typeof hostTable.rowType>;
export type OperatorRow = Infer<typeof operatorTable.rowType>;
export type AssetRow = Infer<typeof dataAssetTable.rowType>;
export type ProposalRow = Infer<typeof proposalTable.rowType>;

// ---------------------------------------------------------------------------
// Roles and the access matrix
// ---------------------------------------------------------------------------

export const ROLES = ['admin', 'commander', 'legal', 'exec', 'comms', 'vendor', 'responder', 'agent'] as const;
export const AGENTS = ['sentry', 'triage', 'warden', 'scribe'] as const;
/** The technical core of the response: sees everything. */
export const CORE: readonly string[] = ['admin', 'commander', 'responder', 'agent'];
/** Everyone inside the company. Vendors (outside parties) are deliberately not in this list. */
export const INTERNAL: readonly string[] = [...CORE, 'legal', 'exec', 'comms'];
/** May change forensic scope (data_asset). */
export const SCOPE_WRITERS: readonly string[] = ['admin', 'commander', 'responder', 'agent', 'legal'];

export const CHANNELS = ['#command', '#legal', '#exec', '#comms-pr', '#vendors'] as const;
/** Who can read a channel. #command is the shared bridge (read-only for legal/exec/comms). */
export const READ_CHANNEL: Record<string, readonly string[]> = {
  '#command': INTERNAL,
  '#legal': ['admin', 'commander', 'legal', 'agent'],
  '#exec': ['admin', 'commander', 'exec', 'agent'],
  '#comms-pr': ['admin', 'commander', 'comms', 'legal', 'agent'],
  '#vendors': ['admin', 'commander', 'responder', 'vendor', 'agent'],
};
/** Who can post in a channel. A role that cannot read a channel cannot write to it either. */
export const POST_CHANNEL: Record<string, readonly string[]> = {
  ...READ_CHANNEL,
  '#command': CORE,
};

export const PHASES = ['detection_analysis', 'containment', 'eradication', 'recovery', 'post_incident'] as const;
const PHASE_RANK: Record<string, number> = Object.fromEntries(PHASES.map((p, i) => [p, i]));
export const ASSET_STATUSES = [
  'intact', 'accessed', 'exfil_suspected', 'exfil_confirmed', 'locked_ransomware', 'restored', 'evidence_preserved',
] as const;
/** An agent may suspect; only a human may confirm exfiltration or declare something restored. */
export const HUMAN_ONLY_ASSET_STATUSES: readonly string[] = ['exfil_confirmed', 'restored'];
export const CLASSIFICATIONS = ['restricted', 'confidential', 'internal'] as const;
export const TASK_STATUSES = ['open', 'doing', 'done'] as const;
export const POLICY_MODES = ['auto', 'approval', 'deny'] as const;
/** Host status ladder; auto actions may only move a host UP this ladder. */
export const HOST_RANK: Record<string, number> = { healthy: 0, suspect: 1, cordoned: 2, quarantined: 3 };

export const phaseRank = (p: string): number => PHASE_RANK[p] ?? -1;
export const isIn = (list: readonly string[], v: string): boolean => list.includes(v);

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** The caller as an active operator, or a rejection. Role-checked when `roles` is given. */
export function requireOperator(ctx: Ctx, roles?: readonly string[]): OperatorRow {
  const op = ctx.db.operatorStore.identity.find(ctx.sender);
  if (!op || !op.active) throw new SenderError('not an enrolled operator');
  if (roles && !roles.includes(op.role)) {
    throw new SenderError(`role '${op.role}' is not allowed to do this (needs ${roles.join(' or ')})`);
  }
  return op;
}

export function parseIdentity(hex: string): Identity {
  const s = hex.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(s)) {
    throw new SenderError('identity must be 64 hex characters, as shown on the sign-in screen');
  }
  return Identity.fromString(s);
}

export const shortId = (id: Identity): string => id.toHexString().slice(0, 8);

// ---------------------------------------------------------------------------
// Input cleaning
// ---------------------------------------------------------------------------

/** A display name: NFKC-normalised, control/format/bidi characters removed, 2..max chars. */
export function cleanName(raw: string, what: string, max = 64): string {
  const s = raw
    .normalize('NFKC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 2) throw new SenderError(`${what} must be at least 2 characters`);
  if (s.length > max) throw new SenderError(`${what} must be at most ${max} characters`);
  return s;
}

/** Free text: control characters removed (newline and tab kept), trimmed, 1..max chars. */
export function cleanText(raw: string, what: string, max: number, allowEmpty = false): string {
  const s = raw.replace(/[\p{Cc}\p{Cf}]/gu, c => (c === '\n' || c === '\t' ? c : '')).trim();
  if (!allowEmpty && s.length === 0) throw new SenderError(`${what} is required`);
  if (s.length > max) throw new SenderError(`${what} is too long (${s.length} characters, maximum ${max})`);
  return s;
}

export const norm = (s: string): string => s.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Audit log + system lines
// ---------------------------------------------------------------------------

export function logEvent(ctx: Ctx, incident_id: bigint, kind: string, actor: string, text: string): void {
  ctx.db.incidentEventStore.insert({ id: 0n, incident_id, at: ctx.timestamp, kind, actor, text });
}

/** A quiet system line in a channel (kind 'system', spoken by the recorder, Scribe). */
export function sysMessage(ctx: Ctx, incident_id: bigint, channel: string, text: string): void {
  ctx.db.messageStore.insert({
    id: 0n,
    incident_id,
    channel,
    author_name: 'scribe',
    author_role: 'agent',
    kind: 'system',
    text,
    at: ctx.timestamp,
  });
}

// ---------------------------------------------------------------------------
// Incident helpers
// ---------------------------------------------------------------------------

export function findHost(ctx: Ctx, name: string): HostRow | null {
  const n = name.trim();
  return ctx.db.hostStore.host.find(n) ?? ctx.db.hostStore.host.find(n.toLowerCase());
}

export function findGuest(ctx: Ctx, name: string) {
  const n = name.trim();
  return ctx.db.guestVmStore.vm.find(n) ?? ctx.db.guestVmStore.vm.find(n.toLowerCase());
}

/** Highest-id incident that is not yet contained, optionally matching host/vm. */
export function latestActiveIncident(ctx: Ctx, host?: string, vm?: string): IncidentRow | null {
  let best: IncidentRow | null = null;
  for (const inc of ctx.db.incidentStore.iter()) {
    if (inc.status === 'contained') continue;
    if (host !== undefined || vm !== undefined) {
      const hostMatch = !!host && inc.host === host;
      const vmMatch = !!vm && inc.vm === vm;
      if (!hostMatch && !vmMatch) continue;
    }
    if (best === null || inc.id > best.id) best = inc;
  }
  return best;
}

export function requireIncident(ctx: Ctx, id: bigint): IncidentRow {
  const inc = ctx.db.incidentStore.id.find(id);
  if (!inc) throw new SenderError(`incident ${id} not found`);
  return inc;
}

/** 0 = the standing room; anything else must be a real incident. */
export function requireIncidentOrRoom(ctx: Ctx, id: bigint): void {
  if (id !== 0n) requireIncident(ctx, id);
}

/** If the model leaves `target` empty, fall back to the incident's own subject. */
export function defaultTarget(action: string, inc: IncidentRow): string {
  switch (action) {
    case 'cordon_host':
    case 'quarantine_host':
    case 'failover_guests':
    case 'reimage_host':
    case 'power_off_hall':
      return inc.host;
    default:
      return inc.vm || inc.host;
  }
}

/** Returns an error string if the target of a state-changing action is unusable. */
export function checkTarget(ctx: Ctx, action: string, target: string): string | null {
  switch (action) {
    case 'cordon_host':
    case 'quarantine_host':
    case 'failover_guests':
      return findHost(ctx, target) ? null : `unknown host '${target}'`;
    case 'pause_guest':
      return findGuest(ctx, target) ? null : `unknown guest vm '${target}'`;
    default:
      return null; // event-only actions accept any free-text target
  }
}

/** Candidate failover destinations: healthy hall C hosts, else any healthy host in another hall. */
function failoverDestinations(ctx: Ctx, source: HostRow): HostRow[] {
  const healthy = [...ctx.db.hostStore.iter()].filter(h => h.status === 'healthy' && h.host !== source.host);
  const hallC = healthy.filter(h => h.hall.toUpperCase() === 'C');
  if (hallC.length > 0) return hallC;
  return healthy.filter(h => h.hall !== source.hall);
}

const ACTION_VERB: Record<string, string> = {
  quarantine_host: 'Quarantine',
  reimage_host: 'Reimage',
  cordon_host: 'Cordon',
  pause_guest: 'Pause',
  failover_guests: 'Failover',
  isolate_network: 'Network isolation',
  revoke_credentials: 'Credential revocation',
  capture_memory: 'Memory capture',
  power_off_hall: 'Power-off',
  delete_vm: 'Deletion',
};
export function actionVerb(action: string): string {
  return ACTION_VERB[action] ?? action.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Update every matching data asset of an incident. `status` null leaves the status as is. */
function touchAssets(
  ctx: Ctx,
  incidentId: bigint,
  namePrefix: string,
  needle: string,
  status: string | null,
  note: string
): void {
  for (const a of [...ctx.db.dataAssetStore.iter()]) {
    if (a.incident_id !== incidentId || !a.name.startsWith(namePrefix)) continue;
    if (needle && !a.system.toLowerCase().includes(needle.toLowerCase())) continue;
    ctx.db.dataAssetStore.id.update({
      ...a,
      status: status ?? a.status,
      note,
      updated_by: 'policy gate',
      updated_at: ctx.timestamp,
    });
  }
}

/**
 * The actual effect of an action. Shared by the auto path (propose_action) and the
 * human-approved path (approve). Target must already be validated. Besides the host/guest
 * state it moves the matching data assets (scope) so the war room's scope board stays true.
 * Returns a human-readable description of what happened.
 */
export function applyEffect(ctx: Ctx, inc: IncidentRow, action: string, target: string): string {
  switch (action) {
    case 'isolate_network':
      touchAssets(ctx, inc.id, 'Management plane credentials', '', null,
        `Guest network cut by the policy gate; the path from ${target} to the BMC is closed. No successful BMC login seen.`);
      return `network isolated for ${target}`;
    case 'revoke_credentials':
      touchAssets(ctx, inc.id, 'Workload tokens', target, null,
        'Revoked by the policy gate; they cannot be replayed. Exfiltration stays suspected until a human rules it out.');
      return `credentials revoked for ${target}`;
    case 'capture_memory':
      touchAssets(ctx, inc.id, 'Guest memory image', target, 'evidence_preserved',
        `Captured read-only from ${target} (64 GiB) and stored off the network. Not altered since capture.`);
      return `memory image captured from ${target}`;
    case 'cordon_host': {
      const h = findHost(ctx, target)!;
      if ((HOST_RANK[h.status] ?? 0) < HOST_RANK.cordoned) {
        ctx.db.hostStore.host.update({ ...h, status: 'cordoned' });
        return `host ${h.host} cordoned (no new workloads scheduled)`;
      }
      return `host ${h.host} already ${h.status}; left as is`;
    }
    case 'pause_guest': {
      const g = findGuest(ctx, target)!;
      if (g.status === 'failed_over') return `guest ${g.vm} already failed over; left as is`;
      ctx.db.guestVmStore.vm.update({ ...g, status: 'paused' });
      touchAssets(ctx, inc.id, 'Tenant model weights', g.vm, 'evidence_preserved',
        `Guest ${g.vm} is paused: the weights are frozen in place and cannot be changed or copied out.`);
      return `guest ${g.vm} paused`;
    }
    case 'failover_guests': {
      const src = findHost(ctx, target)!;
      const dests = failoverDestinations(ctx, src);
      if (dests.length === 0) throw new SenderError('no clean destination host available for failover');
      // Co-resident = everything on the host except the suspect VM itself.
      const movers = [...ctx.db.guestVmStore.host.filter(src.host)].filter(
        g => g.vm !== inc.vm && g.status === 'running'
      );
      movers.sort((a, b) => (a.vm < b.vm ? -1 : a.vm > b.vm ? 1 : 0));
      const perDest = new Map<string, number>();
      movers.forEach((g, i) => {
        const dest = dests[i % dests.length].host;
        ctx.db.guestVmStore.vm.update({ ...g, status: 'failed_over', moved_to: dest });
        perDest.set(dest, (perDest.get(dest) ?? 0) + 1);
      });
      const split = [...perDest.entries()].map(([d, n]) => `${n} to ${d}`).join(', ');
      const detail =
        movers.length === 0
          ? `no running co-resident guests left on ${src.host}`
          : `${movers.length} co-resident guests failed over from ${src.host} (${split})`;
      if (movers.length > 0) {
        touchAssets(ctx, inc.id, 'Co-resident tenant volumes', src.host, null,
          `${movers.length} tenants failed over to clean hosts (${split}). No sign of tampering.`);
      }
      return detail;
    }
    case 'quarantine_host': {
      const h = findHost(ctx, target)!;
      ctx.db.hostStore.host.update({ ...h, status: 'quarantined' });
      return `host ${h.host} quarantined`;
    }
    default:
      // Reachable only if an operator set a non-built-in action to auto/approval:
      // there is no modelled effect, so only the audit trail records it.
      return `${action} recorded for ${target} (no modelled effect)`;
  }
}

/**
 * Quarantining the suspect host is what contains an incident, whoever authorised it:
 * a human through `approve`, or the policy table itself when an operator set quarantine_host
 * to `auto`. Idempotent: an already-contained incident keeps its original contained_at.
 */
export function containIncident(ctx: Ctx, inc: IncidentRow, detail: string): void {
  if (inc.status !== 'contained') {
    ctx.db.incidentStore.id.update({ ...inc, status: 'contained', contained_at: ctx.timestamp });
  }
  logEvent(ctx, inc.id, 'state', 'system', `${detail}. Incident #${inc.id} contained.`);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

export function seedPolicy(ctx: Ctx): void {
  const rows: Array<[string, string, boolean, string]> = [
    ['isolate_network', 'auto', true, 'Cut network for the suspect guest. Undo by restoring the security group.'],
    ['revoke_credentials', 'auto', true, 'Revoke tokens and keys the suspect guest holds. Re-issue to undo.'],
    ['cordon_host', 'auto', true, 'Stop scheduling new workloads on the host. Uncordon to undo.'],
    ['pause_guest', 'auto', true, 'Freeze the suspect guest. Resume to undo.'],
    ['capture_memory', 'auto', false, 'Non-destructive forensic memory capture (nothing to undo).'],
    ['failover_guests', 'auto', false, 'Move co-resident guests off the host to clean hall C hosts.'],
    ['quarantine_host', 'approval', false, 'High impact: removes the host from the fleet. A human must approve.'],
    ['reimage_host', 'deny', false, 'Destroys forensic evidence. Never allowed for agents.'],
    ['power_off_hall', 'deny', false, 'Blast radius is the whole hall. Never allowed for agents.'],
    ['delete_vm', 'deny', false, 'Irreversible data loss. Never allowed for agents.'],
  ];
  for (const [action, mode, reversible, note] of rows) {
    ctx.db.policyStore.insert({ action, mode, reversible, note });
  }
}

export function seedFleet(ctx: Ctx): void {
  // [host, hall, rack]
  const hosts: Array<[string, string, string]> = [
    ['a02-gpu-01', 'A', '02'],
    ['a07-gpu-03', 'A', '07'],
    ['a11-gpu-05', 'A', '11'],
    ['b03-gpu-02', 'B', '03'],
    ['b09-gpu-04', 'B', '09'],
    ['b14-gpu-07', 'B', '14'],
    ['b14-gpu-08', 'B', '14'],
    ['b21-gpu-11', 'B', '21'],
    ['c05-gpu-02', 'C', '05'], // clean failover target
    ['c12-gpu-04', 'C', '12'], // clean failover target
    ['d01-gpu-01', 'D', '01'],
    ['d06-gpu-03', 'D', '06'],
    ['d11-gpu-09', 'D', '11'],
  ];
  for (const [host, hall, rack] of hosts) {
    ctx.db.hostStore.insert({ host, hall, rack, status: 'healthy' });
  }

  // 12 guests on b14-gpu-07: the suspect agent VM plus 11 co-resident tenants.
  const guests: Array<[string, string]> = [
    ['vm-7f3a', 'agent-7f3'], // the compromised agent workload
    ['vm-2b91', 'llm-inference-prod'],
    ['vm-4c0e', 'embedding-service'],
    ['vm-5d17', 'rag-retriever'],
    ['vm-6a42', 'finetune-llama-batch'],
    ['vm-8e03', 'vision-batch'],
    ['vm-91bc', 'recsys-ranker'],
    ['vm-a3d5', 'speech-asr'],
    ['vm-b7f8', 'eval-harness'],
    ['vm-c14a', 'vector-index-build'],
    ['vm-d62e', 'tenant-sandbox-21'],
    ['vm-e9a0', 'kv-cache-warm'],
  ];
  for (const [vm, workload] of guests) {
    ctx.db.guestVmStore.insert({ vm, host: 'b14-gpu-07', workload, status: 'running', moved_to: '' });
  }
}

export function seedAgents(ctx: Ctx): void {
  for (const agent of AGENTS) {
    ctx.db.agentStateStore.insert({
      agent,
      status: 'idle',
      thought: '',
      model: 'nemotron-3-nano:4b',
      updated_at: ctx.timestamp,
    });
  }
}

/** The people the war room expects. Display-only: these rows are not identities. */
export function seedStakeholders(ctx: Ctx): number {
  // [name, role, initials, title]
  const rows: Array<[string, string, string, string]> = [
    ['Riya Kapoor', 'commander', 'RK', 'Incident Commander'],
    ['Jordan Tate', 'legal', 'JT', 'Legal counsel'],
    ['Alex Lindgren', 'admin', 'AL', 'CISO'],
    ['Evelyn Hart', 'exec', 'CEO', 'CEO'],
    ['Priya Nair', 'comms', 'PR', 'PR lead'],
    ['Mateo Silva', 'vendor', 'CV', 'Cloud vendor'],
  ];
  for (const [name, role, initials, title] of rows) {
    ctx.db.stakeholderStore.insert({ name, role, initials, title, verified_out_of_band: true });
  }
  return rows.length;
}

/**
 * The data estate this scenario puts at risk. Inserted unassigned (incident_id 0) by the seed and
 * adopted by open_incident. The statuses below are the START; the policy gate and the agents move
 * them (see applyEffect): weights and memory image end evidence_preserved, the tokens end
 * exfil_suspected + revoked, the tenant volumes stay intact + failed over. FIN-02 and the billing DB
 * belong to a parallel ransomware detonation on corporate IT that the same war room tracks.
 */
export function seedDataAssets(ctx: Ctx): void {
  // [name, system, classification, records, status, note]
  const rows: Array<[string, string, string, bigint, string, string]> = [
    ['Tenant model weights', 'vm-7f3a (tenant agent-7f3)', 'restricted', 3n, 'intact',
      'Fine-tuned model checkpoint (3 shards) held by the compromised guest.'],
    ['Guest memory image', 'vm-7f3a, 64 GiB', 'restricted', 1n, 'intact',
      'Live guest memory. Not captured yet.'],
    ['Workload tokens', 'agent-7f3, 2 tokens', 'restricted', 2n, 'intact',
      'Two workload tokens issued to agent-7f3.'],
    ['Management plane credentials', 'BMC / IPMI 10.0.0.1:623 (mgmt VLAN 40)', 'restricted', 2n, 'intact',
      'BMC admin and IPMI user. Not yet probed.'],
    ['Co-resident tenant volumes', 'b14-gpu-07 (11 co-resident tenants)', 'confidential', 11n, 'intact',
      '11 tenant volumes share the suspect host.'],
    ['Corporate file share FIN-02', 'corporate IT, finance file server', 'confidential', 18400n, 'locked_ransomware',
      'Parallel ransomware detonation on corporate IT, tracked in this war room. Not linked to the vGPU path unless a responder proves it.'],
    ['Customer billing DB', 'corporate IT, billing replica', 'restricted', 412000n, 'accessed',
      'Investigating: unusual reads on the billing replica. No exfiltration confirmed.'],
  ];
  for (const [name, system, classification, records, status, note] of rows) {
    ctx.db.dataAssetStore.insert({
      id: 0n, incident_id: 0n, name, system, classification, records, status, note,
      updated_by: 'seed', updated_at: ctx.timestamp,
    });
  }
}

const CHANNEL_INTRO: Record<string, string> = {
  '#legal': 'Counsel can see the live brief here. Nothing is open.',
  '#exec': 'Executives get short, plain-language updates here.',
  '#comms-pr': 'Nothing to publish. A holding statement template is ready.',
  '#vendors': 'Vendor contacts are verified out-of-band.',
};

/** One quiet intro line per channel, plus the quiet-state brief (incident 0). */
export function seedRoom(ctx: Ctx, stakeholders: number): void {
  sysMessage(ctx, 0n, '#command', `Break-glass channel is quiet. ${stakeholders} of ${stakeholders} identities verified.`);
  for (const ch of CHANNELS) {
    if (CHANNEL_INTRO[ch]) sysMessage(ctx, 0n, ch, CHANNEL_INTRO[ch]);
  }
  ctx.db.briefStore.insert({
    incident_id: 0n,
    text: 'Nothing to report. All systems are normal.',
    known: [
      `All ${stakeholders} stakeholder identities are verified`,
      'This room runs outside the company network',
      'No incident is open',
    ].join('\n'),
    unknown: 'Nothing is open right now',
    updated_at: ctx.timestamp,
    author: 'scribe',
  });
}

/** Placeholders every new incident starts with: 3 tasks and 2 decisions. Called by open_incident. */
export function seedIncidentDocs(ctx: Ctx, incidentId: bigint): void {
  const tasks: Array<[string, string]> = [
    ['Assess notification obligations', 'legal'],
    ['Prepare a holding statement', 'comms'],
    ['Confirm the vGPU hypervisor patch', 'vendor'],
  ];
  for (const [title, owner_role] of tasks) {
    ctx.db.taskStore.insert({ id: 0n, incident_id: incidentId, title, owner_role, status: 'open', at: ctx.timestamp });
  }
  const decisions: Array<[string, string]> = [
    ['Internal email and chat are treated as visible to the attacker. Coordinate in this room only.', 'standing order'],
    ['Reversible containment may run without a human. Quarantine needs a commander. Reimage and power-off are denied.', 'guest-escape playbook (policy)'],
  ];
  for (const [text, by_name] of decisions) {
    ctx.db.decisionStore.insert({ id: 0n, incident_id: incidentId, text, by_name, at: ctx.timestamp });
  }
}

/** Move the unassigned scope inventory into a freshly opened incident. */
export function adoptDataAssets(ctx: Ctx, incidentId: bigint): number {
  let n = 0;
  for (const a of [...ctx.db.dataAssetStore.iter()]) {
    if (a.incident_id !== 0n) continue;
    ctx.db.dataAssetStore.id.update({ ...a, incident_id: incidentId, updated_at: ctx.timestamp });
    n++;
  }
  return n;
}

/** Wipe every DATA table. Operators and enrollment codes are never touched by a reset. */
export function wipeData(ctx: Ctx): void {
  const db = ctx.db;
  for (const r of [...db.hostStore.iter()]) db.hostStore.host.delete(r.host);
  for (const r of [...db.guestVmStore.iter()]) db.guestVmStore.vm.delete(r.vm);
  for (const r of [...db.signalStore.iter()]) db.signalStore.id.delete(r.id);
  for (const r of [...db.incidentStore.iter()]) db.incidentStore.id.delete(r.id);
  for (const r of [...db.agentStateStore.iter()]) db.agentStateStore.agent.delete(r.agent);
  for (const r of [...db.findingStore.iter()]) db.findingStore.id.delete(r.id);
  for (const r of [...db.policyStore.iter()]) db.policyStore.action.delete(r.action);
  for (const r of [...db.proposalStore.iter()]) db.proposalStore.id.delete(r.id);
  for (const r of [...db.incidentEventStore.iter()]) db.incidentEventStore.id.delete(r.id);
  for (const r of [...db.reportStore.iter()]) db.reportStore.incident_id.delete(r.incident_id);
  for (const r of [...db.messageStore.iter()]) db.messageStore.id.delete(r.id);
  for (const r of [...db.taskStore.iter()]) db.taskStore.id.delete(r.id);
  for (const r of [...db.decisionStore.iter()]) db.decisionStore.id.delete(r.id);
  for (const r of [...db.briefStore.iter()]) db.briefStore.incident_id.delete(r.incident_id);
  for (const r of [...db.dataAssetStore.iter()]) db.dataAssetStore.id.delete(r.id);
  for (const r of [...db.stakeholderStore.iter()]) db.stakeholderStore.name.delete(r.name);
}

/** Wipe the data tables and reseed everything. Shared by reset_demo and init. */
export function resetAndSeed(ctx: Ctx, by: string): void {
  wipeData(ctx);
  seedFleet(ctx);
  seedAgents(ctx);
  seedPolicy(ctx);
  const n = seedStakeholders(ctx);
  seedDataAssets(ctx);
  seedRoom(ctx, n);
  logEvent(
    ctx, 0n, 'state', 'system',
    `Demo reset by ${by}: fleet, agents, policy, stakeholders and scope inventory reseeded. 12 guests on b14-gpu-07, clean targets in hall C. Operators and enrollment codes kept.`
  );
}
