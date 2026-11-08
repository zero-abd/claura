# Claura SpacetimeDB module

Server module for **Claura** (claura.tech), agentic incident response for AI data centers.
"Seal the breach before it spreads." Four agents (Sentry detects, Triage sizes the blast radius,
Warden contains, Scribe writes the forensics) and the operator console share one database.
Agents write only through reducers; every console subscribes to the public tables.

- Module name (local): `claura`
- Source: `spacetimedb/src/index.ts` (TypeScript, SpacetimeDB 2.14)
- All tables are public. Everything on the wire is snake_case.

## Run it (local server only)

The `spacetime` CLI on this machine defaults to **maincloud** and is logged in. Always pass
`--server local`. `spacetime.json` in this folder pins `"server": "local"` as a second guard.

```bash
S=/Users/abd/.local/bin/spacetime
cd /Users/abd/repos/claura-backend/spacetime

unset NODE_USE_SYSTEM_CA
(cd spacetimedb && npm install)                  # first time only
$S start &                                       # local server on 127.0.0.1:3000
$S build                                         # compile the module
$S publish --server local claura --yes           # add -c / --delete-data=always to wipe on schema change
$S call --server local claura reset_demo         # wipe + reseed (a fresh publish is already seeded via init)
$S sql  --server local claura "SELECT * FROM policy"
$S logs --server local claura                    # module logs

# client bindings for the agents
$S generate --lang typescript \
  --out-dir /Users/abd/repos/claura-backend/agents/src/module_bindings \
  --module-path /Users/abd/repos/claura-backend/spacetime/spacetimedb --yes
```

Stop the server by killing the `spacetime start` process. Data lives in the server's data dir, so
`spacetime server clear` (or `publish -c`) is the hard reset.

## Tables

| table | columns | notes |
|---|---|---|
| `host` | `host` pk, `hall`, `rack`, `status` | status: `healthy` / `suspect` / `cordoned` / `quarantined` |
| `guest_vm` | `vm` pk, `host`, `workload`, `status`, `moved_to` | status: `running` / `paused` / `failed_over`. `host` is never rewritten; after failover `moved_to` holds the destination (`''` before) |
| `signal` | `id` u64 auto pk, `at`, `source`, `message`, `host`, `vm` | raw telemetry |
| `incident` | `id` u64 auto pk, `title`, `severity`, `host`, `vm`, `status`, `opened_at`, `contained_at`, `blast_score` f64 | status: `open` / `awaiting_approval` / `contained`. **`contained_at` is an Option<Timestamp>** (none until contained; `undefined` on TS clients), not a 0 sentinel |
| `agent_state` | `agent` pk, `status`, `thought`, `model`, `updated_at` | agent: `sentry` / `triage` / `warden` / `scribe` |
| `finding` | `id` u64 auto pk, `incident_id`, `agent`, `kind`, `text`, `at` | |
| `policy` | `action` pk, `mode`, `reversible`, `note` | mode: `auto` / `approval` / `deny` |
| `proposal` | `id` u64 auto pk, `incident_id`, `agent`, `action`, `target`, `reason`, `status`, `policy_mode`, `at`, `decided_by` | status: `executed` / `pending_approval` / `approved` / `blocked`. `decided_by`: `policy` for auto and blocked, `''` while pending, operator name once approved |
| `incident_event` | `id` u64 auto pk, `incident_id`, `at`, `kind`, `actor`, `text` | the live "ship's log". kind: `signal` / `incident` / `finding` / `action` / `blocked` / `approval_requested` / `approval` / `state` / `report`. **`incident_id = 0` means not tied to an incident** (a signal before any incident exists, reset and policy-change notices) |
| `report` | `incident_id` pk, `summary`, `filed_at` | one per incident, upserted |

## Reducers

Reducers return nothing; read results from subscriptions. To learn the id of an incident you just
opened, read the newest `incident` row.

| reducer | args | behaviour |
|---|---|---|
| `reset_demo` | none | Wipes every table and reseeds. 13 hosts across Halls A to D (`b14-gpu-07` is Hall B rack 14), 12 guests on `b14-gpu-07` (`vm-7f3a` running `agent-7f3` plus 11 co-resident tenants), clean failover targets `c05-gpu-02` and `c12-gpu-04` (the only Hall C hosts), four idle `agent_state` rows, and the policy table below. Also runs from `init`, so a fresh publish is already seeded. |
| `ingest_signal` | `source, message, host, vm` | Inserts a `signal`. Logs a `signal` event attached to the newest uncontained incident on the same host/vm, else `incident_id = 0`. |
| `open_incident` | `title, severity, host, vm` | Inserts an incident (`open`, `blast_score` 0, `contained_at` none). A `healthy` host becomes `suspect`. Logs an `incident` event with actor `sentry`. |
| `set_agent_state` | `agent, status, thought, model` | Upserts the agent card. Unknown agent names are rejected. Does not write to the event log (it would drown it). |
| `record_finding` | `incident_id, agent, kind, text, blast_score` | Inserts a finding, logs a `finding` event. `blast_score < 0` (or NaN) leaves `incident.blast_score` unchanged. Unknown incident is rejected. |
| `propose_action` | `incident_id, agent, action, target, reason` | **The policy gate**, see below. |
| `approve` | `proposal_id, operator` | Only for `pending_approval`. Marks `approved`, sets `decided_by`, applies the effect, logs `approval` then `state`. `quarantine_host` sets the host `quarantined` and the incident `contained` with `contained_at = now`. Any other approved action returns the incident to `open` once nothing else is pending. |
| `set_policy` | `action, mode` | Changes (or creates, non-reversible) a policy row. `mode` must be `auto` / `approval` / `deny`. Logs a `state` event. |
| `file_report` | `incident_id, summary` | Upserts the report, logs a `report` event with actor `scribe`. |

Note on `ctx.timestamp`: every event written by one reducer call shares the same `at`. Order the log
by `id` (monotonic), not by `at` alone.

## The policy gate

`propose_action` is the only way an agent changes the world, and **the `policy` table decides, not
the model**. The agent supplies a proposal; the module looks up `policy.mode` for the (trimmed,
lower-cased) action:

| result | when | proposal.status | other effects |
|---|---|---|---|
| executed | mode `auto` | `executed` | effect applied immediately, `action` event |
| pending | mode `approval` | `pending_approval` | incident becomes `awaiting_approval`, `approval_requested` event; nothing is applied until `approve` |
| blocked | mode `deny`, **action not in the table** (fail closed), malformed mode, or a `target` that names no real host/vm | `blocked` | `blocked` event, nothing applied |

An `incident_event` is always appended. An empty `target` falls back to the incident's own
host/vm (host-level actions use the host, the rest use the vm); the resolved target is what gets
stored.

Default policy (seeded by `reset_demo`):

| action | mode | reversible | effect when it runs |
|---|---|---|---|
| `isolate_network` | auto | yes | event only |
| `revoke_credentials` | auto | yes | event only |
| `cordon_host` | auto | yes | host `cordoned` (never downgrades a quarantined host) |
| `pause_guest` | auto | yes | guest `paused` |
| `capture_memory` | auto | no | event only |
| `failover_guests` | auto | no | the running co-resident guests on the target host (everything except `incident.vm`) become `failed_over`, `moved_to` set round-robin across healthy Hall C hosts (fallback: healthy hosts in other halls) |
| `quarantine_host` | approval | no | host `quarantined` (via `approve`) |
| `reimage_host` | deny | no | blocked |
| `power_off_hall` | deny | no | blocked |
| `delete_vm` | deny | no | blocked |

Checked end to end: flipping `quarantine_host` to `auto` with `set_policy` makes the very same
proposal execute with no human; flipping `isolate_network` to `approval` parks it.

## Using it from the agents

`agents/src/module_bindings` is generated. Field and accessor names are camelCase on the TS client
and map to the snake_case wire names: `conn.db.guestVm`, `conn.db.incidentEvent`,
`row.incidentId`, `row.blastScore`, `row.containedAt`, `conn.reducers.proposeAction({ incidentId, agent, action, target, reason })`.
u64 values are `bigint`, timestamps are `Timestamp` (`.toDate()`), and no-arg reducers take `{}`.
Re-run the generate command above after any schema or reducer change.

## Verify from the CLI

```bash
call() { $S call --server local claura "$@"; }
call open_incident '"Suspected agent compromise"' '"critical"' '"b14-gpu-07"' '"vm-7f3a"'
call propose_action 1 '"warden"' '"pause_guest"' '"vm-7f3a"' '"freeze suspect"'      # executed
call propose_action 1 '"warden"' '"quarantine_host"' '"b14-gpu-07"' '"lateral movement"'  # pending_approval
call propose_action 1 '"warden"' '"reimage_host"' '"b14-gpu-07"' '"wipe"'            # blocked
call approve 2 '"abd"'     # the quarantine proposal's id on a fresh DB; then incident is contained
$S sql --server local claura "SELECT id, kind, actor, text FROM incident_event"
```

Use real ids: auto-increment ids are not reset by `reset_demo`, so after a reset the first incident
is not `1`. A negative number argument needs `--` first: `call record_finding 1 '"triage"' '"k"' '"t"' -- -1`.
The SQL endpoint is a subset: no `GROUP BY`, no `IN (...)`.

## Beyond the written contract

Small additions, all in the direction of "policy, not the model, decides":

- `approve` rejects operator names `sentry`, `triage`, `warden`, `scribe` and empty names, so an agent
  cannot approve its own proposal through the reducer.
- `propose_action` normalises the action (trim, lower-case), validates the target for
  `cordon_host`, `quarantine_host`, `failover_guests` and `pause_guest`, and records a `blocked`
  proposal instead of silently "succeeding" on a hallucinated host or vm.
- Unknown incident ids are rejected (the call errors, nothing is written).
- `init` seeds the database, so a fresh publish is usable before `reset_demo` is called.

## Open issues

- **No authentication.** Any connected identity can call any reducer, including `approve` and
  `set_policy`. Fine for a local demo; a real deployment must allow-list operator identities with
  `ctx.sender` and keep agents to `propose_action` and the reporting reducers.
- There is no `reject`/`deny` reducer for a pending proposal (not in the contract). A pending proposal
  can only be approved or left pending.
- Duplicate proposals are not de-duplicated. If Warden asks for `quarantine_host` twice, the second
  stays `pending_approval` after the first is approved.
- `blast_score` has no defined scale or upper bound; Triage and the console must agree on one.
- Auto-increment ids survive `reset_demo` (SpacetimeDB cannot reset a sequence from a module).
- Effects are simulated in the database only (network isolation, credential revocation and memory
  capture are log events); nothing touches real infrastructure.
