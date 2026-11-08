# Claura: Bulkheads for the AI Cloud

Pitch package. Angle: damage control. Written for HackUTD 2026 (Sun 8 Nov; submissions close 12:00 pm CST, table judging 1–4 pm).

> **Ground rules for everyone who says these words**
> - Anything under **Built today** is something we can show at the table. Anything under **Vision** is labelled as vision when we say it.
> - Demo numbers (9.4 s, 2,048 hosts, 61,207 sandboxed agents, 11.8 s mean) are **illustrative**. Say so.
> - Every outside fact below has a link, and the full list is in Appendix C. Don't add a number that isn't in that list.
> - If a "built today" feature isn't live at 12:00, move its line to the vision before you say it out loud.

---

## 1. Title, logline, taglines

**Title:** Claura: Bulkheads for the AI Cloud

**Logline:** Ships survive breaches because bulkheads seal the flooded compartment. AI clouds have none, so Claura seals a breached GPU host before the flood reaches its neighbors, with policy holding the keys and a human signing for the one heavy door.

**Tagline options (7 words each)**
1. **Ships survive breaches. Now AI clouds can.** *(Recommended. Closes the pitch and the film.)*
2. **Seal the compartment before the flood spreads.** *(Keeps the rhythm of the current tagline, "Seal the breach before it spreads.")*
3. **Damage control for the age of agents.** *(Category line for the Devpost subtitle.)*

---

## 2. Elevator pitches

**15 seconds (41 words)**
> Ships survive breaches because bulkheads seal the flooded compartment. AI clouds have none: one escaped workload can reach the host and every tenant on it. Claura is the bulkhead: agents seal the compartment, and a human signs for the heavy door.

**30 seconds (87 words)**
> Titanic was built to survive four flooded compartments. The iceberg opened five, and the sea spilled over the tops. AI clouds share that flaw: every agent gets a VM, but they all sit on one shared host. Claura is the damage-control crew. On-prem Nemotron agents map the flood and shut the reversible doors first. Policy in SpacetimeDB, not the model, decides, and a human signs for quarantine. And the War Room keeps legal and execs coordinated off the compromised network. Ships survive breaches. Now AI clouds can.

---

## 3. The 2-minute judge-table pitch

**Before the judge arrives**
- Tab 1: console on **Overview** ("All clear"), Hall B visible on the map. Tab 2: the incident replay URL (`?play=1`). Loading it starts the incident, which then waits at the approval gate. Load it once beforehand, then press Cmd+R on cue to restart it from zero.
- A teammate's phone or laptop is signed in as the **second approver** for Secure Shell. Test the mic button and turn the volume up.
- One person talks and one person clicks. The driver clicks only on cues.
- **Honesty switch:** if the screen shows the scripted replay, say "in this replay" once. If it shows a live agent run, say "live".

About 283 spoken words. At table pace that is about 1:45 of speech plus about 15 s of clicks and Claura's answer.

---

**0:00 · Cold open**
`[DEMO: Overview, "All clear". Hands off the trackpad.]`

"Titanic was built to survive four flooded compartments. The iceberg opened five. And the compartments were open at the top, so the sea spilled over, one into the next."

**0:11 · The flaw**

"AI clouds are built the same way: every agent gets a wall, but above every wall sits one shared host. In September, NVIDIA patched a vGPU flaw a guest could trigger from inside."

**0:23 · Name it**

"Claura is the bulkhead: damage control for autonomous workloads. Watch Hall B, rack fourteen."

`[DEMO: Incident replay. Switch to Tab 2 and press Cmd+R. Let the signal stream fill.]`

**0:30 · The flood**

"An agent in vm-7f3a goes for the host. Sentry correlates six signals, from an IOMMU fault to a token used out of scope. Triage maps the flood: one host, eleven neighbors, management plane in reach."

**0:43 · The light doors**
`[DEMO: point at the containment plan as the steps tick.]`

"Warden shuts the reversible doors first: network, tokens, cordon, pause. Then it captures memory over the trusted path and moves the eleven neighbors to clean hosts, never live-migrating them through the flooded room."

**0:57 · The heavy door**
`[DEMO: the approval sheet rises. Point at Scope, then Rollback, then Show evidence. Press Cmd+Enter on "Command-Enter".]`

"One door is heavy: quarantining the host. The agents run Nemotron locally and can only propose; a SpacetimeDB reducer checks policy, and policy says a human signs. Evidence, scope, rollback, one card. Command-Enter."

**1:10 · Sealed**
`[DEMO: the counter freezes. Say the number once and move on.]`

"Sealed in nine point four seconds. That's our demo clock, not a benchmark."

**1:16 · The radio room**
`[DEMO: War Room. Open #exec, then #legal so the notification clocks are visible. If there's time, tap Play brief for 3 seconds.]`

"Assume the attacker reads your email and the phones are down. Our War Room runs off your network, on SpacetimeDB's cloud, with break-glass identities, and everyone from legal to the vendor gets Scribe's plain-English brief: what we know, what we don't."

**1:35 · The boarding party**
`[DEMO: click host b14-gpu-07 (in the thread or on the map), then Open secure shell, then Touch ID. The teammate approves as the second person.]`

"Need to board the flooded compartment? Click the host. Short-lived certificate, Touch ID, a second approver, read-only forensics, and every keystroke hash-chained into the log."

**1:44 · Ask**
`[DEMO: hold the mic button in the toolbar. Ask, then release. Let Claura answer and don't talk over it.]`

"Claura, are any customers affected?"

**1:52 · Close** (ends about 2:00)

"After Titanic, the world rewrote the rules of the sea. AI clouds are next. Claura: ships survive breaches. Now AI clouds can."

---

- **Running long?** Skip the boarding-party beat (1:35–1:44) and go straight to Ask Claura. Offer the shell as the first thing to show after their first question.
- **Judge arrives mid-run?** Start at "One door is heavy" with the approval card on screen, then go back to the cold open after Cmd+Enter.
- **Judge has heard Titanic twice today?** Use this opener instead: "A wall keeps tenants apart on a good day. A bulkhead holds on the worst day. AI clouds have walls."
- **If the blocked row is on screen:** "That red row is a denied action, proposed by the model or by our labelled red-team probe. Policy said no."

---

## 4. The problem: AI clouds have walls, not bulkheads

A wall keeps tenants apart on a good day. A bulkhead is built for the worst day: it holds when the hull is breached, and a crew shuts the doors in it. AI clouds have walls: VMs, containers, sandboxes. But above every wall sits the same host, the same GPU driver and the same management plane. That is the open top of every compartment. Titanic's compartments were open at the top too, and the water filled them one after another ([History.com](https://www.history.com/this-day-in-history/april-15/titanic-sinks)). When one tenant gets over its wall, nothing closes.

### Why now

Agents now run model-written code all night, on GPUs they share with strangers. The walls under them are leaking.

- **Fact 1: the vGPU wall leaks.** On 30 Sep 2026, NVIDIA published CVE-2026-47498, a flaw in the GSP plugin of its vGPU Manager. A guest VM user can send a crafted RPC message and trigger an out-of-bounds write, which may lead to code execution or privilege escalation (CVSS 7.8). Sources: [CVE record](https://www.cve.org/CVERecord?id=CVE-2026-47498), [NVIDIA bulletin, September 2026](https://github.com/NVIDIA/product-security/tree/main/2026/5861).
- **Fact 2: the container wall leaks too.** With NVIDIAScape (CVE-2025-23266), Wiz showed that a three-line Dockerfile could break out of the NVIDIA Container Toolkit to root on the host. Wiz warned that on shared GPU clouds this could let one customer reach other customers' data and models. It estimated that about 37% of cloud environments could be vulnerable, based on an analysis of more than 100,000 environments. Sources: [Wiz](https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape), [SC Media](https://www.scworld.com/news/3-line-exploit-revealed-for-critical-nvidia-container-toolkit-flaw).

### What happens at 2 a.m.

02:07. An agent in vm-7f3a sends a malformed request down the vGPU path. The IOMMU logs a fault that nobody reads. The pager fires. One engineer, half awake, opens a runbook written for a different attack and joins a bridge call on the same network the attacker may be reading.

Six things now have to happen, in this order:
- cut the network,
- kill the tokens,
- stop new placements,
- freeze the guest,
- save its memory before anything is wiped,
- move eleven innocent neighbors without dragging them through a hypervisor nobody trusts.

Get the order wrong and you either destroy the evidence or spread the flood. Meanwhile counsel asks whether a notification clock has started, the CEO asks whether customers are affected, and nobody trusts email.

- **Fact 3: the flood is fast.** CrowdStrike's 2026 Global Threat Report says the average eCrime breakout time (from initial access to lateral movement) fell to 29 minutes in 2025. The fastest observed breakout took 27 seconds, and AI-enabled adversaries ran 89% more operations than the year before. Source: [CrowdStrike](https://www.crowdstrike.com/en-us/press-releases/2026-crowdstrike-global-threat-report/).
- **Fact 4: the attacker doesn't need sleep.** Anthropic disrupted a state-sponsored espionage campaign in which AI did 80–90% of the work. Humans stepped in at only 4–6 decision points, and at its peak the AI made thousands of requests, often several per second. Source: [Anthropic](https://www.anthropic.com/news/disrupting-AI-espionage).

### Who bleeds

- **The eleven neighbors.** These tenants did nothing wrong, and their weights, data and prompts sit on the same host. Fact 2 describes exactly this risk.
- **The operator.** Without a compartment to seal, the safe move is to drain the rack or the hall. One bad tenant becomes everyone's outage.
- **The responder.** One person, one runbook, six steps in a fixed order, at 2 a.m., with nobody else on hand.
- **Counsel and the C-suite.** Notification clocks may be running while email and phones can't be trusted (see the Winstead line in section 6).
- **Everyone selling AI compute.** Isolation is what they sell, and every escape teaches buyers that shared GPUs aren't safe.

---

## 5. What Claura does: built today vs. the vision

### BUILT TODAY: the demo a judge can touch

| On a ship | Claura today | Under the hood |
|---|---|---|
| The bridge | **Liquid-Glass console** with Overview, Incident, War Room, Agents, Policy and Reports, plus a 3D map of the DFW-2 campus (Hall B, rack 14). It shows one status and one card, and details only on demand. | `apps/dashboard`, `packages/facility-3d` |
| The lookout | **Sentry** correlates IOMMU faults, VMM audit logs, host EDR, IPMI flows and token misuse into one incident. | Nemotron tool calls: `list_recent_signals` → `open_incident` |
| Damage-control officer | **Triage** builds the attack graph and the blast radius: 1 suspect host, 11 co-resident guests, management plane reachable. | `get_host_inventory`, `check_reachability` → `record_finding` |
| Damage-control party | **Warden** runs the guest-escape playbook, reversible steps first: detach the vNIC, revoke credentials, cordon the host, pause the guest. Then it captures memory over the trusted management path and fails the 11 guests over to clean hosts. It never live-migrates off a suspect host. | `get_policy` → `propose_action` (the only way an agent changes anything) |
| Door locks | **Policy gate** in SpacetimeDB reducers. Each action is `auto`, `approval` or `deny`. Unknown actions and nonexistent targets are blocked (fail closed), and agents can't approve their own proposals. | `policy` table, `propose_action`, `approve`, `set_policy` |
| Captain's signature | **Quarantine host** is the one human step: evidence, scope and rollback on one card, approved with Cmd+Enter. | `approve` reducer |
| Ship's log | A **live incident log** that every console subscribes to. **Scribe** writes the forensic timeline and a plain-language brief. | `incident_event`, `report`; `list_events` → `file_report` |
| Radio room | **War Room**, off the compromised network on SpacetimeDB's cloud. Channels #command, #legal, #exec, #comms-pr and #vendors; break-glass identities; what we know and don't know; tasks; a decision log; and example notification clocks, labelled "confirm with counsel". | `views/warroom.ts` |
| Boarding party | **Secure Shell.** Click any host for a just-in-time, short-lived OpenSSH-certificate session in the browser, with passkey or Touch ID step-up, two-person approval for suspect hosts, a read-only forensic mode, and every keystroke hash-chained into the incident log. | `ssh/` |
| Ship's PA | **Claura Voice.** ElevenLabs reads briefs aloud in several languages, and push-to-talk "Ask Claura" questions are answered by local Nemotron. | `voice/` |
| The flag | **claura.tech** and the new mark, a seal bar that closes the ring. | `apps/site`, `brand/` |

**What's simulated (say it before they ask)**
- Telemetry is replayed from fixture data. No live hypervisor is attached.
- Containment steps change state in the database. No real NIC, VM or host is touched.
- 2,048 hosts, 61,207 sandboxed agents, the 11.8 s mean and the 9.4 s are scenario data. The 9.4 s also assumes the approval comes instantly.
- The War Room's people (RK, JT, CEO, PR, CV) are fictional roles.

**Check before 12:00 (each of these is a claim in this file)**
- [ ] War Room messages are live SpacetimeDB rows, not the static `warroom-data.ts` module the console started with.
- [ ] The module is published to **Maincloud**. The backend README still says local server only.
- [ ] Secure Shell opens a real session with the certificate, passkey and second approver.
- [ ] Ask Claura answers come from live Nemotron, not canned text.
- [ ] Reducers allow-list operator identities. The backend README lists "no authentication" as an open issue. If this isn't fixed, use the honest answer in Q5.
- [ ] The sidebar tags "NVIDIA Nemotron · on-prem" and "SpacetimeDB · live sync" are true in the mode you demo. In scripted replay mode they aren't.

### THE VISION: 12–36 months (not built; say "we're building toward")

**The SOLAS moment.** After Titanic, the first SOLAS convention was adopted in 1914. Today SOLAS requires passenger ships to be divided into watertight compartments so that they stay afloat after hull damage ([IMO](https://www.imo.org/en/about/Conventions/Pages/International-Convention-for-the-Safety-of-Life-at-Sea-%28SOLAS%29,-1974.aspx)). Cyber regulators have already started the clocks:
- **SEC Form 8-K Item 1.05:** generally due four business days after a company determines an incident is material ([SEC](https://www.sec.gov/newsroom/press-releases/2023-139)).
- **GDPR Art. 33:** 72 hours after becoming aware of a personal-data breach ([GDPR](https://gdpr-info.eu/art-33-gdpr/)).
- **NIS2:** an early warning within 24 hours, a notification within 72 hours and a final report within a month ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2022/2555/oj/eng)).

AI infrastructure is next. Claura's ambition is to be the bulkhead standard every AI cloud ships with.

**Horizon 1: real doors, everywhere (0–12 months)**
- **Real sensors and real doors.** Adapters that read hypervisor audit logs, IOMMU faults, host EDR, BMC/IPMI flows and workload identity, and that act through the VMM, the identity provider, the scheduler (Kubernetes, Slurm) and the management plane.
- **The agent firewall.** The policy gate grows into a firewall for every autonomous workload's tool calls: a compartment per agent, a blast-radius budget per agent, and doors for tools and tokens that stay shut unless policy opens them.
- **Damage-control drills.** Red-team agents attack a digital twin of the facility every night, and Claura publishes measured time-to-contain for each incident class. The illustrative 9.4 s becomes a measured number.

**Horizon 2: bulkheads in silicon (12–24 months)**
- **DPU-enforced containment.** When the hypervisor is the suspect, Claura cuts the network and captures evidence from a DPU (for example NVIDIA BlueField) that the host can't override.
- **Autonomous recovery with attested re-admission.** A quarantined host goes back into the pool only after it is reimaged, passes a clean attestation (measured boot, GPU confidential computing) and a human approves.
- **Proof of containment.** Scribe's hash-chained log becomes a signed attestation of what we knew, when, and who approved it, which counsel, auditors and cyber insurers can rely on. Claura drafts the notification packets and counsel signs them.

**Horizon 3: the convoy (24–36 months)**
- **Cross-cloud flood warnings.** AI clouds share signed, privacy-preserving escape signatures. When one cloud seals a new escape chain, every other cloud shuts that door before the wave arrives.
- **A classification society for AI clouds.** Continuous compartmentalization scores that insurers can price and buyers can require, the way ships are classed for watertight integrity.
- **Sovereign AI defense.** The full stack, air-gapped, for national AI factories and regulated clouds: local Nemotron, a sovereign out-of-band War Room, and no data leaving the jurisdiction.

**Why it's a company**
- **The hull is being built now.** McKinsey estimates the world needs $6.7 trillion of data center capex by 2030, $5.2 trillion of it for AI workloads ([McKinsey](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers); [IT Brew summary](https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030)).
- **Agents are the new attack surface.** Gartner predicts that by 2028, 25% of enterprise breaches will be traced back to AI agent abuse ([APMdigest, quoting Gartner](https://www.apmdigest.com/gartner-top-predictions-it-organizations-and-users-2025-and-beyond)).
- **Breaches are slow and expensive, and automation pays.**
  - IBM's 2026 report puts the average breach at a record $4.99M, and finds that organizations that use security AI and automation extensively save $1.93M ([IBM](https://www.ibm.com/reports/data-breach)).
  - The average breach took 247 days to identify and contain ([Baker Donelson summary of IBM 2026](https://www.bakerdonelson.com/ten-takeaways-from-ibms-2026-cost-of-a-data-breach-report)).
  - The industry measures breaches in months; damage control is measured in seconds.
- **Business model (vision).** Priced per protected GPU host for AI clouds and neoclouds. The War Room is sold separately as a break-glass product for any company, and attestations are an API for insurers and auditors.

**The line to say out loud:** "Today Claura seals one host in a demo. In three years, we want no AI cloud to ship without bulkheads, and Claura to be the crew on every one."

---

## 6. Why it wins each track

> **Cap check:** HACKATHON.md reports a cap of three sponsor tracks per team, and this list targets four. Confirm on Devpost before you pick.

- **Winstead PC: Cyber Incident Response Dashboard.**
  - The track lead told us to assume the attacker can see normal comms, phones are down, email is sporadic and nobody has information. The War Room is the radio room that still works: off the compromised network on SpacetimeDB's cloud, break-glass identities, channels by role, Scribe's know/don't-know brief, tasks, a decision log and example notification clocks.
  - Every action, approval and shell keystroke lands in one record that says who authorized what, which is what counsel needs afterwards.
  - Gaps to close or disclose: the brief also asks for admin-managed users and documentation that follows a named incident standard.
- **NMC²: Keep the World Running.** NMC² named three failures: missed warnings, unclear handoffs and the wrong information at the wrong time. Sentry is the warning nobody misses, one live log is the handoff every console shares, and the approval card puts evidence, scope and rollback in front of the one person who must decide. That way one host gets sealed and the hall stays up, which matters when 1 in 5 operators say their most recent major outage cost more than $1M ([Uptime Institute, via ITWeb](https://itweb.africa/article/uptime-announces-annual-outage-analysis-report-2026/WnxpEv4Y6837V8XL)).
- **NVIDIA: Use Nemotron Beyond a Chatbot.**
  - Four Nemotron agents (`nemotron-3-nano:4b`, local via Ollama) plan and run multi-step tool calls with nine tools: read signals, open the incident, pull host inventory, check management-plane reachability, record findings, read policy, propose containment, read the log and file the report. Nemotron also answers Ask Claura by voice, and none of it is a chat box.
  - It runs on-prem by design, because telemetry from a live breach is the one dataset you can't send to someone else's cloud.
- **Spacetime: Build on Spacetime.**
  - SpacetimeDB is the ship's log and the door locks. Every host, guest, signal, proposal, approval and report is a row. Reducers enforce the policy gate (auto / approval / deny, fail closed). Every console and the War Room subscribe to the same live log on Maincloud, and the repo is public.
  - Everything outside Spacetime is a client or a thin bridge: the agent runner, the SSH bridge and the voice proxy. The incident state, the policy and the log all live in Spacetime.
- **MLH prizes** (categories as listed on [MLH's HackUTD prize page](https://www.mlh.com/events/hackutd-ae/prizes); confirm on Devpost):
  - **Best Use of ElevenLabs:** Claura Voice is how people who can't read a console mid-crisis still get the facts. ElevenLabs reads Scribe's brief aloud in the listener's language, and push-to-talk Ask Claura turns a spoken question into a Nemotron answer spoken back.
  - **Best Domain Name from GoDaddy Registry:** claura.tech is live. Enter only if its TLD qualifies under the prize rules.
  - **Solana, Vultr, DigitalOcean, Gemini:** enter only with a real integration. The most honest fits are anchoring the incident log's hash-chain head on Solana as a public, timestamped proof of containment, and hosting claura.tech or a War Room relay on Vultr or DigitalOcean. Skip Gemini, because a second model muddies the "Nemotron, on-prem" story.

---

## 7. Demo-film voice-over (about 105 s)

253 words in 32 lines. At a typical narration pace of about 150 words per minute that is about 100 s of speech, or 103–108 s with pauses. Line 1 lands in about 2.5 s. Line 28 is **Claura's own voice**: record a real Ask Claura answer and keep it to about 10 words. If the cut runs over 110 s, drop line 13 or line 25.

```text
01  Titanic could survive four flooded compartments.
02  The iceberg opened five.
03  The walls were open at the top. The sea spilled over.
04  AI clouds are built the same way.
05  Every agent gets a wall. Above them all: one shared host.
06  In September, NVIDIA patched a GPU flaw a guest could trigger from inside.
07  Meet Claura, the bulkhead. Damage control for autonomous workloads.
08  Two a.m. One agent reaches for the host.
09  Sentry hears the hull crack: six signals, one incident.
10  Triage maps the flood: one host, eleven neighbors, management plane in reach.
11  Warden shuts the reversible doors first.
12  Network cut. Credentials revoked. Host cordoned. Guest frozen.
13  Then the evidence: memory captured over a trusted path.
14  Eleven neighbors moved to clean hosts, never through the flood.
15  Each agent is NVIDIA Nemotron, running locally, calling tools.
16  But the model never holds the keys.
17  Policy does, in SpacetimeDB.
18  One door is heavy: quarantining the host.
19  A human signs for it: evidence, scope, rollback, one card.
20  Sealed. Nine point four seconds, on our demo clock.
21  Assume the attacker reads your email.
22  The War Room runs off the network, on break-glass identities.
23  Legal, execs, PR, vendors: one brief. What we know. What we don't.
24  Boarding the flooded compartment? Click the host.
25  Short-lived certificate. Touch ID. A second approver.
26  Every keystroke, chained into the log.
27  Hands full? Just ask.
28  [CLAURA VOICE] One server was involved. No customer data accessed so far.
29  After Titanic, the world rewrote the rules of the sea.
30  AI clouds are next.
31  Claura.
32  Ships survive breaches. Now AI clouds can.
```

**Picture for each line (real UI footage from line 8 onward)**

| Lines | On screen |
|---|---|
| 1–3 | A hull plan with 16 compartments. Five flood, then the water tips over the bulkhead tops. Motion graphic only, no disaster footage. |
| 4–6 | Pull back across the DFW-2 3D campus. A CVE card on screen: "CVE-2026-47498 · CVSS 7.8 · NVIDIA bulletin, Sept 2026". |
| 7 | The Claura mark: the seal bar slides shut across the ring. |
| 8–10 | Overview, then Incident. Rack 14 turns orange, the signal stream fills, and the attack graph lights 11 neighbors. Lower third: "Prototype · telemetry replayed from fixtures". |
| 11–14 | Containment steps tick off. Failover arrows run to the clean Hall C hosts. |
| 15–17 | Agents view (model label and tool-call trace), then the Policy view's auto / approval / deny rows. |
| 18–20 | Approval sheet, held 2 s on Scope and Rollback. Cmd+Enter with a key-press sound. The counter stops at 9.4 s with the label "Illustrative demo number". |
| 21–23 | War Room: the out-of-band banner, the #exec brief, the #legal clocks. |
| 24–26 | Click b14-gpu-07, then Secure Shell: the Touch ID prompt, the second approver, the recording ledger. |
| 27–28 | The mic button pressed, a waveform, Claura answering. |
| 29–32 | The hull plan with every door shut. End card held 3 s: Claura, the tagline, claura.tech, github.com/zero-abd/claura. |

Burn in captions. Use one calm narrator voice from ElevenLabs, and keep the music under the voice.

---

## 8. The five hardest judge questions

**Q1. What's real here, and is 9.4 seconds real?**
*(Trim this answer to what passed the check list in section 5.)*
Real: the console; the SpacetimeDB module (tables, the policy gate in reducers, approvals, and the live log every console subscribes to); four Nemotron agents making real tool calls into those reducers; the War Room, Secure Shell and Voice. Simulated: telemetry is replayed fixture data, containment changes database state rather than real hypervisors, and the fleet sizes are scenario data. The 9.4 s is our demo clock and assumes an instant approval. Measuring real time-to-contain is the first job of a pilot.

**Q2. Guest-to-host escapes are rare. Why build for them?**
They're rare, but the blast radius is every tenant on the host, and they're real. In September NVIDIA patched a vGPU Manager flaw a guest could trigger (CVE-2026-47498). Wiz's NVIDIAScape showed a three-line Dockerfile could get root on the host, with shared GPU clouds most at risk. Wiz's tenant-isolation research has found problems at Hugging Face, Replicate and SAP AI Core ([Wiz](https://www.wiz.io/blog/sapwned-sap-ai-vulnerabilities-ai-security)). The playbook also isn't specific to escapes: credential replay, a hijacked agent or a poisoned model all end in the same question. Which doors do we close, in what order, and who signs?

**Q3. A 4B model will be wrong. What happens when it's wrong, or prompt-injected through the logs it reads?**
Then it's wrong inside a box. The model can only call `propose_action` with a fixed set of actions. The reducer looks each action up in a policy table and blocks anything unknown (fail closed). It also blocks hosts and VMs that don't exist, refuses to let an agent approve its own proposal, and holds the high-impact step for a human. In our run, either the model proposes a denied action itself or a labelled red-team probe asks for `reimage_host`, and the gate blocks it. We chose a small local model on purpose: its job is narrow, and a bigger Nemotron is one environment variable away. What we haven't measured yet is its error rate. That's the first eval.

**Q4. Failing eleven tenants over on a false alarm is expensive. How do you avoid crying wolf?**
The cheap doors close first. Cutting one VM's network, revoking its tokens, cordoning the host and pausing the guest can all be undone. Failover is the expensive automatic step, so it's a policy row: an operator can switch it from `auto` to `approval` with one `set_policy` call, per fleet today and per tenant later. Quarantine shows its rollback on the card. We haven't measured a false-positive rate, and a blast-score threshold is the next gate we add. Nightly drills on a digital twin are how we'll put a number on it.

**Q5. Why wouldn't the attacker just take over Claura, or call `approve` themselves?**
Claura is built to be the part that's still standing. The War Room runs on SpacetimeDB's cloud, outside the compromised network, with break-glass identities issued before any incident. Shell access needs a short-lived certificate, a passkey and a second person. Evidence is hashed, and shell recordings are hash-chained into the log, so tampering shows. Honest gap: in this build the reducers don't yet allow-list operator identities, so any connected client could call `approve`. The fix is an identity check on `ctx.sender` plus passkey step-up for the approver, and it's the next commit. If it ships before judging, say "approvals require an allow-listed identity" instead.

---

## Appendix A. Metaphor key (keep it consistent across speakers)

| Ship | Claura |
|---|---|
| Hull | The AI cloud (the DFW-2 campus) |
| Compartment | One host and its guests (one blast-radius cell) |
| Wall / bulkhead | Tenant isolation: VM, IOMMU, sandbox |
| Open top of the compartment | The shared host, GPU driver and management plane |
| The flood | Lateral movement, the blast radius |
| Lookout | Sentry |
| Damage-control officer | Triage |
| Damage-control party | Warden |
| Light doors | Reversible steps: vNIC, credentials, cordon, pause |
| Saving the logbook before you seal | Memory capture over the trusted management path |
| Moving passengers to dry compartments | Failing 11 guests over to clean hosts. "Never through the flooded room" means no live migration. |
| The heavy door and the captain's signature | Quarantine the host: human approval with Cmd+Enter |
| Door locks | The policy gate in SpacetimeDB reducers |
| Ship's log | The incident log in SpacetimeDB, written up by Scribe |
| Radio room | The War Room (out-of-band) |
| Boarding party under a two-person rule | Secure Shell |
| Ship's PA | Claura Voice |
| SOLAS and the classification society | The vision: standards, attestations, insurance |

- **If a judge says "a VM already is a bulkhead":** "A VM is a wall. A bulkhead is a wall built for the day the hull is breached, plus the doors and the crew that close them. Claura is the doors and the crew."
- **Optional color line:** bulkheads are old technology. UNESCO lists the watertight-bulkhead technology of Chinese junks, where damage to one or two cabins doesn't flood the rest ([UNESCO](https://ich.unesco.org/en/USL/watertight-bulkhead-technology-of-chinese-junks-00321)).

## Appendix B. Say this, not that

| Say | Don't say |
|---|---|
| "Sealed in 9.4 seconds, on our demo clock." | "Claura contains breaches in 9.4 seconds." |
| "Nemotron runs locally on this machine; the design runs it on-prem." | "It's running in your data center today." |
| "Telemetry is replayed; the reducers, policy and log are real." | "It's connected to real hypervisors." |
| "In September NVIDIA patched a vGPU flaw a guest could trigger." | "NVIDIA GPUs are insecure" or "escapes happen every day." |
| "Example notification clocks; confirm with counsel." | "Claura tells you when to file your 8-K." |
| "Policy, not the model, decides." | "The AI decides." |
| "The vision is…" for anything in the vision box | Vision features in the present tense |

## Appendix C. Sources (checked 8 Nov 2026)

1. History.com, "Titanic sinks": 16 compartments; four could flood; at least five ruptured; compartments not capped at the top. https://www.history.com/this-day-in-history/april-15/titanic-sinks
2. IMO, SOLAS: first version adopted in 1914 in response to Titanic; watertight subdivision requirement. https://www.imo.org/en/about/Conventions/Pages/International-Convention-for-the-Safety-of-Life-at-Sea-%28SOLAS%29,-1974.aspx
3. UNESCO, watertight-bulkhead technology of Chinese junks (inscribed 2010). https://ich.unesco.org/en/USL/watertight-bulkhead-technology-of-chinese-junks-00321
4. CVE-2026-47498, NVIDIA vGPU Manager GSP plugin, CVSS 7.8, published 30 Sep 2026. https://www.cve.org/CVERecord?id=CVE-2026-47498. NVIDIA bulletin (GPU Display Driver, September 2026): https://github.com/NVIDIA/product-security/tree/main/2026/5861
5. Wiz, NVIDIAScape (CVE-2025-23266), 17 Jul 2025. https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape
6. SC Media, Wiz's 37% estimate from 100,000+ cloud environments, 18 Jul 2025. https://www.scworld.com/news/3-line-exploit-revealed-for-critical-nvidia-container-toolkit-flaw
7. Wiz, SAPwned: third report in its AI tenant-isolation series, after Hugging Face and Replicate, 17 Jul 2024. https://www.wiz.io/blog/sapwned-sap-ai-vulnerabilities-ai-security
8. CrowdStrike 2026 Global Threat Report press release, 24 Feb 2026: 29-minute average breakout, 27-second fastest, AI-enabled adversaries up 89%. https://www.crowdstrike.com/en-us/press-releases/2026-crowdstrike-global-threat-report/
9. Anthropic, "Disrupting the first reported AI-orchestrated cyber espionage campaign", Nov 2025: AI did 80–90% of the work; 4–6 human decision points. https://www.anthropic.com/news/disrupting-AI-espionage
10. IBM, Cost of a Data Breach Report 2026: $4.99M record average; $1.93M saved with extensive security AI and automation. https://www.ibm.com/reports/data-breach
11. Baker Donelson, "Ten Takeaways from IBM's 2026 Cost of a Data Breach Report", 30 Jul 2026: 247 days to identify and contain. https://www.bakerdonelson.com/ten-takeaways-from-ibms-2026-cost-of-a-data-breach-report
12. McKinsey, "The cost of compute: A $7 trillion race to scale data centers", Apr 2025: $6.7T by 2030, $5.2T for AI. https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers. Summary checked at IT Brew, 9 May 2025: https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030
13. Gartner prediction (25% of enterprise breaches traced to AI agent abuse by 2028), quoted by APMdigest, 31 Jan 2025. https://www.apmdigest.com/gartner-top-predictions-it-organizations-and-users-2025-and-beyond
14. Uptime Institute, Annual Outage Analysis 2026 release (via ITWeb, 13 May 2026): in the 2025 survey, 57% said their last major outage cost more than $100,000, and 1 in 5 more than $1M. https://itweb.africa/article/uptime-announces-annual-outage-analysis-report-2026/WnxpEv4Y6837V8XL
15. SEC press release 2023-139 (Form 8-K Item 1.05), 26 Jul 2023. https://www.sec.gov/newsroom/press-releases/2023-139
16. GDPR Article 33 (72 hours). https://gdpr-info.eu/art-33-gdpr/
17. NIS2 Directive (EU) 2022/2555, Art. 23 and Recital 102 (24 h / 72 h / one month). https://eur-lex.europa.eu/eli/dir/2022/2555/oj/eng
18. MLH, Prizes at HackUTD. https://www.mlh.com/events/hackutd-ae/prizes
19. HackUTD 2026 challenge list (NMC², Winstead PC, NVIDIA, Spacetime). https://zeroday.hackutd.co/
