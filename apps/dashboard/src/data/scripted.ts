// ScriptedSource: the demo's data layer. Every row is shaped like its SpacetimeDB table, and every time-dependent row
// is derived from the incident engine (S.r, S.A), so seeking, replaying or approving moves the data with the UI.
// Viewer actions (post a message, issue a code, set a status) are kept in memory and layered on top.
import { APPROVAL_AT, INCIDENT, ISOLATE_DUR, STEPS } from "../script";
import { S, U, at, phase, since } from "../engine";
import { hash } from "../util";
import { codeFromSeed } from "./codes";
import { roleLabel } from "./format";
import type { Capabilities, DataSource } from "./source";
import * as C from "./scripted-content";
import type { Timed } from "./scripted-content";
import type {
  AssetStatus,
  Brief,
  ChannelId,
  DataAsset,
  Decision,
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
import { OK, fail } from "./types";
import type { NistPhase } from "./types";

/** 02:14:07 CST on Nov 8 2026, the moment of the alert. Script seconds are added to it. */
export const EPOCH = Date.UTC(2026, 10, 8, 8, 14, 7);
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const INCIDENT_ID = 419;

const ts = (e: Timed) => EPOCH + Math.round(at(e) * 1000);
const seen = (e: Timed) => since(e) >= 0;
const last = <T extends Timed>(rows: T[]): T | null => {
  let out: T | null = null;
  for (const r of rows) if (seen(r)) out = r;
  return out;
};

/** A stable 64-hex "identity" for a name, so the roster shows believable identities without a real key pair. */
function hex64(seed: string): string {
  let h = 7;
  for (const ch of seed) h = (Math.imul(h, 33) + ch.charCodeAt(0)) >>> 0;
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(hash(h, i, 9) * 0xffffffff).toString(16).padStart(8, "0");
  return s;
}

const AGENT_NAMES = new Set(["Sentry", "Triage", "Warden", "Scribe"]);
const roleOfAuthor = (name: string, system?: boolean): string =>
  system ? "system" : AGENT_NAMES.has(name) ? "agent" : (C.PEOPLE.find((p) => p.name === name)?.role ?? "responder");

const ALL_TIMES: Timed[] = [
  ...C.MESSAGES,
  ...C.TASKS.flatMap((t) => t.steps),
  ...C.DECISIONS,
  ...C.EVENTS,
  ...C.ASSETS.flatMap((a) => a.steps),
  ...C.IMPACT,
  ...C.PROPOSALS,
  ...C.EVIDENCE_ITEMS.flatMap((e) => [{ t: e.landT }, ...e.custody]),
  ...Object.values(C.STAGE_AT),
  ...C.PEOPLE.filter((p) => p.joinT !== null).map((p) => ({ t: p.joinT as number })),
  { t: 0 },
  { t: STEPS[0].start },
  { t: APPROVAL_AT },
  { u: ISOLATE_DUR },
];

export class ScriptedSource implements DataSource {
  readonly kind = "scripted" as const;
  readonly can: Capabilities = { cancelEnrollment: true, addTask: true };

  private mut = 0;
  private whoIdx = 0;
  private posted: Message[] = [];
  private taskOv = new Map<number, TaskStatus>();
  private extraTasks: Task[] = [];
  private assetOv = new Map<number, { status: AssetStatus; note: string; by: string; at: Ts }>();
  private enrolls: Enrollment[] = [];
  private cancelled = new Set<string>();
  private extraOps: (Operator & { online: boolean })[] = [];
  private revoked = new Set<string>();
  private codeSeq = 0;

  // ---------------------------------------------------------------- memo
  private cacheV = -1;
  private cache = new Map<string, unknown>();
  private memo<T>(key: string, fn: () => T): T {
    const v = this.version();
    if (v !== this.cacheV) {
      this.cache.clear();
      this.cacheV = v;
    }
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  version(): number {
    let n = this.mut * 100003 + this.whoIdx * 17 + (S.started ? 1 : 0);
    for (const e of ALL_TIMES) if (seen(e)) n++;
    if (S.A !== null) n += Math.round(S.A * 100) * 3;
    return n;
  }
  now(): Ts {
    return S.started ? EPOCH + Math.round(S.r * 1000) : EPOCH - 500;
  }

  // ---------------------------------------------------------------- identity
  me(): Me {
    const p = C.PEOPLE[this.whoIdx];
    return { identity: hex64(p.name), name: p.name, title: p.title, role: p.role };
  }
  /** Switch who the console thinks you are: "JT", "legal", "Legal counsel". Returns false if nobody matches. */
  setIdentity(who: string): boolean {
    const q = who.trim().toLowerCase();
    const i = C.PEOPLE.findIndex((p) => p.name.toLowerCase() === q || p.role === q || p.title.toLowerCase() === q);
    if (i < 0) return false;
    this.whoIdx = i;
    return true;
  }
  private active(identity: string) {
    return !this.revoked.has(identity);
  }
  private guard(role?: OperatorRole[]): Result | null {
    const me = this.me();
    if (!this.active(me.identity)) return fail("Your access was revoked");
    if (role && !role.includes(me.role)) return fail(`Needs the role ${role.map(roleLabel).join(" or ")}`);
    return null;
  }

  // ---------------------------------------------------------------- people and access
  operators(): Operator[] {
    return this.memo("operators", () => {
      const people: Operator[] = C.PEOPLE.map((p) => {
        const identity = hex64(p.name);
        return { identity, name: p.name, role: p.role, addedBy: p.addedBy, addedAt: EPOCH - p.addedDaysAgo * DAY, active: this.active(identity) };
      });
      const agents: Operator[] = C.AGENT_IDENTITIES.map((a) => ({
        identity: hex64(`agent:${a.name}`),
        name: a.name,
        role: "agent",
        addedBy: "init",
        addedAt: EPOCH - a.addedDaysAgo * DAY,
        active: true,
      }));
      const extra: Operator[] = this.extraOps.map((o) => ({ identity: o.identity, name: o.name, role: o.role, addedBy: o.addedBy, addedAt: o.addedAt, active: this.active(o.identity) }));
      return [...people, ...extra, ...agents];
    });
  }
  enrollments(): Enrollment[] {
    return this.memo("enrollments", () => {
      const used = C.PEOPLE.filter((p) => p.name !== "RK").map((p, i) => ({
        code: codeFromSeed(100 + i),
        role: p.role,
        nameHint: p.name,
        createdBy: "RK",
        createdAt: EPOCH - p.addedDaysAgo * DAY,
        usedBy: p.name,
      }));
      const seed: Enrollment = {
        code: codeFromSeed(7),
        role: C.SEED_PENDING.role,
        nameHint: C.SEED_PENDING.nameHint,
        createdBy: C.SEED_PENDING.createdBy,
        createdAt: EPOCH - C.SEED_PENDING.hoursAgo * HOUR,
        usedBy: "",
      };
      return [...used, ...(this.cancelled.has(seed.code) ? [] : [seed]), ...this.enrolls];
    });
  }
  stakeholders(): Stakeholder[] {
    return C.PEOPLE.map((p) => ({ name: p.name, role: p.title, initials: p.initials, verifiedOutOfBand: true }));
  }
  presence(): Record<string, Presence> {
    return this.memo("presence", () => {
      const out: Record<string, Presence> = {};
      const now = this.now();
      for (const p of C.PEOPLE) {
        const online = (p.joinT === null || (S.started && S.r >= p.joinT)) && this.active(hex64(p.name));
        out[p.name.toLowerCase()] = { online, lastSeen: online ? now : EPOCH - p.lastSeenHoursAgo * HOUR };
      }
      for (const o of this.extraOps) out[o.name.toLowerCase()] = { online: o.online && this.active(o.identity), lastSeen: now };
      return out;
    });
  }

  issueEnrollment(code: string, role: OperatorRole, nameHint: string): Result {
    const g = this.guard(["admin"]);
    if (g) return g;
    if (!nameHint.trim()) return fail("Give the person a name");
    if (this.enrollments().some((e) => e.code === code)) return fail("That code already exists");
    this.enrolls.push({ code, role, nameHint: nameHint.trim(), createdBy: this.me().name, createdAt: this.now(), usedBy: "" });
    this.mut++;
    return OK;
  }
  cancelEnrollment(code: string): Result {
    const g = this.guard(["admin"]);
    if (g) return g;
    const mine = this.enrolls.findIndex((e) => e.code === code && !e.usedBy);
    if (mine >= 0) this.enrolls.splice(mine, 1);
    else this.cancelled.add(code);
    this.mut++;
    return OK;
  }
  addOperator(identityHex: string, name: string, role: OperatorRole): Result {
    const g = this.guard(["admin"]);
    if (g) return g;
    this.extraOps.push({ identity: identityHex, name, role, addedBy: this.me().name, addedAt: this.now(), active: true, online: false });
    this.mut++;
    return OK;
  }
  revokeOperator(identityHex: string): Result {
    const g = this.guard(["admin"]);
    if (g) return g;
    if (identityHex === this.me().identity) return fail("You cannot revoke your own access");
    const target = this.operators().find((o) => o.identity === identityHex);
    if (!target) return fail("No such operator");
    if (target.role === "admin" && this.operators().filter((o) => o.role === "admin" && o.active).length <= 1) return fail("That is the last admin");
    this.revoked.add(identityHex);
    this.mut++;
    return OK;
  }
  /** Scripted only: the new person's device uses the code. Their row flips from "waiting" to enrolled and verified. */
  simulateEnroll(code?: string): Result {
    const pending = this.enrollments().filter((e) => !e.usedBy);
    const e = code ? pending.find((x) => x.code === code) : pending[pending.length - 1];
    if (!e) return fail("No pending code");
    const own = this.enrolls.find((x) => x.code === e.code);
    if (own) own.usedBy = e.nameHint;
    else this.cancelled.add(e.code); // the seeded code: hide it, add the operator below
    this.extraOps.push({ identity: hex64(e.nameHint + e.code), name: e.nameHint, role: e.role, addedBy: e.createdBy, addedAt: this.now(), active: true, online: true });
    if (!own) this.enrolls.push({ ...e, usedBy: e.nameHint });
    this.mut++;
    return OK;
  }
  /** The next code the Add person sheet should issue in demo mode (repeatable) */
  nextDemoSeed(): number {
    return 1000 + this.codeSeq++;
  }

  // ---------------------------------------------------------------- incident
  incident(): IncidentRow | null {
    return this.memo("incident", () => {
      if (!S.started) return null;
      const ph = phase();
      const done = ph === "contained" || ph === "report";
      const imp = last(C.IMPACT) ?? C.IMPACT[0];
      const nist: NistPhase = seen({ u: 3.0 }) ? "eradication" : seen({ t: 2.0 }) ? "containment" : "detection_analysis";
      return {
        id: INCIDENT_ID,
        title: INCIDENT.title,
        severity: "critical",
        host: INCIDENT.host,
        vm: INCIDENT.vm,
        status: done ? "contained" : ph === "approval" ? "awaiting_approval" : "open",
        openedAt: EPOCH,
        containedAt: done ? EPOCH + Math.round(((S.A ?? 0) + ISOLATE_DUR) * 1000) : null,
        blastScore: seen({ t: 2.0 }) ? 0.87 : 0,
        category: C.CATEGORY,
        nistPhase: nist,
        functionalImpact: imp.functional,
        informationImpact: imp.information,
        recoverability: imp.recoverability,
      };
    });
  }
  events(): IncidentEvent[] {
    return this.memo("events", () =>
      C.EVENTS.flatMap((e, i) => (seen(e) ? [{ id: i + 1, incidentId: INCIDENT_ID, at: ts(e), kind: e.kind, actor: e.actor, text: e.text }] : [])),
    );
  }
  proposals(): Proposal[] {
    return this.memo("proposals", () =>
      C.PROPOSALS.flatMap((p) => {
        if (!seen(p)) return [];
        const waiting = p.mode === "approval" && S.A === null;
        return [
          {
            id: p.id,
            incidentId: INCIDENT_ID,
            agent: p.agent,
            action: p.action,
            target: p.target,
            reason: p.reason,
            status: p.mode === "approval" ? (waiting ? "pending_approval" : "approved") : "executed",
            policyMode: p.mode,
            at: ts(p),
            decidedBy: p.mode === "approval" ? (waiting ? "" : "RK") : "policy",
            reversible: p.reversible,
          },
        ];
      }),
    );
  }
  evidence(): EvidenceItem[] {
    return this.memo("evidence", () =>
      C.EVIDENCE_ITEMS.flatMap((e) => {
        if (!seen({ t: e.landT })) return [];
        const { landT, custody, ...rest } = e;
        return [{ ...rest, collectedAt: EPOCH + Math.round(landT * 1000), custody: custody.filter(seen).map((c) => ({ at: ts(c), who: c.who, action: c.action })) }];
      }),
    );
  }

  // ---------------------------------------------------------------- war room
  messages(channel: ChannelId): Message[] {
    return this.memo(`msgs:${channel}`, () => {
      const base: Message[] = [];
      C.MESSAGES.forEach((m, i) => {
        if (m.ch !== channel || !seen(m)) return;
        base.push({
          id: i + 1,
          incidentId: INCIDENT_ID,
          channel,
          authorName: m.who,
          authorRole: roleOfAuthor(m.who, m.system),
          kind: m.system ? "system" : AGENT_NAMES.has(m.who) ? "agent" : "human",
          text: m.text,
          at: ts(m),
          action: m.action,
        });
      });
      return [...base, ...this.posted.filter((p) => p.channel === channel)].sort((a, b) => a.at - b.at || a.id - b.id);
    });
  }
  postMessage(channel: ChannelId, text: string): Result {
    const g = this.guard();
    if (g) return g;
    const t = text.trim();
    if (!t) return fail("Nothing to send");
    const me = this.me();
    this.posted.push({ id: 1000 + this.posted.length, incidentId: INCIDENT_ID, channel, authorName: me.name, authorRole: me.role, kind: "human", text: t, at: this.now() });
    this.mut++;
    return OK;
  }
  tasks(): Task[] {
    return this.memo("tasks", () => {
      const rows: Task[] = [];
      for (const t of C.TASKS) {
        const step = last(t.steps);
        if (!step) continue;
        rows.push({ id: t.key, incidentId: INCIDENT_ID, title: t.title, ownerRole: t.ownerRole, status: this.taskOv.get(t.key) ?? step.status, at: ts(t.steps[0]) });
      }
      return [...rows, ...this.extraTasks.map((t) => ({ ...t, status: this.taskOv.get(t.id) ?? t.status }))];
    });
  }
  addTask(title: string, ownerRole: string): Result {
    const g = this.guard();
    if (g) return g;
    if (!title.trim()) return fail("Give the task a title");
    this.extraTasks.push({ id: 100 + this.extraTasks.length, incidentId: INCIDENT_ID, title: title.trim(), ownerRole, status: "open", at: this.now() });
    this.mut++;
    return OK;
  }
  setTaskStatus(id: number, status: TaskStatus): Result {
    const g = this.guard();
    if (g) return g;
    this.taskOv.set(id, status);
    this.mut++;
    return OK;
  }
  decisions(): Decision[] {
    return this.memo("decisions", () => C.DECISIONS.flatMap((d) => (seen(d) ? [{ id: d.key, incidentId: INCIDENT_ID, text: d.text, byName: d.by, at: ts(d) }] : [])));
  }
  brief(): Brief | null {
    return this.memo("brief", () => {
      const stage = briefStage();
      const b = C.BRIEFS[stage];
      return {
        incidentId: INCIDENT_ID,
        text: b.text.map(([k, v]) => `${k}: ${v}`).join("\n"),
        known: b.known.join("\n"),
        unknown: b.unknown.join("\n"),
        updatedAt: ts(C.STAGE_AT[stage]),
        author: "Scribe",
      };
    });
  }

  // ---------------------------------------------------------------- data scope
  assets(): DataAsset[] {
    return this.memo("assets", () => {
      const rows: DataAsset[] = [];
      for (const a of C.ASSETS) {
        const step = last(a.steps);
        if (!step) continue;
        const ov = this.assetOv.get(a.id);
        rows.push({
          id: a.id,
          incidentId: INCIDENT_ID,
          name: a.name,
          system: a.system,
          classification: a.classification,
          records: a.records,
          status: ov?.status ?? step.status,
          note: ov?.note ?? step.note,
          updatedBy: ov?.by ?? step.by,
          updatedAt: ov?.at ?? ts(step),
        });
      }
      return rows;
    });
  }
  setAssetStatus(id: number, status: AssetStatus, note: string): Result {
    const g = this.guard();
    if (g) return g;
    const cur = this.assets().find((a) => a.id === id);
    if (!cur) return fail("No such asset");
    this.assetOv.set(id, { status, note: note.trim() || cur.note, by: this.me().name, at: this.now() });
    this.mut++;
    return OK;
  }

  reset() {
    this.posted = [];
    this.taskOv.clear();
    this.extraTasks = [];
    this.assetOv.clear();
    this.enrolls = [];
    this.cancelled.clear();
    this.extraOps = [];
    this.revoked.clear();
    this.codeSeq = 0;
    this.mut++;
  }
}

function briefStage(): C.BriefStage {
  if (!S.started) return "quiet";
  if (S.A !== null) return U() >= ISOLATE_DUR ? "contained" : "quarantine";
  if (S.r >= APPROVAL_AT) return "approval";
  if (S.r >= 3.7) return "scope";
  if (S.r >= 2.0) return "contain";
  return "detect";
}
