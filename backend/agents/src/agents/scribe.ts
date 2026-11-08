import { callTool, scribeTools } from '../tools.ts';
import type { IncidentRow } from '../types.ts';
import { clip } from '../util.ts';
import { runAgent, setState, type AgentOutcome, type AgentSpec, type Env } from './common.ts';

export const SCRIBE_SYSTEM = `You are Scribe, the forensics agent in Claura, an incident-response system for AI data centers. The incident is contained; write the report.
1. Call list_events.
2. Call file_report ONCE with a 5 to 8 sentence summary in plain prose (no markdown, no bullet points): what was detected and by which sources, the blast radius (host, co-resident guests, whether the management plane was reachable, the blast score), the containment actions that executed automatically, any action that policy blocked, the action that needed human approval and who approved it, and the final state. Use only facts from the event log; do not invent numbers.
Put the report text only in the file_report call, never in a chat reply. After file_report succeeds, reply with one short sentence.`;

/** Deterministic report built straight from the backend rows (fallback / scripted). */
export function buildReport(env: Env, inc: IncidentRow): string {
  const props = env.db.proposals(inc.id);
  const signals = env.db.signals();
  const executed = props.filter(p => p.status === 'executed');
  const blocked = props.filter(p => p.status === 'blocked');
  const approved = props.filter(p => p.status === 'approved');
  const pending = props.filter(p => p.status === 'pending_approval');
  const finding = env.db.findings(inc.id).filter(f => f.agent === 'triage').at(-1);
  const fresh = env.db.incidents().find(i => i.id === inc.id) ?? inc;
  const sources = [...new Set(signals.map(s => s.source))];
  const parts: string[] = [];
  parts.push(`Incident #${inc.id} (${inc.severity}): ${inc.title}.`);
  parts.push(`Sentry correlated ${signals.length} signals from ${sources.length} independent sources (${sources.join(', ')}) on ${inc.host} / ${inc.vm}.`);
  parts.push(`Triage scored the blast radius at ${fresh.blastScore.toFixed(2)}${finding ? `: ${clip(finding.text, 320)}` : '.'}`);
  parts.push(
    executed.length
      ? `Warden's policy gate executed ${executed.length} action(s) automatically under policy mode auto: ${executed.map(p => `${p.action} (${p.target})`).join(', ')}.`
      : 'No containment action was executed automatically.',
  );
  if (blocked.length) {
    const probes = blocked.filter(p => p.reason.includes('RED-TEAM'));
    parts.push(
      `Policy blocked ${blocked.length} action(s): ${blocked.map(p => `${p.action} (${p.target})`).join(', ')}.` +
        (probes.length ? ` ${probes.map(p => p.action).join(', ')} was a labelled red-team probe, not a model decision.` : ''),
    );
  }
  if (approved.length) {
    parts.push(`${approved.map(p => `${p.action} on ${p.target}`).join(', ')} required human approval and was approved by ${approved.map(p => p.decidedBy || 'an operator').join(', ')}.`);
  } else if (pending.length) {
    parts.push(`${pending.map(p => `${p.action} on ${p.target}`).join(', ')} is still pending human approval.`);
  }
  parts.push(`Final state: incident ${fresh.status}; host ${inc.host} is ${env.db.hosts().find(h => h.host === inc.host)?.status ?? 'unknown'}.`);
  return parts.join(' ');
}

export async function runScribe(env: Env, inc: IncidentRow): Promise<AgentOutcome> {
  const tools = scribeTools(env, inc.id);
  const isDone = () => env.db.reports().some(r => r.incidentId === inc.id);

  const spec: AgentSpec = {
    name: 'scribe',
    system: SCRIBE_SYSTEM,
    user: `Incident #${inc.id}: ${inc.title}. Host ${inc.host}, VM ${inc.vm}. Read the event log and file the report.`,
    tools,
    maxSteps: 5,
    maxToolCalls: 6,
    deadlineMs: 90_000,
    isDone,
    nudge: 'You have not filed the report yet. Call the file_report tool now and pass the report text as its summary argument.',
    // Nemotron sometimes writes the finished report as chat text instead of calling file_report.
    // If it has read the log and the prose is report-sized, file that text rather than regenerating it.
    async salvageProse(content, calls) {
      const readLog = calls.some(c => c.tool === 'list_events' && c.ok);
      const text = content.replace(/[*_#`]+/g, '').trim();
      if (!readLog || text.length < 120) return false;
      await callTool(tools, 'file_report', { summary: text });
      return true;
    },
    startStatus: 'Writing',
    startThought: `Writing the report for incident #${inc.id} from the event log.`,
    async deterministic(pace) {
      if (isDone()) return;
      await pace();
      await setState(env, 'scribe', 'Writing', `Compiling ${env.db.events(inc.id).length} log entries into the report.`, env.opts.scripted ? 'scripted' : 'fallback');
      await pace();
      await callTool(tools, 'file_report', { summary: buildReport(env, inc) });
    },
  };

  const outcome = await runAgent(env, spec);
  await setState(env, 'scribe', 'Filed', `Report for incident #${inc.id} filed (${env.db.reports().find(r => r.incidentId === inc.id)?.summary.length ?? 0} chars).`,
    env.opts.scripted ? 'scripted' : outcome.mode === 'fallback' ? 'fallback' : 'model');
  return outcome;
}
