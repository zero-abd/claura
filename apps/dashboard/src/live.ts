// Live connection to the SpacetimeDB module the agents write to (backend/spacetime).
// Everything else in the console is a scripted replay; this file is the only part that reads real rows
// and calls real reducers. Bindings in ./module_bindings are generated from the module (see README §11).
import type { DbConnection } from "./module_bindings";

export type LiveStatus = "off" | "connecting" | "live" | "error";

export const live = {
  status: "off" as LiveStatus,
  error: "",
  uri: "ws://127.0.0.1:3000",
  db: "claura",
  /** Bumps on every row change and every status change, so the view re-renders only when something moved. */
  version: 0,
  /** Outcome of the last action taken from the console. */
  notice: null as null | { tone: "safe" | "hot"; text: string },
  busy: false,
};

let conn: DbConnection | null = null;
let gen = 0;

const bump = () => void live.version++;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const byId = <T extends { id: bigint }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function tsMs(ts: { toDate(): Date } | undefined | null): number {
  return ts ? ts.toDate().getTime() : 0;
}

export async function connect(uri = live.uri, db = live.db): Promise<void> {
  conn?.disconnect();
  conn = null;
  const mine = ++gen;
  Object.assign(live, { uri, db, status: "connecting", error: "", notice: null });
  bump();

  const fail = (text: string) => {
    if (mine !== gen) return;
    live.status = "error";
    live.error = text;
    conn = null;
    bump();
  };

  // The SDK loads only when someone connects, so the scripted replay stays light.
  let DbConnection: typeof import("./module_bindings").DbConnection;
  try {
    ({ DbConnection } = await import("./module_bindings"));
  } catch (e) {
    return fail(`Could not load the SpacetimeDB client: ${msg(e)}`);
  }
  if (mine !== gen) return;

  DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(db)
    .onConnect((c) => {
      if (mine !== gen) return void c.disconnect();
      conn = c;
      for (const table of [c.db.incident, c.db.proposal, c.db.incidentEvent, c.db.agentState, c.db.report]) {
        table.onInsert(bump);
        table.onDelete(bump);
        table.onUpdate(bump);
      }
      c.subscriptionBuilder()
        .onApplied(() => {
          if (mine !== gen) return;
          live.status = "live";
          bump();
        })
        .onError(() => fail("The subscription was rejected. Is the module published under this name?"))
        .subscribeToAllTables();
    })
    .onConnectError((_c, e) => fail(`Could not connect: ${msg(e)}. Is "spacetime start" running?`))
    .onDisconnect(() => {
      if (mine === gen && live.status !== "error") fail("Disconnected from SpacetimeDB.");
    })
    .build();
}

export function snapshot() {
  const c = conn;
  if (!c || live.status !== "live") return null;
  const incident = [...c.db.incident.iter()].sort(byId).at(-1) ?? null;
  if (!incident) return { incident, proposals: [], events: [], agents: [...c.db.agentState.iter()], report: null };
  const proposals = [...c.db.proposal.iter()].filter((p) => p.incidentId === incident.id).sort(byId);
  // Signals land before the incident exists (incident_id 0); they belong to its story too.
  const events = [...c.db.incidentEvent.iter()]
    .filter((e) => e.incidentId === incident.id || (e.incidentId === 0n && e.kind === "signal"))
    .sort(byId)
    .reverse();
  const report = [...c.db.report.iter()].find((r) => r.incidentId === incident.id) ?? null;
  return { incident, proposals, events, agents: [...c.db.agentState.iter()], report };
}

export type Snapshot = NonNullable<ReturnType<typeof snapshot>>;

export const pendingQuarantine = (s: Snapshot | null) =>
  s?.proposals.find((p) => p.action === "quarantine_host" && p.status === "pending_approval") ?? null;

async function run(fn: (c: DbConnection) => Promise<string>): Promise<void> {
  if (!conn || live.busy) return;
  live.busy = true;
  bump();
  try {
    live.notice = { tone: "safe", text: await fn(conn) };
  } catch (e) {
    live.notice = { tone: "hot", text: `Refused by SpacetimeDB: ${msg(e)}` };
  } finally {
    live.busy = false;
    bump();
  }
}

/** Approve the held quarantine. The module rejects agent names, so approving "as warden" shows the guard. */
export function approve(operator: string): Promise<void> {
  return run(async (c) => {
    const p = pendingQuarantine(snapshot());
    if (!p) throw new Error("there is no quarantine waiting for approval");
    await c.reducers.approve({ proposalId: p.id, operator });
    return `${operator} approved quarantine_host on ${p.target}.`;
  });
}

/** Ask for an action the policy denies. The gate records it as blocked instead of running it. */
export function proposeReimage(): Promise<void> {
  return run(async (c) => {
    const inc = snapshot()?.incident;
    if (!inc) throw new Error("there is no incident to act on");
    await c.reducers.proposeAction({
      incidentId: inc.id,
      agent: "warden",
      action: "reimage_host",
      target: inc.host,
      reason: "Requested from the console to test the policy gate.",
    });
    const p = [...c.db.proposal.iter()].filter((r) => r.action === "reimage_host").sort(byId).at(-1);
    return p?.status === "blocked"
      ? `Policy blocked reimage_host on ${p.target}. Nothing ran.`
      : `reimage_host was recorded as ${p?.status ?? "unknown"}.`;
  });
}
