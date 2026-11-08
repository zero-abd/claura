// War Room: every string, person, message, task and timing the view shows.
//
// This module is plain data (no DOM, no engine imports) so live SpacetimeDB rows can replace it later:
// swap these exports for subscriptions with the same shapes. Timing convention matches script.ts:
//   t = script seconds since the alert, u = seconds after the human approval.
//
// The War Room is the out-of-band coordination channel: it runs on SpacetimeDB's cloud, outside the
// data center and off the corporate network. Stakeholders sign in with break-glass identities issued
// before any incident, so nobody needs email, phones or the compromised network.

export type ChannelId = "#command" | "#legal" | "#exec" | "#comms-pr" | "#vendors";
export type PersonId = "RK" | "JT" | "AL" | "CEO" | "PR" | "CV";
export type AgentSpeaker = "sentry" | "triage" | "warden" | "scribe";
export type Speaker = PersonId | AgentSpeaker;

export const BANNER = "Out-of-band channel · not on the corporate network · email and phones not required";

export interface Channel {
  id: ChannelId;
  blurb: string;
}
export const CHANNELS: Channel[] = [
  { id: "#command", blurb: "Incident commander, agents and responders" },
  { id: "#legal", blurb: "Counsel and notification obligations" },
  { id: "#exec", blurb: "Executives. Plain-language updates only" },
  { id: "#comms-pr", blurb: "Holding statements and press" },
  { id: "#vendors", blurb: "Cloud vendor and suppliers" },
];

export interface Person {
  id: PersonId;
  role: string;
  initials: string; // what the avatar shows. Operators use initials; others use their role code.
  joinT: number | null; // script time they come online. null = on shift from the start
}
export const PEOPLE: Person[] = [
  { id: "RK", role: "Incident Commander", initials: "RK", joinT: null },
  { id: "JT", role: "Legal counsel", initials: "JT", joinT: null },
  { id: "AL", role: "CISO", initials: "AL", joinT: null },
  { id: "CEO", role: "CEO", initials: "CEO", joinT: 3.4 },
  { id: "PR", role: "PR lead", initials: "PR", joinT: 4.2 },
  { id: "CV", role: "Cloud vendor", initials: "CV", joinT: 4.4 },
];

export interface Message {
  ch: ChannelId;
  t?: number;
  u?: number;
  who: Speaker;
  text: string;
  /** shows a "Review and approve" button while the approval is pending */
  action?: "review";
  /** a quiet system line, drawn without an avatar */
  system?: boolean;
}
export const MESSAGES: Message[] = [
  // #command: agents post key updates automatically, the commander answers
  { ch: "#command", t: -1, who: "scribe", system: true, text: "Break-glass channel is quiet. 6 of 6 identities verified." },
  { ch: "#command", t: 1.0, who: "sentry", text: "INC-0419 opened, critical. Suspected guest-to-host escape via the vGPU path on b14-gpu-07." },
  { ch: "#command", t: 1.8, who: "triage", text: "Blast radius 0.87: 1 host, 11 co-resident guests, 2 exposed tokens. Management plane reachable, not compromised." },
  { ch: "#command", t: 2.4, who: "warden", text: "Reversible containment is running: network cut, tokens revoked, host cordoned, guest paused." },
  { ch: "#command", t: 3.1, who: "RK", text: "Copy. I have command. Legal and exec, stand by in your channels." },
  { ch: "#command", t: 4.6, who: "scribe", text: "Guest memory captured and hashed (sha256 9f3c…e1a0). Evidence is stored off the network." },
  { ch: "#command", t: 5.3, who: "warden", text: "11 of 11 co-resident guests are running on clean hosts." },
  { ch: "#command", t: 5.5, who: "warden", text: "Quarantining b14-gpu-07 needs a human. Approval requested.", action: "review" },
  { ch: "#command", u: 0.0, who: "RK", text: "Approved quarantine of b14-gpu-07." },
  { ch: "#command", u: 2.0, who: "warden", text: "b14-gpu-07 quarantined. The escape stopped at the hypervisor boundary." },
  { ch: "#command", u: 2.4, who: "triage", text: "Scope closed. 0 co-resident guests affected." },
  { ch: "#command", u: 5.0, who: "scribe", text: "Report INC-0419 filed: 15 entries, 1 human approval, 3 evidence files." },

  // #legal
  { ch: "#legal", t: -1, who: "scribe", system: true, text: "Counsel can see the live brief here. Nothing is open." },
  { ch: "#legal", t: 3.6, who: "JT", text: "Seen. Starting a notification assessment. Is any customer data involved?" },
  { ch: "#legal", t: 4.0, who: "scribe", text: "Nothing shows customer data was read. The memory capture is being analysed and I will confirm." },
  { ch: "#legal", u: 1.0, who: "JT", text: "Noted. I will treat the notification clocks as not started until materiality is decided." },
  { ch: "#legal", u: 3.0, who: "scribe", text: "A draft timeline for counsel is attached to the brief." },

  // #exec
  { ch: "#exec", t: -1, who: "scribe", system: true, text: "Executives get short, plain-language updates here." },
  { ch: "#exec", t: 3.4, who: "CEO", text: "Are customers affected?" },
  { ch: "#exec", t: 3.9, who: "scribe", text: "Not so far. One server was involved and its workloads moved to safe servers. We have seen no customer data accessed." },
  { ch: "#exec", u: 0.6, who: "CEO", text: "Good. Update me every 30 minutes." },
  { ch: "#exec", u: 3.0, who: "AL", text: "Containment held. I will brief the board chair once the root cause is confirmed." },

  // #comms-pr
  { ch: "#comms-pr", t: -1, who: "scribe", system: true, text: "Nothing to publish. A holding statement template is ready." },
  { ch: "#comms-pr", t: 4.2, who: "PR", text: "Do we need a public statement?" },
  { ch: "#comms-pr", t: 4.7, who: "scribe", text: "Not yet. No customer impact is confirmed. A holding statement is drafted and ready." },
  { ch: "#comms-pr", u: 1.4, who: "PR", text: "Holding statement approved internally. We are not publishing." },

  // #vendors
  { ch: "#vendors", t: -1, who: "scribe", system: true, text: "Vendor contacts are verified out-of-band." },
  { ch: "#vendors", t: 4.4, who: "AL", text: "Cloud vendor: please confirm the hypervisor patch status for the vGPU driver." },
  { ch: "#vendors", t: 5.0, who: "CV", text: "A fix is in the vGPU driver release and staged for review. Confirming the details now." },
  { ch: "#vendors", u: 2.8, who: "CV", text: "Confirmed: the patch closes this path. Waiting on your go to roll it out." },
];

export interface TaskStep {
  t?: number;
  u?: number;
  status: string;
  tone: "idle" | "busy" | "hot" | "done";
}
export interface Task {
  id: string;
  title: string;
  owner: PersonId;
  steps: TaskStep[]; // first step shows from the moment the task appears
}
export const TASKS: Task[] = [
  {
    id: "approve",
    title: "Approve host quarantine",
    owner: "RK",
    steps: [
      { t: 5.5, status: "Waiting", tone: "hot" },
      { u: 0.0, status: "Done", tone: "done" },
    ],
  },
  {
    id: "legal",
    title: "Assess notification obligations",
    owner: "JT",
    steps: [
      { t: 3.6, status: "In progress", tone: "busy" },
      { u: 3.0, status: "Draft ready", tone: "done" },
    ],
  },
  {
    id: "pr",
    title: "Prepare a holding statement",
    owner: "PR",
    steps: [
      { t: 4.2, status: "In progress", tone: "busy" },
      { t: 4.7, status: "Ready", tone: "done" },
    ],
  },
  {
    id: "patch",
    title: "Confirm the hypervisor patch",
    owner: "CV",
    steps: [
      { t: 4.4, status: "Asked", tone: "busy" },
      { t: 5.0, status: "In progress", tone: "busy" },
      { u: 2.8, status: "Confirmed", tone: "done" },
    ],
  },
  {
    id: "board",
    title: "Brief the board chair",
    owner: "AL",
    steps: [
      { u: 0.8, status: "Not started", tone: "idle" },
      { u: 3.0, status: "Scheduled", tone: "busy" },
    ],
  },
];

export interface Decision {
  t?: number;
  u?: number;
  who: string;
  what: string;
  by: string;
  /** pending until `resolvedU` (seconds after approval); then it becomes the decision */
  pendingText?: string;
}
export const DECISIONS: Decision[] = [
  { t: 2.0, who: "Playbook", what: "Six reversible containment steps authorized", by: "guest-escape v3 policy" },
  { t: 3.1, who: "RK", what: "Incident Commander assumed command", by: "RK · Incident Commander" },
  {
    u: 0.0,
    who: "RK",
    what: "Quarantine of b14-gpu-07 approved with ⌘↵",
    by: "RK · shift lead",
    pendingText: "Quarantine of b14-gpu-07 is waiting for RK",
  },
];

export interface Obligation {
  name: string;
  rule: string;
  big: string;
  unit: string;
}
// Examples only. Always labelled "example obligations, confirm with counsel" in the UI.
export const OBLIGATIONS_LABEL = "example obligations, confirm with counsel";
export const OBLIGATIONS: Obligation[] = [
  { name: "SEC 8-K Item 1.05", rule: "Within 4 business days after a materiality determination", big: "4", unit: "business days" },
  { name: "GDPR", rule: "72 hours to the supervisory authority, once personal data is involved", big: "72", unit: "hours" },
];

// ------------------------------------------------------------------ the brief
export type BriefStage = "quiet" | "detect" | "contain" | "approval" | "quarantine" | "contained";
export interface Brief {
  stamp: string;
  happened: string;
  contained: string;
  impact: string;
  need: string;
  know: string[];
  dont: string[];
}
const KNOW_CONTAIN = [
  "It started on one server, b14-gpu-07",
  "It was stopped before the management network",
  "2 exposed passwords are revoked",
];
const DONT = ["Whether any data was read first", "How the attacker found the flaw"];
export const BRIEFS: Record<BriefStage, Brief> = {
  quiet: {
    stamp: "Scribe · standing by",
    happened: "Nothing to report. All systems are normal.",
    contained: "Nothing to contain.",
    impact: "No customers affected.",
    need: "Nothing. Keep your break-glass sign-in somewhere safe.",
    know: ["All 6 stakeholder identities are verified", "This channel runs outside the company network", "The last incident closed 6 days ago"],
    dont: ["Nothing is open right now"],
  },
  detect: {
    stamp: "Scribe · T+1.0s",
    happened: "An AI workload inside a virtual machine tried to break out and reach the server underneath it.",
    contained: "Not yet. Our detection agent caught it within a second and is checking how far it got.",
    impact: "Not known yet. One server out of 2,048 is involved.",
    need: "Nothing yet. Please stay in this channel.",
    know: ["It started on one server, b14-gpu-07", "It was detected within 1 second", "Our own tools are working"],
    dont: ["Whether any data was read", "How far the attacker got"],
  },
  contain: {
    stamp: "Scribe · T+2.4s",
    happened: "An AI workload inside a virtual machine tried to break out and reach the server underneath it.",
    contained: "Its network and passwords are cut off, the server is fenced off, and the workload is paused.",
    impact: "No customer data accessed so far. 11 other workloads are moving to safe servers.",
    need: "Legal: start a notification assessment. PR: have a holding statement ready.",
    know: KNOW_CONTAIN,
    dont: DONT,
  },
  approval: {
    stamp: "Scribe · T+5.5s",
    happened: "An AI workload inside a virtual machine tried to break out and reach the server underneath it.",
    contained: "Everything that can be undone is done. One step is left and needs a person.",
    impact: "No customer data accessed so far. Other workloads are running normally.",
    need: "Incident Commander: approve taking the server out of service.",
    know: ["11 other workloads moved to safe servers", ...KNOW_CONTAIN.slice(1)],
    dont: DONT,
  },
  quarantine: {
    stamp: "Scribe · T+7.4s",
    happened: "An AI workload inside a virtual machine tried to break out and reach the server underneath it.",
    contained: "The Incident Commander approved. The server is being taken out of service now.",
    impact: "No customer data accessed so far. Other workloads are running normally.",
    need: "Nothing right now. This will take a couple of seconds.",
    know: ["Approved by RK at T+7.4 s", ...KNOW_CONTAIN.slice(1)],
    dont: DONT,
  },
  contained: {
    stamp: "Scribe · T+9.4s",
    happened: "A suspected escape from an AI workload was stopped at the edge of its virtual machine.",
    contained: "Contained in 9.4 seconds. The server is out of service and its workloads run elsewhere.",
    impact: "0 other workloads affected. No sign that customer data was accessed.",
    need: "Legal: decide on notification. Vendor: confirm the hypervisor patch.",
    know: ["Stopped at the hypervisor boundary", "Evidence is captured and hashed", "Approved by RK at T+7.4 s"],
    dont: ["Whether any data was read before containment", "The root cause. The vendor is checking"],
  },
};
