# Claura: the immune system for AI data centers

Pitch package, "immune system" angle. HackUTD 2026, judging Sunday 8 Nov, 1:00-4:00 pm.

> **Claim discipline. Read this before every rehearsal.**
> - **"Today"** means the demo shows it. **"Vision"** means roadmap, and we say "vision" out loud.
> - **The attack is a simulated replay on a simulated fleet.** Every number on screen or in the script (9.4 s, the 1 s correlation, 2,048 hosts, 18,432 VMs, 61,207 sandboxed agents, 11.8 s mean) is **illustrative demo data**.
> - Every market or threat statistic in this file has a source URL (see **Sources** at the end). Do not add numbers at the table that are not in this file.
> - **At 11:30, strike any "Built today" line that did not ship.** Move it to "next" in every script that mentions it.

---

## 1. Title, logline, taglines

**Title:** Claura: the immune system for AI data centers

**Logline:** When an AI workload tries to break out of its VM, Claura's defender agents detect, contain, heal and remember at machine speed, while policy, not the model, decides what they may do.

**Tagline options (7 words each):**
1. **Every breach makes the whole fleet immune.** (Recommended. It is the "remember" beat, and the demo shows it: Sentry pushes a fleet rule after the incident.)
2. **Detect. Contain. Heal. Remember. Before it spreads.** (Echoes the brand line "Seal the breach before it spreads.")
3. **Your AI data center finally has antibodies.**

---

## 2. Elevator pitches

### 15 seconds (38 words)

> Your body fights infections without waking you. AI data centers can't, and attackers already use AI. Claura is their immune system: agents that detect, contain, heal and remember at machine speed. Policy decides; humans sign the irreversible step.

### 30 seconds (79 words)

> In one campaign Anthropic disrupted, AI did 80 to 90 percent of the attacker's work. CrowdStrike's fastest recorded breakout took 27 seconds. And AI data centers still answer with a pager at 2 a.m. Claura is the immune system for AI data centers. Sentry detects a VM escape, Triage maps the blast radius, Warden contains it reversible-first and moves the neighbors to clean hosts, and Scribe remembers. Policy, not the model, decides. Every breach makes the whole fleet immune.

Sources for the two numbers: Anthropic [R1], CrowdStrike [R2].

---

## 3. The 2-minute judge-table pitch

About 258 spoken words, plus about 5 s of silence while the replay runs and about 6 s while Claura answers out loud. That lands at 2:00. Two people: one **speaker**, one **driver**.

**Before the judge arrives**
- Console on **Overview**, status "All clear". A second console on a teammate's laptop, showing the same incident (this is the live-sync proof for the Spacetime judges).
- Mic permission granted and volume up for Ask Claura. The demo video is ready on a phone in case anything breaks.
- If the judge arrives mid-run: press **Reset** and start from the top. The pitch only works in order.

---

**0:00-0:22 · Hook**
[DEMO: Overview, "All clear". Don't touch anything yet.]

"Your body fights infections without paging you: it detects, contains, heals, remembers. AI data centers get a pager and someone asleep at 2 a.m. And attackers went agentic: in one campaign Anthropic disrupted, AI did 80 to 90 percent of the work. Defense has to be agentic too. This is Claura, the immune system for AI data centers."

**0:22-0:30 · The honesty line (never skip this)**
[DEMO: point at the fleet line: 2,048 hosts · 61,207 sandboxed agents.]

"Quick honesty: the attack is a simulated replay. The agents, the policy gate and the database are live."

*Say that line only if this run is the live mode, with the agents on Nemotron writing to SpacetimeDB. If you run the scripted replay instead, say: "Quick honesty: this is our scripted replay, so it never stalls at a table. The same flow runs live on Nemotron and SpacetimeDB, and I'll show you after."*

**0:30-0:37 · Incident replay**
[DEMO: click **Simulate breach** (the incident replay), then **Open incident**. Say one word, then let the screen work for about 5 seconds: signals stream in, the attack path lights up, Warden's steps tick.]

"Watch."

**0:37-0:58 · Detect, map, contain**
[DEMO: the approval sheet opens by itself at the gate. Point at **Evidence**, then at **Scope**.]

"In one second Sentry correlated six signals: an IOMMU fault, a vGPU fault, qemu spawning a shell, a token used out of scope. Triage mapped the blast radius: one host, eleven neighbors. Warden went reversible-first: network cut, tokens revoked, host cordoned, guest frozen, memory captured, neighbors on clean hosts, no live migration."

**0:58-1:12 · The gate, and the one human step**
[DEMO: point at **Rollback** and at the line "Warden cannot quarantine a host on its own."]

"But an immune system without restraint is an autoimmune disease. So policy, not the model, decides. That gate is a SpacetimeDB reducer, not a prompt. And the one irreversible step, quarantine, needs a human."

[DEMO: press **⌘↵** (Cmd+Enter). The counter stops at 9.4 s.]

"Approved. Contained in 9.4 seconds, on our demo clock."

**1:12-1:30 · War Room**
[DEMO: click **War Room**. Point at the out-of-band banner, then the brief (what we know / what we don't), then **#legal** and the notification clocks.]

"The attacker reads your email; the phones are down. So the War Room runs off the compromised network, with break-glass identities. Legal, execs and comms get one plain-language brief: what we know, what we don't, owners, disclosure clocks."

**1:30-1:42 · Click a host, then Secure Shell**
[DEMO: **Overview**, then click host **b14-gpu-07** on the facility map. The host sheet opens. Click **Open secure shell**, then do the Touch ID step-up. The teammate approves as the second person on their own console.]

"Need hands on the box? Click the host. Short-lived certificate, Touch ID, a second approver, read-only forensics, every keystroke hash-chained."

**1:42-1:52 · Ask Claura**
[DEMO: hold the mic button in the toolbar (**Ask Claura**) and ask: "Claura, what happened on b14-gpu-07?" Let the spoken answer run for about 6 seconds, then cut in.]

"Or just ask."

**1:52-2:00 · Close**
[DEMO: click **Agents** and point at Sentry's card: "Fleet rule added for ioctl 0xC0186441". End on **Overview**, "Contained".]

"Detect, contain, heal, remember. Sentry pushed a fleet rule, so every host now recognizes that exploit. That's Claura. Every breach makes the whole fleet immune."

---

**If you're running long:** cut the Anthropic sentence from the hook (saves about 7 s), then the Secure Shell beat (about 10 s). Never cut the honesty line or the ⌘↵ moment.

**If the voice fails** (ElevenLabs needs the venue Wi-Fi): "The voice is cloud, the brain is local. Here's the same brief." Then point at Scribe's brief in the War Room.

---

## 4. The problem

### Why now: AI agents are the new attack surface

AI is turning into agents: software that writes code and then runs it. In an AI data center, that code runs in sandboxes, which are guest VMs and containers packed onto shared GPU hosts. The sandbox boundary, and the GPU path through it, is the only wall between one tenant's freshly generated code and everything else: the tenants on the same host, the host itself, and the management plane behind it.

That wall is software, and it cracks. On 30 September 2026, NVIDIA disclosed a flaw that a user inside a guest VM can trigger in the host's vGPU Manager **[R4]**. The thing pushing on that wall is increasingly software too. Last year, Anthropic disrupted an espionage campaign in which AI did most of the work **[R1]**.

### What happens at 2 a.m.

*(Our demo scenario. The clock is the demo's.)*

**02:14:07.** A guest VM on host b14-gpu-07 issues an ioctl the hypervisor has never seen. The vGPU driver faults. The IOMMU blocks a DMA write outside the guest's memory. qemu, the process that *is* the VM, spawns a shell. A flow leaves for the management port. A workload token is used outside its scope.

That's six signals in six tools on six dashboards, and none of them says "incident."

A pager fires. Someone wakes up, finds a laptop, and connects over VPN to a network the attacker may already be inside. She opens six consoles. Half-awake, she has to remember that you never live-migrate off a suspect host, because migration copies eleven tenants' memory through the hypervisor you just stopped trusting. Then she has to tell legal what happened, over an email system the attacker might be reading.

The code on the other side of the wall doesn't sleep. It doesn't wait for the VPN, and it doesn't page anyone. Attackers break out in seconds **[R2]**, and they choose the hours when nobody is watching **[R3]**.

### Who bleeds

- **The eleven neighbors.** They did nothing wrong. They share a host, and the host is now a crime scene. Their models, data and uptime sit one boundary away from someone else's escape.
- **The operator.** A multi-tenant GPU cloud sells isolation, so an escape means the product itself failed. Every other tenant is watching how this one is handled.
- **The on-call engineer.** She makes the highest-stakes call of the year half-awake, with the evidence spread across six tools.
- **Counsel and the executives.** Disclosure clocks start before anyone knows the scope, and the attacker may be reading the thread where they discuss it.
- **Everyone downstream.** Whatever runs on those GPUs is somebody's product.

### The four receipts

| | Fact | Source |
|---|---|---|
| **R1** | **Attackers are already agents.** Anthropic reports that a state-sponsored group used AI to perform 80-90% of an espionage campaign against roughly 30 targets. At its peak the AI made thousands of requests, often several per second. Published 13 Nov 2025. | [Anthropic](https://www.anthropic.com/news/disrupting-AI-espionage) |
| **R2** | **Breakout takes seconds, not shifts.** In 2025 the average eCrime breakout time fell to 29 minutes. The fastest on record was **27 seconds**. Attacks by AI-enabled adversaries rose 89%. (CrowdStrike 2026 Global Threat Report) | [CrowdStrike](https://www.crowdstrike.com/en-us/global-threat-report/) |
| **R3** | **They strike at 2 a.m.** **88%** of ransomware payloads were deployed outside business hours, and 79% of data exfiltration happened off-hours. The data covers 661 incident response and MDR cases from Nov 2024 to Oct 2025. (Sophos Active Adversary Report 2026) | [Sophos](https://www.sophos.com/en-us/press/press-releases/sophos-active-adversary-report-2026-identity-attacks-dominate-as-threat-groups-proliferate) |
| **R4** | **The vGPU wall cracks.** CVE-2026-47498 was published 30 Sep 2026, rated CVSS 3.1 7.8 (High). A user inside a guest VM can cause an out-of-bounds write in NVIDIA vGPU Manager's GSP plugin by sending a crafted RPC message. NVIDIA says exploitation might lead to code execution. | [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-47498) · [NVIDIA bulletin](https://github.com/NVIDIA/product-security/tree/main/2026/5861) |

### Why it has to be agentic

1. Attackers became software **[R1]**.
2. That software moves in seconds and strikes at night **[R2, R3]**.
3. The wall between tenants is software too, and it cracks **[R4]**.
4. So **the first responder has to be a machine, and the last word has to be a human. Everything in between has to be policy.**

A system like that is an immune system, and Claura is building one.

---

## 5. What Claura does today, and the vision

### 5A. Built today: the demo shows this

*Strike any line that did not ship by 11:30.*

| Built today | What the judge sees | Immune role |
|---|---|---|
| **Operator console** (Liquid Glass, minimal, progressive disclosure) | Overview, Incident, War Room, Shells, Agents, Policy, Reports. One approval sheet, ⌘↵. | Awareness |
| **Four defender agents on NVIDIA Nemotron** | Nemotron 3 Nano 4B (`nemotron-3-nano:4b`) running locally / on-prem through Ollama, driving multi-step tool calls. **Sentry** correlates IOMMU faults, VMM audit logs, host EDR, IPMI flows and token misuse. **Triage** builds the attack graph and blast radius (1 suspect host, 11 co-resident guests, mgmt plane reachable). **Warden** contains, reversible steps first. **Scribe** writes the forensic timeline and a plain-language brief. | Detection and response |
| **The policy gate, in SpacetimeDB reducers** | Agents propose and reducers decide: allow, reject, or hold for a human. All incident state lives in the SpacetimeDB module, and every console subscribes to the live incident log. Published to SpacetimeDB Maincloud. *Policy, not the model, decides.* | Tolerance (what stops it attacking the body) |
| **One human approval** | Quarantine host b14-gpu-07: evidence, scope and rollback on one card, ⌘↵. Warden cannot do it alone. | Consent for surgery |
| **Reversible-first containment** | Detach vNIC, revoke credentials, cordon host, pause guest, capture memory over the trusted mgmt path, fail 11 guests over to clean hosts. Never live-migrate off a suspect host. Each step shows its undo. | Inflammation, then quarantine, then healing |
| **Fleet memory** | After the incident, Sentry adds a fleet rule for the exploit's ioctl. | Immune memory |
| **War Room** | Out-of-band coordination on SpacetimeDB's cloud, off the compromised network. Channels #command, #legal, #exec, #comms-pr and #vendors. Break-glass identities. Scribe's brief (what we know, what we don't). Tasks with owners, a decision log, and example notification clocks: SEC Form 8-K Item 1.05, generally due four business days after an incident is judged material [SEC](https://www.sec.gov/newsroom/press-releases/2023-139); GDPR Art. 33, within 72 hours of becoming aware where feasible [GDPR](https://gdpr-info.eu/art-33-gdpr/). The clocks are examples; confirm with counsel. | A nervous system that still works when the body's own is infected |
| **Secure Shell** | Click any host to get a just-in-time, short-lived OpenSSH-certificate session in the browser. Passkey / Touch ID step-up, two-person approval for suspect hosts, read-only forensic mode, and every keystroke recorded and hash-chained into the incident log. | Sterile surgery |
| **Claura Voice** (ElevenLabs) | Spoken briefs in multiple languages. Push-to-talk "Ask Claura", answered by Nemotron. | The brief, out loud |
| **claura.tech + new logo** | Landing page; the C-shaped aura ring with the seal bar. | |

**Simulated in the demo (say so if asked):**
- **The attack itself**: a replay of a simulated escape on a simulated fleet.
- **The effects of containment**: no real hypervisor, NIC or BMC is touched.
- **Every number on screen**: 9.4 s, the 1 s correlation, 2,048 hosts, 18,432 VMs, 61,207 sandboxed agents, the 11.8 s mean, and INC-0418's 8.1 s.

### 5B. The vision: 12-36 months, not built

*Say "vision" out loud before any of these.*

| Horizon | Bet | Immune analogue | What it means | First proof point |
|---|---|---|---|---|
| 12 mo | **Nerve endings** | Sensing | Real signal intake: hypervisor and VMM audit, IOMMU fault logs, vGPU telemetry, host EDR, BMC/IPMI flows, workload identity | One real KVM host feeding IOMMU faults into Sentry |
| 12 mo | **Claura Membrane: the agent firewall** | Cell membrane | The same reducer gate in front of *every* agent's tool calls in the building, not only our defenders'. Identity, scope, rate and reversibility are checked before any agent acts. | Route a tenant agent's tool calls through the gate in the demo fleet |
| 12 mo | **Vaccines** | Vaccination | Continuous, safe breach drills against a digital twin. Time-to-contain and false-positive rate become measured numbers instead of illustrative ones. | Replace the illustrative 9.4 s with a measured distribution |
| 24 mo | **Skin: DPU and confidential-computing enforcement** | Self vs. non-self | Quarantine enforced on the DPU (BlueField-class), below the host OS, so a compromised host can't lift its own quarantine. Failover only to hosts that pass hardware attestation. | Cordon a lab host with DPU flow rules |
| 24 mo | **Autonomous recovery** | Healing | Reimage, re-attest, return to the pool and fail tenants back, all logged and reversible. Humans sign only the irreversible steps. | The "fail back" undo already in Warden's plan |
| 24 mo | **Attestations for insurers and regulators** | Medical record | Scribe's record, hash-chained end to end and exported as a signed evidence pack, mapped to NIST SP 800-61r3 / CSF 2.0 [NIST](https://csrc.nist.gov/pubs/sp/800/61/r3/final) and to disclosure timelines. Insurers price on measured containment. | Export INC-0419 as a signed evidence pack |
| 36 mo | **Herd immunity: cross-cloud threat sharing** | Herd immunity | Signed "antibodies" (fleet rules and behavioral signatures of agent escapes) shared between operators without sharing tenant data. One cloud's infection inoculates every subscriber. | Two Claura deployments exchanging one fleet rule |
| 36 mo | **Sovereign AI defense** | An immune system that never leaves the body | The full stack runs inside national AI factories and air-gapped clouds: on-prem Nemotron reasoning, local incident state, and an independent out-of-band plane. Telemetry never crosses a border. | Run the full demo with only the out-of-band link connected |
| 36 mo | **Standard equipment** | Being born with one | Every building gets sprinklers before anyone moves in. An AI factory should get an immune system before its first tenant arrives. | Claura in an AI-factory reference design |

**Why this becomes a company, not a feature**
- **The body is enormous.** McKinsey projects about **$6.7 trillion** of data center capex worldwide by 2030, **$5.2 trillion** of it for AI-ready facilities ([McKinsey](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers), figures as reported by [IT Brew](https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030)).
- **The infections are already AI-shaped.** In IBM's 2026 study, **one in four** malicious breaches was AI-enabled (up 56% year over year). Those breaches cost **$6 million** on average, against a **$4.99 million** global average. More than **20%** of organizations reported a breach targeting AI models or applications ([IBM](https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average)).
- **Automated defense pays.** The same study found that extensive security AI and automation cut breach costs by **almost $2 million** on average ([IBM](https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average)).
- **Wedge, then platform.** We start with guest-escape response for GPU clouds and AI factories. Next comes the agent firewall for every agent, and then the herd-immunity network, which gets more valuable with each operator that joins.

---

## 6. Why it wins each track

**Winstead PC: Cyber Incident Response Dashboard.** The organizers told teams to assume the attacker can see normal comms and that nobody has information. Claura's War Room runs outside the breach on SpacetimeDB's cloud, with break-glass identities, role channels, a plain-language brief, owners, a decision log and disclosure clocks. Every action and approval lands in one incident log with the scope stated (1 host, 11 guests), and shell keystrokes are hash-chained into it, so the documentation is written for counsel as well as engineers.
*Prove it:* War Room → #legal → the decision-log entry for the quarantine → Reports. Their brief also requires that an admin can add users; if that flow shipped, show it.

**NMC²: Keep the World Running.** NMC² asks for tools that keep data center teams one step ahead. Claura turns six scattered warnings into one incident, unclear handoffs into one live log that every console shares, and late information into one approval card at the right moment. It also keeps the world running *during* the incident: in the demo, 11 tenants fail over to clean hosts while the suspect host is sealed.
*Prove it:* the second console updating live; the containment plan with an undo on every step.

**NVIDIA: Use Nemotron Beyond a Chatbot.** Nobody chats with Claura's agents. Nemotron 3 Nano 4B, running locally through Ollama, drives four agents through multi-step tool calls (correlate, map the blast radius, contain, write the record), and every proposal lands in a policy gate instead of a chat window. Running on-prem is the point: an AI factory shouldn't have to send raw incident telemetry to an outside API in the middle of a breach.
*Prove it:* the Agents view's tool-call trace with the model tag, then Ask Claura answered by Nemotron.

**Spacetime: Build on Spacetime.** The backend is SpacetimeDB, published on Maincloud: all incident state, every agent proposal, the live incident log every console subscribes to, and the policy gate itself, as reducers that reject what policy forbids inside the transaction. The War Room's out-of-band plane is Spacetime too. Nemotron proposes; the reducer disposes.
*Prove it:* two consoles, one ⌘↵, both update; show the gate reducer for three seconds. Gate check: public repo (github.com/zero-abd/claura) plus the access code from the Spacetime booth.

**MLH prizes.** Claura Voice is built on ElevenLabs (spoken multilingual briefs and push-to-talk Ask Claura), and the product lives at claura.tech. Enter every MLH category whose technology is genuinely in the build, and none that isn't.
*Note:* Devpost returned HTTP 403 to our fetcher, so confirm the 2026 MLH category names on the Devpost prize page.

---

## 7. Demo-video voice-over (95-110 s)

**247 spoken words, 27 lines.** That runs about 102 s at a brisk narration pace and 109 s at a measured one. The first line lands in about 2 s. Every shot is real UI footage. Burn in captions.

Pronunciation: pick one way to say "Claura" and use it in the video and at the table. If ElevenLabs drifts, spell it phonetically in the script it reads.

| # | ~Time | Voice-over | Picture (real UI) |
|---|---|---|---|
| 1 | 0:00 | Your data center is infected. | Facility map, calm. One cell in Hall B pulses orange. |
| 2 | 0:02 | At 2:14 a.m., an AI agent reaches through the GPU for the host. | UI clock 02:14:07. First signal lines: VMM ioctl, vGPU mdev fault. |
| 3 | 0:08 | Eleven other tenants live there. | Host b14-gpu-07 with its 11 co-resident guests lit. |
| 4 | 0:11 | Your on-call engineer is asleep. The attacker isn't. | Operator avatars idle; the signal stream keeps filling. |
| 5 | 0:14 | The fastest breakout on record took twenty-seven seconds. | Lower third: "Fastest eCrime breakout on record: 27 s · CrowdStrike 2026 Global Threat Report" |
| 6 | 0:18 | AI agents are the new attack surface. Defense must be agentic too. | Agents view: four agent cards switch to Correlating, Scoring, Executing. |
| 7 | 0:23 | This is Claura, the immune system for AI data centers. | Logo mark, ring and seal bar. Lower third: "Simulated attack replay · demo numbers illustrative". |
| 8 | 0:27 | Detect. Sentry correlates six signals in one second. | Sentry tool calls: `correlate(vm-7f3a)` → `open_incident` → INC-0419. |
| 9 | 0:31 | Triage maps the blast radius: one host, eleven neighbors. | Attack path; `attack_graph` → 11 co-resident guests; score 0.87. |
| 10 | 0:35 | Contain. Warden goes reversible first. | `policy.check(isolate_network)` → allowed · reversible. |
| 11 | 0:37 | Network cut. Tokens revoked. Host cordoned. Guest frozen. Memory captured. | Containment plan steps 1-5 tick, each with its undo label. |
| 12 | 0:42 | Heal. Eleven neighbors restart on clean hosts. | Map: 11 guests move to clean hosts and turn green; "failover 11/11". |
| 13 | 0:45 | But an immune system without restraint attacks the body. | Policy view: the allowlist; `quarantine_host` → needs a human. |
| 14 | 0:49 | So policy, not the model, decides. The gate is a SpacetimeDB reducer, not a prompt. | 2 s of the gate reducer's code, then live incident-log rows arriving. |
| 15 | 0:55 | The irreversible step, quarantine, waits for a human. | Approval sheet slides up: "Quarantine b14-gpu-07?" |
| 16 | 0:59 | Evidence. Scope. Rollback. One card. Command-Enter. | Push in on the three facts; ⌘↵ key overlay; the button presses. |
| 17 | 1:01 | In our demo, contained in nine point four seconds. | Counter freezes at 9.4 s, green. Tag: "Illustrative demo number". |
| 18 | 1:05 | Remember. Scribe files the forensic record. Evidence hashed. | Reports: INC-0419 timeline, authorizer column, sha256 9f3c…e1a0. |
| 19 | 1:09 | Sentry pushes a fleet rule. Now every host knows this exploit. | `add_fleet_rule(ioctl=0xC0186441)` → rule live; a ripple crosses all four halls. |
| 20 | 1:14 | Email is compromised. Phones are down. | War Room out-of-band banner. |
| 21 | 1:17 | The War Room runs outside the breach: one brief for legal, execs, comms. | Channels #command, #legal, #exec, #comms-pr, #vendors; brief (know / don't know); clocks. |
| 22 | 1:22 | Need hands on the box? Click the host. | Cursor clicks b14-gpu-07; the host sheet opens; "Open secure shell". |
| 23 | 1:26 | Short-lived certificate. Touch ID. A second approver. Every keystroke on the record. | Touch ID prompt; second operator approves; read-only banner; keystrokes land in the incident log. |
| 24 | 1:31 | Ask Claura out loud. Hear the brief in your language. | Mic pressed, waveform, captioned answer; then the brief plays in Spanish. |
| 25 | 1:35 | Agents reason on NVIDIA Nemotron, on-prem. Raw telemetry stays inside. | Agents view tag `nemotron-3-nano:4b · Ollama · local` with the tool-call trace. |
| 26 | 1:40 | Attackers already have agents. Now your data center has an immune system. | Overview returns to calm; the whole map green. |
| 27 | 1:45 | Claura. Every breach makes the whole fleet immune. | End card: logo, claura.tech, github.com/zero-abd/claura, "Simulated attack; demo numbers illustrative." Hold 3 s or more. |

**Clean read** (for the narrator or ElevenLabs):

```
Your data center is infected.
At 2:14 a.m., an AI agent reaches through the GPU for the host.
Eleven other tenants live there.
Your on-call engineer is asleep. The attacker isn't.
The fastest breakout on record took twenty-seven seconds.
AI agents are the new attack surface. Defense must be agentic too.
This is Claura, the immune system for AI data centers.
Detect. Sentry correlates six signals in one second.
Triage maps the blast radius: one host, eleven neighbors.
Contain. Warden goes reversible first.
Network cut. Tokens revoked. Host cordoned. Guest frozen. Memory captured.
Heal. Eleven neighbors restart on clean hosts.
But an immune system without restraint attacks the body.
So policy, not the model, decides. The gate is a SpacetimeDB reducer, not a prompt.
The irreversible step, quarantine, waits for a human.
Evidence. Scope. Rollback. One card. Command-Enter.
In our demo, contained in nine point four seconds.
Remember. Scribe files the forensic record. Evidence hashed.
Sentry pushes a fleet rule. Now every host knows this exploit.
Email is compromised. Phones are down.
The War Room runs outside the breach: one brief for legal, execs, comms.
Need hands on the box? Click the host.
Short-lived certificate. Touch ID. A second approver. Every keystroke on the record.
Ask Claura out loud. Hear the brief in your language.
Agents reason on NVIDIA Nemotron, on-prem. Raw telemetry stays inside.
Attackers already have agents. Now your data center has an immune system.
Claura. Every breach makes the whole fleet immune.
```

---

## 8. The five hardest judge questions

**1. "What's actually real here, and what's staged?"**
These are real: the console; the SpacetimeDB module, which holds all incident state, enforces the policy gate in reducers and streams the live log to every console from Maincloud; four agents driven by Nemotron 3 Nano 4B running locally through Ollama and making multi-step tool calls; the War Room; Secure Shell; and the voice. The attack is staged. It's a replay of a simulated escape on a simulated fleet, and no real hypervisor or BMC is touched. The 9.4 seconds is a demo clock, not a benchmark, and measuring it for real is the first thing a pilot would do. *(Strike anything that didn't ship. If the table run was the scripted replay, say that here too.)*

**2. "What stops your immune system from attacking healthy hosts?"**
Tolerance, built in three ways. First, the model can only propose: a reducer checks every action against policy inside a transaction, so an off-policy action never executes. Second, reversible steps come first, and each automated step has an undo: reattach the vNIC, reissue the tokens, uncordon the host, resume the guest, fail back. Third, the one irreversible step waits for a human, with evidence, scope and rollback on one card. A false positive still has a real cost, because eleven tenants restart elsewhere, so policy can require approval for failover too. We haven't measured our false-positive rate yet. That's week one of a pilot.

**3. "Your attacker is an AI. Can't it prompt-inject your defenders through the logs they read?"**
It will try, which is why the model is never the authority. Strings the guest controls, like process names and command lines, reach the model as data fields, not instructions. A hijacked agent can only propose actions from a fixed set, scoped to this incident, and the reducer decides whether they run. It can't add a tool, widen its scope or approve itself. Nemotron proposes; the reducer disposes. Red-teaming injection through telemetry is first on our test plan.

**4. "If the attacker owns the network, why should anyone trust Claura or the War Room?"**
Because neither one depends on that network. The War Room runs out-of-band on SpacetimeDB's cloud, with break-glass identities issued before the incident, so it needs no corporate email, SSO or phones. Containment goes over a trusted management path, and Warden cuts the suspect host's own BMC off that path. Shell access is just-in-time: short-lived certificates, passkey step-up, two people for a suspect host, and every keystroke hash-chained. The vision step is to enforce quarantine in the DPU, below the host OS, so a compromised host can't lift its own quarantine.

**5. "Isn't this SOAR plus an LLM? Why won't CrowdStrike or a hyperscaler just build it?"**
SOAR runs the playbook you picked. Claura's agents work out which response fits this host and at what scope, and then deterministic policy executes it. EDR and cloud-security tools are the senses and Claura is the reflex; host EDR is one of Sentry's six signals. The biggest clouds can staff this kind of response in-house. The fast-growing GPU clouds, enterprise AI factories and sovereign builds mostly can't, and that's our wedge. The agent firewall is the platform.

**If there's time, three backups:**
- **"Is a vGPU-path escape real?"** Yes. NVIDIA's CVE-2026-47498 (30 Sep 2026) lets a guest VM user corrupt host-side vGPU Manager memory with a crafted RPC message **[R4]**. Broadcom said its VMSA-2025-0004 ESXi flaws allow VM escape, and that it had information suggesting exploitation in the wild ([Broadcom FAQ](https://github.com/vmware/vcf-security-and-compliance-guidelines/blob/main/security-advisories/vmsa-2025-0004/README.md)). Wiz's NVIDIAScape (CVE-2025-23266, CVSS 9.0) let a three-line Dockerfile take root on the GPU host ([Wiz](https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape)), and Wiz said it affected 37% of cloud environments ([The Hacker News](https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html)).
- **"Why a 4B model?"** It runs on-prem on modest hardware (about 3 GB, 256K context, tool calling, per [Ollama](https://ollama.com/library/nemotron-3-nano)), so telemetry stays local and the loop stays fast. The safety burden sits on policy, not on model size. The same interface scales up to the 30B variant when there's hardware for it.
- **"Who pays?"** GPU clouds and AI-factory operators, priced per protected host. Insurers and auditors use the attestations. IBM's 2026 study found that extensive security AI and automation cut average breach costs by almost $2 million ([IBM](https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average)).

---

## Sources

All checked on 8 Nov 2026. These are the only real-world statistics this package uses.

| Ref | What it supports | URL |
|---|---|---|
| R1 | AI performed 80-90% of a state-sponsored espionage campaign against about 30 targets, with thousands of requests, often several per second (13 Nov 2025) | https://www.anthropic.com/news/disrupting-AI-espionage |
| R2 | 2025 average eCrime breakout 29 min; fastest on record 27 s; attacks by AI-enabled adversaries up 89% (CrowdStrike 2026 Global Threat Report) | https://www.crowdstrike.com/en-us/global-threat-report/ |
| R3 | 88% of ransomware payloads deployed outside business hours; 79% of exfiltration off-hours; 661 IR/MDR cases, Nov 2024 to Oct 2025 (Sophos Active Adversary Report 2026) | https://www.sophos.com/en-us/press/press-releases/sophos-active-adversary-report-2026-identity-attacks-dominate-as-threat-groups-proliferate |
| R4 | CVE-2026-47498, NVIDIA vGPU Manager GSP plugin: a guest VM user can cause an out-of-bounds write via a crafted RPC message; might lead to code execution; CVSS 3.1 7.8; published 30 Sep 2026 | https://nvd.nist.gov/vuln/detail/CVE-2026-47498 and https://github.com/NVIDIA/product-security/tree/main/2026/5861 |
| Market | McKinsey: about $6.7T of data center capex by 2030, $5.2T of it for AI (April 2025). The McKinsey page timed out for our fetcher; figures confirmed through IT Brew's report on it. | https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers and https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030 |
| Market | IBM Cost of a Data Breach 2026 (29 Jul 2026): $4.99M global average; one in four malicious breaches AI-enabled (+56%), averaging $6M; more than 20% of organizations report a breach targeting AI models or apps; security AI and automation cut costs by almost $2M | https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average |
| Clock | SEC Form 8-K Item 1.05: generally due four business days after a registrant determines an incident is material (adopted 26 Jul 2023) | https://www.sec.gov/newsroom/press-releases/2023-139 |
| Clock | GDPR Art. 33: notify the supervisory authority without undue delay and, where feasible, within 72 hours of becoming aware | https://gdpr-info.eu/art-33-gdpr/ |
| Standard | NIST SP 800-61 Rev. 3, Incident Response Recommendations (CSF 2.0 Community Profile), April 2025 | https://csrc.nist.gov/pubs/sp/800/61/r3/final |
| Q&A | Broadcom VMSA-2025-0004 FAQ: VM escape, exploited in the wild | https://github.com/vmware/vcf-security-and-compliance-guidelines/blob/main/security-advisories/vmsa-2025-0004/README.md |
| Q&A | Wiz NVIDIAScape CVE-2025-23266: CVSS 9.0, three-line Dockerfile, root on host (17 Jul 2025); 37% of cloud environments per Wiz, as reported by The Hacker News | https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape and https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html |
| Q&A | Ollama `nemotron-3-nano`: 4b tag about 3 GB, 256K context, tools capability; 30b tag 1M context | https://ollama.com/library/nemotron-3-nano |
| Tracks | HackUTD 2026 challenge texts (Winstead, NMC², NVIDIA, Spacetime) | https://zeroday.hackutd.co/ |

**Demo numbers (illustrative, never cite as measurements):** contained in 9.4 s; six signals correlated in 1 s; 2,048 hosts; 18,432 VMs; 61,207 sandboxed agents; 11.8 s mean time to contain; INC-0418 at 8.1 s; Triage score 0.87; 64 GiB memory capture.
