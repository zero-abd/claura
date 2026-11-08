// LIVE access-control test of the SpacetimeDB module. Needs a running server with the module published.
//
//   npx tsx test/module.live.ts                     # full suite against LOCAL db "claura" (creates and revokes test operators)
//   npx tsx test/module.live.ts --smoke             # read-only: a stranger sees nothing and changes nothing (safe on Maincloud)
//   TEST_SERVER=maincloud TEST_URI=wss://maincloud.spacetimedb.com TEST_DB=claura npx tsx test/module.live.ts --smoke
//
// Admin actions go through the `spacetime` CLI, which runs as the database OWNER (the "Owner" admin).
// Every other persona is a separate SDK connection with its own fresh identity, enrolled with a one-time
// code. The full suite finishes with reset_demo, so run it on a throwaway database, not the demo one.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DbConnection } from '../src/module_bindings/index.ts';

const SERVER = process.env.TEST_SERVER ?? 'local';
const URI = process.env.TEST_URI ?? 'ws://127.0.0.1:3000';
const DB = process.env.TEST_DB ?? 'claura';
const SMOKE = process.argv.includes('--smoke');
const CLI = process.env.SPACETIME ?? '/Users/abd/.local/bin/spacetime';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const code = (tag: string) => `TEST-${tag}-${randomBytes(10).toString('hex')}`;

// ------------------------------------------------------------------ results
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`); }
}
const group = (t: string) => console.log(`\n== ${t}`);

// ------------------------------------------------------------------ admin via CLI (the Owner)
interface CliResult { ok: boolean; out: string }
function admin(reducer: string, ...args: unknown[]): CliResult {
  try {
    const out = execFileSync(
      CLI, ['call', '--server', SERVER, DB, reducer, ...args.map(a => JSON.stringify(a))],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, out };
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    return { ok: false, out: (err.stderr ?? err.message).toString() };
  }
}
function sql(q: string): string {
  return execFileSync(CLI, ['sql', '--server', SERVER, DB, q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// ------------------------------------------------------------------ personas (SDK connections)
type Row = Record<string, any>;
const VIEWS = [
  'host', 'guestVm', 'signal', 'incident', 'agentState', 'finding', 'policy', 'proposal', 'incidentEvent',
  'report', 'operator', 'enrollment', 'message', 'task', 'decision', 'brief', 'dataAsset', 'stakeholder',
] as const;

class Actor {
  constructor(readonly label: string, readonly conn: DbConnection, readonly hex: string) {}
  rows(table: (typeof VIEWS)[number]): Row[] { return [...(this.conn.db as any)[table].iter()]; }
  total(): number { return VIEWS.reduce((n, v) => n + this.rows(v).length, 0); }
  async call(reducer: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; err: string }> {
    try { await (this.conn.reducers as any)[reducer](args); return { ok: true, err: '' }; }
    catch (e) { return { ok: false, err: e instanceof Error ? e.message : String(e) }; }
  }
  async until(pred: () => boolean, ms = 4000): Promise<boolean> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(40); }
    return pred();
  }
  close() { this.conn.disconnect(); }
}

function connect(label: string): Promise<Actor> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => {
        conn.subscriptionBuilder()
          .onApplied(() => resolve(new Actor(label, conn, identity.toHexString())))
          .onError(() => reject(new Error('subscription error')))
          .subscribeToAllTables();
      })
      .onConnectError((_c, e) => reject(e))
      .build();
  });
}

async function enrolled(label: string, role: string, name: string, hint = ''): Promise<Actor> {
  const a = await connect(label);
  const c = code(role);
  const r = admin('issue_enrollment', c, role, hint);
  if (!r.ok) throw new Error(`issue_enrollment(${role}) failed: ${r.out}`);
  const e = await a.call('enroll', { code: c, name });
  if (!e.ok) throw new Error(`enroll(${role}) failed: ${e.err}`);
  await a.until(() => a.rows('operator').some(o => o.role === role));
  return a;
}

const WRITES: Array<[string, Record<string, unknown>]> = [
  ['postMessage', { incidentId: 0n, channel: '#command', text: 'hello' }],
  ['postAgentMessage', { incidentId: 0n, channel: '#command', agent: 'warden', text: 'hello' }],
  ['addTask', { incidentId: 1n, title: 'x task', ownerRole: 'legal' }],
  ['setTaskStatus', { id: 1n, status: 'done' }],
  ['setBrief', { incidentId: 0n, text: 'x', known: '', unknown: '' }],
  ['setAssetStatus', { id: 1n, status: 'accessed', note: 'x' }],
  ['setIncidentPhase', { incidentId: 1n, phase: 'containment' }],
  ['setIncidentClassification', { incidentId: 1n, category: 'x', functionalImpact: '', informationImpact: '', recoverability: '' }],
  ['recordDecision', { incidentId: 1n, text: 'x' }],
  ['approve', { proposalId: 1n, operator: 'Owner' }],
  ['setPolicy', { action: 'quarantine_host', mode: 'auto' }],
  ['issueEnrollment', { code: 'STRANGER-CODE-0123456789', role: 'admin', nameHint: '' }],
  ['revokeEnrollment', { code: 'STRANGER-CODE-0123456789' }],
  ['addOperator', { identityHex: '00'.repeat(32), name: 'Mallory', role: 'admin' }],
  ['revokeOperator', { identityHex: '00'.repeat(32) }],
  ['setStakeholderVerified', { name: 'Riya Kapoor', verified: false }],
  ['resetDemo', {}],
  ['ingestSignal', { source: 'x', message: 'x', host: 'x', vm: 'x' }],
  ['openIncident', { title: 'x', severity: 'low', host: 'b14-gpu-07', vm: 'vm-7f3a' }],
  ['setAgentState', { agent: 'warden', status: 'x', thought: 'x', model: 'x' }],
  ['recordFinding', { incidentId: 1n, agent: 'triage', kind: 'x', text: 'x', blastScore: 0.5 }],
  ['proposeAction', { incidentId: 1n, agent: 'warden', action: 'quarantine_host', target: 'b14-gpu-07', reason: 'x' }],
  ['fileReport', { incidentId: 1n, summary: 'x' }],
];

// ================================================================== suite
async function main() {
  console.log(`module access-control test: ${SERVER} ${URI} db "${DB}"${SMOKE ? '  [smoke]' : ''}`);
  const keep: Actor[] = [];

  // ---------------------------------------------------------------- stranger
  group('a stranger (never enrolled) sees nothing and changes nothing');
  const stranger = await connect('stranger');
  keep.push(stranger);
  await sleep(500);
  for (const v of VIEWS) check(`stranger reads 0 rows of ${v}`, stranger.rows(v).length === 0, `${stranger.rows(v).length} rows`);
  let rejected = 0;
  const leaks: string[] = [];
  for (const [name, args] of WRITES) {
    const r = await stranger.call(name, args);
    if (!r.ok && /not an enrolled operator/.test(r.err)) rejected++;
    else leaks.push(`${name}: ${r.ok ? 'ACCEPTED' : r.err}`);
  }
  check(`stranger is rejected by all ${WRITES.length} write reducers`, rejected === WRITES.length, leaks.join(' | '));
  const bad = await stranger.call('enroll', { code: 'NOT-A-REAL-CODE-0000', name: 'Mallory' });
  check('enroll with a wrong code is rejected', !bad.ok && /invalid or already used/.test(bad.err), bad.err);
  const tooShort = await stranger.call('enroll', { code: '', name: 'Mallory' });
  check('enroll with an empty code is rejected', !tooShort.ok);
  check('stranger still reads 0 rows after the failed attempts', stranger.total() === 0);
  if (SMOKE) return finish(keep);

  // The rest assumes a freshly seeded database (7 unassigned assets, no incident). Wipes incident data, keeps operators.
  const fresh = admin('reset_demo');
  if (!fresh.ok) throw new Error(`cannot reset the database before the full suite (run it on a throwaway database): ${fresh.out}`);
  // A crashed earlier run may have left its personas active; their names would block this run's. Revoke them first.
  for (const m of sql('SELECT identity, name, active FROM operator').matchAll(/0x([0-9a-f]{64})\s*\|\s*"((?:Test |Added By Hex)[^"]*)"\s*\|\s*true/g)) {
    admin('revoke_operator', m[1]!);
  }

  // ---------------------------------------------------------------- enrollment + single use
  group('enrollment codes are single-use; the admin-chosen name wins');
  const c1 = code('cmdr');
  check('admin issues a commander code', admin('issue_enrollment', c1, 'commander', 'Test Commander').ok);
  const shortCode = admin('issue_enrollment', 'short', 'commander', '');
  check('a short code is refused (needs 80+ bits)', !shortCode.ok && /12 to 64/.test(shortCode.out), shortCode.out.trim().slice(0, 120));
  const badRole = admin('issue_enrollment', code('x'), 'superuser', '');
  check('an unknown role is refused', !badRole.ok && /role must be one of/.test(badRole.out));
  const cmdr = await connect('commander');
  keep.push(cmdr);
  const e1 = await cmdr.call('enroll', { code: c1, name: 'Typed Name' });
  check('commander enrolls with the code', e1.ok, e1.err);
  await cmdr.until(() => cmdr.rows('host').length > 0);
  const me = cmdr.rows('operator').find(o => o.identity.toHexString() === cmdr.hex);
  check('operator name comes from the admin hint, not the typed name', me?.name === 'Test Commander', JSON.stringify(me?.name));
  check('operator role is commander and active', me?.role === 'commander' && me?.active === true);
  check('data flowed live after enrollment (host rows appeared without reconnecting)', cmdr.rows('host').length === 13, `${cmdr.rows('host').length}`);
  const reuse = await stranger.call('enroll', { code: c1, name: 'Mallory' });
  check('the same code cannot be used twice', !reuse.ok && /invalid or already used/.test(reuse.err), reuse.err);
  const again = await cmdr.call('enroll', { code: code('y'), name: 'Whoever' });
  check('an already-enrolled identity cannot enroll again', !again.ok);
  const used = sql('SELECT code, used_by FROM enrollment');
  check('the code shows who used it (admin view)', used.includes('Test Commander'));

  const voided = code('void');
  admin('issue_enrollment', voided, 'responder', 'Void Person');
  check('admin voids an unused code', admin('revoke_enrollment', voided).ok);
  const eVoid = await stranger.call('enroll', { code: voided, name: 'Void Person' });
  check('a voided code cannot be used', !eVoid.ok);

  // ---------------------------------------------------------------- personas
  group('personas see only what their role allows');
  const legal = await enrolled('legal', 'legal', 'Test Legal');
  const exec = await enrolled('exec', 'exec', 'Test Exec');
  const vendor = await enrolled('vendor', 'vendor', 'Test Vendor');
  const resp = await enrolled('responder', 'responder', 'Test Responder');
  const agent = await enrolled('agent', 'agent', 'Test Agent');
  keep.push(legal, exec, vendor, resp, agent);
  await sleep(600);
  const chans = (a: Actor) => [...new Set(a.rows('message').map(m => m.channel))].sort().join(',');
  check('commander reads every channel', chans(cmdr) === '#command,#comms-pr,#exec,#legal,#vendors', chans(cmdr));
  check('vendor reads #vendors only', chans(vendor) === '#vendors', chans(vendor));
  check('exec reads #command and #exec (not #legal)', chans(exec) === '#command,#exec', chans(exec));
  check('legal reads #command, #comms-pr, #legal (not #exec, not #vendors)', chans(legal) === '#command,#comms-pr,#legal', chans(legal));
  check('vendor sees no host, incident, asset, brief, policy, signal, finding rows',
    ['host', 'incident', 'dataAsset', 'brief', 'policy', 'signal', 'finding', 'agentState', 'incidentEvent', 'decision', 'enrollment'].every(v => vendor.rows(v as any).length === 0));
  check('vendor sees the stakeholder roster and only its own operator row', vendor.rows('stakeholder').length === 6 && vendor.rows('operator').length === 1);
  check('legal reads scope (7 assets) but not hosts, signals or policy',
    legal.rows('dataAsset').length === 7 && legal.rows('host').length === 0 && legal.rows('signal').length === 0 && legal.rows('policy').length === 0);
  check('exec cannot read the enrollment codes; only admin can', [cmdr, legal, exec, vendor, resp, agent].every(a => a.rows('enrollment').length === 0));
  check('responder and agent read the technical tables', resp.rows('host').length === 13 && agent.rows('policy').length === 10);
  check('commander sees the roster (6 operators incl. owner) without secrets', cmdr.rows('operator').length >= 7 && cmdr.rows('enrollment').length === 0, `${cmdr.rows('operator').length}`);

  // ---------------------------------------------------------------- role checks on writes
  group('role checks on writes');
  const noAdmin = ['issueEnrollment', 'revokeEnrollment', 'addOperator', 'revokeOperator', 'resetDemo'];
  for (const [who, a] of [['commander', cmdr], ['legal', legal], ['agent', agent]] as Array<[string, Actor]>) {
    let ok = true;
    for (const [name, args] of WRITES.filter(([n]) => noAdmin.includes(n))) {
      const r = await a.call(name, args);
      if (r.ok || !/not allowed/.test(r.err)) { ok = false; console.log(`     ${who} ${name}: ${r.ok ? 'ACCEPTED' : r.err}`); }
    }
    check(`${who} cannot issue codes, add/revoke operators or reset`, ok);
  }
  const cmdrOpen = await cmdr.call('openIncident', { title: 'x', severity: 'low', host: 'b14-gpu-07', vm: 'vm-7f3a' });
  check('a commander cannot open an incident (agents and admins only)', !cmdrOpen.ok && /not allowed/.test(cmdrOpen.err));
  const agentPolicy = await agent.call('setPolicy', { action: 'quarantine_host', mode: 'auto' });
  check('an agent cannot change policy', !agentPolicy.ok && /not allowed/.test(agentPolicy.err));
  const cmdrPolicy = await cmdr.call('setPolicy', { action: 'cordon_host', mode: 'approval' });
  check('a commander can change policy', cmdrPolicy.ok, cmdrPolicy.err);
  await cmdr.call('setPolicy', { action: 'cordon_host', mode: 'auto' });
  const relax = await cmdr.call('setPolicy', { action: 'reimage_host', mode: 'auto' });
  check('a commander alone cannot relax a denied action (reimage_host stays deny)', !relax.ok && /only an admin can relax/.test(relax.err), relax.err);
  const relaxNew = await cmdr.call('setPolicy', { action: 'wipe_everything', mode: 'auto' });
  check('nor allow an action the policy does not know (denied by default)', !relaxNew.ok && /only an admin can relax/.test(relaxNew.err), relaxNew.err);
  check('a commander can tighten: a new action may be set to deny', (await cmdr.call('setPolicy', { action: 'wipe_everything', mode: 'deny' })).ok);
  check('an admin can relax a denied action, and restore it', admin('set_policy', 'reimage_host', 'approval').ok && admin('set_policy', 'reimage_host', 'deny').ok);

  group('channel rules');
  check('vendor cannot post in #command', !(await vendor.call('postMessage', { incidentId: 0n, channel: '#command', text: 'hi' })).ok);
  check('vendor cannot post in #legal', !(await vendor.call('postMessage', { incidentId: 0n, channel: '#legal', text: 'hi' })).ok);
  check('vendor can post in #vendors', (await vendor.call('postMessage', { incidentId: 0n, channel: '#vendors', text: 'vendor here' })).ok);
  check('exec cannot post in #legal', !(await exec.call('postMessage', { incidentId: 0n, channel: '#legal', text: 'hi' })).ok);
  check('legal cannot post in #command (read-only there)', !(await legal.call('postMessage', { incidentId: 0n, channel: '#command', text: 'hi' })).ok);
  check('legal can post in #legal', (await legal.call('postMessage', { incidentId: 0n, channel: '#legal', text: 'privileged note' })).ok);
  check('an unknown channel is refused', !(await cmdr.call('postMessage', { incidentId: 0n, channel: '#general', text: 'hi' })).ok);
  check('a message for a non-existent incident is refused', !(await cmdr.call('postMessage', { incidentId: 99999n, channel: '#command', text: 'hi' })).ok);
  await cmdr.call('postMessage', { incidentId: 0n, channel: '#command', text: 'a‮b\u0007c' });
  await cmdr.until(() => cmdr.rows('message').some(m => m.authorName === 'Test Commander'));
  const posted = cmdr.rows('message').find(m => m.authorName === 'Test Commander');
  check('the author is read from the operator row, control and bidi characters are stripped', posted?.authorRole === 'commander' && posted?.kind === 'human' && posted?.text === 'abc', JSON.stringify(posted?.text));
  await sleep(300);
  check('the vendor does not receive legal or command messages', !vendor.rows('message').some(m => m.channel !== '#vendors'));
  check('legal receives its own channel post but not the vendor one', legal.rows('message').some(m => m.text === 'privileged note') && !legal.rows('message').some(m => m.text === 'vendor here'));

  group('agents speak as agents; humans cannot');
  check('a commander cannot use post_agent_message', !(await cmdr.call('postAgentMessage', { incidentId: 0n, channel: '#command', agent: 'warden', text: 'fake' })).ok);
  check('an agent speaks as warden', (await agent.call('postAgentMessage', { incidentId: 0n, channel: '#command', agent: 'warden', text: 'agent post' })).ok);
  await cmdr.until(() => cmdr.rows('message').some(m => m.text === 'agent post'));
  const ap = cmdr.rows('message').find(m => m.text === 'agent post');
  check('the message shows author warden, role agent, kind agent', ap?.authorName === 'warden' && ap?.authorRole === 'agent' && ap?.kind === 'agent');
  check('an unknown agent name is refused', !(await agent.call('postAgentMessage', { incidentId: 0n, channel: '#command', agent: 'eve', text: 'x' })).ok);
  const nameWarden = admin('issue_enrollment', code('nm'), 'responder', 'Warden');
  const strangerWarden = await connect('warden-impersonator');
  keep.push(strangerWarden);
  const nmCode = code('nm2');
  admin('issue_enrollment', nmCode, 'responder', 'Warden');
  const impersonate = await strangerWarden.call('enroll', { code: nmCode, name: 'x' });
  check('a human cannot take the name of an agent', nameWarden.ok && !impersonate.ok && /reserved/.test(impersonate.err), impersonate.err);
  const dupCode = code('dup');
  admin('issue_enrollment', dupCode, 'responder', 'test commander');
  const dup = await strangerWarden.call('enroll', { code: dupCode, name: 'x' });
  check('a duplicate display name is refused (case-insensitive)', !dup.ok && /already in use/.test(dup.err), dup.err);

  // ---------------------------------------------------------------- incident flow
  group('incident flow through the policy gate with real roles');
  const before = cmdr.rows('incident').length;
  check('agent ingests signals', (await agent.call('ingestSignal', { source: 'vmm', message: 'test ioctl', host: 'b14-gpu-07', vm: 'vm-7f3a' })).ok);
  check('agent opens the incident', (await agent.call('openIncident', { title: 'Test escape on b14-gpu-07', severity: 'critical', host: 'b14-gpu-07', vm: 'vm-7f3a' })).ok);
  await cmdr.until(() => cmdr.rows('incident').length > before);
  const inc = cmdr.rows('incident').sort((a, b) => (a.id < b.id ? -1 : 1)).at(-1)!;
  const id = inc.id as bigint;
  check('incident starts in NIST phase detection_analysis with NIST fields set', inc.nistPhase === 'detection_analysis' && inc.category.startsWith('Unclassified') && inc.functionalImpact === 'Not yet assessed');
  await cmdr.until(() => cmdr.rows('task').length >= 3);
  check('3 placeholder tasks (legal, comms, vendor) exist after the incident opens', cmdr.rows('task').filter(t => t.incidentId === id).length === 3);
  check('2 standing decisions exist after the incident opens', cmdr.rows('decision').filter(d => d.incidentId === id).length === 2);
  check('the 7 scope assets were adopted into the incident', cmdr.rows('dataAsset').filter(a => a.incidentId === id).length === 7);
  check('a first brief exists for the incident', cmdr.rows('brief').some(b => b.incidentId === id));
  await legal.until(() => legal.rows('task').filter(t => t.incidentId === id).length === 3 && vendor.rows('task').length === 1);
  check('the vendor sees only the vendor task, the legal user sees all 3', vendor.rows('task').length === 1 && legal.rows('task').filter(t => t.incidentId === id).length === 3, `vendor ${vendor.rows('task').length}, legal ${legal.rows('task').filter(t => t.incidentId === id).length}`);
  check('the vendor still sees no incident or asset', vendor.rows('incident').length === 0 && vendor.rows('dataAsset').length === 0);

  for (const [a, tg] of [['isolate_network', 'vm-7f3a'], ['revoke_credentials', 'agent-7f3'], ['cordon_host', 'b14-gpu-07'], ['pause_guest', 'vm-7f3a'], ['capture_memory', 'vm-7f3a'], ['failover_guests', 'b14-gpu-07']] as const) {
    const r = await agent.call('proposeAction', { incidentId: id, agent: 'warden', action: a, target: tg, reason: 'test' });
    if (!r.ok) check(`propose ${a}`, false, r.err);
  }
  await agent.call('proposeAction', { incidentId: id, agent: 'warden', action: 'quarantine_host', target: 'b14-gpu-07', reason: 'test' });
  await agent.call('proposeAction', { incidentId: id, agent: 'warden', action: 'reimage_host', target: 'b14-gpu-07', reason: 'test' });
  await cmdr.until(() => cmdr.rows('proposal').filter(p => p.incidentId === id).length === 8);
  const props = cmdr.rows('proposal').filter(p => p.incidentId === id);
  const st = (a: string) => props.find(p => p.action === a)?.status;
  check('reversible actions executed, quarantine pending, reimage blocked',
    st('isolate_network') === 'executed' && st('failover_guests') === 'executed' && st('quarantine_host') === 'pending_approval' && st('reimage_host') === 'blocked');
  const asset = (n: string) => cmdr.rows('dataAsset').find(a => a.incidentId === id && a.name === n);
  check('effects moved the scope board: memory image + weights evidence_preserved', asset('Guest memory image')?.status === 'evidence_preserved' && asset('Tenant model weights')?.status === 'evidence_preserved');
  check('tokens note says revoked, tenant volumes note says failed over', /Revoked/.test(asset('Workload tokens')?.note ?? '') && /failed over/.test(asset('Co-resident tenant volumes')?.note ?? ''));
  check('a commander task "Approve quarantine of b14-gpu-07" is open', cmdr.rows('task').some(t => t.title === 'Approve quarantine of b14-gpu-07' && t.status === 'open'));
  const q = props.find(p => p.action === 'quarantine_host')!;
  for (const [who, a] of [['legal', legal], ['exec', exec], ['vendor', vendor], ['responder', resp], ['agent', agent]] as Array<[string, Actor]>) {
    const r = await a.call('approve', { proposalId: q.id, operator: 'Test Commander' });
    check(`${who} cannot approve (even claiming to be the commander)`, !r.ok, r.err);
  }
  const ok = await cmdr.call('approve', { proposalId: q.id, operator: 'someone else' });
  check('the commander approves', ok.ok, ok.err);
  await cmdr.until(() => cmdr.rows('incident').find(i => i.id === id)?.status === 'contained');
  const p2 = cmdr.rows('proposal').find(p => p.id === q.id)!;
  check('decided_by is the authenticated name, not the argument', p2.decidedBy === 'Test Commander', p2.decidedBy);
  check('a decision "Quarantine b14-gpu-07 approved by Test Commander" was written', cmdr.rows('decision').some(d => d.text === 'Quarantine b14-gpu-07 approved by Test Commander' && d.byName === 'Test Commander'));
  check('the incident is contained and the approval task is done', cmdr.rows('incident').find(i => i.id === id)?.status === 'contained' && cmdr.rows('task').some(t => t.title === 'Approve quarantine of b14-gpu-07' && t.status === 'done'));
  const again2 = await cmdr.call('approve', { proposalId: q.id, operator: 'x' });
  check('approving twice is refused', !again2.ok);

  group('documentation: phase, classification, brief, scope');
  check('agent moves the phase forward', (await agent.call('setIncidentPhase', { incidentId: id, phase: 'containment' })).ok);
  check('agent cannot move the phase backward', !(await agent.call('setIncidentPhase', { incidentId: id, phase: 'detection_analysis' })).ok);
  check('commander can set any phase', (await cmdr.call('setIncidentPhase', { incidentId: id, phase: 'recovery' })).ok);
  check('an invalid phase is refused', !(await cmdr.call('setIncidentPhase', { incidentId: id, phase: 'cleanup' })).ok);
  check('legal cannot set the phase', !(await legal.call('setIncidentPhase', { incidentId: id, phase: 'post_incident' })).ok);
  check('agent sets the NIST classification', (await agent.call('setIncidentClassification', { incidentId: id, category: 'Unauthorized access: guest-to-host escape', functionalImpact: 'Low: all critical services delivered', informationImpact: '', recoverability: 'Supplemented' })).ok);
  await cmdr.until(() => cmdr.rows('incident').find(i => i.id === id)?.recoverability === 'Supplemented');
  const inc2 = cmdr.rows('incident').find(i => i.id === id)!;
  check('classification applied; an empty field kept its value', inc2.category.startsWith('Unauthorized access') && inc2.informationImpact === 'Not yet assessed');
  check('agent writes the brief (author scribe); exec reads it', (await agent.call('setBrief', { incidentId: id, text: 'Plain words.', known: 'a\nb', unknown: 'c' })).ok
    && (await exec.until(() => exec.rows('brief').some(b => b.incidentId === id && b.author === 'scribe' && b.text === 'Plain words.'))));
  check('exec cannot write the brief', !(await exec.call('setBrief', { incidentId: id, text: 'x', known: '', unknown: '' })).ok);
  const billing = asset('Customer billing DB')!;
  check('an agent cannot confirm exfiltration', !(await agent.call('setAssetStatus', { id: billing.id, status: 'exfil_confirmed', note: 'x' })).ok);
  check('an agent can suspect exfiltration', (await agent.call('setAssetStatus', { id: billing.id, status: 'exfil_suspected', note: 'Triage: reads look bulk' })).ok);
  check('legal can confirm exfiltration', (await legal.call('setAssetStatus', { id: billing.id, status: 'exfil_confirmed', note: 'Counsel: 412k records, notification clock starts' })).ok);
  check('exec cannot change scope', !(await exec.call('setAssetStatus', { id: billing.id, status: 'intact', note: 'x' })).ok);
  check('a made-up status is refused', !(await cmdr.call('setAssetStatus', { id: billing.id, status: 'revoked', note: 'x' })).ok);
  await cmdr.until(() => asset('Customer billing DB')?.status === 'exfil_confirmed');
  check('the scope board shows exfil_confirmed with the human note', asset('Customer billing DB')?.status === 'exfil_confirmed' && /notification clock/.test(asset('Customer billing DB')?.note ?? ''));
  const legalTask = cmdr.rows('task').find(t => t.ownerRole === 'legal' && t.incidentId === id)!;
  check('legal moves its own task to doing', (await legal.call('setTaskStatus', { id: legalTask.id, status: 'doing' })).ok);
  check('the vendor cannot touch the legal task', !(await vendor.call('setTaskStatus', { id: legalTask.id, status: 'done' })).ok);
  const vendorTask = cmdr.rows('task').find(t => t.ownerRole === 'vendor' && t.incidentId === id)!;
  check('the vendor moves its own task', (await vendor.call('setTaskStatus', { id: vendorTask.id, status: 'doing' })).ok);
  check('the vendor cannot add tasks', !(await vendor.call('addTask', { incidentId: id, title: 'sneaky', ownerRole: 'admin' })).ok);
  check('the commander adds a task for exec', (await cmdr.call('addTask', { incidentId: id, title: 'Brief the board chair', ownerRole: 'exec' })).ok);
  check('legal records a decision', (await legal.call('recordDecision', { incidentId: id, text: 'Hold the public statement until materiality is decided' })).ok);
  check('a responder cannot record a decision', !(await resp.call('recordDecision', { incidentId: id, text: 'x' })).ok);
  check('the commander marks a stakeholder as not verified', (await cmdr.call('setStakeholderVerified', { name: 'Mateo Silva', verified: false })).ok);
  await cmdr.call('setStakeholderVerified', { name: 'Mateo Silva', verified: true });
  const events = sql(`SELECT actor, text FROM incident_event`);
  check('the audit log names who did what (ACCESS lines, approvals, scope, phase)', /ACCESS: .* enrolled as commander/.test(events) && /approved quarantine_host/.test(events) && /NIST SP 800-61 phase: detection_analysis -> containment/.test(events) && /Scope: Customer billing DB/.test(events));
  check('the audit log never contains an enrollment code', !/TEST-[a-z]+-[0-9a-f]{20}/.test(events));

  // ---------------------------------------------------------------- admin lifecycle
  group('admin adds by identity, revokes live, and cannot lock itself out');
  const s2 = await connect('added-by-hex');
  keep.push(s2);
  check('before: this stranger sees nothing', s2.total() === 0);
  check('admin adds the identity by hex as responder', admin('add_operator', s2.hex, 'Added By Hex', 'responder').ok);
  await s2.until(() => s2.rows('host').length > 0);
  check('it now sees the technical tables, live', s2.rows('host').length === 13 && s2.rows('incident').length >= 1);
  check('and can post to #command', (await s2.call('postMessage', { incidentId: id, channel: '#command', text: 'in via hex' })).ok);
  check('admin revokes it', admin('revoke_operator', s2.hex).ok);
  await s2.until(() => s2.rows('host').length === 0);
  check('after revoke its cache emptied by itself (no data, no operator row)', s2.total() === 0, `${s2.total()} rows`);
  const rv = await s2.call('postMessage', { incidentId: id, channel: '#command', text: 'still here?' });
  check('after revoke every write is refused', !rv.ok && /not an enrolled operator/.test(rv.err), rv.err);
  check('the audit log shows the revoke', sql('SELECT text FROM incident_event').includes('revoked Added By Hex'));
  const back = code('back');
  admin('issue_enrollment', back, 'responder', 'Added By Hex');
  check('a revoked identity can be re-admitted with a fresh code', (await s2.call('enroll', { code: back, name: 'x' })).ok);
  await s2.until(() => s2.rows('host').length > 0);
  check('and sees data again', s2.rows('host').length === 13);
  admin('revoke_operator', s2.hex);

  const ownerHex = sql('SELECT identity FROM operator WHERE role = \'admin\'').match(/0x([0-9a-f]{64})/)?.[1] ?? '';
  const last = admin('revoke_operator', ownerHex);
  check('the last active admin cannot be revoked', !last.ok && /last active admin/.test(last.out), last.out.trim().slice(0, 100));
  const demote = admin('add_operator', ownerHex, 'Owner', 'responder');
  check('the last active admin cannot be demoted', !demote.ok && /last active admin/.test(demote.out));
  const badHex = admin('revoke_operator', 'not-hex');
  check('a malformed identity is refused', !badHex.ok && /64 hex/.test(badHex.out));

  // ---------------------------------------------------------------- reset keeps access control
  group('reset_demo wipes the incident but keeps operators and codes');
  check('admin resets', admin('reset_demo').ok);
  await cmdr.until(() => cmdr.rows('incident').length === 0);
  check('incidents, messages, tasks, decisions are gone', cmdr.rows('incident').length === 0 && cmdr.rows('task').length === 0 && cmdr.rows('decision').length === 0);
  await cmdr.until(() => cmdr.rows('dataAsset').length === 7);
  check('scope inventory is reseeded unassigned (incident 0) at its starting statuses', cmdr.rows('dataAsset').length === 7 && cmdr.rows('dataAsset').every(a => a.incidentId === 0n) && cmdr.rows('dataAsset').find(a => a.name === 'Guest memory image')?.status === 'intact');
  check('the commander is still enrolled and sees the fleet again', cmdr.rows('host').length === 13 && cmdr.rows('operator').some(o => o.identity.toHexString() === cmdr.hex && o.active));
  check('the enrollment history survived the reset', sql('SELECT used_by FROM enrollment').includes('Test Commander'));

  // ---------------------------------------------------------------- tidy
  for (const a of [cmdr, legal, exec, vendor, resp, agent]) admin('revoke_operator', a.hex);
  return finish(keep);
}

function finish(actors: Actor[]) {
  for (const a of actors) { try { a.close(); } catch { /* already closed */ } }
  console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? `\nFAILED:\n  - ${failures.join('\n  - ')}` : ''}`);
  setTimeout(() => process.exit(failures.length ? 1 : 0), 200);
}

main().catch(e => { console.error('test run crashed:', e); process.exit(2); });
