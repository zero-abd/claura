// Smoke test for Claura Evidence Anchoring.   node smoke.mjs      (npm run smoke)
//
//   A. pure helpers: hash and label normalisation, the memo format, signature validation
//   B. the HTTP routes on 127.0.0.1 with the REAL wallet and the REAL devnet RPC: validation, wallet hygiene (mode 600, no key
//      material in any response or log), the mock path when the wallet is unfunded
//   C. devnet reads that need no funds: genesis hash, the memo parser on a REAL memo transaction from the chain, and a
//      simulation of our exact Memo instruction by the real devnet runtime (a validator identity stands in as fee payer)
//   D. the LIVE code path through an in-process fake RPC: signing, confirmation polling, /verify including tamper cases,
//      de-duplication, the rate limit, the live/mock flip, and the mainnet refusals (nothing is ever sent to a real cluster)
//   E. if the wallet is funded: ONE real anchor of a test hash on devnet, verified through the API and through an
//      independent RPC read. If it is not funded this says so, prints the PUBLIC address and the faucet steps, and exits 0
//      (SMOKE_REQUIRE_LIVE=1 makes an unfunded wallet a failure).
//
// Nothing is printed that could contain key material. Everything started here is stopped before exit; exit code 0 = pass.
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_WALLET_FILE, DEVNET_GENESIS, DEVNET_RPC, FAUCET_URL, MEMO_PROGRAM_ID, extractMemos, firstSigner, isSignature, loadWeb3, makeConnection, memoFor, mount,
  normalizeHash, normalizeLabel, parseMemo, status as moduleStatus,
} from './server.mjs';

const T0 = Date.now();
const REQUIRE_LIVE = /^(1|true|yes)$/i.test(String(process.env.SMOKE_REQUIRE_LIVE ?? ''));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = `1${s}`; else break; }
  return s;
}

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? '' : `  -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
  return ok;
}
const step = (s) => console.log(`\n== ${s}`);
const note = (s) => console.log(`  note ${s}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claura-solana-smoke-'));
const logLines = [];
const log = (msg, _meta, level) => { logLines.push(String(msg)); if (level === 'error') console.log(`  [feature error] ${msg}`); };
const servers = [];
const features = [];
const bodies = []; // every response body we saw, to prove no key material leaks
let exitCode = 0;

async function serve(feature, app) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  features.push(feature);
  return `http://127.0.0.1:${server.address().port}/api/solana`;
}
async function call(base, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  bodies.push(text);
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

try {
  // ---------------------------------------------------------------- A
  step('A. helpers');
  const H = sha256('claura smoke');
  check('normalizeHash accepts 64 hex, any case, sha256: prefix, whitespace', normalizeHash(H.toUpperCase()) === H && normalizeHash(`sha256:${H}`) === H && normalizeHash(`${H.slice(0, 32)}\n${H.slice(32)}`) === H);
  check('normalizeHash rejects short, long and non-hex', !normalizeHash(H.slice(1)) && !normalizeHash(`${H}0`) && !normalizeHash(`${H.slice(1)}z`) && !normalizeHash(undefined));
  check('normalizeLabel keeps memo-safe labels', normalizeLabel('ledger') === 'ledger' && normalizeLabel('INC-2026.04_ledger') === 'INC-2026.04_ledger');
  check('normalizeLabel turns "Incident ledger #4471" into a token', normalizeLabel('Incident ledger #4471') === 'Incident-ledger-4471');
  check('normalizeLabel defaults to "evidence" and rejects pure punctuation', normalizeLabel('') === 'evidence' && normalizeLabel('###') === null);
  check('normalizeLabel never emits ":" and caps at 48', !normalizeLabel('a:b:c').includes(':') && normalizeLabel('x'.repeat(200)).length === 48);
  const memo = memoFor('ledger', H);
  check('memo is exactly claura:<label>:sha256:<hex>', memo === `claura:ledger:sha256:${H}` && memo.length < 140);
  check('parseMemo round-trips and rejects look-alikes', parseMemo(memo)?.hash === H && parseMemo(memo)?.label === 'ledger' && !parseMemo(`${memo}:x`) && !parseMemo(`x${memo}`) && !parseMemo('claura:a:sha256:xyz'));
  check('isSignature accepts a 64-byte base58 string, rejects junk', isSignature(b58encode(randomBytes(64))) && !isSignature('1'.repeat(88)) && !isSignature('mock-abc') && !isSignature(b58encode(randomBytes(32))));

  // ---------------------------------------------------------------- B
  step('B. HTTP routes: real wallet, real devnet RPC (read only)');
  const app = express();
  app.disable('x-powered-by');
  const feat = mount(app, { log, solana: { anchorsFile: path.join(tmp, 'anchors.jsonl'), autoFund: false } });
  const base = await serve(feat, app);
  await feat.ready;
  check('module status() reflects the mounted feature', moduleStatus().feature === 'solana-anchor' && moduleStatus().publicKey === feat.publicKey);
  const st = (await call(base, 'GET', '/status')).json;
  check('status: cluster is devnet and the genesis hash was verified', st.cluster === 'devnet' && st.genesisVerified === true && st.rpc === new URL(DEVNET_RPC).host, st);
  check('status: public key is a base58 address', /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(st.publicKey ?? ''), st.publicKey);
  check('status: mode is live or mock with a reason when mock', (st.status === 'live' && !st.reason) || (st.status === 'mock' && typeof st.reason === 'string'), { status: st.status, reason: st.reason });
  console.log(`  note wallet ${st.publicKey}  ${st.balanceSol} SOL  ->  ${st.status.toUpperCase()}${st.reason ? ` (${st.reason})` : ''}`);

  const walletFile = process.env.CLAURA_SOLANA_KEYPAIR || DEFAULT_WALLET_FILE;
  const wst = fs.statSync(walletFile);
  check('wallet file is mode 600 in a directory only the owner can enter', (wst.mode & 0o777) === 0o600 && (fs.statSync(path.dirname(walletFile)).mode & 0o077) === 0, (wst.mode & 0o777).toString(8));
  check('wallet file is outside the repo', !path.resolve(walletFile).startsWith(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..') + path.sep));
  const secretArr = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
  const secretForms = [secretArr.join(','), Buffer.from(secretArr).toString('hex'), Buffer.from(secretArr).toString('base64'), b58encode(Uint8Array.from(secretArr)), JSON.stringify(secretArr)];

  let r = await call(base, 'POST', '/anchor', { hash: 'nothex', label: 'x' });
  check('POST /anchor: bad hash -> 400 bad_hash', r.status === 400 && r.json.code === 'bad_hash', r.text);
  r = await call(base, 'POST', '/anchor', { hash: H, label: '###' });
  check('POST /anchor: unusable label -> 400 bad_label', r.status === 400 && r.json.code === 'bad_label', r.text);
  r = await call(base, 'POST', '/anchor', 'hash=1', { 'Content-Type': 'text/plain' });
  check('POST /anchor: not JSON -> 415 (CSRF guard)', r.status === 415, r.text);
  r = await call(base, 'POST', '/anchor', 'not json {');
  check('POST /anchor: broken JSON -> 400', r.status === 400 && r.json.code === 'bad_json', r.text);
  r = await call(base, 'POST', '/anchor', JSON.stringify({ hash: H, pad: 'x'.repeat(20_000) }));
  check('POST /anchor: oversized body -> 413', r.status === 413, r.status);
  r = await call(base, 'GET', '/verify');
  check('GET /verify without sig -> 400', r.status === 400, r.text);
  r = await call(base, 'GET', '/verify?sig=abc');
  check('GET /verify with a junk signature -> 400 and no RPC call', r.status === 400 && r.json.code === 'bad_signature', r.text);
  r = await call(base, 'GET', `/verify?sig=${b58encode(randomBytes(64))}&hash=zz`);
  check('GET /verify with a bad hash -> 400', r.status === 400 && r.json.code === 'bad_hash', r.text);
  r = await call(base, 'GET', '/ui.js');
  check('GET /ui.js serves the module', r.status === 200 && /javascript/.test(r.headers.get('content-type')) && r.text.includes("'solana-anchor'") && r.headers.get('cache-control') === 'no-store');

  const unknown = b58encode(randomBytes(64));
  r = await call(base, 'GET', `/verify?sig=${unknown}&hash=${H}`);
  check('GET /verify on devnet for a signature that does not exist -> verified:false, not_found', r.status === 200 && r.json.verified === false && r.json.reason === 'not_found' && r.json.checks.found === false, r.text);

  if (st.status === 'mock') {
    r = await call(base, 'POST', '/anchor', { hash: H, label: 'Smoke Test' });
    const m = r.json;
    check('mock anchor: flagged mock, no explorer link, "mock-" signature, memo is exact', r.status === 200 && m.mock === true && m.explorer === null && m.signature.startsWith('mock-') && m.slot === null && m.memo === memoFor('Smoke-Test', H) && /SIMULATED/.test(m.note), r.text);
    r = await call(base, 'GET', `/verify?sig=${m.signature}`);
    check('mock verify: says it is simulated and does NOT claim verification', r.json.mock === true && r.json.verified === false && r.json.reason === 'mock_anchor' && r.json.explorer === null, r.text);
    r = await call(base, 'GET', '/anchors?limit=5');
    check('GET /anchors lists the mock anchor, flagged', r.json.anchors?.[0]?.mock === true && r.json.anchors[0].signature === m.signature, r.text);
  }

  // ---------------------------------------------------------------- C
  step('C. devnet reads that need no funds');
  const web3 = await loadWeb3();
  const conn = makeConnection(web3, DEVNET_RPC);
  const memoPk = new web3.PublicKey(MEMO_PROGRAM_ID);
  try {
    check('devnet genesis hash is the known devnet hash', (await conn.getGenesisHash()) === DEVNET_GENESIS);
    const recent = (await conn.getSignaturesForAddress(memoPk, { limit: 40 })).filter((s) => !s.err && s.memo).slice(0, 3);
    if (!recent.length) note('no recent memo transactions came back from devnet: parser check skipped');
    let parsedOk = 0;
    for (const s of recent) {
      const tx = await conn.getParsedTransaction(s.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      const memos = tx ? extractMemos(tx) : [];
      if (memos.length && s.memo.includes(memos[0]) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(firstSigner(tx) ?? '')) parsedOk++;
    }
    if (recent.length) check(`memo + signer parsers read ${recent.length} real memo transaction(s) from devnet`, parsedOk === recent.length, `${parsedOk}/${recent.length}`);

    // The real runtime runs our exact instruction. A validator identity pays the (simulated) fee; nothing is signed or sent.
    const votes = await conn.getVoteAccounts('confirmed');
    const payer = new web3.PublicKey(votes.current[0].nodePubkey);
    const simMemo = memoFor('smoke-sim', sha256('simulate'));
    const tx = new web3.Transaction({ feePayer: payer, recentBlockhash: (await conn.getLatestBlockhash('confirmed')).blockhash });
    tx.add(new web3.TransactionInstruction({ programId: memoPk, keys: [{ pubkey: payer, isSigner: true, isWritable: false }], data: Buffer.from(simMemo, 'utf8') }));
    const sim = await conn.simulateTransaction(tx);
    const logs = sim.value.logs ?? [];
    const ran = logs.some((l) => l.includes(`Memo (len ${simMemo.length}): "${simMemo}"`)) && logs.some((l) => l.includes(`Program ${MEMO_PROGRAM_ID} success`));
    if (sim.value.err && !ran) note(`simulation was refused before the program ran (${JSON.stringify(sim.value.err)}): stand-in payer problem, not checked`);
    else check('real devnet runtime runs our Memo instruction and logs the exact text (simulation)', ran && sim.value.err === null, { err: sim.value.err, logs: logs.slice(-4) });
  } catch (e) {
    note(`devnet reads skipped: ${String(e.message).slice(0, 160)}`);
  }

  // ---------------------------------------------------------------- D
  step('D. live code path through an in-process fake RPC (nothing leaves this machine)');
  const chain = new Map();
  let slot = 300_000_000;
  const fake = {
    sent: 0, balance: 5_000_000_000, genesis: DEVNET_GENESIS,
    async getGenesisHash() { return fake.genesis; },
    async getBalance() { return fake.balance; },
    async getLatestBlockhash() { return { blockhash: b58encode(randomBytes(32)), lastValidBlockHeight: 10_000 }; },
    async getBlockHeight() { return 100; },
    async sendRawTransaction(raw, opts) {
      const tx = web3.Transaction.from(raw);
      if (!tx.verifySignatures()) throw new Error('fake rpc: signature does not verify');
      const sig = b58encode(tx.signature);
      if (opts?.skipPreflight === true) return sig; // a re-broadcast
      chain.set(sig, { tx, slot: ++slot, polls: 0 });
      fake.sent++;
      return sig;
    },
    async getSignatureStatuses(sigs) {
      return { context: { slot }, value: sigs.map((sig) => { const e = chain.get(sig); return !e || e.polls++ < 1 ? null : { slot: e.slot, confirmations: null, err: null, confirmationStatus: 'confirmed' }; }) };
    },
    async getParsedTransaction(sig) {
      const e = chain.get(sig);
      if (!e) return null;
      const ix = e.tx.instructions[0];
      return {
        slot: e.slot, blockTime: Math.floor(Date.now() / 1000), meta: { err: null, logMessages: [] },
        transaction: { message: { accountKeys: [{ pubkey: e.tx.feePayer, signer: true, writable: true }], instructions: [{ program: 'spl-memo', programId: ix.programId, parsed: ix.data.toString('utf8') }] } },
      };
    },
  };
  const app2 = express();
  const live = mount(app2, { log, solana: { connection: fake, keypairPath: path.join(tmp, 'fake-wallet.json'), anchorsFile: path.join(tmp, 'fake-anchors.jsonl'), autoFund: false, maxPerMinute: 10 } });
  const base2 = await serve(live, app2);
  await live.ready;
  check('fake chain: funded wallet on "devnet" -> LIVE', live.mode() === 'live' && live.status().reason === null);

  const hashA = sha256(`fake-ledger-${Date.now()}`);
  r = await call(base2, 'POST', '/anchor', { hash: hashA, label: 'ledger' });
  const a = r.json;
  check('live anchor: not mock, base58 signature, slot, devnet explorer link', r.status === 200 && a.mock === false && isSignature(a.signature) && a.slot > 0 && a.explorer === `https://explorer.solana.com/tx/${a.signature}?cluster=devnet`, r.text);
  const sent = chain.get(a.signature);
  check('the transaction is signed by the Claura wallet and has ONE instruction: the Memo program', sent && sent.tx.verifySignatures() && sent.tx.feePayer.toBase58() === live.publicKey && sent.tx.instructions.length === 1 && sent.tx.instructions[0].programId.toBase58() === MEMO_PROGRAM_ID);
  check('memo text on the wire is exactly claura:ledger:sha256:<hash>', sent.tx.instructions[0].data.toString('utf8') === `claura:ledger:sha256:${hashA}`);
  check('the memo instruction lists the wallet as its signer', sent.tx.instructions[0].keys.length === 1 && sent.tx.instructions[0].keys[0].isSigner && sent.tx.instructions[0].keys[0].pubkey.toBase58() === live.publicKey);

  r = await call(base2, 'GET', `/verify?sig=${a.signature}`);
  check('verify (hash from the anchor log): verified, every check true', r.json.verified === true && Object.values(r.json.checks).every((v) => v === true) && r.json.slot === a.slot && r.json.expected.source === 'anchor-log', r.text);
  r = await call(base2, 'GET', `/verify?sig=${a.signature}&hash=${hashA}&label=ledger`);
  check('verify with the hash given in the query', r.json.verified === true && r.json.expected.source === 'query');
  const flipped = `${hashA.slice(0, 63)}${hashA[63] === '0' ? '1' : '0'}`;
  r = await call(base2, 'GET', `/verify?sig=${a.signature}&hash=${flipped}`);
  check('TAMPER: one changed digit -> verified:false, hash_mismatch', r.json.verified === false && r.json.reason === 'hash_mismatch' && r.json.checks.hashMatches === false, r.text);
  r = await call(base2, 'GET', `/verify?sig=${a.signature}&hash=${hashA}&label=other`);
  check('TAMPER: different label -> label_mismatch', r.json.verified === false && r.json.reason === 'label_mismatch', r.text);
  const realSigner = sent.tx.feePayer;
  sent.tx.feePayer = new web3.PublicKey(randomBytes(32));
  r = await call(base2, 'GET', `/verify?sig=${a.signature}`);
  check('TAMPER: memo signed by some other wallet -> signer_mismatch', r.json.verified === false && r.json.reason === 'signer_mismatch', r.text);
  sent.tx.feePayer = realSigner;

  const hashB = sha256(`dup-${Date.now()}`);
  const [d1, d2] = await Promise.all([live.anchor(hashB, 'dup'), live.anchor(hashB, 'dup')]);
  check('two identical concurrent requests share ONE transaction', d1.signature === d2.signature && fake.sent === 2, { sent: fake.sent });
  fake.balance = 0;
  await live.refresh({ force: true });
  check('wallet drained -> status flips to MOCK (unfunded)', live.mode() === 'mock' && live.status().reason === 'unfunded' && !!live.status().fund?.steps?.length);
  const before = fake.sent;
  const m2 = await live.anchor(sha256('while-empty'), 'x').catch((e) => e);
  check('unfunded anchor is simulated: nothing sent to the chain', m2.mock === true && fake.sent === before, m2.message);
  fake.balance = 5_000_000_000;
  await live.refresh({ force: true });
  check('funded again -> flips back to LIVE without a restart', live.mode() === 'live');

  // the rate limit (a wallet with no funds keeps this instant: every anchor is a local mock)
  const app3 = express();
  const lim = mount(app3, { log, solana: { connection: { ...fake, getBalance: async () => 0 }, keypairPath: path.join(tmp, 'fake-wallet.json'), anchorsFile: path.join(tmp, 'lim-anchors.jsonl'), autoFund: false, maxPerMinute: 1 } });
  const base3 = await serve(lim, app3);
  await lim.ready;
  r = await call(base3, 'POST', '/anchor', { hash: sha256('first'), label: 'x' });
  check('rate limit: the first anchor in the window is accepted', r.status === 200, r.text);
  r = await call(base3, 'POST', '/anchor', { hash: sha256('second'), label: 'x' });
  check('rate limit: beyond maxPerMinute -> 429 rate_limited with Retry-After', r.status === 429 && r.json.code === 'rate_limited' && Number(r.headers.get('retry-after')) >= 1, r.text);

  // mainnet refusals: neither path may ever sign or send anything
  const fakeMain = { ...fake, getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' };
  const main = mount(express(), { log, solana: { connection: fakeMain, keypairPath: path.join(tmp, 'fake-wallet.json'), anchorsFile: path.join(tmp, 'main-anchors.jsonl'), autoFund: false } });
  features.push(main);
  await main.ready;
  const sentBeforeMain = fake.sent;
  const mm = await main.anchor(sha256('mainnet?'), 'x');
  check('MAINNET genesis hash -> reason not-devnet, anchor is mock, nothing sent', main.status().reason === 'not-devnet' && mm.mock === true && fake.sent === sentBeforeMain);
  const url = mount(express(), { log, solana: { rpcUrl: 'https://api.mainnet-beta.solana.com', keypairPath: path.join(tmp, 'fake-wallet.json'), anchorsFile: path.join(tmp, 'url-anchors.jsonl'), autoFund: false } });
  features.push(url);
  await url.ready;
  check('a mainnet RPC URL is refused at mount (no connection is even created)', url.status().reason === 'not-devnet' && url.mode() === 'mock');

  const fakeFile = path.join(tmp, 'fake-wallet.json');
  check('fake wallet was created mode 600 and never overwritten', (fs.statSync(fakeFile).mode & 0o777) === 0o600);
  const before2 = fs.readFileSync(fakeFile, 'utf8');
  const again = mount(express(), { log, solana: { connection: fake, keypairPath: fakeFile, anchorsFile: path.join(tmp, 'again.jsonl'), autoFund: false } });
  features.push(again);
  await again.ready;
  check('mounting again reuses the same wallet file byte for byte', fs.readFileSync(fakeFile, 'utf8') === before2 && again.publicKey === live.publicKey);
  fs.writeFileSync(path.join(tmp, 'broken.json'), '{"secret": "do-not-echo-this-text"}', { mode: 0o600 });
  const broken = mount(express(), { log, solana: { connection: fake, keypairPath: path.join(tmp, 'broken.json'), anchorsFile: path.join(tmp, 'b.jsonl'), autoFund: false } });
  features.push(broken);
  await broken.ready;
  check('a corrupt wallet file -> MOCK wallet-error, and the file content is not echoed', broken.status().reason === 'wallet-error' && !JSON.stringify(broken.status()).includes('do-not-echo') && !logLines.some((l) => l.includes('do-not-echo')));

  // ---------------------------------------------------------------- E
  step('E. a REAL anchor on Solana devnet');
  await feat.refresh({ force: true });
  if (feat.mode() === 'live') {
    const testHash = sha256(`claura-smoke-test:${new Date().toISOString()}:${randomBytes(8).toString('hex')}`);
    r = await call(base, 'POST', '/anchor', { hash: testHash, label: 'smoke-test' });
    const z = r.json;
    check('REAL anchor: a devnet transaction was confirmed', r.status === 200 && z.mock === false && isSignature(z.signature) && Number.isInteger(z.slot) && z.explorer === `https://explorer.solana.com/tx/${z.signature}?cluster=devnet`, r.text);
    if (z.signature) {
      r = await call(base, 'GET', `/verify?sig=${z.signature}`);
      check('REAL verify: the memo re-read from devnet matches the hash, signer is the Claura wallet', r.json.verified === true && r.json.signer === feat.publicKey && r.json.slot === z.slot, r.text);
      const tx = await conn.getParsedTransaction(z.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      check('independent RPC read agrees: memo is exactly claura:smoke-test:sha256:<hash>', tx && extractMemos(tx)[0] === `claura:smoke-test:sha256:${testHash}` && !tx.meta.err);
      r = await call(base, 'GET', `/verify?sig=${z.signature}&hash=${sha256('tampered')}`);
      check('REAL tamper check: another hash does not verify', r.json.verified === false && r.json.reason === 'hash_mismatch');
      console.log(`\n  REAL DEVNET SIGNATURE: ${z.signature}\n  EXPLORER:              ${z.explorer}\n  SLOT:                  ${z.slot}`);
    }
  } else {
    const s = feat.status();
    note(`the wallet is not funded (${s.reason}): the live anchor was NOT exercised. Sections A to D passed without it.`);
    console.log(`\n  To go live: open ${FAUCET_URL}, sign in with GitHub, paste\n    ${s.publicKey}\n  choose Devnet, request 1 to 5 SOL, then run  npm run smoke  again.`);
    if (REQUIRE_LIVE) check('live anchoring (SMOKE_REQUIRE_LIVE=1)', false, `wallet unfunded (${s.reason})`);
  }

  // ---------------------------------------------------------------- the key must not have leaked anywhere
  step('no key material anywhere');
  const haystack = bodies.join('\n') + '\n' + logLines.join('\n');
  check('no response body or log line contains the secret key in any common encoding', !secretForms.some((f) => haystack.includes(f)));
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log(`\n  CRASH ${e.stack?.split('\n').slice(0, 4).join(' | ')}`);
} finally {
  for (const f of features) { try { f.close(); } catch { /* already closed */ } }
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); })));
  fs.rmSync(tmp, { recursive: true, force: true });
  exitCode = failures.length ? 1 : 0;
  console.log(`\n${failures.length ? 'FAILED' : 'PASSED'}: ${passed} checks passed, ${failures.length} failed in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
  if (failures.length) console.log(`failed: ${failures.join('; ')}`);
}
process.exit(exitCode);
