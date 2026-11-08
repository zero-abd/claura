# Claura agent runner

Node 24 + TypeScript (`tsx`) program in which **NVIDIA Nemotron 3 Nano 4B**, served locally by
Ollama (`nemotron-3-nano:4b`, no cloud), drives four tool-using defender agents against the
`claura` SpacetimeDB module:

| agent | job | tools it can call | done when (checked in the backend, never taken from the model) |
|---|---|---|---|
| **Sentry** | detect | `list_recent_signals`, `open_incident` | an uncontained incident exists |
| **Triage** | blast radius | `get_host_inventory`, `check_reachability`, `record_finding` | an `attack_graph` finding by triage exists (sets `blast_score`) |
| **Warden** | contain | `get_policy`, `propose_action` | all 7 playbook steps have been ruled on by the policy gate |
| **Scribe** | forensics | `list_events`, `file_report` | a `report` row exists |

The model never touches the database directly. Every effect goes through a reducer, and
`propose_action` is decided by the **policy table in the module, not by the model**.

## Run it

```bash
cd /Users/abd/repos/claura-backend/agents
unset NODE_USE_SYSTEM_CA            # house rule for every node/npm command on this Mac
npm install                         # first time only

# prerequisites: Ollama serving nemotron-3-nano:4b on :11434 (see Ollama below), and the claura
# module published on the LOCAL SpacetimeDB (127.0.0.1:3000). See ../spacetime/README.md.
npm run demo                                   # real model, waits for a human to approve quarantine
npm run demo -- --auto-approve-after 3         # approves quarantine_host as operator "RK" after 3 s
npm run demo -- --scripted                     # NO model: canned text, same reducer sequence (backup)
npm run demo -- --mem --scripted               # no model AND no SpacetimeDB (in-process mirror)

npm run typecheck
npm test                                       # 47 unit tests, no Ollama / SpacetimeDB needed
npm run test:loop                              # LIVE: real Nemotron + stub tools (needs Ollama)
```

Flags (`npm run demo -- --help`): `--scripted`, `--auto-approve-after N`, `--approval-timeout S`
(default: wait forever), `--red-team auto|off`, `--mem`, `--uri`, `--db` (or env `STDB_URI`,
`STDB_DB`; defaults `ws://127.0.0.1:3000`, `claura`), `--telemetry-speed X`, `--pace-ms N`
(pause between steps in `--scripted`, default 450), `--llm-timeout S`, `--no-reset`, `-v` (print
every model turn and tool call/result). Env: `OLLAMA_URL`, `OLLAMA_MODEL`.

Exit code: `0` contained and report filed, `1` run failed or no report, `2` not contained
(approval timed out).

## What a run does

```
reset_demo -> telemetry replay (6 signals, 0 to 0.85 s) -> Sentry -> Triage -> Warden
           -> [red-team probe] -> wait for approve(quarantine_host) -> Scribe -> timeline
```

1. `reset_demo`, then the six fixture signals go through `ingest_signal` on the 0 to 0.85 s
   schedule (VMM ioctl, vGPU mdev fault, IOMMU DMA fault, qemu spawned /bin/sh, flow to
   10.0.0.1:623, token outside scope; host `b14-gpu-07`, vm `vm-7f3a`).
2. **Sentry** lists the signals and opens the incident.
3. **Triage** inventories the host (11 co-resident guests), probes reachability (fixture: mgmt plane
   `10.0.0.1:623` reachable, not compromised) and records the attack-graph finding with a
   `blast_score` in 0.0 to 1.0.
4. **Warden** works the playbook, one `propose_action` per step, reversible first:
   `isolate_network`, `revoke_credentials`, `cordon_host`, `pause_guest`, `capture_memory`,
   `failover_guests`, then `quarantine_host` (policy: approval). It gets one extra neutral turn at
   the end so it can say it is finished, or propose anything else on its own.
5. The runner waits for `approve(proposal_id, operator)` from the dashboard (or auto-approves as
   `RK` with `--auto-approve-after N`), and sees the incident reach `contained`.
6. **Scribe** reads `incident_event` and files the report.
7. A timeline plus measured times is printed (first signal to incident open, to pending approval,
   to contained, and the machine time without the human wait), together with how each agent got
   its work done (`model`, `model+fallback`, `fallback`, `scripted`).

Every agent keeps `agent_state` current (status, live thought, model). Status vocabulary, matching
the existing dashboard prototype: Sentry `Watching` / `Correlating` / `Escalated`; Triage
`Standing by` / `Scoring` / `Scored 0.87` / `Closed`; Warden `Standing by` / `Executing` /
`Awaiting approval` / `Quarantining` / `Contained`; Scribe `Idle` / `Recording` / `Writing` /
`Filed`. `model` is `nemotron-3-nano:4b (local, on-prem)` while the model works, and honestly
`scripted (no model)` or `deterministic fallback (no model output used)` otherwise. A thought is the
model's own prose when it writes any; Nemotron mostly answers with a bare tool call, so otherwise the
tool describes the step ("isolate_network -> vm-7f3a: <the model's reason>").

## Guardrails

All in `src/toolLoop.ts`, none rely on the model behaving:

- **Step limits**: `maxSteps` (model turns) and `maxToolCalls` per agent, an overall wall-clock
  deadline per agent, and a per-call model timeout (`--llm-timeout`).
- **JSON argument validation** (`src/schema.ts`) for every call: unknown tool, bad JSON string,
  missing/mistyped/out-of-range fields. Safe coercions are applied (`"0.87"` to `0.87`, enum case),
  unknown keys are stripped. The error text names the field and the limit so the model can fix it.
- **Retry once on malformed calls**: the error goes back to the model as the tool result; if the
  retry is malformed too the loop aborts and the fallback takes over. (Observed live: Nemotron
  wrote a 21 character finding where 40 were required, was told so, and fixed it on the retry.)
- **Stall detection**: an identical repeated call is not re-executed; three in a row abort.
  `propose_action` also refuses to re-run an action already ruled on for the same target.
- **Completion is judged by backend state** (`isDone`, table above). If the model stops early it is
  nudged twice; if it answers with prose instead of calling the final tool and the prose is
  report-sized, Scribe files that text (logged as a "salvage") instead of regenerating it.
- **Domain checks inside tools**: `open_incident` rejects hosts/vms that do not exist.
- **Deterministic fallback per agent** (`deterministic()` in each `src/agents/*.ts`). It is
  idempotent and only does what is still missing, so a model that completes 3 of 7 Warden steps and
  then dies gets the remaining 4 from the fallback, with no duplicates. It runs when the loop ends in
  `max_steps`, `malformed`, `llm_error`, `deadline`, `stalled`, `no_tool_calls`, or when Ollama is not
  reachable at all. Every use prints a `FALLBACK:` line with the reason, flips `agent_state.model` to the
  fallback label, and shows up in the summary table. If the fallback itself cannot complete the work the
  run fails loudly (exit 1) rather than pretending.

## Policy blocking the model: honest status

The demo wants to show the gate refusing an aggressive action. The task allowed either the model
choosing one, or a clearly labelled red-team step. **Nemotron 3 Nano 4B never chose one.** Checked
with four Warden prompt variants: the shipped one, one that invites it to propose anything else it
thinks necessary, one telling it to decide whether the implant must be eradicated, and one asking for
short reasons plus batching. The first three were also given a neutral extra turn after the playbook.
In every case it proposed exactly the 7 playbook steps and then stopped. (When I pushed it with a "call propose_action
for the next step" nudge it did reach for `reimage_host` and `power_off_hall`, but that is
nudge-induced, so it is not counted.)

So the runner ships an explicit **RED-TEAM PROBE** (`runRedTeamProbe` in `src/agents/warden.ts`): one
`propose_action(reimage_host, <host>)` issued by the runner after Warden finishes. It is labelled in
the code, in the console (`RED-TEAM probe (scripted in the runner, NOT chosen by the model)`), in the
proposal's `reason` (`[RED-TEAM PROBE - scripted by the runner, not model-chosen] ...`) and in the final
summary (the deterministic report says so too; a model-written report may or may not mention it). If the model ever does propose a denied action on its own, the
probe is skipped and the summary says `the MODEL proposed a denied action itself` (covered by a
test). `--red-team off` disables the probe.

## Backend integration (SpacetimeDB)

- `src/db.ts` is the **only** file that imports the SDK (`spacetimedb` 2.14.1) and the generated
  bindings. Everything else uses the plain `ClauraDb` interface in `src/types.ts`, so a contract
  change means editing one file.
- `src/module_bindings/` was generated from the real module (`../spacetime/spacetimedb`, same source
  as `../spacetime/README.md`) with:
  ```bash
  /Users/abd/.local/bin/spacetime generate --lang typescript --import-extension ts -y \
    --module-path /Users/abd/repos/claura-backend/spacetime/spacetimedb \
    --out-dir /Users/abd/repos/claura-backend/agents/src/module_bindings
  ```
  Regenerate after any schema or reducer change. Without `--import-extension ts` the files import
  without extensions, which also works (tsx and the bundler resolution in `tsconfig.json`).
- The client keeps one subscription (`subscribeToAllTables`) and reads from the local replica;
  reducer promises resolve after commit, and the replica is already updated at that point.
- Things the runner relies on, all true of the real module: `incident` id is learned from the newest
  incident row; `contained_at` is `Option<Timestamp>` (also tolerates a 0 sentinel); events are
  ordered by `id`, because every event in one reducer call shares `at`; signals logged before an
  incident carry `incident_id = 0` and are included in that incident's event list; auto-increment ids
  are **not** reset by `reset_demo` (never assume `#1`); `propose_action` normalises (trim,
  lower-case) action names, and rejects a bad host/vm target for `cordon_host`, `quarantine_host`,
  `failover_guests` and `pause_guest` as `blocked` with the policy mode still `auto`. The runner tells
  that apart from a policy `deny` ("REJECTED by the gate ... propose again with a valid target") and
  does not count the step as done until it executes.
- `src/memdb.ts` is an in-process mirror of the contract and the gate (including the target check).
  It exists so the unit tests and `--mem` run the whole pipeline with no server; it is not the
  production module.

## Ollama

`src/ollama.ts` calls `POST /api/chat` with tools, `"think": false` (Nemotron otherwise spends its
budget on a reasoning trace), `temperature 0`, a fixed seed, `num_ctx 8192`, `num_predict 900` and
`keep_alive 30m` so the model stays warm. Startup runs a preflight (is the model installed, one warm-up
turn). No other model is used or pulled.

## Measured on this machine (M-series Mac, MLX runner)

Real model, real SpacetimeDB module (a copy of `../spacetime/spacetimedb` published under another
name on a private server), `--auto-approve-after 2`, two consecutive runs, all four agents completed
by the model with no fallback:

| | run 1 | run 2 |
|---|---|---|
| first signal to incident open | 4.92 s | 4.83 s |
| first signal to pending approval | 32.47 s | 31.29 s |
| first signal to contained | 35.00 s | 33.94 s |
| machine time without the 2 s approval delay | 32.48 s | 31.30 s |
| contained to report filed | 11.52 s | 9.57 s |
| model time: Sentry / Triage / Warden / Scribe | 4.1 / 7.8 / 20.1 / 11.5 s | 4.0 / 6.9 / 20.1 / 9.5 s |

The cost is the model: about 2.5 s per Warden turn (one `propose_action` per turn, 8 turns). Nemotron
never batched several calls in one turn even when told it may. `--scripted` takes 1.0 s from first
signal to contained with `--pace-ms 0` (6.4 s to pending approval with the default pacing). The
dashboard prototype's 5.5 s to the approval card is therefore a scripted number; with the real model
expect roughly 30 s to the approval card.

Model behaviour worth knowing: it follows the playbook order every time; it sometimes writes the
Scribe report as chat text instead of calling `file_report` (handled by the salvage); it can be terse
and needs the explicit validation message to expand (handled by the retry).

## Tests

- `npm test` (47, about 2 s): schema validation; the tool loop with a scripted fake model (retry,
  double-malformed abort, unknown tool, stall, limits, transient errors, final turn, salvage,
  deadline); the gate semantics in `MemClauraDb`; and end-to-end runs of the orchestrator with fakes:
  scripted mode, no model reachable, a model that does everything right, a model that proposes a
  denied action, garbage output (all four agents fall back), partial progress then crash, a
  hallucinated host, a hallucinated target, human approval while the runner waits, approval timeout.
- `npm run test:loop`: the real model with stub tools: Triage-style 3 tool chain, Sentry-style
  decision, validation plus retry with a deliberately tight bound, and an 8-step Warden chain where
  the stub gate blocks the 8th. All 4 pass.
- Also run by hand: full `npm run demo` against SpacetimeDB (real model, `--scripted`, model
  unavailable via a bad `OLLAMA_URL`, and a human approving through `spacetime call ... approve`
  from outside the runner).

## Layout

```
src/main.ts, demo.ts      CLI, orchestration, timeline + summary
src/agents/               sentry / triage / warden / scribe + common.ts (model -> fallback -> scripted)
src/toolLoop.ts           the guarded multi-step loop
src/tools.ts              the tools (incident ids are bound here, the model never carries them)
src/ollama.ts, schema.ts  Ollama client, argument validation
src/db.ts                 the ONLY SDK-facing file;  memdb.ts = in-process contract mirror
src/fixtures.ts           telemetry + reachability fixtures
src/module_bindings/      generated by `spacetime generate`
test/                     unit tests (*.test.ts) and the live Ollama test (ollama-loop.live.ts)
```

## Known limitations

- Sentry runs after the telemetry replay finishes (all 6 signals present), not on the first signal.
- `blast_score` is 0.0 to 1.0 by convention (the module stores any f64).
- Not yet run against the shared `claura` database on `127.0.0.1:3000` itself (it was not running at
  the end, and a run would wipe it with `reset_demo`); verified against a published copy of the same
  source under another name.
- `spacetimedb` 2.14.1 wants Node `^24.22.1`; this Mac has 24.19.0, which only warns (`EBADENGINE`).
  The SDK also prints one `INFO Connecting to SpacetimeDB WS...` line.
