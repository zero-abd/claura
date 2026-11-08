# DEMO.md: running the live incident at the judging table

Claura, "Seal the breach before it spreads." Agents contain an AI-data-center breach; people coordinate in a war room that
does not depend on the compromised network. Everything below is a command you can paste.

```
repo      /Users/abd/repos/claura-backend
backend   Maincloud database "claura" at wss://maincloud.spacetimedb.com   (or the isolated appliance, section 5)
secrets   ~/.config/claura/.env (mode 600): backend address + one-time enrollment codes. Never in git, logs or the database.
```

## 1. What the judges see, and where each requirement is enforced

| Winstead requirement | what you show | enforced by |
|---|---|---|
| Highly secure, isolated inside possibly compromised networks | The war room runs off the corporate network (Maincloud) or fully on the laptop (appliance mode, section 5). A stranger who knows the database name reads **0 rows** and changes **nothing** (section 3). | Private tables + per-user gated views; every reducer checks the caller's role |
| Access control, admin adds individuals | An admin mints a one-time code, hands it over out of band, the person joins; an admin cuts someone off and their screen **empties live** | `issue_enrollment` / `enroll` / `add_operator` / `revoke_operator`; the last admin cannot be removed |
| NIST SP 800-61-style documentation, real-time | Incident phase moves `detection_analysis` -> `containment` -> `post_incident`; category, functional / information impact, recoverability; every action in an audit log with the actor's name | `incident.nist_phase` and impact fields, `incident_event`, `decision`, `task`, `report` |
| Scope of compromised data and its status | Scope board: model weights and memory image `evidence_preserved`, tokens `exfil_suspected` and revoked, tenant volumes failed over, **FIN-02 `locked_ransomware`** (a parallel ransomware event the same room tracks), billing DB `accessed` | `data_asset`, set by Triage, by the policy gate's effects, and by humans |
| Real-time communications inside the system | Five channels; agents speak as Sentry / Triage / Warden / Scribe; a plain-language brief (what we know / do not know); a vendor cannot read `#legal` | `message`, `brief`, channel rules in the module |
| Judged: security | The agent runner is a **low-privilege identity**: it cannot approve, reset, set policy or add people. Only a commander or admin approves, and the approver is recorded from their identity, not from an argument. The policy table, not the model, decides what runs. | `requireOperator` in every reducer; `propose_action` gate |
| Judged: ease of use under stress | One approval card; one command to run the whole incident; the war room fills itself | |

## 2. The live run

### Before you walk in (about 2 minutes)

```bash
cd /Users/abd/repos/claura-backend
curl -s localhost:11434/api/tags | grep -c nemotron-3-nano     # 1 = Ollama is up with the model. If 0:  ~/ollama/ollama serve &
/Users/abd/.local/bin/spacetime server ping maincloud            # "Server is online"
scripts/access.sh list                                          # agent runner active; console code (Riya Kapoor) UNUSED
scripts/live.sh --scripted --auto-approve-after 3               # rehearsal, 13 to 16 s, ends "CONTAINED, report filed"
```

### The incident

Sign the dashboard console in once with the one-time code `CLAURA_CONSOLE_CODE` from `~/.config/claura/.env` (it enrolls the browser as
**Riya Kapoor, Incident Commander**; after that the browser's stored token is the identity; see `bindings/README.md`). Then:

```bash
cd /Users/abd/repos/claura-backend
scripts/live.sh                    # resets the database as its owner, then Nemotron runs the incident; YOU click Approve in the dashboard
```

What happens (times measured against Maincloud with the real model; yours will vary by a few seconds):

| T+ | event |
|---|---|
| 0 s | six telemetry signals replay (VMM ioctl, vGPU fault, IOMMU fault, qemu shell, flow to IPMI, token misuse) |
| about 5 s | Sentry opens the incident, critical; `#command` lights up; the scope board and 3 tasks appear |
| about 7 to 17 s | Triage: blast radius 0.90, scope updated (tokens `exfil_suspected`, weights `accessed`), NIST classification written |
| about 17 to 33 s | Warden: network cut, tokens revoked, host cordoned, guest paused, memory captured, 11 tenants failed over. Each step is executed **by the policy gate**; the red-team `reimage_host` is **blocked** |
| about 34 s | **Approval card**: quarantine of b14-gpu-07 needs a commander. The brief says "one step is left and needs a person". |
| your click | decision "Quarantine b14-gpu-07 approved by Riya Kapoor"; contained within a second or two of it (38 s in the recorded runs with a 3 s auto-approve) |
| +16 to 20 s after contained | Scribe publishes the plain-language brief, the report and the shift handoff; the brief is routed to `#exec`, `#legal`, `#comms-pr`; phase `post_incident` |

Variations (same command, one flag):

```bash
scripts/live.sh --auto-approve-after 3     # no human: the labelled TEST HARNESS identity approves after 3 s (decision says so)
scripts/live.sh --scripted                 # BACKUP: no model, same reducers, card in about 10 s
scripts/live.sh --scripted --pace-ms 0     # fastest possible, card in a few seconds
scripts/live.sh --no-reset                 # skip the reset (the database must already be fresh)
```

If Ollama misbehaves the runner falls back by itself and says so (`FALLBACK:` lines, `deterministic fallback` in the agent cards); for a
guaranteed clean story use `--scripted`.

### After

```bash
scripts/access.sh reset            # back to the quiet room (operators and codes are kept)
```

## 3. Show the access control (2 minutes)

```bash
# 1. A stranger sees nothing. Anonymous SQL returns empty views, and the private tables do not exist for them:
S=/Users/abd/.local/bin/spacetime
$S sql --server maincloud --anonymous claura "SELECT * FROM incident"          # empty
$S sql --server maincloud --anonymous claura "SELECT * FROM message"           # empty
$S sql --server maincloud --anonymous claura "SELECT * FROM operator_store"    # Error: no such table (private)

# 2. ... and cannot change anything (22 checks, 5 seconds, read-only, safe on the live database):
cd /Users/abd/repos/claura-backend/agents && unset NODE_USE_SYSTEM_CA
TEST_SERVER=maincloud TEST_URI=wss://maincloud.spacetimedb.com TEST_DB=claura npx tsx test/module.live.ts --smoke

# 3. The admin adds a person out of band. Counsel gets a one-time code (read it aloud, or hand it over on paper):
cd /Users/abd/repos/claura-backend
scripts/access.sh code legal "Jordan Tate"           # prints ONE code. They paste it into the dashboard's Join screen.
scripts/access.sh list                               # Jordan Tate appears; the code shows as used
# 4. ... cut them off; their screen empties live and every write is refused:
scripts/access.sh revoke <identity_hex from the list>
```

Also worth saying out loud: the **vendor** role sees only `#vendors`; **legal** reads `#legal` but not `#exec`; an **agent** can
suspect exfiltration but only a human can confirm it; nobody can pose as Warden; display names cannot be `warden`, `scribe`, ...

For an **admin screen** in the dashboard (the console is a commander and cannot add people) issue an admin code:
`scripts/access.sh code admin "Alex Lindgren"`.

## 4. Troubleshooting

| symptom | cause and fix |
|---|---|
| `identity ... is not an enrolled operator` | The runner's token file was lost or the database was recreated. If the old agent is still listed active, revoke it first (names are unique, so a second "Claura agent runner" cannot join): `scripts/access.sh list`, `scripts/access.sh revoke <hex>`. Then `scripts/access.sh code agent "Claura agent runner"`, put it in `~/.config/claura/.env` as `CLAURA_AGENT_CODE`, run again. |
| `the database is not in a fresh demo state` | A previous incident is still there. `scripts/access.sh reset` (only the owner/admin can reset; the runner cannot). `scripts/live.sh` does it for you. |
| `--auto-approve-after` fails with `invalid or already used enrollment code` | The harness code is spent. `scripts/access.sh code commander "TEST HARNESS (auto-approve)"` -> `CLAURA_APPROVER_CODE` in the env file. |
| Dashboard shows nothing | The browser identity is not enrolled (or was revoked). Show its identity hex on the Join screen; `scripts/access.sh add <hex> "<name>" <role>`, or issue it a code. |
| Console code says `invalid or already used` | It works once. Revoke the old "Riya Kapoor" operator if it is still active (names are unique), then `scripts/access.sh code commander "Riya Kapoor"`. |
| Maincloud unreachable | Switch to the appliance (section 5); same commands plus `--local`. |
| Nemotron slow or the log says `FALLBACK` | Ollama cold or busy: `--scripted` for the demo, or `curl localhost:11434/api/tags` to check it is up. |
| Ctrl+C in the middle of a run | `scripts/access.sh reset`, then run again. |
| a stuck process | `pgrep -fl "tsx src/main.ts"`; the runner keeps no other process alive. |

## 5. Fully isolated: appliance mode

The same module, runner and model, with **no cloud**: SpacetimeDB runs on the laptop (loopback only), Nemotron runs in local Ollama, the
dashboard talks to `ws://127.0.0.1:3000`. Nothing leaves the machine. This is the "isolated system inside a potentially compromised
network" story: the war room can be carried into the room on a laptop.

```bash
cd /Users/abd/repos/claura-backend
scripts/appliance.sh --wipe        # starts SpacetimeDB on 127.0.0.1:3000 if needed, publishes "claura" (this Mac's CLI identity = Owner admin),
                                   # issues 3 one-time codes into ~/.config/claura/local.env (mode 600), prints no secrets
scripts/live.sh --local            # reset + the whole incident against the appliance (add --scripted / --auto-approve-after 3)
scripts/access.sh --local code legal "Jordan Tate"       # the same admin helper against the appliance
scripts/verify-db.sh --local       # final state
```

Point the dashboard at `ws://127.0.0.1:3000`, database `claura`, and use `CLAURA_CONSOLE_CODE` from `local.env`. Tokens are kept per server,
so Maincloud and the appliance never share an identity.

To let **other devices** join without any internet: put the laptop on a dedicated switch or hotspot that is not connected to the
corporate network and start the server on that interface (`spacetime start --listen-addr <appliance-ip>:3000`). Standalone SpacetimeDB speaks plain
WS, so put a TLS reverse proxy with a local certificate in front of it before real use. Revocation, roles and the policy gate behave exactly as on Maincloud.

## 6. What is real and what is not

Real: all state, access control and the policy gate live in SpacetimeDB (Maincloud holds them; the appliance holds them locally);
Nemotron 3 Nano 4B runs on-prem in Ollama and drives Sentry / Triage / Warden / Scribe through tools; identities, roles, single-use codes,
live revocation, channel isolation and the audit log are enforced inside the module.
Not real: telemetry is a replayed fixture of six signals (which do get written to the `signal` table, so the dashboard can show them; real
raw telemetry would stay on-prem); the effects of containment actions are simulated in the database; the stakeholder roster is display-only; the
scope inventory is scenario data; the red-team `reimage_host` is a labelled scripted probe because Nemotron never proposes a denied action by itself.

## 7. Files

| | |
|---|---|
| `scripts/live.sh` | reset as owner, then run the incident (`--scripted`, `--auto-approve-after N`, `--local`) |
| `scripts/access.sh` | admin helper: `code`, `list`, `add`, `revoke`, `void-code`, `reset` |
| `scripts/appliance.sh` | set up the isolated local appliance and its codes |
| `scripts/verify-db.sh` | read the final database state with SQL (as the owner; never selects codes) |
| `scripts/new-code.mjs` | print one 78-bit single-use code |
| `runs/maincloud-live.log`, `maincloud-live-2.log`, `maincloud-scripted.log` (+ `.db-state.txt`) | the recorded Maincloud runs and the database state after each |
| `bindings/ts`, `bindings/README.md` | client bindings and sign-in notes for the dashboard |
| `spacetime/README.md`, `agents/README.md` | the module (security model, roles, tables, reducers) and the runner |
