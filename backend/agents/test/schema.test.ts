import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateArgs, type ObjectSchema } from '../src/schema.ts';

const schema: ObjectSchema = {
  type: 'object',
  required: ['kind', 'text', 'score'],
  properties: {
    kind: { type: 'string', enum: ['attack_graph', 'exposure'] },
    text: { type: 'string', minLength: 5, maxLength: 20 },
    score: { type: 'number', minimum: 0, maximum: 1 },
    n: { type: 'integer', minimum: 1, maximum: 5 },
    flag: { type: 'boolean' },
  },
};

test('accepts valid args and strips unknown keys', () => {
  const r = validateArgs(schema, { kind: 'exposure', text: 'hello world', score: 0.5, junk: 1 });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { kind: 'exposure', text: 'hello world', score: 0.5 });
});

test('coerces numeric strings and enum case', () => {
  const r = validateArgs(schema, { kind: 'ATTACK_GRAPH', text: 'hello', score: '0.87', n: '3', flag: 'true' });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { kind: 'attack_graph', text: 'hello', score: 0.87, n: 3, flag: true });
});

test('parses a JSON string of arguments', () => {
  const r = validateArgs(schema, '{"kind":"exposure","text":"hello","score":1}');
  assert.ok(r.ok);
});

test('rejects malformed JSON string, arrays and non-objects', () => {
  assert.equal(validateArgs(schema, '{kind:').ok, false);
  assert.equal(validateArgs(schema, [1, 2]).ok, false);
  assert.equal(validateArgs(schema, 42).ok, false);
});

test('reports every problem in one message', () => {
  const r = validateArgs(schema, { kind: 'nope', text: 'x', score: 7 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /kind/);
    assert.match(r.error, /text/);
    assert.match(r.error, /score/);
  }
});

test('missing required fields are named', () => {
  const r = validateArgs(schema, {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /missing required "kind"/);
});

test('over-long strings are truncated, not rejected', () => {
  const r = validateArgs(schema, { kind: 'exposure', text: 'x'.repeat(50), score: 0 });
  assert.ok(r.ok);
  assert.equal((r.value.text as string).length, 20);
});

test('optional empty args object is fine when nothing is required', () => {
  const r = validateArgs({ type: 'object', properties: {}, required: [] }, undefined);
  assert.ok(r.ok);
});

test('non-integers are rejected for integer fields', () => {
  assert.equal(validateArgs(schema, { kind: 'exposure', text: 'hello', score: 0, n: 2.5 }).ok, false);
});
