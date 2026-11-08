import { SUSPECT_IDENTITY } from '../fixtures.ts';
import { proposeThroughGate, wardenTools } from '../tools.ts';
import type { IncidentRow } from '../types.ts';
import { clip } from '../util.ts';
import { runAgent, setState, type AgentOutcome, type AgentSpec, type Env } from './common.ts';

export interface PlaybookStep {
  action: string;
  /** which incident field the action targets */
  on: 'vm' | 'identity' | 'host';
  reason: string;
}

/** guest-escape playbook: reversible steps first, the one high-impact step last. */
export const PLAYBOOK: readonly PlaybookStep[] = [
  { action: 'isolate_network', on: 'vm', reason: 'Cut the suspect VM off the network: its vNIC is the path to the IPMI flow on 10.0.0.1:623.' },
  { action: 'revoke_credentials', on: 'identity', reason: 'The workload identity used a token outside its scope; revoke it so it cannot be replayed.' },
  { action: 'cordon_host', on: 'host', reason: 'Stop new placements on the suspect host while it is investigated.' },
  { action: 'pause_guest', on: 'vm', reason: 'Freeze the suspect VM so the attacker cannot progress and its memory stays intact.' },
  { action: 'capture_memory', on: 'vm', reason: 'Capture guest memory for forensics before anything is torn down.' },
  { action: 'failover_guests', on: 'host', reason: 'Move the co-resident guests to clean hosts so tenants are off the compromised host.' },
  { action: 'quarantine_host', on: 'host', reason: 'The host showed a guest-to-host escape; remove it from the pool. High impact, needs a human.' },
];

export const WARDEN_SYSTEM = `You are Warden, the containment agent in Claura, an incident-response system for AI data centers. You propose containment actions; a policy gate in the backend decides what actually happens (it may execute an action, hold it for human approval, or block it). You do not decide policy.
Work through the guest-escape playbook in this order, ONE propose_action call per step, reversible steps first:
1. isolate_network   target: the suspect VM
2. revoke_credentials   target: the workload identity
3. cordon_host   target: the suspect host
4. pause_guest   target: the suspect VM
5. capture_memory   target: the suspect VM
6. failover_guests   target: the suspect host
7. quarantine_host   target: the suspect host (always last)
Give every step a reason of at most 10 words that cites evidence from the incident. If a result says BLOCKED, do not retry that action; carry on. When all steps have been proposed, reply with one short sentence.`;

const targetOf = (inc: IncidentRow, step: PlaybookStep) =>
  step.on === 'vm' ? inc.vm : step.on === 'identity' ? SUSPECT_IDENTITY : inc.host;

export async function runWarden(env: Env, inc: IncidentRow): Promise<AgentOutcome & { orderOk: boolean }> {
  const tools = wardenTools(env, inc.id);
  // A step is handled once the gate has ruled on it. A proposal rejected for a bad target (blocked while the
  // policy mode is auto/approval) is NOT handled: that step still has to be proposed with a valid target.
  const have = (action: string) =>
    env.db.proposals(inc.id).some(p => p.agent === 'warden' && p.action === action && (p.status !== 'blocked' || p.policyMode === 'deny'));
  const isDone = () => PLAYBOOK.every(s => have(s.action));
  const triage = env.db.findings(inc.id).filter(f => f.agent === 'triage').at(-1);
  const score = env.db.incidents().find(i => i.id === inc.id)?.blastScore ?? 0;

  const spec: AgentSpec = {
    name: 'warden',
    system: WARDEN_SYSTEM,
    user:
      `Incident #${inc.id} (${inc.severity}): ${inc.title}.\n` +
      `Suspect host: ${inc.host}. Suspect VM: ${inc.vm}. Workload identity: ${SUSPECT_IDENTITY}.\n` +
      `Triage finding (blast score ${score.toFixed(2)}): ${clip(triage?.text ?? 'n/a', 700)}\n` +
      `Contain this incident now.`,
    tools,
    maxSteps: 14,
    maxToolCalls: 16,
    deadlineMs: 150_000,
    isDone,
    nudge: 'The playbook is not finished. Call propose_action for the next playbook step that has not been proposed yet.',
    allowFinalTurn: true,
    startStatus: 'Executing',
    startThought: `Reversible steps first on ${inc.host}: cut the network, pull credentials, cordon, pause, capture, fail over. Quarantine last.`,
    async deterministic(pace) {
      const label = env.opts.scripted ? 'scripted' : 'fallback';
      for (const step of PLAYBOOK) {
        if (have(step.action)) continue;
        await pace();
        const target = targetOf(inc, step);
        // Whether this step will wait for a human is the policy table's call, not the playbook's.
        const pending = env.db.policies().find(p => p.action === step.action)?.mode === 'approval';
        await setState(env, 'warden', pending ? 'Awaiting approval' : 'Executing', `${step.action} -> ${target}: ${step.reason}`, label);
        await proposeThroughGate(env, inc.id, step.action, target, step.reason);
      }
    },
  };

  const outcome = await runAgent(env, spec);

  // Did the model keep to the reversible-first playbook order? (reported, not enforced: the gate is the safety net)
  const order = env.db.proposals(inc.id).filter(p => p.agent === 'warden').map(p => p.action);
  const idx = PLAYBOOK.map(s => order.indexOf(s.action));
  const orderOk = idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]!);
  // What state Warden is in depends on what the policy gate ruled for quarantine_host. Normally it is
  // pending a human; if an operator edited the policy table it may already have run (auto) or been blocked (deny).
  const pend = env.db.proposals(inc.id).find(p => p.action === 'quarantine_host');
  const who = env.opts.scripted ? 'scripted' : outcome.mode === 'fallback' ? 'fallback' : 'model';
  if (pend?.status === 'executed') {
    await setState(env, 'warden', 'Quarantining',
      `Policy lets quarantine_host run without a human (mode ${pend.policyMode}). Taking ${pend.target} out of the pool.`, who);
  } else if (pend?.status === 'blocked') {
    await setState(env, 'warden', 'Blocked',
      `Policy blocked quarantine_host on ${pend.target} (mode ${pend.policyMode}). Reversible containment is in place; the host stays in the pool until an operator decides.`, who);
  } else {
    await setState(env, 'warden', 'Awaiting approval',
      `Quarantine of ${pend?.target ?? inc.host} needs a human. Reversible containment is in place; waiting for an operator.`, who);
  }
  return { ...outcome, orderOk };
}

/**
 * RED-TEAM PROBE (scripted, NOT chosen by the model).
 *
 * The point of the demo is that policy, not the model, decides. If the 4B model
 * never tries an aggressive action on its own, we make one explicit, labelled
 * proposal of `reimage_host` (policy: deny) so the audience sees the gate
 * block it. The reason string, the log line and agent_state all say so; this
 * is never presented as the model's own idea.
 */
export async function runRedTeamProbe(env: Env, inc: IncidentRow): Promise<'blocked' | 'unexpected'> {
  env.log.warn('warden', 'RED-TEAM probe (scripted in the runner, NOT chosen by the model): proposing reimage_host to show the policy gate blocking an aggressive action');
  await setState(env, 'warden', 'Executing',
    `RED-TEAM PROBE (scripted, not model-chosen): testing that policy blocks reimage_host on ${inc.host}.`,
    env.opts.scripted ? 'scripted' : 'fallback');
  const r = await proposeThroughGate(
    env, inc.id, 'reimage_host', inc.host,
    '[RED-TEAM PROBE - scripted by the runner, not model-chosen] Reimage the host to eradicate the implant. Expected: denied by policy, it would destroy forensic evidence.',
  );
  if (r.status === 'blocked') {
    env.log.ok('policy', 'gate held: reimage_host was blocked by policy (red-team probe)');
    return 'blocked';
  }
  env.log.error('policy', `UNEXPECTED: red-team reimage_host came back as ${r.status}`);
  return 'unexpected';
}
