// LiveSource: the console's data layer on the SpacetimeDB module "claura" (Maincloud by default, or the local appliance).
//
// It connects with the generated bindings (src/module_bindings), keeps the bearer token per server + database in
// localStorage, subscribes to every role-gated view with subscribeToAllTables(), and maps the rows to the models in
// ./types, so the views never know which source is active (see ./source.ts). Writers call the module's reducers; the
// module checks the caller's role on every one, so the pre-checks here only exist to answer fast and in plain words.
//
// A stranger (or a revoked operator) connects fine and receives zero rows: `access()` is then "needs-code" and the
// console shows the break-glass sheet (views/join.ts). Enrolling is one reducer call; rows then arrive live.
import { DbConnection } from "../module_bindings";
import type { Capabilities, DataSource } from "./source";
import { OK, fail } from "./types";
import type {
  AssetStatus,
  Brief,
  ChannelId,
  Classification,
  DataAsset,
  Decision,
  Enrollment,
  EvidenceItem,
  IncidentEvent,
  IncidentRow,
  Me,
  Message,
  NistPhase,
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
import { NIST_PHASES } from "./types";
import { PHASE, canApprove, roleLabel } from "./format";

// ------------------------------------------------------------------ which server
export interface LiveServer {
  id: "maincloud" | "local" | "custom";
  uri: string;
  db: string;
  /** "SpacetimeDB Maincloud", "local appliance" */
  label: string;
}
const MAINCLOUD = "wss://maincloud.spacetimedb.com";
const LOCAL = "ws://127.0.0.1:3000";
// A URL parameter may only point at the known servers: a crafted link must never be able to send a person's
// break-glass code (or bearer token) to a server of someone else's choosing. Any other address needs a build-time env.
const SAFE_URI = /^(wss?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{2,5})?|wss:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.spacetimedb\.com)\/?$/i;

export function resolveServer(q: URLSearchParams): LiveServer {
  const env = import.meta.env as Record<string, string | undefined>;
  let uri = env.VITE_CLAURA_STDB_URI || MAINCLOUD;
  let db = env.VITE_CLAURA_STDB_DB || "claura";
  const want = (q.get("stdb") ?? "").trim();
  if (want === "local") uri = LOCAL;
  else if (want === "maincloud") uri = MAINCLOUD;
  else if (want) {
    if (SAFE_URI.test(want)) uri = want.replace(/\/$/, "");
    else console.warn("[claura] ignoring ?stdb=: only 'local', 'maincloud', a loopback address or a *.spacetimedb.com address is accepted from the URL");
  }
  const dbq = (q.get("db") ?? "").trim();
  if (/^[A-Za-z0-9_-]{1,64}$/.test(dbq)) db = dbq;
  const id: LiveServer["id"] = uri === MAINCLOUD ? "maincloud" : /127\.0\.0\.1|localhost|\[::1\]/.test(uri) ? "local" : "custom";
  const label = id === "maincloud" ? "SpacetimeDB Maincloud" : id === "local" ? "local appliance" : uri.replace(/^wss?:\/\//, "");
  return { id, uri, db, label };
}

// ------------------------------------------------------------------ token storage (per server + database)
const tokenKey = (s: LiveServer) => `claura.token:${s.uri}/${s.db}`;
function readToken(key: string): string | undefined {
  try {
    return localStorage.getItem(key) || undefined;
  } catch {
    return undefined; // private window / blocked storage: a new identity every load, which the join sheet explains
  }
}
function writeToken(key: string, token: string) {
  try {
    localStorage.setItem(key, token);
  } catch {
    /* ignore */
  }
}
function forgetToken(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ raw rows (what the bindings hand us)
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TABLES = [
  "host",
  "guestVm",
  "signal",
  "agentState",
  "finding",
  "policy",
  "proposal",
  "incidentEvent",
  "incident",
  "brief",
  "decision",
  "dataAsset",
  "report",
  "message",
  "task",
  "operator",
  "enrollment",
  "stakeholder",
] as const;
type TableName = (typeof TABLES)[number];

/** SDK Timestamp | bigint micros | Date | number -> epoch milliseconds. Missing -> 0. */
export function tsMs(ts: unknown): Ts {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === "bigint") return Number(ts / 1000n);
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  const o = ts as { toDate?: () => Date; microsSinceUnixEpoch?: bigint; __timestamp_micros_since_unix_epoch__?: bigint };
  if (typeof o.toDate === "function") return o.toDate().getTime();
  const micros = o.microsSinceUnixEpoch ?? o.__timestamp_micros_since_unix_epoch__;
  return typeof micros === "bigint" ? Number(micros / 1000n) : 0;
}
const num = (x: unknown) => Number(x ?? 0);
const hexOf = (id: unknown) => (id as { toHexString(): string }).toHexString();
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const AGENTS = new Set(["sentry", "triage", "warden", "scribe"]);
const agentCase = (name: string) => (AGENTS.has(name.toLowerCase()) ? cap(name.toLowerCase()) : name);
const errText = (e: unknown): string => {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  return m.replace(/^(Error|SenderError):\s*/i, "").trim() || "request failed";
};

/** Who may post where (mirrors POST_CHANNEL in the module, so the console can say no before a round trip). */
const CORE = ["admin", "commander", "responder", "agent"];
const POST: Record<ChannelId, string[]> = {
  "#command": CORE,
  "#legal": ["admin", "commander", "legal", "agent"],
  "#exec": ["admin", "commander", "exec", "agent"],
  "#comms-pr": ["admin", "commander", "comms", "legal", "agent"],
  "#vendors": ["admin", "commander", "responder", "vendor", "agent"],
};
const SCOPE_WRITERS = ["admin", "commander", "responder", "agent", "legal"];
const INTERNAL = [...CORE, "legal", "exec", "comms"];

export type LinkState = "connecting" | "syncing" | "ready" | "reconnecting" | "offline";
export type Access = "unknown" | "enrolled" | "needs-code";
export interface Notice {
  kind: "error" | "info" | "ok";
  text: string;
}
export interface AgentLine {
  agent: string;
  status: string;
  thought: string;
  model: string;
  updatedAt: Ts;
}
export interface FindingRow {
  id: number;
  agent: string;
  kind: string;
  text: string;
  at: Ts;
}
export interface PolicyRow {
  action: string;
  mode: string;
  reversible: boolean;
  note: string;
}
export interface GuestRow {
  vm: string;
  host: string;
  workload: string;
  status: string;
  movedTo: string;
}
export interface HostRow {
  host: string;
  hall: string;
  rack: string;
  status: string;
}

const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

export class LiveSource implements DataSource {
  readonly kind = "live" as const;
  readonly can: Capabilities = { cancelEnrollment: true, addTask: true };

  private conn: DbConnection | null = null; // the connection the views read from: the last one that finished syncing
  private wire: DbConnection | null = null; // the connection writes go through
  private idHex = "";
  private applied = false;
  private snapPending = true;
  private everEnrolled = false;
  private link: LinkState = "connecting";
  private linkErr = "";
  private fails = 0;
  private retryTimer = 0;
  private stopped = false;
  private ver = 1;
  private approving = 0;
  private cache = new Map<string, unknown>();
  private cacheV = -1;
  private digestCache = new Map<string, string>();
  private digestBusy = new Set<string>();
  private slotDigest = new Map<string, string>();
  private listeners = new Set<(n: Notice) => void>();
  private watchers = new Set<() => void>();

  /** false when the browser blocks storage (a private window): the identity then lasts only until the page reloads */
  readonly canPersist: boolean;
  constructor(readonly server: LiveServer) {
    let ok = false;
    try {
      localStorage.setItem("claura.probe", "1");
      localStorage.removeItem("claura.probe");
      ok = true;
    } catch {
      ok = false;
    }
    this.canPersist = ok;
  }

  // ================================================================ connection
  start() {
    this.stopped = false;
    if (!this.wire) this.connect();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.link === "offline") this.connectNow();
    });
  }
  stop() {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    try {
      this.wire?.disconnect();
    } catch {
      /* ignore */
    }
  }
  /** Test aid: drop the socket as a flaky network would. The source then reconnects by itself with the stored token. */
  dropConnection() {
    try {
      this.wire?.disconnect();
    } catch {
      /* ignore */
    }
  }
  /** "Try again now" on the offline sheet. */
  retryNow() {
    this.connectNow();
  }
  private connectNow() {
    window.clearTimeout(this.retryTimer);
    if (!this.wire) this.connect();
  }
  private connect() {
    if (this.stopped) return;
    this.setLink(this.applied ? "reconnecting" : "connecting");
    const stored = readToken(tokenKey(this.server));
    let mine: DbConnection | null = null;
    mine = DbConnection.builder()
      .withUri(this.server.uri)
      .withDatabaseName(this.server.db)
      .withToken(stored)
      .onConnect((c, identity, token) => this.onConnect(c, hexOf(identity), token, stored))
      .onConnectError((_c, e) => this.onFail(`could not connect: ${errText(e)}`))
      .onDisconnect((_c, e) => {
        if (this.wire === mine) this.wire = null;
        this.onFail(e ? `connection lost: ${errText(e)}` : "connection closed");
      })
      .build();
  }
  private onConnect(c: DbConnection, idHex: string, token: string, stored: string | undefined) {
    this.idHex = idHex;
    if (token && token !== stored) writeToken(tokenKey(this.server), token);
    this.wire = c;
    this.fails = 0;
    this.linkErr = "";
    this.setLink("syncing");
    const db = c.db as unknown as Record<TableName, { onInsert(cb: () => void): void; onUpdate(cb: () => void): void; onDelete(cb: () => void): void }>;
    const touch = () => {
      if (c === this.conn) this.bump();
    };
    for (const t of TABLES) {
      db[t].onInsert(touch);
      db[t].onUpdate(touch);
      db[t].onDelete(touch);
    }
    c.subscriptionBuilder()
      .onApplied(() => {
        this.conn = c;
        this.applied = true;
        this.snapPending = true;
        this.setLink("ready");
        this.bump();
      })
      .onError((ctx) => {
        this.linkErr = `subscription error: ${errText((ctx as { event?: unknown }).event)}`;
        this.bump();
      })
      .subscribeToAllTables();
  }
  private onFail(why: string) {
    this.fails++;
    this.linkErr = why;
    this.setLink(this.applied ? "reconnecting" : "offline");
    if (this.fails > 1 && this.applied) this.link = "offline";
    this.bump();
    if (this.stopped) return;
    window.clearTimeout(this.retryTimer);
    const wait = RETRY_MS[Math.min(this.fails - 1, RETRY_MS.length - 1)];
    this.retryTimer = window.setTimeout(() => {
      if (!this.wire) this.connect();
    }, wait);
  }
  private setLink(l: LinkState) {
    if (this.link !== l) {
      this.link = l;
      this.bump();
    }
  }
  private bump() {
    this.ver++;
    for (const w of this.watchers) {
      try {
        w();
      } catch {
        /* a watcher must never break the data layer */
      }
    }
  }
  /** Call fn whenever rows or the connection state changed (right as the SDK delivers them). Returns the unsubscribe. */
  watch(fn: () => void): () => void {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  // ---- state the sheet and the indicator read
  linkState(): LinkState {
    return this.link;
  }
  linkError(): string {
    return this.linkErr;
  }
  attempts(): number {
    return this.fails;
  }
  isApplied(): boolean {
    return this.applied;
  }
  identityHex(): string {
    return this.idHex;
  }
  access(): Access {
    if (!this.applied) return "unknown";
    const yes = this.operators().some((o) => o.identity === this.idHex && o.active);
    if (yes) this.everEnrolled = true;
    return yes ? "enrolled" : "needs-code";
  }
  /** This console was enrolled a moment ago and is not any more: an admin revoked it (the views simply went empty). */
  wasRevoked(): boolean {
    return this.everEnrolled && this.access() === "needs-code";
  }
  /** True once after every (re)sync: the engine adapter jumps to the current state instead of animating to it. */
  consumeSnap(): boolean {
    if (!this.applied || !this.snapPending) return false;
    this.snapPending = false;
    return true;
  }
  /** Drop this browser's stored identity and connect afresh (a new identity needs a new break-glass code). */
  forgetIdentity() {
    forgetToken(tokenKey(this.server));
    try {
      this.wire?.disconnect();
    } catch {
      /* ignore */
    }
    this.wire = null;
    this.conn = null;
    this.applied = false;
    this.fails = 0;
    this.connectNow();
  }
  onNotice(fn: (n: Notice) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify(kind: Notice["kind"], text: string) {
    for (const fn of this.listeners) fn({ kind, text });
  }

  // ================================================================ reading
  private all<T = Raw>(name: TableName): T[] {
    const c = this.conn;
    if (!c) return [];
    try {
      return [...(c.db as unknown as Record<string, { iter(): Iterable<unknown> }>)[name].iter()] as T[];
    } catch {
      return [];
    }
  }
  private memo<T>(key: string, fn: () => T): T {
    if (this.cacheV !== this.ver) {
      this.cache.clear();
      this.cacheV = this.ver;
    }
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  version(): number {
    return this.ver;
  }
  now(): Ts {
    return Date.now();
  }

  // ---------------------------------------------------------------- identity and people
  me(): Me {
    return this.memo("me", () => {
      const o = this.operators().find((x) => x.identity === this.idHex);
      if (o) return { identity: o.identity, name: o.name, title: this.titleFor(o.name, o.role), role: o.role };
      return { identity: this.idHex, name: "Not enrolled", title: "Not enrolled", role: "responder" as OperatorRole };
    });
  }
  /** Can this role read the response team's rows (proposals, the incident log, agent states, findings, hosts)? legal, exec and
   *  comms read the incident row only; for them the adapter follows incident.status instead of the rows they cannot see. */
  readsResponseRows(): boolean {
    return CORE.includes(this.me().role);
  }
  private titleFor(name: string, role: OperatorRole): string {
    const s = this.stakeholders().find((x) => x.name.toLowerCase() === name.toLowerCase());
    return s?.role ?? roleLabel(role);
  }
  operators(): Operator[] {
    return this.memo("operators", () =>
      this.all("operator").map((o) => ({
        identity: hexOf(o.identity),
        name: String(o.name),
        role: o.role as OperatorRole,
        addedBy: String(o.addedBy),
        addedAt: tsMs(o.addedAt),
        active: !!o.active,
      })),
    );
  }
  enrollments(): Enrollment[] {
    return this.memo("enrollments", () =>
      this.all("enrollment")
        .map((e) => ({
          code: String(e.code),
          role: e.role as OperatorRole,
          nameHint: String(e.nameHint),
          createdBy: String(e.createdBy),
          createdAt: tsMs(e.createdAt),
          // "<name> (<identity prefix>)" -> the name, so the roster can tell the person consumed their code
          usedBy: String(e.usedBy).replace(/ \([0-9a-f]{8}\)$/i, ""),
        }))
        .sort((a, b) => a.createdAt - b.createdAt),
    );
  }
  stakeholders(): Stakeholder[] {
    return this.memo("stakeholders", () =>
      this.all("stakeholder").map((s) => ({ name: String(s.name), role: String(s.title), initials: String(s.initials), verifiedOutOfBand: !!s.verifiedOutOfBand })),
    );
  }
  /** The module has no presence table: a person is "online" if it is this console, or they acted in the last 5 minutes. */
  presence(): Record<string, Presence> {
    const slot = Math.floor(Date.now() / 20000);
    return this.memo(`presence:${slot}`, () => {
      const last = new Map<string, number>();
      const seen = (name: string, at: number) => last.set(name.toLowerCase(), Math.max(last.get(name.toLowerCase()) ?? 0, at));
      for (const m of this.all("message")) if (m.kind === "human") seen(String(m.authorName), tsMs(m.at));
      for (const e of this.all("incidentEvent")) if (e.kind === "approval" || e.kind === "state") seen(String(e.actor), tsMs(e.at));
      const now = Date.now();
      const out: Record<string, Presence> = {};
      for (const o of this.operators()) {
        const self = o.identity === this.idHex;
        const at = last.get(o.name.toLowerCase()) ?? null;
        out[o.name.toLowerCase()] = { online: o.active && (self || (at !== null && now - at < 300_000)), lastSeen: self ? now : at };
      }
      return out;
    });
  }

  // ---------------------------------------------------------------- incident
  private latest(): Raw | null {
    return this.memo("latest", () => {
      let best: Raw | null = null;
      for (const r of this.all("incident")) if (!best || r.id > best.id) best = r;
      return best;
    });
  }
  private incId(): bigint {
    return this.latest()?.id ?? 0n;
  }
  incident(): IncidentRow | null {
    return this.memo("incident", () => {
      const r = this.latest();
      if (!r) return null;
      const phase = (NIST_PHASES as string[]).includes(r.nistPhase) ? (r.nistPhase as NistPhase) : "detection_analysis";
      const contained = tsMs(r.containedAt);
      return {
        id: num(r.id),
        title: String(r.title),
        severity: String(r.severity),
        host: String(r.host),
        vm: String(r.vm),
        status: (["open", "awaiting_approval", "contained"].includes(r.status) ? r.status : "open") as IncidentRow["status"],
        openedAt: tsMs(r.openedAt),
        containedAt: contained > 0 ? contained : null,
        blastScore: num(r.blastScore),
        category: String(r.category),
        nistPhase: phase,
        functionalImpact: String(r.functionalImpact),
        informationImpact: String(r.informationImpact),
        recoverability: String(r.recoverability),
      };
    });
  }
  /** INC-0007: the label the console shows for the live incident. */
  incidentLabel(): string {
    const i = this.incident();
    return i ? `INC-${String(i.id).padStart(4, "0")}` : "";
  }
  events(): IncidentEvent[] {
    return this.memo("events", () => {
      const inc = this.latest();
      if (!inc) return [];
      const from = tsMs(inc.openedAt) - 120_000;
      return this.all("incidentEvent")
        .filter((e) => e.incidentId === inc.id || (e.incidentId === 0n && e.kind === "signal" && tsMs(e.at) >= from))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((e) => this.mapEvent(e, num(inc.id)));
    });
  }
  private mapEvent(e: Raw, incId: number): IncidentEvent {
    let text = String(e.text);
    let actor = String(e.actor);
    // the module words phase changes its own way; the phase rail and the report read "Phase set to <label>"
    const m = /^NIST SP 800-61 phase: (\w+) -> (\w+) \(by (.+)\)$/.exec(text);
    if (m && (NIST_PHASES as string[]).includes(m[2])) {
      text = `Phase set to ${PHASE[m[2] as NistPhase].label}`;
      actor = m[3];
    } else if (/^NIST SP 800-61 phase: detection_analysis\./.test(text)) {
      text = "Phase set to Detection and analysis";
    }
    return { id: num(e.id), incidentId: incId, at: tsMs(e.at), kind: String(e.kind), actor: agentCase(actor), text };
  }
  /** The six reversible-first steps, quarantine and anything blocked: one row per proposal, oldest first. */
  proposals(): Proposal[] {
    return this.memo("proposals", () => {
      const id = this.incId();
      const pol = new Map(this.policies().map((p) => [p.action, p.reversible]));
      return this.all("proposal")
        .filter((p) => p.incidentId === id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((p) => ({
          id: num(p.id),
          incidentId: num(p.incidentId),
          agent: agentCase(String(p.agent)),
          action: String(p.action),
          target: String(p.target),
          reason: String(p.reason),
          status: String(p.status),
          policyMode: String(p.policyMode),
          at: tsMs(p.at),
          decidedBy: String(p.decidedBy),
          reversible: pol.get(String(p.action)) ?? false,
        }));
    });
  }
  policies(): PolicyRow[] {
    return this.memo("policies", () =>
      this.all("policy").map((p) => ({ action: String(p.action), mode: String(p.mode), reversible: !!p.reversible, note: String(p.note) })),
    );
  }
  findings(): FindingRow[] {
    return this.memo("findings", () => {
      const id = this.incId();
      return this.all("finding")
        .filter((f) => f.incidentId === id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((f) => ({ id: num(f.id), agent: String(f.agent), kind: String(f.kind), text: String(f.text), at: tsMs(f.at) }));
    });
  }
  agentStates(): Record<string, AgentLine> {
    return this.memo("agentStates", () => {
      const out: Record<string, AgentLine> = {};
      for (const a of this.all("agentState"))
        out[String(a.agent)] = { agent: String(a.agent), status: String(a.status), thought: String(a.thought), model: String(a.model), updatedAt: tsMs(a.updatedAt) };
      return out;
    });
  }
  hostRow(host: string): HostRow | null {
    const h = this.all("host").find((x) => x.host === host);
    return h ? { host: String(h.host), hall: String(h.hall), rack: String(h.rack), status: String(h.status) } : null;
  }
  guests(): GuestRow[] {
    return this.memo("guests", () =>
      this.all("guestVm").map((g) => ({ vm: String(g.vm), host: String(g.host), workload: String(g.workload), status: String(g.status), movedTo: String(g.movedTo) })),
    );
  }
  /** Scribe's filed report for the live incident (null until filed). */
  report(): { summary: string; filedAt: Ts } | null {
    return this.memo("report", () => {
      const id = this.incId();
      const r = this.all("report").find((x) => x.incidentId === id);
      return r ? { summary: String(r.summary), filedAt: tsMs(r.filedAt) } : null;
    });
  }

  // ---------------------------------------------------------------- war room
  messages(channel: ChannelId): Message[] {
    return this.memo(`msgs:${channel}`, () =>
      this.all("message")
        .filter((m) => m.channel === channel)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((m) => {
          const kind = (["human", "agent", "system"].includes(m.kind) ? m.kind : "human") as Message["kind"];
          const text = String(m.text);
          const review = kind === "agent" && String(m.authorName).toLowerCase() === "warden" && /needs a human/i.test(text);
          return {
            id: num(m.id),
            incidentId: num(m.incidentId),
            channel,
            authorName: kind === "human" ? String(m.authorName) : agentCase(String(m.authorName)),
            authorRole: kind === "system" ? "system" : String(m.authorRole),
            kind,
            text,
            at: tsMs(m.at),
            ...(review ? { action: "review" as const } : {}),
          };
        }),
    );
  }
  tasks(): Task[] {
    return this.memo("tasks", () => {
      const id = this.incId();
      return this.all("task")
        .filter((t) => t.incidentId === id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((t) => ({ id: num(t.id), incidentId: num(t.incidentId), title: String(t.title), ownerRole: String(t.ownerRole), status: t.status as TaskStatus, at: tsMs(t.at) }));
    });
  }
  decisions(): Decision[] {
    return this.memo("decisions", () => {
      const id = this.incId();
      return this.all("decision")
        .filter((d) => d.incidentId === id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((d) => ({ id: num(d.id), incidentId: num(d.incidentId), text: String(d.text), byName: String(d.byName), at: tsMs(d.at) }));
    });
  }
  brief(): Brief | null {
    return this.memo("brief", () => {
      const id = this.incId();
      const rows = this.all("brief");
      const r = rows.find((b) => b.incidentId === id) ?? rows.find((b) => b.incidentId === 0n);
      if (!r) return null;
      return {
        incidentId: num(r.incidentId),
        text: String(r.text),
        known: String(r.known),
        unknown: String(r.unknown),
        updatedAt: tsMs(r.updatedAt),
        author: agentCase(String(r.author)) || "Scribe",
      };
    });
  }

  // ---------------------------------------------------------------- scope
  /** Like the scripted source, the scope fills in when an incident opens (the module adopts the inventory then). */
  assets(): DataAsset[] {
    return this.memo("assets", () => {
      const id = this.incId();
      if (!this.latest()) return [];
      return this.all("dataAsset")
        .filter((a) => a.incidentId === id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((a) => ({
          id: num(a.id),
          incidentId: num(a.incidentId),
          name: String(a.name),
          system: String(a.system),
          classification: (["restricted", "confidential", "internal"].includes(a.classification) ? a.classification : "internal") as Classification,
          records: num(a.records),
          status: String(a.status) as AssetStatus,
          note: String(a.note),
          updatedBy: agentCase(String(a.updatedBy)),
          updatedAt: tsMs(a.updatedAt),
        }));
    });
  }

  // ---------------------------------------------------------------- evidence
  /**
   * The module keeps no evidence files. What it does keep is an append-only record, so the console lists what it can
   * prove: the capture record (a SHA-256 of the proposal that ordered it) and the incident log (a SHA-256 of every entry
   * as filed). Both digests are computed here with Web Crypto; the source line says so.
   */
  evidence(): EvidenceItem[] {
    return this.memo("evidence", () => {
      const inc = this.incident();
      if (!inc) return [];
      const out: EvidenceItem[] = [];
      for (const p of this.proposals()) {
        if (p.action !== "capture_memory" || (p.status !== "executed" && p.status !== "approved")) continue;
        const asset = this.assets().find((a) => /memory image/i.test(a.name));
        const size = /(\d+(?:\.\d+)?\s?[KMGT]i?B)/.exec(asset?.system ?? "")?.[1] ?? "n/a";
        const sha = this.digestSlot(`capture:${p.id}`, ["capture", inc.id, p.id, p.target, p.at, p.agent, p.reason].join("|"));
        if (!sha) continue;
        out.push({
          id: p.id,
          name: `${p.target}.mem`,
          size,
          sha256: sha,
          source: `Capture record, proposal #${p.id}. Simulated: the digest covers the audit record, no memory image exists in this demo`,
          collectedBy: p.agent,
          collectedAt: p.at,
          custody: [
            { at: p.at, who: p.agent, action: "Capture ordered, read-only (policy gate)" },
            { at: p.at, who: "Scribe", action: "Record hashed, SHA-256" },
          ],
        });
      }
      const ev = this.events();
      if (ev.length) {
        const body = ev.map((e) => `${e.id}|${e.at}|${e.kind}|${e.actor}|${e.text}`).join("\n");
        const sha = this.digestSlot("log", body);
        const newest = ev[ev.length - 1].at;
        if (sha)
          out.push({
            id: 9000 + inc.id,
            name: `${this.incidentLabel()}-timeline.log`,
            size: `${new TextEncoder().encode(body).length.toLocaleString("en-US")} B`,
            sha256: sha,
            source: `The incident log, ${ev.length} entries as filed, hashed in this browser`,
            collectedBy: "Scribe",
            collectedAt: newest,
            custody: [
              { at: ev[0].at, who: "Scribe", action: "Log opened, append-only" },
              { at: newest, who: "Scribe", action: `${ev.length} entries hashed, SHA-256` },
            ],
          });
      }
      return out;
    });
  }
  /** Stale-while-revalidate: a slot keeps showing its last digest while a new one is computed, then bumps the version. */
  private digestSlot(slot: string, input: string): string | null {
    const have = this.digestCache.get(input);
    if (have) {
      this.slotDigest.set(slot, have);
      return have;
    }
    if (!this.digestBusy.has(input)) {
      this.digestBusy.add(input);
      void sha256Hex(input).then((hex) => {
        if (this.digestCache.size > 40) this.digestCache.delete(this.digestCache.keys().next().value as string); // oldest first
        this.digestCache.set(input, hex);
        this.digestBusy.delete(input);
        this.bump();
      });
    }
    return this.slotDigest.get(slot) ?? null;
  }

  // ================================================================ writing
  private incOrFail(): { id: bigint } | Result {
    const id = this.incId();
    return id === 0n ? fail("There is no open incident") : { id };
  }
  /** Call a reducer. Rejections (the module's own words) become a notice; the returned Result is for callers that wait. */
  private async call(label: string, fn: (c: DbConnection) => Promise<unknown>, quiet = false): Promise<Result> {
    const c = this.wire;
    if (!c || (this.link !== "ready" && this.link !== "syncing")) {
      const msg = "Not connected to the server";
      if (!quiet) this.notify("error", `${label}: ${msg}`);
      return fail(msg);
    }
    try {
      await fn(c);
      return OK;
    } catch (e) {
      const msg = errText(e);
      if (!quiet) this.notify("error", `${label}: ${msg}`);
      return fail(msg);
    }
  }

  postMessage(channel: ChannelId, text: string): Result {
    const me = this.me();
    const t = text.trim();
    if (!t) return fail("Nothing to send");
    if (!POST[channel]?.includes(me.role)) return fail(`Your role (${roleLabel(me.role)}) cannot post in ${channel}`);
    void this.call("Message not sent", (c) => c.reducers.postMessage({ incidentId: this.incId(), channel, text: t }));
    return OK;
  }
  addTask(title: string, ownerRole: string): Result {
    const t = title.trim();
    if (!t) return fail("Give the task a title");
    const inc = this.incOrFail();
    if (!("id" in inc)) return inc;
    if (!INTERNAL.includes(this.me().role)) return fail("Your role cannot add tasks");
    void this.call("Task not added", (c) => c.reducers.addTask({ incidentId: inc.id, title: t, ownerRole }));
    return OK;
  }
  setTaskStatus(id: number, status: TaskStatus): Result {
    void this.call("Task not updated", (c) => c.reducers.setTaskStatus({ id: BigInt(id), status }));
    return OK;
  }
  setAssetStatus(id: number, status: AssetStatus, note: string): Result {
    if (!SCOPE_WRITERS.includes(this.me().role)) return fail(`Your role (${roleLabel(this.me().role)}) cannot change data scope`);
    void this.call("Status not changed", (c) => c.reducers.setAssetStatus({ id: BigInt(id), status, note: note.trim() }));
    return OK;
  }
  issueEnrollment(code: string, role: OperatorRole, nameHint: string): Result {
    if (this.me().role !== "admin") return fail("Only an admin can issue break-glass codes");
    if (!nameHint.trim()) return fail("Give the person a name");
    void this.call("Code not issued", (c) => c.reducers.issueEnrollment({ code, role, nameHint: nameHint.trim() }));
    return OK;
  }
  /** Same, but resolves with the module's answer: the Add person sheet waits for it before it shows a code. */
  async issueEnrollmentAsync(code: string, role: OperatorRole, nameHint: string): Promise<Result> {
    if (this.me().role !== "admin") return fail("Only an admin can issue break-glass codes");
    if (!nameHint.trim()) return fail("Give the person a name");
    return this.call("Code not issued", (c) => c.reducers.issueEnrollment({ code, role, nameHint: nameHint.trim() }), true);
  }
  cancelEnrollment(code: string): Result {
    if (this.me().role !== "admin") return fail("Only an admin can void codes");
    void this.call("Code not voided", (c) => c.reducers.revokeEnrollment({ code }));
    return OK;
  }
  addOperator(identityHex: string, name: string, role: OperatorRole): Result {
    if (this.me().role !== "admin") return fail("Only an admin can add people");
    void this.call("Person not added", (c) => c.reducers.addOperator({ identityHex, name, role }));
    return OK;
  }
  revokeOperator(identityHex: string): Result {
    if (this.me().role !== "admin") return fail("Only an admin can revoke access");
    if (identityHex === this.idHex) return fail("You cannot revoke your own access");
    void this.call("Access not revoked", (c) => c.reducers.revokeOperator({ identityHex }));
    return OK;
  }
  /** A fresh single-use code: 18 symbols from a 31-symbol alphabet is about 89 bits (the module asks for 80 or more).
   *  Exactly 18 characters so "claura://join/<code>" still fits the 32-byte QR. */
  newCode(): string {
    const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    let out = "";
    const buf = new Uint8Array(48);
    while (out.length < 18) {
      crypto.getRandomValues(buf);
      for (const b of buf) if (b < 248 && out.length < 18) out += A[b % 31];
    }
    return out;
  }

  // ---------------------------------------------------------------- join and approve
  /** Enroll this browser's identity with a break-glass code an admin handed over. The module consumes the code. */
  async enroll(code: string, name: string): Promise<Result> {
    const typed = code.trim();
    if (!typed) return fail("Enter the break-glass code");
    // Codes are case-sensitive and may carry dashes. People retype them, so try the likely spellings; a miss costs nothing.
    const tries = [...new Set([typed, typed.toUpperCase(), typed.toUpperCase().replace(/[\s-]/g, "")])];
    let last = "invalid or already used enrollment code";
    for (const c of tries) {
      const r = await this.call("Join failed", (conn) => conn.reducers.enroll({ code: c, name: name.trim() }), true);
      if (r.ok) return r;
      last = r.error;
      if (!/invalid or already used/i.test(last)) break;
    }
    return fail(last);
  }
  /** The proposal a human can approve right now: the pending quarantine (or any pending proposal). */
  pendingApproval(): Proposal | null {
    const ps = this.proposals().filter((p) => p.status === "pending_approval");
    return ps.find((p) => p.action === "quarantine_host") ?? ps[0] ?? null;
  }
  approvingId(): number {
    return this.approving;
  }
  /** Approve the pending proposal. The module records the approver from the caller's identity, never from an argument. */
  async approvePending(): Promise<Result> {
    const p = this.pendingApproval();
    if (!p) return fail("Nothing is waiting for approval");
    const me = this.me();
    if (!canApprove(me.role)) return fail(`${me.name} (${roleLabel(me.role)}) cannot approve. Only the Incident Commander or an admin can`);
    if (this.approving) return fail("Approval already sent");
    this.approving = p.id;
    this.bump();
    const r = await this.call("Approval failed", (c) => c.reducers.approve({ proposalId: BigInt(p.id), operator: "" }));
    this.approving = 0;
    this.bump();
    return r;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
