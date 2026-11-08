// The tools each agent may call. They are the ONLY way an agent touches the
// backend; incident ids are bound here so the model never has to carry them.
// Every tool returns plain JSON-able data that the model reads as the result.

import type { Env } from './agents/common.ts';
import { reachabilityFixture } from './fixtures.ts';
import { validateArgs } from './schema.ts';
import type { Tool } from './toolLoop.ts';
import { clip, waitFor } from './util.ts';

/** Known action vocabulary (policy decides what each one is allowed to do). */
export const KNOWN_ACTIONS = [
  'isolate_network', 'revoke_credentials', 'cordon_host', 'pause_guest', 'capture_memory',
  'failover_guests', 'quarantine_host', 'reimage_host', 'power_off_hall', 'delete_vm',
] as const;

/** Run a tool the way the loop does (validate, then run). Used by deterministic routines. */
export async function callTool(tools: Tool[], name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  const v = validateArgs(tool.parameters, args);
  if (!v.ok) throw new Error(`invalid arguments for ${name}: ${v.error}`);
  return tool.run(v.value);
}

const str = (description: string, extra: object = {}) => ({ type: 'string' as const, description, ...extra });

// ---------------------------------------------------------------- Sentry ---

export function sentryTools(env: Env): Tool[] {
  return [
    {
      name: 'list_recent_signals',
      description:
        'List recent telemetry signals from the fleet (VMM, vGPU, IOMMU, host EDR, network flow, IAM), oldest first, with a per-host / per-source summary. Call this first.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'max signals to return (default 20)', minimum: 1, maximum: 50 } },
        required: [],
      },
      thought: () => 'Reading the latest telemetry signals.',
      async run(args) {
        const limit = typeof args.limit === 'number' ? args.limit : 20;
        const all = env.db.signals();
        const sigs = all.slice(-limit);
        const byHost: Record<string, number> = {};
        for (const s of sigs) byHost[s.host || '(none)'] = (byHost[s.host || '(none)'] ?? 0) + 1;
        return {
          count: sigs.length,
          distinct_sources: new Set(sigs.map(s => s.source)).size,
          signals_by_host: byHost,
          signals: sigs.map(s => ({ source: s.source, message: s.message, host: s.host, vm: s.vm })),
        };
      },
    },
    {
      name: 'open_incident',
      description:
        'Open a security incident. Use only when the signals together indicate a real attack. Give a short factual title, a severity, and the host and vm named in the signals.',
      parameters: {
        type: 'object',
        properties: {
          title: str('short factual incident title, e.g. "Suspected guest-to-host escape via the vGPU path"', { minLength: 8, maxLength: 140 }),
          severity: str('incident severity', { enum: ['low', 'medium', 'high', 'critical'] }),
          host: str('affected host name from the signals, e.g. b14-gpu-07', { minLength: 3 }),
          vm: str('affected guest VM name from the signals, e.g. vm-7f3a', { minLength: 3 }),
        },
        required: ['title', 'severity', 'host', 'vm'],
      },
      thought: a => `Opening incident (${a.severity}): ${a.title}`,
      async run(args) {
        const host = String(args.host);
        const vm = String(args.vm);
        if (!env.db.hosts().some(h => h.host === host)) {
          throw new Error(`unknown host "${host}". Hosts named in recent signals: ${[...new Set(env.db.signals().map(s => s.host))].join(', ')}`);
        }
        if (!env.db.guests().some(g => g.vm === vm)) {
          throw new Error(`unknown vm "${vm}". VMs named in recent signals: ${[...new Set(env.db.signals().map(s => s.vm))].join(', ')}`);
        }
        const existing = env.db.incidents().find(i => i.host === host && i.status !== 'contained');
        if (existing) {
          env.marks.markOnce('incident_open');
          return { incident_id: String(existing.id), status: existing.status, note: 'an incident is already open for this host; nothing more to do' };
        }
        await env.db.openIncident(String(args.title), String(args.severity), host, vm);
        const inc = await waitFor(
          () => env.db.incidents().filter(i => i.host === host && i.status !== 'contained').at(-1),
          { timeoutMs: 5000, label: 'new incident row' },
        );
        env.marks.markOnce('incident_open');
        return { incident_id: String(inc.id), status: inc.status, host, vm, note: 'incident opened; Triage has been notified' };
      },
    },
  ];
}

// ---------------------------------------------------------------- Triage ---

export function triageTools(env: Env, incidentId: bigint): Tool[] {
  return [
    {
      name: 'get_host_inventory',
      description: 'Get a host\'s rack location, status and the guest VMs placed on it (to find co-resident guests).',
      parameters: { type: 'object', properties: { host: str('host name, e.g. b14-gpu-07', { minLength: 3 }) }, required: ['host'] },
      thought: a => `Inventorying ${a.host}: who shares this host?`,
      async run(args) {
        const host = String(args.host);
        const h = env.db.hosts().find(x => x.host === host);
        if (!h) throw new Error(`unknown host "${host}". Known hosts: ${env.db.hosts().map(x => x.host).join(', ')}`);
        const inc = env.db.incidents().find(i => i.id === incidentId);
        const guests = env.db.guests().filter(g => g.host === host);
        const co = guests.filter(g => g.vm !== inc?.vm);
        return {
          host: h.host, hall: h.hall, rack: h.rack, status: h.status,
          suspect_vm: inc?.vm ?? null,
          suspect_vm_workload: guests.find(g => g.vm === inc?.vm)?.workload ?? null,
          guest_count: guests.length,
          co_resident_count: co.length,
          co_resident_guests: co.map(g => ({ vm: g.vm, workload: g.workload, status: g.status })),
        };
      },
    },
    {
      name: 'check_reachability',
      description:
        'Probe whether the out-of-band management plane (BMC / IPMI, mgmt VLAN) is reachable from a host, and whether it shows signs of compromise.',
      parameters: { type: 'object', properties: { host: str('host name, e.g. b14-gpu-07', { minLength: 3 }) }, required: ['host'] },
      thought: a => `Probing management-plane reachability from ${a.host}.`,
      async run(args) {
        const host = String(args.host);
        if (!env.db.hosts().some(h => h.host === host)) throw new Error(`unknown host "${host}"`);
        return reachabilityFixture(host);
      },
    },
    {
      name: 'record_finding',
      description:
        'Record your analysis as a finding on the incident. For kind attack_graph, write the attack path as a chain with arrows (guest -> device -> hypervisor -> host -> management plane) using only facts from tool results, and give a blast_score from 0.0 (harmless) to 1.0 (worst).',
      parameters: {
        type: 'object',
        properties: {
          kind: str('finding kind', { enum: ['attack_graph', 'blast_radius', 'exposure'] }),
          text: str('the finding, 1-4 sentences, facts only', { minLength: 40, maxLength: 1200 }),
          blast_score: { type: 'number', description: 'blast radius 0.0 to 1.0 (1.0 = worst)', minimum: 0, maximum: 1 },
        },
        required: ['kind', 'text', 'blast_score'],
      },
      thought: a => `Recording ${a.kind} finding, blast score ${a.blast_score}.`,
      async run(args) {
        const score = Number(args.blast_score);
        await env.db.recordFinding(incidentId, 'triage', String(args.kind), String(args.text), score);
        env.marks.markOnce('triage_done');
        return { recorded: true, kind: args.kind, blast_score: score };
      },
    },
  ];
}

// ---------------------------------------------------------------- Warden ---

export interface ProposalResult {
  proposal_id: string;
  action: string;
  target: string;
  status: string;
  policy_mode: string;
  note: string;
}

/** Shared by the model's propose_action tool, the deterministic routine and the red-team probe. */
export async function proposeThroughGate(
  env: Env,
  incidentId: bigint,
  action: string,
  target: string,
  reason: string,
): Promise<ProposalResult> {
  const before = new Set(env.db.proposals(incidentId).map(p => p.id));
  await env.db.proposeAction(incidentId, 'warden', action, target, reason);
  const p = await waitFor(
    () => env.db.proposals(incidentId).find(x => !before.has(x.id) && x.action === action && x.target === target),
    { timeoutMs: 5000, label: `proposal row for ${action}` },
  );
  let note: string;
  if (p.status === 'executed') note = 'Executed by the policy gate.';
  else if (p.status === 'pending_approval') {
    note = 'Policy requires human approval. The incident is now awaiting approval from an operator. Do not propose this again.';
    env.marks.markOnce('pending_approval');
  } else note = `BLOCKED by policy (mode: ${p.policyMode}). This action is not permitted. Do not retry it; continue with permitted containment steps.`;
  env.log.info('policy', `${action} -> ${target}: ${p.status.toUpperCase()} (policy: ${p.policyMode})`);
  return { proposal_id: String(p.id), action, target, status: p.status, policy_mode: p.policyMode, note };
}

export function wardenTools(env: Env, incidentId: bigint): Tool[] {
  return [
    {
      name: 'get_policy',
      description: 'Read the containment policy table: for each action, whether it runs automatically, needs human approval, or is denied.',
      parameters: { type: 'object', properties: {}, required: [] },
      thought: () => 'Checking which containment actions policy allows.',
      async run() {
        return env.db.policies().map(p => ({ action: p.action, mode: p.mode, reversible: p.reversible, note: p.note }));
      },
    },
    {
      name: 'propose_action',
      description:
        `Propose one containment action. The policy gate in the backend decides: it may execute it, hold it for human approval, or block it. Known actions: ${KNOWN_ACTIONS.join(', ')}. Targets: a vm name (isolate_network, pause_guest, capture_memory), a workload identity (revoke_credentials), or a host name (cordon_host, failover_guests, quarantine_host, reimage_host).`,
      parameters: {
        type: 'object',
        properties: {
          action: str('the action name, e.g. isolate_network', { minLength: 3, maxLength: 40, pattern: '^[a-z_]+$' }),
          target: str('vm, identity or host the action applies to', { minLength: 3, maxLength: 80 }),
          reason: str('one sentence: why this action, with evidence', { minLength: 8, maxLength: 300 }),
        },
        required: ['action', 'target', 'reason'],
      },
      thought: a => `${a.action} -> ${a.target}: ${a.reason}`,
      async run(args) {
        return proposeThroughGate(env, incidentId, String(args.action), String(args.target), String(args.reason));
      },
    },
  ];
}

// ---------------------------------------------------------------- Scribe ---

export function scribeTools(env: Env, incidentId: bigint): Tool[] {
  return [
    {
      name: 'list_events',
      description: 'List the incident\'s event log (signals, findings, actions, blocked actions, approvals), oldest first. Read it before writing the report.',
      parameters: { type: 'object', properties: {}, required: [] },
      thought: () => 'Reading the incident event log.',
      async run() {
        const ev = env.db.events(incidentId);
        const t0 = ev[0]?.atMs ?? 0;
        return {
          count: ev.length,
          events: ev.slice(-80).map(e => ({ t: `+${((e.atMs - t0) / 1000).toFixed(1)}s`, kind: e.kind, actor: e.actor, text: clip(e.text, 240) })),
        };
      },
    },
    {
      name: 'file_report',
      description:
        'File the final incident report. 5-8 sentences covering: what was detected, blast radius, actions executed, actions blocked by policy, the human approval, and the final state. Facts from the event log only.',
      parameters: {
        type: 'object',
        properties: { summary: str('the report text', { minLength: 120, maxLength: 3000 }) },
        required: ['summary'],
      },
      thought: () => 'Writing the incident report.',
      async run(args) {
        await env.db.fileReport(incidentId, String(args.summary));
        env.marks.markOnce('report_filed');
        return { filed: true, length: String(args.summary).length };
      },
    },
  ];
}
