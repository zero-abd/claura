import { callTool, triageTools } from '../tools.ts';
import type { IncidentRow } from '../types.ts';
import { runAgent, setState, type AgentOutcome, type AgentSpec, type Env } from './common.ts';

export const TRIAGE_SYSTEM = `You are Triage, the blast-radius agent in Claura, an incident-response system for AI data centers. An incident is open. Work in this order:
1. Call get_host_inventory for the suspect host.
2. Call check_reachability for the same host.
3. Call record_finding ONCE with kind "attack_graph". In text, write the attack path as a chain with arrows (guest VM -> device and hypervisor boundary -> host -> management plane), then state how many co-resident guests share the host and whether the management plane is reachable and whether it is compromised. Use only facts from the tool results. blast_score is a number between 0 and 1: about 0.9 when the management plane is reachable and many guests are co-resident, lower otherwise.
After record_finding succeeds, reply with one short sentence.`;

/**
 * Deterministic blast heuristic used by the fallback / scripted path:
 * 0.46 base + 0.25 if the management plane is reachable + up to 0.12 for
 * co-resident guests (of a 12-slot host) + 0.05 for credential misuse.
 * For the demo incident (11 co-resident, reachable, token misuse) = 0.87.
 */
export function blastHeuristic(coResident: number, mgmtReachable: boolean, tokenMisuse: boolean): number {
  const s = 0.46 + (mgmtReachable ? 0.25 : 0) + 0.12 * Math.min(coResident / 12, 1) + (tokenMisuse ? 0.05 : 0);
  return Math.round(Math.min(s, 1) * 100) / 100;
}

export async function runTriage(env: Env, inc: IncidentRow): Promise<AgentOutcome> {
  const tools = triageTools(env, inc.id);
  const isDone = () => env.db.findings(inc.id).some(f => f.agent === 'triage' && f.kind === 'attack_graph');

  const spec: AgentSpec = {
    name: 'triage',
    system: TRIAGE_SYSTEM,
    user: `Incident #${inc.id} (${inc.severity}): ${inc.title}. Suspect host: ${inc.host}. Suspect VM: ${inc.vm}. Assess the blast radius.`,
    tools,
    maxSteps: 6,
    maxToolCalls: 8,
    deadlineMs: 90_000,
    isDone,
    nudge: 'You have not recorded the finding yet. Call record_finding now with kind "attack_graph", the attack chain as text, and a blast_score between 0 and 1.',
    startStatus: 'Scoring',
    startThought: `Mapping blast radius for ${inc.host}: co-resident guests, exposed credentials, management-plane reachability.`,
    async deterministic(pace) {
      if (isDone()) return;
      const label = env.opts.scripted ? 'scripted' : 'fallback';
      await pace();
      const inv = (await callTool(tools, 'get_host_inventory', { host: inc.host })) as {
        co_resident_count: number; hall: string; rack: string;
      };
      await setState(env, 'triage', 'Scoring', `${inc.host} (hall ${inv.hall}, rack ${inv.rack}) runs ${inv.co_resident_count + 1} guests; ${inv.co_resident_count} are co-resident with ${inc.vm}.`, label);
      await pace();
      const reach = (await callTool(tools, 'check_reachability', { host: inc.host })) as { reachable: boolean; compromised: boolean };
      await setState(env, 'triage', 'Scoring', `Management plane ${reach.reachable ? 'is reachable' : 'is not reachable'} from ${inc.host}; ${reach.compromised ? 'compromise indicators found' : 'no sign it is compromised'}.`, label);
      await pace();
      const tokenMisuse = env.db.signals().some(s => s.source === 'iam');
      const score = blastHeuristic(inv.co_resident_count, reach.reachable, tokenMisuse);
      const text =
        `${inc.vm} (workload agent-7f3) -> vGPU mdev / VMM boundary -> qemu on ${inc.host} -> host shell -> BMC 10.0.0.1:623 (IPMI, mgmt VLAN 40). ` +
        `${inv.co_resident_count} co-resident guests share ${inc.host}. ` +
        `Management plane is ${reach.reachable ? 'reachable' : 'not reachable'} from the host and ${reach.compromised ? 'shows compromise' : 'not compromised yet'}. ` +
        `Workload identity agent-7f3 used a token outside its scope.`;
      await callTool(tools, 'record_finding', { kind: 'attack_graph', text, blast_score: score });
    },
  };

  const outcome = await runAgent(env, spec);
  const score = env.db.incidents().find(i => i.id === inc.id)?.blastScore ?? 0;
  await setState(env, 'triage', `Scored ${score.toFixed(2)}`,
    `Blast radius ${score.toFixed(2)}. ${env.db.findings(inc.id).filter(f => f.agent === 'triage').at(-1)?.text ?? ''}`,
    env.opts.scripted ? 'scripted' : outcome.mode === 'fallback' ? 'fallback' : 'model');
  return outcome;
}
