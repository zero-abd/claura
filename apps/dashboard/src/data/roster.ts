// The People & Access roster: real identities (operator), pending break-glass codes (enrollment) and display-only
// directory rows (stakeholder) merged into one list. Pure: works the same on scripted and live data.
import type { DataSource } from "./source";
import type { OperatorRole, Ts } from "./types";
import { initialsOf, roleLabel } from "./format";

export interface Person {
  key: string;
  /** operator: a real identity. pending: a code that has not been used. directory: listed, no identity enrolled yet. */
  kind: "operator" | "pending" | "directory";
  name: string;
  initials: string;
  /** display title: "Incident Commander", "CISO" */
  title: string;
  role: OperatorRole | null;
  admin: boolean;
  /** identity was checked out-of-band (a break-glass code handed over in person, or verified some other way) */
  verified: boolean;
  /** false once revoked */
  active: boolean;
  online: boolean;
  lastSeen: Ts | null;
  addedBy: string;
  addedAt: Ts | null;
  identity: string;
  /** pending only */
  code: string;
  createdAt: Ts | null;
  self: boolean;
}

const ROLE_ORDER: Record<string, number> = { admin: 0, commander: 1, legal: 2, exec: 3, comms: 4, vendor: 5, responder: 6, agent: 7 };

export function buildRoster(d: DataSource): Person[] {
  const ops = d.operators().filter((o) => o.role !== "agent");
  const stakes = d.stakeholders();
  const enrolls = d.enrollments();
  const pres = d.presence();
  const me = d.me();
  const out: Person[] = [];
  const claimed = new Set<string>();

  for (const o of ops) {
    const s = stakes.find((x) => x.name.toLowerCase() === o.name.toLowerCase() || x.initials === o.name);
    if (s) claimed.add(s.name);
    const consumed = enrolls.some((e) => e.usedBy && e.usedBy.toLowerCase() === o.name.toLowerCase());
    const p = pres[o.name.toLowerCase()];
    out.push({
      key: o.identity,
      kind: "operator",
      name: o.name,
      initials: s?.initials ?? initialsOf(o.name),
      title: s?.role ?? roleLabel(o.role),
      role: o.role,
      admin: o.role === "admin",
      // enrolled with a break-glass code handed over in person = verified out-of-band (non-admins cannot read the code table)
      verified: s?.verifiedOutOfBand ?? (consumed || /^code issued by/i.test(o.addedBy)),
      active: o.active,
      online: !!p?.online && o.active,
      lastSeen: p?.lastSeen ?? null,
      addedBy: o.addedBy,
      addedAt: o.addedAt,
      identity: o.identity,
      code: "",
      createdAt: null,
      self: o.identity === me.identity,
    });
  }
  for (const s of stakes) {
    if (claimed.has(s.name)) continue;
    const p = pres[s.name.toLowerCase()];
    out.push({
      key: `dir:${s.name}`,
      kind: "directory",
      name: s.name,
      initials: s.initials,
      title: s.role,
      role: null,
      admin: false,
      verified: s.verifiedOutOfBand,
      active: true,
      online: !!p?.online,
      lastSeen: p?.lastSeen ?? null,
      addedBy: "",
      addedAt: null,
      identity: "",
      code: "",
      createdAt: null,
      self: false,
    });
  }
  for (const e of enrolls) {
    if (e.usedBy) continue;
    out.push({
      key: `pending:${e.code}`,
      kind: "pending",
      name: e.nameHint || "New person",
      initials: initialsOf(e.nameHint || "New person"),
      title: roleLabel(e.role),
      role: e.role,
      admin: e.role === "admin",
      verified: false,
      active: true,
      online: false,
      lastSeen: null,
      addedBy: e.createdBy,
      addedAt: e.createdAt,
      identity: "",
      code: e.code,
      createdAt: e.createdAt,
      self: false,
    });
  }
  const rank = (p: Person) => (!p.active ? 90 : p.kind === "pending" ? 50 : p.kind === "directory" ? 40 : (ROLE_ORDER[p.role ?? "agent"] ?? 20));
  return out
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p);
}

export interface RosterSummary {
  people: number;
  online: number;
  admins: number;
  pending: number;
  revoked: number;
  verified: number;
}
export function summarize(r: Person[]): RosterSummary {
  const live = r.filter((p) => p.kind !== "pending" && p.active);
  return {
    people: live.length,
    online: live.filter((p) => p.online).length,
    admins: live.filter((p) => p.admin).length,
    pending: r.filter((p) => p.kind === "pending").length,
    revoked: r.filter((p) => !p.active).length,
    verified: live.filter((p) => p.verified).length,
  };
}

let cacheKey = "";
let cacheVal: Person[] = [];
/** buildRoster, memoised on the source's version() (it is called by several views every frame). */
export function roster(d: DataSource): Person[] {
  const k = `${d.kind}:${d.version()}`;
  if (k !== cacheKey) {
    cacheKey = k;
    cacheVal = buildRoster(d);
  }
  return cacheVal;
}
/** The service identities (the four agents), with their least-privilege bounds. Not part of the human roster. */
export function agentIdentities(d: DataSource) {
  return d.operators().filter((o) => o.role === "agent");
}

/** The Incident Commander for display: an active commander if there is one, else the first admin (in the scripted data RK is the admin). */
export function incidentCommander(people: Person[]): Person | undefined {
  return people.find((p) => p.kind === "operator" && p.active && p.role === "commander") ?? people.find((p) => p.role === "admin" && p.kind === "operator");
}

/** Who approved the quarantine (proposal.decided_by), with their display title from the roster. Null until approved. */
export function approverOf(d: DataSource): { name: string; title: string } | null {
  const p = d.proposals().find((x) => x.policyMode === "approval" && x.decidedBy && x.decidedBy !== "policy");
  if (!p) return null;
  return { name: p.decidedBy, title: roster(d).find((r) => r.name === p.decidedBy)?.title ?? "" };
}
