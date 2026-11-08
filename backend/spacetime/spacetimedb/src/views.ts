/*
 * Gated views: the ONLY way a client reads data.
 *
 * Every table is private. A view runs once per connected identity (ctx.sender), looks that identity
 * up in operator_store, and returns rows only if it is an ACTIVE operator whose role may see them.
 * A stranger who connects, and an operator who is revoked, get an empty result. When an operator
 * is enrolled, revoked or re-roled, the views are re-evaluated and the client's cache fills or
 * empties live.
 *
 * The export name of a view is what becomes the client accessor (conn.db.guestVm), so each export
 * is the camelCase of the view's SQL name. The SQL name keeps the original table name.
 *
 * Read matrix:
 *   host, guest_vm, signal, finding, policy, proposal, incident_event, agent_state   core (admin, commander, responder, agent)
 *   incident, brief, decision, data_asset                                            core + legal, exec, comms
 *   report                                                                           core + legal
 *   message          per channel (READ_CHANNEL in lib.ts)
 *   task             core + legal, exec, comms see all; a vendor sees only tasks owned by 'vendor'
 *   operator         internal roles see the roster (only admins see revoked rows); a vendor sees only itself
 *   enrollment       admin only (the codes are secrets)
 *   stakeholder      every active operator
 */
import { t, type ViewCtx } from 'spacetimedb/server';
import spacetimedb, {
  type Db,
  agentStateTable,
  briefTable,
  dataAssetTable,
  decisionTable,
  enrollmentTable,
  findingTable,
  guestVmTable,
  hostTable,
  incidentEventTable,
  incidentTable,
  messageTable,
  operatorTable,
  policyTable,
  proposalTable,
  reportTable,
  signalTable,
  stakeholderTable,
  taskTable,
} from './schema';
import { CORE, INTERNAL, READ_CHANNEL, ROLES, type OperatorRow } from './lib';

type VCtx = ViewCtx<Db>;
const ANY: readonly string[] = ROLES;
const CORE_LEGAL: readonly string[] = [...CORE, 'legal'];

/** The caller as an active operator whose role is in `roles`; otherwise null and the view returns nothing. */
function viewer(ctx: VCtx, roles: readonly string[]): OperatorRow | null {
  const op = ctx.db.operatorStore.identity.find(ctx.sender);
  return op && op.active && roles.includes(op.role) ? op : null;
}

// ---- core only -------------------------------------------------------------

export const host = spacetimedb.view({ name: 'host', public: true }, t.array(hostTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.hostStore.iter()] : []
);

export const guestVm = spacetimedb.view({ name: 'guest_vm', public: true }, t.array(guestVmTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.guestVmStore.iter()] : []
);

export const signal = spacetimedb.view({ name: 'signal', public: true }, t.array(signalTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.signalStore.iter()] : []
);

export const agentState = spacetimedb.view({ name: 'agent_state', public: true }, t.array(agentStateTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.agentStateStore.iter()] : []
);

export const finding = spacetimedb.view({ name: 'finding', public: true }, t.array(findingTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.findingStore.iter()] : []
);

export const policy = spacetimedb.view({ name: 'policy', public: true }, t.array(policyTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.policyStore.iter()] : []
);

export const proposal = spacetimedb.view({ name: 'proposal', public: true }, t.array(proposalTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.proposalStore.iter()] : []
);

export const incidentEvent = spacetimedb.view({ name: 'incident_event', public: true }, t.array(incidentEventTable.rowType), ctx =>
  viewer(ctx, CORE) ? [...ctx.db.incidentEventStore.iter()] : []
);

// ---- core + legal / exec / comms -------------------------------------------

export const incident = spacetimedb.view({ name: 'incident', public: true }, t.array(incidentTable.rowType), ctx =>
  viewer(ctx, INTERNAL) ? [...ctx.db.incidentStore.iter()] : []
);

export const brief = spacetimedb.view({ name: 'brief', public: true }, t.array(briefTable.rowType), ctx =>
  viewer(ctx, INTERNAL) ? [...ctx.db.briefStore.iter()] : []
);

export const decision = spacetimedb.view({ name: 'decision', public: true }, t.array(decisionTable.rowType), ctx =>
  viewer(ctx, INTERNAL) ? [...ctx.db.decisionStore.iter()] : []
);

export const dataAsset = spacetimedb.view({ name: 'data_asset', public: true }, t.array(dataAssetTable.rowType), ctx =>
  viewer(ctx, INTERNAL) ? [...ctx.db.dataAssetStore.iter()] : []
);

export const report = spacetimedb.view({ name: 'report', public: true }, t.array(reportTable.rowType), ctx =>
  viewer(ctx, CORE_LEGAL) ? [...ctx.db.reportStore.iter()] : []
);

// ---- row-level rules -------------------------------------------------------

export const message = spacetimedb.view({ name: 'message', public: true }, t.array(messageTable.rowType), ctx => {
  const op = viewer(ctx, ANY);
  if (!op) return [];
  return [...ctx.db.messageStore.iter()].filter(m => (READ_CHANNEL[m.channel] ?? []).includes(op.role));
});

export const task = spacetimedb.view({ name: 'task', public: true }, t.array(taskTable.rowType), ctx => {
  const op = viewer(ctx, ANY);
  if (!op) return [];
  const all = [...ctx.db.taskStore.iter()];
  return INTERNAL.includes(op.role) ? all : all.filter(x => x.owner_role === op.role);
});

export const operator = spacetimedb.view({ name: 'operator', public: true }, t.array(operatorTable.rowType), ctx => {
  const op = viewer(ctx, ANY);
  if (!op) return [];
  const all = [...ctx.db.operatorStore.iter()];
  if (op.role === 'admin') return all;
  if (INTERNAL.includes(op.role)) return all.filter(o => o.active);
  return all.filter(o => o.identity.equals(op.identity));
});

export const enrollment = spacetimedb.view({ name: 'enrollment', public: true }, t.array(enrollmentTable.rowType), ctx =>
  viewer(ctx, ['admin']) ? [...ctx.db.enrollmentStore.iter()] : []
);

export const stakeholder = spacetimedb.view({ name: 'stakeholder', public: true }, t.array(stakeholderTable.rowType), ctx =>
  viewer(ctx, ANY) ? [...ctx.db.stakeholderStore.iter()] : []
);
