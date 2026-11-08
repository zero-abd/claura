// End-to-end runs of the orchestrator against the in-process contract mirror.
// No Ollama and no SpacetimeDB needed: models are replaced by fakes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_LABEL, defaultOptions, type RunOptions } from '../src/config.ts';
import { runDemo } from '../src/demo.ts';
import { Logger } from '../src/log.ts';
import { MemClauraDb } from '../src/memdb.ts';
import { PLAYBOOK } from '../src/agents/warden.ts';
import { AgentFakeLlm, call, toolMsgs, type FakeTurn } from './helpers.ts';

const opts = (o: Partial<RunOptions> = {}): RunOptions => ({
  ...defaultOptions(), mem: true, paceMs: 0, telemetrySpeed: 0.01, autoApproveAfterS: 0, ...o,
});
const quiet = () => new Logger(false, true);

test('--scripted: full reducer sequence with no model, ends contained with a report', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts({ scripted: true }), { db, log: quiet() });
  assert.equal(s.exitCode, 0);
  assert.ok(s.contained && s.reportFiled);
  assert.ok(s.outcomes.every(o => o.mode === 'scripted'));
  const id = s.incidentId!;
  const props = db.proposals(id);
  assert.deepEqual(
    props.map(p => `${p.action}:${p.status}`),
    [...PLAYBOOK.slice(0, 6).map(p => `${p.action}:executed`), 'quarantine_host:approved', 'reimage_host:blocked'],
  );
  assert.equal(s.redTeam, 'scripted-probe');
  assert.ok(db.proposals(id).find(p => p.action === 'reimage_host')!.reason.includes('RED-TEAM'));
  assert.equal(db.incidents()[0]!.blastScore, 0.87);
  // dashboard-facing state: every agent row carries the honest "no model" label
  assert.ok(db.agentStates().every(a => a.model.startsWith('scripted')));
  for (const m of ['first_signal', 'incident_open', 'pending_approval', 'contained', 'report_filed'] as const) {
    assert.ok(s.marks.get(m) !== undefined, `mark ${m}`);
  }
});

test('red-team probe can be switched off', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts({ scripted: true, redTeam: 'off' }), { db, log: quiet() });
  assert.equal(s.redTeam, 'skipped');
  assert.ok(!db.proposals(s.incidentId!).some(p => p.action === 'reimage_host'));
});

test('no model reachable: every agent uses its deterministic fallback and says so', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts(), { db, llm: null, log: quiet() });
  assert.equal(s.exitCode, 0);
  assert.ok(s.outcomes.every(o => o.mode === 'fallback'));
  assert.ok(db.agentStates().every(a => a.model.startsWith('deterministic fallback')));
});

/** A model that does everything right. */
function goodModel(extra: { wardenExtra?: FakeTurn } = {}) {
  const sentryTurns: FakeTurn[] = [
    { calls: [call('list_recent_signals', { limit: 20 })] },
    { calls: [call('open_incident', { title: 'Suspected guest-to-host escape', severity: 'critical', host: 'b14-gpu-07', vm: 'vm-7f3a' })] },
  ];
  const triageTurns: FakeTurn[] = [
    { calls: [call('get_host_inventory', { host: 'b14-gpu-07' })] },
    { calls: [call('check_reachability', { host: 'b14-gpu-07' })] },
    { calls: [call('record_finding', { kind: 'attack_graph', text: 'vm-7f3a -> hypervisor -> b14-gpu-07 -> BMC 10.0.0.1:623, 11 co-resident guests', blast_score: '0.9' })] },
  ];
  const wardenTurns: FakeTurn[] = [
    ...PLAYBOOK.map(s => ({
      calls: [call('propose_action', {
        action: s.action,
        target: s.on === 'vm' ? 'vm-7f3a' : s.on === 'identity' ? 'agent-7f3' : 'b14-gpu-07',
        reason: 'because evidence says so',
      })],
    })),
    ...(extra.wardenExtra ? [extra.wardenExtra] : []),
  ];
  const scribeTurns: FakeTurn[] = [
    { calls: [call('list_events', {})] },
    { calls: [call('file_report', { summary: 'The incident was detected from six signals. '.repeat(4) })] },
  ];
  const idx = { sentry: 0, triage: 0, warden: 0, scribe: 0 };
  const next = (k: keyof typeof idx, turns: FakeTurn[]): FakeTurn => turns[idx[k]++] ?? { content: 'Done.' };
  return new AgentFakeLlm({
    sentry: () => next('sentry', sentryTurns),
    triage: () => next('triage', triageTurns),
    warden: () => next('warden', wardenTurns),
    scribe: () => next('scribe', scribeTurns),
  });
}

test('model mode with a well-behaved model: every agent completes by itself', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts(), { db, llm: goodModel(), log: quiet() });
  assert.equal(s.exitCode, 0);
  assert.deepEqual(s.outcomes.map(o => o.mode), ['model', 'model', 'model', 'model']);
  assert.equal(s.redTeam, 'scripted-probe'); // the model never tried a denied action
  assert.equal((s.outcomes[2] as { orderOk: boolean }).orderOk, true);
  assert.equal(db.incidents()[0]!.blastScore, 0.9); // "0.9" string was coerced
  assert.ok(db.agentStates().every(a => a.model === MODEL_LABEL), 'dashboard shows the on-prem model label for every agent');
});

test('a denied action chosen by the MODEL is blocked by the gate and no red-team probe runs', async () => {
  const db = new MemClauraDb();
  const llm = goodModel({ wardenExtra: { calls: [call('propose_action', { action: 'reimage_host', target: 'b14-gpu-07', reason: 'wipe it to be safe' })] } });
  const s = await runDemo(opts(), { db, llm, log: quiet() });
  assert.equal(s.redTeam, 'model-chosen');
  const reimage = db.proposals(s.incidentId!).filter(p => p.action === 'reimage_host');
  assert.equal(reimage.length, 1);
  assert.equal(reimage[0]!.status, 'blocked');
  assert.ok(s.contained);
});

test('garbage model output: fallback completes each agent, run still contains the incident', async () => {
  const db = new MemClauraDb();
  const llm = new AgentFakeLlm({
    sentry: () => ({ calls: [call('open_incident', { nonsense: true })] }), // malformed x2 -> fallback
    triage: () => ({ content: 'I am not sure what to do.' }), // never calls a tool
    warden: () => ({ error: 'ollama exploded' }),
    scribe: () => ({ calls: [call('unknown_tool', {})] }),
  });
  const s = await runDemo(opts(), { db, llm, log: quiet() });
  assert.equal(s.exitCode, 0);
  assert.ok(s.contained && s.reportFiled);
  assert.ok(s.outcomes.every(o => o.mode === 'fallback'), JSON.stringify(s.outcomes.map(o => o.mode)));
  assert.equal(db.proposals(s.incidentId!).filter(p => p.status === 'executed').length, 6);
});

test('partial model progress is kept: model does 3 Warden steps then dies, fallback does the rest', async () => {
  const db = new MemClauraDb();
  const good = goodModel();
  let wardenTurns = 0;
  const llm = new AgentFakeLlm({
    sentry: r => (good as any).handlers.sentry(r),
    triage: r => (good as any).handlers.triage(r),
    warden: r => (++wardenTurns <= 3 ? (good as any).handlers.warden(r) : { error: 'gpu fell over', retryable: false }),
    scribe: r => (good as any).handlers.scribe(r),
  });
  const s = await runDemo(opts(), { db, llm, log: quiet() });
  const warden = s.outcomes.find(o => o.agent === 'warden')!;
  assert.equal(warden.mode, 'model+fallback');
  const actions = db.proposals(s.incidentId!).filter(p => p.agent === 'warden' && p.action !== 'reimage_host').map(p => p.action);
  assert.deepEqual(actions, PLAYBOOK.map(p => p.action)); // no duplicates, nothing missing, same order
  assert.ok(s.contained);
});

test('the model hallucinating a host is told so and can correct itself', async () => {
  const db = new MemClauraDb();
  const good = goodModel();
  let n = 0;
  const llm = new AgentFakeLlm({
    sentry: r => {
      n++;
      if (n === 1) return { calls: [call('open_incident', { title: 'Escape on a made-up host', severity: 'critical', host: 'z99-gpu-00', vm: 'vm-7f3a' })] };
      if (n === 2) {
        assert.match(toolMsgs(r).at(-1)!.content, /unknown host/);
        return { calls: [call('open_incident', { title: 'Suspected guest-to-host escape', severity: 'critical', host: 'b14-gpu-07', vm: 'vm-7f3a' })] };
      }
      return { content: 'ok' };
    },
    triage: r => (good as any).handlers.triage(r),
    warden: r => (good as any).handlers.warden(r),
    scribe: r => (good as any).handlers.scribe(r),
  });
  const s = await runDemo(opts(), { db, llm, log: quiet() });
  assert.equal(s.outcomes[0]!.mode, 'model');
  assert.equal(db.incidents().length, 1);
});

test('human approves from the dashboard while the runner waits (no auto-approve)', async () => {
  const db = new MemClauraDb();
  const run = runDemo(opts({ scripted: true, autoApproveAfterS: undefined }), { db, log: quiet() });
  // play the operator: wait for the pending proposal, then call the approve reducer
  for (let i = 0; i < 400; i++) {
    const p = db.proposals().find(x => x.action === 'quarantine_host' && x.status === 'pending_approval');
    if (p) { await new Promise(r => setTimeout(r, 120)); await db.approve(p.id, 'JT'); break; }
    await new Promise(r => setTimeout(r, 10));
  }
  const s = await run;
  assert.equal(s.exitCode, 0);
  assert.equal(db.proposals().find(p => p.action === 'quarantine_host')!.decidedBy, 'JT');
});

test('approval timeout: not contained, exit 2, Scribe still files an honest report', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts({ scripted: true, autoApproveAfterS: undefined, approvalTimeoutS: 0.3 }), { db, log: quiet() });
  assert.equal(s.exitCode, 2);
  assert.equal(s.contained, false);
  assert.ok(s.reportFiled);
  assert.match(db.reports()[0]!.summary, /pending human approval/);
});

test('Warden: a hallucinated target is rejected by the gate, the model is told, fixes it, and the step counts only once executed', async () => {
  const db = new MemClauraDb();
  const good = goodModel();
  let w = 0;
  const llm = new AgentFakeLlm({
    sentry: r => (good as any).handlers.sentry(r),
    triage: r => (good as any).handlers.triage(r),
    warden: r => {
      w++;
      if (w === 1) return { calls: [call('propose_action', { action: 'isolate_network', target: 'vm-7f3a', reason: 'cut the network now' })] };
      if (w === 2) return { calls: [call('propose_action', { action: 'revoke_credentials', target: 'agent-7f3', reason: 'token used out of scope' })] };
      if (w === 3) return { calls: [call('propose_action', { action: 'cordon_host', target: 'b14-gpu-99', reason: 'stop new placements' })] }; // wrong host
      if (w === 4) {
        assert.match(toolMsgs(r).at(-1)!.content, /REJECTED by the gate/);
        return { calls: [call('propose_action', { action: 'cordon_host', target: 'b14-gpu-07', reason: 'stop new placements' })] };
      }
      return (good as any).handlers.warden(r); // the rest of the playbook (duplicates are ignored)
    },
    scribe: r => (good as any).handlers.scribe(r),
  });
  const s = await runDemo(opts(), { db, llm, log: quiet() });
  const cordons = db.proposals(s.incidentId!).filter(p => p.action === 'cordon_host');
  assert.deepEqual(cordons.map(p => p.status), ['blocked', 'executed']);
  assert.ok(s.contained);
  assert.equal(db.hosts().find(h => h.host === 'b14-gpu-07')!.status, 'quarantined');
});

test('Warden fallback re-proposes a step whose only proposal was rejected for a bad target', async () => {
  const db = new MemClauraDb();
  const good = goodModel();
  let w = 0;
  const llm = new AgentFakeLlm({
    sentry: r => (good as any).handlers.sentry(r),
    triage: r => (good as any).handlers.triage(r),
    warden: () => (++w === 1
      ? { calls: [call('propose_action', { action: 'cordon_host', target: 'nowhere-01', reason: 'stop new placements' })] }
      : { error: 'model crashed', retryable: false }),
    scribe: r => (good as any).handlers.scribe(r),
  });
  const s = await runDemo(opts(), { db, llm, log: quiet() });
  const cordons = db.proposals(s.incidentId!).filter(p => p.action === 'cordon_host');
  assert.deepEqual(cordons.map(p => p.status), ['blocked', 'executed']);
  assert.ok(s.contained);
});
