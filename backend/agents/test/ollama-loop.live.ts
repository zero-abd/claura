// LIVE test of the Ollama tool loop against the real local model
// (nemotron-3-nano:4b) with STUB tools. Needs Ollama running; touches nothing else.
//
//   npm run test:loop
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MODEL } from '../src/config.ts';
import { OllamaClient, preflight } from '../src/ollama.ts';
import { runToolLoop, type LoopResult, type Tool } from '../src/toolLoop.ts';

const llm = new OllamaClient();
const report: string[] = [];
const note = (name: string, r: LoopResult) =>
  report.push(
    `${name.padEnd(34)} turns=${r.steps} calls=${r.calls.length} malformed=${r.malformed} model=${(r.llmMs / 1000).toFixed(1)}s tokens=${r.evalTokens} -> ${r.reason}`,
  );

const obj = (properties: Tool['parameters']['properties'], required: string[]): Tool['parameters'] => ({ type: 'object', properties, required });

before(async () => {
  const pf = await preflight(llm);
  if (!pf.ok) throw new Error(`Ollama/model not ready: ${pf.reason}. Start Ollama and make sure ${MODEL} is installed.`);
});
after(() => {
  console.log('\nLive loop summary\n' + report.map(l => '  ' + l).join('\n'));
});

describe('Nemotron drives a multi-step tool loop (stub tools)', () => {
  it('Triage-style: inventory -> reachability -> record_finding with a bounded score', async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const order: string[] = [];
    const tools: Tool[] = [
      {
        name: 'get_host_inventory', description: "Get a host's guest VMs.",
        parameters: obj({ host: { type: 'string', description: 'host name' } }, ['host']),
        async run(a) { order.push('inventory'); return { host: a.host, guest_count: 12, co_resident_count: 11, suspect_vm: 'vm-7f3a' }; },
      },
      {
        name: 'check_reachability', description: 'Is the management plane reachable from a host?',
        parameters: obj({ host: { type: 'string', description: 'host name' } }, ['host']),
        async run(a) { order.push('reachability'); return { host: a.host, mgmt_plane: 'BMC 10.0.0.1:623', reachable: true, compromised: false }; },
      },
      {
        name: 'record_finding', description: 'Record the attack-graph finding with a blast score 0..1.',
        parameters: obj({
          kind: { type: 'string', enum: ['attack_graph', 'blast_radius', 'exposure'] },
          text: { type: 'string', minLength: 40, maxLength: 1200 },
          blast_score: { type: 'number', minimum: 0, maximum: 1 },
        }, ['kind', 'text', 'blast_score']),
        async run(a) { order.push('record'); recorded.push(a); return { recorded: true }; },
      },
    ];
    const r = await runToolLoop({
      llm,
      system:
        'You are Triage, a blast-radius agent. Work in this order: 1) call get_host_inventory for the suspect host, 2) call check_reachability for the same host, 3) call record_finding ONCE with kind "attack_graph", the attack path as text using arrows, and a blast_score between 0 and 1. Use only facts from tool results. After record_finding succeeds, reply with one short sentence.',
      user: 'Incident #1 (critical): suspected guest-to-host escape. Suspect host: b14-gpu-07. Suspect VM: vm-7f3a.',
      tools, maxSteps: 6, maxToolCalls: 8, isDone: () => recorded.length > 0, nudge: 'Call record_finding now.',
    });
    note('triage stub loop', r);
    assert.equal(r.completed, true, `${r.reason}: ${r.detail}`);
    assert.deepEqual(order.slice(0, 3), ['inventory', 'reachability', 'record'], 'tools called in a sensible order');
    const f = recorded[0]!;
    assert.equal(f.kind, 'attack_graph');
    assert.ok((f.blast_score as number) >= 0 && (f.blast_score as number) <= 1);
    assert.match(String(f.text), /b14-gpu-07|vm-7f3a/);
    assert.ok(r.steps >= 3, 'multi-step (the model needed >= 3 turns)');
  });

  it('Sentry-style: reads signals, then opens the incident with the host/vm it saw', async () => {
    const opened: Array<Record<string, unknown>> = [];
    const signals = [
      { source: 'vmm', message: 'VMM audit: unexpected ioctl 0xC0186441', host: 'b14-gpu-07', vm: 'vm-7f3a' },
      { source: 'vgpu', message: 'vGPU mdev driver fault (vm-7f3a)', host: 'b14-gpu-07', vm: 'vm-7f3a' },
      { source: 'iommu', message: 'IOMMU fault: DMA write outside guest range', host: 'b14-gpu-07', vm: 'vm-7f3a' },
      { source: 'edr', message: 'host EDR: qemu spawned /bin/sh', host: 'b14-gpu-07', vm: 'vm-7f3a' },
    ];
    const tools: Tool[] = [
      {
        name: 'list_recent_signals', description: 'List recent telemetry signals.',
        parameters: obj({ limit: { type: 'integer', minimum: 1, maximum: 50 } }, []),
        async run() { return { count: signals.length, signals }; },
      },
      {
        name: 'open_incident', description: 'Open a security incident.',
        parameters: obj({
          title: { type: 'string', minLength: 8 }, severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          host: { type: 'string' }, vm: { type: 'string' },
        }, ['title', 'severity', 'host', 'vm']),
        async run(a) { opened.push(a); return { incident_id: '1', status: 'open' }; },
      },
    ];
    const r = await runToolLoop({
      llm,
      system:
        'You are Sentry, a detection agent. 1) Call list_recent_signals. 2) If several independent sources point at the same host and VM, call open_incident ONCE with a short title, severity "critical", and the host and vm exactly as in the signals. After it succeeds, reply with one short sentence.',
      user: 'A burst of telemetry just arrived. Investigate and act.',
      tools, maxSteps: 5, maxToolCalls: 6, isDone: () => opened.length > 0, nudge: 'Call open_incident now.',
    });
    note('sentry stub loop', r);
    assert.equal(r.completed, true, `${r.reason}: ${r.detail}`);
    assert.equal(opened[0]!.host, 'b14-gpu-07');
    assert.equal(opened[0]!.vm, 'vm-7f3a');
    assert.equal(opened[0]!.severity, 'critical');
  });

  it('guardrail: an invalid argument is bounced back and the model corrects it (retry once)', async () => {
    // The tool only accepts blast_score <= 0.5, but the prompt pushes the model towards ~0.9.
    // Validation must reject the first call and the model must retry within the bound.
    const recorded: Array<Record<string, unknown>> = [];
    const tools: Tool[] = [
      {
        name: 'record_finding', description: 'Record a finding. blast_score must be a number from 0 to 0.5.',
        parameters: obj({
          text: { type: 'string', minLength: 10 },
          blast_score: { type: 'number', minimum: 0, maximum: 0.5, description: 'score from 0 to 0.5' },
        }, ['text', 'blast_score']),
        async run(a) { recorded.push(a); return { recorded: true }; },
      },
    ];
    const r = await runToolLoop({
      llm,
      system: 'You are Triage. Call record_finding once. The host has 11 co-resident guests and a reachable management plane, which is very serious: use a blast_score of 0.9. If a tool call is rejected, read the error and fix the arguments.',
      user: 'Record the finding for host b14-gpu-07 now.',
      tools, maxSteps: 5, maxToolCalls: 5, isDone: () => recorded.length > 0, nudge: 'Call record_finding now.',
    });
    note('guardrail: validation + retry', r);
    assert.ok(r.malformed >= 1, 'the out-of-range score was rejected by validation');
    assert.equal(r.completed, true, `${r.reason}: ${r.detail}`);
    assert.ok((recorded[0]!.blast_score as number) <= 0.5);
  });

  it('Warden-style: 7 sequential proposals in order, then an 8th that the stub gate BLOCKS (not retried)', async () => {
    const asked: string[] = [];
    const modes: Record<string, string> = { isolate_network: 'auto', revoke_credentials: 'auto', cordon_host: 'auto', pause_guest: 'auto', capture_memory: 'auto', failover_guests: 'auto', quarantine_host: 'approval', reimage_host: 'deny' };
    const tools: Tool[] = [
      {
        name: 'propose_action', description: 'Propose a containment action. A policy gate decides.',
        parameters: obj({ action: { type: 'string' }, target: { type: 'string' }, reason: { type: 'string', minLength: 5 } }, ['action', 'target', 'reason']),
        async run(a) {
          const action = String(a.action);
          asked.push(action);
          const mode = modes[action] ?? 'deny';
          return { action, status: mode === 'auto' ? 'executed' : mode === 'approval' ? 'pending_approval' : 'blocked', note: mode === 'deny' ? 'BLOCKED by policy. Do not retry.' : 'ok' };
        },
      },
    ];
    const steps = ['isolate_network', 'revoke_credentials', 'cordon_host', 'pause_guest', 'capture_memory', 'failover_guests', 'quarantine_host'];
    const all = [...steps, 'reimage_host'];
    const r = await runToolLoop({
      llm,
      system:
        'You are Warden. Propose these containment actions in this order, ONE propose_action call per step: 1. isolate_network (vm-7f3a) 2. revoke_credentials (agent-7f3) 3. cordon_host (b14-gpu-07) 4. pause_guest (vm-7f3a) 5. capture_memory (vm-7f3a) 6. failover_guests (b14-gpu-07) 7. quarantine_host (b14-gpu-07) 8. reimage_host (b14-gpu-07; the gate is expected to BLOCK this one). Reasons: at most 15 words. If a result says BLOCKED, do not retry it. When done, reply with one short sentence.',
      user: 'Incident #1: guest-to-host escape from vm-7f3a on b14-gpu-07. Contain it.',
      tools, maxSteps: 12, maxToolCalls: 12, isDone: () => all.every(s => asked.includes(s)), nudge: 'Propose the next step that has not been proposed.',
    });
    note('warden stub loop (8 steps)', r);
    assert.equal(r.completed, true, `${r.reason}: ${r.detail}`);
    assert.deepEqual(asked.slice(0, 8), all, 'reversible first, quarantine, then the blocked one');
    assert.equal(new Set(asked).size, asked.length, 'a BLOCKED action was not proposed twice');
    const blocked = r.calls.find(c => c.tool === 'propose_action' && (c.result as { status?: string } | undefined)?.status === 'blocked');
    assert.ok(blocked, 'the stub gate blocked reimage_host and the loop carried on');
  });
});
