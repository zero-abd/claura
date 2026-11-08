import { buildBrief, buildHandoff, factsBlock, say } from '../room.ts';
import { HANDOFF_PREFIX, callTool, scribeTools } from '../tools.ts';
import type { IncidentRow } from '../types.ts';
import { clip } from '../util.ts';
import { runAgent, setState, type AgentOutcome, type AgentSpec, type Env } from './common.ts';

export const SCRIBE_SYSTEM = `You are Scribe, the forensics and communications agent in Claura, an incident-response system for AI data centers. The incident is contained. Do these four things in this order, each exactly once:
1. Call list_events.
2. Call set_brief, the plain-language brief for executives, lawyers and PR people who are not engineers. text: 2 to 4 short sentences saying what happened, what is contained and what it means for customers; no jargon (never write IOMMU, vGPU, DMA, BMC, IPMI, qemu). Example of the tone: "An AI workload inside a virtual machine tried to break out and reach the server underneath it. It was stopped, the server is out of service, and the workloads that shared it now run elsewhere. We have not yet confirmed whether any data was read." known: 3 to 5 facts, one per line. unknown: 2 to 4 open questions, one per line.
3. Call file_report with a 5 to 8 sentence summary in plain prose (no markdown, no bullet points): what was detected and by which sources, the blast radius (host, co-resident guests, whether the management plane was reachable, the blast score), the containment actions that executed automatically, any action that policy blocked, the action that needed human approval and who approved it, and the final state.
4. Call post_handoff, the shift handoff for the next incident commander: 5 to 8 short lines covering status and NIST phase, what is done, what is still open (tasks, decisions), scope that needs a human, and the first thing the next shift should do.
Use only the facts you are given and the event log; do not invent numbers or names. NEVER claim that no data was accessed, exfiltrated or exposed, or that data assets are intact, when the scope list shows an asset as accessed, exfil suspected or locked: say that it is not confirmed and name what is under investigation. Put each text only in its tool call, never in a chat reply. After post_handoff succeeds, reply with one short sentence.`;

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
  // The report and the handoff are judged by what is in the backend. The brief is judged by env.final.brief because an
  // interim template brief already exists for the incident; the flag is only set by the tool after the backend accepted the write.
  const reportDone = () => env.db.reports().some(r => r.incidentId === inc.id);
  const handoffDone = () => env.db.messages(inc.id).some(m => m.authorName === 'scribe' && m.text.startsWith(HANDOFF_PREFIX));
  const isDone = () => env.final.brief && reportDone() && handoffDone();

  const spec: AgentSpec = {
    name: 'scribe',
    system: SCRIBE_SYSTEM,
    user:
      `Incident #${inc.id}: ${inc.title}. Host ${inc.host}, VM ${inc.vm}.\n` +
      `Current facts (use only these and the event log):\n${factsBlock(env, inc)}\n` +
      'Read the event log, then publish the brief, the report and the handoff.',
    tools,
    maxSteps: 9,
    maxToolCalls: 10,
    deadlineMs: 150_000,
    isDone,
    nudge: () => {
      if (!env.final.brief) return 'The brief is not published yet. Call set_brief now with text (plain sentences, no jargon), known and unknown, one item per line. If your last set_brief was rejected, change the text it complained about.';
      if (!reportDone()) return 'The report is not filed yet. Call file_report now and pass the report text as its summary argument.';
      if (!handoffDone()) return 'The shift handoff is not posted yet. Call post_handoff now with 5 to 8 short lines as its text argument.';
      return 'Everything is published. Reply with one short sentence.';
    },
    // Nemotron sometimes writes the finished text as chat text instead of calling the tool. If it has read the log and the prose
    // is long enough, file that text as the next missing artifact (report, then handoff) rather than regenerating it.
    async salvageProse(content, calls) {
      const readLog = calls.some(c => c.tool === 'list_events' && c.ok);
      const text = content.replace(/[*_#`]+/g, '').trim();
      if (!readLog || !env.final.brief) return false; // the brief has structure (three fields): never guess it from prose
      if (!reportDone() && text.length >= 120) {
        await callTool(tools, 'file_report', { summary: text });
        return true;
      }
      if (reportDone() && !handoffDone() && text.length >= 150) {
        await callTool(tools, 'post_handoff', { text });
        return true;
      }
      return false;
    },
    startStatus: 'Writing',
    startThought: `Writing the brief, the report and the shift handoff for incident #${inc.id} from the event log.`,
    async deterministic(pace) {
      const label = env.opts.scripted ? 'scripted' : 'fallback';
      if (!env.final.brief) {
        await pace();
        await setState(env, 'scribe', 'Writing', 'Writing the plain-language brief: what we know, what we do not know yet.', label);
        const b = buildBrief(env, inc);
        await callTool(tools, 'set_brief', { text: b.text, known: b.known, unknown: b.unknown });
      }
      if (!reportDone()) {
        await pace();
        await setState(env, 'scribe', 'Writing', `Compiling ${env.db.events(inc.id).length} log entries into the report.`, label);
        await callTool(tools, 'file_report', { summary: buildReport(env, inc) });
      }
      if (!handoffDone()) {
        await pace();
        await setState(env, 'scribe', 'Writing', 'Writing the shift handoff for the next incident commander.', label);
        await callTool(tools, 'post_handoff', { text: buildHandoff(env, inc).replace(/^SHIFT HANDOFF[^\n]*\n/, '') });
      }
    },
  };

  const outcome = await runAgent(env, spec);
  const who = env.opts.scripted ? 'scripted' : outcome.mode === 'fallback' ? 'fallback' : 'model';

  // Route the published brief to the stakeholder channels so each group reads it where it already is.
  const brief = env.db.briefs().find(b => b.incidentId === inc.id);
  if (brief) {
    const scope = env.db.assets(inc.id).map(a => `${a.name}: ${a.status.replace(/_/g, ' ')}`).join('\n');
    await say(env, inc.id, 'scribe', `Update for executives. ${brief.text}`, '#exec');
    await say(env, inc.id, 'scribe', `Update for counsel. ${brief.text}\nScope as of now:\n${scope}`, '#legal');
    await say(env, inc.id, 'scribe', `Update for communications. ${brief.text}`, '#comms-pr');
  }
  await say(env, inc.id, 'scribe',
    `Report for incident #${inc.id} filed (${env.db.reports().find(r => r.incidentId === inc.id)?.summary.length ?? 0} characters). The plain-language brief and the shift handoff are posted.`);

  await setState(env, 'scribe', 'Filed', `Report for incident #${inc.id} filed (${env.db.reports().find(r => r.incidentId === inc.id)?.summary.length ?? 0} chars), brief and handoff posted.`, who);
  return outcome;
}
