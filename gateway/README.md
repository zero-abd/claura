# Claura gateway

One loopback server for everything the console talks to besides SpacetimeDB. It finds the feature packages
(**Secure Shell**, **Voice**, the **integrations**), mounts each one, serves their browser modules and hands the
console a single loader. A package that is missing, slow or broken is reported as `down`; the gateway and the other
packages keep serving, and the console keeps working without any of it.

```
npm install        # once (demo/start.sh does it for you)
npm start          # http://127.0.0.1:8787      (CLAURA_GATEWAY_PORT to change)
npm test           # 79 hermetic checks against fixture packages: no secrets, no network, no real sshd
```

Open **http://localhost:8787/** for a status page, `GET /api/health` for JSON. From the repo root the whole demo is
`demo/start.sh` / `demo/stop.sh`.

## What the console does with it

```js
// at boot, with an 800 ms budget; the console keeps working if this is slow, fails or never answers
const GATEWAY = 'http://127.0.0.1:8787';                     // what the console uses by default (?gateway= overrides it)
const m = await import(/* @vite-ignore */ `${GATEWAY}/client/claura-features.js`);
const result = await m.default({ base: GATEWAY });        // { base, ok, features, loaded: [...], failed: [{name, error}] }
```

The loader asks `GET /api/health`, imports the `ui.js` of every feature that is not `down`, and makes sure
`window.claura` has what the console looks for. It never overwrites an existing key, adds no other key, and never throws; calling it twice is harmless.

| `window.claura.` | from | |
|---|---|---|
| `openShell(hostId)` | ssh | the whole request, passkey, approval, terminal flow (also `window.claura.ssh`) |
| `voice { toggle, playBrief, say, sting }` | voice | push to talk, the spoken brief, a phrase, the alert chime |
| `integrations[name] = { title, track, status, open(container) }` | each integration, and voice | `open` renders the card or panel (a status card if the package has none). Not for ssh: the console opens it through its Shells view and `openShell` |
| `anchor(hash, label)` | solana-anchor | writes the hash to Solana devnet (or says plainly that it is a mock) |

`GET /api/health`:

```json
{ "ok": true, "service": "claura-gateway", "version": "0.1.0", "ready": true, "incident": "INC-0419",
  "features": [
    { "name": "ssh", "title": "Secure Shell", "track": "Winstead", "kind": "feature", "status": "live",
      "ui": "/features/ssh/ui.js", "api": "/api/ssh", "detail": "4/4 sshd targets up (127.0.0.1:2201-2204)" },
    { "name": "solana-anchor", "kind": "integration", "status": "down", "ui": "/features/solana-anchor/ui.js",
      "error": "Cannot find package '@solana/web3.js'" } ] }
```

`status` is `live` (working), `mock` (running on stand-in data: Voice without an ElevenLabs key, Solana with an unfunded
wallet) or `down` (not usable; `error` says why, scrubbed of secrets and of the home path). It is recomputed on every call.

## `localhost` and `127.0.0.1`

The gateway listens on `127.0.0.1` only, and answers browsers from `http://localhost:4317` and `http://127.0.0.1:4317`
(the console) and nobody else. A browser treats `localhost` and `127.0.0.1` as different **sites**, and the Secure Shell
keeps its request secret in an `HttpOnly; SameSite=Strict` cookie and binds its passkey to the page's hostname. So:

* Open the console as **http://localhost:4317** (passkeys need a hostname; an IP address does not work).
* The console's own calls (health, the loader) can use `http://127.0.0.1:8787`. The loader then **loads the feature modules
  from the page's spelling** (`http://localhost:8787` when the page is on `localhost`), so the cookie and the WebSocket are
  same-site. `result.base` is the address it used, `result.requestedBase` the one it was given. Without that rewrite the
  Secure Shell request never gets past its first call (tested: page on `localhost`, gateway on `127.0.0.1`).

## Features

A feature is a folder with `server.mjs` (exports `mount(app, ctx)`) and `ui.js` (the browser module).

| Where | Name | Kind |
|---|---|---|
| `../ssh` | `ssh` | feature: just-in-time SSH certificates, passkey, two-person approval, recorded terminal |
| `../voice` | `voice` | feature: ElevenLabs speech, local Nemotron answers |
| `../integrations/*` | folder name (`solana-anchor`) | integration |

Discovery reads the folders only; nothing is imported until the mount. `CLAURA_GATEWAY_FEATURES=voice,ssh` loads just those,
`CLAURA_GATEWAY_DISABLE=solana-anchor` skips one. Title and track come from `package.json` (`"claura": {"title", "track"}`),
or `export const meta = {title, track}` / `TITLE` / `TRACK` in `server.mjs`.

**What a package gets** (`ctx`):

| | |
|---|---|
| `ctx.env` | the shared `~/.config/claura/.env` (dotenv) with the real environment on top. In memory only: never logged, never served |
| `ctx.log` | `{info, warn, error, debug}`; every line is scrubbed of the secret values from the env file |
| `ctx.getIncidentContext({stage?})`, `ctx.getBrief({stage?, lang?})` | INC-0419 (default stage `approval`): the voice package's fixtures when present, built-in defaults otherwise. `ctx.gateway.setIncidentSource({getIncidentContext, getBrief})` swaps in live state |
| `ctx.<key>` | the package's own options, with the console origins already filled in: `ctx.ssh {origins, corsOrigins, openRecordings, portBase}`, `ctx.voice {allowedOrigins, prewarm}`, `ctx.solana {origins}`; for an unknown folder `a-b` under `ctx.a-b` and `ctx.a` |

**What a package returns** (all optional): `{ base, ready, stop() | close(), attach(server), status() | mode() }`. `base` is
its API path (default `/api/<name>`), `ready` a promise the gateway waits for (30 s), `attach(server)` is called for
WebSocket packages, `status()` may return `'live' | 'mock' | 'down'` or `{status, detail}`.

**Isolation.** Every package is imported and mounted inside try/catch with a timeout, on its own Express sub-app that
is attached only if the mount succeeded: routes of a package that threw half way are discarded with it. A failed package
is `down`, its files are not served, and its half-started children are stopped.

## What it serves

| | |
|---|---|
| `GET /api/health`, `GET /` | feature list as JSON, and as a small page |
| `GET /client/claura-features.js` | the loader (`client/claura-features.js`) |
| `GET /features/<name>/ui.js` | the feature's browser module (see below) |
| `GET /features/<name>/<file>` | read-only assets, **allowlist only**: files `ui.js` imports with relative paths; `public/ assets/ static/ ui/ dist/`; web files under `node_modules/` (xterm.css, fonts). Web file types only (js, mjs, css, json, map, images, fonts, wasm) |
| `/api/<name>/...` | the package's own API |

Never served: `server.mjs`, `dev.mjs`, test scripts, `package.json`, dotfiles, `.env`, `*.key`, `*.pem`, `*.pub`, `id_*`,
tokens, anything that is not a web file type, anything that resolves (after symlinks) outside the package folder,
directory listings. Path tricks (`..`, `%2e%2e`, `%2f`, `%5c`, `%00`) all end in a 404 (tested).

**Why `/features/ssh/ui.js` is a one-line re-export.** The ssh and Solana modules find their API from their own URL
(`import.meta.url`), and the Secure Shell cookie is scoped to `/api/ssh`. So when a package already serves its own
`ui.js` at `<api>/ui.js` and the file has no relative imports, `/features/<name>/ui.js` is
`export * from "/api/<name>/ui.js"` and the real module loads from where it expects to be. Packages that do not serve
themselves (or that split their UI over several files) are served as files from `/features/<name>/`.

## Security

Everything is loopback. Browsers are held to three rules before any package sees a request (so Voice, which has no
checks of its own, is covered too):

* `Host` must be `localhost`, `127.0.0.1` or `[::1]` (DNS rebinding: a page on `evil.example` resolving to 127.0.0.1 gets 421).
* `Origin`: CORS (with credentials) only for the console origins; any other browser origin that is not this server
  itself gets 403 *before* the package runs, which also stops `text/plain` cross-site POSTs that need no preflight.
* No `Origin` but `Sec-Fetch-Site: cross-site` (an `<img>` or `<script>` tag on another site) is refused unless it is a
  top-level navigation. WebSocket handshakes follow the same Host and Origin rules.

The shared `.env` is read into memory and handed to packages as `ctx.env`; the logger scrubs every secret value
(any variable whose name contains KEY, TOKEN, SECRET, CODE, PASSWORD) from every line, errors in `/api/health` included.
`CLAURA_GATEWAY_HOST` accepts loopback addresses only. Packages that listen on other ports (the four sshd targets,
127.0.0.1:2201-2204) keep their own rules; if those ports are taken by another sshd the gateway moves them to the next
free block of four and logs it.

## Configuration

| Variable | Default | |
|---|---|---|
| `CLAURA_GATEWAY_PORT` | `8787` | `0` picks a free port |
| `CLAURA_GATEWAY_HOST` | `127.0.0.1` | loopback only |
| `CLAURA_ENV` | `~/.config/claura/.env` | the shared secrets file |
| `CLAURA_GATEWAY_FEATURES` / `_DISABLE` | all | comma lists of feature names |
| `CLAURA_GATEWAY_MOUNT_TIMEOUT_MS` | `30000` | import, mount and start-up, each |
| `CLAURA_GATEWAY_CONSOLE_ORIGINS` | the two `:4317` origins | only when the console is moved to another port; loopback `http://` origins only |
| `CLAURA_GATEWAY_PACKAGES` / `_ROOTS` | `ssh`, `voice` / `integrations` | `:`-separated folders (tests use them) |
| `CLAURA_GATEWAY_SSH_OPEN_RECORDINGS` | `1` | demo mode, like `ssh/dev.mjs`: past recordings downloadable without sign-in |
| `CLAURA_GATEWAY_VOICE_PREWARM` | `1` | load Nemotron into Ollama at start-up so the first spoken answer is quick |
| `CLAURA_GATEWAY_DEBUG` | off | debug log lines |

Packages read their own variables from `ctx.env` too: `CLAURA_VOICE_MOCK=1` (no ElevenLabs), `CLAURA_VOICE_CHAR_BUDGET`,
`CLAURA_SSH_DATA` (ledger, recordings, passkeys; use a scratch folder for tests), `CLAURA_SSH_PORT_BASE`,
`CLAURA_SOLANA_AUTOFUND=0`, `OLLAMA_HOST`.

## Tests

* `npm test` (`smoke.mjs`): boots the real gateway on a free port against fixture packages in a temp folder (good, broken
  at import, broken at mount, no `ui.js`, never ready, mock) and checks the contract, isolation, the static allowlist and
  traversal, CORS and the browser guards, log scrubbing, startup refusals and shutdown. 79 checks, about 12 s.
* `npm run check:browser` (`browser-check.mjs`): its own headless Chrome opens the console page and imports the loader the
  way the console does, then checks `window.claura`, Voice across origins and a foreign origin being refused. With
  `--ssh` it runs the whole Secure Shell flow across the two origins with a virtual passkey: start the gateway with
  `CLAURA_SSH_DATA=<scratch dir>` first, never against the demo's real data. With `--say` it speaks one 15-character phrase
  through ElevenLabs. Set `CONSOLE_URL` and `GATEWAY` if the ports differ from 4317 and 8787.

## Files

| | |
|---|---|
| `server.mjs` | start-up: config, env, guards, routes, mount, listen, shutdown |
| `lib/config.mjs` · `env.mjs` · `log.mjs` | configuration · the secrets file · the scrubbing logger |
| `lib/discover.mjs` · `features.mjs` | find the packages · import, mount, isolate, status, stop |
| `lib/static.mjs` · `security.mjs` · `ports.mjs` | the `/features` allowlist · Host/Origin/CORS guards · free-port search |
| `lib/incident.mjs` | `getIncidentContext` and `getBrief` (INC-0419) |
| `client/claura-features.js` | the loader the console imports |
| `smoke.mjs` · `browser-check.mjs` | the two tests |

## Known issues in the packages it mounts

* `ssh/server.mjs`: passing `ctx.server` to `mount()` throws "Cannot access 'handle' before initialization" (`attach()` returns
  `handle` before `const handle` is initialised). The gateway does not pass it and calls `handle.attach(server)` after the mount.
* `voice/package.json` has `dev`, `smoke` and `warm` scripts for files that do not exist (`dev.mjs`, `smoke.mjs`, `scripts/warm.mjs`).
* Fixed in `voice/` while wiring it in: audio clips could not be sent with the default cache folder `~/.cache/claura/voice`
  (`dotfiles: 'deny'` rejected the `.cache` path, so every `/tts`, `/brief` and `/sting` answered 500), and `ui.js` used a
  path-only API base, which pointed at the console instead of the gateway when imported from another origin.
