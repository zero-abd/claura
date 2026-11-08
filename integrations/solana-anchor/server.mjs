// Claura Evidence Anchoring: server side.   SOLANA DEVNET ONLY.
//
//   import { mount, status } from './server.mjs';
//   const anchor = mount(app, { env, log, ledger, solana: { /* options below */ } });
//   await anchor.ready;                      // wallet loaded, cluster proven to be devnet, balance read
//   await anchor.anchor(sha256hex, 'ledger') // what POST /api/solana/anchor does
//   anchor.close();
//
// Tamper evidence: the SHA-256 of the incident ledger (or an evidence manifest) is written to Solana devnet as a
// Memo-program transaction whose text is exactly  claura:<label>:sha256:<64 hex>  and which is signed by the Claura
// devnet wallet. Edit one byte of the ledger later and its hash no longer equals the memo on the chain.
//
// REAL (when the wallet holds devnet SOL): the Memo transaction, its confirmation, and /verify, which re-reads the
//       transaction from devnet and compares the memo, the signer and the outcome with the hash you expect.
// MOCK  (no devnet SOL, RPC unreachable, dependency missing): nothing is sent. /anchor returns a result flagged
//       mock:true with a "mock-..." signature and NO explorer link, and /verify says plainly that it is not on chain.
//       The mode flips to live by itself the next time the balance is read after the wallet is funded.
//
// DEVNET ONLY, enforced three ways: a mainnet-looking RPC URL is refused at mount; the cluster's genesis hash must be
// devnet's before anything is signed; every explorer link carries ?cluster=devnet. The key never leaves this process:
// it is read from a 0600 file outside the repo and no route, log line or return value contains it.
//
// Routes (base /api/solana):
//   POST /anchor    {hash, label?}                  -> {ok, mock, signature, slot, explorer, memo, hash, label, signer, at}
//   GET  /verify    ?sig=...[&hash=...&label=...]   -> {ok, verified, checks, memo, slot, signer, explorer, ...}
//   GET  /status                                    -> {status:'live'|'mock', reason, publicKey, balanceSol, cluster, ...}
//   GET  /anchors?limit=                            -> recent anchors from the local log (newest first)
//   GET  /ui.js                                     -> the browser module (window.claura.anchor, the card)

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.1.0';
export const BASE = '/api/solana';
export const TITLE = 'Evidence anchoring';
export const TRACK = 'MLH · Best Use of Solana';
export const CLUSTER = 'devnet';
export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const MEMO_PROGRAM_V1 = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
export const FAUCET_URL = 'https://faucet.solana.com';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'claura');
export const DEFAULT_WALLET_FILE = path.join(CONFIG_DIR, 'solana-devnet.json');
export const DEFAULT_ANCHORS_FILE = path.join(CONFIG_DIR, 'solana-anchors.jsonl');
const DEFAULT_MIN_LAMPORTS = 2_000_000; // above the 890,880 rent-exempt floor, with room for about 220 anchors at 5,000 each
const LAMPORTS_PER_SOL = 1_000_000_000;
const HERE = path.dirname(fileURLToPath(import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const posInt = (v, dflt) => (Number.isInteger(Number(v)) && Number(v) > 0 && v !== null && v !== '' && v !== undefined ? Number(v) : dflt);
const shortErr = (e, n = 240) => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, n);

// ------------------------------------------------------------------ memo format (pure, exported for tests)
const HASH_RE = /^[0-9a-f]{64}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;
const MEMO_RE = /^claura:([A-Za-z0-9][A-Za-z0-9._-]{0,47}):sha256:([0-9a-f]{64})$/;
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** A SHA-256 digest as 64 lowercase hex characters (an optional "sha256:" prefix is accepted), or null. */
export function normalizeHash(v) {
  const s = String(v ?? '').replace(/\s+/g, '').toLowerCase().replace(/^sha-?256:/, '');
  return HASH_RE.test(s) ? s : null;
}

/** A label that is safe inside the memo (letters, digits, . _ -). Missing -> "evidence". Unusable -> null. */
export function normalizeLabel(v, fallback = 'evidence') {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const s = String(v)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 48)
    .replace(/[-._]+$/, '');
  return LABEL_RE.test(s) ? s : null;
}

export const memoFor = (label, hash) => `claura:${label}:sha256:${hash}`;
export function parseMemo(text) {
  const m = MEMO_RE.exec(String(text ?? ''));
  return m ? { label: m[1], hash: m[2] } : null;
}
/** A Solana transaction signature: base58 that decodes to exactly 64 bytes (checked here so the RPC is never asked about junk). */
export function isSignature(v) {
  if (typeof v !== 'string' || !SIG_RE.test(v)) return false;
  let n = 0n;
  for (const ch of v) n = n * 58n + BigInt(B58.indexOf(ch));
  let len = n === 0n ? 0 : Math.ceil(n.toString(16).length / 2);
  for (const ch of v) { if (ch === '1') len++; else break; }
  return len === 64;
}
export const explorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (addr) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;

/** Memo text(s) of a parsed devnet transaction (getParsedTransaction): top-level Memo-program instructions only. */
export function extractMemos(parsedTx) {
  const out = [];
  let needLogs = false;
  for (const ix of parsedTx?.transaction?.message?.instructions ?? []) {
    const pid = typeof ix.programId === 'string' ? ix.programId : ix.programId?.toBase58?.();
    if (pid !== MEMO_PROGRAM_ID && pid !== MEMO_PROGRAM_V1) continue;
    if (typeof ix.parsed === 'string') out.push(ix.parsed);
    else needLogs = true;
  }
  if (needLogs && !out.length) {
    for (const line of parsedTx?.meta?.logMessages ?? []) {
      const m = /^Program log: Memo \(len \d+\): "(.*)"$/.exec(line);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

/** The fee payer, which is also the first signer. */
export function firstSigner(parsedTx) {
  const k = parsedTx?.transaction?.message?.accountKeys?.[0]?.pubkey;
  return typeof k === 'string' ? k : k?.toBase58?.() ?? null;
}

// ------------------------------------------------------------------ small infrastructure
class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function makeLogger(log, prefix = 'solana') {
  const emit = (level, msg, meta) => {
    try {
      if (typeof log === 'function') return log(`[${prefix}] ${msg}`, meta, level);
      if (log && typeof log[level] === 'function') return log[level](`[${prefix}] ${msg}`, meta);
      if (log && typeof log.log === 'function') return log.log(`[${prefix}] ${msg}`, meta);
    } catch {
      /* logging must never throw */
    }
    if (!log && level !== 'debug') (level === 'error' || level === 'warn' ? console.error : console.log)(`[${prefix}] ${msg}`);
  };
  return { debug: (m, x) => emit('debug', m, x), info: (m, x) => emit('info', m, x), warn: (m, x) => emit('warn', m, x), error: (m, x) => emit('error', m, x) };
}

function makeLimiter(max, windowMs) {
  let hits = [];
  return (what) => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
      throw new HttpError(429, 'rate_limited', `Too many ${what} requests: at most ${max} per ${Math.round(windowMs / 1000)} s`, { retryAfter });
    }
    hits.push(now);
  };
}

async function readJson(req, limit = 16 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body; // the host already parsed it
  if (!/^application\/json\b/i.test(String(req.headers?.['content-type'] ?? ''))) {
    throw new HttpError(415, 'unsupported_media_type', 'Send JSON with Content-Type: application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'too_large', 'The request body is larger than 16 KB');
    chunks.push(c);
  }
  try {
    const j = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    throw new HttpError(400, 'bad_json', 'The request body is not valid JSON');
  }
}

// ------------------------------------------------------------------ @solana/web3.js (loaded lazily so a missing install degrades to MOCK)
let web3Promise = null;
let web3Error = null;
export function loadWeb3() {
  return (web3Promise ??= import('@solana/web3.js').catch((e) => {
    web3Error = shortErr(e);
    return null;
  }));
}
export const web3LoadError = () => web3Error;
async function needWeb3() {
  const w = await loadWeb3();
  if (!w) throw new Error('@solana/web3.js is not installed: run npm install in integrations/solana-anchor');
  return w;
}

// ------------------------------------------------------------------ the wallet (secret never printed, never returned)
export class WalletError extends Error {}

/**
 * Load the devnet keypair (a Solana CLI style JSON array of 64 bytes), or create it if the file does not exist.
 * Never overwrites an existing file, creates it 0600 inside a 0700 directory, and never puts key material in an error.
 * Returns { keypair, created, file }. Callers must not print `keypair`; print keypair.publicKey.toBase58() only.
 */
export async function loadOrCreateWallet(file = DEFAULT_WALLET_FILE) {
  const { Keypair } = await needWeb3();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const read = () => {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      if (e?.code === 'ENOENT') return null;
      throw new WalletError(`cannot read the wallet file ${file} (${e?.code ?? 'error'})`);
    }
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length !== 64 || !arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('shape');
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch {
      throw new WalletError(`${file} is not a Solana keypair file (a JSON array of 64 bytes)`); // deliberately drops the parser message: it can quote the file
    }
  };
  let keypair = read();
  let created = false;
  if (!keypair) {
    keypair = Keypair.generate();
    try {
      fs.writeFileSync(file, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600, flag: 'wx' });
      created = true;
    } catch (e) {
      if (e?.code !== 'EEXIST') throw new WalletError(`cannot write the wallet file ${file} (${e?.code ?? 'error'})`);
      keypair = read(); // another process created it a moment ago
    }
  }
  try {
    if ((fs.statSync(file).mode & 0o077) !== 0) fs.chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
  return { keypair, created, file };
}

// ------------------------------------------------------------------ the connection (devnet guard + timeouts)
/** Throws for anything that looks like mainnet; returns the host to show in status (never the full URL: it may hold a key). */
export function guardRpcUrl(rpcUrl) {
  let u;
  try {
    u = new URL(rpcUrl);
  } catch {
    throw new Error('the RPC URL is not a valid URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error('the RPC URL must be https');
  if (/mainnet/i.test(u.hostname) || /mainnet/i.test(u.pathname)) throw new Error('refusing a mainnet RPC URL: Claura anchoring is devnet only');
  return u.host;
}

export function makeConnection(web3, rpcUrl, { quiet429 = false } = {}) {
  const timeoutFetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  return new web3.Connection(rpcUrl, { commitment: 'confirmed', fetch: timeoutFetch, disableRetryOnRateLimit: quiet429 });
}

/** Poll until the signature is confirmed (no WebSocket, so nothing is left open). Re-broadcasts while waiting. */
export async function confirmSignature(connection, signature, { lastValidBlockHeight, raw, timeoutMs = 60_000, resendMs = 2500 } = {}) {
  const t0 = Date.now();
  let lastSend = t0;
  const okStatus = (st) => st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized');
  for (;;) {
    const st = (await connection.getSignatureStatuses([signature])).value[0];
    if (st?.err) throw Object.assign(new Error(`the transaction failed on chain: ${JSON.stringify(st.err)}`), { onChain: true });
    if (okStatus(st)) return st;
    if (lastValidBlockHeight !== undefined && (await connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
      const last = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0]; // it may have landed in the last moment
      if (okStatus(last)) return last;
      throw new Error('the blockhash expired before the transaction was confirmed');
    }
    if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting for the transaction to confirm');
    if (raw && Date.now() - lastSend >= resendMs) {
      lastSend = Date.now();
      connection.sendRawTransaction(raw, { skipPreflight: true }).catch(() => {});
    }
    await sleep(900);
  }
}

/** 'closed' (the RPC faucet is permanently off: stop), 'rate-limited' (back off and retry) or 'error'. */
export function classifyAirdropError(e) {
  const msg = String(e?.message ?? e);
  if (/\b410\b|faucet is closed|faucet.*(closed|disabled|shut)/i.test(msg)) return 'closed';
  if (/\b429\b|rate.?limit|too many|airdrop request failed|limit/i.test(msg)) return 'rate-limited';
  return 'error';
}

/**
 * Ask the devnet RPC faucet for test SOL (connection.requestAirdrop), with backoff. Devnet SOL has no value.
 * Stops at once when the faucet reports it is closed, which is what api.devnet.solana.com answers today
 * ("410 Gone: The RPC faucet is closed on this cluster"). Then the web faucet at faucet.solana.com is the way.
 * Returns { ok, closed, rateLimited, signature?, lamports?, error? }.
 */
export async function requestFunding({ connection, publicKey, amountsSol = [1, 0.5, 0.1], attempts = 4, log = makeLogger(null), sleepFn = sleep } = {}) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleepFn(Math.min(30_000, 1500 * 2 ** attempt));
    for (const sol of amountsSol) {
      try {
        const signature = await connection.requestAirdrop(publicKey, Math.round(sol * LAMPORTS_PER_SOL));
        await confirmSignature(connection, signature, { timeoutMs: 45_000 });
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        return { ok: true, closed: false, rateLimited: false, signature, lamports };
      } catch (e) {
        const kind = classifyAirdropError(e);
        last = { ok: false, closed: kind === 'closed', rateLimited: kind === 'rate-limited', error: shortErr(e, 200) };
        log.warn(`airdrop of ${sol} SOL failed (${kind}): ${last.error}`);
        if (kind === 'closed') return last;
      }
    }
  }
  return last ?? { ok: false, closed: false, rateLimited: false, error: 'no attempt was made' };
}

// ------------------------------------------------------------------ mount
/**
 * @param {import('express').Express} app  an Express 5 app (or Router)
 * @param {object} ctx
 * @param {object}   [ctx.env]    environment (defaults to process.env)
 * @param {object|Function} [ctx.log]
 * @param {{append:Function}} [ctx.ledger]  incident-log adapter; every anchor is mirrored there as kind "solana.anchor"
 * @param {object}   [ctx.solana] {base, keypairPath, rpcUrl, anchorsFile, minLamports, autoFund, maxPerMinute, authorize, origins, connection}
 */
export function mount(app, ctx = {}) {
  const opt = ctx.solana ?? {};
  const env = ctx.env && typeof ctx.env === 'object' ? ctx.env : process.env;
  const log = makeLogger(ctx.log);
  const base = String(opt.base ?? BASE).replace(/\/+$/, '');
  const walletFile = opt.keypairPath || env.CLAURA_SOLANA_KEYPAIR || DEFAULT_WALLET_FILE;
  const anchorsFile = opt.anchorsFile || env.CLAURA_SOLANA_ANCHORS || DEFAULT_ANCHORS_FILE;
  const rpcUrl = String(opt.rpcUrl || env.CLAURA_SOLANA_RPC_URL || env.SOLANA_RPC_URL || DEVNET_RPC);
  const minLamports = posInt(opt.minLamports ?? env.CLAURA_SOLANA_MIN_LAMPORTS, DEFAULT_MIN_LAMPORTS);
  const autoFund = opt.autoFund !== undefined ? !!opt.autoFund : !/^(0|false|no|off)$/i.test(String(env.CLAURA_SOLANA_AUTOFUND ?? '1'));
  const ledger = ctx.ledger && typeof ctx.ledger.append === 'function' ? ctx.ledger : null;
  const origins = new Set((Array.isArray(opt.origins) ? opt.origins : String(opt.origins ?? env.CLAURA_SOLANA_ORIGINS ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean));
  const anchorLimit = makeLimiter(posInt(opt.maxPerMinute ?? env.CLAURA_SOLANA_MAX_PER_MINUTE, 12), 60_000);
  const verifyLimit = makeLimiter(60, 60_000);

  const S = {
    web3: null, keypair: null, publicKey: null, connection: null,
    balance: null, checkedAt: 0, rpcOk: false, rpcError: null, genesisOk: null,
    depError: null, walletError: null, urlError: null, rpcHost: null,
    faucet: 'unknown', // 'unknown' | 'closed' | 'open'
    anchors: [],
  };

  try {
    S.rpcHost = guardRpcUrl(rpcUrl);
  } catch (e) {
    S.urlError = e.message;
    S.genesisOk = false;
    log.error(e.message);
  }

  // ---------------------------------------------------------------- anchors log (public data: hash, label, signature)
  try {
    S.anchors = fs.readFileSync(anchorsFile, 'utf8').split('\n').filter(Boolean).slice(-500)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r && typeof r.signature === 'string');
  } catch {
    /* no log yet */
  }
  const saveAnchor = (rec) => {
    S.anchors.push(rec);
    if (S.anchors.length > 500) S.anchors.shift();
    try {
      fs.mkdirSync(path.dirname(anchorsFile), { recursive: true, mode: 0o700 });
      fs.appendFileSync(anchorsFile, `${JSON.stringify(rec)}\n`, { mode: 0o600 });
    } catch (e) {
      log.warn(`could not append to ${anchorsFile} (${e?.code ?? 'error'})`);
    }
  };
  const findAnchor = (sig) => [...S.anchors].reverse().find((r) => r.signature === sig) ?? null;

  // ---------------------------------------------------------------- state: live or mock, and why
  const currentReason = () => {
    if (S.depError) return 'dependency-missing';
    if (S.walletError) return 'wallet-error';
    if (S.genesisOk === false) return 'not-devnet';
    if (!S.checkedAt) return 'starting';
    if (!S.rpcOk) return 'rpc-unreachable';
    if (S.balance == null || S.balance < minLamports) return 'unfunded';
    return null;
  };
  const mode = () => (currentReason() ? 'mock' : 'live');

  async function refresh({ force = false } = {}) {
    if (!S.connection || S.walletError || S.genesisOk === false) return snapshot();
    if (!force && Date.now() - S.checkedAt < 10_000) return snapshot();
    try {
      if (S.genesisOk !== true) {
        const g = await S.connection.getGenesisHash();
        S.genesisOk = g === DEVNET_GENESIS;
        if (!S.genesisOk) {
          S.urlError = `${S.rpcHost} is not Solana devnet (genesis hash ${String(g).slice(0, 8)}...): nothing will be signed`;
          log.error(S.urlError);
          return snapshot();
        }
      }
      S.balance = await S.connection.getBalance(S.publicKey, 'confirmed');
      S.rpcOk = true;
      S.rpcError = null;
    } catch (e) {
      S.rpcOk = false;
      S.rpcError = shortErr(e, 160);
      log.warn(`devnet RPC check failed: ${S.rpcError}`);
    }
    S.checkedAt = Date.now();
    return snapshot();
  }

  function snapshot() {
    const reason = currentReason();
    const address = S.publicKey?.toBase58() ?? null;
    const live = S.anchors.filter((r) => !r.mock).length;
    const out = {
      ok: true,
      feature: 'solana-anchor',
      title: TITLE,
      track: TRACK,
      version: VERSION,
      cluster: CLUSTER,
      status: reason ? 'mock' : 'live',
      mode: reason ? 'mock' : 'live',
      reason,
      publicKey: address,
      addressUrl: address ? explorerAddress(address) : null,
      balanceLamports: S.balance,
      balanceSol: S.balance == null ? null : S.balance / LAMPORTS_PER_SOL,
      minLamports,
      rpc: S.rpcHost,
      genesisVerified: S.genesisOk === true,
      memoProgram: MEMO_PROGRAM_ID,
      memoFormat: 'claura:<label>:sha256:<64 hex>',
      faucet: { url: FAUCET_URL, rpcAirdrop: S.faucet },
      anchors: { count: S.anchors.length, live, mock: S.anchors.length - live, last: S.anchors.at(-1) ?? null },
      checkedAt: S.checkedAt ? new Date(S.checkedAt).toISOString() : null,
    };
    if (reason === 'unfunded' && address) {
      out.fund = {
        address,
        steps: [
          `Open ${FAUCET_URL} and sign in (it uses GitHub).`,
          `Paste the public address ${address}, choose Devnet and request 1 to 5 SOL.`,
          'Nothing else: the next balance check (this status call, an anchor, or npm run smoke) flips the feature from mock to live.',
        ],
      };
    }
    const detail = S.urlError || S.walletError || S.depError || S.rpcError;
    if (detail && reason) out.detail = detail;
    return out;
  }

  // ---------------------------------------------------------------- funding (best effort; the RPC faucet is closed today)
  let funding = null;
  function fund({ attempts = 4 } = {}) {
    if (funding) return funding;
    funding = (async () => {
      await ready;
      if (!S.connection || !S.publicKey) return { ok: false, closed: false, rateLimited: false, error: 'the wallet is not ready' };
      if (S.genesisOk !== true) await refresh({ force: true });
      if (S.genesisOk !== true) return { ok: false, closed: false, rateLimited: false, error: 'not connected to devnet' };
      const conn = opt.connection ?? makeConnection(S.web3, rpcUrl, { quiet429: true });
      const r = await requestFunding({ connection: conn, publicKey: S.publicKey, attempts, log });
      if (r.closed) S.faucet = 'closed';
      else if (r.ok) S.faucet = 'open';
      await refresh({ force: true });
      return r;
    })().finally(() => { funding = null; });
    return funding;
  }

  // ---------------------------------------------------------------- the Memo transaction
  async function sendMemo(hash, label) {
    const { Transaction, TransactionInstruction, PublicKey } = S.web3;
    const memo = memoFor(label, hash);
    const programId = new PublicKey(MEMO_PROGRAM_ID);
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { blockhash, lastValidBlockHeight } = await S.connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ feePayer: S.publicKey, blockhash, lastValidBlockHeight });
      // The Claura wallet is listed as a signer of the memo instruction, so the memo is attested by that key.
      tx.add(new TransactionInstruction({ programId, keys: [{ pubkey: S.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, 'utf8') }));
      tx.sign(S.keypair);
      const raw = tx.serialize();
      try {
        const signature = await S.connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 });
        const st = await confirmSignature(S.connection, signature, { lastValidBlockHeight, raw });
        return { signature, slot: st.slot, confirmation: st.confirmationStatus, memo };
      } catch (e) {
        lastErr = e;
        if (attempt === 1 && /blockhash not found|already (been )?processed|expired/i.test(String(e?.message))) {
          await sleep(900);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }
  const isUnfunded = (e) => /no record of a prior credit|insufficient (funds|lamports)|AccountNotFound|debit an account/i.test(String(e?.message ?? '') + String(e?.logs ?? ''));

  async function note(rec) {
    if (!ledger) return;
    try {
      await ledger.append({
        kind: 'solana.anchor',
        actor: 'claura',
        text: `anchored ${rec.label} (sha256 ${rec.hash.slice(0, 12)}...) ${rec.mock ? 'in SIMULATED mode, nothing written to Solana' : `on Solana devnet, tx ${rec.signature.slice(0, 12)}... slot ${rec.slot}`}`,
        data: { label: rec.label, hash: rec.hash, signature: rec.signature, slot: rec.slot, cluster: CLUSTER, explorer: rec.explorer, mock: rec.mock },
      });
    } catch (e) {
      log.warn(`ledger append failed: ${shortErr(e, 120)}`);
    }
  }

  let queue = Promise.resolve();
  const inflight = new Map();

  async function doAnchor(hash, label) {
    await refresh();
    const memo = memoFor(label, hash);
    const at = new Date().toISOString();
    const signer = S.publicKey?.toBase58() ?? null;
    let rec = null;
    if (mode() === 'live') {
      try {
        const r = await sendMemo(hash, label);
        rec = { at, mock: false, cluster: CLUSTER, signature: r.signature, slot: r.slot, confirmation: r.confirmation, explorer: explorerTx(r.signature), memo, hash, label, signer };
        log.info(`anchored ${label} ${hash.slice(0, 12)}... slot ${r.slot} ${r.signature.slice(0, 16)}...`);
        S.balance = Math.max(0, (S.balance ?? 0) - 5000);
      } catch (e) {
        if (isUnfunded(e)) {
          S.balance = 0;
          log.warn('the wallet cannot pay the fee any more: falling back to MOCK');
        } else {
          throw new HttpError(502, 'chain_error', `Solana devnet did not accept the anchor: ${shortErr(e)}`);
        }
      }
    }
    if (!rec) {
      const reason = currentReason() ?? 'unfunded';
      rec = {
        at, mock: true, cluster: CLUSTER, signature: `mock-${sha256hex(`${memo}|${at}|${randomBytes(8).toString('hex')}`).slice(0, 32)}`, slot: null, confirmation: 'none',
        explorer: null, memo, hash, label, signer, reason,
        note: 'SIMULATED: nothing was written to Solana. The wallet has no devnet SOL, so this record exists only in the local anchor log.',
      };
      log.warn(`anchor ${label} ${hash.slice(0, 12)}... recorded as MOCK (${reason})`);
    }
    saveAnchor(rec);
    await note(rec);
    return { ok: true, ...rec };
  }

  async function anchorEvidence(hashIn, labelIn) {
    const hash = normalizeHash(hashIn);
    if (!hash) throw new HttpError(400, 'bad_hash', 'hash must be a SHA-256 digest: 64 hexadecimal characters');
    const label = normalizeLabel(labelIn);
    if (!label) throw new HttpError(400, 'bad_label', 'label must contain letters or digits (A-Z a-z 0-9 . _ -), up to 48 characters');
    await ready;
    const key = `${label}|${hash}`;
    if (inflight.has(key)) return inflight.get(key); // the same request is already on its way: share it
    anchorLimit('anchor');
    const p = (queue = queue.catch(() => {}).then(() => doAnchor(hash, label)));
    inflight.set(key, p);
    p.catch(() => {}).finally(() => inflight.delete(key));
    return p;
  }

  // ---------------------------------------------------------------- verify: re-read the chain, compare the memo
  async function getTxWithRetry(sig, tries = 5) {
    for (let i = 0; i < tries; i++) {
      const [tx, st] = await Promise.all([
        S.connection.getParsedTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
        S.connection.getSignatureStatuses([sig], { searchTransactionHistory: true }),
      ]);
      if (tx) return { tx, status: st.value[0] };
      if (i < tries - 1) await sleep(1200);
    }
    return { tx: null, status: null };
  }

  async function verifyAnchor(sigIn, expectIn = {}) {
    const sig = String(sigIn ?? '').trim();
    if (!sig) throw new HttpError(400, 'bad_signature', 'sig is required (a transaction signature)');
    const record = findAnchor(sig);
    const qHash = expectIn.hash === undefined || expectIn.hash === '' ? null : normalizeHash(expectIn.hash);
    if (expectIn.hash !== undefined && expectIn.hash !== '' && !qHash) throw new HttpError(400, 'bad_hash', 'hash must be a SHA-256 digest: 64 hexadecimal characters');
    const qLabel = expectIn.label === undefined || expectIn.label === '' ? null : normalizeLabel(expectIn.label, null);
    const expected = qHash
      ? { hash: qHash, label: qLabel ?? record?.label ?? null, source: 'query' }
      : record ? { hash: record.hash, label: record.label, source: 'anchor-log' } : null;
    const expectedSigner = record?.signer ?? S.publicKey?.toBase58() ?? null;
    const base0 = { ok: true, cluster: CLUSTER, signature: sig, expected, mock: false };

    if (sig.startsWith('mock-')) {
      if (!record) return { ...base0, mock: true, verified: false, reason: 'unknown_mock', note: 'This is a simulated signature and it is not in the local anchor log.' };
      return {
        ...base0, mock: true, verified: false, reason: 'mock_anchor', explorer: null, slot: null, memo: record.memo, signer: record.signer,
        checks: { found: false, succeeded: false, memoProgram: false, wellFormed: true, hashMatches: expected ? record.hash === expected.hash : null, labelMatches: null, signerMatches: null },
        note: 'SIMULATED anchor: it matches the local record only. Nothing is on Solana, so nothing is proven. Fund the wallet to anchor for real.',
      };
    }
    if (!isSignature(sig)) throw new HttpError(400, 'bad_signature', 'sig is not a Solana transaction signature (base58 of 64 bytes, 87 or 88 characters)');
    verifyLimit('verify');
    await ready;
    if (!S.connection) throw new HttpError(503, 'unavailable', S.depError || S.walletError || 'Solana is not available');
    if (S.genesisOk !== true) await refresh({ force: true });
    if (S.genesisOk !== true) throw new HttpError(503, S.genesisOk === false ? 'not_devnet' : 'rpc_unreachable', S.urlError || S.rpcError || 'Cannot reach Solana devnet');

    let found;
    try {
      found = await getTxWithRetry(sig);
    } catch (e) {
      throw new HttpError(502, 'rpc_error', `Could not read the transaction from devnet: ${shortErr(e)}`);
    }
    const { tx, status: st } = found;
    const checks = { found: !!tx, succeeded: null, memoProgram: null, wellFormed: null, hashMatches: null, labelMatches: null, signerMatches: null };
    const out = { ...base0, explorer: explorerTx(sig), verified: false, reason: null, checks, memo: null, onChain: null, slot: null, blockTime: null, confirmation: null, signer: null };
    if (!tx) return { ...out, reason: 'not_found', note: 'The transaction was not found on devnet (wrong signature, wrong cluster, or too old for the RPC node).' };

    const memos = extractMemos(tx);
    const parsed = memos.map(parseMemo).find(Boolean) ?? null;
    const signer = firstSigner(tx);
    Object.assign(out, { slot: tx.slot, blockTime: tx.blockTime ?? null, confirmation: st?.confirmationStatus ?? 'confirmed', memo: memos[0] ?? null, onChain: parsed, signer });
    checks.succeeded = !tx.meta?.err;
    checks.memoProgram = memos.length > 0;
    checks.wellFormed = !!parsed;
    if (expected) {
      checks.hashMatches = !!parsed && parsed.hash === expected.hash;
      checks.labelMatches = expected.label ? !!parsed && parsed.label === expected.label : null;
    }
    checks.signerMatches = expectedSigner ? signer === expectedSigner : null;

    const order = [
      ['succeeded', checks.succeeded === false, 'tx_failed'],
      ['memoProgram', !checks.memoProgram, 'no_memo'],
      ['wellFormed', !checks.wellFormed, 'bad_memo'],
      ['expected', !expected, 'no_expected_hash'],
      ['hashMatches', checks.hashMatches === false, 'hash_mismatch'],
      ['labelMatches', checks.labelMatches === false, 'label_mismatch'],
      ['signerMatches', checks.signerMatches === false, 'signer_mismatch'],
    ];
    const bad = order.find(([, failed]) => failed);
    out.reason = bad ? bad[2] : null;
    out.verified = !bad;
    return out;
  }

  // ---------------------------------------------------------------- routes
  const handle = (fn) => async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      await fn(req, res, next);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.extra?.retryAfter) res.set('Retry-After', String(e.extra.retryAfter));
        if (!res.headersSent) res.status(e.status).json({ ok: false, code: e.code, error: e.message, ...e.extra });
        return;
      }
      log.error(`unhandled: ${shortErr(e)}`);
      if (!res.headersSent) res.status(500).json({ ok: false, code: 'internal', error: 'Unexpected error' });
    }
  };

  app.get(`${base}/status`, handle(async (_req, res) => {
    await ready;
    res.json(await refresh());
  }));

  app.post(`${base}/anchor`, handle(async (req, res) => {
    const origin = req.headers?.origin;
    if (origins.size && origin && !origins.has(origin)) throw new HttpError(403, 'forbidden_origin', 'This origin may not anchor evidence');
    if (typeof opt.authorize === 'function' && !(await opt.authorize(req))) throw new HttpError(401, 'unauthorized', 'Not allowed to anchor evidence');
    const body = await readJson(req);
    res.json(await anchorEvidence(body.hash, body.label));
  }));

  app.get(`${base}/verify`, handle(async (req, res) => {
    const q = req.query ?? {};
    res.json(await verifyAnchor(q.sig ?? q.signature, { hash: q.hash, label: q.label }));
  }));

  app.get(`${base}/anchors`, handle(async (req, res) => {
    const limit = Math.min(100, posInt(req.query?.limit, 20));
    res.json({ ok: true, count: S.anchors.length, anchors: [...S.anchors].reverse().slice(0, limit) });
  }));

  app.get(`${base}/ui.js`, (_req, res) => {
    res.set('Cache-Control', 'no-store').type('text/javascript').sendFile(path.join(HERE, 'ui.js'), { dotfiles: 'deny' });
  });

  // ---------------------------------------------------------------- start (never throws, never blocks the host)
  const ready = (async () => {
    try {
      S.web3 = await loadWeb3();
      if (!S.web3) {
        S.depError = `@solana/web3.js is not installed (${web3Error}). Run npm install in integrations/solana-anchor.`;
        log.warn(S.depError);
        return;
      }
      const wallet = await loadOrCreateWallet(walletFile);
      S.keypair = wallet.keypair;
      S.publicKey = wallet.keypair.publicKey;
      const addr = S.publicKey.toBase58();
      if (wallet.created) log.info(`created a new DEVNET wallet ${addr}; its secret key is in ${walletFile} (mode 600, outside the repo)`);
      if (S.urlError) return;
      S.connection = opt.connection ?? makeConnection(S.web3, rpcUrl);
      await refresh({ force: true });
      const why = currentReason();
      if (why === 'unfunded') {
        log.warn(`wallet ${addr} has no devnet SOL: running in MOCK mode. To go live: open ${FAUCET_URL}, paste that address, choose Devnet.`);
        if (autoFund) fund({ attempts: 2 }).then((r) => { if (r.closed) log.warn('the devnet RPC faucet is closed (410): only the web faucet can fund the wallet'); }).catch(() => {});
      } else if (!why) {
        log.info(`ready: LIVE on devnet, wallet ${addr}, ${(S.balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      } else {
        log.warn(`ready in MOCK mode (${why}), wallet ${addr}`);
      }
    } catch (e) {
      S.walletError = e instanceof WalletError ? e.message : `start-up failed: ${shortErr(e, 120)}`;
      log.error(S.walletError);
    }
  })();

  const api = {
    name: 'solana-anchor',
    base,
    version: VERSION,
    ready,
    mode,
    status: snapshot,
    refresh,
    anchor: anchorEvidence,
    verify: verifyAnchor,
    fund,
    anchors: () => [...S.anchors],
    get publicKey() { return S.publicKey?.toBase58() ?? null; },
    close() { if (current === api) current = null; },
  };
  current = api;
  return api;
}

// ------------------------------------------------------------------ module-level status (for an integrations registry)
let current = null;
/** Snapshot of the most recently mounted instance, or {status:'off'} before mount(). Synchronous; cheap. */
export function status() {
  if (current) return current.status();
  return { ok: true, feature: 'solana-anchor', title: TITLE, track: TRACK, version: VERSION, cluster: CLUSTER, status: 'off', mode: 'off', reason: 'not-mounted' };
}

export default mount;
