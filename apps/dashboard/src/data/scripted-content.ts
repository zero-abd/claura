// Scripted, fictional demo content for the data layer. Plain data: no DOM, no engine imports.
//
// Timing convention matches script.ts: t = script seconds since the alert, u = seconds after the human approval
// (the canonical approval lands at T+7.4). ScriptedSource turns these rows into contract-shaped table rows.
import type { AssetStatus, ChannelId, Classification, EvidenceItem, OperatorRole, TaskStatus } from "./types";

export interface Timed {
  t?: number;
  u?: number;
}

// ------------------------------------------------------------------ people
export interface ScriptPerson {
  name: string;
  initials: string;
  /** display title */
  title: string;
  role: OperatorRole;
  /** script seconds when they come online. null = on shift from the start */
  joinT: number | null;
  addedBy: string;
  addedDaysAgo: number;
  /** when they were last seen before they joined (hours before the alert) */
  lastSeenHoursAgo: number;
}
export const PEOPLE: ScriptPerson[] = [
  { name: "RK", initials: "RK", title: "Incident Commander", role: "admin", joinT: null, addedBy: "init", addedDaysAgo: 41, lastSeenHoursAgo: 0 },
  { name: "JT", initials: "JT", title: "Legal counsel", role: "legal", joinT: null, addedBy: "RK", addedDaysAgo: 41, lastSeenHoursAgo: 0 },
  { name: "AL", initials: "AL", title: "CISO", role: "exec", joinT: null, addedBy: "RK", addedDaysAgo: 40, lastSeenHoursAgo: 0 },
  { name: "CEO", initials: "CEO", title: "CEO", role: "exec", joinT: 3.4, addedBy: "RK", addedDaysAgo: 38, lastSeenHoursAgo: 31 },
  { name: "PR", initials: "PR", title: "PR lead", role: "comms", joinT: 4.2, addedBy: "RK", addedDaysAgo: 38, lastSeenHoursAgo: 52 },
  { name: "CV", initials: "CV", title: "Cloud vendor", role: "vendor", joinT: 4.4, addedBy: "RK", addedDaysAgo: 36, lastSeenHoursAgo: 150 },
];
/** The four agents are identities too (role "agent"): least privilege shows in People & Access. */
export const AGENT_IDENTITIES = [
  { name: "Sentry", addedDaysAgo: 41 },
  { name: "Triage", addedDaysAgo: 41 },
  { name: "Warden", addedDaysAgo: 41 },
  { name: "Scribe", addedDaysAgo: 41 },
];
/** An unused break-glass code issued yesterday, so the list shows a pending person before anyone adds one. */
export const SEED_PENDING = { role: "legal" as OperatorRole, nameHint: "Outside counsel", createdBy: "RK", hoursAgo: 3 };
export const CODE_TTL_HOURS = 24;

// ------------------------------------------------------------------ messages
export interface ScriptMessage extends Timed {
  ch: ChannelId;
  /** a person's name (RK) or an agent (Sentry) */
  who: string;
  text: string;
  action?: "review";
  system?: boolean;
}
export const MESSAGES: ScriptMessage[] = [
  // #command: agents post key updates automatically, the commander answers
  { ch: "#command", t: -1, who: "Scribe", system: true, text: "Break-glass channel is quiet. 6 of 6 identities verified." },
  { ch: "#command", t: 1.0, who: "Sentry", text: "INC-0419 opened, critical. Suspected guest-to-host escape via the vGPU path on b14-gpu-07." },
  { ch: "#command", t: 1.8, who: "Triage", text: "Blast radius 0.87: 1 host, 11 co-resident guests, 2 exposed tokens. Management plane reachable, not compromised." },
  { ch: "#command", t: 2.4, who: "Warden", text: "Reversible containment is running: network cut, tokens revoked, host cordoned, guest paused." },
  { ch: "#command", t: 3.1, who: "RK", text: "Copy. I have command. Legal and exec, stand by in your channels." },
  { ch: "#command", t: 3.5, who: "AL", text: "Corp IT reports ransomware encrypting the FIN-02 file share. Different network, same hour. Tracking it here as a parallel event." },
  { ch: "#command", t: 3.7, who: "Triage", text: "The billing database shows a read from a corp service account in the same window. Marked Accessed. Not known yet if rows left." },
  { ch: "#command", t: 4.6, who: "Scribe", text: "Guest memory captured and hashed (sha256 9f3c…e1a0). Evidence is stored off the network." },
  { ch: "#command", t: 5.3, who: "Warden", text: "11 of 11 co-resident guests are running on clean hosts." },
  { ch: "#command", t: 5.5, who: "Warden", text: "Quarantining b14-gpu-07 needs a human. Approval requested.", action: "review" },
  { ch: "#command", u: 0.0, who: "RK", text: "Approved quarantine of b14-gpu-07." },
  { ch: "#command", u: 2.0, who: "Warden", text: "b14-gpu-07 quarantined. The escape stopped at the hypervisor boundary." },
  { ch: "#command", u: 2.4, who: "Triage", text: "Escape scope closed: 0 co-resident guests affected. Two data items stay open: FIN-02 (locked) and the billing database (accessed)." },
  { ch: "#command", u: 5.0, who: "Scribe", text: "Report INC-0419 filed: 20 entries, 1 human approval, 3 evidence files." },

  // #legal
  { ch: "#legal", t: -1, who: "Scribe", system: true, text: "Counsel can see the live brief here. Nothing is open." },
  { ch: "#legal", t: 3.6, who: "JT", text: "Seen. Starting a notification assessment. Is any customer data involved?" },
  { ch: "#legal", t: 4.0, who: "Scribe", text: "Possibly. The billing database shows access in the window. Nothing is confirmed taken. The scope list has the detail and I will keep it current." },
  { ch: "#legal", u: 1.0, who: "JT", text: "Noted. I will treat the notification clocks as not started until materiality is decided." },
  { ch: "#legal", u: 3.0, who: "Scribe", text: "A draft timeline for counsel is attached to the brief." },

  // #exec
  { ch: "#exec", t: -1, who: "Scribe", system: true, text: "Executives get short, plain-language updates here." },
  { ch: "#exec", t: 3.4, who: "CEO", text: "Are customers affected?" },
  { ch: "#exec", t: 3.9, who: "Scribe", text: "Not confirmed. The affected server's workloads moved to safe servers. One billing system shows access and we are checking whether anything was copied." },
  { ch: "#exec", u: 0.6, who: "CEO", text: "Understood. Update me every 30 minutes, and tell me the moment you know about the billing data." },
  { ch: "#exec", u: 3.0, who: "AL", text: "Containment held in the data center. The file share is still locked and IT is restoring from offline backup. I will brief the board chair once the root cause is confirmed." },

  // #comms-pr
  { ch: "#comms-pr", t: -1, who: "Scribe", system: true, text: "Nothing to publish. A holding statement template is ready." },
  { ch: "#comms-pr", t: 4.2, who: "PR", text: "Do we need a public statement?" },
  { ch: "#comms-pr", t: 4.7, who: "Scribe", text: "Not yet. No customer data loss is confirmed. A holding statement is drafted and ready." },
  { ch: "#comms-pr", u: 1.4, who: "PR", text: "Holding statement approved internally. We are not publishing." },

  // #vendors
  { ch: "#vendors", t: -1, who: "Scribe", system: true, text: "Vendor contacts are verified out-of-band." },
  { ch: "#vendors", t: 4.4, who: "AL", text: "Cloud vendor: please confirm the hypervisor patch status for the vGPU driver." },
  { ch: "#vendors", t: 5.0, who: "CV", text: "A fix is in the vGPU driver release and staged for review. Confirming the details now." },
  { ch: "#vendors", u: 2.8, who: "CV", text: "Confirmed: the patch closes this path. Waiting on your go to roll it out." },
];

// ------------------------------------------------------------------ tasks and decisions
export interface ScriptTask {
  key: number;
  title: string;
  ownerRole: string;
  steps: (Timed & { status: TaskStatus })[];
}
export const TASKS: ScriptTask[] = [
  { key: 1, title: "Approve host quarantine", ownerRole: "commander", steps: [{ t: 5.5, status: "open" }, { u: 0.0, status: "done" }] },
  { key: 2, title: "Assess notification obligations", ownerRole: "legal", steps: [{ t: 3.6, status: "doing" }, { u: 3.0, status: "done" }] },
  { key: 3, title: "Prepare a holding statement", ownerRole: "comms", steps: [{ t: 4.2, status: "doing" }, { t: 4.7, status: "done" }] },
  { key: 4, title: "Confirm the hypervisor patch", ownerRole: "vendor", steps: [{ t: 4.4, status: "doing" }, { u: 2.8, status: "done" }] },
  { key: 5, title: "Isolate file servers and restore FIN-02", ownerRole: "responder", steps: [{ t: 3.6, status: "doing" }] },
  { key: 6, title: "Check if billing records left the network", ownerRole: "responder", steps: [{ t: 3.8, status: "open" }, { u: 1.0, status: "doing" }] },
  { key: 7, title: "Brief the board chair", ownerRole: "exec", steps: [{ u: 0.8, status: "open" }, { u: 3.0, status: "doing" }] },
];
export interface ScriptDecision extends Timed {
  key: number;
  by: string;
  text: string;
}
export const DECISIONS: ScriptDecision[] = [
  { key: 1, t: 2.0, by: "Policy", text: "Six reversible containment steps authorized by playbook guest-escape v3" },
  { key: 2, t: 3.1, by: "RK", text: "Incident Commander assumed command" },
  { key: 3, t: 3.7, by: "AL", text: "FIN-02 ransomware is tracked in this war room as a parallel event" },
  { key: 4, u: 0.0, by: "RK", text: "Quarantine b14-gpu-07 approved by RK" },
];

// ------------------------------------------------------------------ the brief
export type BriefStage = "quiet" | "detect" | "contain" | "scope" | "approval" | "quarantine" | "contained";
export interface BriefDef {
  text: [string, string][];
  known: string[];
  unknown: string[];
}
const WHAT = "An AI workload inside a virtual machine tried to break out and reach the server underneath it.";
const WHAT_RW = `${WHAT} Separately, ransomware is locking a corporate file share.`;
const KNOW_BASE = ["It started on one server, b14-gpu-07", "It was stopped before the management network", "2 exposed passwords are revoked"];
const KNOW_RW = [...KNOW_BASE, "File share FIN-02 is locked by ransomware"];
const DONT_RW = ["Whether billing records left the network", "Whether the escape and the ransomware are one attacker", "How the attacker found the flaw"];
export const BRIEFS: Record<BriefStage, BriefDef> = {
  quiet: {
    text: [
      ["What happened", "Nothing to report. All systems are normal."],
      ["What is contained", "Nothing to contain."],
      ["Impact", "No customers affected. No data in scope."],
      ["What we need from you", "Nothing. Keep your break-glass sign-in somewhere safe."],
    ],
    known: ["All 6 stakeholder identities are verified out-of-band", "This channel runs outside the company network", "The last incident closed 6 days ago"],
    unknown: ["Nothing is open right now"],
  },
  detect: {
    text: [
      ["What happened", WHAT],
      ["What is contained", "Not yet. Our detection agent caught it within a second and is checking how far it got."],
      ["Impact", "Not known yet. One server out of 2,048 is involved."],
      ["What we need from you", "Nothing yet. Please stay in this channel."],
    ],
    known: ["It started on one server, b14-gpu-07", "It was detected within 1 second", "Our own tools are working"],
    unknown: ["Whether any data was read", "How far the attacker got"],
  },
  contain: {
    text: [
      ["What happened", WHAT],
      ["What is contained", "Its network and passwords are cut off, the server is fenced off, and the workload is paused."],
      ["Impact", "No data confirmed lost so far. 11 other workloads are moving to safe servers."],
      ["What we need from you", "Legal: start a notification assessment. PR: have a holding statement ready."],
    ],
    known: KNOW_BASE,
    unknown: ["Whether any data was read first", "How the attacker found the flaw"],
  },
  scope: {
    text: [
      ["What happened", WHAT_RW],
      ["What is contained", "The escape is being contained: network and passwords cut off, server fenced off. The ransomware is on a different network and IT is isolating it."],
      ["Impact", "File share FIN-02 is locked. The billing database shows access in the window. No data confirmed taken."],
      ["What we need from you", "Legal: start the notification assessment. IT: isolate corporate file servers. PR: have a holding statement ready."],
    ],
    known: KNOW_RW,
    unknown: DONT_RW,
  },
  approval: {
    text: [
      ["What happened", WHAT_RW],
      ["What is contained", "Everything that can be undone is done. One step is left and needs a person."],
      ["Impact", "File share FIN-02 is locked. The billing database shows access that is under review. No data confirmed taken."],
      ["What we need from you", "Incident Commander: approve taking the server out of service."],
    ],
    known: ["11 other workloads moved to safe servers", ...KNOW_RW.slice(1)],
    unknown: DONT_RW,
  },
  quarantine: {
    text: [
      ["What happened", WHAT_RW],
      ["What is contained", "The Incident Commander approved. The server is being taken out of service now."],
      ["Impact", "File share FIN-02 is locked. The billing database shows access that is under review. No data confirmed taken."],
      ["What we need from you", "Nothing right now. This will take a couple of seconds."],
    ],
    known: ["Approved by RK", ...KNOW_RW.slice(1)],
    unknown: DONT_RW,
  },
  contained: {
    text: [
      ["What happened", "A suspected escape from an AI workload was stopped at the edge of its virtual machine. A separate ransomware event is locking a corporate file share."],
      ["What is contained", "The escape was contained in 9.4 seconds. The server is out of service and its workloads run elsewhere. The ransomware is not contained yet."],
      ["Impact", "0 other workloads affected. FIN-02 is locked. The billing database shows access that is still being investigated."],
      ["What we need from you", "Legal: decide on notification. IT: restore FIN-02 from offline backup. Vendor: confirm the hypervisor patch."],
    ],
    known: ["The escape stopped at the hypervisor boundary", "Evidence is captured and hashed", "Approved by RK", "FIN-02 is locked and a restore from offline backup is under way"],
    unknown: ["Whether billing records left the network", "Whether the two events are connected", "The root cause. The vendor is checking"],
  },
};
/** When each stage begins (for the "updated" stamp). detect starts at the alert. */
export const STAGE_AT: Record<BriefStage, Timed> = {
  quiet: { t: -1 },
  detect: { t: 1.0 },
  contain: { t: 2.0 },
  scope: { t: 3.7 },
  approval: { t: 5.5 },
  quarantine: { u: 0.0 },
  contained: { u: 2.0 },
};

// ------------------------------------------------------------------ data scope
export interface ScriptAsset {
  id: number;
  name: string;
  system: string;
  classification: Classification;
  records: number;
  steps: (Timed & { status: AssetStatus; note: string; by: string })[];
}
export const ASSETS: ScriptAsset[] = [
  {
    id: 1,
    name: "Tenant model weights",
    system: "DFW-2 · tenant vm-7f3a",
    classification: "restricted",
    records: 142,
    steps: [
      { t: 1.0, status: "accessed", note: "Loaded in the compromised guest, so the attacker could reach the tenant's own model files. Nothing shows them leaving.", by: "Sentry" },
      { t: 4.6, status: "evidence_preserved", note: "Snapshot taken with the memory capture. 142 shards hashed and held in the evidence vault.", by: "Scribe" },
    ],
  },
  {
    id: 2,
    name: "Guest memory image",
    system: "DFW-2 · evidence vault",
    classification: "restricted",
    records: 1,
    steps: [{ t: 4.6, status: "evidence_preserved", note: "vm-7f3a, 64 GiB, captured over the trusted management path. sha256 9f3c…e1a0. Read-only, off the network.", by: "Warden" }],
  },
  {
    id: 3,
    name: "Workload tokens",
    system: "DFW-2 · workload IAM",
    classification: "restricted",
    records: 2,
    steps: [
      { t: 1.0, status: "exfil_suspected", note: "agent-7f3 used a token outside its scope at T+0.85 s. Treated as exfiltrated.", by: "Sentry" },
      { t: 2.9, status: "exfil_suspected", note: "Both tokens revoked by Warden at T+2.9 s. Still marked suspected until the flow logs are read. New tokens issue only after review.", by: "Warden" },
    ],
  },
  {
    id: 4,
    name: "Management-plane credentials",
    system: "DFW-2 · BMC / IPMI, VLAN 40",
    classification: "restricted",
    records: 14,
    steps: [
      { t: 1.8, status: "intact", note: "Reachable from b14-gpu-07 (flow to :623). No sign of use.", by: "Triage" },
      { u: 1.4, status: "intact", note: "VLAN 40 pruned from the host at quarantine. No sign of use.", by: "Warden" },
    ],
  },
  {
    id: 5,
    name: "Co-resident tenant volumes",
    system: "DFW-2 · b14-gpu-07",
    classification: "confidential",
    records: 11,
    steps: [
      { t: 1.8, status: "intact", note: "11 guests share this host. No cross-tenant access seen.", by: "Triage" },
      { t: 5.3, status: "intact", note: "All 11 failed over to clean hosts. No cross-tenant access seen.", by: "Warden" },
    ],
  },
  {
    id: 6,
    name: "Corporate file share FIN-02",
    system: "Corp IT · file server NAS-02",
    classification: "confidential",
    records: 184220,
    steps: [
      { t: 3.5, status: "locked_ransomware", note: "Ransomware began encrypting at 02:14:10. Corp EDR isolated the host. A separate network from the data center. Same-hour timing is not yet explained.", by: "AL" },
      { u: 3.0, status: "locked_ransomware", note: "IT confirms the 01:00 offline backup is clean. Restore starts once the file server is rebuilt.", by: "AL" },
    ],
  },
  {
    id: 7,
    name: "Customer billing database",
    system: "Corp IT · billing Postgres",
    classification: "restricted",
    records: 2418300,
    steps: [
      { t: 3.7, status: "accessed", note: "Read by service account svc-billing-sync during the window. Not known yet whether rows were copied.", by: "Triage" },
      { u: 1.0, status: "accessed", note: "Query logs pulled: 3 large SELECTs from 10.20.4.17 (corp IT). Reviewing for exfiltration.", by: "Triage" },
    ],
  },
];

// ------------------------------------------------------------------ incident documentation
export const CATEGORY = "Unauthorized access · guest-to-host escape";
export interface ImpactStep extends Timed {
  functional: string;
  information: string;
  recoverability: string;
}
/** NIST SP 800-61 impact ratings, filled in as the agents learn more. The last visible step wins. */
export const IMPACT: ImpactStep[] = [
  { t: 0, functional: "Assessing", information: "Assessing", recoverability: "Not yet determined" },
  { t: 1.8, functional: "Low · 1 host at risk, 11 guests can fail over", information: "Suspected · 2 workload tokens exposed", recoverability: "Supplemented · host reimage likely" },
  {
    t: 3.5,
    functional: "Medium · finance file share FIN-02 locked (corp IT). Data center impact low",
    information: "Privacy breach suspected · billing DB accessed, 2 tokens suspected exfiltrated",
    recoverability: "Supplemented · reimage host, patch the driver, restore FIN-02 from backup",
  },
  {
    u: 2.0,
    functional: "Medium · FIN-02 locked. Data center back to normal with 1 host out of service",
    information: "Privacy breach suspected · billing DB access under review, nothing confirmed taken",
    recoverability: "Supplemented · reimage host, patch the driver, restore FIN-02 from backup",
  },
];

export interface ScriptEvent extends Timed {
  actor: string;
  kind: string;
  text: string;
}
/** The ship's log, as Scribe files it. 20 entries. Phase changes are kind "state". */
export const EVENTS: ScriptEvent[] = [
  { t: 0.0, actor: "Sentry", kind: "signal", text: "VMM audit: unexpected ioctl 0xC0186441 on vm-7f3a" },
  { t: 0.3, actor: "Sentry", kind: "signal", text: "IOMMU fault: DMA write outside guest range" },
  { t: 0.5, actor: "Sentry", kind: "signal", text: "host EDR: qemu spawned /bin/sh" },
  { t: 1.0, actor: "Sentry", kind: "incident", text: "Correlated 6 signals, opened INC-0419" },
  { t: 1.0, actor: "Sentry", kind: "state", text: "Phase set to Detection and analysis" },
  { t: 1.8, actor: "Triage", kind: "finding", text: "Attack graph: 1 suspect host, 11 co-resident guests, 2 exposed tokens, mgmt plane reachable" },
  { t: 2.0, actor: "Warden", kind: "state", text: "Phase set to Containment" },
  { t: 2.4, actor: "Warden", kind: "action", text: "Isolated network: detached vNIC of vm-7f3a" },
  { t: 2.9, actor: "Warden", kind: "action", text: "Revoked workload credentials (2 tokens)" },
  { t: 3.3, actor: "Warden", kind: "action", text: "Cordoned host b14-gpu-07" },
  { t: 3.5, actor: "AL", kind: "finding", text: "Corp IT reported ransomware on FIN-02. Tracked as a parallel event" },
  { t: 3.7, actor: "Triage", kind: "finding", text: "Billing database read by a corp service account in the window. Marked Accessed" },
  { t: 3.8, actor: "Warden", kind: "action", text: "Paused guest vm-7f3a" },
  { t: 4.6, actor: "Warden", kind: "action", text: "Captured guest memory via trusted management path" },
  { t: 5.3, actor: "Warden", kind: "action", text: "Failed over 11 co-resident guests to clean hosts" },
  { t: 5.5, actor: "Warden", kind: "approval_requested", text: "Requested approval: quarantine host b14-gpu-07" },
  { u: 0.0, actor: "RK", kind: "approval", text: "Approved quarantine with ⌘↵" },
  { u: 2.0, actor: "Warden", kind: "action", text: "Quarantined host b14-gpu-07. Incident contained" },
  { u: 3.0, actor: "RK", kind: "state", text: "Phase set to Eradication" },
  { u: 5.0, actor: "Scribe", kind: "report", text: "Filed report, synced to 6 operators" },
];

export interface ScriptProposal extends Timed {
  id: number;
  agent: string;
  action: string;
  target: string;
  reason: string;
  reversible: boolean;
  /** "approval" proposals wait for a human */
  mode: "auto" | "approval";
}
export const PROPOSALS: ScriptProposal[] = [
  { id: 1, t: 2.4, agent: "Warden", action: "isolate_network", target: "vm-7f3a", reason: "Cut the guest's network. Reversible.", reversible: true, mode: "auto" },
  { id: 2, t: 2.9, agent: "Warden", action: "revoke_credentials", target: "agent-7f3", reason: "2 tokens used outside scope. Reissue is possible.", reversible: true, mode: "auto" },
  { id: 3, t: 3.3, agent: "Warden", action: "cordon_host", target: "b14-gpu-07", reason: "No new placements while the host is untrusted.", reversible: true, mode: "auto" },
  { id: 4, t: 3.8, agent: "Warden", action: "pause_guest", target: "vm-7f3a", reason: "Freeze vCPUs so the memory can be captured.", reversible: true, mode: "auto" },
  { id: 5, t: 4.6, agent: "Warden", action: "capture_memory", target: "vm-7f3a", reason: "Read-only capture over the trusted management path.", reversible: true, mode: "auto" },
  { id: 6, t: 5.3, agent: "Warden", action: "failover_guests", target: "11 co-resident guests", reason: "Move neighbours to clean hosts.", reversible: true, mode: "auto" },
  { id: 7, t: 5.5, agent: "Warden", action: "quarantine_host", target: "b14-gpu-07", reason: "qemu on this host spawned a shell after a DMA fault.", reversible: true, mode: "approval" },
];

// ------------------------------------------------------------------ evidence
export interface ScriptEvidence extends Omit<EvidenceItem, "collectedAt" | "custody"> {
  landT: number;
  custody: (Timed & { who: string; action: string })[];
}
export const EVIDENCE_ITEMS: ScriptEvidence[] = [
  {
    id: 1,
    name: "vm-7f3a.mem",
    size: "64 GiB",
    sha256: "9f3c92ff5bc41ac3b4436d5ebe96f6d428aefefc9eb79debb1f27ebe4367e1a0",
    source: "Guest memory of vm-7f3a, over the trusted management path",
    collectedBy: "Warden",
    landT: 4.6,
    custody: [
      { t: 4.6, who: "Warden", action: "Captured, read-only" },
      { t: 4.6, who: "Scribe", action: "Hashed, SHA-256 recorded" },
      { t: 4.8, who: "Evidence vault", action: "Stored, off the network, write-once" },
      { u: 4.0, who: "RK", action: "Custody accepted (Incident Commander)" },
    ],
  },
  {
    id: 2,
    name: "qemu-2231.core",
    size: "1.2 GiB",
    sha256: "41be064ff1c3715de0b49949a851ca52c495d5dd26ea296aebf01955154407d2",
    source: "Core dump of the qemu process on b14-gpu-07",
    collectedBy: "Warden",
    landT: 5.0,
    custody: [
      { t: 5.0, who: "Warden", action: "Captured from the paused host process" },
      { t: 5.0, who: "Scribe", action: "Hashed, SHA-256 recorded" },
      { t: 5.1, who: "Evidence vault", action: "Stored, off the network, write-once" },
      { u: 4.0, who: "RK", action: "Custody accepted (Incident Commander)" },
    ],
  },
  {
    id: 3,
    name: "b14-gpu-07-flows.pcap",
    size: "38 MB",
    sha256: "c0a7679a2de131f8ecb44c42000e98bd728f328a26edd6cf5add912a7e195f19",
    source: "East-west flow capture for b14-gpu-07, 02:14:07 onward",
    collectedBy: "Sentry",
    landT: 5.3,
    custody: [
      { t: 5.3, who: "Sentry", action: "Exported from the flow recorder" },
      { t: 5.3, who: "Scribe", action: "Hashed, SHA-256 recorded" },
      { t: 5.4, who: "Evidence vault", action: "Stored, off the network, write-once" },
      { u: 4.0, who: "RK", action: "Custody accepted (Incident Commander)" },
    ],
  },
];
