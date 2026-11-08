# Claura Evidence Anchoring (Solana devnet)

**Pin the fingerprint of your evidence to Solana. Change one byte of the ledger later and the chain says so.**

Track: **MLH · Best Use of Solana**. Devnet only: no mainnet, no real funds, ever.

During an incident the record is the first thing worth attacking: the attacker wants the log rewritten, and a nervous
insider might too. Claura already keeps a hash-chained incident ledger. Anchoring publishes that ledger's SHA-256 (or the
hash of an evidence manifest) to a public chain nobody on the victim's network controls, in a Solana **Memo**
transaction signed by the Claura wallet. Later, `verify` re-reads the transaction from devnet and checks that the memo
still equals the hash of what you hold. Only a hash and a short label ever leave the machine.

```
 ledger / evidence manifest ──SHA-256──▶ 3f9a…c1  ──POST /api/solana/anchor──▶  server.mjs
                                                                                   │ Memo-program instruction, signed by the
                                                                                   │ Claura devnet wallet (key: 0600 file, never in the repo)
                                                                                   ▼
   memo text:  claura:<label>:sha256:3f9a…c1                  Solana devnet  ◀── sendRawTransaction, polled to "confirmed"
                                                                                   │
 GET /api/solana/verify?sig=…  ◀── re-reads the transaction from devnet, checks: succeeded · Memo program · well-formed ·
                                    hash equals yours · label equals · signer is the Claura wallet
```

## Where this stands (read this first)

| Piece | State |
|---|---|
| Anchoring, verification, routes, the Liquid Glass card, devnet-only guards | Built and tested (`npm run smoke`, 53 checks). |
| Our exact Memo instruction on the **real** devnet runtime | Verified by simulation: the runtime runs it and logs the exact text. |
| Memo and signer parsing | Verified on real memo transactions read from devnet. |
| The live send, confirm and verify path | Verified end to end against an in-process fake RPC (signature validity, the one Memo instruction, polling, tamper cases). **Not yet exercised on the real chain: the wallet has no devnet SOL.** |
| Devnet wallet | `GawzFG3iwB1yP2eXpF25emn4CU7VWAGFy5MfQQs1PbUN` (public address; created 2026-11-08). **Unfunded**, so the feature reports `status: "mock"`. |

Why unfunded: `connection.requestAirdrop` on `https://api.devnet.solana.com` now answers
`410 Gone: The RPC faucet is closed on this cluster. Request test SOL at https://faucet.solana.com`. That is a shutdown,
not a rate limit, so retrying cannot help, and the web faucet needs a GitHub sign-in that only a person can do.

### What the owner has to do (two minutes)

1. Open **https://faucet.solana.com** and sign in with GitHub.
2. Paste `GawzFG3iwB1yP2eXpF25emn4CU7VWAGFy5MfQQs1PbUN`, choose **Devnet**, request 1 to 5 SOL.
3. In `integrations/solana-anchor` run `npm run smoke`. It anchors one test hash for real, verifies it through the API and
   through an independent RPC read, and prints the signature and the Explorer URL. A running server needs no restart: the
   next balance check flips `status` from `mock` to `live` on its own.

The address is also printed by the server at start-up and by `npm run fund`. To use a keypair that already holds devnet
SOL instead, set `CLAURA_SOLANA_KEYPAIR=/path/to/keypair.json` (a Solana CLI JSON array of 64 bytes; use a throwaway
devnet key, never one that holds real funds).

### Mock mode (what you see until it is funded)

Nothing is sent. `POST /anchor` answers `mock: true` with a `mock-…` signature, **no** `explorer` link and a note that says
SIMULATED; `verify` answers `verified: false, reason: "mock_anchor"` and never claims a proof; the card shows an amber
"Simulated" pill and the funding address. Mock mode also applies when the RPC is unreachable, when `@solana/web3.js` is not
installed, and when the RPC turns out not to be devnet. `status.reason` says which.

## Run it

```bash
cd integrations/solana-anchor
npm install                  # @solana/web3.js 1.98.4 (pinned), express (dev only)
npm run dev                  # http://127.0.0.1:8802  the card on a wallpaper; add #autorun to click Anchor then Verify
npm run smoke                # all checks; one real devnet anchor if the wallet is funded
npm run fund                 # prints the PUBLIC address; asks the RPC faucet (closed today); prints the web-faucet steps
```

`SMOKE_REQUIRE_LIVE=1 npm run smoke` fails when the wallet is unfunded, for CI after funding.

## API (base `/api/solana`)

| Route | Body / query | Answer |
|---|---|---|
| `POST /anchor` | JSON `{hash, label?}`. `hash`: 64 hex (SHA-256). `label`: letters, digits, `. _ -`, up to 48; other characters become `-`; default `evidence`. | `{ok, mock, signature, slot, explorer, memo, hash, label, signer, at, confirmation}` |
| `GET /verify` | `?sig=…` and optionally `&hash=…&label=…` | `{ok, verified, reason, checks, memo, onChain, expected, slot, blockTime, signer, explorer, confirmation}` |
| `GET /status` | none | `{status: 'live'\|'mock', reason, publicKey, balanceSol, cluster: 'devnet', genesisVerified, faucet, fund?, anchors}` |
| `GET /anchors` | `?limit=` (max 100) | recent anchors from the local log, newest first |
| `GET /ui.js` | none | the browser module |

```bash
curl -s -X POST localhost:8802/api/solana/anchor -H 'Content-Type: application/json' \
  -d '{"hash":"<sha256 of the ledger>","label":"incident-4471"}'
# {"ok":true,"mock":false,"signature":"5Kq…","slot":3012…,"explorer":"https://explorer.solana.com/tx/5Kq…?cluster=devnet",
#  "memo":"claura:incident-4471:sha256:<hash>", …}
curl -s "localhost:8802/api/solana/verify?sig=5Kq…"                       # compares with the hash anchored under that signature
curl -s "localhost:8802/api/solana/verify?sig=5Kq…&hash=<hash you hold>"  # compares with the hash you hold now: this is the tamper test
```

`verified` is true only when **all** hold: the transaction exists and succeeded, it carries a Memo-program memo in the
exact format, the hash equals the expected one, the label equals it, and the signer is the Claura wallet that anchored
(or the current wallet when you pass `hash` yourself). `reason` names the first failure: `not_found`, `tx_failed`,
`no_memo`, `bad_memo`, `no_expected_hash`, `hash_mismatch`, `label_mismatch`, `signer_mismatch`, `mock_anchor`.

Errors are `{ok:false, code, error}`: 400 `bad_hash` / `bad_label` / `bad_signature` / `bad_json`, 401 `unauthorized`,
403 `forbidden_origin`, 413 `too_large`, 415 `unsupported_media_type` (POST must be JSON, which is also the CSRF guard),
429 `rate_limited` (with `Retry-After`; 12 anchors a minute by default), 502 `chain_error` / `rpc_error`, 503 `not_devnet`.

## What a verified anchor proves, and what it does not

- **Proves:** the Claura wallet published hash H in slot N, and the chain cannot be edited afterwards. If the ledger you hold
  today hashes to H, it has not changed since slot N.
- **Does not prove:** that the ledger was truthful when it was anchored (anchor often: on each containment step, and when
  handing over a shift), or that the wallet key was never misused: whoever holds the key can anchor a different hash later,
  but cannot alter an old anchor.
- **Privacy:** only the hash and the label go on chain, and the chain is public. Never put incident details or secrets in a
  label. Anchoring the head of the SSH recording ledger's hash chain (`/api/ssh/ledger`) also makes it impossible to rewrite
  the whole chain unnoticed.

## Devnet only, and the key

- A mainnet-looking RPC URL is refused at mount. Before anything is signed, the cluster's **genesis hash** must be devnet's
  (`EtWTRABZ…ZBG`), otherwise the feature stays in mock mode with `reason: "not-devnet"`. Explorer links always carry
  `?cluster=devnet`.
- The keypair is `~/.config/claura/solana-devnet.json` (Solana CLI format, mode 600, directory 700), created on first start
  if absent and **never overwritten**. It is outside the repo and `.gitignore` here also blocks it. No route, log line,
  status field or error contains key material: a corrupt file is reported by path only. `npm run smoke` checks this.
- The RPC URL is never logged in full (a provider key can sit in it): status shows the host only.
- Anchors are also appended to `~/.config/claura/solana-anchors.jsonl` (hash, label, signature, slot; no secrets) so `verify`
  can compare without being told the hash.

## Mount it in the console

```js
// server
import { mount } from './integrations/solana-anchor/server.mjs';
const solana = mount(app, { env, log, ledger, solana: { /* optional, below */ } });
await solana.ready;   // never rejects; solana.status() says live or mock and why
```

```html
<!-- browser -->
<script type="module" src="/api/solana/ui.js"></script>
<script type="module">
  const sol = window.claura.integrations['solana-anchor'];   // { title, track, status, open(container, opts), anchor, verify, ... }
  sol.open(document.querySelector('#integrations-panel'), { getHash: () => myLedgerSha256(), label: 'ledger' });
  const r = await window.claura.anchor(await sol.sha256Hex(JSON.stringify(ledger)), 'ledger');   // -> { signature, slot, explorer, ... }
  addEventListener('claura:anchored', (e) => console.log(e.detail));
</script>
```

`ui.js` defines `window.claura.anchor` and the registry entry only when absent; if the console already made an entry for
`'solana-anchor'`, only the keys it lacks are added. `status` is `'loading' | 'live' | 'mock' | 'offline'` and keeps itself
current. Every anchor is also appended to `ctx.ledger` as `{kind: 'solana.anchor', actor: 'claura', text, data}`.
`import { status } from './server.mjs'` gives a synchronous snapshot for a registry badge.

| Option (`ctx.solana`) | Env var | Default |
|---|---|---|
| `base` | | `/api/solana` |
| `keypairPath` | `CLAURA_SOLANA_KEYPAIR` | `~/.config/claura/solana-devnet.json` |
| `rpcUrl` | `CLAURA_SOLANA_RPC_URL`, `SOLANA_RPC_URL` | `https://api.devnet.solana.com` (mainnet refused) |
| `anchorsFile` | `CLAURA_SOLANA_ANCHORS` | `~/.config/claura/solana-anchors.jsonl` |
| `minLamports` | `CLAURA_SOLANA_MIN_LAMPORTS` | `2000000` (below this the feature is mock) |
| `autoFund` | `CLAURA_SOLANA_AUTOFUND=0` to disable | one background RPC-faucet try at start-up when unfunded |
| `maxPerMinute` | `CLAURA_SOLANA_MAX_PER_MINUTE` | `12` |
| `authorize` | | `(req) => boolean`: guards `POST /anchor`; use the console's own auth here |
| `origins` | `CLAURA_SOLANA_ORIGINS` | none; when set, a request carrying another `Origin` gets 403 |
| `connection` | | a pre-built web3.js `Connection` (tests; the devnet genesis guard still applies) |

`POST /anchor` spends a few thousandths of a cent of worthless devnet SOL, so the demo mounts it open on 127.0.0.1; put
`authorize` in front of it anywhere else.

## Files

`server.mjs` routes, wallet, devnet guard, Memo transaction, verify · `ui.js` browser module and the card (shadow DOM, no
build) · `smoke.mjs` checks A to E · `fund.mjs` wallet and faucet helper · `dev.mjs` demo page · `package.json` (pins
`@solana/web3.js` 1.98.4: the classic `Connection`/`Keypair` API that `connection.requestAirdrop` belongs to; the 3.x line
is a new `@solana/kit` based package and is not used here).
