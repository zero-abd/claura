# Judging table: run sheet

Claura, "Your network is compromised. Your command isn't." Two roles: the **Speaker** talks and never touches the
trackpad; the **Driver** clicks only on cues. Full wording, Q&A and claim rules: `pitch/FINAL-PITCH.md` (sections 0, 4 to 7).

```
~/repos/claura/demo/start.sh          everything up: console :4317, gateway :8787 (+ Secure Shell sshd targets), checks, URLs
~/repos/claura/demo/run-incident.sh   the live incident: real Nemotron, Maincloud (--scripted = backup, --local = appliance)
~/repos/claura/demo/status.sh         what is up, in 2 seconds         ~/repos/claura/demo/stop.sh   stops what start.sh started
```

| Screen | URL | Shows |
|---|---|---|
| **A** (main laptop) | `http://localhost:4317/?live=1` | the console on SpacetimeDB, signed in as **RK** (Incident Commander). Open it as `localhost`, not `127.0.0.1`: passkeys and the Secure Shell cookie need a hostname |
| **B** (second laptop or phone) | the same console, signed in as a second person (**JT**, counsel) | War Room on `#legal`: the live-sync proof |
| Replay (fallback) | `http://localhost:4317/?demo=1` | scripted data, no backend, no network. Say "replay" |
| Terminal (Driver) | `demo/run-incident.sh` typed and waiting | Enter at **0:15** |

Table card next to Screen A: "Simulated attack replay · live software · illustrative numbers".

## Pre-flight (30 minutes before, and again at 12:45)

- [ ] **Start it:** `demo/start.sh`. Every line `[ ok ]`. The feature list shows `ssh live`, `voice live` (`mock` means no ElevenLabs key: do not demo voice), `solana-anchor` `live` or `mock` (claim anchoring on the chain only if it says `live`).
- [ ] **Integrations page** (`http://localhost:4317/?demo=1&view=integrations`): three cards, Secure Shell and Ask Claura `Live`, Evidence anchoring `Live` or `Mock`, every **Open** button enabled. A card that says `Down` shows its reason on `http://localhost:8787/`.
- [ ] **Model warm:** `demo/status.sh` says `nemotron-3-nano:4b loaded (warm)`. If not: `ollama run nemotron-3-nano:4b "ok"`. Ollama drops an idle model after about 5 minutes; the gateway's voice feature re-warms it for 30.
- [ ] **Backend:** `demo/status.sh` says `maincloud reachable`. Also `appliance on 127.0.0.1:3000` if you want the offline fallback ready (otherwise `claura-backend/scripts/appliance.sh`).
- [ ] **Access:** `cd ~/repos/claura-backend && scripts/access.sh list`: agent runner active; Screen A signed in as RK (first time: paste `CLAURA_CONSOLE_CODE` from `~/.config/claura/.env` once; read it from the file, never paste it in chat or on a slide). Screen B signed in as JT. A fresh code (`scripts/access.sh code legal "Outside counsel"`) works once in a private window and fails on reuse.
- [ ] **Rehearsal:** `demo/run-incident.sh --scripted --auto-approve-after 3` ends `CONTAINED, report filed` in 13 to 16 s. Then put the room back: `cd ~/repos/claura-backend && scripts/access.sh reset`.
- [ ] **12:45 truth check** (say a line only if it passes):
  - [ ] A War Room message sent on Screen B appears on Screen A without a refresh.
  - [ ] The Agents trace shows `model` tags from this run. If it shows `fallback` or `scripted`, say "fallback" or "replay".
  - [ ] People & Access: a fresh enrollment code works once, then fails on reuse.
  - [ ] Data Scope shows "locked by ransomware", "exfil suspected" and "intact"; Reports exports a PDF.
  - [ ] Secure Shell on venue Wi-Fi: Touch ID prompt, second approver, read-only banner. (Enrol the real Touch ID once now; first use enrols a passkey.)
  - [ ] The War Room's `#legal` view shows the example notification clocks. If not, answer Q11 without "the War Room shows".
  - [ ] Ollama is warm.
- [ ] Phone with the demo video open and paused. Chargers. Screen B's brightness up.

## The two minutes

The incident runs on its own clock in live mode: the **Driver presses Enter on `demo/run-incident.sh` at 0:15**. The room
is reset, the first signal lands about 5 s later, and the approval card appears about 34 s after Enter, which is the 0:50 beat.
(In the replay `?demo=1` nothing needs starting: the console plays its own timeline.)

| Time | Screen A: the Driver | The Speaker says (short form) |
|---|---|---|
| **0:00** Hook | Overview. The 3D data center turns, every rack green. Hands off the trackpad. | "It's 2 a.m. Ransomware has the file share, the phones are down, and the attacker is reading your email. You don't investigate in front of the suspect." (Security and legal judges: "CISA warns of attackers joining their victims' incident calls.") |
| **0:12** Reveal | Point at the Claura mark, then at the table card. **0:15: Enter in the terminal.** | "This is Claura, the immune system for AI data centers. Its command center runs outside your network, with its own identities. The attack is a replay; the software is live." |
| **0:24** The breach | Click the amber rack in Hall B; `b14-gpu-07` opens. **Open incident**: the attack path lights from `vm-7f3a` to the host and its eleven neighbors. | "One customer's AI workload is breaking out of its virtual machine, toward a server shared with eleven other companies. Six warnings in six tools; none says 'incident'." |
| **0:37** Agents | Agents view, the live tool-call trace. Point at the model tag (`nemotron-3-nano:4b`, local) and at Triage's `get_host_inventory` and `check_reachability` rows. | "Our agents run NVIDIA Nemotron on-prem, calling tools. Sentry correlates the six signals. Triage checks inventory and reachability: one host, eleven neighbors. Warden proposes containment, reversible steps first." |
| **0:50** Policy, one human step | Point at the policy column (auto / needs approval / denied) and the red row `reimage_host · denied · red-team probe`. The approval sheet slides up: touch Evidence, Scope, Rollback, then **⌘↵**. Screen B flips to Contained at the same moment. | "Every proposal hits a policy gate inside a SpacetimeDB reducer. Policy, not the model, decides. Our own red-team test tried to reimage the host: denied. Quarantine needs a human: evidence, scope, rollback, one card. Contained: 9.4 seconds on our demo clock." |
| **1:09** People | War Room. On Screen B, JT posts in `#legal`: "Counsel here. Preserve the memory image." It lands on Screen A. | "Then the people. The War Room is live chat inside Claura; that message just arrived from the other laptop. Scribe's brief: what we know, and what we don't know yet." |
| **1:23** Access | People & Access, Add person, "Outside counsel", role Counsel, Generate code. The single-use code appears; the access event lands in the audit log. | "Need outside counsel? The admin issues a single-use break-glass code. No email, no phones, no SSO." |
| **1:31** Data scope | Data Scope. Point at one row per status. | "Every asset: locked by ransomware, exfiltration suspected, intact." |
| **1:36** Documentation | Reports. Phase bar, then the chain-of-custody hashes, then **Export PDF**. | "The record follows NIST 800-61: live phase status, SHA-256 evidence hashes, a PDF for counsel to review." |
| **1:43** Close | Scribe's shift-handoff card, then gesture at both screens. | "At shift change, Scribe hands over the same record. Next: an immune system for every AI cloud, where one breach protects them all. **Your network is compromised. Your command isn't.**" |

If a judge interrupts: answer in one sentence, offer to show it, say "let me land the plane", press ⌘↵.
If a judge arrives mid-run: the 60-second version (`pitch/FINAL-PITCH.md` section 6) from whatever screen is up.

**Say "live", "simulated", "illustrative" the way section 0 of the pitch says.** Live: the console, SpacetimeDB on Maincloud,
the policy gate, Nemotron on this laptop, Secure Shell. Simulated: the attack telemetry (a replay), the effects of containment,
the shell targets (real OpenSSH daemons standing in for GPU hosts). Illustrative: 9.4 s, 2,048 hosts, 61,207 sandboxes.
Voice ("Ask Claura") and anchoring on Solana are bonuses: never in the two minutes, only if a judge asks and they work.

## Swap-ins by judge (about 15 seconds each, after the pitch)

| Judge | Show |
|---|---|
| **NVIDIA** | Agents trace, one agent expanded: Triage called `get_host_inventory`, found eleven co-resident guests, called `check_reachability`, wrote its finding with a blast score. Every row is tagged `model` or `fallback`. Logged live run: 15 turns, 14 tool calls, zero malformed. |
| **Spacetime** | Policy view, then Screen B. The gate is the `propose_action` reducer: one transaction reads the policy row and the target, commits executed, pending or blocked. Both screens are just subscriptions. |
| **Security / CISO** | Overview, click `b14-gpu-07`, **Open secure shell**. The reason is pre-filled: **⌘↵**. Touch ID. Click **Approve as Incident Commander (RK)** (a second person; the requester can never approve). Type `hostname`, `dmesg \| tail -3`, `rm -rf /` (denied: "forensic read-only session"). **End session**: recording hash and a green "Audit chain intact". "A short-lived OpenSSH certificate, valid minutes, one host, one role; the host proves itself with a CA-signed host certificate." |
| **NMC²** | War Room tasks, then the handoff card. Six signals, one incident; tasks with owners; Scribe's handoff on the same record. |
| **Winstead attorney** | `#legal`, the decision log, the clocks card ("confirm with counsel"). The PDF is a contemporaneous export for outside counsel to validate. |
| **Voice** (only if asked and `voice` is `live`) | The mic button or `Alt+V`: "Is the host contained?" Nemotron answers locally from the incident record, ElevenLabs speaks it. Read-only: it cannot approve anything. |

## Between judges

1. `cd ~/repos/claura-backend && scripts/access.sh reset` (quiet room; operators and codes are kept). Reload Screen A and B.
2. Re-warm Ollama if it has been idle: `demo/status.sh`, then `ollama run nemotron-3-nano:4b "ok"`.
3. Terminal: `demo/run-incident.sh` typed and waiting again.

## When something breaks

Never let a judge discover it. Say "this is the replay; the live run takes about a minute on this laptop" and switch.

| Symptom | Do |
|---|---|
| **Wi-Fi down / Maincloud unreachable** (`demo/status.sh` says `maincloud NOT reachable`) | Appliance mode: the same module, runner and model on this laptop, nothing leaves it (`claura-backend/DEMO.md` section 5). `cd ~/repos/claura-backend && scripts/appliance.sh --wipe` (starts SpacetimeDB on `ws://127.0.0.1:3000`, publishes `claura`, writes three one-time codes into `~/.config/claura/local.env`, prints no secrets). Point the console at `ws://127.0.0.1:3000`, database `claura`, and sign in with `CLAURA_CONSOLE_CODE` from `local.env`. Then `demo/run-incident.sh --local` (add `--scripted` for the backup). The console side of the switch is not in the launcher: rehearse it once. Screen B must be on the same network as the appliance, or skip it and use the replay. |
| **Model slow** (turns take seconds, the log says `FALLBACK`, the trace shows `fallback`) | `demo/run-incident.sh --scripted`: no model, same reducers, the approval card in about 10 s (`--scripted --pace-ms 0` for a few seconds). Say "scripted" or "fallback" about the trace tags. First check it is just cold: `ollama run nemotron-3-nano:4b "ok"`. |
| **Gateway down** (`demo/status.sh` says `gateway not answering`) | The console still works: Overview, Incident, approval card, War Room, Data Scope, Reports, People & Access are all SpacetimeDB or scripted. Only **Open secure shell** (the console says the module is absent) and the mic and spoken-brief buttons (they stay inactive) need the gateway. Skip those beats. Restart in about 10 s: `demo/stop.sh && demo/start.sh --skip-build`, then reload Screen A. |
| **One feature down** (`ssh` or `voice` shows `down` in `demo/start.sh` or `http://localhost:8787/`) | The gateway keeps serving the rest. The reason is on the status page and in `demo/.run/gateway.log`. Usual causes: the sshd ports (the gateway moves to the next free four and logs it), a missing ElevenLabs key (voice goes `mock`), Ollama stopped. Restart as above. |
| **Live mode shows nothing** | The browser is not enrolled or was revoked (`claura-backend/DEMO.md` section 4): `scripts/access.sh list`, or issue a new code `scripts/access.sh code commander "Riya Kapoor"` (revoke the old Riya first: names are unique). |
| **Approval card never appears** | `Ctrl+C` the run, `scripts/access.sh reset`, run again with `--scripted`. |
| **Touch ID prompt does not appear** | The lid must be open. Skip the Secure Shell swap-in and show the console only. |
| **Port 4317 or 8787 already in use** | `demo/stop.sh`, then `lsof -nP -iTCP:4317 -sTCP:LISTEN` to see who holds it (a stray `vite` dev server is the usual one). `CLAURA_CONSOLE_PORT=4400 demo/start.sh` moves the console and tells the gateway. |
| **Console build fails** | `demo/start.sh` serves the last good build and says so (`demo/.run/console-build.log` has the TypeScript error). |
| **Everything is on fire** | The demo video on the phone, open and paused. |

## Command sheet

| | |
|---|---|
| Start / stop / look | `demo/start.sh` (`--rebuild`, `--skip-build`, `--start-ollama`, `--no-console`) · `demo/stop.sh` · `demo/status.sh` |
| Live incident | `demo/run-incident.sh` (`--auto-approve-after 3` no human, `--scripted` backup, `--local` appliance, `--no-reset`, `--dry-run`, `--force`) |
| Quiet room | `cd ~/repos/claura-backend && scripts/access.sh reset` (add `--local` for the appliance) |
| Access | `scripts/access.sh list` · `scripts/access.sh code <role> "<name>"` (prints one code) · `scripts/access.sh revoke <identity_hex>` |
| Gateway | `http://localhost:8787/` (status page) · `/api/health` (JSON) · logs `demo/.run/gateway.log`, `console.log` |
| Ollama | `curl -s localhost:11434/api/tags \| grep -c nemotron-3-nano` (1 = up with the model) · `ollama run nemotron-3-nano:4b "ok"` (warm) |

`run-incident.sh` resets the demo database as its owner before it starts, so do not run it while a judge is looking at the room.
Codes live in `~/.config/claura/` only. Never paste one into chat, a slide or a screenshot.
