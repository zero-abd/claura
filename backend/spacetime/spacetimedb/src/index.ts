/*
 * Claura: agentic incident response for AI data centers.
 * "Seal the breach before it spreads."
 *
 * SpacetimeDB TypeScript module. Everything on the wire is snake_case.
 * The four agents (Sentry, Triage, Warden, Scribe) and the operator console
 * all talk to this module only through the reducers below; the consoles
 * subscribe to the public tables.
 *
 * THE POLICY GATE lives in `propose_action`: the `policy` table, not the
 * model, decides whether a proposed action runs, waits for a human, or is
 * blocked.
 */
import {
  schema,
  table,
  t,
  SenderError,
  type Infer,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

// ---------------------------------------------------------------------------
// Tables (all public)
// ---------------------------------------------------------------------------

const hostTable = table(
  { name: 'host', public: true },
  {
    host: t.string().primaryKey(),
    hall: t.string(),
    rack: t.string(),
    /** healthy | suspect | cordoned | quarantined */
    status: t.string(),
  }
);

const guestVmTable = table(
  { name: 'guest_vm', public: true },
  {
    vm: t.string().primaryKey(),
    /** Host the guest runs on (never rewritten; see moved_to for failover). */
    host: t.string().index('btree'),
    workload: t.string(),
    /** running | paused | failed_over */
    status: t.string(),
    /** Destination host after failover_guests, '' until then. */
    moved_to: t.string(),
  }
);

const signalTable = table(
  { name: 'signal', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    at: t.timestamp(),
    source: t.string(),
    message: t.string(),
    host: t.string(),
    vm: t.string(),
  }
);

const incidentTable = table(
  { name: 'incident', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    title: t.string(),
    severity: t.string(),
    host: t.string(),
    vm: t.string(),
    /** open | awaiting_approval | contained */
    status: t.string(),
    opened_at: t.timestamp(),
    /** None (undefined on TS clients) until the incident is contained. */
    contained_at: t.option(t.timestamp()),
    blast_score: t.f64(),
  }
);

const agentStateTable = table(
  { name: 'agent_state', public: true },
  {
    /** sentry | triage | warden | scribe */
    agent: t.string().primaryKey(),
    status: t.string(),
    thought: t.string(),
    model: t.string(),
    updated_at: t.timestamp(),
  }
);

const findingTable = table(
  { name: 'finding', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incident_id: t.u64(),
    agent: t.string(),
    kind: t.string(),
    text: t.string(),
    at: t.timestamp(),
  }
);

const policyTable = table(
  { name: 'policy', public: true },
  {
    action: t.string().primaryKey(),
    /** auto | approval | deny */
    mode: t.string(),
    reversible: t.bool(),
    note: t.string(),
  }
);

const proposalTable = table(
  { name: 'proposal', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incident_id: t.u64(),
    agent: t.string(),
    action: t.string(),
    target: t.string(),
    reason: t.string(),
    /** executed | pending_approval | approved | blocked */
    status: t.string(),
    /** The policy mode that was applied: auto | approval | deny. */
    policy_mode: t.string(),
    at: t.timestamp(),
    /** '' while undecided; 'policy' for auto/blocked; operator name once approved. */
    decided_by: t.string(),
  }
);

const incidentEventTable = table(
  { name: 'incident_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    /** 0 = not tied to an incident (e.g. a signal before any incident exists). */
    incident_id: t.u64(),
    at: t.timestamp(),
    /** signal | incident | finding | action | blocked | approval_requested | approval | state | report */
    kind: t.string(),
    actor: t.string(),
    text: t.string(),
  }
);

const reportTable = table(
  { name: 'report', public: true },
  {
    incident_id: t.u64().primaryKey(),
    summary: t.string(),
    filed_at: t.timestamp(),
  }
);

const spacetimedb = schema({
  host: hostTable,
  guestVm: guestVmTable,
  signal: signalTable,
  incident: incidentTable,
  agentState: agentStateTable,
  finding: findingTable,
  policy: policyTable,
  proposal: proposalTable,
  incidentEvent: incidentEventTable,
  report: reportTable,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type IncidentRow = Infer<typeof incidentTable.rowType>;
type HostRow = Infer<typeof hostTable.rowType>;

// ---------------------------------------------------------------------------
// Helpers (not exported: named exports are reserved for reducers/hooks)
// ---------------------------------------------------------------------------

const AGENTS = ['sentry', 'triage', 'warden', 'scribe'] as const;
const POLICY_MODES = ['auto', 'approval', 'deny'] as const;
/** Host status ladder; auto actions may only move a host UP this ladder. */
const HOST_RANK: Record<string, number> = {
  healthy: 0,
  suspect: 1,
  cordoned: 2,
  quarantined: 3,
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function logEvent(
  ctx: Ctx,
  incident_id: bigint,
  kind: string,
  actor: string,
  text: string
): void {
  ctx.db.incidentEvent.insert({
    id: 0n,
    incident_id,
    at: ctx.timestamp,
    kind,
    actor,
    text,
  });
}

function findHost(ctx: Ctx, name: string): HostRow | null {
  const n = name.trim();
  return ctx.db.host.host.find(n) ?? ctx.db.host.host.find(n.toLowerCase());
}

function findGuest(ctx: Ctx, name: string) {
  const n = name.trim();
  return ctx.db.guestVm.vm.find(n) ?? ctx.db.guestVm.vm.find(n.toLowerCase());
}

/** Highest-id incident that is not yet contained, optionally matching host/vm. */
function latestActiveIncident(
  ctx: Ctx,
  host?: string,
  vm?: string
): IncidentRow | null {
  let best: IncidentRow | null = null;
  for (const inc of ctx.db.incident.iter()) {
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

function requireIncident(ctx: Ctx, id: bigint): IncidentRow {
  const inc = ctx.db.incident.id.find(id);
  if (!inc) throw new SenderError(`incident ${id} not found`);
  return inc;
}

/** If the model leaves `target` empty, fall back to the incident's own subject. */
function defaultTarget(action: string, inc: IncidentRow): string {
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
function checkTarget(ctx: Ctx, action: string, target: string): string | null {
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
  const healthy = [...ctx.db.host.iter()].filter(
    h => h.status === 'healthy' && h.host !== source.host
  );
  const hallC = healthy.filter(h => h.hall.toUpperCase() === 'C');
  if (hallC.length > 0) return hallC;
  return healthy.filter(h => h.hall !== source.hall);
}

/**
 * The actual effect of an action. Shared by the auto path (propose_action)
 * and the human-approved path (approve). Target must already be validated.
 * Returns a human-readable description of what happened.
 */
function applyEffect(
  ctx: Ctx,
  inc: IncidentRow,
  action: string,
  target: string
): string {
  switch (action) {
    case 'isolate_network':
      return `network isolated for ${target}`;
    case 'revoke_credentials':
      return `credentials revoked for ${target}`;
    case 'capture_memory':
      return `memory image captured from ${target}`;
    case 'cordon_host': {
      const h = findHost(ctx, target)!;
      if ((HOST_RANK[h.status] ?? 0) < HOST_RANK.cordoned) {
        ctx.db.host.host.update({ ...h, status: 'cordoned' });
        return `host ${h.host} cordoned (no new workloads scheduled)`;
      }
      return `host ${h.host} already ${h.status}; left as is`;
    }
    case 'pause_guest': {
      const g = findGuest(ctx, target)!;
      if (g.status === 'failed_over') {
        return `guest ${g.vm} already failed over; left as is`;
      }
      ctx.db.guestVm.vm.update({ ...g, status: 'paused' });
      return `guest ${g.vm} paused`;
    }
    case 'failover_guests': {
      const src = findHost(ctx, target)!;
      const dests = failoverDestinations(ctx, src);
      if (dests.length === 0) {
        throw new SenderError('no clean destination host available for failover');
      }
      // Co-resident = everything on the host except the suspect VM itself.
      const movers = [...ctx.db.guestVm.host.filter(src.host)].filter(
        g => g.vm !== inc.vm && g.status === 'running'
      );
      movers.sort((a, b) => (a.vm < b.vm ? -1 : a.vm > b.vm ? 1 : 0));
      const perDest = new Map<string, number>();
      movers.forEach((g, i) => {
        const dest = dests[i % dests.length].host;
        ctx.db.guestVm.vm.update({ ...g, status: 'failed_over', moved_to: dest });
        perDest.set(dest, (perDest.get(dest) ?? 0) + 1);
      });
      const split = [...perDest.entries()].map(([d, n]) => `${n} to ${d}`).join(', ');
      return movers.length === 0
        ? `no running co-resident guests left on ${src.host}`
        : `${movers.length} co-resident guests failed over from ${src.host} (${split})`;
    }
    case 'quarantine_host': {
      const h = findHost(ctx, target)!;
      ctx.db.host.host.update({ ...h, status: 'quarantined' });
      return `host ${h.host} quarantined`;
    }
    default:
      // Reachable only if an operator set a non-built-in action to auto/approval:
      // there is no modelled effect, so only the audit trail records it.
      return `${action} recorded for ${target} (no modelled effect)`;
  }
}

function seedPolicy(ctx: Ctx): void {
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
    ctx.db.policy.insert({ action, mode, reversible, note });
  }
}

function seedFleet(ctx: Ctx): void {
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
    ctx.db.host.insert({ host, hall, rack, status: 'healthy' });
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
    ctx.db.guestVm.insert({
      vm,
      host: 'b14-gpu-07',
      workload,
      status: 'running',
      moved_to: '',
    });
  }
}

function seedAgents(ctx: Ctx): void {
  for (const agent of AGENTS) {
    ctx.db.agentState.insert({
      agent,
      status: 'idle',
      thought: '',
      model: 'nemotron-3-nano:4b',
      updated_at: ctx.timestamp,
    });
  }
}

/** Wipe every table and reseed. Shared by reset_demo and init. */
function resetAndSeed(ctx: Ctx): void {
  for (const r of [...ctx.db.host.iter()]) ctx.db.host.host.delete(r.host);
  for (const r of [...ctx.db.guestVm.iter()]) ctx.db.guestVm.vm.delete(r.vm);
  for (const r of [...ctx.db.signal.iter()]) ctx.db.signal.id.delete(r.id);
  for (const r of [...ctx.db.incident.iter()]) ctx.db.incident.id.delete(r.id);
  for (const r of [...ctx.db.agentState.iter()]) ctx.db.agentState.agent.delete(r.agent);
  for (const r of [...ctx.db.finding.iter()]) ctx.db.finding.id.delete(r.id);
  for (const r of [...ctx.db.policy.iter()]) ctx.db.policy.action.delete(r.action);
  for (const r of [...ctx.db.proposal.iter()]) ctx.db.proposal.id.delete(r.id);
  for (const r of [...ctx.db.incidentEvent.iter()]) ctx.db.incidentEvent.id.delete(r.id);
  for (const r of [...ctx.db.report.iter()]) ctx.db.report.incident_id.delete(r.incident_id);

  seedFleet(ctx);
  seedAgents(ctx);
  seedPolicy(ctx);
  logEvent(
    ctx,
    0n,
    'state',
    'system',
    'Demo reset: fleet, agents and policy reseeded. 12 guests on b14-gpu-07, clean targets in hall C.'
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** A freshly published (or cleared) database comes up already seeded. */
export const init = spacetimedb.init(ctx => {
  resetAndSeed(ctx);
});

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

/** Wipe all incident data and reseed hosts, guests, agents and policy. */
export const reset_demo = spacetimedb.reducer(ctx => {
  resetAndSeed(ctx);
});

/**
 * Sentry-side telemetry intake. Attached to the latest uncontained incident on
 * the same host/vm if there is one, otherwise incident_id = 0 (no incident yet).
 */
export const ingest_signal = spacetimedb.reducer(
  { source: t.string(), message: t.string(), host: t.string(), vm: t.string() },
  (ctx, { source, message, host, vm }) => {
    ctx.db.signal.insert({
      id: 0n,
      at: ctx.timestamp,
      source,
      message,
      host,
      vm,
    });
    const inc = latestActiveIncident(ctx, host.trim(), vm.trim());
    logEvent(ctx, inc ? inc.id : 0n, 'signal', source, message);
  }
);

/** Open an incident (status open, blast_score 0) and mark a healthy host suspect. */
export const open_incident = spacetimedb.reducer(
  { title: t.string(), severity: t.string(), host: t.string(), vm: t.string() },
  (ctx, { title, severity, host, vm }) => {
    const inc = ctx.db.incident.insert({
      id: 0n,
      title,
      severity,
      host: host.trim(),
      vm: vm.trim(),
      status: 'open',
      opened_at: ctx.timestamp,
      contained_at: undefined,
      blast_score: 0,
    });
    const h = findHost(ctx, inc.host);
    if (h && h.status === 'healthy') {
      ctx.db.host.host.update({ ...h, status: 'suspect' });
    }
    logEvent(
      ctx,
      inc.id,
      'incident',
      'sentry',
      `Incident #${inc.id} opened [${severity}]: ${title} (host ${inc.host}, vm ${inc.vm})`
    );
  }
);

/** Upsert one agent's live status card. Does not write to the event log. */
export const set_agent_state = spacetimedb.reducer(
  { agent: t.string(), status: t.string(), thought: t.string(), model: t.string() },
  (ctx, { agent, status, thought, model }) => {
    const a = norm(agent);
    if (!(AGENTS as readonly string[]).includes(a)) {
      throw new SenderError(`unknown agent '${agent}' (expected one of ${AGENTS.join(', ')})`);
    }
    const row = { agent: a, status, thought, model, updated_at: ctx.timestamp };
    if (ctx.db.agentState.agent.find(a)) ctx.db.agentState.agent.update(row);
    else ctx.db.agentState.insert(row);
  }
);

/** Record an agent finding. blast_score < 0 leaves incident.blast_score unchanged. */
export const record_finding = spacetimedb.reducer(
  {
    incident_id: t.u64(),
    agent: t.string(),
    kind: t.string(),
    text: t.string(),
    blast_score: t.f64(),
  },
  (ctx, { incident_id, agent, kind, text, blast_score }) => {
    const inc = requireIncident(ctx, incident_id);
    const who = norm(agent);
    ctx.db.finding.insert({
      id: 0n,
      incident_id,
      agent: who,
      kind,
      text,
      at: ctx.timestamp,
    });
    let suffix = '';
    if (Number.isFinite(blast_score) && blast_score >= 0) {
      ctx.db.incident.id.update({ ...inc, blast_score });
      suffix = ` (blast_score ${blast_score})`;
    }
    logEvent(ctx, incident_id, 'finding', who, `[${kind}] ${text}${suffix}`);
  }
);

/**
 * THE POLICY GATE. An agent proposes an action; the policy table decides.
 *   auto      -> effect applied now, proposal.status = executed
 *   approval  -> proposal.status = pending_approval, incident awaiting_approval
 *   deny / unknown action / unusable target -> proposal.status = blocked
 * An incident_event is always appended.
 */
export const propose_action = spacetimedb.reducer(
  {
    incident_id: t.u64(),
    agent: t.string(),
    action: t.string(),
    target: t.string(),
    reason: t.string(),
  },
  (ctx, { incident_id, agent, action, target, reason }) => {
    const inc = requireIncident(ctx, incident_id);
    const who = norm(agent);
    const act = norm(action);
    const tgt = target.trim() || defaultTarget(act, inc);

    // 1. Policy lookup. Fail closed: unknown action or malformed mode => deny.
    const pol = ctx.db.policy.action.find(act);
    const mode =
      pol && (pol.mode === 'auto' || pol.mode === 'approval') ? pol.mode : 'deny';

    const record = (status: string, decided_by: string) =>
      ctx.db.proposal.insert({
        id: 0n,
        incident_id,
        agent: who,
        action: act,
        target: tgt,
        reason,
        status,
        policy_mode: mode,
        at: ctx.timestamp,
        decided_by,
      });

    // 2. Deny.
    if (mode === 'deny') {
      const p = record('blocked', 'policy');
      logEvent(
        ctx,
        incident_id,
        'blocked',
        who,
        `BLOCKED ${act} on ${tgt} (proposal #${p.id}): ${
          pol ? 'denied by policy' : 'not in policy table, denied by default'
        }. Reason given: ${reason}`
      );
      return;
    }

    // 3. Target sanity (hallucinated host/vm names must not silently "succeed").
    const bad = checkTarget(ctx, act, tgt);
    if (bad) {
      const p = record('blocked', 'policy');
      logEvent(
        ctx,
        incident_id,
        'blocked',
        who,
        `BLOCKED ${act} on ${tgt} (proposal #${p.id}): ${bad}`
      );
      return;
    }

    // 4. Approval: park it for a human.
    if (mode === 'approval') {
      const p = record('pending_approval', '');
      if (inc.status !== 'contained') {
        ctx.db.incident.id.update({ ...inc, status: 'awaiting_approval' });
      }
      logEvent(
        ctx,
        incident_id,
        'approval_requested',
        who,
        `Approval requested for ${act} on ${tgt} (proposal #${p.id}). Reason: ${reason}`
      );
      return;
    }

    // 5. Auto: apply now.
    const detail = applyEffect(ctx, inc, act, tgt);
    const p = record('executed', 'policy');
    logEvent(
      ctx,
      incident_id,
      'action',
      who,
      `${act} on ${tgt} executed (proposal #${p.id}, auto${
        pol!.reversible ? ', reversible' : ''
      }): ${detail}. Reason: ${reason}`
    );
  }
);

/**
 * Human approval of a pending proposal. Applies the effect; quarantine_host
 * also marks the incident contained. Operator names that are agent names are
 * rejected so a model cannot approve its own proposal through this reducer.
 */
export const approve = spacetimedb.reducer(
  { proposal_id: t.u64(), operator: t.string() },
  (ctx, { proposal_id, operator }) => {
    const prop = ctx.db.proposal.id.find(proposal_id);
    if (!prop) throw new SenderError(`proposal ${proposal_id} not found`);
    if (prop.status !== 'pending_approval') {
      throw new SenderError(
        `proposal ${proposal_id} is '${prop.status}', only pending_approval can be approved`
      );
    }
    const op = operator.trim();
    if (!op) throw new SenderError('operator is required');
    if ((AGENTS as readonly string[]).includes(op.toLowerCase())) {
      throw new SenderError('agents cannot approve proposals; a human operator must');
    }
    const inc = requireIncident(ctx, prop.incident_id);

    const bad = checkTarget(ctx, prop.action, prop.target);
    if (bad) throw new SenderError(`cannot apply ${prop.action}: ${bad}`);

    const detail = applyEffect(ctx, inc, prop.action, prop.target);
    ctx.db.proposal.id.update({ ...prop, status: 'approved', decided_by: op });
    logEvent(
      ctx,
      inc.id,
      'approval',
      op,
      `${op} approved ${prop.action} on ${prop.target} (proposal #${prop.id}, requested by ${prop.agent})`
    );

    if (prop.action === 'quarantine_host') {
      ctx.db.incident.id.update({
        ...inc,
        status: 'contained',
        contained_at: ctx.timestamp,
      });
      logEvent(
        ctx,
        inc.id,
        'state',
        'system',
        `${detail}. Incident #${inc.id} contained.`
      );
    } else {
      // Not the containing step: fall back to open once nothing else is pending.
      const stillPending = [...ctx.db.proposal.iter()].some(
        p => p.incident_id === inc.id && p.status === 'pending_approval'
      );
      if (inc.status === 'awaiting_approval' && !stillPending) {
        ctx.db.incident.id.update({ ...inc, status: 'open' });
      }
      logEvent(ctx, inc.id, 'state', 'system', detail);
    }
  }
);

/** Operator-side policy change. Unknown actions are created non-reversible. */
export const set_policy = spacetimedb.reducer(
  { action: t.string(), mode: t.string() },
  (ctx, { action, mode }) => {
    const act = norm(action);
    const m = norm(mode);
    if (!act) throw new SenderError('action is required');
    if (!(POLICY_MODES as readonly string[]).includes(m)) {
      throw new SenderError(`mode must be one of ${POLICY_MODES.join(', ')}`);
    }
    const existing = ctx.db.policy.action.find(act);
    const before = existing ? existing.mode : '(none)';
    if (existing) {
      ctx.db.policy.action.update({ ...existing, mode: m });
    } else {
      ctx.db.policy.insert({
        action: act,
        mode: m,
        reversible: false,
        note: 'Custom policy set by an operator.',
      });
    }
    const active = latestActiveIncident(ctx);
    logEvent(
      ctx,
      active ? active.id : 0n,
      'state',
      'system',
      `Policy changed: ${act} ${before} -> ${m}`
    );
  }
);

/** Scribe's final forensic report. Upserts by incident_id. */
export const file_report = spacetimedb.reducer(
  { incident_id: t.u64(), summary: t.string() },
  (ctx, { incident_id, summary }) => {
    requireIncident(ctx, incident_id);
    const row = { incident_id, summary, filed_at: ctx.timestamp };
    if (ctx.db.report.incident_id.find(incident_id)) {
      ctx.db.report.incident_id.update(row);
    } else {
      ctx.db.report.insert(row);
    }
    logEvent(ctx, incident_id, 'report', 'scribe', `Report filed for incident #${incident_id}`);
  }
);
