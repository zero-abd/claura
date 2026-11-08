// Executable spec of the policy gate semantics the runner relies on (mirror of the contract).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemClauraDb } from '../src/memdb.ts';

async function setup() {
  const db = new MemClauraDb();
  await db.resetDemo();
  await db.openIncident('escape', 'critical', 'b14-gpu-07', 'vm-7f3a');
  return { db, id: db.incidents()[0]!.id };
}

test('reset_demo seeds hosts, 12 guests on b14-gpu-07, hall C targets, agents and policy', async () => {
  const db = new MemClauraDb();
  await db.resetDemo();
  assert.equal(db.guests().filter(g => g.host === 'b14-gpu-07').length, 12);
  assert.ok(db.hosts().some(h => h.host === 'b14-gpu-07' && h.hall === 'B' && h.rack === '14'));
  assert.deepEqual(db.hosts().filter(h => h.hall === 'C').map(h => h.host).sort(), ['c05-gpu-02', 'c12-gpu-04']);
  assert.equal(db.agentStates().length, 4);
  const mode = (a: string) => db.policies().find(p => p.action === a)?.mode;
  assert.equal(mode('isolate_network'), 'auto');
  assert.equal(mode('quarantine_host'), 'approval');
  assert.equal(mode('reimage_host'), 'deny');
});

test('open_incident marks the host suspect', async () => {
  const { db } = await setup();
  assert.equal(db.hosts().find(h => h.host === 'b14-gpu-07')!.status, 'suspect');
});

test('auto actions execute and apply their effect', async () => {
  const { db, id } = await setup();
  await db.proposeAction(id, 'warden', 'cordon_host', 'b14-gpu-07', 'r');
  await db.proposeAction(id, 'warden', 'pause_guest', 'vm-7f3a', 'r');
  await db.proposeAction(id, 'warden', 'failover_guests', 'b14-gpu-07', 'r');
  assert.equal(db.hosts().find(h => h.host === 'b14-gpu-07')!.status, 'cordoned');
  assert.equal(db.guests().find(g => g.vm === 'vm-7f3a')!.status, 'paused');
  const moved = db.guests().filter(g => g.status === 'failed_over');
  assert.equal(moved.length, 11);
  assert.ok(moved.every(g => g.movedTo.startsWith('c')));
  assert.ok(db.proposals(id).every(p => p.status === 'executed'));
});

test('deny and unknown actions are blocked; incident stays open', async () => {
  const { db, id } = await setup();
  await db.proposeAction(id, 'warden', 'reimage_host', 'b14-gpu-07', 'r');
  await db.proposeAction(id, 'warden', 'format_universe', 'everything', 'r');
  const [a, b] = db.proposals(id);
  assert.equal(a!.status, 'blocked');
  assert.equal(b!.status, 'blocked');
  assert.equal(b!.policyMode, 'deny');
  assert.equal(db.incidents()[0]!.status, 'open');
  assert.equal(db.events(id).filter(e => e.kind === 'blocked').length, 2);
});

test('quarantine needs approval; approve contains the incident exactly once', async () => {
  const { db, id } = await setup();
  await db.proposeAction(id, 'warden', 'quarantine_host', 'b14-gpu-07', 'r');
  const p = db.proposals(id)[0]!;
  assert.equal(p.status, 'pending_approval');
  assert.equal(db.incidents()[0]!.status, 'awaiting_approval');
  await db.approve(p.id, 'RK');
  assert.equal(db.proposals(id)[0]!.status, 'approved');
  assert.equal(db.proposals(id)[0]!.decidedBy, 'RK');
  assert.equal(db.hosts().find(h => h.host === 'b14-gpu-07')!.status, 'quarantined');
  const inc = db.incidents()[0]!;
  assert.equal(inc.status, 'contained');
  assert.ok(inc.containedAtMs && inc.containedAtMs >= inc.openedAtMs);
  await assert.rejects(() => db.approve(p.id, 'RK')); // only pending proposals can be approved
});

test('cannot approve an executed or blocked proposal', async () => {
  const { db, id } = await setup();
  await db.proposeAction(id, 'warden', 'cordon_host', 'b14-gpu-07', 'r');
  await db.proposeAction(id, 'warden', 'reimage_host', 'b14-gpu-07', 'r');
  for (const p of db.proposals(id)) await assert.rejects(() => db.approve(p.id, 'RK'));
});

test('set_policy changes the gate', async () => {
  const { db, id } = await setup();
  await db.setPolicy('reimage_host', 'approval');
  await db.proposeAction(id, 'warden', 'reimage_host', 'b14-gpu-07', 'r');
  assert.equal(db.proposals(id)[0]!.status, 'pending_approval');
  await assert.rejects(() => db.setPolicy('x', 'sometimes'));
});

test('record_finding: negative score leaves blast_score unchanged', async () => {
  const { db, id } = await setup();
  await db.recordFinding(id, 'triage', 'attack_graph', 'chain', 0.87);
  await db.recordFinding(id, 'triage', 'exposure', 'more', -1);
  assert.equal(db.incidents()[0]!.blastScore, 0.87);
  assert.equal(db.findings(id).length, 2);
});

test('events include pre-incident signals (incident_id 0)', async () => {
  const db = new MemClauraDb();
  await db.resetDemo();
  await db.ingestSignal('vmm', 'ioctl', 'b14-gpu-07', 'vm-7f3a');
  await db.openIncident('escape', 'critical', 'b14-gpu-07', 'vm-7f3a');
  await db.ingestSignal('iam', 'token', 'b14-gpu-07', 'vm-7f3a');
  const id = db.incidents()[0]!.id;
  assert.deepEqual(db.events(id).map(e => e.kind), ['signal', 'incident', 'signal']);
});

test('proposing against an unknown incident is rejected', async () => {
  const { db } = await setup();
  await assert.rejects(() => db.proposeAction(999n, 'warden', 'cordon_host', 'x', 'r'));
});

test('hallucinated host/vm targets are rejected by the gate (blocked while policy mode stays auto)', async () => {
  const { db, id } = await setup();
  await db.proposeAction(id, 'warden', 'cordon_host', 'b99-gpu-99', 'r');
  await db.proposeAction(id, 'warden', 'pause_guest', 'vm-nope', 'r');
  await db.proposeAction(id, 'warden', 'revoke_credentials', 'agent-7f3', 'r'); // event-only actions take free text
  const [a, b, c] = db.proposals(id);
  assert.equal(a!.status, 'blocked');
  assert.equal(a!.policyMode, 'auto'); // not a policy deny: the target was bad
  assert.equal(b!.status, 'blocked');
  assert.equal(c!.status, 'executed');
  assert.equal(db.hosts().find(h => h.host === 'b14-gpu-07')!.status, 'suspect'); // nothing was cordoned
});

test('action names are normalised like the module does (trim + lower-case)', async () => {
  const { db, id } = await setup();
  await db.proposeAction(id, 'warden', '  Cordon_Host ', 'b14-gpu-07', 'r');
  assert.equal(db.proposals(id)[0]!.action, 'cordon_host');
  assert.equal(db.proposals(id)[0]!.status, 'executed');
});
