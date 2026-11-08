/*
 * Claura: agentic incident response for AI data centers.
 * "Seal the breach before it spreads."
 *
 * SpacetimeDB TypeScript module. Everything on the wire is snake_case.
 *
 * Three ideas hold this module together:
 *
 *  1. NOBODY IS TRUSTED BY DEFAULT. Every table is private. Clients read through per-user gated
 *     views (views.ts) and write through reducers; every reducer starts with requireOperator(),
 *     which maps ctx.sender (the authenticated identity, never an argument) to an enrolled,
 *     active operator and checks the operator's role. A stranger sees nothing and changes nothing.
 *
 *  2. THE POLICY GATE LIVES IN `propose_action`: the `policy` table, not the model, decides whether
 *     a proposed action runs, waits for a human, or is blocked. Only an admin or a commander can
 *     approve a held action, and the approver is recorded from their identity, not from an argument.
 *
 *  3. EVERYTHING IS DOCUMENTED AS IT HAPPENS. Each change writes an incident_event (the audit
 *     trail), and the incident carries its NIST SP 800-61 fields: category, phase, functional /
 *     information impact, recoverability.
 *
 * Files: schema.ts (tables), lib.ts (roles, matrix, effects, seeds), views.ts (gated reads),
 * index.ts (init + reducers).
 */
import { t, SenderError } from 'spacetimedb/server';
import spacetimedb from './schema';
import {
  AGENTS,
  ASSET_STATUSES,
  CHANNELS,
  HUMAN_ONLY_ASSET_STATUSES,
  INTERNAL,
  PHASES,
  POLICY_MODES,
  POST_CHANNEL,
  ROLES,
  SCOPE_WRITERS,
  TASK_STATUSES,
  actionVerb,
  adoptDataAssets,
  applyEffect,
  checkTarget,
  cleanName,
  cleanText,
  containIncident,
  defaultTarget,
  findHost,
  isIn,
  latestActiveIncident,
  logEvent,
  norm,
  parseIdentity,
  phaseRank,
  requireIncident,
  requireIncidentOrRoom,
  requireOperator,
  resetAndSeed,
  seedIncidentDocs,
  shortId,
  sysMessage,
  type OperatorRow,
} from './lib';
import type { Ctx } from './schema';

// The client reads through these views; re-export so the module registers them.
export { default } from './schema';
export * from './views';

const AGENT_OR_ADMIN = ['agent', 'admin'] as const;
const CAN_COMMAND = ['admin', 'commander'] as const;
const CAN_DOCUMENT = ['agent', 'commander', 'admin'] as const;
/** Names a human may never take: they would let a person pose as an agent in the war room. */
const RESERVED_NAMES: readonly string[] = [...AGENTS, 'system', 'claura', 'policy', 'policy gate', 'seed'];

function activeAdmins(ctx: Ctx): OperatorRow[] {
  return [...ctx.db.operatorStore.iter()].filter(o => o.active && o.role === 'admin');
}

/** Where an access-control event is filed: the live incident if there is one, else the standing room. */
function liveIncidentId(ctx: Ctx): bigint {
  return latestActiveIncident(ctx)?.id ?? 0n;
}

/** A display name is unique among active operators (case-insensitive) and never an agent's name. */
function assertNameFree(ctx: Ctx, name: string, role: string, except?: OperatorRow['identity']): void {
  const key = name.normalize('NFKC').toLowerCase();
  if (role !== 'agent' && RESERVED_NAMES.includes(key)) {
    throw new SenderError(`the name '${name}' is reserved`);
  }
  for (const o of ctx.db.operatorStore.iter()) {
    if (!o.active) continue;
    if (except && o.identity.equals(except)) continue;
    if (o.name.normalize('NFKC').toLowerCase() === key) {
      throw new SenderError(`the name '${name}' is already in use by another operator`);
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * A freshly published (or cleared) database comes up seeded, and the PUBLISHER becomes the first
 * admin ("Owner"). init only runs on a fresh publish, so there is no way to claim admin later.
 */
export const init = spacetimedb.init(ctx => {
  ctx.db.operatorStore.insert({
    identity: ctx.sender,
    name: 'Owner',
    role: 'admin',
    added_by: 'publisher',
    added_at: ctx.timestamp,
    active: true,
  });
  resetAndSeed(ctx, 'publisher');
});

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

/**
 * Join with a one-time code that an admin handed over out-of-band (in person, on paper, read over
 * a phone the attacker does not control). The caller's own identity becomes the operator. The code is
 * consumed. The error for a wrong code and a used code is identical so a guesser learns nothing.
 * If the code carries a name_hint, the admin-chosen name wins over the typed one.
 */
export const enroll = spacetimedb.reducer(
  { code: t.string(), name: t.string() },
  (ctx, { code, name }) => {
    const enr = ctx.db.enrollmentStore.code.find(code.trim());
    if (!enr || enr.used_by !== '') throw new SenderError('invalid or already used enrollment code');
    const existing = ctx.db.operatorStore.identity.find(ctx.sender);
    if (existing && existing.active) throw new SenderError('this identity is already enrolled');

    const finalName = cleanName(enr.name_hint.trim() ? enr.name_hint : name, 'name');
    assertNameFree(ctx, finalName, enr.role, ctx.sender);

    const row = {
      identity: ctx.sender,
      name: finalName,
      role: enr.role,
      added_by: `code issued by ${enr.created_by}`,
      added_at: ctx.timestamp,
      active: true,
    };
    if (existing) ctx.db.operatorStore.identity.update(row);
    else ctx.db.operatorStore.insert(row);
    ctx.db.enrollmentStore.code.update({ ...enr, used_by: `${finalName} (${shortId(ctx.sender)})` });

    const inc = liveIncidentId(ctx);
    logEvent(ctx, inc, 'state', finalName,
      `ACCESS: ${finalName} (${shortId(ctx.sender)}) enrolled as ${enr.role} with a one-time code issued by ${enr.created_by}.`);
    sysMessage(ctx, inc, '#command', `${finalName} joined as ${enr.role} (one-time code from ${enr.created_by}).`);
  }
);

/** Admin: mint a single-use enrollment code for a role. The code is chosen by the admin's client (use 80+ random bits). */
export const issue_enrollment = spacetimedb.reducer(
  { code: t.string(), role: t.string(), name_hint: t.string() },
  (ctx, { code, role, name_hint }) => {
    const admin = requireOperator(ctx, ['admin']);
    const c = code.trim();
    if (c.length < 12 || c.length > 64 || !/^[A-Za-z0-9_-]+$/.test(c)) {
      throw new SenderError('code must be 12 to 64 characters of A-Z a-z 0-9 - _ (generate 80+ random bits)');
    }
    const r = norm(role);
    if (!isIn(ROLES, r)) throw new SenderError(`role must be one of ${ROLES.join(', ')}`);
    const hint = name_hint.trim() ? cleanName(name_hint, 'name_hint') : '';
    if (ctx.db.enrollmentStore.code.find(c)) throw new SenderError('that code already exists');
    ctx.db.enrollmentStore.insert({
      code: c, role: r, name_hint: hint, created_by: admin.name, created_at: ctx.timestamp, used_by: '',
    });
    logEvent(ctx, liveIncidentId(ctx), 'state', admin.name,
      `ACCESS: ${admin.name} issued a one-time ${r} enrollment code${hint ? ` for ${hint}` : ''}.`);
  }
);

/** Admin: void an enrollment code that has not been used yet (it was misplaced or sent to the wrong person). */
export const revoke_enrollment = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const admin = requireOperator(ctx, ['admin']);
  const enr = ctx.db.enrollmentStore.code.find(code.trim());
  if (!enr) throw new SenderError('no such enrollment code');
  if (enr.used_by !== '') throw new SenderError('that code is already used or revoked');
  ctx.db.enrollmentStore.code.update({ ...enr, used_by: `revoked by ${admin.name}` });
  logEvent(ctx, liveIncidentId(ctx), 'state', admin.name,
    `ACCESS: ${admin.name} voided an unused ${enr.role} enrollment code${enr.name_hint ? ` for ${enr.name_hint}` : ''}.`);
});

/**
 * Admin: add (or re-role, or reactivate) an identity that is already connected. The person reads
 * their identity off the sign-in screen to the admin over a channel the admin trusts.
 */
export const add_operator = spacetimedb.reducer(
  { identity_hex: t.string(), name: t.string(), role: t.string() },
  (ctx, { identity_hex, name, role }) => {
    const admin = requireOperator(ctx, ['admin']);
    const id = parseIdentity(identity_hex);
    const r = norm(role);
    if (!isIn(ROLES, r)) throw new SenderError(`role must be one of ${ROLES.join(', ')}`);
    const nm = cleanName(name, 'name');
    assertNameFree(ctx, nm, r, id);
    const existing = ctx.db.operatorStore.identity.find(id);
    if (existing && existing.active && existing.role === 'admin' && r !== 'admin' && activeAdmins(ctx).length <= 1) {
      throw new SenderError('cannot demote the last active admin');
    }
    const row = { identity: id, name: nm, role: r, added_by: admin.name, added_at: ctx.timestamp, active: true };
    if (existing) ctx.db.operatorStore.identity.update(row);
    else ctx.db.operatorStore.insert(row);
    const inc = liveIncidentId(ctx);
    logEvent(ctx, inc, 'state', admin.name,
      `ACCESS: ${admin.name} ${existing ? 'updated' : 'added'} ${nm} (${shortId(id)}) as ${r}.`);
    sysMessage(ctx, inc, '#command', `${nm} ${existing ? 'is now' : 'was added as'} ${r} (added by ${admin.name}).`);
  }
);

/** Admin: cut an identity off. It immediately stops receiving rows and can change nothing. The row stays for the audit trail. */
export const revoke_operator = spacetimedb.reducer({ identity_hex: t.string() }, (ctx, { identity_hex }) => {
  const admin = requireOperator(ctx, ['admin']);
  const id = parseIdentity(identity_hex);
  const target = ctx.db.operatorStore.identity.find(id);
  if (!target) throw new SenderError('no such operator');
  if (!target.active) throw new SenderError('that operator is already revoked');
  if (target.role === 'admin' && activeAdmins(ctx).length <= 1) {
    throw new SenderError('cannot revoke the last active admin');
  }
  ctx.db.operatorStore.identity.update({ ...target, active: false });
  const inc = liveIncidentId(ctx);
  logEvent(ctx, inc, 'state', admin.name, `ACCESS: ${admin.name} revoked ${target.name} (${shortId(id)}, ${target.role}).`);
  sysMessage(ctx, inc, '#command', `${target.name}'s access was revoked by ${admin.name}.`);
});

/** Admin or commander: mark a rostered person as verified (or not) on a channel the attacker cannot see. */
export const set_stakeholder_verified = spacetimedb.reducer(
  { name: t.string(), verified: t.bool() },
  (ctx, { name, verified }) => {
    const actor = requireOperator(ctx, CAN_COMMAND);
    const s = ctx.db.stakeholderStore.name.find(name.trim());
    if (!s) throw new SenderError(`no stakeholder named '${name}'`);
    ctx.db.stakeholderStore.name.update({ ...s, verified_out_of_band: verified });
    logEvent(ctx, liveIncidentId(ctx), 'state', actor.name,
      `ACCESS: ${actor.name} marked ${s.name} (${s.title}) ${verified ? 'verified' : 'NOT verified'} out-of-band.`);
  }
);

// ---------------------------------------------------------------------------
// Demo + agent reducers (role agent or admin)
// ---------------------------------------------------------------------------

/** Admin: wipe all incident data and reseed. Operators and enrollment codes are kept. */
export const reset_demo = spacetimedb.reducer(ctx => {
  const admin = requireOperator(ctx, ['admin']);
  resetAndSeed(ctx, admin.name);
});

/**
 * Sentry-side telemetry intake. Attached to the latest uncontained incident on
 * the same host/vm if there is one, otherwise incident_id = 0 (no incident yet).
 */
export const ingest_signal = spacetimedb.reducer(
  { source: t.string(), message: t.string(), host: t.string(), vm: t.string() },
  (ctx, { source, message, host, vm }) => {
    requireOperator(ctx, AGENT_OR_ADMIN);
    ctx.db.signalStore.insert({ id: 0n, at: ctx.timestamp, source, message, host, vm });
    const inc = latestActiveIncident(ctx, host.trim(), vm.trim());
    logEvent(ctx, inc ? inc.id : 0n, 'signal', source, message);
  }
);

/**
 * Open an incident (status open, blast_score 0) and mark a healthy host suspect. The incident starts
 * in NIST phase detection_analysis, adopts the unassigned scope inventory, and gets its placeholder
 * tasks, decisions and a first brief.
 */
export const open_incident = spacetimedb.reducer(
  { title: t.string(), severity: t.string(), host: t.string(), vm: t.string() },
  (ctx, { title, severity, host, vm }) => {
    requireOperator(ctx, AGENT_OR_ADMIN);
    const inc = ctx.db.incidentStore.insert({
      id: 0n,
      title,
      severity,
      host: host.trim(),
      vm: vm.trim(),
      status: 'open',
      opened_at: ctx.timestamp,
      contained_at: undefined,
      blast_score: 0,
      category: 'Unclassified (pending triage)',
      nist_phase: 'detection_analysis',
      functional_impact: 'Not yet assessed',
      information_impact: 'Not yet assessed',
      recoverability: 'Not yet assessed',
    });
    const h = findHost(ctx, inc.host);
    if (h && h.status === 'healthy') {
      ctx.db.hostStore.host.update({ ...h, status: 'suspect' });
    }
    logEvent(ctx, inc.id, 'incident', 'sentry',
      `Incident #${inc.id} opened [${severity}]: ${title} (host ${inc.host}, vm ${inc.vm})`);

    seedIncidentDocs(ctx, inc.id);
    const adopted = adoptDataAssets(ctx, inc.id);
    ctx.db.briefStore.insert({
      incident_id: inc.id,
      text: 'An incident was just opened. Scribe is preparing the first plain-language brief.',
      known: `An incident was opened on one server, ${inc.host}`,
      unknown: 'How far it went\nWhether any data was read',
      updated_at: ctx.timestamp,
      author: 'system',
    });
    logEvent(ctx, inc.id, 'state', 'system',
      `NIST SP 800-61 phase: detection_analysis. ${adopted} data assets in scope, 3 tasks and 2 standing decisions recorded.`);
  }
);

/** Upsert one agent's live status card. Does not write to the event log. */
export const set_agent_state = spacetimedb.reducer(
  { agent: t.string(), status: t.string(), thought: t.string(), model: t.string() },
  (ctx, { agent, status, thought, model }) => {
    requireOperator(ctx, AGENT_OR_ADMIN);
    const a = norm(agent);
    if (!isIn(AGENTS, a)) {
      throw new SenderError(`unknown agent '${agent}' (expected one of ${AGENTS.join(', ')})`);
    }
    const row = { agent: a, status, thought, model, updated_at: ctx.timestamp };
    if (ctx.db.agentStateStore.agent.find(a)) ctx.db.agentStateStore.agent.update(row);
    else ctx.db.agentStateStore.insert(row);
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
    requireOperator(ctx, AGENT_OR_ADMIN);
    const inc = requireIncident(ctx, incident_id);
    const who = norm(agent);
    ctx.db.findingStore.insert({ id: 0n, incident_id, agent: who, kind, text, at: ctx.timestamp });
    let suffix = '';
    if (Number.isFinite(blast_score) && blast_score >= 0) {
      ctx.db.incidentStore.id.update({ ...inc, blast_score });
      suffix = ` (blast_score ${blast_score})`;
    }
    logEvent(ctx, incident_id, 'finding', who, `[${kind}] ${text}${suffix}`);
  }
);

/**
 * THE POLICY GATE. An agent proposes an action; the policy table decides.
 *   auto      -> effect applied now, proposal.status = executed
 *                (quarantine_host under auto also marks the incident contained)
 *   approval  -> proposal.status = pending_approval, incident awaiting_approval,
 *                and a task for the commander is opened
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
    requireOperator(ctx, AGENT_OR_ADMIN);
    const inc = requireIncident(ctx, incident_id);
    const who = norm(agent);
    const act = norm(action);
    const tgt = target.trim() || defaultTarget(act, inc);

    // 1. Policy lookup. Fail closed: unknown action or malformed mode => deny.
    const pol = ctx.db.policyStore.action.find(act);
    const mode = pol && (pol.mode === 'auto' || pol.mode === 'approval') ? pol.mode : 'deny';

    const record = (status: string, decided_by: string) =>
      ctx.db.proposalStore.insert({
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
      logEvent(ctx, incident_id, 'blocked', who,
        `BLOCKED ${act} on ${tgt} (proposal #${p.id}): ${
          pol ? 'denied by policy' : 'not in policy table, denied by default'
        }. Reason given: ${reason}`);
      return;
    }

    // 3. Target sanity (hallucinated host/vm names must not silently "succeed").
    const bad = checkTarget(ctx, act, tgt);
    if (bad) {
      const p = record('blocked', 'policy');
      logEvent(ctx, incident_id, 'blocked', who, `BLOCKED ${act} on ${tgt} (proposal #${p.id}): ${bad}`);
      return;
    }

    // 4. Approval: park it for a human, and put it on the commander's task list.
    if (mode === 'approval') {
      const p = record('pending_approval', '');
      if (inc.status !== 'contained') {
        ctx.db.incidentStore.id.update({ ...inc, status: 'awaiting_approval' });
      }
      ctx.db.taskStore.insert({
        id: 0n,
        incident_id,
        title: `Approve ${actionVerb(act).toLowerCase()} of ${tgt}`,
        owner_role: 'commander',
        status: 'open',
        at: ctx.timestamp,
      });
      logEvent(ctx, incident_id, 'approval_requested', who,
        `Approval requested for ${act} on ${tgt} (proposal #${p.id}). Reason: ${reason}`);
      return;
    }

    // 5. Auto: apply now.
    const detail = applyEffect(ctx, inc, act, tgt);
    const p = record('executed', 'policy');
    logEvent(ctx, incident_id, 'action', who,
      `${act} on ${tgt} executed (proposal #${p.id}, auto${pol!.reversible ? ', reversible' : ''}): ${detail}. Reason: ${reason}`);
    // An operator can set quarantine_host to auto. The quarantine still contains the incident.
    if (act === 'quarantine_host') containIncident(ctx, inc, detail);
  }
);

/**
 * Human approval of a pending proposal. Only an admin or a commander can approve; an agent cannot.
 * The approver is the authenticated operator behind ctx.sender: the `operator` argument is kept only
 * so older callers still compile and is IGNORED, it is never used for attribution. Applies the
 * effect, records a decision ("Quarantine b14-gpu-07 approved by <name>") and closes the commander's
 * task. quarantine_host also marks the incident contained.
 */
export const approve = spacetimedb.reducer(
  { proposal_id: t.u64(), operator: t.string() },
  (ctx, { proposal_id }) => {
    const actor = requireOperator(ctx, CAN_COMMAND);
    const prop = ctx.db.proposalStore.id.find(proposal_id);
    if (!prop) throw new SenderError(`proposal ${proposal_id} not found`);
    if (prop.status !== 'pending_approval') {
      throw new SenderError(`proposal ${proposal_id} is '${prop.status}', only pending_approval can be approved`);
    }
    const inc = requireIncident(ctx, prop.incident_id);

    const bad = checkTarget(ctx, prop.action, prop.target);
    if (bad) throw new SenderError(`cannot apply ${prop.action}: ${bad}`);

    const detail = applyEffect(ctx, inc, prop.action, prop.target);
    ctx.db.proposalStore.id.update({ ...prop, status: 'approved', decided_by: actor.name });
    logEvent(ctx, inc.id, 'approval', actor.name,
      `${actor.name} approved ${prop.action} on ${prop.target} (proposal #${prop.id}, requested by ${prop.agent})`);
    ctx.db.decisionStore.insert({
      id: 0n,
      incident_id: inc.id,
      text: `${actionVerb(prop.action)} ${prop.target} approved by ${actor.name}`,
      by_name: actor.name,
      at: ctx.timestamp,
    });
    const taskTitle = `Approve ${actionVerb(prop.action).toLowerCase()} of ${prop.target}`;
    for (const tk of [...ctx.db.taskStore.iter()]) {
      if (tk.incident_id === inc.id && tk.title === taskTitle && tk.status !== 'done') {
        ctx.db.taskStore.id.update({ ...tk, status: 'done', at: ctx.timestamp });
      }
    }

    if (prop.action === 'quarantine_host') {
      containIncident(ctx, inc, detail);
    } else {
      // Not the containing step: fall back to open once nothing else is pending.
      const stillPending = [...ctx.db.proposalStore.iter()].some(
        p => p.incident_id === inc.id && p.status === 'pending_approval'
      );
      if (inc.status === 'awaiting_approval' && !stillPending) {
        ctx.db.incidentStore.id.update({ ...inc, status: 'open' });
      }
      logEvent(ctx, inc.id, 'state', 'system', detail);
    }
  }
);

/** Admin or commander: change (or create, non-reversible) a policy row. */
export const set_policy = spacetimedb.reducer(
  { action: t.string(), mode: t.string() },
  (ctx, { action, mode }) => {
    const actor = requireOperator(ctx, CAN_COMMAND);
    const act = norm(action);
    const m = norm(mode);
    if (!act) throw new SenderError('action is required');
    if (!isIn(POLICY_MODES, m)) throw new SenderError(`mode must be one of ${POLICY_MODES.join(', ')}`);
    const existing = ctx.db.policyStore.action.find(act);
    const before = existing ? existing.mode : '(none)';
    if (existing) {
      ctx.db.policyStore.action.update({ ...existing, mode: m });
    } else {
      ctx.db.policyStore.insert({ action: act, mode: m, reversible: false, note: 'Custom policy set by an operator.' });
    }
    logEvent(ctx, liveIncidentId(ctx), 'state', actor.name, `Policy changed: ${act} ${before} -> ${m} (by ${actor.name})`);
  }
);

/** Scribe's final forensic report. Upserts by incident_id. */
export const file_report = spacetimedb.reducer(
  { incident_id: t.u64(), summary: t.string() },
  (ctx, { incident_id, summary }) => {
    requireOperator(ctx, AGENT_OR_ADMIN);
    requireIncident(ctx, incident_id);
    const row = { incident_id, summary, filed_at: ctx.timestamp };
    if (ctx.db.reportStore.incident_id.find(incident_id)) ctx.db.reportStore.incident_id.update(row);
    else ctx.db.reportStore.insert(row);
    logEvent(ctx, incident_id, 'report', 'scribe', `Report filed for incident #${incident_id}`);
  }
);

// ---------------------------------------------------------------------------
// NIST SP 800-61 documentation: phase, classification, brief, decisions
// ---------------------------------------------------------------------------

/** Move the incident through the NIST lifecycle. Agents may only move forward; a commander or admin can set any phase. */
export const set_incident_phase = spacetimedb.reducer(
  { incident_id: t.u64(), phase: t.string() },
  (ctx, { incident_id, phase }) => {
    const actor = requireOperator(ctx, CAN_DOCUMENT);
    const inc = requireIncident(ctx, incident_id);
    const p = norm(phase);
    if (!isIn(PHASES, p)) throw new SenderError(`phase must be one of ${PHASES.join(', ')}`);
    if (actor.role === 'agent' && phaseRank(p) < phaseRank(inc.nist_phase)) {
      throw new SenderError(`agents can only move the phase forward (now ${inc.nist_phase})`);
    }
    if (p === inc.nist_phase) return;
    ctx.db.incidentStore.id.update({ ...inc, nist_phase: p });
    logEvent(ctx, inc.id, 'state', actor.name, `NIST SP 800-61 phase: ${inc.nist_phase} -> ${p} (by ${actor.name})`);
  }
);

/** NIST impact classification. An empty argument leaves that field as it is. */
export const set_incident_classification = spacetimedb.reducer(
  {
    incident_id: t.u64(),
    category: t.string(),
    functional_impact: t.string(),
    information_impact: t.string(),
    recoverability: t.string(),
  },
  (ctx, { incident_id, category, functional_impact, information_impact, recoverability }) => {
    const actor = requireOperator(ctx, CAN_DOCUMENT);
    const inc = requireIncident(ctx, incident_id);
    const pick = (v: string, old: string, what: string) => (v.trim() ? cleanText(v, what, 300) : old);
    const next = {
      ...inc,
      category: pick(category, inc.category, 'category'),
      functional_impact: pick(functional_impact, inc.functional_impact, 'functional_impact'),
      information_impact: pick(information_impact, inc.information_impact, 'information_impact'),
      recoverability: pick(recoverability, inc.recoverability, 'recoverability'),
    };
    ctx.db.incidentStore.id.update(next);
    logEvent(ctx, inc.id, 'state', actor.name,
      `Classification updated by ${actor.name}: category "${next.category}"; functional ${next.functional_impact}; information ${next.information_impact}; recoverability ${next.recoverability}.`);
  }
);

/**
 * The plain-language brief for people who are not engineers: what is happening, what we know, what we
 * do not know yet. One per incident (incident 0 = the quiet-state brief). Agents write as 'scribe'.
 */
export const set_brief = spacetimedb.reducer(
  { incident_id: t.u64(), text: t.string(), known: t.string(), unknown: t.string() },
  (ctx, { incident_id, text, known, unknown }) => {
    const actor = requireOperator(ctx, CAN_DOCUMENT);
    requireIncidentOrRoom(ctx, incident_id);
    const author = actor.role === 'agent' ? 'scribe' : actor.name;
    const row = {
      incident_id,
      text: cleanText(text, 'text', 1500),
      known: cleanText(known, 'known', 1500, true),
      unknown: cleanText(unknown, 'unknown', 1500, true),
      updated_at: ctx.timestamp,
      author,
    };
    if (ctx.db.briefStore.incident_id.find(incident_id)) ctx.db.briefStore.incident_id.update(row);
    else ctx.db.briefStore.insert(row);
    logEvent(ctx, incident_id, 'state', author, `Brief updated by ${author}.`);
  }
);

/** A decision of record ("Incident Commander assumed command", "Hold the public statement"). */
export const record_decision = spacetimedb.reducer(
  { incident_id: t.u64(), text: t.string() },
  (ctx, { incident_id, text }) => {
    const actor = requireOperator(ctx, ['admin', 'commander', 'legal', 'exec']);
    requireIncident(ctx, incident_id);
    const body = cleanText(text, 'decision', 500);
    ctx.db.decisionStore.insert({ id: 0n, incident_id, text: body, by_name: actor.name, at: ctx.timestamp });
    logEvent(ctx, incident_id, 'state', actor.name, `Decision recorded by ${actor.name}: ${body}`);
  }
);

// ---------------------------------------------------------------------------
// War room: messages, tasks, scope
// ---------------------------------------------------------------------------

/**
 * Post to a channel. Any active operator whose role may use that channel (the author is read from the
 * operator row, never from an argument). incident_id 0 is the standing room.
 */
export const post_message = spacetimedb.reducer(
  { incident_id: t.u64(), channel: t.string(), text: t.string() },
  (ctx, { incident_id, channel, text }) => {
    const op = requireOperator(ctx);
    const ch = channel.trim();
    const allowed = POST_CHANNEL[ch];
    if (!allowed) throw new SenderError(`unknown channel '${channel}' (use ${CHANNELS.join(', ')})`);
    if (!allowed.includes(op.role)) throw new SenderError(`role '${op.role}' may not post in ${ch}`);
    requireIncidentOrRoom(ctx, incident_id);
    ctx.db.messageStore.insert({
      id: 0n,
      incident_id,
      channel: ch,
      author_name: op.name,
      author_role: op.role,
      kind: op.role === 'agent' ? 'agent' : 'human',
      text: cleanText(text, 'message', 2000),
      at: ctx.timestamp,
    });
  }
);

/**
 * Agent-only: speak as one of the four agents (sentry, triage, warden, scribe) so the war room shows
 * who said what. A human can never use this, so nobody can pose as Warden.
 */
export const post_agent_message = spacetimedb.reducer(
  { incident_id: t.u64(), channel: t.string(), agent: t.string(), text: t.string() },
  (ctx, { incident_id, channel, agent, text }) => {
    requireOperator(ctx, ['agent']);
    const ch = channel.trim();
    if (!isIn(CHANNELS, ch)) throw new SenderError(`unknown channel '${channel}' (use ${CHANNELS.join(', ')})`);
    const a = norm(agent);
    if (!isIn(AGENTS, a)) throw new SenderError(`unknown agent '${agent}' (expected one of ${AGENTS.join(', ')})`);
    requireIncidentOrRoom(ctx, incident_id);
    ctx.db.messageStore.insert({
      id: 0n,
      incident_id,
      channel: ch,
      author_name: a,
      author_role: 'agent',
      kind: 'agent',
      text: cleanText(text, 'message', 2000),
      at: ctx.timestamp,
    });
  }
);

/** Add a task for a role. Everyone inside the company can; a vendor cannot. */
export const add_task = spacetimedb.reducer(
  { incident_id: t.u64(), title: t.string(), owner_role: t.string() },
  (ctx, { incident_id, title, owner_role }) => {
    const op = requireOperator(ctx, INTERNAL);
    requireIncident(ctx, incident_id);
    const r = norm(owner_role);
    if (!isIn(ROLES, r)) throw new SenderError(`owner_role must be one of ${ROLES.join(', ')}`);
    const ttl = cleanText(title, 'title', 200);
    ctx.db.taskStore.insert({ id: 0n, incident_id, title: ttl, owner_role: r, status: 'open', at: ctx.timestamp });
    logEvent(ctx, incident_id, 'state', op.name, `Task added by ${op.name} for ${r}: ${ttl}`);
  }
);

/** open | doing | done. A vendor can update only the tasks owned by 'vendor'. */
export const set_task_status = spacetimedb.reducer(
  { id: t.u64(), status: t.string() },
  (ctx, { id, status }) => {
    const op = requireOperator(ctx);
    const task = ctx.db.taskStore.id.find(id);
    // Same answer whether the task is missing or hidden from this role.
    if (!task || !(INTERNAL.includes(op.role) || task.owner_role === op.role)) {
      throw new SenderError(`task ${id} not found`);
    }
    const s = norm(status);
    if (!isIn(TASK_STATUSES, s)) throw new SenderError(`status must be one of ${TASK_STATUSES.join(', ')}`);
    if (task.status === s) return;
    ctx.db.taskStore.id.update({ ...task, status: s, at: ctx.timestamp });
    logEvent(ctx, task.incident_id, 'state', op.name, `Task "${task.title}" ${task.status} -> ${s} (by ${op.name})`);
  }
);

/**
 * Scope: change the status of a data asset (locked, exfiltrated, restored, ...). An agent can say
 * 'accessed' or 'exfil_suspected', but only a human can confirm exfiltration or declare it restored.
 * An empty note keeps the old one.
 */
export const set_asset_status = spacetimedb.reducer(
  { id: t.u64(), status: t.string(), note: t.string() },
  (ctx, { id, status, note }) => {
    const op = requireOperator(ctx, SCOPE_WRITERS);
    const a = ctx.db.dataAssetStore.id.find(id);
    if (!a) throw new SenderError(`data asset ${id} not found`);
    const s = norm(status);
    if (!isIn(ASSET_STATUSES, s)) throw new SenderError(`status must be one of ${ASSET_STATUSES.join(', ')}`);
    if (op.role === 'agent' && HUMAN_ONLY_ASSET_STATUSES.includes(s)) {
      throw new SenderError(`agents cannot set '${s}': a human must confirm it`);
    }
    const nt = cleanText(note, 'note', 500, true);
    ctx.db.dataAssetStore.id.update({
      ...a, status: s, note: nt || a.note, updated_by: op.name, updated_at: ctx.timestamp,
    });
    logEvent(ctx, a.incident_id, 'state', op.name, `Scope: ${a.name} ${a.status} -> ${s} (by ${op.name})${nt ? `: ${nt}` : ''}`);
  }
);
