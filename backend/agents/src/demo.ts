// Orchestrates one incident end to end:
//   sign in -> telemetry replay -> Sentry -> Triage -> Warden (+red-team) ->
//   human approval of quarantine_host -> Scribe -> timeline.
//
// Along the way the runner keeps the war room alive: each agent speaks in #command, the stakeholder
// brief is refreshed, the NIST SP 800-61 phase moves detection_analysis -> containment -> post_incident,
// and the scope board (data assets) is updated by Triage and, as effects run, by the policy gate.

import { runScribe } from './agents/scribe.ts';
import { runSentry } from './agents/sentry.ts';
import { runTriage } from './agents/triage.ts';
import { runRedTeamProbe, runWarden } from './agents/warden.ts';
import { setState, type AgentOutcome, type Env } from './agents/common.ts';
import { APPROVER_NAME, AGENT_NAME, type RunOptions } from './config.ts';
import { SpacetimeClauraDb, type DbAuth } from './db.ts';
import { TELEMETRY } from './fixtures.ts';
import { Logger } from './log.ts';
import { MemClauraDb } from './memdb.ts';
import { OllamaClient, preflight, type LlmClient } from './ollama.ts';
import { advancePhase, classify, say, writeInterimBrief } from './room.ts';
import { Marks } from './timeline.ts';
import type { ClauraDb, IncidentRow } from './types.ts';
import { cut, errMsg, fmtS, sleep, waitFor } from './util.ts';

export interface RunSummary {
  incidentId: bigint | null;
  contained: boolean;
  reportFiled: boolean;
  outcomes: Array<AgentOutcome & { orderOk?: boolean }>;
  redTeam: 'model-chosen' | 'scripted-probe' | 'skipped';
  marks: Marks;
  log: Logger;
  exitCode: number;
}

export interface Deps {
  db?: ClauraDb;
  /** undefined = build the Ollama client; null = no model (as if unavailable). */
  llm?: LlmClient | null;
  log?: Logger;
}

function makeDb(opts: RunOptions): ClauraDb {
  if (opts.mem) return new MemClauraDb();
  const agent: DbAuth = {
    slot: 'agent',
    tokenFile: opts.tokenFile,
    enrollCode: process.env.CLAURA_AGENT_CODE,
    displayName: AGENT_NAME,
    subscribe: 'all',
    codeVar: 'CLAURA_AGENT_CODE',
  };
  // The runner is role "agent" and cannot approve. --auto-approve-after uses a SECOND identity, enrolled as a
  // commander under the name APPROVER_NAME, so every approval it makes is visibly a test harness in the audit log.
  const approver: DbAuth | undefined =
    opts.autoApproveAfterS !== undefined
      ? {
          slot: 'approver',
          tokenFile: opts.tokenFile,
          enrollCode: process.env.CLAURA_APPROVER_CODE,
          displayName: APPROVER_NAME,
          subscribe: 'operator',
          codeVar: 'CLAURA_APPROVER_CODE',
        }
      : undefined;
  return new SpacetimeClauraDb(opts.uri, opts.db, agent, approver);
}

async function replayTelemetry(env: Env): Promise<void> {
  const t0 = performance.now();
  for (const ev of TELEMETRY) {
    const wait = ev.t * 1000 * env.opts.telemetrySpeed - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
    await env.db.ingestSignal(ev.source, ev.message, ev.host, ev.vm);
    env.marks.markOnce('first_signal');
    env.log.info('telemetry', `${ev.source.padEnd(6)} ${ev.message}`);
  }
}

/** Why the database is not ready for a fresh run, or null. The runner cannot reset (it is not an admin). */
function staleReason(db: ClauraDb): string | null {
  const hosts = db.hosts();
  if (hosts.length === 0) return 'no fleet is visible to this runner: the database was never seeded, or this identity is not enrolled with role agent';
  const bad = hosts.find(h => h.status !== 'healthy');
  if (bad) return `host ${bad.host} is ${bad.status} (left over from an earlier run)`;
  if (db.incidents().length > 0) return `${db.incidents().length} incident(s) from an earlier run still exist`;
  if (db.signals().length > 0) return 'telemetry from an earlier run is still there';
  return null;
}

const serverNick = (uri: string) => (/maincloud/i.test(uri) ? 'maincloud' : 'local');

/** One-sentence account of what Warden's reversible steps achieved, from the proposals and the fleet. */
function containmentSummary(db: ClauraDb, inc: IncidentRow): string {
  const props = db.proposals(inc.id).filter(p => p.status === 'executed');
  const moved = db.guests().filter(g => g.status === 'failed_over').length;
  const did = new Map<string, string>([
    ['isolate_network', 'network cut'],
    ['revoke_credentials', 'tokens revoked'],
    ['cordon_host', 'host cordoned'],
    ['pause_guest', 'guest paused'],
    ['capture_memory', 'memory captured as evidence'],
    ['failover_guests', `${moved} co-resident guests moved to clean hosts`],
  ]);
  const parts = props.map(p => did.get(p.action)).filter((x): x is string => !!x);
  return parts.length
    ? `Reversible containment is done on ${inc.host}: ${parts.join(', ')}.`
    : `No reversible containment step has executed on ${inc.host} yet.`;
}

/**
 * How the quarantine_host step was settled. Normally a human approves it. 'auto' and 'blocked' only
 * happen when an operator has edited the policy table (set_policy): the gate, not the runner, decides.
 */
export type QuarantineOutcome = 'approved' | 'auto' | 'blocked' | 'timeout';

/**
 * Settle the quarantine_host proposal. Normally it is pending: wait for a human (dashboard) to approve
 * it, optionally approving through the labelled test-harness identity. If policy already ruled on it
 * (auto = it ran, deny = it was blocked) there is nobody to wait for.
 */
async function awaitApproval(env: Env, inc: IncidentRow): Promise<QuarantineOutcome> {
  const { db, log, opts } = env;
  const quarantine = () => db.proposals(inc.id).find(p => p.action === 'quarantine_host');
  const q0 = quarantine();
  if (!q0) throw new Error('no quarantine_host proposal exists to approve');
  if (q0.status === 'executed') {
    log.ok('policy', `quarantine_host ran under policy mode "${q0.policyMode}" with no human (operator changed the policy); nothing to approve`);
    return 'auto';
  }
  if (q0.status === 'blocked') {
    log.error('policy', `quarantine_host was blocked (policy mode "${q0.policyMode}"); the host cannot be quarantined, so the incident stays open`);
    return 'blocked';
  }
  const t0 = performance.now();
  const auto = opts.autoApproveAfterS;
  log.info('runner', auto !== undefined
    ? `waiting for approval of proposal #${q0.id} (quarantine_host); after ${auto}s the labelled test-harness identity "${APPROVER_NAME}" approves (a commander approving from the dashboard wins if faster)`
    : `waiting for a commander or admin to approve proposal #${q0.id} (quarantine_host) from the dashboard ... (use --auto-approve-after N for the labelled test harness)`);
  let lastBeat = 0;
  let autoFailures = 0;
  let nextTry = auto ?? 0;
  for (;;) {
    const q = quarantine()!;
    if (q.status === 'approved') {
      log.ok('human', `${q.decidedBy || 'an operator'} approved quarantine_host -> ${q.target}`);
      env.marks.markOnce('approved');
      return 'approved';
    }
    if (q.status !== 'pending_approval') throw new Error(`quarantine proposal is ${q.status}; cannot wait for approval`);
    const waited = (performance.now() - t0) / 1000;
    if (auto !== undefined && autoFailures < 3 && waited >= nextTry) {
      log.info('human', `auto-approving through the labelled test-harness identity "${APPROVER_NAME}" (--auto-approve-after ${auto})`);
      try {
        await db.approve(q.id, APPROVER_NAME);
        // The approval travelled on a different connection: wait until THIS replica has seen it before looking again.
        await waitFor(() => quarantine()!.status !== 'pending_approval', { timeoutMs: 5000, label: 'approval to reach this replica' }).catch(() => undefined);
      } catch (e) {
        autoFailures++;
        nextTry = waited + 2;
        log.warn('runner', `auto-approve failed (${autoFailures}/3; maybe a human got there first): ${errMsg(e)}`);
        if (autoFailures >= 3) log.error('runner', 'giving up on auto-approve; waiting for a commander or admin to approve from the dashboard');
      }
      continue; // re-read status next loop
    }
    if (opts.approvalTimeoutS > 0 && waited >= opts.approvalTimeoutS) {
      log.error('runner', `no approval after ${opts.approvalTimeoutS}s; giving up waiting`);
      return 'timeout';
    }
    if (waited - lastBeat >= 15) {
      lastBeat = waited;
      log.info('runner', `still waiting for approval (${Math.round(waited)}s) ...`);
    }
    await sleep(100);
  }
}

export async function runDemo(opts: RunOptions, deps: Deps = {}): Promise<RunSummary> {
  const log = deps.log ?? new Logger(opts.verbose);
  const marks = new Marks(log);
  const db: ClauraDb = deps.db ?? makeDb(opts);
  const outcomes: RunSummary['outcomes'] = [];
  let redTeam: RunSummary['redTeam'] = 'skipped';
  let incidentId: bigint | null = null;
  let contained = false;
  let reportFiled = false;
  let exitCode = 0;

  log.info('runner', `${opts.scripted ? 'SCRIPTED mode (no model)' : 'model mode'}; backend: ${db.kind === 'memory' ? 'in-process contract mirror (--mem)' : `SpacetimeDB ${opts.uri} db "${opts.db}"`}`);
  try {
    await db.connect();
  } catch (e) {
    log.error('runner', errMsg(e));
    return { incidentId, contained, reportFiled, outcomes, redTeam, marks, log, exitCode: 1 };
  }
  const me = db.who();
  if (me) log.ok('runner', `signed in as "${me.name}" (role ${me.role}, identity ${me.identityHex.slice(0, 12)}…)`);

  // ---- model preflight ----------------------------------------------------
  let llm: LlmClient | null = null;
  let modelUnavailable: string | undefined;
  if (!opts.scripted) {
    if (deps.llm !== undefined) llm = deps.llm;
    else {
      const client = new OllamaClient();
      const pf = await preflight(client);
      if (pf.ok) {
        llm = client;
        log.ok('runner', `Ollama ready: ${client.model} (warm-up ${fmtS(pf.warmMs)})`);
      } else {
        modelUnavailable = pf.reason;
        log.warn('runner', `MODEL UNAVAILABLE: ${pf.reason}. Every agent will use its deterministic fallback (use --scripted to run intentionally without a model).`);
      }
    }
    if (llm === null && !modelUnavailable) modelUnavailable = 'no model client supplied';
  }
  const env: Env = { db, log, opts, marks, llm, modelUnavailable, final: { brief: false } };
  const lbl = opts.scripted ? 'scripted' : llm ? 'model' : 'fallback';

  try {
    // ---- fresh state + idle agents -----------------------------------------
    if (opts.reset || db.kind === 'memory') {
      await db.resetDemo();
      log.info('runner', 'reset_demo done: hosts, guests, policy, scope inventory and agent rows reseeded');
    } else {
      const stale = staleReason(db);
      if (stale) {
        throw new Error(
          `the database is not in a fresh demo state: ${stale}. The runner is not an admin and cannot reset it. ` +
            `Reset it as the database owner:  spacetime call --server ${serverNick(opts.uri)} ${opts.db} reset_demo`,
        );
      }
    }
    await setState(env, 'sentry', 'Watching', 'Watching the fleet. Syscall baselines steady.', lbl);
    await setState(env, 'triage', 'Standing by', 'No open incidents. Blast-radius model warm.', lbl);
    await setState(env, 'warden', 'Standing by', 'Holding. Containment playbook loaded; policy gate enforces what I may do.', lbl);
    await setState(env, 'scribe', 'Idle', 'No open incidents.', lbl);

    // ---- 1. telemetry -> 2. Sentry ---------------------------------------
    log.info('runner', `replaying ${TELEMETRY.length} telemetry signals`);
    await replayTelemetry(env);

    const sentry = await runSentry(env);
    outcomes.push(sentry.outcome);
    incidentId = sentry.incidentId;
    const id = incidentId;
    const inc = () => db.incidents().find(i => i.id === id)!;
    log.ok('sentry', `incident #${id} open (${fmtS(marks.between('first_signal', 'incident_open') ?? 0)} after first signal)`);
    const sensors = new Set(db.signals().map(s => s.source)).size;
    await say(env, id, 'sentry', `Incident #${id} opened, ${inc().severity}. ${inc().title}. Host ${inc().host}, VM ${inc().vm}. ${db.signals().length} signals from ${sensors} independent sensors.`);
    await setState(env, 'scribe', 'Recording', 'Logging each step as it lands.', lbl);
    await writeInterimBrief(env, inc(), 'detect');

    // ---- 3. Triage --------------------------------------------------------
    outcomes.push(await runTriage(env, inc()));
    log.ok('triage', `blast score ${inc().blastScore.toFixed(2)}`);
    await classify(env, inc(), 'triage');
    {
      const co = db.guests().filter(g => g.host === inc().host && g.vm !== inc().vm).length;
      const scoped = db.assets(id).filter(a => a.updatedBy !== 'seed' && a.status !== 'intact').map(a => `${a.name}: ${a.status.replace(/_/g, ' ')}`);
      await say(env, id, 'triage', `Blast radius ${inc().blastScore.toFixed(2)}: 1 host, ${co} co-resident guests. ${scoped.length ? `Scope: ${scoped.join('; ')}.` : 'No data asset is implicated yet.'}`);
    }

    // ---- 4. Warden (+ red-team) ------------------------------------------
    await advancePhase(env, inc(), 'containment');
    const warden = await runWarden(env, inc());
    outcomes.push(warden);
    log.info('warden', `playbook order ${warden.orderOk ? 'followed (reversible first, quarantine last)' : 'DEVIATED from the reversible-first order (gate still enforced policy)'}`);
    await say(env, id, 'warden', containmentSummary(db, inc()));

    const modelBlocked = db.proposals(id).some(p => p.agent === 'warden' && p.status === 'blocked');
    if (modelBlocked) {
      redTeam = 'model-chosen';
      log.ok('policy', 'the MODEL itself proposed an action policy denies; the gate blocked it (no red-team probe needed)');
    } else if (opts.redTeam === 'off') {
      redTeam = 'skipped';
    } else {
      await runRedTeamProbe(env, inc());
      redTeam = 'scripted-probe';
    }
    {
      const b = db.proposals(id).find(p => p.status === 'blocked' && p.policyMode === 'deny');
      if (b) {
        await say(env, id, 'warden',
          `Policy blocked ${b.action} on ${b.target}: it would destroy forensic evidence. ${redTeam === 'scripted-probe' ? '(Labelled red-team probe scripted by the runner, not a model decision.)' : '(The model proposed it; the gate refused.)'}`);
      }
    }

    // ---- 5. human approval -----------------------------------------------
    const q = db.proposals(id).find(p => p.action === 'quarantine_host');
    if (q?.status === 'pending_approval') {
      await setState(env, 'warden', 'Awaiting approval', `quarantine_host ${inc().host} is pending. Waiting for a commander to approve.`, lbl);
      await say(env, id, 'warden', `Quarantining ${inc().host} needs a human (proposal #${q.id}). Approval requested from the incident commander.`);
      await writeInterimBrief(env, inc(), 'approval');
    }
    const quarantine = await awaitApproval(env, inc());
    if (quarantine === 'approved' || quarantine === 'auto') {
      const approver = db.proposals(id).find(p => p.action === 'quarantine_host')?.decidedBy;
      await setState(env, 'warden', 'Quarantining',
        quarantine === 'approved'
          ? `Approved. Taking ${inc().host} out of the pool.`
          : `Policy lets this run without a human. Taking ${inc().host} out of the pool.`, lbl);
      if (quarantine === 'approved') await say(env, id, 'warden', `Approved by ${approver || 'an operator'}. Taking ${inc().host} out of the pool.`);
      await waitFor(() => db.incidents().find(i => i.id === id)?.status === 'contained', {
        timeoutMs: 15_000, label: 'incident to reach contained',
      }).catch(e => log.error('runner', errMsg(e)));
      if (inc().status === 'contained') {
        marks.markOnce('contained');
        contained = true;
        log.ok('warden', `host ${inc().host} quarantined, incident #${id} contained`);
        await setState(env, 'warden', 'Contained', `Host ${inc().host} quarantined. Escape stopped at the hypervisor boundary.`, lbl);
        await setState(env, 'triage', 'Closed', `Scope closed. Blast score was ${inc().blastScore.toFixed(2)}.`, lbl);
        await say(env, id, 'warden', `${inc().host} quarantined. The escape stopped at the hypervisor boundary.`);
        await classify(env, inc(), 'contained');
      }
    } else {
      exitCode = 2;
    }

    // ---- 6. Scribe --------------------------------------------------------
    // Post-incident activity (report, brief, handoff, lessons) starts once containment holds.
    if (contained) await advancePhase(env, inc(), 'post_incident');
    outcomes.push(await runScribe(env, inc()));
    reportFiled = db.reports().some(r => r.incidentId === id);
    await setState(env, 'sentry', 'Watching', `Back on watch. Incident #${id} ${contained ? 'contained' : 'still open'}.`, lbl);
    if (!contained) exitCode = exitCode || 2;
    if (!reportFiled) exitCode = 1;
  } catch (e) {
    exitCode = 1;
    log.error('runner', `run failed: ${errMsg(e)}`);
    if (opts.verbose && e instanceof Error && e.stack) log.error('runner', e.stack);
  }

  const summary: RunSummary = { incidentId, contained, reportFiled, outcomes, redTeam, marks, log, exitCode };
  try {
    if (!log.isQuiet) printSummary(summary, db);
  } finally {
    db.close();
  }
  return summary;
}

// ------------------------------------------------------------------ summary

export function printSummary(s: RunSummary, db: ClauraDb): void {
  const { marks, log } = s;
  const t = (n: Parameters<Marks['get']>[0]) => marks.get(n);
  const t0 = marks.get('first_signal') ?? 0;
  const row = (at: number | undefined, text: string) =>
    at === undefined ? null : `  ${('T+' + ((at - t0) / 1000).toFixed(2) + 's').padEnd(9)} ${text}`;

  console.log('\n' + '='.repeat(78));
  console.log('CLAURA RUN SUMMARY');
  console.log('='.repeat(78));
  console.log('\nTimeline (milestones, seconds after the first signal)');
  const lines = [
    row(t('first_signal'), 'first telemetry signal ingested'),
    row(t('incident_open'), `Sentry opened incident #${s.incidentId}`),
    row(t('triage_done'), 'Triage recorded the attack graph + blast score'),
    row(t('pending_approval'), 'Warden: quarantine_host pending human approval'),
    row(t('approved'), 'operator approved quarantine_host'),
    row(t('contained'), 'host quarantined, incident contained'),
    row(t('brief_filed'), 'Scribe published the plain-language brief'),
    row(t('report_filed'), 'Scribe filed the incident report'),
    row(t('handoff_posted'), 'Scribe posted the shift handoff'),
  ].filter((x): x is string => x !== null);
  console.log(lines.join('\n') || '  (no milestones reached)');

  const d = (a: Parameters<Marks['get']>[0], b: Parameters<Marks['get']>[0]) => {
    const v = marks.between(a, b);
    return v === undefined ? 'n/a' : fmtS(v);
  };
  console.log('\nMeasured times (wall clock on this machine)');
  console.log(`  first signal -> incident open       ${d('first_signal', 'incident_open')}`);
  console.log(`  first signal -> pending approval    ${d('first_signal', 'pending_approval')}`);
  console.log(`  first signal -> contained           ${d('first_signal', 'contained')}`);
  const wait = marks.between('pending_approval', 'approved');
  if (wait !== undefined) {
    const total = marks.between('first_signal', 'contained');
    console.log(`    of which waiting for the human    ${fmtS(wait)}`);
    if (total !== undefined) console.log(`    machine time (without the wait)   ${fmtS(total - wait)}`);
  }
  console.log(`  contained -> report filed           ${d('contained', 'report_filed')}`);
  console.log(`  contained -> brief + handoff done   ${d('contained', 'handoff_posted')}`);
  if (s.incidentId !== null) {
    const inc = db.incidents().find(i => i.id === s.incidentId);
    if (inc?.containedAtMs) console.log(`  server clock: opened_at -> contained_at  ${fmtS(inc.containedAtMs - inc.openedAtMs)}`);
  }

  console.log('\nAgents');
  console.log('  agent    mode             turns  calls  bad  model-time  tokens  note');
  for (const o of s.outcomes) {
    console.log(
      `  ${o.agent.padEnd(8)} ${o.mode.padEnd(16)} ${String(o.steps).padStart(5)} ${String(o.toolCalls).padStart(6)} ${String(o.malformed).padStart(4)}  ${fmtS(o.llmMs).padStart(10)} ${String(o.evalTokens).padStart(7)}  ${o.note}`,
    );
  }
  const fb = s.outcomes.filter(o => o.mode === 'fallback' || o.mode === 'model+fallback');
  if (fb.length) console.log(`\n  FALLBACK USED by: ${fb.map(o => o.agent).join(', ')} (deterministic routine completed the work)`);
  console.log(`  red-team: ${s.redTeam === 'model-chosen' ? 'the MODEL proposed a denied action itself' : s.redTeam === 'scripted-probe' ? 'SCRIPTED probe (reimage_host), not chosen by the model' : 'skipped'}`);

  if (s.incidentId !== null) {
    const inc = db.incidents().find(i => i.id === s.incidentId);
    const props = db.proposals(s.incidentId);
    console.log('\nContainment proposals (what the policy gate decided)');
    for (const p of props) {
      console.log(`  #${String(p.id).padEnd(3)} ${p.action.padEnd(19)} ${p.target.padEnd(12)} ${p.status.padEnd(17)} policy=${p.policyMode}${p.decidedBy ? `  by ${p.decidedBy}` : ''}`);
    }
    if (inc) {
      console.log('\nIncident documentation (NIST SP 800-61)');
      console.log(`  phase            ${inc.nistPhase}`);
      console.log(`  category         ${inc.category}`);
      console.log(`  functional       ${inc.functionalImpact}`);
      console.log(`  information      ${inc.informationImpact}`);
      console.log(`  recoverability   ${inc.recoverability}`);
    }
    console.log('\nScope board (data assets)');
    for (const a of db.assets(s.incidentId)) {
      console.log(`  ${a.name.padEnd(30)} ${a.status.padEnd(19)} ${cut(a.note, 70)}`);
    }
    const msgs = db.messages(s.incidentId);
    console.log(`\nWar room: ${msgs.length} messages (${msgs.filter(m => m.kind === 'agent').length} from agents), ${db.tasks(s.incidentId).length} tasks, ${db.decisions(s.incidentId).length} decisions`);
    const brief = db.briefs().find(b => b.incidentId === s.incidentId);
    if (brief) console.log(`Brief (${brief.author}): ${cut(brief.text, 300)}`);
    const rep = db.reports().find(r => r.incidentId === s.incidentId);
    if (rep) console.log(`\nReport (${rep.summary.length} chars)\n  ${rep.summary.replace(/\n+/g, '\n  ')}`);
  }
  console.log(`\nResult: ${s.contained ? 'CONTAINED' : 'NOT CONTAINED'}, report ${s.reportFiled ? 'filed' : 'NOT filed'}, exit ${s.exitCode}`);
  void log;
}
