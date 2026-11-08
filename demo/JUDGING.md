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
| **A** (main laptop) | `http://localhost:4317/?live=1` | the console on SpacetimeDB, signed in as **Riya Kapoor (admin)**. Screen A must be an **admin**: People & Access and the code-issuing reducer are admin-only, and an admin can also approve the quarantine. A commander code (`CLAURA_CONSOLE_CODE`) cannot do the Access beat. Open it as `localhost`, not `127.0.0.1`: passkeys and the Secure Shell cookie need a hostname. Use a normal browser profile, not a private window: private windows block storage, so the sign-in would not survive a reload |
| **B** (second laptop) | the same console, signed in as a second person (**JT**, counsel) | War Room on `#legal`: the live-sync proof. Laptop only, there is no phone layout. The console on Screen A listens on loopback, so Screen B cannot point at Screen A's laptop. Either open a second browser profile on the same laptop (zero setup, still a separate identity and a separate connection), or on the other laptop clone the repo (after `npm run push` in `~/repos/claura`, so it has the latest console), run `cd apps/dashboard && npm install && npm run dev` and open `http://localhost:4317/?live=1` (it needs only the console, not the gateway or Ollama) |
| Replay (fallback) | `http://localhost:4317/?demo=1&play=1` | scripted data, no backend, no network. It plays on its own from page load: the breach at about 4 s, the approval card at about 5.5 s (it waits there for **⌘↵**), contained 2 s after that, the report 5 s after that. `?demo=1` alone waits: press **P**, or open the **Isolated · out-of-band** chip (top right) and click **Replay the incident**. Say "replay" |
| Terminal (Driver) | `demo/run-incident.sh` typed and waiting | Enter at **0:05** |

Table card next to Screen A: "Simulated attack replay · live software · illustrative numbers".

## Pre-flight (30 minutes before, and again at 12:45)

- [ ] **Start it:** `demo/start.sh`. Every line `[ ok ]`. The feature list shows `ssh live`, `voice live` (`mock` means no ElevenLabs key: do not demo voice), and `solana-anchor` `mock` until the owner funds the devnet wallet (see "Owner step: Solana" below). Claim anchoring on the chain only if it says `live`.
- [ ] **Integrations page** (`http://localhost:4317/?demo=1&view=integrations`): three cards, Secure Shell and Ask Claura `Live`, Evidence anchoring `Mock` (expected until funded) or `Live`, every **Open** button enabled. A card that says `Down` shows its reason on `http://localhost:8787/`.
- [ ] **Model warm:** `demo/status.sh` says `nemotron-3-nano:4b loaded (warm)`. If not: `ollama run nemotron-3-nano:4b "ok"`. Ollama drops an idle model after about 5 minutes; the gateway's voice feature re-warms it for 30.
- [ ] **Backend:** `demo/status.sh` says `maincloud reachable`. Also `appliance on 127.0.0.1:3000` if you want the offline fallback ready (otherwise `claura-backend/scripts/appliance.sh`).
- [ ] **Access, Screen A (admin):** `cd ~/repos/claura-backend && scripts/access.sh list` shows the agent runner active and an unused `admin` code for `Riya Kapoor (admin)`. First time only, put that code on the clipboard without printing it, then paste it into Screen A's "Enter break-glass code" sheet (leave the name empty; the code carries it):
  `grep '^CLAURA_CONSOLE_ADMIN_CODE=' ~/.config/claura/.env | cut -d= -f2- | tr -d '\n' | pbcopy`
  The code is single-use and the browser keeps the identity across reloads. Never paste a code in chat, on a slide or into a screenshot; copy something else afterwards to clear the clipboard. If the sheet does not appear because that browser is already enrolled as someone else, use a different browser profile. A replacement code: `scripts/access.sh code admin "Riya Kapoor (admin)"` (it prints one code; revoke the old Riya Kapoor (admin) first, names are unique).
- [ ] **Access, Screen B (JT):** `scripts/access.sh code legal "Jordan Tate"` prints one single-use code. Type it on Screen B's sheet. The name hint makes the avatar JT, Legal counsel.
- [ ] **Rehearsal 1, fast:** `demo/run-incident.sh --scripted --auto-approve-after 3` ends `CONTAINED, report filed` in 13 to 16 s. Watch Screen B (JT) flip to Contained at the approval.
- [ ] **Rehearsal 2, real clock, once:** `demo/run-incident.sh` with both screens up and a human approval. Expect the numbers in "The live clock" below (about 90 s from Enter to the filed report). Then put the room back: `cd ~/repos/claura-backend && scripts/access.sh reset`.
- [ ] **12:45 truth check** (say a line only if it passes). Run `demo/run-incident.sh --auto-approve-after 3` once for the live items (about a minute; `--scripted` takes 15 s but shows no model tags), then `scripts/access.sh reset`:
  - [ ] A War Room message sent on Screen B appears on Screen A without a refresh.
  - [ ] Approve on Screen A: Screen B (JT, who cannot see the agents' rows) flips to Contained within about a second. If it stays on "Breach in progress", reload Screen B, and do not say "at the same moment".
  - [ ] The Agents trace shows `model` tags from this run, and Triage's `get_host_inventory` and `check_reachability` rows. If it shows `fallback` or `scripted`, say "fallback" or "replay". If the two Triage rows are missing, do not point at them: say "Triage checked inventory and reachability" and expand its finding.
  - [ ] The Policy page lists auto, needs approval and denied, the red `reimage_host` row, and the "Warden acts on its own" toggles are on for the auto actions. If every toggle reads off, point at the table's column only.
  - [ ] Overview: a click on any slot of the glowing rack opens `b14-gpu-07`, and a click while the camera is moving is ignored. The approval card ignores clicks in its first moment, and ⌘↵ does nothing while the card is closed. If any of this misbehaves, keep to the Driver rules in the table below.
  - [ ] People & Access (Screen A is an admin): a fresh enrollment code works once, then fails on reuse.
  - [ ] Data Scope shows "locked by ransomware", "exfil suspected" and "intact"; Reports exports a PDF.
  - [ ] Reports: while `solana-anchor` is `mock`, clicking **Anchor evidence on Solana devnet** answers "Simulated anchor" in amber, with no Explorer link, and the PDF does not print an anchor line. "Anchored on Solana devnet" appears only when `live`.
  - [ ] Secure Shell on venue Wi-Fi: Touch ID prompt, second approver, read-only banner. (Enrol the real Touch ID once now; first use enrols a passkey.)
  - [ ] The War Room's `#legal` view shows the example notification clocks. If not, answer Q11 without "the War Room shows".
  - [ ] Ollama is warm.
- [ ] Phone with the demo video open and paused. Chargers. Screen B's brightness up.

## The two minutes

The incident runs on its own clock in live mode: the **Driver presses Enter on `demo/run-incident.sh` at 0:05**, quietly, under the hook. The room is reset, and the rest of the script is timed to the live clock below. (The replay, `?demo=1&play=1`, runs its own much shorter timeline from page load, and its approval card waits for you. If you fall back to it, open it at the breach beat, say "replay", and run the same beats from there.)

**The live clock** (medians of the dress-rehearsal runs: Maincloud, Nemotron 4B on this laptop; expect a few seconds of spread, and trust the screen over this table):

| After Enter | Script time | What happens |
|---|---|---|
| about 8 s (7 to 8) | 0:13 | The breach shows: six signals land, Sentry opens the incident, the rack in Hall B glows |
| 8 to 45 s | 0:13 to 0:50 | Sentry, Triage and Warden work; the Agents trace fills in |
| about 45 s (35 to 50) | 0:50 (anywhere from 0:40 to 0:55) | The approval card slides up |
| the Driver's **⌘↵** | about 1:00 | Contained at once, on Screen B too. The time-to-contain on screen reads 33 to 47 s |
| 21 s after ⌘↵ | about 1:21 | Scribe's brief lands in the War Room |
| 33 s after ⌘↵ (31 to 36) | about 1:33 | The report is filed |

Nothing below waits: the Speaker always has something true to say until the next thing lands, and the Driver works from what is on screen, not from the clock.

| Time | Screen A: the Driver | The Speaker says (short form) |
|---|---|---|
| **0:00** Hook | Overview. The 3D data center turns, every rack green. Hands off the trackpad. | "It's 2 a.m. Ransomware has the file share, the phones are down, and the attacker is reading your email. You don't investigate in front of the suspect." (Security and legal judges: "CISA warns of attackers joining their victims' incident calls.") |
| **0:05** Go | **Enter in the terminal**, without a word. The room resets; nothing changes on screen for about 8 s. | (still the hook) |
| **0:12** Reveal | Point at the Claura mark, then at the table card. The rack in Hall B starts to glow at about 0:13. | "This is Claura, the immune system for AI data centers. Its command center runs outside your network, with its own identities. The attack is a replay; the software is live." |
| **0:24** The breach | Click the glowing rack in Hall B (any slot: it opens `b14-gpu-07`), wait for the camera to settle, then **Open incident**: the attack path lights from `vm-7f3a` to the host and its eleven neighbors. | "One customer's AI workload is breaking out of its virtual machine, toward a server shared with eleven other companies. Six warnings in six tools; none says 'incident.'" |
| **0:37** Agents | Agents view, the live tool-call trace. Point at the model tag (`nemotron-3-nano:4b`, local) and, if they are there, at Triage's `get_host_inventory` and `check_reachability` rows. | "Our agents run NVIDIA Nemotron on-prem, calling tools. Sentry correlates the six signals. Triage checks inventory and reachability: one host, eleven neighbors. Warden proposes containment, reversible steps first." |
| **0:50** Policy, one human step | Policy view: point at the policy column (auto / needs approval / denied) and the red row `reimage_host · denied · red-team probe`. **Keep the pointer off the middle of the screen from 0:40**: the card slides up there, with its Approve button under your cursor. Do not click until it is fully up. If it is late, stay on the policy lines; if it is early, finish the sentence and go to it. Touch Evidence, Scope, Rollback, then **⌘↵**. Screen B flips to Contained at the same moment. | "Every proposal hits a policy gate inside a SpacetimeDB reducer. Policy, not the model, decides. Our own red-team test tried to reimage the host: denied. Quarantine needs a human: evidence, scope, rollback, one card." **⌘↵** Then the contained line for the mode you are in (below). |
| **1:09** People | War Room. On Screen B, JT posts in `#legal`: "Counsel here. Preserve the memory image." It lands on Screen A. While Scribe finishes (its brief lands about 1:21), point at the decision log, which already holds the approval, and at the tasks. When the brief appears, point at it. | "Then the people. The War Room is live chat inside Claura; that message just arrived from the other laptop. The decision log already says who approved the quarantine, and every task has an owner. And Scribe's brief: what we know, and what we don't know yet." |
| **1:23** Access | People & Access, Add person, "Outside counsel", role Counsel, Generate code. The single-use code appears; the access event lands in the audit log. (Admin only: this is why Screen A is the admin.) | "Need outside counsel? The admin issues a single-use break-glass code. No email, no phones, no SSO." |
| **1:31** Data scope | Data Scope. Point at one row per status. | "Every asset: locked by ransomware, exfiltration suspected, intact." |
| **1:36** Documentation | Reports (the report is filed at about 1:33). Phase bar, then the chain-of-custody hashes, then **Export PDF**. If the filed text is not there yet, do the bar and the hashes first. | "The record follows NIST 800-61: live phase status, SHA-256 evidence hashes, a PDF for counsel to review." |
| **1:43** Close | Scribe's shift-handoff card, then gesture at both screens. | "At shift change, Scribe hands over the same record. Next: an immune system for every AI cloud, where one breach protects them all. **Your network is compromised. Your command isn't.**" |

**The contained line, by mode.** Never say "9.4" in live mode.
- **Replay** (`?demo=1`): "Contained: 9.4 seconds on our demo clock."
- **Live:** read the number on screen: "Contained in forty-one seconds [whatever it says], real machine time on this laptop with a local model, and that includes the human step." Live runs measured 33 to 47 s of time-to-contain, and 38 to 50 s from the first signal to contained.

If a judge interrupts: answer in one sentence, offer to show it, say "let me land the plane", press ⌘↵.
If a judge arrives mid-run: the 60-second version (`pitch/FINAL-PITCH.md` section 6) from whatever screen is up.

**Say "live", "simulated", "illustrative" the way section 0 of the pitch says.** Live: the console, SpacetimeDB on Maincloud,
the policy gate, Nemotron on this laptop, Secure Shell. Simulated: the attack telemetry (a replay), the effects of containment,
the shell targets (real OpenSSH daemons standing in for GPU hosts). Illustrative: the replay's 9.4 s, 2,048 hosts, 61,207 sandboxes.
Measured: the live clock above and a two-console sync of about 335 ms from click to screen.
Voice ("Ask Claura") and anchoring on Solana are bonuses: never in the two minutes, only if a judge asks and they work.
Solana anchoring is **pending devnet funding** unless `solana-anchor` says `live`: say "the anchor is simulated until our devnet wallet is funded", never "anchored on Solana".

## Swap-ins by judge (about 15 seconds each, after the pitch)

| Judge | Show |
|---|---|
| **NVIDIA** | Agents trace, one agent expanded: Triage called `get_host_inventory`, found eleven co-resident guests, called `check_reachability`, wrote its finding with a blast score. Every row is tagged `model` or `fallback`. Logged live run: 15 turns, 14 tool calls, zero malformed (Sentry, Triage and Warden, up to the approval card). |
| **Spacetime** | Policy view, then Screen B. The gate is the `propose_action` reducer: one transaction reads the policy row and the target, commits executed, pending or blocked. Both screens are just subscriptions; a click-to-screen sync took about 335 ms when we measured it. |
| **Security / CISO** | Overview, click `b14-gpu-07`, **Open secure shell**. The reason is pre-filled: **⌘↵**. Touch ID. Click **Approve as Incident Commander (RK)** (a second person; the requester can never approve). Type `hostname`, `dmesg \| tail -3`, `rm -rf /` (denied: "forensic read-only session"). **End session**: recording hash and a green "Audit chain intact". "A short-lived OpenSSH certificate, valid minutes, one host, one role; the host proves itself with a CA-signed host certificate." |
| **NMC²** | War Room tasks, then the handoff card. Six signals, one incident; tasks with owners; Scribe's handoff on the same record. |
| **Winstead attorney** | `#legal`, the decision log, the clocks card ("confirm with counsel"). The PDF is a contemporaneous export for outside counsel to validate. |
| **Voice** (only if asked and `voice` is `live`) | The mic button or `Alt+V`: "Is the host contained?" Nemotron answers locally from the incident record, ElevenLabs speaks it. Read-only: it cannot approve anything. |
| **Solana** (only if asked) | If `solana-anchor` is `mock`: "Anchoring writes the record's SHA-256 to a Solana devnet Memo transaction; our devnet wallet is not funded yet, so the button says Simulated anchor and links nothing." If it is `live` and you have anchored for real: Reports, **Anchor evidence**, **Open in Solana Explorer**. |

## Between judges

1. `cd ~/repos/claura-backend && scripts/access.sh reset` (quiet room; operators and codes are kept). Reload Screen A and B.
2. Re-warm Ollama if it has been idle: `demo/status.sh`, then `ollama run nemotron-3-nano:4b "ok"`.
3. Terminal: `demo/run-incident.sh` typed and waiting again.

After the last judge: void the unused "Outside counsel" codes you issued on stage (People & Access, or `scripts/access.sh list`, then `scripts/access.sh void-code <code>`).

## When something breaks

Never let a judge discover it. Say "this is the replay; the live run takes about a minute on this laptop" and switch.

| Symptom | Do |
|---|---|
| **Wi-Fi down / Maincloud unreachable** (`demo/status.sh` says `maincloud NOT reachable`) | Appliance mode: the same module, runner and model on this laptop, nothing leaves it (`claura-backend/DEMO.md` section 5). `cd ~/repos/claura-backend && scripts/appliance.sh --wipe` (starts SpacetimeDB on `ws://127.0.0.1:3000`, publishes `claura`, writes three one-time codes into `~/.config/claura/local.env`, prints no secrets). Open Screen A at `http://localhost:4317/?live=1&stdb=local` and sign in with `CLAURA_CONSOLE_CODE` from `local.env` (a commander: approvals work, the Access beat does not). For the Access beat, enrol an admin instead: `scripts/access.sh --local code admin "Riya Kapoor (admin)"` prints one code, or skip that beat. Then `demo/run-incident.sh --local` (add `--scripted` for the backup). Screen B must be on the same laptop (a second profile) or the same network as the appliance, or skip it and use the replay. Rehearse this once. |
| **Model slow** (turns take seconds, the log says `FALLBACK`, the trace shows `fallback`) | `demo/run-incident.sh --scripted`: no model, same reducers, the approval card in about 10 s (`--scripted --pace-ms 0` for a few seconds). Say "scripted" or "fallback" about the trace tags. First check it is just cold: `ollama run nemotron-3-nano:4b "ok"`. |
| **Gateway down** (`demo/status.sh` says `gateway not answering`) | The console still works: Overview, Incident, approval card, War Room, Data Scope, Reports, People & Access are all SpacetimeDB or scripted. Only **Open secure shell** (the console says the module is absent) and the mic and spoken-brief buttons (they stay inactive) need the gateway. Skip those beats. Restart in about 10 s: `demo/stop.sh && demo/start.sh --skip-build`, then reload Screen A. |
| **One feature down** (`ssh` or `voice` shows `down` in `demo/start.sh` or `http://localhost:8787/`) | The gateway keeps serving the rest. The reason is on the status page and in `demo/.run/gateway.log`. Usual causes: the sshd ports (the gateway moves to the next free four and logs it), a missing ElevenLabs key (voice goes `mock`), Ollama stopped. Restart as above. |
| **Live mode shows nothing** | The browser is not enrolled or was revoked (`claura-backend/DEMO.md` section 4): `scripts/access.sh list`, or issue a new code `scripts/access.sh code admin "Riya Kapoor (admin)"` for Screen A (revoke the old Riya Kapoor (admin) first: names are unique). |
| **Approval card never appears** | `Ctrl+C` the run, `scripts/access.sh reset`, run again with `--scripted`. |
| **A click on the rack opens the wrong host** | `Esc`, wait for the camera to settle, click the glowing rack once more. Or reload Screen A at `http://localhost:4317/?live=1&host=b14-gpu-07`. |
| **Screen B stays on "Breach in progress" after the approval** | Reload Screen B (its identity survives). Skip "at the same moment" and show the War Room sync instead. |
| **Touch ID prompt does not appear** | The lid must be open. Skip the Secure Shell swap-in and show the console only. |
| **Port 4317 or 8787 already in use** | `demo/stop.sh`, then `lsof -nP -iTCP:4317 -sTCP:LISTEN` to see who holds it (a stray `vite` dev server is the usual one). `CLAURA_CONSOLE_PORT=4400 demo/start.sh` moves the console and tells the gateway. |
| **Console build fails** | `demo/start.sh` serves the last good build and says so (`demo/.run/console-build.log` has the TypeScript error). |
| **Everything is on fire** | The demo video on the phone, open and paused. |

## Owner step: Solana (30 seconds, only the owner can do it)

Evidence anchoring is built and tested, but the devnet wallet has no SOL and the RPC faucet is closed, so until it is funded the feature runs in `mock`: the button says **Simulated anchor** and nothing is sent. To make it real:

1. Open https://faucet.solana.com (sign in with GitHub if it asks) and pick **Devnet**.
2. Paste the PUBLIC address `GawzFG3iwB1yP2eXpF25emn4CU7VWAGFy5MfQQs1PbUN` and request 1 devnet SOL.
3. `cd ~/repos/claura/integrations/solana-anchor && npm run smoke`. It anchors one test hash for real, verifies it through the API and through an independent RPC read, and prints the signature and the Explorer link. (`npm run fund` prints the address and these steps.) A running gateway flips `solana-anchor` from `mock` to `live` by itself at its next balance check; no restart.

Only after that may anyone say "anchored on Solana devnet" or tick the MLH Solana prize. Devnet only, no real funds, ever.

## Command sheet

| | |
|---|---|
| Start / stop / look | `demo/start.sh` (`--rebuild`, `--skip-build`, `--start-ollama`, `--no-console`) · `demo/stop.sh` · `demo/status.sh` |
| Live incident | `demo/run-incident.sh` (`--auto-approve-after 3` no human, `--scripted` backup, `--local` appliance, `--no-reset`, `--dry-run`, `--force`) |
| Replay | `http://localhost:4317/?demo=1&play=1` plays at load · `?demo=1` then **P** (or the **Replay the incident** button in the Isolated chip's popover) plays on demand |
| Quiet room | `cd ~/repos/claura-backend && scripts/access.sh reset` (add `--local` for the appliance) |
| Access | `scripts/access.sh list` · `scripts/access.sh code <role> "<name>"` (prints one code) · `scripts/access.sh revoke <identity_hex>` · `scripts/access.sh void-code <code>` |
| Screen A's code | `grep '^CLAURA_CONSOLE_ADMIN_CODE=' ~/.config/claura/.env \| cut -d= -f2- \| tr -d '\n' \| pbcopy` (clipboard, nothing printed) |
| Gateway | `http://localhost:8787/` (status page) · `/api/health` (JSON) · logs `demo/.run/gateway.log`, `console.log` |
| Ollama | `curl -s localhost:11434/api/tags \| grep -c nemotron-3-nano` (1 = up with the model) · `ollama run nemotron-3-nano:4b "ok"` (warm) |

`run-incident.sh` resets the demo database as its owner before it starts, so do not run it while a judge is looking at the room.
Codes live in `~/.config/claura/` only. Never paste one into chat, a slide or a screenshot.
