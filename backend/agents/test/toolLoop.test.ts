import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runToolLoop, type Tool } from '../src/toolLoop.ts';
import { ScriptedLlm, call, toolMsgs } from './helpers.ts';

function makeTools() {
  const state = { looked: 0, recorded: [] as Array<Record<string, unknown>> };
  const tools: Tool[] = [
    {
      name: 'lookup',
      description: 'read something',
      parameters: { type: 'object', properties: { host: { type: 'string', minLength: 2 } }, required: ['host'] },
      async run(a) { state.looked++; return { host: a.host, guests: 11 }; },
    },
    {
      name: 'record',
      description: 'write something',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', minLength: 3 }, score: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['text', 'score'],
      },
      async run(a) { state.recorded.push(a); return { ok: true }; },
    },
    {
      name: 'boom',
      description: 'always throws',
      parameters: { type: 'object', properties: {}, required: [] },
      async run() { throw new Error('backend exploded'); },
    },
  ];
  return { state, tools };
}

const base = (tools: Tool[], isDone: () => boolean, extra: object = {}) => ({
  system: 'sys', user: 'go', tools, maxSteps: 6, maxToolCalls: 10, isDone, nudge: 'please finish', ...extra,
});

test('multi-step: tool result is fed back and completion is judged by backend state', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { calls: [call('lookup', { host: 'b14' })] },
    { calls: [call('record', { text: 'attack chain', score: 0.9 })] },
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, true);
  assert.equal(r.reason, 'done');
  assert.equal(r.steps, 2);
  assert.equal(r.calls.length, 2);
  // turn 2 request carries the tool result of turn 1
  const second = llm.requests[1]!;
  assert.equal(toolMsgs(second).length, 1);
  assert.equal(toolMsgs(second)[0]!.tool_name, 'lookup');
  assert.match(toolMsgs(second)[0]!.content, /"guests":11/);
});

test('malformed call gets exactly one retry: bad then good succeeds', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { calls: [call('record', { text: 'x', score: 5 })] }, // invalid
    { calls: [call('record', { text: 'attack chain', score: '0.8' })] }, // fixed (score coerced)
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, true);
  assert.equal(r.malformed, 1);
  assert.equal(state.recorded[0]!.score, 0.8);
  // the model was told what was wrong
  assert.match(toolMsgs(llm.requests[1]!)[0]!.content, /invalid arguments for record/);
});

test('two malformed turns in a row abort the loop (caller falls back)', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { calls: [call('record', { text: 'x', score: 5 })] },
    { calls: [call('record', '{not json')] },
    { calls: [call('record', { text: 'attack chain', score: 0.8 })] }, // never reached
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, false);
  assert.equal(r.reason, 'malformed');
  assert.equal(llm.turnsUsed, 2);
  assert.equal(state.recorded.length, 0);
});

test('unknown tool name is reported back and counts as malformed', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { calls: [call('rm_rf', {})] },
    { calls: [call('record', { text: 'attack chain', score: 0.5 })] },
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, true);
  assert.match(toolMsgs(llm.requests[1]!)[0]!.content, /unknown tool/);
});

test('arguments delivered as a JSON string are parsed', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([{ calls: [call('record', '{"text":"attack chain","score":0.4}')] }]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, true);
  assert.equal(state.recorded[0]!.score, 0.4);
});

test('identical repeated calls are not re-executed; repeated stalling aborts', async () => {
  const { state, tools } = makeTools();
  const same = { calls: [call('lookup', { host: 'b14' })] };
  const llm = new ScriptedLlm([same, same, same, same, same]);
  const r = await runToolLoop({ llm, ...base(tools, () => false, { maxSteps: 8 }) });
  assert.equal(state.looked, 1);
  assert.equal(r.reason, 'stalled');
  assert.equal(r.completed, false);
});

test('a throwing tool becomes an error result the model can react to', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { calls: [call('boom', {})] },
    { calls: [call('record', { text: 'attack chain', score: 0.5 })] },
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, true);
  assert.match(toolMsgs(llm.requests[1]!)[0]!.content, /backend exploded/);
  assert.equal(r.calls[0]!.ok, false);
});

test('prose without a tool call is nudged, then completes', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { content: 'I think we are done.' },
    { calls: [call('record', { text: 'attack chain', score: 0.5 })] },
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r.completed, true);
  assert.equal(llm.requests[1]!.messages.at(-1)!.content, 'please finish');
});

test('model that never calls the tool ends as no_tool_calls after two nudges', async () => {
  const { tools } = makeTools();
  const llm = new ScriptedLlm([{ content: 'a' }, { content: 'b' }, { content: 'c' }, { content: 'd' }]);
  const r = await runToolLoop({ llm, ...base(tools, () => false) });
  assert.equal(r.completed, false);
  assert.equal(r.reason, 'no_tool_calls');
  assert.equal(llm.turnsUsed, 3);
});

test('maxSteps and maxToolCalls are enforced', async () => {
  const { tools } = makeTools();
  const mk = (i: number) => ({ calls: [call('lookup', { host: `host-${i}` })] });
  const llm = new ScriptedLlm(Array.from({ length: 20 }, (_, i) => mk(i)));
  const r1 = await runToolLoop({ llm, ...base(tools, () => false, { maxSteps: 3 }) });
  assert.equal(r1.reason, 'max_steps');
  assert.equal(r1.steps, 3);
  const llm2 = new ScriptedLlm(Array.from({ length: 20 }, (_, i) => mk(i)));
  const r2 = await runToolLoop({ llm: llm2, ...base(tools, () => false, { maxSteps: 10, maxToolCalls: 2 }) });
  assert.equal(r2.reason, 'max_tool_calls');
});

test('transient LLM error is retried once; a second failure ends the loop', async () => {
  const { state, tools } = makeTools();
  const ok = new ScriptedLlm([{ error: 'blip' }, { calls: [call('record', { text: 'attack chain', score: 0.5 })] }]);
  const r1 = await runToolLoop({ llm: ok, ...base(tools, () => state.recorded.length > 0) });
  assert.equal(r1.completed, true);
  const bad = new ScriptedLlm([{ error: 'blip' }, { error: 'blip again' }]);
  const r2 = await runToolLoop({ llm: bad, ...base(tools, () => false) });
  assert.equal(r2.reason, 'llm_error');
  const fatal = new ScriptedLlm([{ error: 'HTTP 400', retryable: false }]);
  const r3 = await runToolLoop({ llm: fatal, ...base(tools, () => false) });
  assert.equal(r3.reason, 'llm_error');
  assert.equal(fatal.turnsUsed, 1);
});

test('allowFinalTurn gives the model one more neutral turn after completion', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([
    { calls: [call('record', { text: 'attack chain', score: 0.5 })] },
    { content: 'All steps proposed.' },
  ]);
  const r = await runToolLoop({ llm, ...base(tools, () => state.recorded.length > 0, { allowFinalTurn: true }) });
  assert.equal(r.completed, true);
  assert.equal(llm.turnsUsed, 2);
  assert.equal(r.finalText, 'All steps proposed.');
  // and the final turn is neutral: no nudge was injected
  assert.ok(!llm.requests[1]!.messages.some(m => m.content === 'please finish'));
});

test('salvageProse accepts report-sized prose instead of regenerating it', async () => {
  const { state, tools } = makeTools();
  const llm = new ScriptedLlm([{ content: 'This is the full attack chain written as chat text.' }]);
  const r = await runToolLoop({
    llm,
    ...base(tools, () => state.recorded.length > 0, {
      salvageProse: async (content: string) => {
        state.recorded.push({ text: content, score: 0.5 });
        return true;
      },
    }),
  });
  assert.equal(r.completed, true);
  assert.equal(r.salvaged, 1);
  assert.equal(llm.turnsUsed, 1);
});

test('agent deadline ends the loop', async () => {
  const { tools } = makeTools();
  const llm = new ScriptedLlm([{ calls: [call('lookup', { host: 'b14' })] }]);
  const r = await runToolLoop({ llm, ...base(tools, () => false, { deadlineMs: -1 }) });
  assert.equal(r.reason, 'deadline');
});
