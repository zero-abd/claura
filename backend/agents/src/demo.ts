// Orchestrates one incident end to end:
//   reset -> telemetry replay -> Sentry -> Triage -> Warden (+red-team) ->
//   human approval of quarantine_host -> Scribe -> timeline.

import { runScribe } from './agents/scribe.ts';
import { runSentry } from './agents/sentry.ts';
import { runTriage } from './agents/triage.ts';
import { runRedTeamProbe, runWarden } from './agents/warden.ts';
import { setState, type AgentOutcome, type Env } from './agents/common.ts';
import type { RunOptions } from './config.ts';
import { SpacetimeClauraDb } from './db.ts';
import { TELEMETRY } from './fixtures.ts';
import { Logger } from './log.ts';
import { MemClauraDb } from './memdb.ts';
import { OllamaClient, preflight, type LlmClient } from './ollama.ts';
import { Marks } from './timeline.ts';
import type { ClauraDb, IncidentRow } from './types.ts';
import { errMsg, fmtS, sleep, waitFor } from './util.ts';

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

/** Wait for a human (dashboard) to approve quarantine_host; optionally auto-approve as RK. */
async function awaitApproval(env: Env, inc: IncidentRow): Promise<boolean> {
  const { db, log, opts } = env;
  const quarantine = () => db.proposals(inc.id).find(p => p.action === 'quarantine_host');
  const q0 = quarantine();
  if (!q0) throw new Error('no quarantine_host proposal exists to approve');
  const t0 = performance.now();
  const auto = opts.autoApproveAfterS;
  log.info('runner', auto !== undefined
    ? `waiting for human approval of proposal #${q0.id} (quarantine_host); auto-approving as RK after ${auto}s`
    : `waiting for human approval of proposal #${q0.id} (quarantine_host) from the dashboard ... (use --auto-approve-after N to approve as RK)`);
  let lastBeat = 0;
  for (;;) {
    const q = quarantine()!;
    if (q.status === 'approved') {
      log.ok('human', `${q.decidedBy || 'an operator'} approved quarantine_host -> ${q.target}`);
      env.marks.markOnce('approved');
      return true;
    }
    if (q.status !== 'pending_approval') throw new Error(`quarantine proposal is ${q.status}; cannot wait for approval`);
    const waited = (performance.now() - t0) / 1000;
    if (auto !== undefined && waited >= auto) {
      log.info('human', `auto-approving as operator "RK" (--auto-approve-after ${auto})`);
      try {
        await db.approve(q.id, 'RK');
      } catch (e) {
        log.warn('runner', `approve call failed (maybe a human got there first): ${errMsg(e)}`);
      }
      continue; // re-read status next loop
    }
    if (opts.approvalTimeoutS > 0 && waited >= opts.approvalTimeoutS) {
      log.error('runner', `no approval after ${opts.approvalTimeoutS}s; giving up waiting`);
      return false;
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
  const db: ClauraDb = deps.db ?? (opts.mem ? new MemClauraDb() : new SpacetimeClauraDb(opts.uri, opts.db));
  const outcomes: RunSummary['outcomes'] = [];
  let redTeam: RunSummary['redTeam'] = 'skipped';
  let incidentId: bigint | null = null;
  let contained = false;
  let reportFiled = false;
  let exitCode = 0;

  log.info('runner', `${opts.scripted ? 'SCRIPTED mode (no model)' : 'model mode'}; backend: ${db.kind === 'memory' ? 'in-process contract mirror (--mem)' : `SpacetimeDB ${opts.uri} db "${opts.db}"`}`);
  await db.connect();

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
  const env: Env = { db, log, opts, marks, llm, modelUnavailable };
  const lbl = opts.scripted ? 'scripted' : llm ? 'model' : 'fallback';

  try {
    // ---- reset + idle agents ---------------------------------------------
    if (!opts.noReset) {
      await db.resetDemo();
      log.info('runner', 'reset_demo done: hosts, guests, policy and agent rows reseeded');
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
    const inc = () => db.incidents().find(i => i.id === incidentId)!;
    log.ok('sentry', `incident #${incidentId} open (${fmtS(marks.between('first_signal', 'incident_open') ?? 0)} after first signal)`);
    await setState(env, 'scribe', 'Recording', 'Logging each step as it lands.', lbl);

    // ---- 3. Triage --------------------------------------------------------
    outcomes.push(await runTriage(env, inc()));
    log.ok('triage', `blast score ${inc().blastScore.toFixed(2)}`);

    // ---- 4. Warden (+ red-team) ------------------------------------------
    const warden = await runWarden(env, inc());
    outcomes.push(warden);
    log.info('warden', `playbook order ${warden.orderOk ? 'followed (reversible first, quarantine last)' : 'DEVIATED from the reversible-first order (gate still enforced policy)'}`);

    const modelBlocked = db.proposals(incidentId).some(p => p.agent === 'warden' && p.status === 'blocked');
    if (modelBlocked) {
      redTeam = 'model-chosen';
      log.ok('policy', 'the MODEL itself proposed an action policy denies; the gate blocked it (no red-team probe needed)');
    } else if (opts.redTeam === 'off') {
      redTeam = 'skipped';
    } else {
      await runRedTeamProbe(env, inc());
      redTeam = 'scripted-probe';
    }

    // ---- 5. human approval -----------------------------------------------
    await setState(env, 'warden', 'Awaiting approval', `quarantine_host ${inc().host} is pending. Waiting for an operator to approve.`, lbl);
    const approved = await awaitApproval(env, inc());
    if (approved) {
      await setState(env, 'warden', 'Quarantining', `Approved. Taking ${inc().host} out of the pool.`, lbl);
      await waitFor(() => db.incidents().find(i => i.id === incidentId)?.status === 'contained', {
        timeoutMs: 15_000, label: 'incident to reach contained',
      }).catch(e => log.error('runner', errMsg(e)));
      if (inc().status === 'contained') {
        marks.markOnce('contained');
        contained = true;
        log.ok('warden', `host ${inc().host} quarantined, incident #${incidentId} contained`);
        await setState(env, 'warden', 'Contained', `Host ${inc().host} quarantined. Escape stopped at the hypervisor boundary.`, lbl);
        await setState(env, 'triage', 'Closed', `Scope closed. Blast score was ${inc().blastScore.toFixed(2)}.`, lbl);
      }
    } else {
      exitCode = 2;
    }

    // ---- 6. Scribe --------------------------------------------------------
    outcomes.push(await runScribe(env, inc()));
    reportFiled = db.reports().some(r => r.incidentId === incidentId);
    await setState(env, 'sentry', 'Watching', `Back on watch. Incident #${incidentId} ${contained ? 'contained' : 'still open'}.`, lbl);
    if (!contained) exitCode = exitCode || 2;
    if (!reportFiled) exitCode = 1;
  } catch (e) {
    exitCode = 1;
    log.error('runner', `run failed: ${errMsg(e)}`);
    if (opts.verbose && e instanceof Error && e.stack) log.error('runner', e.stack);
  }

  const summary: RunSummary = { incidentId, contained, reportFiled, outcomes, redTeam, marks, log, exitCode };
  try {
    printSummary(summary, db);
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
    at === undefined ? null : `  T+${((at - t0) / 1000).toFixed(2).padStart(6)}s  ${text}`;

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
    row(t('report_filed'), 'Scribe filed the incident report'),
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
    const props = db.proposals(s.incidentId);
    console.log('\nContainment proposals (what the policy gate decided)');
    for (const p of props) {
      console.log(`  #${String(p.id).padEnd(3)} ${p.action.padEnd(19)} ${p.target.padEnd(12)} ${p.status.padEnd(17)} policy=${p.policyMode}${p.decidedBy ? `  by ${p.decidedBy}` : ''}`);
    }
    const rep = db.reports().find(r => r.incidentId === s.incidentId);
    if (rep) console.log(`\nReport (${rep.summary.length} chars)\n  ${rep.summary.replace(/\n+/g, '\n  ')}`);
  }
  console.log(`\nResult: ${s.contained ? 'CONTAINED' : 'NOT CONTAINED'}, report ${s.reportFiled ? 'filed' : 'NOT filed'}, exit ${s.exitCode}`);
  void log;
}
