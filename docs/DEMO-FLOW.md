# Demo flow

How to run the Claura demo for judges: 3 minutes of pitch plus 2 minutes of questions (the HackUTD format), the setup,
and what to do when something breaks. What to say, including track lines and judge questions, is in
[PITCH.md](PITCH.md).

Judging is Sun 8 Nov, 1:00–4:00 pm. Devpost closes at 12:00 pm CST.

## The idea

The console has two kinds of view, and the demo uses both, named for what they are:

- **Incident** (and Overview, War Room, Agents, Reports) is a **scripted replay** of INC-0419. It tells the story in
  10 seconds and always works. The toolbar says "Replay · scripted".
- **Live** shows **real rows from SpacetimeDB**, written by the agents running on Nemotron on this laptop. Its buttons
  call the real reducers. The toolbar says "Live · SpacetimeDB".

The simulated judge panel's top criticism was "claims outrun the build". Telling the story with the replay, then
proving it in Live, answers that before anyone asks.

## The 3 minutes

Before the judge arrives, a live run has already reached the approval step and is waiting (setup below), because a
live Nemotron run takes 60–80 s.

| Time | View | Say | Do |
|---|---|---|---|
| 0:00 | Overview | "AI agents now run inside data centers. When one breaks out of its VM, everything on that GPU host is exposed, and responders have minutes." | Nothing. Let the fleet view sit. |
| 0:15 | Incident | "This is a replay of the incident we model: an agent escapes through the vGPU path on b14-gpu-07, with 11 other tenants on the host." | Switch to tab 2 and reload it. The replay starts on load and reaches the approval card at 5.5 s. |
| 0:45 | Approval card | "Four agents detect it, size the blast radius and contain it, reversible steps first. Quarantine is the one step a person must approve. You approve it." | **Hand the judge the keyboard.** They press ⌘↵. Contained at 9.4 s. |
| 1:05 | Live | "That was the replay. This is the real system. SpacetimeDB holds every row, and Nemotron ran these agents on this laptop a minute ago. They're waiting for us." | Click the "Replay · scripted" pill or the Live tab. Point at the proposals: six executed, reimage blocked, quarantine waiting. |
| 1:30 | Live | "The model can only propose. Let Warden approve its own quarantine." | **Let Warden approve it** → "Refused by SpacetimeDB: agents cannot approve proposals; a human operator must". |
| 1:45 | Live | "And a destructive action, asked for directly." | **Ask Warden to reimage the host** → a new `blocked` row, decided by policy. |
| 2:00 | Live | "A person approves." | ⌘↵ (or **Approve as RK**). The incident turns `contained`, and Scribe's report appears a few seconds later. |
| 2:25 | Live or Policy | "The rule is data, not code: one policy row says quarantine needs a human. The gate is a reducer inside the database, so a model mistake can't get around it." | Point at the Policy column in the proposals table. |
| 2:45 | Any | Track line from PITCH.md, then: "Agents propose, policy decides." | Stop. |

Why this order works:

- The judge pressing ⌘↵ is the moment they will remember. It shows the product's whole idea, a person holding the
  last key, without explanation.
- In Live, the judge watches three refusals happen against the real database instead of taking our word for it.
- Saying "replay" first takes the "is it live?" question off the table.

## Setup (10 minutes before judges arrive)

1. **Free port 3000.** On this laptop another project's Next.js dev server (`~/Codes/ak/utd`, iynk) listens on 3000,
   which is SpacetimeDB's default. Stop it, or run SpacetimeDB on another port:
   ```bash
   spacetime start --listen-addr 127.0.0.1:3100 &
   export STDB_URI=ws://127.0.0.1:3100      # for the agents
   # publish and sql with: -s http://127.0.0.1:3100
   # open the console with: ?live=1&stdb=ws://127.0.0.1:3100
   ```
2. **Start Ollama and warm the model:** `ollama serve &`, then `ollama run nemotron-3-nano:4b "ok"`.
3. **Publish the module:** `cd backend/spacetime && spacetime publish --server local claura --yes`.
4. **Start the live run and leave it waiting:** `cd backend/agents && npm run demo`. It stops at
   `waiting for human approval of proposal #N` and waits indefinitely.
5. **Open the console** (`cd apps/dashboard && npm run dev`) in two tabs:
   - Tab 1: `http://localhost:4317/?demo=1&live=1` on Overview, for the opening.
   - Tab 2: `http://localhost:4317/?demo=1&live=1&view=incident&play=1`. It plays on load, so reload it at 0:15.
     (`demo=1` hides the "Simulate breach" button; this URL replaces it.)

   Check that the toolbar pill says "Live · SpacetimeDB" and the Live view shows the quarantine waiting.
6. Zoom the browser so the back row can read it.
7. **Between judges:** `Ctrl-C` the runner and run `npm run demo` again. It resets the database itself, and the
   console follows.

## If something breaks

Each step down keeps the "real gate" part of the story.

| Problem | Switch to | What you lose |
|---|---|---|
| Nemotron slow or Ollama down | `npm run demo -- --scripted`: same reducers and gate, canned agent text. The Agents panel in Live says "scripted (no model)", so say so. | The model, not the gate |
| Console can't connect | The same three steps in a terminal (below) | The visuals |
| SpacetimeDB won't start | `npm run demo -- --mem --scripted`: the in-memory mirror of the module, same rules | The real database |
| Laptop trouble | The demo video | Everything live |
| Nothing works | The replay on its own, presented as "the operator experience, scripted" | The proof |

Never let a judge watch a 70-second live run in silence. If one is needed, start it and keep talking over the replay.

**Terminal version of the proof** (replace the ids; get them from the first two queries):

```bash
spacetime sql --server local claura "SELECT id, status FROM incident"
spacetime sql --server local claura "SELECT id, agent, action, target, status, decided_by FROM proposal"
spacetime call --server local claura approve N '"warden"'
spacetime call --server local claura propose_action INCIDENT_ID '"warden"' '"reimage_host"' '"b14-gpu-07"' '"judge asked"'
spacetime call --server local claura approve N '"RK"'
```

Ids keep counting across resets, so check them each run.

## Before judging

| Status | Change |
|---|---|
| Done | Console labels say "replay" where the data is scripted (no more "synced · SpacetimeDB" on a replay) |
| Done | Live view in the console, tested end to end against the module and the runner |
| Done | `DEVPOST.md` and `PITCH.md` rewritten for what shipped |
| To do | **Record the video** from the new console: the replay (`?demo=1&view=incident&play=1&approveAt=7.4`), then 30 s of Live. Keep it under 2 minutes. The film project has a "Bulkhead" voice-over and old dark stills, so don't use it. |
| To do | **Rehearse twice** with the setup above, including a reset between runs |
| To do | Paste DEVPOST.md into Devpost and pick the tracks before noon |
| Optional | Build the 3D facility and copy it into the console (README §11). Without it the Overview uses the 2D map. |
| Skip | The secure shell and voice. Their server entry points are not in the repo. Mention them only as designed. |

Don't run `npm run push` (`tools/push.mjs`) to ship changes. It stages everything, commits with a fixed co-author
line and pushes straight to `main`.
