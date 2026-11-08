# Claura: pitch kit

Format reminder: HackUTD's pitching workshop says **3 minutes to pitch, 2 minutes for judge questions** ([source](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md)). MLH-style table judging is often shorter, about 3-4 minutes per team in total ([MLH](https://guide.mlh.com/general-information/judging-and-submissions/judging-plan)). So the main script below is 2 minutes, leaving a minute of slack. Be ready to cut it to 30 seconds.

Anything in `[brackets]` depends on whether the Spacetime and Nemotron integrations shipped (see HACKATHON.md section 5). Say only what is true on the day.

## 1. 30-second elevator pitch

> AI agents now run model-written code inside sandbox VMs on shared GPU hosts. If one escapes through the vGPU path, it can reach the host and every other tenant on it. Claura is incident response for that moment. Four agents, Sentry, Triage, Warden and Scribe, correlate the signals, map the blast radius, and contain the host with reversible steps first. A person approves the one high-impact step, quarantining the host, from a single card showing evidence, scope and rollback. Today it is a front-end prototype with scripted data that tests the workflow. Seal the breach before it spreads.

About 95 words, roughly 35 seconds. To get to 30, drop "from a single card showing evidence, scope and rollback".

## 2. Two-minute judge-table script

### Setup (before the judge arrives)
- Run the prototype locally (`npm run dev`, port 4317) and keep claura.tech open as a backup.
- **Tab 1:** `http://localhost:4317/` shows the nominal state: status NOMINAL, "No open incidents", facility map, "Mean time to contain 11.8 s".
- **Tab 2:** `http://localhost:4317/?play=1`. Loading this URL starts the incident immediately, so do not open it early. Open it in a second tab, load it once, and press **Cmd+R** at the moment you say "watch". The script waits at the approval gate, so you can talk over the card for as long as you need.
- If the incident ever needs a reset, reload the page without `?play=1`.
- There is no on-screen play button in the prototype; autoplay comes from `?play=1` only.
- Two people: one talks, one drives (HackUTD workshop roles).

### Script with demo steps

| Time | Screen and action | Say |
|---|---|---|
| 0:00-0:15 | Tab 1, nominal console. | "AI agents now run code in sandbox VMs on shared GPU hosts. The VM is the wall between one tenant's code and everyone else's. This is a facility running tens of thousands of sandboxes. Now one of them tries to break out through the vGPU path." |
| 0:15-0:25 | Stay on Tab 1. Point to the tagline in the header. (The prototype has no on-screen "scripted data" label yet; adding a small one is recommended, see HACKATHON.md checklist.) | "I'll be straight about what you're about to see: Claura is a front-end prototype with scripted data, built to test the workflow. Every number is illustrative." |
| 0:25 | **Switch to Tab 2 and press Cmd+R.** | "Watch." |
| 0:25-0:45 | The signal stream fills; the attack path lights up; the right panel shows Sentry, Triage, Warden, Scribe. The run holds at the approval card. | "Sentry correlated six signals in the first second: an IOMMU fault, a vGPU driver fault, a VMM audit event, the host's EDR seeing qemu spawn a shell, a flow to the IPMI port, and a token used outside its scope. Triage built the attack graph: one suspect host, eleven co-resident guests, and a reachable management plane." |
| 0:45-1:05 | Point to the **Containment plan**, steps 1-6 completed. | "Warden did the reversible things first: detached the guest's network, revoked its credentials, cordoned the host. Then it paused the guest, captured its memory over the management path, and failed over the eleven neighbors to clean hosts. No live migration off a suspect host." |
| 1:05-1:25 | Point to the **approval card** for step 7, "Quarantine host b14-gpu-07". Read the three fields. Point to the note "Warden cannot quarantine a host on its own." | "This is the one step that needs a person: taking the host out of the pool. The card shows the evidence, the scope, and the rollback on one screen. Warden cannot do it alone." |
| **1:25** | **Click "Approve quarantine"** (or press Cmd+Enter). | "I approve." |
| 1:25-1:35 | The counter freezes at **9.4 s**. The headline changes to the contained state. | "Contained in 9.4 seconds. That's demo data, not a measurement, and it assumes I approve right away. Real operators take longer, which is why the card exists." |
| 1:35-1:50 | Click **Open report**. Scroll the timeline slightly. Press Esc to close. | "Scribe wrote the timeline: each row says who authorized it, and the evidence has hashes. Everything is one record." |
| 1:50-2:00 | Stay on the console. | "[If shipped: The incident state is in SpacetimeDB and the triage you saw came from a real Nemotron call. The policy layer, not the model, decides what is allowed.] [If not shipped: In the design, Nemotron runs on-prem so telemetry stays in the building, a policy layer decides which actions are allowed, and SpacetimeDB is the shared incident state. Those are planned, not built.] Seal the breach before it spreads." |

If the judge interrupts, answer, then say "I'll finish the run" and click Approve.

### Add-on lines by judge's track (10 seconds each; use only the one that matches)

- **NMC² (Keep the World Running):** "Your brief names missed warnings, unclear handoffs and wrong information at the wrong time. Sentry is the missed warning, one synced timeline is the handoff, and the approval card is the right information at the right time."
- **NVIDIA (Nemotron beyond a chatbot):** "[If shipped: Triage calls Nemotron with tools to look up co-resident guests and token scope, then returns a structured proposal that the policy layer checks.] [If not: This is the planned Nemotron agent loop; we haven't integrated it yet.]"
- **Spacetime:** "[If shipped: The incident is a set of tables; reducers enforce the policy gate and the approval; this window and a second console see the same rows.] [If not: Spacetime is the planned incident state machine; today the demo is scripted.]"
- **Winstead (if entered):** "Every action has an actor and an authorizer, evidence is hashed, and the scope is stated. The report is built to be read by someone who was not in the room. What it lacks today: user administration and in-app chat."

## 3. Eight likely judge questions

Facts in the answers are from the prototype data or from linked sources. Do not invent numbers.

**1. Why agents instead of SOAR playbooks?**
Agents do the parts that playbooks are bad at: correlating six different signal types into one incident, reasoning about blast radius for this specific host, and writing the report. Execution stays deterministic. Warden is bounded by a playbook (`guest-escape v3` in the prototype) and a policy layer, so the model proposes and the policy permits. A SOAR playbook is the right tool for the steps; the agent is useful in deciding which playbook applies and with what scope. Honest caveat: in the prototype the agent text is scripted, so we have not yet shown a model doing this well. `[If Nemotron shipped: only Triage is a real model call.]`

**2. What if the model is wrong?**
Three layers limit the damage. First, the policy layer rejects any action outside the allowlist, so a wrong model cannot invent a new action. Second, the first steps are reversible: reattaching a vNIC, reissuing credentials and uncordoning a host are all cheap to undo. Third, the one step that removes a host from service needs a human, and that person sees the evidence and the rollback. What we have not done is measure how often the model is wrong; that is the first thing to test.

**3. What is the cost of a false positive?**
The honest answer is that the largest cost sits in the automated part. Failing over 11 co-resident guests restarts 11 workloads on other hosts, and we do not live-migrate. The cost is real and we have not measured it. The mitigations are design choices rather than data: reversible steps first, a score threshold before the plan runs (Triage scored this case 0.87 in the demo data), a per-tenant policy that can require approval for fail-over, and a one-screen card so a human can reject quickly. The quarantine itself is cheap to undo: un-quarantine returns the host to the pool.

**4. How is this different from Wiz or CrowdStrike?**
They are detection and posture products: Wiz for cloud configuration and workload risk, CrowdStrike for endpoint detection and response. Claura is the response layer for one specific incident class, a suspected guest-to-host escape on a multi-tenant GPU host, and it consumes signals like host EDR rather than replacing them. The differentiator is the ordering: reversible containment, memory capture over a trusted management path, fail-over of neighbors, and a single human gate. We have not built integrations with either; this is idea validation, not a competitive product.

**5. Is VM escape real?**
Yes. Public examples: CVE-2021-3546, an out-of-bounds write in QEMU's vhost-user-gpu that [NVD](https://nvd.nist.gov/vuln/detail/CVE-2021-3546) says can let a malicious guest crash the host QEMU process or potentially run code on the host; a Black Hat Asia 2020 talk demonstrated a guest-to-host escape through a QEMU/KVM virtio device ([slides](https://i.blackhat.com/asia-20/Thursday/asia-20-Shao-3D-Red-Pill-A-Guest-To-Host-Escape-On-QEMUKVM-Virtio-Device.pdf)); and two VM escapes were demonstrated at Pwn2Own 2017 ([Computerworld](https://www.computerworld.com/article/1667668/pwn2own-ends-with-two-virtual-machine-escapes.html)). NVIDIA vGPU Manager has also had guest-reachable host vulnerabilities, for example CVE-2024-0099 per a [third-party tracker](https://www.sentinelone.com/vulnerability-database/cve-2024-0099/); check NVIDIA's bulletin before quoting versions. They are rare and expensive to exploit, but the host holds many tenants, so the impact is large. Claura assumes the escape is rare and the response time matters.

**6. What is real in the demo and what is scripted?**
The front-end is real: console, map, attack path, plan, approval flow, report. The telemetry, the agent text and every number are scripted, including the 9.4 s and the fleet sizes. The 9.4 s also assumes the approval comes at a fixed moment, so a real number would be longer. `[If shipped: The incident state is real rows in SpacetimeDB and Triage is a real Nemotron call; the telemetry feeding them is simulated.]` The point of the prototype is to test the workflow and the approval card, not to claim performance.

**7. Could an attacker manipulate the agents? Logs contain attacker-controlled text.**
Yes, that is the right concern, and it is why the model is not the authority. The design treats guest-influenced strings (process names, command lines) as data in structured fields, not as instructions; the model can only propose from a fixed action set; the policy layer checks every proposal; and the host-level step needs a human. It is a planned design, not a tested one. Testing prompt injection through telemetry is on the list of next steps.

**8. Why Nemotron on-prem and why SpacetimeDB?**
On-prem Nemotron is about data: incident telemetry can contain customer workloads and credentials, and many operators will not send it to an outside API during an incident. `[If shipped: In this demo we call NVIDIA's hosted API; the same OpenAI-compatible client works against a self-hosted NIM.]` SpacetimeDB fits because an incident is a sequence of state changes that every operator must see in the same order: reducers commit signals, proposals and approvals atomically, and subscriptions push them to all consoles. A conventional database plus a websocket layer could do it too; Spacetime removes the sync layer. `[If not shipped: Both are planned architecture, not part of the prototype.]`

## 4. Table logistics
- Keep your project number visible (MLH advice).
- Open with the problem, not your names. Say the tagline once, at the end.
- State "prototype, scripted data" within the first 30 seconds. Judges who find out later discount everything else.
- Do not read the screen aloud. Point at one thing at a time.
- HackUTD's own advice: the pitch is a story (problem, solution, demo, impact, next), not a feature list, delivered as if persuading an investor ([HackUTD workshop](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md)).
- Rehearse twice with a timer. Rehearse the failure case: wifi down, tab closed, judge arrives late.
- Fallback if the demo breaks: play the video from your phone and keep talking.
