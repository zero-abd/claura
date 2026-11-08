# Claura: Devpost write-up

How to use this file: paste each section into the matching Devpost field. Lines in `[UPDATE IF ...]` brackets are conditional. Keep the "planned" wording unless the integration really shipped, then use the replacement text and delete the marker. Remove this block before pasting.

**Project name:** Claura

**Tagline:** Seal the breach before it spreads.

**Elevator pitch** (check the field's character limit):
Agentic incident response for AI data centers: when a guest VM tries to escape to the host, four agents contain it with reversible steps first, and a human approves the one high-impact step.

**Tracks to select** (see HACKATHON.md section 6): NMC² Keep the World Running. Add NVIDIA and Spacetime only if the integrations shipped.

**Try it out:** https://claura.tech  (confirm it is live and that `?play=1` plays the incident)
**Video:** [paste public link]
**Repo:** [paste public GitHub link]

---

## Inspiration

AI agents now run model-written code inside sandboxes, and each sandbox is a guest VM on a shared GPU host. The VM is the wall between one tenant's code and everyone else's. Guest-to-host escapes are real: public examples include a QEMU virtio-gpu out-of-bounds write (CVE-2021-3546) and NVIDIA vGPU Manager flaws. When one happens, the first minutes decide how far it spreads, and the response today is a page, a runbook and a human doing six things in the right order.

A ship handles this with bulkheads. The hull is divided into compartments, so one breach floods one compartment instead of sinking the ship. We wanted the same behavior for a data center: close the compartment first, then work out what happened.

## What it does

Claura is a prototype operator console for one scenario: an AI workload in a guest VM tries a suspected guest-to-host escape through the vGPU path.

Four defender agents work the incident:

- **Sentry** correlates six signals into one incident: a VMM audit ioctl, a vGPU driver fault, an IOMMU fault, host EDR seeing `qemu` spawn a shell, an east-west flow to the IPMI port, and a workload token used outside its scope.
- **Triage** builds the attack graph and blast radius: 1 suspect host, 11 co-resident guests, 2 exposed tokens, and a management plane that is reachable.
- **Warden** contains the incident, reversible steps first: detach the guest's vNIC, revoke its workload credentials, cordon the host. Then it pauses the guest, captures its memory over a trusted management path, and fails the 11 co-resident guests over to clean hosts. It does not live-migrate off the suspect host, because that would move guest memory through a hypervisor we no longer trust.
- **Scribe** writes the forensic timeline, with hashed evidence and who authorized each step.

One step needs a person: quarantining the host. Warden cannot do it alone. The approval card shows the evidence, the scope (1 host, 11 guests failed over) and the rollback (un-quarantine returns the host to the pool) on one screen, with a single **Approve quarantine** button (also Cmd+Enter).

In the demo the incident is contained in 9.4 seconds. **That number is illustrative demo data, not a measurement**, and it includes the operator approving at a fixed moment.

**What is real today and what is scripted.** Real: the front-end console, the facility map, the attack-path view, the containment plan, the approval flow and the Scribe report drawer. Scripted: all telemetry, the agents' reasoning text, every number on screen (2,048 hosts, 61,207 sandboxed agents, the 11.8 s mean) and the 9.4 s counter. There is no backend in the core prototype.

`[UPDATE IF SPACETIME SHIPPED: add] The signal stream, proposals and approvals are now real rows in a SpacetimeDB database. The Approve button calls a reducer, and open consoles update from a subscription. The telemetry feeding it is still simulated.`

`[UPDATE IF NEMOTRON SHIPPED: add] The Triage panel shows output from a real call to NVIDIA Nemotron (model: [model id]) that uses tools to look up co-resident guests and token scope, then returns a structured proposal. The call goes to NVIDIA's hosted API in this demo.`

## How we built it

**Built for this hackathon**
- A front-end prototype in TypeScript and Vite with no UI framework: a canvas facility map (4 halls, 128 racks), an attack-path chain, a signal stream, the containment plan, four agent panels, and a report drawer.
- A scripted incident timeline that drives all of it. The script pauses at the approval gate and waits for the operator.
- A dark control-room visual system with two signal colors only: orange for breach and action, green for sealed.

**Architecture we designed and have not built yet (planned)**
- The defender agents reason with **NVIDIA Nemotron self-hosted on-prem**, so incident telemetry stays inside the building.
- A **policy layer, not the model, decides which actions are allowed.** The model proposes; the policy accepts or rejects against an allowlist; high-impact actions need a human.
- **SpacetimeDB is the incident state machine.** Reducers commit signals, proposals and approvals; subscriptions keep every operator console on the same live timeline; the audit trail is the data.

`[UPDATE IF SPACETIME SHIPPED: replace the SpacetimeDB bullet with] SpacetimeDB holds the incident state. Tables: incident, incident_event, action. Reducers: ingest_signal, propose_action (the policy gate), approve_action. The console subscribes to incident_event.`

`[UPDATE IF NEMOTRON SHIPPED: replace the first planned bullet with] Triage calls Nemotron through an OpenAI-compatible API with three tools (co-resident guests, token scope, management-plane reachability) and returns a JSON proposal. Self-hosting the same model on-prem remains the planned deployment.`

## Challenges we ran into

- **Ordering the response.** The hard design question was not what to do but in what order. Reversible steps come first; evidence capture comes before anything destructive; the one step that removes a host from service waits for a person.
- **No live migration.** The obvious move, migrating the neighbors away, copies their memory through the host we are trying not to trust. We replaced it with fail-over to clean hosts.
- **Showing a complete decision on one card.** An operator under pressure should not have to open three tabs to decide. Getting evidence, scope and rollback onto one card, readable at a glance, took the most design iterations.
- **Honest scope.** A fast scripted demo can look like a finished product. We kept a clear line between what the prototype shows and what it does not do, and labeled demo numbers as illustrative.

## Accomplishments that we're proud of

- A complete incident arc in a single screen: detection, blast radius, six containment steps, one human decision, and a filed report.
- A containment order that puts every reversible step before the one that is not, and a gate that the agent cannot bypass.
- A report drawer that reads like a real forensic timeline: each row says who or what authorized it, and the evidence files carry hashes.
- A prototype we can show in under two minutes without explaining the premise.

## What we learned

- For incident response, the interface is part of the safety design. The speed of a human decision depends on how much evidence is already on the screen.
- Separating "who proposes" from "who permits" is the core idea: models are good at correlating and summarizing; permission should come from deterministic policy.
- Scripted demo data is useful for testing a workflow with real people before building any telemetry pipeline, as long as it is labeled.

## What's next for Claura

1. Wire the planned architecture: the policy layer, and SpacetimeDB as the incident state machine.
2. Replace scripted agent text with Nemotron reasoning behind that policy layer, then self-host it on-prem.
3. Connect real signal sources: hypervisor audit logs, IOMMU fault logs, host EDR, BMC and IPMI flow logs, workload identity logs.
4. Measure instead of illustrate: time to detect, time to contain, the false-positive rate, and the cost of a wrong fail-over.
5. Test the approval card with real data center operators.

## Built with

Built today:
- TypeScript
- Vite
- HTML5 Canvas
- CSS
- Archivo and IBM Plex Mono (fonts)

Planned architecture (not yet built):
- NVIDIA Nemotron (self-hosted, on-prem)
- SpacetimeDB

`[UPDATE IF SHIPPED: move the shipped items from "Planned" to "Built today" and add: NVIDIA Nemotron via build.nvidia.com API; SpacetimeDB TypeScript module and client SDK; Node.js]`

---

## Pre-submit edits
- [ ] Every `[UPDATE IF ...]` marker is resolved or removed
- [ ] The "What is real today" paragraph matches what is actually in the repo
- [ ] Each sponsor track you selected has a sentence above that names the sponsor technology and what it does
- [ ] Replace "11 co-resident guests", "2,048 hosts" and similar only if the script data changes
- [ ] The no-live-migration rationale reflects the team's intent (it is written from the stated design; correct it if the team's reasoning differs)
- [ ] The two CVE references in "Inspiration": CVE-2021-3546 is documented at https://nvd.nist.gov/vuln/detail/CVE-2021-3546 ; for NVIDIA vGPU Manager, confirm the specific CVE on NVIDIA's security bulletin before naming it
