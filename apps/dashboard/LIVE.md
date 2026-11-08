# Live mode: the console on SpacetimeDB

The console has two data sources behind one seam (`src/data/source.ts`).

| | Scripted replay (default) | Live (`?live=1`) |
|---|---|---|
| Data | a fictional incident replayed on a script clock | the SpacetimeDB module **claura**: Maincloud by default, or the local appliance |
| Who you are | the demo's people (`?as=JT` ...) | the operator your browser enrolled as (break-glass code) |
| Used for | the film, `?demo=1`, offline demos | the real incident: agents, approvals, War Room, scope, report |
| Indicator | isolation popover says **Replay** | isolation popover says **Live · SpacetimeDB Maincloud** (or **Live · local appliance**); the dot on the Isolated button is the link light (green live, amber connecting, red offline) |

Scripted mode is untouched: `tools/regress.mjs` dumps the rendered DOM of every view at 18 script moments (146 dumps), and before/after the live work
the only difference is the new **Anchor evidence on Solana devnet** button in Reports (plus the new Integrations page).

## URLs and parameters

| URL | Result |
|---|---|
| `http://127.0.0.1:4317/` | scripted replay (dev dock visible) |
| `/?demo=1` | scripted replay for recording; always wins, even with `live=1` |
| `/?live=1` (or `?source=live`) | live, Maincloud, database `claura` |
| `/?live=1&stdb=local` | live, local appliance `ws://127.0.0.1:3000` |
| `/?live=1&stdb=maincloud` | live, Maincloud (the default, spelled out) |
| `/?live=1&db=<name>` | another database name on that server |
| `/?gateway=http://127.0.0.1:8787` | where the optional feature gateway is (loopback only) |

`?stdb=` accepts `local`, `maincloud`, a loopback address, or a `wss://*.spacetimedb.com` address. Anything else is ignored with a console
warning: a crafted link must never be able to send a person's code or token to a server of someone else's choosing. A different server needs
a build-time env: `VITE_CLAURA_STDB_URI`, `VITE_CLAURA_STDB_DB`, `VITE_CLAURA_GATEWAY`.
`view`, `expand`, `channel`, `pop`, `host` work in live mode too; `phase`, `t`, `play`, `as`, `sheet` are replay-only.

`window.claura` in live mode (for recorders and tests): `claura.live` (`server`, `link`, `access`, `identity`, `applied`, `state()`, `enroll(code, name)`,
`approve()`, `watch(fn)`, `forgetIdentity()`, `dropConnection()`), `claura.features`, `claura.useSource('live' | 'scripted')`, and the usual
`claura.data` (the active source: `incident()`, `proposals()`, `messages(ch)` ...).

## How to enroll (break-glass)

Every table is private. The console reads role-gated views, and a browser that is not an enrolled operator connects fine and receives **zero rows**.
That is the first screen you see: **Enter break-glass code**.

1. An admin makes a single-use code and hands it over in person:
   - from the CLI (as the database owner): `cd /Users/abd/repos/claura-backend && scripts/access.sh code commander "Riya Kapoor"` prints ONE code
     (roles: `admin | commander | legal | exec | comms | vendor | responder`; use `--local` for the appliance), or
   - from the console, signed in as an admin: **People & Access > Add person > Issue break-glass code** (a QR and a printable card are offered;
     the code is shown only after the module accepted it).
2. Type it into the sheet. Dashes and case are forgiven (`CLA-XXXX-...` from the CLI, `XXXXXX-XXXXXX-XXXXXX` from the console). If the code carries a
   name hint (the admin typed one) that name wins; otherwise the sheet asks for yours. The module consumes the code (`enroll(code, name)`).
3. The module stores this browser's identity as an operator. Rows start arriving at once; no reload.

Your identity is the SpacetimeDB token, kept in `localStorage` under `claura.token:<server>/<db>`, so Maincloud and the appliance never share one.
It is a bearer credential: whoever holds that browser profile is that operator. Reloading keeps you signed in; "Use the replay instead" or clearing
site data leaves. In a private window storage is blocked and the sheet says you will need a code again after a reload.
When an admin revokes you, your screen empties live (about 100 ms) and the sheet comes back as **Access removed**.

Names are unique among active operators and the agents' names (`warden`, `scribe`, ...) are reserved.
The seeded console code for Riya Kapoor is `CLAURA_CONSOLE_CODE` in `~/.config/claura/.env`; it works once.

## Run an incident against it

```bash
# terminal 1: the console
cd /Users/abd/repos/bulkhead && unset NODE_USE_SYSTEM_CA; npm run dev        # then open http://127.0.0.1:4317/?live=1
# terminal 2: enroll (above), then run the agents
cd /Users/abd/repos/claura-backend
scripts/live.sh                       # resets the DB as owner, then real NVIDIA Nemotron (local Ollama) runs the incident, about 38 s to contained
scripts/live.sh --scripted            # backup: no model, same reducers
scripts/live.sh --approval-timeout 300
scripts/access.sh reset               # back to the quiet room (operators and codes are kept)
```

The console follows along: the incident opens, Sentry, Triage and Warden talk in their lines, containment steps tick off as the **policy gate**
executes them, the labelled red-team `reimage_host` probe appears as a **Blocked by policy** row, and when Warden proposes `quarantine_host` the
**approval sheet** opens on every commander and admin console. Approve with the button or Cmd+Enter: the console calls `approve(proposal_id)` and the
module records the approver from the caller's identity (never from an argument). Scribe's brief, report and handoff land at the end.

### Local appliance

```bash
cd /Users/abd/repos/claura-backend
scripts/appliance.sh                  # starts SpacetimeDB on 127.0.0.1:3000 if needed, publishes "claura", issues codes into local.env  (--wipe destroys the local DB first)
# console: http://127.0.0.1:4317/?live=1&stdb=local
scripts/access.sh --local code commander "Riya Kapoor"
scripts/live.sh --local
```
Nothing leaves the machine. Standalone SpacetimeDB speaks plain `ws://`, which is why `?stdb=local` only accepts loopback.

## What each view reads, and what each action calls

| Console | Reads (role-gated views) |
|---|---|
| Incident, Overview | newest `incident` (status drives the phase: `open` Breach, `awaiting_approval` Needs approval, `contained` Contained; `nist_phase` drives the phase rail), `proposal` (+ `policy`), `agent_state`, `finding`, `incident_event`, `guest_vm`/`host` |
| Containment card | `proposal` by action: the six reversible steps, `quarantine_host` as the human gate, every blocked proposal as its own row |
| Approval sheet | the pending `quarantine_host` proposal; scope from `guest_vm`, rollback from `policy.reversible`, evidence from the signals |
| Agents | `agent_state` (line, status, model label), `finding` (reasoning), proposals/findings/report (tool calls) |
| War Room | `message` per channel, `task`, `decision`, `brief`, `stakeholder`, `operator` |
| Data scope | `data_asset` (like the replay, it fills in when the incident opens) |
| Reports | `incident` + `incident_event` + `proposal` + `decision` + `data_asset` + `report` (Scribe's summary); the digests are computed in the browser |
| People & Access | `operator`, `enrollment` (admin only), `stakeholder` |
| Policy | `policy`, read-only mirror (changing policy is `set_policy`) |

| Action | Reducer |
|---|---|
| Approve quarantine (button, Cmd+Enter) | `approve` |
| War Room composer | `post_message` |
| Task chip | `set_task_status` |
| Data scope status chips + note | `set_asset_status` |
| Add person / Issue code | `issue_enrollment` |
| Cancel a pending code | `revoke_enrollment` |
| Revoke a person (two clicks) | `revoke_operator` |
| Join sheet | `enroll` |

The module checks the caller's role on every reducer; the console only answers early, in plain words, when it already knows (a responder cannot post
in `#legal`, a non-commander cannot approve). A refusal arrives as a toast with the module's own message.

## How the incident UI follows rows

The film is a function of a script clock (`S.started`, `S.r`, `S.A`). Live mode drives that same clock from the rows (`src/live-engine.ts`): the incident
exists -> started; each containment proposal the gate executed moves the clock to where the film shows that step done; the pending quarantine holds it at
the approval gate; the approval starts the post-approval clock. So the 2D map, the 3D stage, the attack path and the approval sheet need no changes,
and a console that opens after the fact (or reloads) jumps straight to the end state instead of replaying it. The text (steps, agents, signals, blast
radius, times) always comes from the rows.

## Choices worth knowing

- **Time to contain** is agent time: first signal to contained, minus the time the incident waited for a person (the clock holds at "holding for approval").
  The Reports chip says how long it waited.
- **Presence**: the module has no presence table. A person shows as online if this is their console, or they posted or acted in the last 5 minutes.
- **Break-glass codes** have no expiry in the module: a code works once and stays valid until used or voided. The live wording says so (the replay's
  "expires in 24 h" is part of the fiction).
- **Evidence**: the module keeps no evidence files. The console lists what it can prove: the capture record and the incident log, each with a SHA-256
  computed in the browser, labelled as such ("simulated: the digest covers the audit record"). Nothing claims a memory image exists.
- **Fiction is hidden in live**: the scripted history (INC-0418 ...), the "last incident" row and the dev dock are not shown. The fleet numbers
  (2,048 hosts ...) stay illustrative, as everywhere.
- **Honest labels**: the Agents tag shows the model the rows say (`nemotron-3-nano · on-prem`, `scripted (no model)`, or the fallback text). The red-team
  probe is shown as "scripted by the runner, not chosen by the model".
- **Scope groups**: assets on corporate IT (FIN-02, billing) are the parallel event; the rest belong to the data center.

## Integrations and Solana anchoring

`src/features.ts` loads optional modules from a gateway at `http://127.0.0.1:8787` (override `?gateway=`, loopback only): `GET /api/health` lists
`{ name, title, track, status: live | mock | down, ui }`, then `GET /client/claura-features.js` (default export `load({ base })`) imports each feature's
`ui.js`, which attaches to `window.claura` without overwriting keys: `openShell(hostId)`, `voice`, `integrations[name] = { title, track, status, open(container) }`,
`anchor(hash, label)`. Each step has an 800 ms timeout, nothing is awaited by the rest of the console, the page polls every 8 s, and every failure ends in the
**Integrations** page's empty state ("Gateway not reachable"). **Open** calls the feature's `open(container)` into the card's panel.

**Reports > Anchor evidence on Solana devnet** calls `window.claura.anchor(sha256, 'INC-0419')` (the live incident's label in live mode). The SHA-256 is over one
canonical JSON bundle of the record (incident, log, actions, decisions, scope, evidence hashes), so anyone holding the same record can recompute it. The
result shows the signature and an explorer link (https only). Without the module the button stays, with a quiet "Anchor module not loaded" tooltip.
`tools/mock-gateway.mjs` is a stand-in that speaks the contract (port 8791) for testing this without the real gateway.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "That code is not valid, or it was already used" | codes are single use and case-sensitive text; it may be voided. Ask for a new one. Name taken: "the name 'X' is already in use" |
| "Cannot reach the server" | the console retries by itself (1, 2, 4, 8, 15 s) with the same identity. `?stdb=local` for the appliance; "Use the replay instead" for the film |
| Connected, signed in, nothing on screen | the room is quiet (reset). Run `scripts/live.sh`. A vendor only sees `#vendors`; legal/exec/comms see the plain-language layer |
| "Access removed" | an admin revoked this device. New code, same sheet |
| Approve button is off | only a commander or admin can approve; the sheet says who you are |
| Asks for a code after every reload | storage is blocked (private window) |
| Integrations says "Gateway not reachable" | the gateway is not running on 8787; the console works without it |

## Tests (all real, no mocks, except the gateway stand-in)

```bash
node tools/regress.mjs --out /tmp/before   # ... change code ... then --out /tmp/after && diff -r /tmp/before /tmp/after   (scripted DOM regression)
node tools/live-proof.mjs [--consoles 2] [--scripted] [--local] [--out shots] [--tour]   # mints codes, runs the incident, two Chrome profiles, shots/live-*.png
node tools/live-admin-proof.mjs            # admin: issue code from the sheet, enroll with it, void a code, revoke and watch that device empty
node tools/live-local-check.mjs            # local appliance without the agent runner (the owner plays the agents through the module's reducers)
node tools/features-proof.mjs              # loader, Integrations page, anchor button, gateway down/up/down
```
`live-proof` and `live-admin-proof` mint codes with `access.sh`, hold them in memory only (never printed or written), revoke their test operators and
`reset_demo` as the owner when they finish. Only run them against a database you are free to reset.

## Regenerating the bindings

`src/module_bindings` is a copy of `claura-backend/bindings/ts` and needs `spacetimedb@2.14.1` (exact, matching the generator).
After a module change: `spacetime generate --lang typescript -y --module-path <repo>/spacetime/spacetimedb --out-dir <repo>/bindings/ts`, then
`cp -R <repo>/bindings/ts/. src/module_bindings/` and `npm run build`.

## Last verified (2026-11-08)

`node tools/live-proof.mjs --consoles 2` on Maincloud with real Nemotron (`shots/live-*.png`, numbers in `shots/live-run.json`): two Chrome profiles enrolled with
fresh codes; both saw the same 31 log entries, 8 proposals, 19 messages, 4 tasks, 3 decisions and 7 assets row for row; an approval clicked in console A reached A and B
within about 335 ms; a scope status set in A reached B in about 100 ms; a War Room message typed in B reached A in about 335 ms; commit-to-screen latency
for the log entries was a median of 22 ms; B's dropped socket reconnected by itself in about 0.9 s with the same identity and caught up; A reloaded without a code
into the contained state; and the owner's `reset_demo` sent both consoles back to the quiet room. `live-admin-proof` (issue, enroll, void, revoke: the revoked device
emptied 103 ms later), `live-local-check` (local appliance) and `features-proof` (loader, Integrations, anchor) pass too.
