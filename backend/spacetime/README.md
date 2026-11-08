# Claura SpacetimeDB module

Server module for **Claura** (claura.tech), agentic incident response for AI data centers.
"Seal the breach before it spreads." One database holds everything the response needs: the fleet, the
four agents' work, the **policy gate**, the **access control**, and the **war room** (messages, tasks,
decisions, a plain-language brief, the scope of the data at risk, NIST SP 800-61 documentation).

- Source: `spacetimedb/src/` (TypeScript, SpacetimeDB 2.14): `schema.ts` tables, `lib.ts` roles/effects/seeds,
  `views.ts` gated reads, `index.ts` init + reducers.
- Everything on the wire is snake_case; TS clients see camelCase (`conn.db.dataAsset`, `row.blastScore`).
- **Deployed on Maincloud as `claura`** (database identity `c200ccdca8eab81d0159ad2747b29ea7ad2acad20853d5607f8d244eb8fa50b0`,
  URI `wss://maincloud.spacetimedb.com`, dashboard https://spacetimedb.com/claura). The name was free, so no fallback
  name (`claura-hackutd`) was needed. The same module also runs as an **isolated appliance** on `ws://127.0.0.1:3000`.

## What is real

| real | simulated |
|---|---|
| All state, the access control and the policy gate live in SpacetimeDB (Maincloud, or a local server). Authorization is enforced inside the module on every call, not in the clients. | Effects of containment actions are rows in the database (a host becomes `quarantined`, a guest `paused`, a data asset `evidence_preserved`). Nothing touches real infrastructure. |
| Nemotron runs on-prem (local Ollama) and drives the agents; it can only call tools that call reducers. | Telemetry is a replayed fixture (6 signals). Reachability probes are fixtures. |
| Identities, roles, one-time enrollment codes, revocation, channel isolation, the audit trail. | Stakeholders in the roster are display-only rows, not identities. The scope inventory (7 data assets) is scenario data. |

## Security model (assume the attacker has every internal system)

1. **No table is readable.** All 18 tables are private (`*_store`). Clients read through per-user **views** that
   keep the original names (`host`, `incident`, `message`, ...). A view looks up `ctx.sender` in `operator_store`
   and returns rows only for an **active** operator whose **role** may see them. A stranger who connects and
   subscribes receives zero rows from all 18 views; a private table cannot even be named by a non-owner
   (`no such table`). Enroll, revoke or re-role someone and their cache fills or empties **live**, without reconnecting.
2. **Every reducer authenticates.** The first line of each is `requireOperator(ctx, roles)`: the caller is
   `ctx.sender` (the authenticated identity), never an argument. `approve` keeps its old `operator` argument only so
   old callers compile; it is **ignored**, the approver is recorded from the identity (tested: argument `"anyone"`,
   recorded `Owner`).
3. **Joining is out-of-band and single-use.** An admin mints a code (`issue_enrollment`), hands it over on a
   channel the attacker cannot see (in person, a known phone, paper), and the person calls `enroll(code, name)` from
   their own identity. The code is consumed. A wrong code and a used code give the **same** error. If the admin put a
   `name_hint` on the code, that name wins over the typed one, so nobody can pick a different name. Codes must be
   12 to 64 characters of `A-Za-z0-9_-`; generate 80 random bits (`scripts/new-code.mjs` does).
4. **Admins can also add by identity**: the person reads the identity hex off their sign-in screen to the admin
   (`add_operator`). `revoke_operator` cuts an identity off at once (views empty, every write refused). The row stays,
   so the audit trail keeps the name. The **last active admin cannot be revoked or demoted**.
5. **Least privilege by role** (matrices below). Agents propose but cannot approve, reset, set policy or add
   people. An agent can suspect exfiltration, **only a human can confirm it** or mark an asset restored. Agents
   can only move the NIST phase forward. A commander alone cannot unlock a denied action (`reimage_host`, `power_off_hall`, `delete_vm`): that needs an admin. A human cannot speak as Warden (`post_agent_message` is agent-only), and
   no human can take an agent's name (`sentry`, `triage`, `warden`, `scribe`, `system`, `claura`, ...). Display
   names are unique among active operators (case-insensitive) and stripped of control and bidi characters.
6. **Channel isolation.** `#legal` is for counsel, `#exec` for executives. A **vendor** (an outside party) sees only
   `#vendors`, its own tasks, the roster and itself: no incident, no scope, no brief, no telemetry.
7. **Everything is audited.** Every state change writes an `incident_event` with the actor's name (`ACCESS:` lines for
   enrollments, additions, revocations and issued/voided codes). Codes are never written to events, messages or logs
   (checked in the test and in the Maincloud logs).
8. **The policy gate is unchanged**: the `policy` table, not the model, decides run / ask a human / block.

### Honest limits

- The **database owner** (the identity that published, here the `spacetime` CLI login) is root: it can read every private
  table over SQL and republish the module. Protect `~/.config/spacetime`. It is also the first admin ("Owner").
- Tokens are **bearer credentials**. A stolen operator token is that operator until an admin revokes it. There is no
  device binding. Revocation (live) is the answer.
- `enroll` has **no rate limit or lockout** (a failed call rolls back, so nothing can be counted). 80-bit codes make
  guessing infeasible; throttling would belong at the network edge. Codes have **no expiry**; `revoke_enrollment` voids one.
- On Maincloud the data sits on a third party's infrastructure (TLS in transit). For a stronger isolation claim run the
  **appliance**: SpacetimeDB on the laptop, loopback only (see `../DEMO.md`). Standalone SpacetimeDB speaks plain WS; put
  TLS in front of it before exposing it to other devices.
- Messages are not end-to-end encrypted: operators with the role, and the owner, can read them.
- `init` (which creates the first admin) runs only on a fresh publish or `publish -c`. A hot-swap republish never
  creates an admin, so nobody can claim admin later. After a schema change, republish with `-c` (this wipes operators).

## Roles

`admin`, `commander`, `legal`, `exec`, `comms`, `vendor`, `responder`, `agent`.
**core** = admin, commander, responder, agent. **internal** = core + legal, exec, comms.

### Reads (the views)

| view (client accessor) | who gets rows |
|---|---|
| `host`, `guest_vm` (`guestVm`), `signal`, `finding`, `policy`, `proposal`, `incident_event` (`incidentEvent`), `agent_state` (`agentState`) | core |
| `incident`, `brief`, `decision`, `data_asset` (`dataAsset`) | internal |
| `report` | core + legal |
| `message` | per channel (below) |
| `task` | internal sees all; a vendor sees only tasks owned by `vendor` |
| `operator` | admin sees everyone including revoked; other internal roles see active operators; a vendor sees only itself |
| `enrollment` | admin only (the codes are secrets) |
| `stakeholder` | every active operator |

A stranger, or a revoked operator, gets nothing from any of them.

### Channels

| channel | read | post |
|---|---|---|
| `#command` | admin, commander, responder, agent, legal, exec, comms | admin, commander, responder, agent |
| `#legal` | admin, commander, legal, agent | same |
| `#exec` | admin, commander, exec, agent | same |
| `#comms-pr` | admin, commander, comms, legal, agent | same |
| `#vendors` | admin, commander, responder, vendor, agent | same |

## Tables (as the client sees them)

Timestamps are `Timestamp` (`.toDate()`), u64 are `bigint`. Auto-increment ids survive `reset_demo` (never assume `#1`).

| table | columns |
|---|---|
| `host` | `host` pk, `hall`, `rack`, `status` (`healthy`/`suspect`/`cordoned`/`quarantined`) |
| `guest_vm` | `vm` pk, `host`, `workload`, `status` (`running`/`paused`/`failed_over`), `moved_to` |
| `signal` | `id`, `at`, `source`, `message`, `host`, `vm` |
| `incident` | `id`, `title`, `severity`, `host`, `vm`, `status` (`open`/`awaiting_approval`/`contained`), `opened_at`, `contained_at` (Option), `blast_score` f64, **`category`, `nist_phase`, `functional_impact`, `information_impact`, `recoverability`** |
| `agent_state` | `agent` pk, `status`, `thought`, `model`, `updated_at` |
| `finding` | `id`, `incident_id`, `agent`, `kind`, `text`, `at` |
| `policy` | `action` pk, `mode` (`auto`/`approval`/`deny`), `reversible`, `note` |
| `proposal` | `id`, `incident_id`, `agent`, `action`, `target`, `reason`, `status` (`executed`/`pending_approval`/`approved`/`blocked`), `policy_mode`, `at`, `decided_by` |
| `incident_event` | `id`, `incident_id` (0 = none), `at`, `kind`, `actor`, `text`. The audit log. `kind`: signal, incident, finding, action, blocked, approval_requested, approval, state, report |
| `report` | `incident_id` pk, `summary`, `filed_at` |
| **`operator`** | `identity` pk, `name`, `role`, `added_by`, `added_at`, `active` |
| **`enrollment`** | `code` pk, `role`, `name_hint`, `created_by`, `created_at`, `used_by` (`''` unused; `Name (id8)` once used; `revoked by <admin>`) |
| **`message`** | `id`, `incident_id` (0 = standing room), `channel`, `author_name`, `author_role`, `kind` (`human`/`agent`/`system`), `text`, `at` |
| **`task`** | `id`, `incident_id`, `title`, `owner_role`, `status` (`open`/`doing`/`done`), `at` |
| **`decision`** | `id`, `incident_id`, `text`, `by_name`, `at` |
| **`brief`** | `incident_id` pk (0 = quiet-state brief), `text`, `known` (one fact per line), `unknown` (one question per line), `updated_at`, `author` |
| **`data_asset`** | `id`, `incident_id` (0 = unassigned inventory), `name`, `system`, `classification` (`restricted`/`confidential`/`internal`), `records` u64, `status` (`intact`/`accessed`/`exfil_suspected`/`exfil_confirmed`/`locked_ransomware`/`restored`/`evidence_preserved`), `note`, `updated_by`, `updated_at` |
| **`stakeholder`** | `name` pk, `role`, `initials`, `title` (extra column: job title), `verified_out_of_band`. Display-only roster, not identities |

## Reducers

Reducers return nothing; read results from the views. Every call checks the role first.

| reducer | args | who | behaviour |
|---|---|---|---|
| `enroll` | `code, name` | anyone (a stranger, or a revoked operator re-admitted) | Consumes an unused code; the caller's identity becomes an operator with the code's role. Logs `ACCESS:` and a system line in `#command`. |
| `issue_enrollment` | `code, role, name_hint` | admin | Mint a single-use code. |
| `revoke_enrollment` | `code` | admin | Void an unused code. |
| `add_operator` | `identity_hex, name, role` | admin | Add, re-role or reactivate an identity. |
| `revoke_operator` | `identity_hex` | admin | `active = false`, live. Refuses the last active admin. |
| `set_stakeholder_verified` | `name, verified` | admin, commander | Out-of-band verification flag. |
| `reset_demo` | none | admin | Wipes all **data** tables and reseeds. **Operators and enrollment codes are kept.** |
| `ingest_signal`, `open_incident`, `set_agent_state`, `record_finding`, `propose_action`, `file_report` | as before | agent, admin | `open_incident` also sets NIST phase `detection_analysis`, adopts the scope inventory, seeds 3 tasks + 2 decisions + a first brief. |
| `approve` | `proposal_id, operator` (ignored) | admin, commander | Applies the held action; writes `decision` "Quarantine b14-gpu-07 approved by <name>"; closes the commander's task; `quarantine_host` contains the incident. |
| `set_policy` | `action, mode` | admin, commander | Policy edit, logged with the name. **Relaxing a denial needs an admin**: a commander cannot turn a `deny` (or an unknown action, denied by default) into `auto`/`approval`; a commander can tighten. |
| `set_incident_phase` | `incident_id, phase` | agent (forward only), commander, admin | `detection_analysis`, `containment`, `eradication`, `recovery`, `post_incident`. |
| `set_incident_classification` | `incident_id, category, functional_impact, information_impact, recoverability` | agent, commander, admin | Empty string keeps the old value. |
| `set_brief` | `incident_id, text, known, unknown` | agent (author `scribe`), commander, admin | Upsert. |
| `record_decision` | `incident_id, text` | admin, commander, legal, exec | A decision of record. |
| `post_message` | `incident_id, channel, text` | by channel (table above) | Author name and role come from the operator row. |
| `post_agent_message` | `incident_id, channel, agent, text` | **agent only** | Speak as `sentry`/`triage`/`warden`/`scribe` (kind `agent`). |
| `add_task` | `incident_id, title, owner_role` | internal (not vendor) | |
| `set_task_status` | `id, status` | any operator who can see the task | |
| `set_asset_status` | `id, status, note` | admin, commander, responder, legal, agent* | *an agent cannot set `exfil_confirmed` or `restored`. Empty note keeps the old one. |

Deliberate differences from the written contract: tables are private with same-named gated views; `post_agent_message`,
`revoke_enrollment`, `record_decision`, `set_incident_classification`, `set_stakeholder_verified` and `stakeholder.title` are additions;
channel isolation is stricter than "any active operator"; `approve` ignores its `operator` argument.

## The policy gate

`propose_action` is the only way an agent changes the world, and **the `policy` table decides, not the model**.

| result | when | proposal.status | other effects |
|---|---|---|---|
| executed | mode `auto` | `executed` | effect applied immediately, `action` event |
| pending | mode `approval` | `pending_approval` | incident `awaiting_approval`, `approval_requested` event, **an open task "Approve quarantine of b14-gpu-07" for the commander** |
| blocked | mode `deny`, an unknown action (fail closed), or a target that names no real host/vm | `blocked` | `blocked` event, nothing applied |

Default policy: `isolate_network`, `revoke_credentials`, `cordon_host`, `pause_guest`, `capture_memory`,
`failover_guests` are `auto`; `quarantine_host` is `approval`; `reimage_host`, `power_off_hall`, `delete_vm` are `deny`.
Flipping `quarantine_host` to `auto` (a commander or admin, via `set_policy`) makes the same proposal execute with no human.

## Scope: the data at risk (requirement 4)

Seven `data_asset` rows are seeded unassigned (`incident_id` 0) by `reset_demo`; `open_incident` adopts them. Statuses move
through the incident, driven by Triage and by the **effects** the policy gate applies, so the board is always true:

| asset | records | at open | then | end of the demo |
|---|---|---|---|---|
| Tenant model weights (vm-7f3a) | 3 | `intact` | Triage: `accessed` | `pause_guest` -> **`evidence_preserved`** |
| Guest memory image (64 GiB) | 1 | `intact` | | `capture_memory` -> **`evidence_preserved`** |
| Workload tokens (agent-7f3) | 2 | `intact` | Triage: **`exfil_suspected`** | `revoke_credentials` keeps `exfil_suspected`, note says **revoked** |
| Management plane credentials (BMC/IPMI) | 2 | `intact` | | `intact`, note: guest network cut, no BMC login |
| Co-resident tenant volumes (x11) | 11 | `intact` | | `failover_guests`: `intact`, note says **failed over** |
| Corporate file share FIN-02 | 18,400 | **`locked_ransomware`** | | unchanged: a parallel ransomware detonation on corporate IT that the same war room tracks |
| Customer billing DB | 412,000 | **`accessed`** | | unchanged, note: investigating. A human decides what it becomes |

(`records` and names are scenario data. "revoked" is a note, not a status, because the status vocabulary is fixed.)

## NIST SP 800-61 documentation (requirement 3)

| 800-61 element | where it lives, updated live |
|---|---|
| Incident id, handler, status | `incident.id/status`, operators in `operator` |
| Phase of the lifecycle | `incident.nist_phase`: `detection_analysis` (at open), `containment` (Warden starts), `post_incident` (once contained); `eradication`/`recovery` are for humans |
| Category / attack vector | `incident.category` |
| Functional impact | `incident.functional_impact` (None/Low/Medium/High + reason) |
| Information impact | `incident.information_impact` (None/Privacy/Proprietary breach/Integrity loss + reason) |
| Recoverability | `incident.recoverability` (Regular/Supplemented/Extended/Not recoverable + reason) |
| Timeline of events and actions | `incident_event` (every change, with actor), `proposal` |
| Evidence and scope | `data_asset` (`evidence_preserved`, `exfil_*`, `locked_ransomware`) |
| Communications log | `message` |
| Decisions of record | `decision` |
| Tasks and owners | `task` |
| Stakeholder summary | `brief` (what we know / what we do not know yet) |
| Post-incident report | `report` |

## Run it

```bash
S=/Users/abd/.local/bin/spacetime
cd /Users/abd/repos/claura-backend/spacetime
unset NODE_USE_SYSTEM_CA
(cd spacetimedb && npm install)                  # first time only
$S build
$S publish --server local claura -c --yes        # LOCAL; -c wipes (needed after a schema change; wipes operators too)
$S publish --server maincloud claura --yes       # Maincloud (first publish makes the publisher the Owner admin)
$S call --server maincloud claura reset_demo     # admin only (the CLI identity is the Owner)
$S sql  --server maincloud claura "SELECT name, role, active FROM operator"
$S logs --server maincloud claura -n 50
```

`spacetime.json` pins `"server": "local"` as a guard; Maincloud needs the explicit `--server maincloud`.
For admin chores use `../scripts/access.sh` (codes, list, revoke, add, reset) and `../scripts/appliance.sh` (local appliance).

Client bindings: `../bindings/ts` (clean copy for the dashboard) and `../agents/src/module_bindings`
(`--import-extension ts`). Regenerate both after any schema or reducer change:

```bash
$S generate --lang typescript -y --module-path /Users/abd/repos/claura-backend/spacetime/spacetimedb --out-dir /Users/abd/repos/claura-backend/bindings/ts
$S generate --lang typescript --import-extension ts -y --module-path /Users/abd/repos/claura-backend/spacetime/spacetimedb --out-dir /Users/abd/repos/claura-backend/agents/src/module_bindings
```

## Tests

`../agents/test/module.live.ts` is a live access-control suite: separate SDK connections (a stranger, commander,
legal, exec, vendor, responder, agent) enrolled with one-time codes, admin actions through the CLI.
137 checks on the local appliance cover: a stranger reads 0 rows of 18 views and is refused by 23 reducers; single-use
and voided codes; admin-chosen names; role checks per reducer; channel isolation; the incident flow through the gate with
real roles; denied actions that only an admin can unlock; scope effects; approval attribution; live revoke and re-admit; last-admin protection; `reset_demo` keeping
access control. `--smoke` runs only the stranger checks (read-only, safe on Maincloud; 22 pass there).

```bash
cd ../agents && npx tsx test/module.live.ts            # full suite on the LOCAL db "claura" (ends with reset_demo)
TEST_SERVER=maincloud TEST_URI=wss://maincloud.spacetimedb.com TEST_DB=claura npx tsx test/module.live.ts --smoke
```

## Open issues

- No rate limit or lockout on `enroll`; codes do not expire (void with `revoke_enrollment`).
- No presence (who is online now), typing, read receipts or message edit/delete (messages are append-only on purpose).
- Views are re-evaluated per subscriber on every change: fine for tens of clients, not thousands.
- There is no `reject` for a pending proposal; it can be approved or left pending. Duplicate proposals are not de-duplicated.
- Auto-increment ids survive `reset_demo`. Effects are simulated in the database only.
- `blast_score` is 0.0 to 1.0 by convention (the module stores any f64).
- A republish that changes the schema needs `-c`, which wipes operators and codes; re-issue them afterwards.
