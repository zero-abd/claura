# Claura: Devpost write-up

Paste each section into the matching Devpost field. Fill the three links, run the checklist at the bottom, and delete
this block before pasting.

**Project name:** Claura

**Tagline:** Seal the breach before it spreads.

**Elevator pitch:**
Incident response for AI data centers. When a sandboxed AI workload tries to escape its VM, four Nemotron agents
contain it, reversible steps first, through a policy gate in SpacetimeDB. Quarantine waits for a person.

**Tracks to select** (cap reported as three, see HACKATHON.md §6): NMC² Keep the World Running, NVIDIA Use Nemotron
Beyond a Chatbot, Spacetime.

**Try it out:** [landing page link] · **Video:** [public link] · **Repo:** https://github.com/zero-abd/claura

---

## Inspiration

AI agents now run model-written code inside sandboxes, and each sandbox is a guest VM on a shared GPU host. The VM is
the wall between one tenant's code and everyone else's. Guest-to-host escapes are real: public examples include a
QEMU vhost-user-gpu out-of-bounds write (CVE-2021-3546) and a guest-to-host escape through a QEMU/KVM virtio device
shown at Black Hat Asia 2020. When one happens, the first minutes decide how far it spreads, and the response today is
a page, a runbook and a person doing six things in the right order.

We wanted a responder that is fast like an agent but cannot do anything a person hasn't allowed.

## What it does

Claura handles one scenario end to end: an AI workload in guest VM `vm-7f3a` tries to escape through the vGPU path on
host `b14-gpu-07`, which carries 11 other tenants.

Four defender agents work the incident:

- **Sentry** reads six signals (an IOMMU fault, a vGPU driver fault, a VMM audit ioctl, host EDR seeing `qemu` spawn
  a shell, a flow to the IPMI port, a workload token used outside its scope) and opens one incident.
- **Triage** checks the host inventory and network reachability and scores the blast radius (0.87).
- **Warden** contains it, reversible steps first: isolate the guest's network, revoke its credentials, cordon the
  host, pause the guest, capture its memory, fail the 11 neighbors over to clean hosts. No live migration off a
  suspect host, because that copies guest memory through a hypervisor we no longer trust.
- **Scribe** writes the incident report from the database's own event log.

The agents never execute anything. Each action is a proposal to a **policy gate inside SpacetimeDB**, which runs it,
blocks it or holds it for a person, based on a policy table. Quarantining the host is held: an operator approves it
from one card showing evidence, scope and rollback (or presses ⌘↵). Destructive actions like reimaging the host are
denied outright, and the gate refuses an approval that comes from an agent.

The operator console has two parts. A **replay** of the incident tells the story in 10 seconds. A **Live** view
shows the real database rows as the agents write them, and its buttons call the real reducers, so a judge can try to
have Warden approve its own quarantine and watch SpacetimeDB refuse.

**What is real and what is simulated.** Real: the SpacetimeDB module and its policy gate, the four agents calling
tools on NVIDIA Nemotron 3 Nano 4B running locally through Ollama, human approval, the report, the Live view.
Simulated: the telemetry (fixture signals), the fleet (seeded hosts and guests), and the effects of containment, which
change database rows and touch no real infrastructure. The replay's 9.4 s is a scripted timeline; a live run on a
laptop takes about a minute.

## How we built it

- **SpacetimeDB module (TypeScript).** Tables for hosts, guests, signals, incidents, findings, policy, proposals, the
  incident event log, agent state and reports. Reducers are the only way to change state. `propose_action` is the
  policy gate: it fails closed on unknown actions or malformed policy, checks that the target exists (no hallucinated
  hosts), and either applies the effect, blocks it, or marks it pending. `approve` rejects agent names as approvers
  and contains the incident when the quarantine is approved. The rule that quarantine needs a human is a seeded
  policy row, not code.
- **Agents (Node.js).** Each agent runs a tool loop against Nemotron 3 Nano 4B on Ollama (temperature 0, fixed seed,
  no thinking mode). Tool calls are schema-checked, duplicate calls are refused, transient errors retried, and an
  agent is done only when the database shows its work, not when the model says so. If the model fails, a
  deterministic fallback does only the missing work, and the agent's card says which one ran. In both logged live
  runs, all four agents finished on the model with zero bad tool calls.
- **Operator console (TypeScript, Vite, no framework).** One animation clock drives the replay from a single script
  file. The Live view subscribes to the module through generated bindings and calls `approve` and `propose_action`.
- **Landing page.** A dithered floor plan of the four data halls that replays the incident with a scrubber.
- **3D facility (three.js)** and a **secure shell** design (short-lived SSH certificates, passkey step-up, a
  hash-chained ledger) are in the repo but not wired into the console yet.

## Challenges we ran into

- **Making a 4B model reliable at tool calling.** It would stop early, repeat calls or answer in prose. The fix was a
  loop that checks done-ness against the database, refuses duplicates, salvages prose answers, nudges, and falls back
  deterministically, while recording honestly which path ran.
- **Ordering the response.** The hard question was not what to do but in what order: reversible steps first, evidence
  before anything destructive, and the one step that takes a host out of service waiting for a person.
- **No live migration.** The obvious move, migrating the neighbors away, copies their memory through the host we are
  trying not to trust. We fail them over to clean hosts instead.
- **Honest demo.** A fast scripted replay can look like a finished product. We split the console into a labelled
  replay and a Live view on the real database, so nothing on screen claims more than it does.

## Accomplishments that we're proud of

- A policy gate the model cannot get around, because it lives in the database rather than in the prompt.
- Agents that run fully on a local model, with every fallback recorded instead of hidden.
- A judge can try to break it from the console: an agent approving its own quarantine is refused, a reimage is
  blocked, and a person's approval contains the incident.

## What we learned

- Separating who proposes from who permits is the whole idea. Models are good at reading messy signals and writing
  reports; permission should come from deterministic policy.
- For a small model, checking "done" against the system's state matters more than prompt wording.
- For incident response the interface is part of the safety design: a person decides faster when evidence, scope and
  rollback are on one screen.

## What's next for Claura

1. Bind operator identities to reducers. Today `approve` checks a name, not the caller.
2. Real signal sources: hypervisor audit, IOMMU fault logs, host EDR, BMC and IPMI flows, workload identity.
3. Effects that call the hypervisor and network, not just database rows.
4. Wire the secure shell and the 3D facility into the console.
5. Measure: time to contain, false-positive rate, the cost of a wrong fail-over, and prompt injection through
   telemetry.

## Built with

TypeScript, SpacetimeDB, NVIDIA Nemotron 3 Nano, Ollama, Node.js, Vite, three.js, HTML Canvas, Geist

---

## Pre-submit checklist

- [ ] The three links are filled in and public
- [ ] The tracks selected match the three above (or fewer)
- [ ] The video shows the Live view, not only the replay
- [ ] The "What is real" paragraph still matches the repo
- [ ] CVE references: CVE-2021-3546 is at https://nvd.nist.gov/vuln/detail/CVE-2021-3546 ; check NVIDIA's bulletin
      before naming a vGPU Manager CVE
- [ ] The no-live-migration rationale matches the team's intent
