// War-room pieces of the runner: scope tool rules, brief coercion, interim briefs, NIST classification.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Env } from '../src/agents/common.ts';
import { defaultOptions } from '../src/config.ts';
import { Logger } from '../src/log.ts';
import { MemClauraDb } from '../src/memdb.ts';
import { classification, factsBlock, writeInterimBrief } from '../src/room.ts';
import { callTool, scribeTools, triageTools } from '../src/tools.ts';
import { Marks } from '../src/timeline.ts';

async function fixture() {
  const db = new MemClauraDb();
  await db.resetDemo();
  await db.openIncident('Suspected guest-to-host escape', 'critical', 'b14-gpu-07', 'vm-7f3a');
  const log = new Logger(false, true);
  const env: Env = { db, log, opts: { ...defaultOptions(), mem: true }, marks: new Marks(log), llm: null, final: { brief: false } };
  const inc = db.incidents()[0]!;
  return { db, env, inc };
}

test('record_scope updates the asset and tags the note as Triage', async () => {
  const { db, env, inc } = await fixture();
  const tools = triageTools(env, inc.id);
  const r = (await callTool(tools, 'record_scope', { asset: 'workload tokens', status: 'exfil_suspected', note: 'IAM shows a token used outside its scope.' })) as { recorded: boolean; asset: string };
  assert.equal(r.recorded, true);
  assert.equal(r.asset, 'Workload tokens'); // case-insensitive name match
  const a = db.assets(inc.id).find(x => x.name === 'Workload tokens')!;
  assert.equal(a.status, 'exfil_suspected');
  assert.match(a.note, /^Triage: /);
});

test('an agent cannot confirm exfiltration through the tool (enum), and can only scope the assets it owns', async () => {
  const { env, inc } = await fixture();
  const tools = triageTools(env, inc.id);
  await assert.rejects(
    callTool(tools, 'record_scope', { asset: 'Workload tokens', status: 'exfil_confirmed', note: 'I am sure they were stolen.' }),
    /"status" must be one of intact\|accessed\|exfil_suspected/,
  );
  for (const other of ['Payroll', 'Guest memory image', 'Corporate file share FIN-02', 'Customer billing DB']) {
    await assert.rejects(
      callTool(tools, 'record_scope', { asset: other, status: 'accessed', note: 'Some evidence that is long enough.' }),
      /"asset" must be one of Workload tokens\|Tenant model weights\|Management plane credentials/,
      other,
    );
  }
});

test('record_scope never overwrites what a human already ruled', async () => {
  const { db, env, inc } = await fixture();
  const tokens = db.assets(inc.id).find(a => a.name === 'Workload tokens')!;
  (db as any).asset.get(tokens.id).status = 'exfil_confirmed'; // a human confirmed it (agents cannot)
  const r = (await callTool(triageTools(env, inc.id), 'record_scope', { asset: 'Workload tokens', status: 'intact', note: 'Looks fine to me, honestly.' })) as { recorded: boolean };
  assert.equal(r.recorded, false);
  assert.equal(db.assets(inc.id).find(a => a.name === 'Workload tokens')!.status, 'exfil_confirmed');
});

test('set_brief takes a list where a multi-line string is wanted, one item per line', async () => {
  const { db, env, inc } = await fixture();
  const tools = scribeTools(env, inc.id);
  await callTool(tools, 'set_brief', {
    text: 'A suspected escape from an AI workload was stopped at the edge of its virtual machine. Nothing else is affected.',
    known: ['It started on one server', 'Evidence is captured'],
    unknown: ['Whether any data was read'],
  });
  const b = db.briefs().find(x => x.incidentId === inc.id)!;
  assert.equal(b.known, 'It started on one server\nEvidence is captured');
  assert.equal(b.unknown, 'Whether any data was read');
  assert.equal(env.final.brief, true);
});

test('the interim brief is written from facts and is NOT counted as the final brief', async () => {
  const { db, env, inc } = await fixture();
  await writeInterimBrief(env, inc, 'detect');
  const b = db.briefs().find(x => x.incidentId === inc.id)!;
  assert.match(b.text, /tried to break out/);
  assert.match(b.known, /b14-gpu-07/);
  assert.equal(env.final.brief, false);
  assert.ok(db.agentStates().length === 4, 'agent rows exist from resetDemo');
});

test('NIST classification follows the scope board and the fleet', async () => {
  const { db, env, inc } = await fixture();
  const before = classification(env, inc, 'triage');
  assert.match(before.functionalImpact, /^Medium: Corporate file share FIN-02 locked by ransomware/);
  assert.match(before.informationImpact, /^Accessed, no exfiltration seen: Customer billing DB/);
  await callTool(triageTools(env, inc.id), 'record_scope', { asset: 'Workload tokens', status: 'exfil_suspected', note: 'IAM shows a token used outside its scope.' });
  assert.match(classification(env, inc, 'triage').informationImpact, /Proprietary breach suspected: Workload tokens \(no confirmation yet\)/);
  const a = db.assets(inc.id).find(x => x.name === 'Customer billing DB')!;
  assert.ok(a);
  assert.match(classification(env, inc, 'contained').recoverability, /^Supplemented/);
});

test('the facts block carries scope, tasks and decisions so Scribe cannot invent them', async () => {
  const { env, inc } = await fixture();
  const f = factsBlock(env, inc);
  assert.match(f, /Scope \(data assets\):/);
  assert.match(f, /Customer billing DB \[accessed\]/);
  assert.match(f, /\[open\] Assess notification obligations \(owner legal\)/);
  assert.match(f, /Decisions of record:/);
});

import { claimProblems, plainify, softenClaims } from '../src/room.ts';

test('a text may not reassure when the scope board says data may be touched', async () => {
  const { env, inc } = await fixture();
  const assets = env.db.assets(inc.id); // billing DB is "accessed", FIN-02 is locked
  for (const bad of [
    'The incident is contained and no data has been exfiltrated.',
    'No customer data was accessed.',
    'All data assets are intact.',
    'There is no evidence that any data was read.',
    'Scope: data assets intact, no exfiltration seen.',
    'Nothing was exposed.',
  ]) assert.match(claimProblems(bad, assets) ?? '', /scope board shows/, bad);
  for (const good of [
    'We have not confirmed whether any data was read.',
    'Customer billing DB is under investigation; no exfiltration has been confirmed either way.',
    'The server is out of service and its workloads run elsewhere.',
  ]) assert.equal(claimProblems(good, assets), null, good);
});

test('with nothing touched the same sentence is allowed (the check only contradicts the scope board)', async () => {
  const { env, inc } = await fixture();
  const clean = env.db.assets(inc.id).map(a => ({ ...a, status: 'intact' }));
  assert.equal(claimProblems('No data has been exfiltrated.', clean), null);
});

test('engineer jargon is replaced with plain words in the brief (not rejected: small models resend rejected text)', () => {
  assert.equal(plainify('It escaped through the vGPU and the IOMMU to the BMC.'), 'It escaped through the virtual GPU and the memory protection to the management controller.');
  assert.equal(plainify('A virtual machine tried to reach the server underneath it.'), 'A virtual machine tried to reach the server underneath it.');
});

test('softenClaims replaces a false "nothing was affected" sentence with the careful wording, once', async () => {
  const { env, inc } = await fixture();
  const assets = env.db.assets(inc.id);
  const r = softenClaims('The server is out of service. No data has been exfiltrated. Data assets intact. Customers keep running.', assets);
  assert.equal(r.softened, 2);
  assert.equal(r.text, 'The server is out of service. We have not confirmed whether any data was read. Customers keep running.');
  assert.equal(claimProblems(r.text, assets), null);
  const lines = softenClaims('It started on one server\nNo customer data accessed\nEvidence is captured', assets);
  assert.equal(lines.text, 'It started on one server\nWe have not confirmed whether any data was read.\nEvidence is captured');
  const clean = env.db.assets(inc.id).map(a => ({ ...a, status: 'intact' }));
  assert.deepEqual(softenClaims('No data has been exfiltrated.', clean), { text: 'No data has been exfiltrated.', softened: 0 });
});

test('set_brief / file_report / post_handoff rewrite a false reassurance (and say so) instead of publishing it', async () => {
  const { db, env, inc } = await fixture();
  const tools = scribeTools(env, inc.id);
  const claim = 'The incident is contained and no data has been exfiltrated. Customers are not affected at all by this event.';
  const r1 = (await callTool(tools, 'set_brief', { text: claim, known: 'a fact that is fine here', unknown: 'one open question' })) as { published: boolean; note?: string };
  assert.equal(r1.published, true);
  assert.match(r1.note ?? '', /^GUARD: 1 sentence/);
  const b = db.briefs().find(x => x.incidentId === inc.id)!;
  assert.match(b.text, /We have not confirmed whether any data was read\./);
  assert.doesNotMatch(b.text, /no data has been exfiltrated/i);
  assert.equal(env.final.brief, true);

  await callTool(tools, 'file_report', { summary: `${claim} ${claim}` });
  assert.doesNotMatch(db.reports()[0]!.summary, /no data has been exfiltrated/i);
  await callTool(tools, 'post_handoff', { text: `Scope: data assets intact, no exfiltration seen. ${claim} The first task for the next shift is the legal assessment.` });
  const h = db.messages(inc.id).find(m => m.text.startsWith('SHIFT HANDOFF'))!;
  assert.doesNotMatch(h.text, /intact|no exfiltration|no data has been/i);
  assert.match(h.text, /first task for the next shift/);

  // jargon is rewritten, not refused
  await callTool(tools, 'set_brief', { text: 'It escaped via the IOMMU and the vGPU and then the server was fenced off completely. We have not confirmed whether any data was read.', known: 'a fact that is fine here', unknown: 'one open question' });
  assert.match(db.briefs().find(x => x.incidentId === inc.id)!.text, /memory protection and the virtual GPU/);
});
