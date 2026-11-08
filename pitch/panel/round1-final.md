# HackUTD 2026 Judge Panel Review: Claura

## Executive verdict

The strongest direction is a hybrid:

- Use **Crime Scene** for the opening problem: “The attacker is reading your email.”
- Use **Immune System** as the durable product category and closing metaphor.
- Use **Agents vs. Agents** to prove Nemotron’s necessity.
- Borrow only the “seal the compartment” concept from **Bulkheads**; the Titanic history consumes too much of a two-minute pitch.

The single biggest risk is credibility. The drafts repeatedly describe the policy gate, Maincloud War Room, authentication, Secure Shell, and voice as real while their truth checks say some may be static, unwired, or absent. A judge discovering that gap will punish the project more severely than if you disclose it upfront.

Scores below assume you demonstrate only what is actually live. If you state an unchecked feature as built, subtract 2–4 points with the security, legal, NVIDIA, and SpacetimeDB judges.

Draft abbreviations:

- **Immune:** `immune-system.md`
- **Bulkheads:** `bulkheads.md`
- **Crime Scene:** `crime-scene.md`
- **Agents:** `agents-vs-agents.md`

---

# 1. CISO / veteran security engineer

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | The best safety story—deterministic policy, reversible-first actions, evidence, and explicit limitations—but “irreversible quarantine” contradicts its own rollback claims. |
| Bulkheads | 7/10 | Damage containment is the right concept, but the extended ship analogy obscures threat boundaries, authentication, and actual enforcement. |
| Crime Scene | 8/10 | Strongest treatment of compromised communications and evidentiary risk, although the control plane’s isolation is asserted more than architecturally demonstrated. |
| Agents | 8/10 | Clear adversarial-speed argument and useful fail-closed model, but “agents versus agents” invites skepticism about false positives and prompt injection. |

### First place: Immune System

It frames the core security design correctly: the model proposes, deterministic controls authorize, reversible actions precede disruptive ones, and humans retain responsibility. Its Q&A also admits unmeasured false-positive rates and prompt-injection testing gaps.

### Three most important fixes

1. **Stop calling quarantine irreversible.** It is explicitly undoable elsewhere in the drafts.

   Rewrite:

   > “Quarantine is the highest-impact step, so policy requires a named human approver. It can be reversed, but it can also interrupt every tenant on that host.”

2. **Define the trusted computing boundary.** “Off the compromised network” is not enough.

   Rewrite:

   > “Claura’s local response appliance uses a separately administered management plane, independent break-glass identities, and no dependency on corporate SSO, email, or DNS. The stakeholder room connects over a pre-provisioned out-of-band path.”

3. **Treat false positives as a first-class operating risk.**

   Rewrite:

   > “Today we have not measured false-positive rates on real telemetry. Until we do, tenant failover and host quarantine default to approval; only low-blast-radius actions such as revoking one workload token may run automatically.”

---

# 2. Seed-stage VC partner

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | Best company narrative: a narrow GPU-host escape wedge expands into an agent firewall, attestations, and cross-cloud threat intelligence. |
| Bulkheads | 8/10 | Memorable category ambition, but “become the SOLAS of AI clouds” feels grander than the demonstrated customer proof. |
| Crime Scene | 7/10 | A credible Winstead product, but expanding the War Room to every hospital, law firm, and city weakens the AI-data-center wedge. |
| Agents | 9/10 | Excellent why-now and venture-scale platform framing, although incumbents could copy the headline unless execution and data advantages are sharper. |

### First place: Immune System

It has the cleanest wedge-to-platform progression: guest-escape response → policy gate for every agent → cross-cloud immunity. That sounds more like a company than a feature bundle.

### Three most important fixes

1. **Name the first buyer and purchasing trigger.**

   Rewrite:

   > “We sell first to multi-tenant GPU clouds with 500–10,000 hosts, where one escape can expose several customers and trigger SLA, disclosure, and churn risk. The initial buyer is the CISO or head of infrastructure security.”

2. **Replace giant market statistics with a believable beachhead.**

   Rewrite:

   > “Our first market is not every data center. It is GPU clouds that run untrusted customer workloads on shared hosts and cannot staff a hyperscaler-sized incident-response team.”

3. **Make the moat concrete.**

   Rewrite:

   > “The moat is not the LLM. It is the tested containment policies, host-level integrations, incident outcome data, and signed escape fingerprints that improve across participating fleets.”

---

# 3. Winstead PC attorney

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 7/10 | Strong coordination and decision-log story, but it does not explicitly demonstrate admin-managed access or the status of compromised data. |
| Bulkheads | 7/10 | Good incident record and notification clocks, yet it openly concedes two requirements are incomplete. |
| Crime Scene | 9/10 | The most faithful response to Winstead’s clarification, with excellent treatment of hostile communications, privilege, evidentiary integrity, and human coordination. |
| Agents | 7/10 | Capable technically, but Winstead feels appended after the agent-defense story rather than built into the core pitch. |

### First place: Crime Scene

It starts from the organizer’s actual scenario rather than merely mentioning it later. The CISA example, legal channel, named decisions, “know/don’t know” brief, and evidence-preservation language all fit the track.

### Three most important fixes

1. **Explicitly demonstrate admin access management.**

   Rewrite:

   > “The incident administrator adds outside counsel as an individual, assigns the Counsel role, requires a pre-enrolled passkey, and the access change appears immediately in the audit log.”

2. **Show data scope, not merely infrastructure scope.**

   Rewrite:

   > “Current scope: one host and eleven tenant workloads. Customer dataset A: access not observed. Model registry: status unknown. File share FS-12: locked by ransomware. Egress logs: no confirmed exfiltration; investigation active.”

3. **Avoid implying that a `#legal` channel automatically creates privilege.**

   Rewrite:

   > “Counsel controls membership and distribution for the legal workspace. Claura records facts and preserves evidence; counsel—not the software—decides privilege, materiality, and notification obligations.”

---

# 4. NMC² data-center operations lead

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | Strong end-to-end operating loop with clear warnings, blast-radius mapping, reversible containment, and fleet learning. |
| Bulkheads | 9/10 | Best operational metaphor because it centers keeping the rest of the facility running while one compartment is isolated. |
| Crime Scene | 8/10 | Excellent command coordination, but legal and communications occupy more airtime than NOC handoffs, capacity, and service impact. |
| Agents | 8/10 | Fast and technically credible, but “agents fighting agents” is less useful to operators than a calm explanation of alerts, handoffs, and workload impact. |

### First place: Bulkheads

“Seal one compartment so the hall stays up” maps naturally to data-center operations. Its explicit response ordering and “never live-migrate through an untrusted hypervisor” detail signal operational competence.

### Three most important fixes

1. **Stop saying the eleven neighbors “never stopped serving” if they restart.**

   Rewrite:

   > “Eleven neighboring workloads restarted on clean hosts. The demo shows the interruption and available spare capacity; it does not claim zero downtime.”

2. **Show the handoff explicitly.**

   Rewrite:

   > “Sentry assigns the incident to the NOC commander, Warden assigns host isolation to infrastructure security, and the next shift acknowledges the same timeline—no verbal reconstruction required.”

3. **Expose operational constraints on the approval card.**

   Rewrite:

   > “Before approval, the card shows affected tenants, estimated restart time, clean-host capacity, evidence-capture status, and the rollback path.”

---

# 5. NVIDIA developer-relations engineer

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | Nemotron is genuinely used for multi-step reasoning and tool calls, while local execution and deterministic policy make the architecture credible. |
| Bulkheads | 8/10 | The tool-use detail is good, but the maritime story delays the proof that Nemotron is doing meaningful work. |
| Crime Scene | 8/10 | Strong real-world application and sovereign/on-prem rationale, though Nemotron is secondary to the War Room. |
| Agents | 10/10 | The clearest match to “Beyond a Chatbot”: multiple agents gather state, reason, call tools, propose actions, and produce a report. |

### First place: Agents vs. Agents

It directly answers why Nemotron is needed and shows a multi-stage tool loop rather than a conversational wrapper. The small, local model also has a convincing deployment rationale.

### Three most important fixes

1. **Show one complete live reasoning trajectory.**

   Rewrite:

   > “Triage called `get_host_inventory`, found eleven co-resident guests, called `check_reachability`, detected a management-plane path, and then wrote a scoped finding. That result changed Warden’s containment plan.”

2. **Separate model reasoning from deterministic fallback.**

   Rewrite:

   > “This row is tagged `model`; this one is tagged `fallback`. We expose the provenance so an operator can tell whether Nemotron or a deterministic playbook produced each result.”

3. **Explain why an LLM is necessary at all.**

   Rewrite:

   > “Rules recognize known indicators. Nemotron joins weak evidence across tools, determines which assets matter, and proposes a context-specific plan. It does not authorize or execute outside policy.”

---

# 6. Clockwork Labs / SpacetimeDB engineer

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 8/10 | It makes reducers and subscriptions central, but the pitch becomes disqualifying if the module is still the starter template noted in another draft’s truth check. |
| Bulkheads | 9/10 | “Ship’s log and door locks” clearly explains why state, authorization, and real-time subscriptions belong in SpacetimeDB. |
| Crime Scene | 8/10 | Strong shared-state use case, though Maincloud and live War Room claims remain conditional. |
| Agents | 9/10 | Best technical formulation—tables hold the incident, reducers referee actions, and subscriptions update every participant—but only if the implementation is demonstrable. |

### First place: Agents vs. Agents

“The database is the referee” is the clearest essential-use argument. SpacetimeDB is not merely storage; it becomes the transactional authority between probabilistic agents and consequential actions.

### Three most important fixes

1. **Prove the module, not just the UI.**

   Rewrite:

   > “This reducer receives the agent proposal, reads the policy and target rows in the same transaction, and either creates an approved action or a blocked event. Here is that exact row appearing in both consoles.”

2. **Quantify what “majority of the backend” means.**

   Rewrite:

   > “Hosts, incidents, signals, policies, proposals, approvals, reports, users, messages, tasks, and audit events all live in SpacetimeDB. The only external services are the Nemotron runner, voice proxy, and SSH bridge.”

3. **Make subscriptions visible during the demo.**

   Rewrite:

   > “I’ll send a War Room message from this phone; the judge console receives it without refresh. Now I’ll approve quarantine, and both the incident status and audit timeline update from the same committed reducer.”

---

# 7. MLH generalist judge

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 10/10 | Instantly understandable, visually demonstrable, and highly memorable, with a satisfying detect–contain–heal–remember arc. |
| Bulkheads | 8/10 | Memorable but overlong; Titanic risks becoming the thing the judge remembers instead of Claura. |
| Crime Scene | 9/10 | Excellent dramatic hook and tangible human stakes, though the product initially sounds like a secure incident chat room. |
| Agents | 9/10 | Energetic and sponsor-friendly, but “agents versus agents” is a familiar hackathon trope unless the live tool trace is exceptional. |

### First place: Immune System

It gives the judge an immediate mental model and a four-beat demo structure. “Autoimmune disease” also creates a natural explanation for the policy gate.

### Three most important fixes

1. **Reduce the feature tour.** Secure Shell and voice dilute the central wow moment.

   Rewrite:

   > “In two minutes we will show one loop: detect the escape, map its blast radius, contain it under policy, and update every responder live.”

2. **Make the before/after visual unmistakable.**

   Rewrite:

   > “Six disconnected warnings become one red incident; eleven neighboring workloads move green; the policy gate stops on amber; one human approval seals the host.”

3. **End on one line, not three concepts.**

   Rewrite:

   > “Claura: every breach makes the whole fleet immune.”

---

# 8. Non-technical first-year student judge

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 10/10 | The body metaphor explains the product without requiring knowledge of hypervisors, reducers, or incident response. |
| Bulkheads | 8/10 | The ship metaphor works, but the Titanic setup and technical mapping are too elaborate for a short table interaction. |
| Crime Scene | 9/10 | “The attacker is reading your email” is immediate and frightening, although the transition into GPU infrastructure is abrupt. |
| Agents | 8/10 | Easy to remember but potentially confusing because the audience may not understand what either set of agents is actually doing. |

### First place: Immune System

“Detect, contain, heal, remember” gives a non-technical listener the entire product in four verbs.

### Three most important fixes

1. **Translate the VM escape in one sentence.**

   Rewrite:

   > “One customer’s AI breaks out of its rented room and reaches the shared server where eleven other customers are working.”

2. **Translate the policy reducer.**

   Rewrite:

   > “The AI can recommend what to do, but a rulebook outside the AI decides what is allowed.”

3. **Avoid unexplained product names during the first minute.**

   Rewrite:

   > “Four defenders find the problem, measure who could be affected, contain it, and write the record.”

---

# SYNTHESIS

## Recommended angle

Use **“immune system outside the crime scene”** as the combined story:

> The attacker can read your email, and a rogue AI workload is moving faster than your on-call engineer. Claura is the immune system for AI data centers: local Nemotron agents detect and contain the escape, deterministic policy controls every action, and an isolated War Room keeps humans coordinated on one live record.

This combination works because:

- **Crime Scene** supplies the most urgent opening.
- **Immune System** supplies the clearest product category.
- **Agents** supplies the NVIDIA technical proof.
- **Bulkheads** contributes the useful containment concept without requiring a Titanic lecture.

Do not use all four metaphors. “Crime scene,” “immune system,” “bulkhead,” “bunker,” “black box,” “referee,” and “fire suppression” in one pitch feels like seven different products.

If limited to three sponsor tracks:

- Choose **Winstead + NVIDIA + SpacetimeDB** if the live reducers, subscriptions, access control, and War Room are real.
- If SpacetimeDB is not substantially implemented, choose **Winstead + NMC² + NVIDIA** and describe SpacetimeDB as planned rather than entering its track.

## The 10 best lines across all drafts

Verbatim:

1. “Your network is compromised. Your command isn't.”
2. “Every breach makes the whole fleet immune.”
3. “But an immune system without restraint is an autoimmune disease.”
4. “Policy, not the model, decides.”
5. “The first responder has to be a machine, and the last word has to be a human. Everything in between has to be policy.”
6. “You don't investigate in front of the suspect.”
7. “The attack is simulated. The defense is real.”
8. “The database is the referee, so an action the policy refuses never runs.”
9. “Then comes the part dashboards forget: the people.”
10. “Their agents move fast. Ours move first.”

## The eight biggest weaknesses to fix

1. **Claims outrun the build.** The drafts’ own truth checks mention a starter SpacetimeDB module, static War Room data, missing reducer authentication, and an unloaded shell module. Spoken claims must match the final implementation exactly.

2. **Two Winstead requirements are underbuilt.** Admin-managed individuals and compromised-data status are either missing or only acknowledged in truth checks.

3. **Isolation is underspecified.** A cloud-hosted War Room is not automatically secure when the attacker owns internal identity, endpoints, DNS, or network routes. Show independent identities, administration, transport, and failure modes.

4. **Infrastructure scope is confused with data scope.** “One host and eleven guests” does not answer whether data is locked, altered, accessed, exfiltrated, or unknown.

5. **The evidence story is incomplete.** Hash-chaining alone is not chain of custody. You need acquisition source, timestamp, collecting tool, operator, artifact hash, storage location, transfers, and export verification.

6. **“Irreversible quarantine” is internally contradictory.** If a host can be unquarantined, call the action high-impact or service-affecting, not irreversible.

7. **The uptime claim is too strong.** Failing workloads over by restarting them creates disruption. Do not say the neighbors “never stopped serving” unless you measure and demonstrate that.

8. **The table pitch tries to show too much.** War Room, agents, policy, shell, voice, legal clocks, failover, facility map, fleet memory, and vision cannot all receive credible proof in two minutes. Shell and voice should be post-pitch bonus demos.

## How to hit all five Winstead requirements explicitly

| Requirement | Pitch wording | Required demo proof |
|---|---|---|
| 1. Highly secure and isolated inside a potentially compromised network | “Claura does not depend on corporate SSO, email, DNS, or the suspect production plane. Its local response core and pre-enrolled break-glass identities are separately administered.” | Show the trust-boundary diagram; disconnect or mark the corporate path unavailable while the independent console remains usable; show passkey identity and denied unauthorized access. |
| 2. Access control with admin ability to add individuals | “The incident administrator adds outside counsel as an individual, assigns the Counsel role, and requires a passkey before access.” | Add a named user live; assign a least-privilege role; show the new person appear on a second device; show the access-change audit event and a denied channel. |
| 3. Standards-based incident documentation with real-time status | “The record follows NIST SP 800-61 Rev. 3 phases and captures actor, source, timestamp, evidence hash, action, authorization, outcome, and current status.” | Update an incident from Detected → Containing → Contained; show both consoles update; export or open the standards-mapped report. |
| 4. Scope of compromised data and its status | “Scope separates systems from data: affected host and tenants, files locked, artifacts accessed, suspected egress, confirmed exfiltration, and unknowns.” | Show a scope table with statuses such as `Locked`, `Access observed`, `No egress observed`, `Exfiltration suspected`, and `Unknown`; change one status live with evidence attached. |
| 5. Real-time communications inside the system | “Legal, operations, executives, PR, and vendors communicate in role-scoped channels tied to the same incident, tasks, and decisions.” | Send a message from a second device; show it arrive without refresh; assign a task, acknowledge it, and record a decision with author and timestamp. |

Also show these legal-quality details:

- Counsel owns membership in the privileged workspace.
- Notification clocks are examples, not legal conclusions.
- “What we know,” “what we do not know,” and “what changed” are separate.
- Every consequential action records proposer, policy result, approver, execution result, and rollback.
- Evidence exports can be verified independently.

## Recommended two-minute table-pitch outline

### 0:00–0:15 — Hostile-communications hook

> “It’s 2 a.m. The phones are down, ransomware locked the file share, and the attacker is reading your email. You don’t investigate in front of the suspect.”

Show the unavailable normal channels and the isolated Claura console.

### 0:15–0:25 — Product and honesty

> “Claura is the immune system for AI data centers: agents contain the machine while an isolated War Room keeps the humans coordinated. This attack is simulated; I’ll label every part of the defense that is live.”

Do not claim “the defense is real” unless every element you are about to show is real.

### 0:25–0:55 — Nemotron agent loop

Start the replay.

> “One workload breaks out toward its shared GPU host. Nemotron correlates six signals, checks inventory and reachability, and maps the scope: one host and eleven neighboring workloads.”

Show actual tool calls and outputs, not just animated agent names.

### 0:55–1:10 — Policy and human authority

> “The model proposes; policy decides. Low-impact reversible actions follow policy. Host quarantine is service-affecting, so it requires a named human.”

Show one allowed proposal, one denied proposal, and one approval-required proposal. Approve the last one.

### 1:10–1:40 — All five Winstead requirements

Move to the War Room:

> “This room uses independent break-glass identities. An admin can add outside counsel and limit their role. The live incident record follows NIST fields. Scope covers both systems and data: what is locked, accessed, exfiltrated, or still unknown. Every responder communicates here.”

Perform one compressed sequence:

1. Add a user or show the completed access event.
2. Point to the named documentation standard.
3. Point to the data-status scope table.
4. Send a real-time message from the second device.
5. Show the incident status update on both consoles.

### 1:40–1:52 — NMC² and SpacetimeDB proof

> “One transaction updates the action, audit record, status, and every subscribed console. The handoff is no longer a phone call—it is shared state.”

Show the second console updating.

### 1:52–2:00 — Close

> “The attacker moves at machine speed. Claura contains the machine and keeps the humans in command. Every breach makes the whole fleet immune.”

Leave Secure Shell, multilingual voice, market size, roadmap, and cross-cloud threat sharing for judge questions. Those are good follow-up demonstrations, but they weaken the core proof if squeezed into the initial two minutes.
62,388
# HackUTD 2026 Judge Panel Review: Claura

## Executive verdict

The strongest direction is a hybrid:

- Use **Crime Scene** for the opening problem: “The attacker is reading your email.”
- Use **Immune System** as the durable product category and closing metaphor.
- Use **Agents vs. Agents** to prove Nemotron’s necessity.
- Borrow only the “seal the compartment” concept from **Bulkheads**; the Titanic history consumes too much of a two-minute pitch.

The single biggest risk is credibility. The drafts repeatedly describe the policy gate, Maincloud War Room, authentication, Secure Shell, and voice as real while their truth checks say some may be static, unwired, or absent. A judge discovering that gap will punish the project more severely than if you disclose it upfront.

Scores below assume you demonstrate only what is actually live. If you state an unchecked feature as built, subtract 2–4 points with the security, legal, NVIDIA, and SpacetimeDB judges.

Draft abbreviations:

- **Immune:** `immune-system.md`
- **Bulkheads:** `bulkheads.md`
- **Crime Scene:** `crime-scene.md`
- **Agents:** `agents-vs-agents.md`

---

# 1. CISO / veteran security engineer

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | The best safety story—deterministic policy, reversible-first actions, evidence, and explicit limitations—but “irreversible quarantine” contradicts its own rollback claims. |
| Bulkheads | 7/10 | Damage containment is the right concept, but the extended ship analogy obscures threat boundaries, authentication, and actual enforcement. |
| Crime Scene | 8/10 | Strongest treatment of compromised communications and evidentiary risk, although the control plane’s isolation is asserted more than architecturally demonstrated. |
| Agents | 8/10 | Clear adversarial-speed argument and useful fail-closed model, but “agents versus agents” invites skepticism about false positives and prompt injection. |

### First place: Immune System

It frames the core security design correctly: the model proposes, deterministic controls authorize, reversible actions precede disruptive ones, and humans retain responsibility. Its Q&A also admits unmeasured false-positive rates and prompt-injection testing gaps.

### Three most important fixes

1. **Stop calling quarantine irreversible.** It is explicitly undoable elsewhere in the drafts.

   Rewrite:

   > “Quarantine is the highest-impact step, so policy requires a named human approver. It can be reversed, but it can also interrupt every tenant on that host.”

2. **Define the trusted computing boundary.** “Off the compromised network” is not enough.

   Rewrite:

   > “Claura’s local response appliance uses a separately administered management plane, independent break-glass identities, and no dependency on corporate SSO, email, or DNS. The stakeholder room connects over a pre-provisioned out-of-band path.”

3. **Treat false positives as a first-class operating risk.**

   Rewrite:

   > “Today we have not measured false-positive rates on real telemetry. Until we do, tenant failover and host quarantine default to approval; only low-blast-radius actions such as revoking one workload token may run automatically.”

---

# 2. Seed-stage VC partner

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | Best company narrative: a narrow GPU-host escape wedge expands into an agent firewall, attestations, and cross-cloud threat intelligence. |
| Bulkheads | 8/10 | Memorable category ambition, but “become the SOLAS of AI clouds” feels grander than the demonstrated customer proof. |
| Crime Scene | 7/10 | A credible Winstead product, but expanding the War Room to every hospital, law firm, and city weakens the AI-data-center wedge. |
| Agents | 9/10 | Excellent why-now and venture-scale platform framing, although incumbents could copy the headline unless execution and data advantages are sharper. |

### First place: Immune System

It has the cleanest wedge-to-platform progression: guest-escape response → policy gate for every agent → cross-cloud immunity. That sounds more like a company than a feature bundle.

### Three most important fixes

1. **Name the first buyer and purchasing trigger.**

   Rewrite:

   > “We sell first to multi-tenant GPU clouds with 500–10,000 hosts, where one escape can expose several customers and trigger SLA, disclosure, and churn risk. The initial buyer is the CISO or head of infrastructure security.”

2. **Replace giant market statistics with a believable beachhead.**

   Rewrite:

   > “Our first market is not every data center. It is GPU clouds that run untrusted customer workloads on shared hosts and cannot staff a hyperscaler-sized incident-response team.”

3. **Make the moat concrete.**

   Rewrite:

   > “The moat is not the LLM. It is the tested containment policies, host-level integrations, incident outcome data, and signed escape fingerprints that improve across participating fleets.”

---

# 3. Winstead PC attorney

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 7/10 | Strong coordination and decision-log story, but it does not explicitly demonstrate admin-managed access or the status of compromised data. |
| Bulkheads | 7/10 | Good incident record and notification clocks, yet it openly concedes two requirements are incomplete. |
| Crime Scene | 9/10 | The most faithful response to Winstead’s clarification, with excellent treatment of hostile communications, privilege, evidentiary integrity, and human coordination. |
| Agents | 7/10 | Capable technically, but Winstead feels appended after the agent-defense story rather than built into the core pitch. |

### First place: Crime Scene

It starts from the organizer’s actual scenario rather than merely mentioning it later. The CISA example, legal channel, named decisions, “know/don’t know” brief, and evidence-preservation language all fit the track.

### Three most important fixes

1. **Explicitly demonstrate admin access management.**

   Rewrite:

   > “The incident administrator adds outside counsel as an individual, assigns the Counsel role, requires a pre-enrolled passkey, and the access change appears immediately in the audit log.”

2. **Show data scope, not merely infrastructure scope.**

   Rewrite:

   > “Current scope: one host and eleven tenant workloads. Customer dataset A: access not observed. Model registry: status unknown. File share FS-12: locked by ransomware. Egress logs: no confirmed exfiltration; investigation active.”

3. **Avoid implying that a `#legal` channel automatically creates privilege.**

   Rewrite:

   > “Counsel controls membership and distribution for the legal workspace. Claura records facts and preserves evidence; counsel—not the software—decides privilege, materiality, and notification obligations.”

---

# 4. NMC² data-center operations lead

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | Strong end-to-end operating loop with clear warnings, blast-radius mapping, reversible containment, and fleet learning. |
| Bulkheads | 9/10 | Best operational metaphor because it centers keeping the rest of the facility running while one compartment is isolated. |
| Crime Scene | 8/10 | Excellent command coordination, but legal and communications occupy more airtime than NOC handoffs, capacity, and service impact. |
| Agents | 8/10 | Fast and technically credible, but “agents fighting agents” is less useful to operators than a calm explanation of alerts, handoffs, and workload impact. |

### First place: Bulkheads

“Seal one compartment so the hall stays up” maps naturally to data-center operations. Its explicit response ordering and “never live-migrate through an untrusted hypervisor” detail signal operational competence.

### Three most important fixes

1. **Stop saying the eleven neighbors “never stopped serving” if they restart.**

   Rewrite:

   > “Eleven neighboring workloads restarted on clean hosts. The demo shows the interruption and available spare capacity; it does not claim zero downtime.”

2. **Show the handoff explicitly.**

   Rewrite:

   > “Sentry assigns the incident to the NOC commander, Warden assigns host isolation to infrastructure security, and the next shift acknowledges the same timeline—no verbal reconstruction required.”

3. **Expose operational constraints on the approval card.**

   Rewrite:

   > “Before approval, the card shows affected tenants, estimated restart time, clean-host capacity, evidence-capture status, and the rollback path.”

---

# 5. NVIDIA developer-relations engineer

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 9/10 | Nemotron is genuinely used for multi-step reasoning and tool calls, while local execution and deterministic policy make the architecture credible. |
| Bulkheads | 8/10 | The tool-use detail is good, but the maritime story delays the proof that Nemotron is doing meaningful work. |
| Crime Scene | 8/10 | Strong real-world application and sovereign/on-prem rationale, though Nemotron is secondary to the War Room. |
| Agents | 10/10 | The clearest match to “Beyond a Chatbot”: multiple agents gather state, reason, call tools, propose actions, and produce a report. |

### First place: Agents vs. Agents

It directly answers why Nemotron is needed and shows a multi-stage tool loop rather than a conversational wrapper. The small, local model also has a convincing deployment rationale.

### Three most important fixes

1. **Show one complete live reasoning trajectory.**

   Rewrite:

   > “Triage called `get_host_inventory`, found eleven co-resident guests, called `check_reachability`, detected a management-plane path, and then wrote a scoped finding. That result changed Warden’s containment plan.”

2. **Separate model reasoning from deterministic fallback.**

   Rewrite:

   > “This row is tagged `model`; this one is tagged `fallback`. We expose the provenance so an operator can tell whether Nemotron or a deterministic playbook produced each result.”

3. **Explain why an LLM is necessary at all.**

   Rewrite:

   > “Rules recognize known indicators. Nemotron joins weak evidence across tools, determines which assets matter, and proposes a context-specific plan. It does not authorize or execute outside policy.”

---

# 6. Clockwork Labs / SpacetimeDB engineer

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 8/10 | It makes reducers and subscriptions central, but the pitch becomes disqualifying if the module is still the starter template noted in another draft’s truth check. |
| Bulkheads | 9/10 | “Ship’s log and door locks” clearly explains why state, authorization, and real-time subscriptions belong in SpacetimeDB. |
| Crime Scene | 8/10 | Strong shared-state use case, though Maincloud and live War Room claims remain conditional. |
| Agents | 9/10 | Best technical formulation—tables hold the incident, reducers referee actions, and subscriptions update every participant—but only if the implementation is demonstrable. |

### First place: Agents vs. Agents

“The database is the referee” is the clearest essential-use argument. SpacetimeDB is not merely storage; it becomes the transactional authority between probabilistic agents and consequential actions.

### Three most important fixes

1. **Prove the module, not just the UI.**

   Rewrite:

   > “This reducer receives the agent proposal, reads the policy and target rows in the same transaction, and either creates an approved action or a blocked event. Here is that exact row appearing in both consoles.”

2. **Quantify what “majority of the backend” means.**

   Rewrite:

   > “Hosts, incidents, signals, policies, proposals, approvals, reports, users, messages, tasks, and audit events all live in SpacetimeDB. The only external services are the Nemotron runner, voice proxy, and SSH bridge.”

3. **Make subscriptions visible during the demo.**

   Rewrite:

   > “I’ll send a War Room message from this phone; the judge console receives it without refresh. Now I’ll approve quarantine, and both the incident status and audit timeline update from the same committed reducer.”

---

# 7. MLH generalist judge

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 10/10 | Instantly understandable, visually demonstrable, and highly memorable, with a satisfying detect–contain–heal–remember arc. |
| Bulkheads | 8/10 | Memorable but overlong; Titanic risks becoming the thing the judge remembers instead of Claura. |
| Crime Scene | 9/10 | Excellent dramatic hook and tangible human stakes, though the product initially sounds like a secure incident chat room. |
| Agents | 9/10 | Energetic and sponsor-friendly, but “agents versus agents” is a familiar hackathon trope unless the live tool trace is exceptional. |

### First place: Immune System

It gives the judge an immediate mental model and a four-beat demo structure. “Autoimmune disease” also creates a natural explanation for the policy gate.

### Three most important fixes

1. **Reduce the feature tour.** Secure Shell and voice dilute the central wow moment.

   Rewrite:

   > “In two minutes we will show one loop: detect the escape, map its blast radius, contain it under policy, and update every responder live.”

2. **Make the before/after visual unmistakable.**

   Rewrite:

   > “Six disconnected warnings become one red incident; eleven neighboring workloads move green; the policy gate stops on amber; one human approval seals the host.”

3. **End on one line, not three concepts.**

   Rewrite:

   > “Claura: every breach makes the whole fleet immune.”

---

# 8. Non-technical first-year student judge

## Scores

| Draft | Score | One-sentence verdict |
|---|---:|---|
| Immune | 10/10 | The body metaphor explains the product without requiring knowledge of hypervisors, reducers, or incident response. |
| Bulkheads | 8/10 | The ship metaphor works, but the Titanic setup and technical mapping are too elaborate for a short table interaction. |
| Crime Scene | 9/10 | “The attacker is reading your email” is immediate and frightening, although the transition into GPU infrastructure is abrupt. |
| Agents | 8/10 | Easy to remember but potentially confusing because the audience may not understand what either set of agents is actually doing. |

### First place: Immune System

“Detect, contain, heal, remember” gives a non-technical listener the entire product in four verbs.

### Three most important fixes

1. **Translate the VM escape in one sentence.**

   Rewrite:

   > “One customer’s AI breaks out of its rented room and reaches the shared server where eleven other customers are working.”

2. **Translate the policy reducer.**

   Rewrite:

   > “The AI can recommend what to do, but a rulebook outside the AI decides what is allowed.”

3. **Avoid unexplained product names during the first minute.**

   Rewrite:

   > “Four defenders find the problem, measure who could be affected, contain it, and write the record.”

---

# SYNTHESIS

## Recommended angle

Use **“immune system outside the crime scene”** as the combined story:

> The attacker can read your email, and a rogue AI workload is moving faster than your on-call engineer. Claura is the immune system for AI data centers: local Nemotron agents detect and contain the escape, deterministic policy controls every action, and an isolated War Room keeps humans coordinated on one live record.

This combination works because:

- **Crime Scene** supplies the most urgent opening.
- **Immune System** supplies the clearest product category.
- **Agents** supplies the NVIDIA technical proof.
- **Bulkheads** contributes the useful containment concept without requiring a Titanic lecture.

Do not use all four metaphors. “Crime scene,” “immune system,” “bulkhead,” “bunker,” “black box,” “referee,” and “fire suppression” in one pitch feels like seven different products.

If limited to three sponsor tracks:

- Choose **Winstead + NVIDIA + SpacetimeDB** if the live reducers, subscriptions, access control, and War Room are real.
- If SpacetimeDB is not substantially implemented, choose **Winstead + NMC² + NVIDIA** and describe SpacetimeDB as planned rather than entering its track.

## The 10 best lines across all drafts

Verbatim:

1. “Your network is compromised. Your command isn't.”
2. “Every breach makes the whole fleet immune.”
3. “But an immune system without restraint is an autoimmune disease.”
4. “Policy, not the model, decides.”
5. “The first responder has to be a machine, and the last word has to be a human. Everything in between has to be policy.”
6. “You don't investigate in front of the suspect.”
7. “The attack is simulated. The defense is real.”
8. “The database is the referee, so an action the policy refuses never runs.”
9. “Then comes the part dashboards forget: the people.”
10. “Their agents move fast. Ours move first.”

## The eight biggest weaknesses to fix

1. **Claims outrun the build.** The drafts’ own truth checks mention a starter SpacetimeDB module, static War Room data, missing reducer authentication, and an unloaded shell module. Spoken claims must match the final implementation exactly.

2. **Two Winstead requirements are underbuilt.** Admin-managed individuals and compromised-data status are either missing or only acknowledged in truth checks.

3. **Isolation is underspecified.** A cloud-hosted War Room is not automatically secure when the attacker owns internal identity, endpoints, DNS, or network routes. Show independent identities, administration, transport, and failure modes.

4. **Infrastructure scope is confused with data scope.** “One host and eleven guests” does not answer whether data is locked, altered, accessed, exfiltrated, or unknown.

5. **The evidence story is incomplete.** Hash-chaining alone is not chain of custody. You need acquisition source, timestamp, collecting tool, operator, artifact hash, storage location, transfers, and export verification.

6. **“Irreversible quarantine” is internally contradictory.** If a host can be unquarantined, call the action high-impact or service-affecting, not irreversible.

7. **The uptime claim is too strong.** Failing workloads over by restarting them creates disruption. Do not say the neighbors “never stopped serving” unless you measure and demonstrate that.

8. **The table pitch tries to show too much.** War Room, agents, policy, shell, voice, legal clocks, failover, facility map, fleet memory, and vision cannot all receive credible proof in two minutes. Shell and voice should be post-pitch bonus demos.

## How to hit all five Winstead requirements explicitly

| Requirement | Pitch wording | Required demo proof |
|---|---|---|
| 1. Highly secure and isolated inside a potentially compromised network | “Claura does not depend on corporate SSO, email, DNS, or the suspect production plane. Its local response core and pre-enrolled break-glass identities are separately administered.” | Show the trust-boundary diagram; disconnect or mark the corporate path unavailable while the independent console remains usable; show passkey identity and denied unauthorized access. |
| 2. Access control with admin ability to add individuals | “The incident administrator adds outside counsel as an individual, assigns the Counsel role, and requires a passkey before access.” | Add a named user live; assign a least-privilege role; show the new person appear on a second device; show the access-change audit event and a denied channel. |
| 3. Standards-based incident documentation with real-time status | “The record follows NIST SP 800-61 Rev. 3 phases and captures actor, source, timestamp, evidence hash, action, authorization, outcome, and current status.” | Update an incident from Detected → Containing → Contained; show both consoles update; export or open the standards-mapped report. |
| 4. Scope of compromised data and its status | “Scope separates systems from data: affected host and tenants, files locked, artifacts accessed, suspected egress, confirmed exfiltration, and unknowns.” | Show a scope table with statuses such as `Locked`, `Access observed`, `No egress observed`, `Exfiltration suspected`, and `Unknown`; change one status live with evidence attached. |
| 5. Real-time communications inside the system | “Legal, operations, executives, PR, and vendors communicate in role-scoped channels tied to the same incident, tasks, and decisions.” | Send a message from a second device; show it arrive without refresh; assign a task, acknowledge it, and record a decision with author and timestamp. |

Also show these legal-quality details:

- Counsel owns membership in the privileged workspace.
- Notification clocks are examples, not legal conclusions.
- “What we know,” “what we do not know,” and “what changed” are separate.
- Every consequential action records proposer, policy result, approver, execution result, and rollback.
- Evidence exports can be verified independently.

## Recommended two-minute table-pitch outline

### 0:00–0:15 — Hostile-communications hook

> “It’s 2 a.m. The phones are down, ransomware locked the file share, and the attacker is reading your email. You don’t investigate in front of the suspect.”

Show the unavailable normal channels and the isolated Claura console.

### 0:15–0:25 — Product and honesty

> “Claura is the immune system for AI data centers: agents contain the machine while an isolated War Room keeps the humans coordinated. This attack is simulated; I’ll label every part of the defense that is live.”

Do not claim “the defense is real” unless every element you are about to show is real.

### 0:25–0:55 — Nemotron agent loop

Start the replay.

> “One workload breaks out toward its shared GPU host. Nemotron correlates six signals, checks inventory and reachability, and maps the scope: one host and eleven neighboring workloads.”

Show actual tool calls and outputs, not just animated agent names.

### 0:55–1:10 — Policy and human authority

> “The model proposes; policy decides. Low-impact reversible actions follow policy. Host quarantine is service-affecting, so it requires a named human.”

Show one allowed proposal, one denied proposal, and one approval-required proposal. Approve the last one.

### 1:10–1:40 — All five Winstead requirements

Move to the War Room:

> “This room uses independent break-glass identities. An admin can add outside counsel and limit their role. The live incident record follows NIST fields. Scope covers both systems and data: what is locked, accessed, exfiltrated, or still unknown. Every responder communicates here.”

Perform one compressed sequence:

1. Add a user or show the completed access event.
2. Point to the named documentation standard.
3. Point to the data-status scope table.
4. Send a real-time message from the second device.
5. Show the incident status update on both consoles.

### 1:40–1:52 — NMC² and SpacetimeDB proof

> “One transaction updates the action, audit record, status, and every subscribed console. The handoff is no longer a phone call—it is shared state.”

Show the second console updating.

### 1:52–2:00 — Close

> “The attacker moves at machine speed. Claura contains the machine and keeps the humans in command. Every breach makes the whole fleet immune.”

Leave Secure Shell, multilingual voice, market size, roadmap, and cross-cloud threat sharing for judge questions. Those are good follow-up demonstrations, but they weaken the core proof if squeezed into the initial two minutes.
