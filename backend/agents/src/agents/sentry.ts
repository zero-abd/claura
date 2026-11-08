import { SUSPECT_HOST, SUSPECT_VM } from '../fixtures.ts';
import { callTool, sentryTools } from '../tools.ts';
import { runAgent, setState, type AgentOutcome, type AgentSpec, type Env } from './common.ts';

export const SENTRY_SYSTEM = `You are Sentry, the detection agent in Claura, an incident-response system for AI data centers.
Telemetry signals come from the VMM, vGPU driver, IOMMU, host EDR, network flow and IAM.
Do this:
1. Call list_recent_signals.
2. If several independent sources point at the same host and VM (for example a VMM ioctl, a device fault, a DMA fault, qemu spawning a shell, a flow to the management plane, token misuse), that is a guest-to-host escape. Call open_incident ONCE with a short factual title, severity "critical", and the host and vm exactly as they appear in the signals.
3. A single benign signal is not an incident: do not open one.
After open_incident succeeds, reply with one short sentence. Never invent hosts or VMs.`;

/** Host/VM the signals point at most often (what a correlation rule would pick). */
function correlate(env: Env): { host: string; vm: string; n: number; sources: number } {
  const sigs = env.db.signals();
  const top = (key: 'host' | 'vm', fallback: string) => {
    const c = new Map<string, number>();
    for (const s of sigs) if (s[key]) c.set(s[key], (c.get(s[key]) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  };
  return { host: top('host', SUSPECT_HOST), vm: top('vm', SUSPECT_VM), n: sigs.length, sources: new Set(sigs.map(s => s.source)).size };
}

export async function runSentry(env: Env): Promise<{ outcome: AgentOutcome; incidentId: bigint }> {
  const tools = sentryTools(env);
  const isDone = () => env.db.incidents().some(i => i.status !== 'contained');

  const spec: AgentSpec = {
    name: 'sentry',
    system: SENTRY_SYSTEM,
    user: 'A burst of telemetry just arrived. Investigate it and act.',
    tools,
    maxSteps: 5,
    maxToolCalls: 6,
    deadlineMs: 60_000,
    isDone,
    nudge: 'You have not opened the incident yet. Call open_incident now with title, severity, host and vm taken from the signals.',
    startStatus: 'Correlating',
    startThought: 'Telemetry burst received. Correlating signals across sources.',
    async deterministic(pace) {
      if (isDone()) return;
      const c = correlate(env);
      await pace();
      await setState(
        env, 'sentry', 'Correlating',
        `${c.n} signals from ${c.sources} independent sources point at ${c.host} / ${c.vm}: VMM ioctl, device fault, DMA fault, qemu spawned a shell. Pattern matches a guest-to-host escape.`,
        env.opts.scripted ? 'scripted' : 'fallback',
      );
      await pace();
      await callTool(tools, 'open_incident', {
        title: 'Suspected guest-to-host escape via the vGPU path',
        severity: 'critical',
        host: c.host,
        vm: c.vm,
      });
    },
  };

  const outcome = await runAgent(env, spec);
  const inc = env.db.incidents().filter(i => i.status !== 'contained').at(-1)!;
  await setState(env, 'sentry', 'Escalated', `Incident #${inc.id} opened (${inc.severity}): ${inc.title}`,
    env.opts.scripted ? 'scripted' : outcome.mode === 'fallback' ? 'fallback' : 'model');
  return { outcome, incidentId: inc.id };
}
