/*
 * Claura schema.
 *
 * Every table here is PRIVATE (the *_store tables). Nothing is readable by an arbitrary
 * connection: clients read through the per-user gated views in views.ts, which return rows
 * only to an active, enrolled operator and only the rows that operator's role may see.
 * A stranger who connects to the database (assume the attacker has every internal system)
 * subscribes to the views and receives zero rows.
 *
 * The views keep the original table names (host, guest_vm, incident, message, ...), so a
 * client still writes conn.db.incident / conn.db.guestVm.
 */
import {
  schema,
  table,
  t,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

// ---------------------------------------------------------------------------
// Fleet + incident response (the original tables, now private stores)
// ---------------------------------------------------------------------------

export const hostTable = table(
  { name: 'host_store' },
  {
    host: t.string().primaryKey(),
    hall: t.string(),
    rack: t.string(),
    /** healthy | suspect | cordoned | quarantined */
    status: t.string(),
  }
);

export const guestVmTable = table(
  { name: 'guest_vm_store' },
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

export const signalTable = table(
  { name: 'signal_store' },
  {
    id: t.u64().primaryKey().autoInc(),
    at: t.timestamp(),
    source: t.string(),
    message: t.string(),
    host: t.string(),
    vm: t.string(),
  }
);

export const incidentTable = table(
  { name: 'incident_store' },
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
    // ---- NIST SP 800-61 documentation fields ----
    /** Incident category (NIST 800-61 attack vectors / categories), free text. */
    category: t.string(),
    /** detection_analysis | containment | eradication | recovery | post_incident */
    nist_phase: t.string(),
    /** NIST functional impact: None | Low | Medium | High, then a short reason. */
    functional_impact: t.string(),
    /** NIST information impact: None | Privacy breach | Proprietary breach | Integrity loss, then a short reason. */
    information_impact: t.string(),
    /** NIST recoverability: Regular | Supplemented | Extended | Not recoverable, then a short reason. */
    recoverability: t.string(),
  }
);

export const agentStateTable = table(
  { name: 'agent_state_store' },
  {
    /** sentry | triage | warden | scribe */
    agent: t.string().primaryKey(),
    status: t.string(),
    thought: t.string(),
    model: t.string(),
    updated_at: t.timestamp(),
  }
);

export const findingTable = table(
  { name: 'finding_store' },
  {
    id: t.u64().primaryKey().autoInc(),
    incident_id: t.u64(),
    agent: t.string(),
    kind: t.string(),
    text: t.string(),
    at: t.timestamp(),
  }
);

export const policyTable = table(
  { name: 'policy_store' },
  {
    action: t.string().primaryKey(),
    /** auto | approval | deny */
    mode: t.string(),
    reversible: t.bool(),
    note: t.string(),
  }
);

export const proposalTable = table(
  { name: 'proposal_store' },
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
    /** '' while undecided; 'policy' for auto/blocked; the approving operator's name once approved. */
    decided_by: t.string(),
  }
);

export const incidentEventTable = table(
  { name: 'incident_event_store' },
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

export const reportTable = table(
  { name: 'report_store' },
  {
    incident_id: t.u64().primaryKey(),
    summary: t.string(),
    filed_at: t.timestamp(),
  }
);

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export const operatorTable = table(
  { name: 'operator_store' },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    /** admin | commander | legal | exec | comms | vendor | responder | agent */
    role: t.string(),
    /** Who vouched for this identity: 'publisher', an admin's name, or 'code issued by <admin>'. */
    added_by: t.string(),
    added_at: t.timestamp(),
    /** false = revoked: sees nothing and can change nothing. The row stays for the audit trail. */
    active: t.bool(),
  }
);

export const enrollmentTable = table(
  { name: 'enrollment_store' },
  {
    code: t.string().primaryKey(),
    role: t.string(),
    name_hint: t.string(),
    created_by: t.string(),
    created_at: t.timestamp(),
    /** '' = unused. Otherwise "<name> (<identity prefix>)" of who consumed it, or 'revoked by <admin>'. */
    used_by: t.string(),
  }
);

// ---------------------------------------------------------------------------
// War room: out-of-band communications and incident documentation
// ---------------------------------------------------------------------------

export const messageTable = table(
  { name: 'message_store' },
  {
    id: t.u64().primaryKey().autoInc(),
    /** 0 = the standing room (no incident). */
    incident_id: t.u64(),
    /** #command | #legal | #exec | #comms-pr | #vendors */
    channel: t.string(),
    author_name: t.string(),
    author_role: t.string(),
    /** human | agent | system */
    kind: t.string(),
    text: t.string(),
    at: t.timestamp(),
  }
);

export const taskTable = table(
  { name: 'task_store' },
  {
    id: t.u64().primaryKey().autoInc(),
    incident_id: t.u64(),
    title: t.string(),
    owner_role: t.string(),
    /** open | doing | done */
    status: t.string(),
    at: t.timestamp(),
  }
);

export const decisionTable = table(
  { name: 'decision_store' },
  {
    id: t.u64().primaryKey().autoInc(),
    incident_id: t.u64(),
    text: t.string(),
    by_name: t.string(),
    at: t.timestamp(),
  }
);

export const briefTable = table(
  { name: 'brief_store' },
  {
    /** 0 = the quiet-state brief shown while no incident is open. */
    incident_id: t.u64().primaryKey(),
    /** Plain language, for people who are not engineers. */
    text: t.string(),
    /** One fact per line. */
    known: t.string(),
    /** One open question per line. */
    unknown: t.string(),
    updated_at: t.timestamp(),
    author: t.string(),
  }
);

export const dataAssetTable = table(
  { name: 'data_asset_store' },
  {
    id: t.u64().primaryKey().autoInc(),
    /** 0 = in the inventory but not yet assigned; open_incident adopts these into the new incident. */
    incident_id: t.u64(),
    name: t.string(),
    system: t.string(),
    /** restricted | confidential | internal */
    classification: t.string(),
    records: t.u64(),
    /** intact | accessed | exfil_suspected | exfil_confirmed | locked_ransomware | restored | evidence_preserved */
    status: t.string(),
    note: t.string(),
    updated_by: t.string(),
    updated_at: t.timestamp(),
  }
);

/** People the war room expects, shown as a roster. NOT identities: nobody can sign in as a stakeholder row. */
export const stakeholderTable = table(
  { name: 'stakeholder_store' },
  {
    name: t.string().primaryKey(),
    /** The operator role this person would enroll with. */
    role: t.string(),
    initials: t.string(),
    /** Job title, e.g. 'Incident Commander'. */
    title: t.string(),
    /** true once their identity was confirmed on a channel the attacker cannot see (in person, a known phone). */
    verified_out_of_band: t.bool(),
  }
);

const spacetimedb = schema({
  hostStore: hostTable,
  guestVmStore: guestVmTable,
  signalStore: signalTable,
  incidentStore: incidentTable,
  agentStateStore: agentStateTable,
  findingStore: findingTable,
  policyStore: policyTable,
  proposalStore: proposalTable,
  incidentEventStore: incidentEventTable,
  reportStore: reportTable,
  operatorStore: operatorTable,
  enrollmentStore: enrollmentTable,
  messageStore: messageTable,
  taskStore: taskTable,
  decisionStore: decisionTable,
  briefStore: briefTable,
  dataAssetStore: dataAssetTable,
  stakeholderStore: stakeholderTable,
});
export default spacetimedb;

export type Db = InferSchema<typeof spacetimedb>;
export type Ctx = ReducerCtx<Db>;
