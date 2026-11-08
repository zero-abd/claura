# Demo flow

How to show Claura to judges in 3 minutes plus 2 minutes of questions (the HackUTD pitch format), what to set up
first, what to say when something breaks, and what to build if there is time before judging.

Judging is Sun 8 Nov, 1:00–4:00 pm. Devpost closes at 12:00 pm CST.

## The problem with the current demo

The polished part and the real part are two different programs:

- **The console (`apps/dashboard`) looks finished, but it is a scripted playback.** It is not connected to anything,
  yet its header says "synced · SpacetimeDB" and "SpacetimeDB · live sync" (`apps/dashboard/src/shell.ts:37,50`).
- **The backend (SpacetimeDB plus Nemotron) is real, but it only shows up in a terminal.**

The simulated judge panel's top criticism was "claims outrun the build". A Spacetime or NVIDIA judge who asks "is this
live?" while the console is on screen gets the answer "no", and that answer colours the rest of the pitch.

So the demo should do two things: **tell the story with the console, then prove it with the terminal**. Each part
should be labelled for what it is.

## Recommended flow (3 minutes)

Two windows side by side: the console on the left, a terminal on the right. The live run has already been started
and is **waiting at the approval step** (see the setup below), because a live Nemotron run takes 60–80 s.

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00 | Console, Overview | "AI agents now run inside data centers. When one breaks out of its VM, everything on that GPU host is exposed, and responders have minutes." | Nothing. Let the fleet view sit. |
| 0:15 | Console, Incident | "This is a replay of the incident we model: an agent escapes through the vGPU path on b14-gpu-07, with 11 other tenants on the host." | Press play (`?demo=1&view=incident&play=1`). Let it reach the approval card at 5.5 s. |
| 0:45 | Console, approval card | "Four agents detect it, size the blast radius and contain it, reversible steps first. Quarantine is the one step a person must approve. You approve it." | **Hand the judge the keyboard.** They press ⌘↵. Contained at 9.4 s. |
| 1:05 | Terminal | "That was the replay. This is the real system: SpacetimeDB holds every row, and Nemotron runs locally on this laptop. These agents ran a minute ago and are waiting for us." | `spacetime sql` on `proposal`: six `executed`, one `blocked` (reimage), one `pending_approval`. |
| 1:30 | Terminal | "The model can only propose. Watch an agent try to approve its own quarantine." | `approve <id> '"warden"'` → `agents cannot approve proposals; a human operator must`. |
| 1:45 | Terminal | "And a destructive action, even when asked for directly." | `propose_action … reimage_host` → `blocked`, decided by policy. |
| 2:00 | Terminal | "A person approves." | `approve <id> '"RK"'`. The runner wakes, Scribe files the report, the incident row reads `contained`. |
| 2:25 | Terminal or README diagram | "The rule is data, not code: one policy row says quarantine needs a human. The gate is a reducer inside the database, so a model mistake can't get around it." | `spacetime sql` on `policy`. |
| 2:45 | Either | Track line (see below), then: "Agents propose, policy decides." | Stop. |

Why this order works:

- The judge pressing ⌘↵ is the one moment they will remember. It also shows the product's whole idea, a human
  holding the last key, without any explanation.
- The terminal part replaces "trust us" with three refusals the judge watches happen.
- Saying "replay" out loud before anyone asks takes the "is it live?" question off the table.

### Track lines (10 seconds each, pick the one matching the judge)

- **NMC² (Keep the World Running):** "Their three problems are missed warnings, unclear handoffs and wrong information
  at the wrong time. Sentry catches the warning. One shared incident log is the handoff. The approval card shows
  evidence, scope and rollback in one place."
- **NVIDIA (Nemotron beyond a chatbot):** "Nemotron 3 Nano 4B runs fully local and calls tools, with no chat. Every
  agent card says whether the model or the fallback did the work. We log that instead of hiding it."
- **Spacetime:** "The database is the referee. The policy gate is a reducer, every agent writes through reducers, and
  a console can subscribe to the same tables."
- **Winstead (incident response):** "Every action is logged with who proposed it and who approved it, and the shell
  ledger is hash-chained." Only use this if the team has entered that track. Three of its five requirements (user
  admin, in-app chat, isolated deployment) are not built.

## Setup checklist (do this 10 minutes before judges arrive)

1. **Free port 3000.** On this laptop another project's Next.js dev server (`~/Codes/ak/utd`, iynk) is listening on
   3000, which is SpacetimeDB's default. Stop it, or run SpacetimeDB elsewhere:
   ```bash
   spacetime start --listen-addr 127.0.0.1:3100 &
   spacetime server add --url http://127.0.0.1:3100 local3100 --no-fingerprint   # then use --server local3100
   export STDB_URI=ws://127.0.0.1:3100
   ```
2. **Start Ollama and warm the model.** It was not running when this doc was written.
   `ollama serve &` then `ollama run nemotron-3-nano:4b "ok"`.
3. **Publish the module:** `cd backend/spacetime && spacetime publish --server local claura --yes`.
4. **Start the live run and leave it waiting:** `cd backend/agents && npm run demo`. It stops at
   `waiting for human approval of proposal #N` and waits forever by default. Note `N`.
5. **Open the console** at `http://localhost:4317/?demo=1&view=overview` (it has `strictPort`, so 4317 must be free).
6. **Pre-type the terminal commands** in a second shell, in this order (replace the ids):
   ```bash
   spacetime sql --server local claura "SELECT id, agent, action, target, status, decided_by FROM proposal"
   spacetime call --server local claura approve N '"warden"'
   spacetime call --server local claura propose_action INCIDENT_ID '"warden"' '"reimage_host"' '"b14-gpu-07"' '"judge asked"'
   spacetime call --server local claura approve N '"RK"'
   spacetime sql --server local claura "SELECT id, status, blast_score FROM incident"
   spacetime sql --server local claura "SELECT * FROM policy"
   ```
   Get `INCIDENT_ID` from `SELECT id, status FROM incident`. Ids keep counting across resets, so check them each run.
7. Make the terminal font large (at least 18 pt) and clear the scrollback.
8. After each judge: `Ctrl-C` the runner and run `npm run demo` again. It resets the database itself.

## If something breaks

Go down this list. Each step keeps the "real gate" part of the story.

| Problem | Switch to | What you lose |
|---|---|---|
| Nemotron slow or Ollama down | `npm run demo -- --scripted`. Same reducers and same gate, canned agent text. Say so. | The model, not the gate |
| SpacetimeDB won't start | `npm run demo -- --mem --scripted`. The in-memory mirror of the module, same rules. | The real database |
| Laptop or terminal trouble | The demo video | Everything live |
| Nothing works | The console on its own, presented as "the operator experience, scripted" | The proof |

Never let a judge watch a 70-second live run in silence. If a live run is needed, start it and keep talking over the
console.

## Judge questions, with answers from the code

**"Is the console live?"** No, it is a scripted replay of the same incident. The live system is the terminal. Wiring
the console to the tables is the next step, and the generated bindings already exist
(`backend/agents/src/module_bindings`).

**"Why use an LLM at all? This is a playbook."** The playbook order is fixed on purpose. The model's job is reading
messy signals, picking which guests are exposed and writing the report. The gate means a wrong answer can only be
wrong in a safe direction: a refused proposal, never a wrong action.

**"How much did the model actually do?"** Each agent card records `model`, `model+fallback`, `fallback` or
`scripted`. In both logged live runs all four agents finished on the model with zero bad tool calls and no fallback
(Warden: 8 turns, 7 proposals). Have the summary table at the end of `backend/runs/live-run-1.log` open in case they
ask to see it.

**"Show me the model being stopped."** That is the terminal part of the demo: an agent name as approver is rejected,
a denied action is blocked, and an unknown host is blocked by the target check.

**"Did the model pick the destructive action itself?"** No. The `reimage_host` attempt is a scripted red-team probe,
and the runner prints that. If the model ever proposes a denied action itself, the runner reports that instead and
skips the probe.

**"Can't anyone just call `approve` with your name?"** Yes, today. `approve` and `set_policy` check the name, not the
caller's identity (`ctx.sender`). The gate protects against the model, not against a hostile client. Binding operator
identities is the first item on the list. Saying this before they find it earns trust.

**"Prompt injection through log text?"** Signals reach the model only as tool results. The worst injected text can do
is make the model propose something, and the policy still decides. A forged approval is impossible because the model
has no approve tool.

**"How is the attacker kept out of the War Room?"** It is designed as an out-of-band channel on separate
infrastructure. In this build it is scripted. Don't claim more than that.

**"9.4 seconds? Really?"** 9.4 s is the scripted replay. A live run on a laptop with a 4B model takes 30–80 s from the
first signal to the approval card, and most of that is Warden. Both are faster than paging a human at 3 am, which is
the comparison that matters.

**"What would it take to run this for real?"** Real telemetry in place of fixtures (IOMMU faults, VMM audit, EDR),
effects that call the hypervisor and network APIs instead of updating rows, and identity on the reducers. The gate and
the data model stay as they are.

## What to build before judging, ranked

Ranked by how much each changes what a judge sees, against how long it takes.

| # | Change | Time | Why |
|---|---|---|---|
| 1 | **Relabel the console's false claims.** `shell.ts:37,50`: "synced · SpacetimeDB" and "SpacetimeDB · live sync" become "replay" or are removed. Check the Agents view's "nemotron-on-prem" tag for the same issue. | 10 min | A sponsor judge who catches this stops trusting everything else. |
| 2 | **Rehearse the terminal part twice** with the checklist above, including a reset between runs. | 20 min | It is the proof, and it is all typing. |
| 3 | **Update `docs/DEVPOST.md` and `docs/PITCH.md`.** Both were written before the backend existed (PITCH says "no backend") and still use the old name in places. | 30 min | Devpost closes at noon. Judges read it first. |
| 4 | **Record the video from the new console:** `?demo=1&view=incident&play=1&approveAt=7.4`, a screen recording, then 20 s of the terminal part. The film project has a "Bulkhead" voice-over and old dark stills, so don't use it. | 45 min | The pitch guide asks for under 2 minutes. A plain recording beats an unrendered film. |
| 5 | **A live strip in the console:** subscribe to `incident_event` and `proposal`, show the newest rows on the Incident view, and point the approve button at the `approve` reducer. Keep the scripted replay for the story. | 1.5–2 h | Turns "two programs" into one, and makes the Spacetime track entry hard to argue with. Medium risk. Only do it if 1–4 are done. |
| 6 | **Build the 3D facility** and copy it into the console (README §11). | 10 min | Without it the Overview silently uses the 2D map. Nice but optional. |
| 7 | **Leave the secure shell and voice out of the demo.** Their server entry points are not in the repo. | 0 | Mention them only as "designed" if asked. |

Don't run `npm run push` (`tools/push.mjs`) to ship any of this. It stages everything, commits with a fixed co-author
line and pushes straight to `main`.
