import { SUSPECT_IDENTITY } from '../fixtures.ts';
import { callTool, triageTools } from '../tools.ts';
import type { IncidentRow } from '../types.ts';
import { runAgent, setState, type AgentOutcome, type AgentSpec, type Env } from './common.ts';

export const TRIAGE_SYSTEM = `You are Triage, the blast-radius agent in Claura, an incident-response system for AI data centers. An incident is open. Work in this order:
1. Call get_host_inventory for the suspect host.
2. Call check_reachability for the same host.
3. Call record_finding ONCE with kind "attack_graph". In text, write the attack path as a chain with arrows (guest VM -> device and hypervisor boundary -> host -> management plane), then state how many co-resident guests share the host and whether the management plane is reachable and whether it is compromised. Use only facts from the tool results. blast_score is a number between 0 and 1: about 0.9 when the management plane is reachable and many guests are co-resident, lower otherwise.
4. Call record_scope exactly twice. First: asset "Workload tokens", status "exfil_suspected" (the IAM signal shows a token used outside its scope). Second: asset "Tenant model weights", status "accessed" (the guest is the suspected pivot). In note give the evidence in one sentence. Do not scope any other asset: the corporate assets (FIN-02, billing DB) belong to another team.
After the second record_scope succeeds, reply with one short sentence.`;

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

/**
 * The scope the playbook expects Triage to record. `ok` says which statuses already satisfy it (a model that wrote
 * something weaker or wrong is corrected by the fallback; a human's later, stronger ruling is never touched).
 */
const DEFAULT_SCOPE: ReadonlyArray<{ asset: string; status: string; note: string; ok: readonly string[] }> = [
  { asset: 'Workload tokens', status: 'exfil_suspected', ok: ['exfil_suspected', 'exfil_confirmed'],
    note: `IAM shows a token of ${SUSPECT_IDENTITY} used outside its scope; treat it as exfiltrated until a human rules it out.` },
  { asset: 'Tenant model weights', status: 'accessed', ok: ['accessed', 'exfil_suspected', 'exfil_confirmed', 'evidence_preserved'],
    note: 'The guest is the suspected pivot, so the model weights it holds are treated as accessed.' },
];
/** Optional extra the deterministic routine records (the model is not asked for it). */
const MGMT_SCOPE = { asset: 'Management plane credentials', status: 'intact',
  note: 'The BMC is reachable from the host via 10.0.0.1:623, but there is no successful login or config change.' };

export async function runTriage(env: Env, inc: IncidentRow): Promise<AgentOutcome> {
  const tools = triageTools(env, inc.id);
  const haveFinding = () => env.db.findings(inc.id).some(f => f.agent === 'triage' && f.kind === 'attack_graph');
  const statusOf = (name: string) => env.db.assets(inc.id).find(a => a.name === name)?.status ?? '';
  const scopeMissing = () => DEFAULT_SCOPE.filter(s => !s.ok.includes(statusOf(s.asset)));
  const isDone = () => haveFinding() && scopeMissing().length === 0;
  const assetList = env.db.assets(inc.id).map(a => a.name).join('; ');

  const spec: AgentSpec = {
    name: 'triage',
    system: TRIAGE_SYSTEM,
    user:
      `Incident #${inc.id} (${inc.severity}): ${inc.title}. Suspect host: ${inc.host}. Suspect VM: ${inc.vm}. Assess the blast radius.\n` +
      `Data assets in scope (exact names for record_scope): ${assetList || 'none listed'}.`,
    tools,
    maxSteps: 9,
    maxToolCalls: 11,
    deadlineMs: 120_000,
    isDone,
    nudge: () => {
      if (!haveFinding()) return 'You have not recorded the finding yet. Call record_finding now (kind "attack_graph", the attack chain as text, blast_score between 0 and 1).';
      const next = scopeMissing()[0];
      return next
        ? `The finding is recorded. Now call record_scope with asset "${next.asset}" and status "${next.status}", and give the evidence in note.`
        : 'Everything is recorded. Reply with one short sentence.';
    },
    startStatus: 'Scoring',
    startThought: `Mapping blast radius for ${inc.host}: co-resident guests, exposed credentials, management-plane reachability.`,
    async deterministic(pace) {
      const label = env.opts.scripted ? 'scripted' : 'fallback';
      if (!haveFinding()) {
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
      }
      // Scope: only what is still missing or too weak, so whatever the model got right keeps its own call.
      for (const s of scopeMissing()) {
        await pace();
        await setState(env, 'triage', 'Scoring', `Scope: ${s.asset} -> ${s.status}.`, label);
        await callTool(tools, 'record_scope', { asset: s.asset, status: s.status, note: s.note });
      }
      if (env.db.assets(inc.id).find(a => a.name === MGMT_SCOPE.asset)?.updatedBy === 'seed') {
        await pace();
        await setState(env, 'triage', 'Scoring', `Scope: ${MGMT_SCOPE.asset} -> ${MGMT_SCOPE.status}.`, label);
        await callTool(tools, 'record_scope', MGMT_SCOPE);
      }
    },
  };

  const outcome = await runAgent(env, spec);
  const score = env.db.incidents().find(i => i.id === inc.id)?.blastScore ?? 0;
  await setState(env, 'triage', `Scored ${score.toFixed(2)}`,
    `Blast radius ${score.toFixed(2)}. ${env.db.findings(inc.id).filter(f => f.agent === 'triage').at(-1)?.text ?? ''}`,
    env.opts.scripted ? 'scripted' : outcome.mode === 'fallback' ? 'fallback' : 'model');
  return outcome;
}
