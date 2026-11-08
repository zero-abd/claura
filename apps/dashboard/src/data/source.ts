// The one seam between the console and its data.
//
// Every view reads through `data()`. Today that is the ScriptedSource (time-synced with the incident engine, shaped
// exactly like the SpacetimeDB tables). A LiveSource drops in with `setDataSource(new LiveSource(conn))` (or
// `window.claura.setDataSource(...)`), and no view code changes.
//
// ---------------------------------------------------------------- LiveSource cheat sheet
// getter              <- table / derivation                             writer (reducer)
// incident()          <- newest `incident` row (+ the 5 new columns)
// operators()         <- `operator`                                      addOperator   -> add_operator(identity_hex, name, role)
// enrollments()       <- `enrollment`                                    issueEnrollment -> issue_enrollment(code, role, name_hint)
// stakeholders()      <- `stakeholder` (display rows)                    revokeOperator -> revoke_operator(identity_hex)
// presence()          <- latest `message.at` per author, or a presence   (the module has no presence table: return {} and the
//                        table if added later                             UI shows "last seen" from messages only)
// messages(ch)        <- `message` where channel = ch, ordered by id     postMessage   -> post_message(incident_id, channel, text)
// tasks()             <- `task`                                          addTask / setTaskStatus -> add_task / set_task_status
// decisions()         <- `decision`
// brief()             <- `brief`
// assets()            <- `data_asset`                                    setAssetStatus -> set_asset_status(id, status, note)
// events()            <- `incident_event`
// proposals()         <- `proposal` joined with `policy` for `reversible`
// evidence()          <- not in the contract yet (a table with sha256 + custody, or parse `finding`)
// me()                <- the `operator` row whose identity is the connection identity
// Pending decisions: the UI derives "waiting for the Incident Commander" from incident().status === "awaiting_approval".
import type {
  AssetStatus,
  Brief,
  ChannelId,
  Decision,
  DataAsset,
  Enrollment,
  EvidenceItem,
  IncidentEvent,
  IncidentRow,
  Me,
  Message,
  Operator,
  OperatorRole,
  Presence,
  Proposal,
  Result,
  Stakeholder,
  Task,
  TaskStatus,
  Ts,
} from "./types";

export interface Capabilities {
  /** can an admin cancel an unused enrollment code? (needs a revoke_enrollment reducer the contract does not have yet) */
  cancelEnrollment: boolean;
  /** can anyone add a task from the War Room? */
  addTask: boolean;
}

export interface DataSource {
  readonly kind: "scripted" | "live";
  readonly can: Capabilities;
  /** Changes whenever anything the views read changed. Views key their markup on it so they never rebuild needlessly. */
  version(): number;
  /** "Now" for relative times. Scripted: the incident clock. Live: Date.now(). */
  now(): Ts;
  me(): Me;

  incident(): IncidentRow | null;
  operators(): Operator[];
  enrollments(): Enrollment[];
  stakeholders(): Stakeholder[];
  presence(): Record<string, Presence>;

  messages(channel: ChannelId): Message[];
  tasks(): Task[];
  decisions(): Decision[];
  brief(): Brief | null;
  assets(): DataAsset[];
  events(): IncidentEvent[];
  proposals(): Proposal[];
  evidence(): EvidenceItem[];

  postMessage(channel: ChannelId, text: string): Result;
  addTask(title: string, ownerRole: string): Result;
  setTaskStatus(id: number, status: TaskStatus): Result;
  setAssetStatus(id: number, status: AssetStatus, note: string): Result;
  issueEnrollment(code: string, role: OperatorRole, nameHint: string): Result;
  cancelEnrollment?(code: string): Result;
  addOperator(identityHex: string, name: string, role: OperatorRole): Result;
  revokeOperator(identityHex: string): Result;
  /** Scripted only: forget everything a viewer changed, so a recording can start clean. */
  reset?(): void;
}

let current: DataSource | null = null;
const factories = new Map<string, () => DataSource | Promise<DataSource>>();

export function data(): DataSource {
  if (!current) throw new Error("no data source selected (see src/data/index.ts)");
  return current;
}
export function setDataSource(s: DataSource) {
  current = s;
}
export function registerSource(name: string, make: () => DataSource | Promise<DataSource>) {
  factories.set(name, make);
}
export async function selectSource(name: string): Promise<boolean> {
  const make = factories.get(name);
  if (!make) return false;
  current = await make();
  return true;
}
