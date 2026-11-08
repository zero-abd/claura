// The war room, from the agents' side: speaking in channels, the stakeholder brief, the NIST impact
// classification, and the facts block Scribe's prompts and the deterministic fallbacks are built from.
//
// Everything written here comes from backend rows (the same ones the dashboard shows), so a brief or a
// handoff cannot drift from the incident's real state. Interim briefs are templates, labelled as such in
// agent_state; the final brief and the handoff are written by the model (or, honestly labelled, by the
// deterministic fallback).

import { setState, type Env } from './agents/common.ts';
import type { AgentName, AssetRow, IncidentRow } from './types.ts';
import { cut, errMsg } from './util.ts';

export const COMMAND = '#command';

/** Speak in a channel as one of the four agents. Never throws: a chat line must not break containment. */
export async function say(
  env: Env,
  incidentId: bigint,
  agent: AgentName,
  text: string,
  channel: string = COMMAND,
): Promise<void> {
  try {
    await env.db.postAgentMessage(incidentId, channel, agent, cut(text, 1800));
  } catch (e) {
    env.log.warn(agent, `could not post to ${channel}: ${errMsg(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Guard rails on what the model may tell stakeholders
// ---------------------------------------------------------------------------

/** Scope statuses that mean "data may have been touched": a text must never claim otherwise. */
const AFFECTED = ['accessed', 'exfil_suspected', 'exfil_confirmed', 'locked_ransomware'];
const EXPOSURE = '(exfiltrat\\w*|accessed|exposed|leaked|stolen|read|compromised|affected|touched|lost)';
const NO_DATA_CLAIMS: RegExp[] = [
  new RegExp(`\\bno (customer |tenant |user )?(data|records?|information)\\b[^.\\n]{0,40}\\b${EXPOSURE}\\b`, 'i'),
  new RegExp(`\\b(data|records?|information)\\b[^.\\n]{0,30}\\b(has|have|was|were|is|are)\\b (not|never) (been )?${EXPOSURE}\\b`, 'i'),
  new RegExp(`\\bno (sign|evidence|indication)s?\\b[^.\\n]{0,40}\\b${EXPOSURE}\\b`, 'i'),
  /\bno exfiltration\b(?!\s+(?:has|have|had|is|was|were)\s+(?:been\s+)?(?:confirmed|proven|established|verified))/i,
  /\bnothing (was|has been) (exfiltrated|accessed|exposed|stolen)\b/i,
  /\bdata( assets?)?( are| is)? (all )?intact\b/i,
  /\ball (data )?assets? (are |is )?intact\b/i,
];

/**
 * A text for people must not reassure when the scope board says data may have been touched. Returns an error the
 * model can act on, or null. This is the check a hurried human reader would never run on a model's sentence.
 */
/** The first false-reassurance phrase in `text`, or ''. "no data has been CONFIRMED exfiltrated" is the careful wording we want. */
function falseReassurance(text: string): string {
  for (const re of NO_DATA_CLAIMS) {
    const m = re.exec(text);
    if (m && !/\b(confirmed|proven|established|verified)\b/i.test(m[0])) return m[0];
  }
  return '';
}

export function claimProblems(text: string, assets: AssetRow[]): string | null {
  const touched = assets.filter(a => AFFECTED.includes(a.status));
  if (touched.length === 0) return null;
  const phrase = falseReassurance(text);
  if (!phrase) return null;
  return (
    `you wrote "${phrase}", but the scope board shows: ${touched.map(a => `${a.name} (${a.status.replace(/_/g, ' ')})`).join('; ')}. ` +
    'Do not claim that no data was read, exfiltrated or intact. Replace that sentence with "We have not confirmed whether any data was read" and name what is under investigation. Do not resend the same text.'
  );
}

export const CAREFUL_SENTENCE = 'We have not confirmed whether any data was read.';

/**
 * Instead of bouncing a text back (a small model tends to resend it unchanged until the loop gives up), replace every
 * sentence that claims "no data was affected" with the careful wording, once. It can only make a text more cautious.
 * Returns how many sentences were replaced; 0 when the scope board has nothing touched or the text makes no such claim.
 */
export function softenClaims(text: string, assets: AssetRow[]): { text: string; softened: number } {
  if (!assets.some(a => AFFECTED.includes(a.status))) return { text, softened: 0 };
  let softened = 0;
  let inserted = false;
  const lines = text.split('\n').map(line => {
    const out: string[] = [];
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      if (falseReassurance(sentence)) {
        softened++;
        if (!inserted) { out.push(CAREFUL_SENTENCE); inserted = true; }
      } else out.push(sentence);
    }
    return out.join(' ').trim();
  });
  return { text: lines.filter(l => l.length > 0).join('\n'), softened };
}

/**
 * The brief is for lawyers, executives and PR: protocol names are replaced with plain words instead of rejecting the text
 * (a small model tends to resend a rejected text unchanged). Only vocabulary changes; no fact is added or removed.
 */
export function plainify(text: string): string {
  return text
    .replace(/\bvGPU\b/gi, 'virtual GPU')
    .replace(/\bIOMMU\b/gi, 'memory protection')
    .replace(/\bmdev\b/gi, 'virtual device')
    .replace(/\bioctl\b/gi, 'system call')
    .replace(/\bDMA\b/g, 'direct memory access')
    .replace(/\bqemu\b/gi, 'the virtualization software')
    .replace(/\bBMC\b/g, 'management controller')
    .replace(/\bIPMI\b/g, 'management interface')
    .replace(/\bVMM\b/g, 'virtual machine monitor');
}

const names = (assets: AssetRow[], ...statuses: string[]) =>
  assets.filter(a => statuses.includes(a.status)).map(a => a.name);

// ---------------------------------------------------------------------------
// NIST SP 800-61 impact classification (rule-based, from the scope board and the fleet)
// ---------------------------------------------------------------------------

export interface Classification {
  category: string;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
}

export function classification(env: Env, inc: IncidentRow, when: 'triage' | 'contained'): Classification {
  const assets = env.db.assets(inc.id);
  const locked = names(assets, 'locked_ransomware');
  const suspected = names(assets, 'exfil_suspected');
  const confirmed = names(assets, 'exfil_confirmed');
  const accessed = names(assets, 'accessed');
  const moved = env.db.guests().filter(g => g.status === 'failed_over').length;
  const hostOut = env.db.hosts().find(h => h.host === inc.host)?.status === 'quarantined';

  let functional = locked.length
    ? `Medium: ${locked.join(', ')} locked by ransomware; AI data center services still delivered`
    : 'Low: all critical services still delivered';
  if (when === 'contained' && hostOut) functional += `; ${inc.host} withdrawn, ${moved} tenants failed over`;

  const parts: string[] = [];
  if (confirmed.length) parts.push(`Breach confirmed: ${confirmed.join(', ')}`);
  if (suspected.length) parts.push(`Proprietary breach suspected: ${suspected.join(', ')} (no confirmation yet)`);
  if (accessed.length) parts.push(`Accessed, no exfiltration seen: ${accessed.join(', ')}`);

  const restore = locked.length ? `; ${locked.join(', ')} needs a restore from offline backup` : '';
  const recoverability =
    when === 'contained' && hostOut
      ? `Supplemented: ${inc.host} stays out of service until forensics sign off${restore}`
      : locked.length
        ? `Supplemented${restore}; tenants can fail over with existing resources`
        : 'Regular: tenants can fail over to clean hosts with existing resources';

  return {
    category: 'Unauthorized access: guest-to-host escape (multi-tenant isolation breach)',
    functionalImpact: functional,
    informationImpact: parts.length ? parts.join('. ') : 'None identified',
    recoverability,
  };
}

/** Write the classification to the incident. Never throws. */
export async function classify(env: Env, inc: IncidentRow, when: 'triage' | 'contained'): Promise<void> {
  const c = classification(env, inc, when);
  try {
    await env.db.setIncidentClassification(inc.id, c.category, c.functionalImpact, c.informationImpact, c.recoverability);
    env.log.info('runner', `NIST classification (${when}): functional "${c.functionalImpact}"; information "${c.informationImpact}"`);
  } catch (e) {
    env.log.warn('runner', `could not set the classification: ${errMsg(e)}`);
  }
}

/** Move the NIST phase forward. Never throws. */
export async function advancePhase(env: Env, inc: IncidentRow, phase: string): Promise<void> {
  try {
    await env.db.setIncidentPhase(inc.id, phase);
    env.log.info('runner', `NIST SP 800-61 phase -> ${phase}`);
  } catch (e) {
    env.log.warn('runner', `could not move the phase to ${phase}: ${errMsg(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Interim briefs (templates) for the moments the model should not be in the way
// ---------------------------------------------------------------------------

export async function writeInterimBrief(env: Env, inc: IncidentRow, stage: 'detect' | 'approval'): Promise<void> {
  const fresh = env.db.incidents().find(i => i.id === inc.id) ?? inc;
  const assets = env.db.assets(inc.id);
  const moved = env.db.guests().filter(g => g.status === 'failed_over').length;
  const sources = new Set(env.db.signals().map(s => s.source)).size;
  const dataTouched = assets.some(a => ['exfil_suspected', 'exfil_confirmed', 'accessed'].includes(a.status) && !/FIN-02|billing/i.test(a.name));
  const ransom = names(assets, 'locked_ransomware');

  let text: string;
  let known: string[];
  let unknown: string[];
  if (stage === 'detect') {
    text =
      'An AI workload inside a virtual machine tried to break out and reach the server underneath it. ' +
      'Our detection agent caught it within seconds and is now working out how far it got.';
    known = [`It started on one server, ${inc.host}`, `${sources} independent sensors saw it`, 'Our own tools are working'];
    unknown = ['Whether any data was read', 'How far the attacker got'];
  } else {
    text =
      "Everything that can be undone is done: the workload's network and passwords are cut off, the server is fenced off, " +
      `the workload is paused and its memory is saved as evidence.${moved ? ` ${moved} other workloads are running on safe servers.` : ''} ` +
      'One step is left and needs a person: taking the server out of service.';
    known = [
      `It started on one server, ${inc.host}`,
      `Blast radius scored ${fresh.blastScore.toFixed(2)} out of 1`,
      ...(moved ? [`${moved} other workloads moved to safe servers`] : []),
      'Evidence is captured and kept off the network',
    ];
    unknown = [
      ...(dataTouched ? ['Whether any data was read before containment'] : []),
      'How the attacker found the flaw',
      ...(ransom.length ? [`Whether the ransomware on ${ransom.join(', ')} is connected`] : []),
    ];
  }
  await setState(env, 'scribe', 'Recording', 'Updating the stakeholder brief from the current facts.', 'template');
  try {
    await env.db.setBrief(inc.id, text, known.join('\n'), unknown.join('\n'));
  } catch (e) {
    env.log.warn('scribe', `could not write the ${stage} brief: ${errMsg(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Facts block: what Scribe's model is allowed to talk about
// ---------------------------------------------------------------------------

export function factsBlock(env: Env, inc: IncidentRow): string {
  const i = env.db.incidents().find(x => x.id === inc.id) ?? inc;
  const assets = env.db.assets(inc.id);
  const props = env.db.proposals(inc.id);
  const tasks = env.db.tasks(inc.id);
  const decisions = env.db.decisions(inc.id);
  const hostStatus = env.db.hosts().find(h => h.host === inc.host)?.status ?? 'unknown';
  const moved = env.db.guests().filter(g => g.status === 'failed_over').length;
  const executed = props.filter(p => p.status === 'executed').map(p => `${p.action} (${p.target})`);
  const blocked = props.filter(p => p.status === 'blocked').map(p => `${p.action} (${p.target})`);
  const approved = props.filter(p => p.status === 'approved').map(p => `${p.action} on ${p.target} approved by ${p.decidedBy}`);
  const pending = props.filter(p => p.status === 'pending_approval').map(p => `${p.action} on ${p.target}`);
  const lines = [
    `Incident #${i.id} [${i.severity}], status ${i.status}, NIST phase ${i.nistPhase}: ${i.title}`,
    `Host ${i.host} is ${hostStatus}; suspect VM ${i.vm}; ${moved} co-resident guests failed over; blast score ${i.blastScore.toFixed(2)}`,
    `Category: ${i.category}`,
    `Functional impact: ${i.functionalImpact}`,
    `Information impact: ${i.informationImpact}`,
    `Recoverability: ${i.recoverability}`,
    'Scope (data assets):',
    ...assets.map(a => `  - ${a.name} [${a.status}]: ${cut(a.note, 140)}`),
    `Actions executed by policy: ${executed.join(', ') || 'none'}`,
    `Actions blocked by policy: ${blocked.join(', ') || 'none'}`,
    `Human approvals: ${approved.join('; ') || 'none'}${pending.length ? `; still pending: ${pending.join('; ')}` : ''}`,
    'Tasks:',
    ...tasks.map(t => `  - [${t.status}] ${t.title} (owner ${t.ownerRole})`),
    'Decisions of record:',
    ...decisions.map(d => `  - ${d.text} (${d.byName})`),
  ];
  return lines.join('\n');
}

/** The brief a deterministic fallback writes: same facts, no model. */
export function buildBrief(env: Env, inc: IncidentRow): { text: string; known: string; unknown: string } {
  const i = env.db.incidents().find(x => x.id === inc.id) ?? inc;
  const assets = env.db.assets(inc.id);
  const props = env.db.proposals(inc.id);
  const hostOut = env.db.hosts().find(h => h.host === inc.host)?.status === 'quarantined';
  const moved = env.db.guests().filter(g => g.status === 'failed_over').length;
  const approver = props.find(p => p.action === 'quarantine_host' && p.status === 'approved')?.decidedBy;
  const ransom = names(assets, 'locked_ransomware');
  const suspected = names(assets, 'exfil_suspected', 'exfil_confirmed');
  const text = hostOut
    ? `A suspected escape from an AI workload was stopped at the edge of its virtual machine. The affected server (${inc.host}) is out of service ` +
      `and the ${moved} other workloads on it now run on safe servers.${suspected.length ? ` We are treating ${suspected.join(' and ').toLowerCase()} as possibly exposed until we can rule it out.` : ''}` +
      `${ransom.length ? ` Separately, ${ransom.join(' and ')} is locked by ransomware and is being handled in the same room.` : ''}`
    : `A suspected escape from an AI workload is being contained. The affected server (${inc.host}) is fenced off but not yet out of service: a person still has to approve that step.`;
  const known = [
    `It started on one server, ${inc.host}`,
    'It was stopped before it reached the management network',
    ...(approver ? [`Taking the server out of service was approved by ${approver}`] : []),
    `Blast radius scored ${i.blastScore.toFixed(2)} out of 1`,
    'Evidence is captured and kept off the network',
  ];
  const unknown = [
    'Whether any data was read before containment',
    'How the attacker found the flaw',
    ...(ransom.length ? [`Whether the ransomware on ${ransom.join(', ')} is connected`] : []),
  ];
  return { text, known: known.join('\n'), unknown: unknown.join('\n') };
}

/** The shift-handoff a deterministic fallback writes. */
export function buildHandoff(env: Env, inc: IncidentRow): string {
  const i = env.db.incidents().find(x => x.id === inc.id) ?? inc;
  const assets = env.db.assets(inc.id);
  const tasks = env.db.tasks(inc.id).filter(t => t.status !== 'done');
  const hostStatus = env.db.hosts().find(h => h.host === inc.host)?.status ?? 'unknown';
  const needsHuman = assets.filter(a => ['locked_ransomware', 'exfil_suspected', 'accessed'].includes(a.status));
  return [
    `SHIFT HANDOFF, incident #${i.id}`,
    `Status: ${i.status}, NIST phase ${i.nistPhase}. ${inc.host} is ${hostStatus}.`,
    `Done: reversible containment ran under policy, memory is captured, tenants are on clean hosts, ${i.status === 'contained' ? 'quarantine was approved' : 'quarantine is waiting for a commander'}.`,
    `Open tasks: ${tasks.map(t => `${t.title} (${t.ownerRole})`).join('; ') || 'none'}.`,
    `Scope that needs a human: ${needsHuman.map(a => `${a.name} [${a.status}]`).join('; ') || 'nothing'}.`,
    'Next: confirm or rule out data exposure, keep the host out of service until forensics sign off, and keep coordinating in this room only.',
  ].join('\n');
}
