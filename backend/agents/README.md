# Claura agent runner

Node 24 + TypeScript (`tsx`) program in which **NVIDIA Nemotron 3 Nano 4B**, served locally by
Ollama (`nemotron-3-nano:4b`, no cloud), drives four tool-using defender agents against the
`claura` SpacetimeDB module (Maincloud, or a local appliance):

| agent | job | tools it can call | done when (checked in the backend, never taken from the model) |
|---|---|---|---|
| **Sentry** | detect | `list_recent_signals`, `open_incident` | an uncontained incident exists |
| **Triage** | blast radius + scope | `get_host_inventory`, `check_reachability`, `record_finding`, `record_scope` | an `attack_graph` finding exists AND `Workload tokens` is `exfil_suspected` AND `Tenant model weights` is at least `accessed` |
| **Warden** | contain | `get_policy`, `propose_action` | all 7 playbook steps have been ruled on by the policy gate |
| **Scribe** | forensics + comms | `list_events`, `set_brief`, `file_report`, `post_handoff` | the final brief, the report and the shift handoff are published |

The model never touches the database directly. Every effect goes through a reducer, `propose_action` is decided by the
**policy table in the module, not by the model**, and the runner itself is a **low-privilege operator**: role `agent`.

## Signing in (the module trusts nobody by default)

The runner is an enrolled operator with role `agent`. It cannot approve, reset, set policy or add anyone.

1. **First connect.** It connects, sees it is not an operator, and calls `enroll(CLAURA_AGENT_CODE, "Claura agent runner")`
   with the one-time code an admin gave it out-of-band. The code is consumed.
2. **Every later run** signs in as the same identity: the token is kept in `~/.config/claura/agent-token`
   (mode 0600, one JSON file keyed by `server|db|slot`, so Maincloud and the local appliance never mix). The token is a
   bearer credential and is never printed.
3. **Not enrolled / revoked?** The runner stops with the exact fix (which env var, or the full identity for `add_operator`).

Settings come from the process environment first, then an env file (only `CLAURA_*` keys are read; values are never printed):

| variable | meaning |
|---|---|
| `CLAURA_STDB_URI` / `CLAURA_STDB_DB` | backend (default `ws://127.0.0.1:3000` / `claura`) |
| `CLAURA_AGENT_CODE` | one-time code for the runner (role `agent`), used only on first connect |
| `CLAURA_APPROVER_CODE` | one-time code for the labelled test-harness approver, only for `--auto-approve-after` |
| `CLAURA_TOKEN_FILE` | token file (default `~/.config/claura/agent-token`) |
| `CLAURA_ENV_FILE` | env file (default `~/.config/claura/.env`, the Maincloud profile; `--local` reads `~/.config/claura/local.env`) |

## Run it

```bash
cd /Users/abd/repos/claura-backend
scripts/live.sh                           # Maincloud: reset (as the DB owner), then the incident; a commander approves in the dashboard
scripts/live.sh --auto-approve-after 3    # ... approved after 3 s by the labelled TEST HARNESS identity instead
scripts/live.sh --scripted                # NO model: canned text, same reducer sequence (backup)
scripts/live.sh --local ...               # the isolated appliance (see ../DEMO.md)
```

`scripts/live.sh` resets the database **as the CLI identity (the Owner admin)** and then runs `npm run demo`, because
the runner cannot reset. Run the runner alone when the database is already fresh:

```bash
cd agents && unset NODE_USE_SYSTEM_CA && npm install   # first time only
npm run demo -- [options]
npm run demo -- --mem --scripted                       # no model AND no SpacetimeDB (in-process mirror)
npm run typecheck && npm test                          # 65 unit tests, no Ollama / SpacetimeDB needed
npx tsx test/module.live.ts                            # 137 live access-control checks, LOCAL db only (ends with reset_demo)
npm run test:loop                                      # LIVE: real Nemotron + stub tools (needs Ollama)
```

If the database is not fresh (a host is not `healthy`, an incident or signals exist) the runner refuses and prints the
`spacetime call ... reset_demo` command instead of running a confusing half-demo.

Flags (`npm run demo -- --help`): `--scripted`, `--auto-approve-after N`, `--approval-timeout S` (default: wait forever),
`--red-team auto|off`, `--local`, `--env-file PATH`, `--uri`, `--db`, `--reset` (only works for an admin identity), `--mem`,
`--telemetry-speed X`, `--pace-ms N` (pause between steps in `--scripted`, default 450), `--llm-timeout S`, `-v`.
Env: `OLLAMA_URL`, `OLLAMA_MODEL`. Exit code: `0` contained and report filed, `1` run failed or no report, `2` not contained.

### Approval, and the second identity

`quarantine_host` needs a commander or admin. In the live demo that is a human in the dashboard. For tests,
`--auto-approve-after N` uses a **second, separately enrolled identity named `TEST HARNESS (auto-approve)`**
(role `commander`, token slot `approver`, code in `CLAURA_APPROVER_CODE`). It is opened only when the flag is given and
only for `approve`. Every approval it makes reads "approved by TEST HARNESS (auto-approve)" in the decision, the audit log
and the war room, so nobody can mistake it for a person. If a human approves first, theirs wins.

## What a run does

```
(reset by the owner) -> sign in -> telemetry replay (6 signals) -> Sentry -> Triage -> Warden (+red-team)
   -> [approval request] -> wait for approve(quarantine_host) -> Scribe -> timeline
```

1. The six fixture signals go through `ingest_signal` on a 0 to 0.85 s schedule (VMM ioctl, vGPU mdev fault, IOMMU DMA
   fault, qemu spawned /bin/sh, flow to 10.0.0.1:623, token outside scope; host `b14-gpu-07`, vm `vm-7f3a`).
2. **Sentry** lists the signals and opens the incident. The module starts it in NIST phase `detection_analysis`, adopts the
   7-asset scope inventory and seeds 3 tasks, 2 decisions and a first brief. Sentry speaks in `#command`; Scribe writes an
   interim brief from a template.
3. **Triage** inventories the host, probes reachability (fixture), records the `attack_graph` finding with the `blast_score`,
   and **scopes the data**: `Workload tokens` -> `exfil_suspected`, `Tenant model weights` -> `accessed` (`record_scope`).
   It cannot confirm exfiltration (the tool's status enum stops at `exfil_suspected`), cannot touch the corporate assets
   (FIN-02, billing DB), and never overwrites a human's ruling. The runner then writes the NIST classification
   (rule-based from the scope board and the fleet, not a model claim).
4. The runner moves the NIST phase to `containment`. **Warden** works the playbook, one `propose_action` per step, reversible
   first, then `quarantine_host` (policy: approval). As effects run, the gate updates the scope board (memory image and
   weights `evidence_preserved`, tokens noted revoked, tenant volumes noted failed over).
5. Warden reports in `#command`, the labelled red-team probe is blocked (`reimage_host`), the approval request is posted, the
   interim brief says one step needs a person, and the commander gets an open task.
6. A commander approves (the module writes the decision and closes the task). The incident is `contained`; the runner
   updates the classification and moves the phase to `post_incident`.
7. **Scribe** reads the event log and publishes, with the model: the **plain-language brief** (what happened / what we know /
   what we do not know yet), the **forensic report**, and the **shift handoff** (posted to `#command` as `SHIFT HANDOFF`).
   The brief is then routed to `#exec`, `#legal` (with the scope board) and `#comms-pr`.
8. A timeline with measured times, how each agent got its work done (`model`, `model+fallback`, `fallback`, `scripted`),
   the proposals, the NIST fields, the scope board and the war-room counts are printed.

Every agent keeps `agent_state` current (status, live thought, model). `model` is `nemotron-3-nano:4b (local, on-prem)` while the
model works, `template text (no model)` while Scribe writes an interim brief, and honestly `scripted (no model)` or
`deterministic fallback (no model output used)` otherwise. Agents speak with `post_agent_message` as `sentry`, `triage`,
`warden` or `scribe` (the module lets only the agent role do that).

## Guardrails

All in `src/toolLoop.ts`, `src/tools.ts` and `src/room.ts`; none rely on the model behaving:

- **Step limits**: `maxSteps` and `maxToolCalls` per agent, an overall deadline per agent, a per-call model timeout.
- **JSON argument validation** (`src/schema.ts`): unknown tool, bad JSON, missing/mistyped/out-of-range fields, enums. Safe
  coercions: `"0.87"` to `0.87`, enum case, a list where a multi-line string is wanted. The error names the field.
- **Retry once on malformed calls**, then abort to the fallback. **Stall detection**: an identical repeated call is not re-run.
- **State-aware nudges**: when the model stops early, the nudge names the exact missing step (not a generic "continue").
- **Completion is judged by backend state** (`isDone`, table above), never by what the model says.
- **Tool enums constrain the model**: Triage can scope only 3 assets and only up to `exfil_suspected`; a status a human set is never overwritten.
- **Claims are checked against the scope board.** `set_brief`, `file_report` and `post_handoff` pass every text through a guard: a
  sentence that says "no data was exfiltrated / accessed", "data assets intact" or "no sign of access" while the scope board shows an asset
  `accessed`, `exfil_suspected` or `locked` is **replaced** by "We have not confirmed whether any data was read." (once per text), a
  `GUARD:` line is logged and the tool result tells the model. It can only make a text more cautious. Observed live: the first Nemotron brief
  claimed "no data has been exfiltrated", and a handoff said "data assets intact"; rejecting those made the small model resend the same text
  until the loop gave up, so the guard rewrites instead. "No exfiltration has been *confirmed*" passes untouched.
- **Jargon is replaced, not rejected**: in the brief, IOMMU/vGPU/BMC/IPMI/DMA/qemu become plain words (a small model tends to
  resend a rejected text unchanged, which stalled the loop in a live run).
- **Deterministic fallback per agent** (`deterministic()` in each `src/agents/*.ts`). Idempotent, only does what is still
  missing or too weak, runs when the loop ends in `max_steps`, `malformed`, `llm_error`, `deadline`, `stalled`, `no_tool_calls`, or when
  Ollama is unreachable. Every use prints `FALLBACK:` with the reason, flips `agent_state.model`, and shows in the summary.

## Policy blocking the model: honest status

The demo wants to show the gate refusing an aggressive action. **Nemotron 3 Nano 4B never chose one on its own** (checked with
four Warden prompt variants; it proposes exactly the 7 playbook steps and stops). So the runner ships an explicit, labelled
**RED-TEAM PROBE** (`runRedTeamProbe` in `src/agents/warden.ts`): one `propose_action(reimage_host)` after Warden finishes. It
is labelled in the code, the console, the proposal's `reason` (`[RED-TEAM PROBE - scripted by the runner, not model-chosen]`),
the `#command` message and the final summary. If the model ever proposes a denied action itself, the probe is skipped and the
summary says so (covered by a test). `--red-team off` disables it.

What is model-written and what is not: the **model** chooses tools and arguments, writes Triage's attack graph and scope notes,
Warden's reasons, the brief, the report and the handoff. The **runner** (not the model) writes the NIST classification, the
one-line status messages in `#command`, the interim briefs and the red-team probe. The Scribe prompt contains a tone example for the brief and
Nemotron mostly reuses it (it is accurate for this scenario).

## Backend integration

- `src/db.ts` is the **only** file that imports the SDK and the generated bindings. Everything else uses the plain `ClauraDb`
  interface in `src/types.ts`. It also owns sign-in, enrollment, token persistence and the lazily opened approver identity.
- `src/module_bindings/` is generated (`../bindings/ts` is the clean copy for the dashboard):
  ```bash
  /Users/abd/.local/bin/spacetime generate --lang typescript --import-extension ts -y \
    --module-path /Users/abd/repos/claura-backend/spacetime/spacetimedb \
    --out-dir /Users/abd/repos/claura-backend/agents/src/module_bindings
  ```
- One subscription (`subscribeToAllTables`); reads come from the local replica. The client reads **views** (the module's tables are
  private); an approval made through the second identity travels on another connection, so the runner waits for its own replica
  to show it before looking again.
- Things the runner relies on: the incident id comes from the newest `incident` row; `contained_at` is `Option<Timestamp>`; events
  are ordered by `id`; auto-increment ids are **not** reset by `reset_demo`; `propose_action` normalises action names and rejects a bad
  host/vm target as `blocked` with the policy mode still `auto` (the runner tells that apart from a `deny`).
- `src/memdb.ts` is an in-process mirror of the contract (including scope effects) so the unit tests and `--mem` run the whole
  pipeline with no server. It is not the production module.

## Ollama

`src/ollama.ts` calls `POST /api/chat` with tools, `"think": false`, `temperature 0`, a fixed seed, `num_ctx 8192`,
`num_predict 900`, `keep_alive 30m`. Startup runs a preflight (is the model installed, one warm-up turn). No other model is used.

## Measured on this machine (M-series Mac, MLX runner), against Maincloud

Real model, Maincloud database `claura` over `wss://maincloud.spacetimedb.com`, `--auto-approve-after 3`, the final code. In both live runs all four
agents were completed by the model with no fallback. Logs: `../runs/maincloud-live.log`, `../runs/maincloud-live-2.log`,
`../runs/maincloud-scripted.log` (each with a `.db-state.txt` of the database afterwards, read with `spacetime sql` against Maincloud).

| | live run 1 | live run 2 | scripted (`--pace-ms 450`) |
|---|---|---|---|
| first signal to incident open | 4.62 s | 4.65 s | 1.44 s |
| first signal to pending approval (the approval card) | 33.61 s | 33.76 s | 9.67 s |
| first signal to contained | 38.05 s | 38.05 s | 16.11 s |
| approval request to approval (3 s auto-approve, plus the red-team probe and posts that run meanwhile) | 4.29 s | 4.19 s | 6.35 s |
| machine time without that wait | 33.76 s | 33.86 s | 9.76 s |
| server clock: incident opened_at to contained_at | 33.24 s | 33.26 s | 14.60 s |
| contained to report filed | 16.39 s | 15.92 s | 1.55 s |
| contained to brief + report + handoff all published | 20.10 s | 19.21 s | 2.09 s |
| model time Sentry / Triage / Warden / Scribe | 3.5 / 10.1 / 16.6 / 19.4 s | 3.6 / 10.2 / 17.2 / 17.9 s | none |

The cost is the model: about 2.1 s per Warden turn (one `propose_action` per turn, 8 turns) and Scribe's three long texts (brief, report, handoff).
Maincloud adds little: a reducer round trip is **44 ms median** (42 to 120 ms over 25 calls) and connecting, subscribing and signing in takes
about 0.45 s. Against a local server the same run reaches the approval card in about 31 s and `contained` in about 34 s. A human who approves from the
dashboard adds their own reaction time. Before this version one other run had Scribe fall back because the model resent a rejected text; the
claim guard now rewrites instead of rejecting, and it did not recur in the two live runs logged above (two runs is not a statistic: Nemotron 4B stays non-deterministic, and the fallback is there for that).

Model behaviour worth knowing: it follows the playbook order every time; it sometimes writes a Scribe text as chat instead of calling the tool (handled by
the salvage); it can be terse and needs the explicit validation message to expand (handled by the retry); asked to scope assets it picked wrong
assets or statuses until the tool enum, the exact-call instruction and the fallback correction were added.

## Tests

- `npm test` (65, about 2 s, no Ollama or SpacetimeDB): schema validation; the tool loop with a scripted fake model; the gate semantics in
  `MemClauraDb`; the war room (scope tool rules, brief coercion, interim briefs, NIST classification, the claim and jargon guards, the facts
  block); configuration (env file never overrides, only `CLAURA_*` keys, `--local` is authoritative, token file is 0600); and end-to-end
  runs of the orchestrator with fakes: scripted, no model reachable, a model that does everything right, one that proposes a denied action,
  garbage output (all four agents fall back), partial progress then crash, a hallucinated host/target, a model that scopes the wrong assets
  (fallback corrects it), human approval while the runner waits, approval timeout.
- `npx tsx test/module.live.ts`: 137 checks of the module's access control against a live server (see `../spacetime/README.md`).
- `npm run test:loop`: the real model with stub tools.

## Layout

```
src/main.ts, demo.ts      CLI, orchestration, timeline + summary
src/agents/               sentry / triage / warden / scribe + common.ts (model -> fallback -> scripted)
src/room.ts               war room helpers: say(), interim briefs, NIST classification, claim/jargon guards, facts block
src/toolLoop.ts           the guarded multi-step loop
src/tools.ts              the tools (incident ids are bound here, the model never carries them)
src/ollama.ts, schema.ts  Ollama client, argument validation
src/db.ts, tokens.ts      the ONLY SDK-facing file (sign-in, enrollment); token persistence
src/config.ts             flags, env profiles
src/memdb.ts              in-process contract mirror
src/fixtures.ts           telemetry + reachability fixtures
src/module_bindings/      generated by `spacetime generate`
test/                     unit tests (*.test.ts), module.live.ts (access control), ollama-loop.live.ts
```

## Known limitations

- Sentry runs after the telemetry replay finishes (all 6 signals present), not on the first signal.
- The approver identity exists only for tests. If its code is used up, `--auto-approve-after` stops with the command that issues a new one
  (`scripts/access.sh code commander "TEST HARNESS (auto-approve)"`).
- `spacetimedb` 2.14.1 wants Node `^24.22.1`; this Mac has 24.19.0, which only warns (`EBADENGINE`). The SDK prints one `INFO Connecting` line.
