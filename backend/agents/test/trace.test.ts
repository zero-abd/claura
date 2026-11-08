// The Agents trace's tool-call rows: which calls are logged, what the rows say, and that no agent ever reads them back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FALLBACK_LABEL, SCRIPTED_LABEL, defaultOptions, type RunOptions } from '../src/config.ts';
import { runDemo } from '../src/demo.ts';
import { Logger } from '../src/log.ts';
import { MemClauraDb } from '../src/memdb.ts';
import { MODEL_LABEL } from '../src/config.ts';
import type { Env } from '../src/agents/common.ts';
import { scribeTools, wardenTools } from '../src/tools.ts';
import { HAS_OWN_ROW, summarizeArgs, summarizeResult } from '../src/trace.ts';

const opts = (o: Partial<RunOptions> = {}): RunOptions => ({
  ...defaultOptions(), mem: true, paceMs: 0, telemetrySpeed: 0.01, autoApproveAfterS: 0, ...o,
});
const quiet = () => new Logger(false, true);
type ToolRow = { agent: string; incidentId: bigint; tool: string; args: string; result: string; model: string };
const toolRows = (db: MemClauraDb): ToolRow[] =>
  (db as unknown as { event: Array<{ kind: string; actor: string; incidentId: bigint; text: string }> }).event
    .filter(e => e.kind === 'tool')
    .map(e => ({ agent: e.actor, incidentId: e.incidentId, ...(JSON.parse(e.text) as Omit<ToolRow, 'agent' | 'incidentId'>) }));

test('--scripted: the read tools and quiet writes are logged, once each, with the scripted label', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts({ scripted: true }), { db, log: quiet() });
  assert.ok(s.contained && s.reportFiled);
  const rows = toolRows(db);
  const names = rows.map(r => `${r.agent}:${r.tool}`);
  for (const want of ['triage:get_host_inventory', 'triage:check_reachability', 'triage:record_scope', 'scribe:post_handoff']) {
    assert.ok(names.includes(want), `a row for ${want} (got ${names.join(', ')})`);
  }
  assert.ok(rows.every(r => r.model === SCRIPTED_LABEL), 'a scripted run says it was scripted on every row');
  assert.ok(rows.every(r => !HAS_OWN_ROW.has(r.tool)), 'calls that write a finding, proposal, report or brief are not logged twice');
  const inv = rows.find(r => r.tool === 'get_host_inventory')!;
  assert.match(inv.args, /^host=b14-gpu-07$/);
  assert.match(inv.result, /host=b14-gpu-07/);
  assert.match(inv.result, /co_resident_count=11/);
  assert.match(inv.result, /co_resident_guests: 11/, 'arrays are counted, not copied');
  assert.equal(inv.incidentId, s.incidentId);
});

test('events() never returns the trace rows: no agent reads its own log back', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts({ scripted: true }), { db, log: quiet() });
  assert.ok(toolRows(db).length >= 6);
  assert.ok(db.events(s.incidentId!).every(e => e.kind !== 'tool'));
});

test('no model reachable: the routine that stood in for the model is named on its rows', async () => {
  const db = new MemClauraDb();
  const s = await runDemo(opts(), { db, llm: null, log: quiet() });
  assert.ok(s.contained);
  const rows = toolRows(db);
  assert.ok(rows.length >= 6);
  assert.ok(rows.every(r => r.model === FALLBACK_LABEL), 'fallback rows say fallback');
});

test('summaries: scalar arguments, counted arrays, one line each', () => {
  assert.equal(summarizeArgs({ host: 'b14-gpu-07', status: 'accessed' }), 'host=b14-gpu-07, status=accessed');
  assert.match(summarizeArgs({ text: 'x'.repeat(300) }), /^text=x{50,}…$/);
  assert.equal(summarizeResult('check_reachability', { host: 'b14-gpu-07', reachable: true, compromised: false }), 'host=b14-gpu-07, reachable=true, compromised=false');
  assert.equal(summarizeResult('get_policy', [{ mode: 'auto' }, { mode: 'auto' }, { mode: 'deny' }]), '3 actions: 2 auto, 1 deny');
  assert.equal(summarizeResult('list_recent_signals', { count: 6, distinct_sources: 6, signals_by_host: { 'b14-gpu-07': 6 } }), '6 signals from 6 sources, b14-gpu-07');
  assert.equal(summarizeResult('list_events', { count: 23, events: new Array(23).fill(0) }), '23 events in the log (23 read)');
  assert.equal(summarizeResult('whatever', null), 'ok');
});

test('a call the model makes is labelled with the model; a failing call is logged as an error and still throws', async () => {
  const db = new MemClauraDb();
  await db.resetDemo(); // seeds the policy table, the hosts and the scope inventory
  await db.openIncident('Suspected guest-to-host escape', 'critical', 'b14-gpu-07', 'vm-7f3a');
  const id = db.incidents()[0]!.id;
  const env = { db, log: quiet(), opts: opts(), llm: null, final: { brief: false } } as unknown as Env;
  const policy = wardenTools(env, id).find(t => t.name === 'get_policy')!;
  await policy.run({}); // no `how`: the tool loop, i.e. the model
  const events = scribeTools(env, id).find(t => t.name === 'list_events')!;
  await events.run({});
  await new Promise(r => setTimeout(r, 20)); // the log call is fire-and-forget
  const rows = toolRows(db);
  assert.deepEqual(rows.map(r => `${r.agent}:${r.tool}`), ['warden:get_policy', 'scribe:list_events']);
  assert.ok(rows.every(r => r.model === MODEL_LABEL));
  assert.match(rows[0]!.result, /^10 actions: 6 auto, 1 approval, 3 deny$/);
  // a tool that throws: the row says error, the error still reaches the loop
  const bad = scribeTools({ ...env, db: { ...db, events: () => { throw new Error('boom'); }, recordToolCall: db.recordToolCall.bind(db) } } as unknown as Env, id).find(t => t.name === 'list_events')!;
  await assert.rejects(() => bad.run({}), /boom/);
  await new Promise(r => setTimeout(r, 20));
  assert.match(toolRows(db).at(-1)!.result, /^error: boom$/);
});
