// Scripted, fictional demo data for the Claura prototype.
// Times are seconds of script time since play().
//  - `t`  : absolute time, before the approval gate.
//  - `u`  : seconds after the human approval (approve()).
// With the canonical approval at T+7.4 s, `u` maps to T+(7.4 + u).

export const APPROVAL_AT = 5.5; // script pauses here, waiting for a human
export const CANON_APPROVE = 7.4; // canonical approval moment used by ?phase= and play({approveAt})
export const ISOLATE_DUR = 2.0; // approval -> contained (lands the counter on 9.4 s)
export const CONTAINED_AT = 9.4; // the counter freezes here
export const SCRIBE_FILED_U = 5.0; // report filed at u=5.0 (T+12.4)
export const SCRIPT_END_U = 6.6; // last scripted motion (T+14.0)

export const FACILITY = "DFW-2 · AI Compute Campus";
export const CLOCK_BASE = { h: 2, m: 14, s: 7 }; // 02:14:07, frozen until play()
export const TIMEZONE = "CST";

export const INCIDENT = {
  id: "INC-0419",
  title: "Suspected guest-to-host escape via the vGPU path",
  vm: "vm-7f3a",
  agent: "agent-7f3",
  host: "b14-gpu-07",
  where: "Hall B · rack 14",
};

export const RESOLUTION = "Contained in 9.4 s · 0 co-resident guests affected · memory captured";

export type Tone = "dim" | "info" | "hot" | "act" | "safe";
export interface LogLine {
  t?: number;
  u?: number;
  src: string;
  msg: string;
  tone: Tone;
}

export const LOGS: LogLine[] = [
  { t: 0.0, src: "vmm", msg: "VMM audit: unexpected ioctl 0xC0186441", tone: "hot" },
  { t: 0.15, src: "vgpu", msg: "vGPU mdev driver fault (vm-7f3a)", tone: "hot" },
  { t: 0.3, src: "iommu", msg: "IOMMU fault: DMA write outside guest range", tone: "hot" },
  { t: 0.5, src: "edr", msg: "host EDR: qemu spawned /bin/sh", tone: "hot" },
  { t: 0.7, src: "flow", msg: "east-west flow → 10.0.0.1:623 (IPMI)", tone: "hot" },
  { t: 0.85, src: "iam", msg: "workload identity agent-7f3 used token outside scope", tone: "hot" },
  { t: 1.0, src: "sentry", msg: "6 signals correlated · INC-0419 opened · critical", tone: "info" },
  {
    t: 1.8,
    src: "triage",
    msg: "attack graph: 1 suspect host · 11 co-resident guests · 2 exposed tokens · mgmt plane reachable",
    tone: "info",
  },
  { t: 2.4, src: "warden", msg: "vNIC detached (vm-7f3a) · flow to :623 dropped", tone: "act" },
  { t: 2.9, src: "warden", msg: "2 workload tokens revoked (agent-7f3)", tone: "act" },
  { t: 3.3, src: "warden", msg: "host b14-gpu-07 cordoned · no new placements", tone: "act" },
  { t: 3.5, src: "corp-edr", msg: "FIN-02 file share: mass rename + encrypt · ransomware", tone: "hot" },
  { t: 3.7, src: "triage", msg: "billing DB read by svc-billing-sync off schedule · marked Accessed", tone: "info" },
  { t: 3.8, src: "warden", msg: "vm-7f3a paused · vCPU 0–15 frozen", tone: "act" },
  { t: 4.6, src: "warden", msg: "guest memory captured via mgmt path · 64 GiB · sha256 9f3c…e1a0", tone: "act" },
  { t: 5.3, src: "warden", msg: "failover: 11/11 co-resident guests running on clean hosts", tone: "act" },
  { t: 5.5, src: "warden", msg: "approval requested · quarantine host b14-gpu-07", tone: "hot" },
  { u: 0.0, src: "approval", msg: "RK approved quarantine of b14-gpu-07 (⌘↵)", tone: "info" },
  { u: 0.7, src: "warden", msg: "b14-gpu-07 fabric ports down · removed from pool", tone: "act" },
  { u: 1.4, src: "warden", msg: "BMC b14-gpu-07: IPMI LAN off · mgmt VLAN 40 pruned", tone: "act" },
  { u: 2.0, src: "warden", msg: "host b14-gpu-07 quarantined · incident contained", tone: "safe" },
  { u: 5.0, src: "scribe", msg: "report INC-0419 filed · 20 entries · synced to 6 operators", tone: "info" },
];

export type AgentId = "sentry" | "triage" | "warden" | "scribe";
export type ChipTone = "idle" | "busy" | "hot" | "safe" | "done";
export interface Thought {
  t?: number;
  u?: number;
  text: string;
  status: string;
  tone: ChipTone;
  quiet?: boolean; // typed instantly, no timestamp emphasis
}
export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  thoughts: Thought[];
}

export const AGENTS: AgentDef[] = [
  {
    id: "sentry",
    name: "Sentry",
    role: "Detect",
    thoughts: [
      { t: -1, text: "Watching 61,207 sandboxes. Syscall baselines steady.", status: "Watching", tone: "idle", quiet: true },
      { t: 0.2, text: "VMM audit, mdev fault and IOMMU fault on vm-7f3a inside 300 ms.", status: "Correlating", tone: "busy" },
      { t: 0.6, text: "qemu spawned /bin/sh. Suspected guest-to-host escape via the vGPU path.", status: "Correlating", tone: "busy" },
      { t: 1.0, text: "qemu spawned /bin/sh. Suspected guest-to-host escape via the vGPU path.", status: "Escalated", tone: "hot", quiet: true },
      { u: 2.2, text: "Back on watch. Fleet rule added for ioctl 0xC0186441.", status: "Watching", tone: "idle" },
    ],
  },
  {
    id: "triage",
    name: "Triage",
    role: "Score blast radius",
    thoughts: [
      { t: -1, text: "No open incidents. Blast-radius model warm.", status: "Standing by", tone: "idle", quiet: true },
      { t: 1.0, text: "b14-gpu-07 runs 12 guests. 11 are co-resident with vm-7f3a.", status: "Scoring", tone: "busy" },
      { t: 1.5, text: "2 exposed tokens. The mgmt plane is reachable from this host, not compromised.", status: "Scoring", tone: "busy" },
      { t: 2.0, text: "2 exposed tokens. The mgmt plane is reachable from this host, not compromised.", status: "Scored 0.87", tone: "hot", quiet: true },
      { t: 3.7, text: "Billing database read by a corp service account in the same window. Marked Accessed in the data scope.", status: "Scoring", tone: "busy" },
      { u: 2.3, text: "Escape scope closed. 0 co-resident guests affected. Billing database stays open.", status: "Closed", tone: "done" },
    ],
  },
  {
    id: "warden",
    name: "Warden",
    role: "Contain",
    thoughts: [
      { t: -1, text: "Holding. Playbook guest-escape v3 loaded.", status: "Standing by", tone: "idle", quiet: true },
      { t: 2.0, text: "Reversible steps first: cut the network, pull credentials, cordon the host.", status: "Executing", tone: "busy" },
      { t: 3.3, text: "Pausing the guest, then capturing memory over the trusted mgmt path.", status: "Executing", tone: "busy" },
      { t: 4.6, text: "Failing 11 co-resident guests over to clean hosts. No migration off this host.", status: "Executing", tone: "busy" },
      { t: 5.4, text: "Quarantine takes b14-gpu-07 out of the pool. That step needs a human.", status: "Awaiting approval", tone: "hot" },
      { u: 0.1, text: "Approved. Taking b14-gpu-07 off the fabric and pruning its BMC VLAN.", status: "Quarantining", tone: "busy" },
      { u: 2.0, text: "Host quarantined. Escape stopped at the hypervisor boundary.", status: "Contained", tone: "safe" },
    ],
  },
  {
    id: "scribe",
    name: "Scribe",
    role: "Forensics",
    thoughts: [
      { t: -1, text: "Idle. INC-0418 filed 6 days ago.", status: "Idle", tone: "idle", quiet: true },
      { t: 2.5, text: "Logging each step. Hashing the memory capture as it lands.", status: "Recording", tone: "busy" },
      { u: 2.2, text: "Writing INC-0419: 20 entries, 1 human approval, 3 evidence files.", status: "Writing", tone: "busy" },
      { u: 5.0, text: "Report filed and synced to all 6 operators.", status: "Filed", tone: "done" },
    ],
  },
];

export interface Step {
  label: string;
  detail: string;
  start: number;
  end: number;
}
// Reversible actions first, then evidence. No live migration off a suspect host.
export const STEPS: Step[] = [
  { label: "Isolate network", detail: "detach vNIC of vm-7f3a", start: 2.0, end: 2.4 },
  { label: "Revoke workload credentials", detail: "agent-7f3 tokens", start: 2.4, end: 2.9 },
  { label: "Cordon host b14-gpu-07", detail: "no new placements", start: 2.9, end: 3.3 },
  { label: "Pause guest vm-7f3a", detail: "vCPUs frozen", start: 3.3, end: 3.8 },
  { label: "Capture guest memory", detail: "via trusted management path", start: 3.8, end: 4.6 },
  { label: "Fail over 11 co-resident guests", detail: "to clean hosts", start: 4.6, end: 5.3 },
];
export const FINAL_STEP = {
  label: "Quarantine host b14-gpu-07",
  reason: "qemu on this host spawned a shell after a DMA fault. Treat the host as untrusted until it is reimaged.",
  evidence: "6 correlated signals: IOMMU fault, vGPU mdev fault, VMM ioctl, qemu → /bin/sh, IPMI flow, token misuse",
  scope: "1 host · 11 guests failed over",
  rollback: "un-quarantine restores host to pool",
  button: "Approve quarantine",
};

// Titles match the War Room and People & Access: RK is the Incident Commander (shift lead, admin), JT is Legal
// counsel, AL is the CISO. Access roles (admin, legal, exec ...) live in the data layer.
export const OPERATORS = [
  { initials: "RK", role: "Incident Commander" },
  { initials: "JT", role: "Legal counsel" },
  { initials: "AL", role: "CISO" },
];
export const APPROVER = OPERATORS[0];

export const EVIDENCE = [
  { name: "vm-7f3a.mem", meta: "64 GiB · sha256 9f3c…e1a0" },
  { name: "qemu-2231.core", meta: "1.2 GiB · sha256 41be…07d2" },
  { name: "b14-gpu-07-flows.pcap", meta: "38 MB · sha256 c0a7…5f19" },
];

// Ambient "nominal" signal lines, generated from a fixed seed.
export const AMBIENT_TEMPLATES = [
  (h: string, n: number) => `${h} · nvlink ecc 0 · ${58 + (n % 9)}°C`,
  (_h: string, n: number) => `vm-${hex(n * 7919, 4)} · agent-${hex(n * 104729, 3)} · sandbox heartbeat ok`,
  (h: string) => `${h} · seccomp profile v14 verified`,
  (h: string, n: number) => `scheduler placed vm-${hex(n * 15485863, 4)} on ${h}`,
  (_h: string, n: number) => `hall ${"ABCD"[n % 4]} · inlet ${(19 + (n % 5) * 0.4).toFixed(1)}°C · PUE 1.12`,
  (h: string, n: number) => `${h} · IOMMU groups clean · ${10 + (n % 3)} guests`,
];

export function hex(n: number, len: number): string {
  return (Math.abs(Math.floor(n)) % 16 ** len).toString(16).padStart(len, "0");
}

// ---------------------------------------------------------------------------
// Additions for the Liquid Glass UI. Everything above is unchanged (timings!).
// ---------------------------------------------------------------------------

export const LAST_INCIDENT = { id: "INC-0418", ttc: 8.1, when: "6 days ago", title: "Suspicious ptrace from a sandboxed agent" };
export const FLEET = { hosts: "2,048", vms: "18,432", agents: "61,207", meanTtc: "11.8", incidents30d: 23 };

export interface StepMore {
  icon: string;
  undo: string;
}
// One entry per STEPS[i]: what it did, and how to undo it.
export const STEP_MORE: StepMore[] = [
  { icon: "network", undo: "Undo: reattach the vNIC" },
  { icon: "key", undo: "Undo: reissue the tokens" },
  { icon: "server", undo: "Undo: uncordon the host" },
  { icon: "pause", undo: "Undo: resume the guest" },
  { icon: "memory", undo: "Read-only. Nothing to undo" },
  { icon: "arrows", undo: "Undo: fail back to this host" },
];

export interface ToolCall {
  t?: number;
  u?: number;
  call: string;
  result: string;
}
// Scripted tool calls per agent. Each one appears when its time has passed.
export const TOOLS: Record<AgentId, ToolCall[]> = {
  sentry: [
    { t: 0.2, call: "correlate(vm-7f3a, window=300ms)", result: "3 signals" },
    { t: 0.6, call: "match_pattern(escape.vgpu)", result: "high confidence" },
    { t: 1.0, call: "open_incident(severity=critical)", result: "INC-0419" },
    { u: 2.2, call: "add_fleet_rule(ioctl=0xC0186441)", result: "rule live" },
  ],
  triage: [
    { t: 1.0, call: "attack_graph(host=b14-gpu-07)", result: "11 co-resident guests" },
    { t: 1.5, call: "scan_tokens(agent-7f3)", result: "2 exposed" },
    { t: 2.0, call: "score_blast_radius()", result: "0.87" },
    { t: 3.7, call: "query_iam(billing-db, window=60s)", result: "1 unexpected reader" },
    { u: 2.3, call: "close_scope(INC-0419)", result: "0 guests affected" },
  ],
  warden: [
    { t: 2.0, call: "policy.check(isolate_network)", result: "allowed · reversible" },
    { t: 2.4, call: "vnic.detach(vm-7f3a)", result: "ok" },
    { t: 2.9, call: "tokens.revoke(agent-7f3)", result: "2 revoked" },
    { t: 3.3, call: "host.cordon(b14-gpu-07)", result: "ok" },
    { t: 3.8, call: "vm.pause(vm-7f3a)", result: "vCPU 0–15 frozen" },
    { t: 4.6, call: "mem.capture(vm-7f3a)", result: "64 GiB captured" },
    { t: 5.3, call: "guests.failover(count=11)", result: "11/11 running" },
    { t: 5.5, call: "policy.check(quarantine_host)", result: "needs a human" },
    { u: 0.7, call: "host.quarantine(b14-gpu-07)", result: "fabric ports down" },
    { u: 1.4, call: "bmc.ipmi_off(vlan=40)", result: "pruned" },
  ],
  scribe: [
    { t: 2.5, call: "log.append(step)", result: "streaming" },
    { t: 4.6, call: "evidence.hash(vm-7f3a.mem)", result: "sha256 9f3c…e1a0" },
    { u: 2.2, call: "report.write(INC-0419)", result: "20 entries" },
    { u: 5.0, call: "report.file()", result: "synced to 6 operators" },
  ],
};

export const BOUNDS: Record<AgentId, { mode: string; can: string; cannot: string }> = {
  sentry: { mode: "Read-only", can: "Read telemetry, open incidents", cannot: "Change any system" },
  triage: { mode: "Read-only", can: "Query inventory and IAM, score risk", cannot: "Change any system" },
  warden: {
    mode: "Policy-bounded",
    can: "Isolate, revoke, cordon, pause, capture, fail over",
    cannot: "Quarantine a host without a human",
  },
  scribe: { mode: "Append-only", can: "Write reports, hash evidence", cannot: "Edit or delete past entries" },
};

export interface PolicyAction {
  id: string;
  icon: string;
  name: string;
  note: string;
}
export const POLICY_AUTO: PolicyAction[] = [
  { id: "isolate", icon: "network", name: "Isolate guest network", note: "Detach the vNIC. Reversible" },
  { id: "revoke", icon: "key", name: "Revoke workload credentials", note: "Tokens can be reissued. Reversible" },
  { id: "cordon", icon: "server", name: "Cordon host", note: "No new placements. Reversible" },
  { id: "pause", icon: "pause", name: "Pause guest VM", note: "vCPUs frozen. Reversible" },
  { id: "capture", icon: "memory", name: "Capture guest memory", note: "Over the trusted management path. Read-only" },
  { id: "failover", icon: "arrows", name: "Fail over co-resident guests", note: "To clean hosts. Reversible" },
];
export const POLICY_HUMAN: PolicyAction[] = [
  { id: "quarantine", icon: "shield", name: "Quarantine host", note: "Takes the host out of the pool" },
  { id: "reimage", icon: "reset", name: "Reimage host", note: "Wipes disks and firmware state" },
  { id: "terminate", icon: "x", name: "Terminate guest VM", note: "Destroys the guest for good" },
];
// Which autonomous actions each preset leaves on.
export const POLICY_PRESETS: Record<string, string[]> = {
  Standard: POLICY_AUTO.map((a) => a.id),
  Strict: ["isolate", "revoke", "cordon"],
  Manual: [],
};

export interface PastReport {
  id: string;
  title: string;
  when: string;
  ttc: number;
  approver: string;
  rows: { t: number; actor: string; action: string }[];
}
export const PAST_REPORTS: PastReport[] = [
  {
    id: "INC-0418",
    title: "Suspicious ptrace from a sandboxed agent",
    when: "6 days ago",
    ttc: 8.1,
    approver: "RK · Incident Commander",
    rows: [
      { t: 0.0, actor: "Sentry", action: "ptrace on a host process from agent-2c9" },
      { t: 0.8, actor: "Sentry", action: "Correlated 3 signals, opened INC-0418" },
      { t: 1.6, actor: "Triage", action: "Scoped to 1 host, 4 co-resident guests" },
      { t: 2.2, actor: "Warden", action: "Isolated network and revoked 1 token" },
      { t: 5.9, actor: "RK", action: "Approved quarantine of c07-gpu-11" },
      { t: 8.1, actor: "Warden", action: "Quarantined c07-gpu-11. Incident contained" },
    ],
  },
  {
    id: "INC-0412",
    title: "Credential replay from a guest agent",
    when: "3 weeks ago",
    ttc: 12.4,
    approver: "RK · Incident Commander",
    rows: [
      { t: 0.0, actor: "Sentry", action: "Workload token reused from a second guest" },
      { t: 1.1, actor: "Triage", action: "2 guests share one identity" },
      { t: 2.0, actor: "Warden", action: "Revoked the token, detached both vNICs" },
      { t: 9.4, actor: "RK", action: "Approved quarantine of a21-gpu-03" },
      { t: 12.4, actor: "Warden", action: "Quarantined a21-gpu-03. Incident contained" },
    ],
  },
  {
    id: "INC-0407",
    title: "Unexpected DMA from a passthrough device",
    when: "5 weeks ago",
    ttc: 10.9,
    approver: "RK · Incident Commander",
    rows: [
      { t: 0.0, actor: "Sentry", action: "IOMMU fault on a passthrough device" },
      { t: 1.2, actor: "Triage", action: "Scoped to 1 host, 8 co-resident guests" },
      { t: 2.6, actor: "Warden", action: "Cordoned the host and paused the guest" },
      { t: 8.2, actor: "RK", action: "Approved quarantine of d30-gpu-09" },
      { t: 10.9, actor: "Warden", action: "Quarantined d30-gpu-09. Incident contained" },
    ],
  },
];
