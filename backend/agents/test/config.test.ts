// Configuration, env-file loading and token persistence (no network, no secrets: all values are fakes).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadClauraEnv, parseArgs } from '../src/config.ts';
import { forgetToken, readToken, tokenKey, writeToken } from '../src/tokens.ts';

const withTmp = (fn: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), 'claura-cfg-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const clean = () => {
  for (const k of Object.keys(process.env)) if (k.startsWith('CLAURA_')) delete process.env[k];
};

test('loadClauraEnv takes only CLAURA_ keys, never overrides, and returns names not values', () => {
  clean();
  withTmp(dir => {
    const f = join(dir, 'x.env');
    writeFileSync(f, ['ELEVENLABS_API_KEY=should-not-be-read', 'CLAURA_STDB_DB="mydb"', 'export CLAURA_AGENT_CODE=abc123', 'CLAURA_ALREADY=file'].join('\n'));
    process.env.CLAURA_ALREADY = 'shell';
    const set = loadClauraEnv(f);
    assert.deepEqual(set.sort(), ['CLAURA_AGENT_CODE', 'CLAURA_STDB_DB']);
    assert.equal(process.env.CLAURA_STDB_DB, 'mydb');
    assert.equal(process.env.CLAURA_ALREADY, 'shell');
    assert.equal(process.env.ELEVENLABS_API_KEY, undefined);
  });
  clean();
});

test('a missing env file is not an error', () => {
  assert.deepEqual(loadClauraEnv('/nonexistent/claura.env'), []);
});

test('--local is authoritative: shell settings for another server do not leak into it', () => {
  clean();
  process.env.CLAURA_STDB_URI = 'wss://maincloud.example';
  process.env.CLAURA_STDB_DB = 'prod-db';
  process.env.CLAURA_AGENT_CODE = 'maincloud-code';
  withTmp(dir => {
    const f = join(dir, 'local.env');
    writeFileSync(f, 'CLAURA_STDB_URI=ws://127.0.0.1:3000\nCLAURA_STDB_DB=claura\n');
    const o = parseArgs(['--local', '--env-file', f]);
    assert.equal(o.uri, 'ws://127.0.0.1:3000');
    assert.equal(o.db, 'claura');
    assert.equal(process.env.CLAURA_AGENT_CODE, undefined, 'the Maincloud code must not be tried on the local appliance');
  });
  clean();
});

test('flags: --reset, --uri/--db override, --no-reset accepted, unknown rejected', () => {
  clean();
  const o = parseArgs(['--env-file', '/nonexistent', '--uri', 'wss://x.example', '--db', 'd', '--reset', '--no-reset', '--auto-approve-after', '3']);
  assert.equal(o.uri, 'wss://x.example');
  assert.equal(o.db, 'd');
  assert.equal(o.reset, false);
  assert.equal(o.autoApproveAfterS, 3);
  assert.throws(() => parseArgs(['--env-file', '/nonexistent', '--bogus']), /unknown argument/);
  clean();
});

test('tokens: one 0600 file, keyed per server/db/slot, rewritable and forgettable', () => {
  withTmp(dir => {
    const f = join(dir, 'sub', 'agent-token');
    const k1 = tokenKey('wss://a', 'claura', 'agent');
    const k2 = tokenKey('ws://127.0.0.1:3000', 'claura', 'agent');
    writeToken(f, k1, 'tok-a');
    writeToken(f, k2, 'tok-b');
    assert.equal(readToken(f, k1), 'tok-a');
    assert.equal(readToken(f, k2), 'tok-b');
    assert.equal(statSync(f).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, 'sub')).mode & 0o777, 0o700);
    writeToken(f, k1, 'tok-a2');
    assert.equal(readToken(f, k1), 'tok-a2');
    forgetToken(f, k1);
    assert.equal(readToken(f, k1), undefined);
    assert.equal(readToken(f, k2), 'tok-b');
    assert.ok(!readFileSync(f, 'utf8').includes('tok-a'));
  });
});
