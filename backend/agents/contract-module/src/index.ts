// Reference implementation of the shared Claura contract (see ../README.md).
// This is a TEST HARNESS for the agent runner, not the production module.
import { schema, table, t, SenderError } from 'spacetimedb/server';

const host = table(
  { name: 'host', public: true },
  { host: t.string().primaryKey(), hall: t.string(), rack: t.string(), status: t.string() }
);
const guestVm = table(
  { name: 'guest_vm', public: true },
  {
    vm: t.string().primaryKey(),
    host: t.string(),
    workload: t.string(),
    status: t.string(),
    movedTo: t.string(),
  }
);
const signal = table(
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
const incident = table(
  { name: 'incident', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    title: t.string(),
    severity: t.string(),
    host: t.string(),
    vm: t.string(),
    status: t.string(),
    openedAt: t.timestamp(),
    containedAt: t.option(t.timestamp()),
    blastScore: t.f64(),
  }
);
const agentState = table(
  { name: 'agent_state', public: true },
  {
    agent: t.string().primaryKey(),
    status: t.string(),
    thought: t.string(),
    model: t.string(),
    updatedAt: t.timestamp(),
  }
);
const finding = table(
  { name: 'finding', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64(),
    agent: t.string(),
    kind: t.string(),
    text: t.string(),
    at: t.timestamp(),
  }
);
const policy = table(
  { name: 'policy', public: true },
  { action: t.string().primaryKey(), mode: t.string(), reversible: t.bool(), note: t.string() }
);
const proposal = table(
  { name: 'proposal', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64(),
    agent: t.string(),
    action: t.string(),
    target: t.string(),
    reason: t.string(),
    status: t.string(),
    policyMode: t.string(),
    at: t.timestamp(),
    decidedBy: t.string(),
  }
);
const incidentEvent = table(
  { name: 'incident_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64(),
    at: t.timestamp(),
    kind: t.string(),
    actor: t.string(),
    text: t.string(),
  }
);
const report = table(
  { name: 'report', public: true },
  { incidentId: t.u64().primaryKey(), summary: t.string(), filedAt: t.timestamp() }
);

const spacetimedb = schema({
  host,
  guestVm,
  signal,
  incident,
  agentState,
  finding,
  policy,
  proposal,
  incidentEvent,
  report,
});
export default spacetimedb;

type Ctx = any; // helpers take the reducer context; kept loose in this harness

function logEvent(ctx: Ctx, incidentId: bigint, kind: string, actor: string, text: string) {
  ctx.db.incidentEvent.insert({ id: 0n, incidentId, at: ctx.timestamp, kind, actor, text });
}

function latestOpenIncident(ctx: Ctx): any | undefined {
  let best: any;
  for (const i of ctx.db.incident.iter()) if (!best || i.id > best.id) best = i;
  return best;
}

const POLICIES: Array<[string, string, boolean, string]> = [
  ['isolate_network', 'auto', true, 'Detach vNIC / drop flows. Reversible.'],
  ['revoke_credentials', 'auto', true, 'Revoke workload tokens. Reversible (re-issue).'],
  ['cordon_host', 'auto', true, 'No new placements. Reversible.'],
  ['pause_guest', 'auto', true, 'Freeze vCPUs. Reversible (resume).'],
  ['capture_memory', 'auto', true, 'Read-only forensic capture.'],
  ['failover_guests', 'auto', true, 'Move co-resident guests to clean hosts.'],
  ['quarantine_host', 'approval', false, 'High impact: removes host from pool. Needs a human.'],
  ['reimage_host', 'deny', false, 'Destroys forensic evidence. Never automated.'],
  ['power_off_hall', 'deny', false, 'Catastrophic blast radius. Never automated.'],
  ['delete_vm', 'deny', false, 'Irreversible data loss. Never automated.'],
];

const TELEMETRY_NOTE = 'seeded';

export const reset_demo = spacetimedb.reducer(ctx => {
  for (const r of [...ctx.db.host.iter()]) ctx.db.host.host.delete(r.host);
  for (const r of [...ctx.db.guestVm.iter()]) ctx.db.guestVm.vm.delete(r.vm);
  for (const r of [...ctx.db.signal.iter()]) ctx.db.signal.id.delete(r.id);
  for (const r of [...ctx.db.incident.iter()]) ctx.db.incident.id.delete(r.id);
  for (const r of [...ctx.db.agentState.iter()]) ctx.db.agentState.agent.delete(r.agent);
  for (const r of [...ctx.db.finding.iter()]) ctx.db.finding.id.delete(r.id);
  for (const r of [...ctx.db.policy.iter()]) ctx.db.policy.action.delete(r.action);
  for (const r of [...ctx.db.proposal.iter()]) ctx.db.proposal.id.delete(r.id);
  for (const r of [...ctx.db.incidentEvent.iter()]) ctx.db.incidentEvent.id.delete(r.id);
  for (const r of [...ctx.db.report.iter()]) ctx.db.report.incidentId.delete(r.incidentId);

  const hosts: Array<[string, string, string]> = [
    ['a03-gpu-01', 'A', '03'], ['a09-gpu-03', 'A', '09'],
    ['b02-gpu-01', 'B', '02'], ['b08-gpu-05', 'B', '08'], ['b14-gpu-07', 'B', '14'],
    ['c05-gpu-02', 'C', '05'], ['c12-gpu-04', 'C', '12'],
    ['d01-gpu-06', 'D', '01'], ['d10-gpu-02', 'D', '10'],
  ];
  for (const [h, hall, rack] of hosts)
    ctx.db.host.insert({ host: h, hall, rack, status: 'healthy' });

  const guests: Array<[string, string]> = [
    ['vm-7f3a', 'agent-7f3 (code-exec sandbox)'],
    ['vm-1c02', 'llm-inference tenant-41'], ['vm-2d77', 'rag-indexer tenant-12'],
    ['vm-3e90', 'agent-9a1 (browser sandbox)'], ['vm-4b13', 'finetune-job tenant-07'],
    ['vm-5a68', 'embedding-svc tenant-33'], ['vm-6c4d', 'agent-2b8 (code-exec sandbox)'],
    ['vm-81ef', 'llm-inference tenant-19'], ['vm-92a0', 'vector-db tenant-22'],
    ['vm-a3b5', 'agent-5c4 (code-exec sandbox)'], ['vm-b4c6', 'batch-eval tenant-03'],
    ['vm-c5d7', 'llm-inference tenant-58'],
  ];
  for (const [vm, workload] of guests)
    ctx.db.guestVm.insert({ vm, host: 'b14-gpu-07', workload, status: 'running', movedTo: '' });

  for (const a of ['sentry', 'triage', 'warden', 'scribe'])
    ctx.db.agentState.insert({
      agent: a, status: 'idle', thought: 'Standing by.', model: '', updatedAt: ctx.timestamp,
    });
  for (const [action, mode, reversible, note] of POLICIES)
    ctx.db.policy.insert({ action, mode, reversible, note });
  console.info(`reset_demo: ${TELEMETRY_NOTE}`);
});

export const ingest_signal = spacetimedb.reducer(
  { source: t.string(), message: t.string(), host: t.string(), vm: t.string() },
  (ctx, { source, message, host, vm }) => {
    ctx.db.signal.insert({ id: 0n, at: ctx.timestamp, source, message, host, vm });
    const open = latestOpenIncident(ctx);
    logEvent(ctx, open ? open.id : 0n, 'signal', source, message);
  }
);

export const open_incident = spacetimedb.reducer(
  { title: t.string(), severity: t.string(), host: t.string(), vm: t.string() },
  (ctx, { title, severity, host, vm }) => {
    const row = ctx.db.incident.insert({
      id: 0n, title, severity, host, vm, status: 'open',
      openedAt: ctx.timestamp, containedAt: undefined, blastScore: 0,
    });
    const h = ctx.db.host.host.find(host);
    if (h) ctx.db.host.host.update({ ...h, status: 'suspect' });
    logEvent(ctx, row.id, 'incident', 'sentry', `Incident opened (${severity}): ${title}`);
  }
);

export const set_agent_state = spacetimedb.reducer(
  { agent: t.string(), status: t.string(), thought: t.string(), model: t.string() },
  (ctx, { agent, status, thought, model }) => {
    const row = { agent, status, thought, model, updatedAt: ctx.timestamp };
    if (ctx.db.agentState.agent.find(agent)) ctx.db.agentState.agent.update(row);
    else ctx.db.agentState.insert(row);
  }
);

export const record_finding = spacetimedb.reducer(
  {
    incidentId: t.u64(), agent: t.string(), kind: t.string(), text: t.string(),
    blastScore: t.f64(),
  },
  (ctx, { incidentId, agent, kind, text, blastScore }) => {
    ctx.db.finding.insert({ id: 0n, incidentId, agent, kind, text, at: ctx.timestamp });
    if (blastScore >= 0) {
      const inc = ctx.db.incident.id.find(incidentId);
      if (inc) ctx.db.incident.id.update({ ...inc, blastScore });
    }
    logEvent(ctx, incidentId, 'finding', agent, `${kind}: ${text}`);
  }
);

function applyEffect(ctx: Ctx, inc: any, action: string, target: string): string {
  switch (action) {
    case 'cordon_host': {
      const h = ctx.db.host.host.find(target);
      if (h) ctx.db.host.host.update({ ...h, status: 'cordoned' });
      return `host ${target} cordoned`;
    }
    case 'pause_guest': {
      const g = ctx.db.guestVm.vm.find(target);
      if (g) ctx.db.guestVm.vm.update({ ...g, status: 'paused' });
      return `guest ${target} paused`;
    }
    case 'failover_guests': {
      const clean = [...ctx.db.host.iter()].filter((h: any) => h.hall === 'C' && h.status === 'healthy');
      let n = 0;
      for (const g of [...ctx.db.guestVm.iter()]) {
        if (g.host !== inc.host || g.vm === inc.vm || g.status === 'failed_over') continue;
        const dest = clean[n % Math.max(clean.length, 1)];
        if (!dest) break;
        ctx.db.guestVm.vm.update({ ...g, status: 'failed_over', movedTo: dest.host });
        n++;
      }
      return `${n} co-resident guests failed over to hall C`;
    }
    default:
      return `${action} applied to ${target}`;
  }
}

export const propose_action = spacetimedb.reducer(
  {
    incidentId: t.u64(), agent: t.string(), action: t.string(), target: t.string(),
    reason: t.string(),
  },
  (ctx, { incidentId, agent, action, target, reason }) => {
    const inc = ctx.db.incident.id.find(incidentId);
    if (!inc) throw new SenderError(`unknown incident ${incidentId}`);
    const pol = ctx.db.policy.action.find(action);
    const mode = pol ? pol.mode : 'deny';
    let status: string;
    if (mode === 'auto') status = 'executed';
    else if (mode === 'approval') status = 'pending_approval';
    else status = 'blocked';
    ctx.db.proposal.insert({
      id: 0n, incidentId, agent, action, target, reason, status, policyMode: mode,
      at: ctx.timestamp, decidedBy: mode === 'auto' ? 'policy' : '',
    });
    if (status === 'executed') {
      const effect = applyEffect(ctx, inc, action, target);
      logEvent(ctx, incidentId, 'action', agent, `${action} -> ${target}: ${effect}. Reason: ${reason}`);
    } else if (status === 'pending_approval') {
      ctx.db.incident.id.update({ ...inc, status: 'awaiting_approval' });
      logEvent(ctx, incidentId, 'approval_requested', agent, `${action} -> ${target} needs human approval. Reason: ${reason}`);
    } else {
      logEvent(ctx, incidentId, 'blocked', agent, `${action} -> ${target} BLOCKED by policy (${pol ? 'deny' : 'unknown action'}). Reason: ${reason}`);
    }
  }
);

export const approve = spacetimedb.reducer(
  { proposalId: t.u64(), operator: t.string() },
  (ctx, { proposalId, operator }) => {
    const p = ctx.db.proposal.id.find(proposalId);
    if (!p) throw new SenderError(`unknown proposal ${proposalId}`);
    if (p.status !== 'pending_approval') throw new SenderError(`proposal ${proposalId} is ${p.status}`);
    ctx.db.proposal.id.update({ ...p, status: 'approved', decidedBy: operator });
    logEvent(ctx, p.incidentId, 'approval', operator, `${operator} approved ${p.action} -> ${p.target}`);
    if (p.action === 'quarantine_host') {
      const h = ctx.db.host.host.find(p.target);
      if (h) ctx.db.host.host.update({ ...h, status: 'quarantined' });
      const inc = ctx.db.incident.id.find(p.incidentId);
      if (inc)
        ctx.db.incident.id.update({ ...inc, status: 'contained', containedAt: ctx.timestamp });
      logEvent(ctx, p.incidentId, 'state', 'warden', `Host ${p.target} quarantined. Incident contained.`);
    }
  }
);

export const set_policy = spacetimedb.reducer(
  { action: t.string(), mode: t.string() },
  (ctx, { action, mode }) => {
    if (!['auto', 'approval', 'deny'].includes(mode)) throw new SenderError(`bad mode ${mode}`);
    const row = ctx.db.policy.action.find(action);
    if (row) ctx.db.policy.action.update({ ...row, mode });
    else ctx.db.policy.insert({ action, mode, reversible: false, note: '' });
  }
);

export const file_report = spacetimedb.reducer(
  { incidentId: t.u64(), summary: t.string() },
  (ctx, { incidentId, summary }) => {
    const row = { incidentId, summary, filedAt: ctx.timestamp };
    if (ctx.db.report.incidentId.find(incidentId)) ctx.db.report.incidentId.update(row);
    else ctx.db.report.insert(row);
    logEvent(ctx, incidentId, 'report', 'scribe', 'Report filed.');
  }
);
