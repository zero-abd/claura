# Claura: Agents vs. Agents

Pitch package, draft for HackUTD 2026 (deadline 12:00 pm CST, judging 1:00 to 4:00 pm). Angle: attackers now run on agents, so AI data centers need defender agents that move at machine speed, fenced by policy, with a human on the one irreversible call.

How to read it: `[F#]` marks point to **Sources** at the end and are never spoken. Demo numbers (2,048 hosts, 61,207 sandboxes, 9.4 s, 0.87) are illustrative and are always said as "in our demo". Lines marked **TRUTH** depend on a feature shipping. Run the **Truth check** at the bottom before 1:00 pm and cut anything that isn't true yet.

---

## 1. Title, logline, taglines

**Title:** Claura: Agents vs. Agents

**Logline:** Attackers now run on AI agents; Claura gives AI data centers machine-speed defender agents, bound by policy, with a human on the one call that can't be undone.

**Tagline options (7 words each)**

1. **Their agents move fast. Ours move first.** (Recommended. It carries the whole angle in one breath, and the film ends on it.)
2. Agents fight agents. Humans hold the key.
3. Machine-speed defense. One human on the trigger.

The product tagline, "Seal the breach before it spreads," stays on claura.tech. These three are for this pitch angle.

---

## 2. Elevator pitches

### 15 seconds (39 words)

> AI data centers now run agents holding real credentials. When one turns hostile, it attacks at machine speed. Claura's defender agents are built to contain it in seconds. Policy bounds every move. A human makes the one irreversible call.

### 30 seconds (about 85 words, brisk)

> Last year, an AI performed 80 to 90 percent of a state-sponsored espionage campaign, firing thousands of requests, often more than one a second.[F1] Aim that at an AI data center full of agents holding credentials, and people lose the race: the fastest breakout CrowdStrike observed took 27 seconds.[F2] Claura fights machine speed with machine speed. Four defender agents detect, scope and contain. Policy, not the model, decides what they may do. One human makes the irreversible call. Their agents move fast. Ours move first.

---

## 3. The 2-minute judge-table pitch

### Setup (before the judge walks up)

- Live mode running: SpacetimeDB module published, agent runner connected, console on **Overview**, campus calm.
- Warm the model so the first tool call is fast. Ollama unloads an idle model after 5 minutes by default, so run `ollama run nemotron-3-nano:4b "ok"` between judges, or start the Ollama server with `OLLAMA_KEEP_ALIVE=-1`.
- Second browser window on the **War Room** if you can, so the judge sees two consoles move on one live log.
- Microphone permission already granted, volume up, laptop mic facing you. Science-fair tables are loud.
- Film queued on a phone as the fallback. One person talks, one person drives.

### Script (about 290 spoken words, 2:00)

**0:00 Hook**
`[DEMO: Overview on screen, campus calm. Hands off the trackpad.]`

> Who's watching your AI agents at 2 a.m.?
>
> Data centers now run agents with tools and real credentials, and attackers run agents too. Last year an AI performed 80 to 90 percent of a state-sponsored espionage campaign, often more than one request a second.[F1] The fastest breakout CrowdStrike has seen took 27 seconds.[F2] Your on-call engineer is still unlocking a phone.

**0:22 Reveal**

> This is Claura: machine-speed defenders for AI data centers, with a human on the one call you can't take back.

**0:30 Overview**
`[DEMO: Overview. Circle Hall B on the facility map with the cursor.]`

> Our demo campus: two thousand GPU hosts, sixty-one thousand agent sandboxes. The attack is simulated. The defense is real.

**0:38 Incident replay**
`[DEMO: Incident, then start the replay. Point at each agent line as it posts.]`

> An agent in vm-7f3a goes for the host through the vGPU. Sentry fuses six weak signals into one incident. Triage maps the blast radius: one host, eleven neighbors. Warden contains it, reversible steps first: network cut, tokens revoked, memory captured, neighbors moved to clean hosts.
>
> That's NVIDIA Nemotron on this laptop, calling tools, and every move it proposes hits a policy gate inside a SpacetimeDB reducer. Policy, not the model, decides.

**TRUTH:** say "on this laptop" and "reducer" only if this run is live. If you are showing the scripted replay, say instead: "This is the recorded run. Here's the same thing live," and flash the **Agents** view with the real tool-call trace.

**1:05 Approval sheet**
`[DEMO: The approval sheet rises. Touch Evidence, Scope, Rollback in turn. Press Cmd+Enter.]`

> Quarantining the host can't be undone, so the database won't take that order from an agent. Evidence, scope, rollback: one card.
>
> `[Cmd+Enter]` Approved. Contained: 9.4 seconds in our demo.

**1:18 War Room**
`[DEMO: War Room, #command. Then tap #legal, then #exec.]`

> Now assume the attacker reads your email. The War Room runs off the compromised network, on break-glass identities. Legal watches the notification clocks. The CEO gets a plain-English brief.

**1:30 Click a host, Secure Shell**
`[DEMO: Overview, click b14-gpu-07, choose Open secure shell, touch Touch ID.]`

> Need hands on the box? One click mints a short-lived SSH certificate: Touch ID, a second approver for a suspect host, and every keystroke hash-chained into the record.

**1:42 Ask Claura**
`[DEMO: Hold the mic button in the top bar and ask. Let Claura answer out loud. Don't talk over it.]`

> Claura, are any customers affected?

**1:50 Close**

> Today, one breach class, end to end. Next, an agent firewall on every tool call, and an immune system shared across clouds. Their agents move fast. Ours move first.

If a sponsor judge is at the table, swap the "Next" sentence for that track's line in section 6. If live mode breaks mid-pitch, switch to the scripted replay and say "recorded run". Never let a judge discover it on their own.

---

## 4. The problem: a machine-speed breach meets a human-speed response

### Why now

Three facts and one forecast, all on the record.

1. **Attackers already run on agents.** In mid-September 2025, Anthropic caught a state-sponsored group using its coding agent against roughly thirty targets. The AI performed 80 to 90 percent of the campaign, firing thousands of requests, often more than one a second, a pace no human team could keep up with. [F1]
2. **Breakouts are measured in seconds.** CrowdStrike's 2026 Global Threat Report puts the average eCrime breakout time (from first access to moving laterally) at 29 minutes for 2025, and the fastest it observed at 27 seconds. [F2] A pager, a VPN login and a runbook take longer than that.
3. **The walls around GPU workloads are thin.** In 2025, Wiz showed that a three-line Dockerfile could let a malicious container break isolation and take full root on the host through the NVIDIA Container Toolkit (CVE-2025-23266, CVSS 9.0). Wiz rated the risk highest in managed AI clouds, where customers run their own containers on shared GPUs. [F3] Our demo uses the VM-and-vGPU form of the same failure.
4. **It's heading for the mainstream.** Gartner predicts that by 2028 a quarter of enterprise breaches will trace back to AI agents being abused, by outside attackers and by malicious insiders. [F4]

### Who bleeds

- **The operator.** One compromised host can turn into a campus-wide incident: lost capacity, SLA credits, and tenants who don't come back.
- **The eleven neighbors.** They did nothing wrong. Their models, weights and customer data share silicon with the attacker.
- **The people with no information.** Legal has a disclosure clock running, the CEO has a board asking, PR has reporters calling. In Winstead's scenario, ransomware has locked data, phones are down, email is sporadic, and the attacker may be reading the normal channels.
- **Everyone downstream.** AI is infrastructure now. When a GPU cloud goes dark, the products and businesses built on it go dark with it.

### 2:07 a.m. (the scenario we demo)

A coding agent in tenant VM vm-7f3a starts probing the vGPU driver on host b14-gpu-07, Hall B, rack 14, DFW-2. A vGPU driver fault. An IOMMU fault. A VMM audit event. qemu spawns a shell on the host. A flow to the IPMI port. A workload token used outside its scope. Six signals scattered across different tools, and no single alert says "escape".

The pager goes off. The on-call engineer finds a laptop, joins a VPN the attacker may be watching, opens a runbook written for last year's attacks, and starts working out which eleven tenants share that host. Every step is human speed. The attacker isn't.

### The gap Claura closes

The fix isn't a faster human. It's a defender that moves at the attacker's speed and is fenced so it can never become the next incident: **agents propose, policy decides, and a human owns the one irreversible call.**

---

## 5. What Claura does

### BUILT TODAY: what a judge can touch at our table

Every row below is on the Truth check. Drop any row that didn't ship.

| Piece | What it does | Built on |
|---|---|---|
| **Operator console** | Liquid-Glass UI with progressive disclosure: calm when the campus is nominal, one card when it needs you. Views: Overview, Incident, War Room, Shells, Agents, Policy, Reports. | TypeScript, Vite |
| **Four defender agents** | **Sentry** correlates IOMMU faults, VMM audit logs, host EDR, IPMI flows and token misuse into one incident. **Triage** builds the attack graph and blast radius (in our demo: 1 suspect host, 11 co-resident guests, management plane reachable). **Warden** contains, reversible steps first: detach the vNIC, revoke credentials, cordon the host, pause the guest, capture memory over a trusted management path, fail the 11 guests over to clean hosts. It never live-migrates off a suspect host, because that would copy guest memory through a hypervisor we no longer trust. **Scribe** writes the forensic timeline and a plain-language brief. | NVIDIA Nemotron 3 Nano 4B (`nemotron-3-nano:4b`, 2.9 GB, tool calling) running locally through Ollama, driving multi-step tool calls |
| **Policy gate and incident state** | Every signal, proposal, action and approval is a row. Reducers check each proposal against policy: reversible actions run, the irreversible one waits for a human identity, anything off the list never executes. Every console subscribes to one live incident log. | SpacetimeDB module, published to Maincloud |
| **The one human decision** | Quarantining the host is the only step Warden cannot take. Evidence, scope and rollback sit on one card; Cmd+Enter approves. In our demo the incident is contained in 9.4 s, an illustrative number that assumes an instant approval. | Console plus approval reducer |
| **War Room** | Out-of-band stakeholder coordination for when the attacker can see normal comms. It runs off the compromised network on SpacetimeDB's cloud. Break-glass identities issued before the incident. Channels: #command, #legal, #exec, #comms-pr, #vendors. Scribe's brief (what we know, what we don't yet), tasks with owners, a decision log, and example notification clocks: a Form 8-K under Item 1.05 is generally due four business days after a company decides an incident is material [F10], and GDPR Article 33 asks for notice within 72 hours where feasible [F11]. Clocks are examples; counsel confirms which apply. | SpacetimeDB Maincloud |
| **Secure Shell** | Click any host and get a just-in-time, short-lived OpenSSH-certificate session in the browser: passkey or Touch ID step-up, two-person approval for a suspect host, read-only forensic mode, and every keystroke recorded and hash-chained into the incident log. | OpenSSH certificates, WebAuthn |
| **Claura Voice** | Spoken briefs in several languages, and push-to-talk "Ask Claura": Nemotron answers, ElevenLabs speaks. | ElevenLabs, Nemotron |
| **Brand** | claura.tech landing page; a new mark (an open C-shaped ring whose seal bar closes the gap and turns green when the breach is contained). | |

**The line we never blur: the attack is simulated, the defense is real.** Simulated: the telemetry and the attacker (a simulator writes the signals), the campus (2,048 hosts, 61,207 agent sandboxes), the War Room's people, and the 9.4 s. Real: the software that responds.

### THE VISION: 12 to 36 months (not built; this is where the company goes)

Claura today handles one incident class end to end. The company is the **immune system for AI infrastructure**: every agent action checked, every breach contained at machine speed, every containment provable.

**Why this is a company, not a feature**

- **The concrete is being poured.** McKinsey estimates data centers need about $6.7 trillion of capital spending by 2030 to keep up with compute demand, $5.2 trillion of it for AI. [F8]
- **The tenants are agents.** A Microsoft-sponsored IDC forecast projects 1.3 billion AI agents by 2028 [F6], and machine identities already outnumber human ones by more than 80 to 1 [F7]. Every one of them holds a credential someone can steal or abuse.
- **The buyers are already asking.** Gartner expects 40% of CIOs to demand "guardian agents" by 2028: agents that watch over other AI agents and contain them when needed. [F4] That is the category Claura is building for AI infrastructure.

**What we build next**

1. **Agent firewall.** Every tool call an AI agent makes inside your data center passes a Claura policy gate first: scoped, time-boxed credentials per task, a kill switch per agent, and the same propose, policy, human loop we demo today, moved from incident response into everyday operations.
2. **Sparring partner.** Claura runs its own attacker agents against your fleet every night, inside policy you set, so the defenders rehearse tomorrow's attacks on a schedule instead of meeting them for the first time at 2 a.m.
3. **Containment enforced in hardware.** Isolation pushed below the host OS into DPUs such as NVIDIA BlueField, so a compromised hypervisor can't undo it, and GPU confidential-computing attestation to prove a host is clean before tenants fail over onto it.
4. **Autonomous recovery.** Reimage the quarantined host, re-attest it, return it to the pool and bring the tenants home, with a human signing only the steps that can't be undone.
5. **Cross-cloud immune system.** When one operator contains a new attack, a signed, anonymized fingerprint reaches every Claura-protected fleet in seconds. Each contained attack protects every customer, which is the network effect.
6. **Proof of containment.** The hash-chained incident record becomes an attestation that insurers, auditors and regulators accept: what happened, who approved what, under which policy, and how fast. Cyber cover priced on proven containment time, and disclosure drafts ready for counsel.
7. **Sovereign AI defense.** For national and regulated AI clouds whose telemetry can't leave the country: on-prem Nemotron, a self-hosted War Room, sovereign policy packs.

**Roadmap**

| Horizon | What ships | What it proves |
|---|---|---|
| **Today** (HackUTD, 8 Nov 2026) | One incident class end to end: agents, policy gate, human approval, War Room, Secure Shell, voice | The loop works: agents propose, policy decides, a human owns the irreversible step |
| **0 to 12 months** | Real signal connectors (hypervisor audit, IOMMU, EDR, BMC and IPMI, workload identity); measured time-to-contain and false-positive rate; a red team of prompt injection through telemetry; policy packs for guest escape, token theft, model-weight exfiltration and rogue agents; self-hosted War Room; first design partners (goal) | From demo to evidence |
| **12 to 24 months** | Agent firewall; DPU enforcement and attestation; autonomous recovery; nightly sparring | Autonomy safe enough to insure |
| **24 to 36 months** | Cross-cloud immune system; proof-of-containment attestations; sovereign deployments | Every contained attack makes the network stronger |

**Business model (hypothesis):** priced per protected GPU host, plus War Room seats for legal and executives, plus attestation reports for insurers and auditors. Land with GPU clouds and colocation operators, where one host carries many tenants; expand to hyperscale and sovereign AI.

**The end state:** every AI hall is built with fire suppression. Within three years, we want every AI hall built with Claura.

---

## 6. Why it wins each track

**Track cap.** The official site says teams may enter up to three company challenges [F13]. Winstead, NMC², NVIDIA and Spacetime make four, so pick three on Devpost. MLH prizes are listed separately by MLH [F14]; confirm at the MLH table that they don't count toward the cap.

- **Winstead PC, Cyber Incident Response Dashboard.** Winstead's brief assumes the attacker can see normal comms and that nobody has information. Claura's War Room runs off the compromised network on break-glass identities, gives legal, executives, PR and vendors one shared picture (Scribe's brief, what we know and don't, tasks, a decision log, notification clocks), and records who authorized every action, with shell sessions hash-chained: documentation a lawyer can stand behind.
- **NMC², Keep the World Running.** NMC² named missed warnings, unclear handoffs and the wrong information at the wrong time: Sentry turns six weak signals into one warning, one live incident log replaces the handoff, and one approval card puts evidence, scope and rollback in front of the right person at the right second. It keeps the world running in the literal sense, moving eleven tenants to clean hosts before the bad host is pulled, in an industry where one in five Uptime Institute survey respondents report outage costs above $1 million. [F9]
- **NVIDIA, Use Nemotron Beyond a Chatbot.** Nemotron 3 Nano 4B runs locally through Ollama and drives multi-step, tool-calling agents that look up co-resident guests, check token scope and propose containment, and every proposal goes through a SpacetimeDB reducer before anything executes: it plans and acts instead of chatting. It is small on purpose: it runs on this laptop today, so in production it can run on an edge box inside the hall, and incident telemetry never leaves the building, even with the network compromised.
- **Spacetime, Build on Spacetime.** The backend is a SpacetimeDB module: incident state lives in tables, the policy gate lives in reducers, every console and the War Room subscribe to one live incident log, and it is published to Maincloud from a public repo (github.com/zero-abd/claura). The database is the referee, so an action the policy refuses never runs.
- **MLH, Best Use of ElevenLabs.** Claura Voice speaks the incident brief in the listener's language and answers push-to-talk questions with Nemotron's reasoning, so a CEO on a phone bridge hears the same facts as the incident commander.
- **MLH, the others: enter only what shipped.** The MLH page for HackUTD also lists Gemini API, Solana, Vultr, DigitalOcean and a GoDaddy Registry domain prize [F14]; honest fits, if built, are Gemini drafting #comms-pr holding statements from Scribe's already-sanitized brief, a real Vultr or DigitalOcean VM as the Secure Shell target host, and Solana anchoring the head of the incident log's hash chain as tamper-evident proof of containment. Skip the domain prize unless you register a GoDaddy Registry name: .tech is run by Radix, not GoDaddy Registry [F15], so claura.tech likely doesn't qualify (ask MLH).

---

## 7. Demo-video voice-over (about 250 words, 100 to 108 s)

One idea per line. Footage is real console capture unless marked. Burn in captions. Keep "Simulated attack. Real defense." on screen for the first UI shot, and "Illustrative demo number" beside the 9.4 s counter.

| # | Voice-over | On screen |
|---|---|---|
| 1 | Your next attacker is an AI agent. | Black, then the Overview map; one cell in Hall B pulses orange. |
| 2 | Last year, an AI performed 80 to 90 percent of a state-sponsored espionage campaign. | Lower-third: "Anthropic, Nov 2025" [F1] |
| 3 | Thousands of requests. Often more than one a second. | Signal stream scrolling fast. |
| 4 | Now aim that at an AI data center full of agents with real credentials. | Overview pulls back to the full campus. Lower-third: "Demo campus". |
| 5 | One reaches for the host through the GPU. | Hall B, rack 14: vm-7f3a lights, then b14-gpu-07. |
| 6 | It's 2 a.m. The on-call engineer is asleep. | Incident banner INC-0419, critical. |
| 7 | The fastest breakout CrowdStrike has seen took 27 seconds. | Lower-third: "CrowdStrike 2026 Global Threat Report" [F2] |
| 8 | So we built defenders that move at machine speed. | Cut to the Incident view; agent lines light up in sequence. |
| 9 | This is Claura. | The mark: ring, then the seal bar. |
| 10 | Sentry fuses six weak signals into one incident. | Six signal rows collapse into INC-0419. |
| 11 | Triage maps the blast radius: one host, eleven neighbors. | Attack path; eleven guests highlighted. |
| 12 | Warden contains it, reversible steps first. | Containment plan, steps ticking. |
| 13 | Cut the network. Revoke the tokens. Capture memory. Move the neighbors. | Steps 1 to 6 check off; guests slide to clean hosts on the map. |
| 14 | The agents reason with NVIDIA Nemotron, running on-prem. | Agents view: `nemotron-3-nano:4b` tag and the real tool-call trace. |
| 15 | Every move they propose hits a policy gate in SpacetimeDB. | Policy view: a proposal row, "allowed: reversible", next one "needs human". |
| 16 | Policy, not the model, decides. | Hold on "needs human". |
| 17 | One step can't be undone, so a human takes it. | The approval sheet rises. |
| 18 | Evidence. Scope. Rollback. One card. Command-Enter. | Close on the sheet; a Cmd+Enter key-press overlay. |
| 19 | Contained. In our demo, 9.4 seconds. | Counter freezes at 9.4 s, seal bar turns green, "Illustrative demo number". |
| 20 | But what if the attacker can read your email? | War Room banner: out-of-band, not on the corporate network. |
| 21 | The War Room runs off the compromised network, with break-glass identities. | #command: "6 of 6 identities verified". |
| 22 | Legal sees the clock. The CEO gets a plain-English brief. | #legal clocks, then #exec brief. |
| 23 | Need hands on a host? One click. | Overview, click b14-gpu-07, Open secure shell. |
| 24 | Short-lived certificate. Touch ID. A second approver. Every keystroke on the record. | Shell: certificate expiry, Touch ID prompt, approver, keystroke log with hashes. |
| 25 | Or just ask. | Mic button pressed. |
| 26 | (Operator, on the mic) "Claura, are any customers affected?" | Waveform. |
| 27 | (Claura Voice) "Nothing shows customer data was read. All eleven guests are on clean hosts." | Captions under the answer. Use the real recorded answer; keep it under 15 words. |
| 28 | Next: an agent firewall on every tool call, and immunity shared across clouds. | Labelled "Vision": many campuses linked by thin lines. |
| 29 | Claura. | The mark, seal bar green. |
| 30 | Their agents move fast. Ours move first. | End card: claura.tech, github.com/zero-abd/claura, "Simulated attack. Real defense." Hold 3 s. |

Line 1 lands in about 2.3 s. If the edit runs long, cut line 6 first, then line 25.

---

## 8. The five hardest judge questions

**1. "How much of this is real?"**
The attack is simulated; the defense is real. A simulator writes the telemetry for a campus that doesn't exist, the War Room's people are personas, and 9.4 seconds is our demo number with an instant approval. Everything that responds is running code: Nemotron 3 Nano on this laptop making tool calls, the SpacetimeDB module that holds every incident row and the policy gate, the War Room on Maincloud, the certificate shell, and the ElevenLabs voice. The repo is public and the README marks which part is which.

**2. "You gave an LLM the keys to a data center. What happens when it's wrong, or when the attacker prompt-injects it through the logs?"**
It never gets the keys. The model can only propose actions from a fixed list, and a SpacetimeDB reducer checks every proposal against policy inside a transaction, so anything off the list never executes. On its own it may take only reversible steps (detach a vNIC, revoke a token, cordon a host), each with a one-step undo. The irreversible step needs a human operator's identity, checked in the database, not in the UI. Log text the attacker controls reaches the model as data fields, never as instructions. We haven't red-teamed injection through telemetry yet; it's the first item on the roadmap.

**3. "If the attacker owns your network, why should I trust your War Room?"**
Because it shares neither the attacker's network nor the company's identity system. It runs on SpacetimeDB's cloud, reachable over a path that never touches the corporate network (cellular, for example), and people sign in with break-glass identities issued before the incident, so a compromised SSO or mail server can't lock them out or read along. Only summaries, decisions and messages cross into it; raw telemetry stays on-prem with Nemotron. The limits, said out loud: Maincloud is a third party, and nobody has pen-tested us yet. The roadmap answer is a self-hosted War Room for regulated and sovereign customers.

**4. "'Agents vs. agents' sounds like hype. Is anyone actually attacking at machine speed? And why won't CrowdStrike, Wiz or Microsoft just build this?"**
It's already on the record: Anthropic disrupted a campaign in which AI did 80 to 90 percent of the work [F1], CrowdStrike counted 89% more operations by AI-enabled adversaries in 2025 [F2], and IBM's 2026 breach report found one in four malicious breaches were AI-enabled [F5]. The incumbents detect, and we consume their signals; Microsoft's Agent 365 governs enterprise agents [F6]. Claura is the response layer for whoever operates a multi-tenant GPU host: the containment order, the out-of-band War Room, and a policy gate that makes autonomy safe to switch on. Gartner expects 40% of CIOs to demand guardian agents by 2028 [F4]; we intend to be that agent for AI infrastructure.

**5. "What does a false positive cost? You just evacuated eleven tenants."**
That's the most expensive thing we automate, so we say it first: failing over eleven guests restarts eleven workloads. We bound it three ways: a confidence threshold before the plan runs (0.87 in our demo data), per-tenant policy that can require a human before failover, and reversible steps first, so a wrong call costs a restart, not data. The quarantine itself is undoable: un-quarantine returns the host to the pool. We have not measured false-positive rates on real telemetry, and that's the first number we owe a design partner.

---

## Sources

Every statistic above traces to one of these. Checked 8 Nov 2026.

- **[F1]** Anthropic, "Disrupting the first reported AI-orchestrated cyber espionage campaign," 13 Nov 2025. AI performed 80 to 90% of the campaign; thousands of requests, often more than one per second; roughly thirty targets; detected mid-September 2025. https://www.anthropic.com/news/disrupting-AI-espionage
- **[F2]** CrowdStrike, 2026 Global Threat Report press release, 24 Feb 2026. Average eCrime breakout time 29 minutes in 2025; fastest observed 27 seconds; AI-enabled adversaries increased operations 89% year over year. https://www.crowdstrike.com/en-us/press-releases/2026-crowdstrike-global-threat-report/
- **[F3]** Wiz Research, "NVIDIAScape" (CVE-2025-23266), 17 Jul 2025. CVSS 9.0; a three-line Dockerfile; container breaks isolation to full root on the host; risk most acute for managed AI clouds running customer containers on shared GPU infrastructure. https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape
- **[F4]** Gartner, "Gartner Unveils Top Predictions for IT Organizations and Users in 2025 and Beyond," 22 Oct 2024. By 2028, a quarter of enterprise breaches will trace back to AI agent abuse by outsiders or malicious insiders; by 2028, 40% of CIOs will demand Guardian Agents that autonomously monitor and contain what AI agents do. https://www.gartner.com/en/newsroom/press-releases/2024-10-22-gartner-unveils-top-predictions-for-it-organizations-and-users-in-2025-and-beyond (gartner.com blocked our fetcher; the wording was checked against the republished release at https://cxotoday.com/press-release/gartner-unveils-top-predictions-for-it-organizations-and-users-in-2025-and-beyond/)
- **[F5]** IBM, Cost of a Data Breach Report 2026, released 29 Jul 2026. One in four malicious breaches were AI-enabled, up 56% year over year, costing about $6M on average against a $4.99M global average (a record); more than half of organizations report using agents for threat detection and containment; 602 organizations, breaches from March 2025 to February 2026. Report: https://www.ibm.com/reports/data-breach . Press release text: https://www.aap.com.au/aapreleases/cision20260729ae14248/
- **[F6]** Microsoft, "Microsoft Agent 365: The control plane for AI agents," 18 Nov 2025, citing an IDC Info Snapshot sponsored by Microsoft, "1.3 Billion AI Agents by 2028" (May 2025). It is a vendor-sponsored forecast, so say so if asked. https://www.microsoft.com/en-us/copilot/blog/2025/11/18/microsoft-agent-365-the-control-plane-for-ai-agents/
- **[F7]** CyberArk, 2025 Identity Security Landscape, 23 Apr 2025. Machine identities outnumber humans by more than 80 to 1 (82 to 1 in coverage); Vanson Bourne survey of 2,600 security decision-makers. https://www.businesswire.com/news/home/20250423817886/en/Machine-Identities-Outnumber-Humans-by-More-Than-80-to-1-New-Report-Exposes-the-Exponential-Threats-of-Fragmented-Identity-Security (confirmed through several reprints; Business Wire blocks some fetchers)
- **[F8]** McKinsey, "The cost of compute: A $7 trillion race to scale data centers," Apr 2025. About $6.7 trillion of data center capex needed worldwide by 2030; $5.2 trillion of it for AI. https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers (McKinsey timed out for our fetcher; figures confirmed at https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030)
- **[F9]** Uptime Institute, Annual Outage Analysis 2026, 13 May 2026. For the second year running, one in five respondents reported outage costs above $1 million; in Uptime's 2025 annual survey, 57% said their most recent major outage cost more than $100,000. https://www.businesswire.com/news/home/20260513289344/en/Uptime-Announces-Annual-Outage-Analysis-Report-2026 (text checked at https://itweb.africa/article/uptime-announces-annual-outage-analysis-report-2026/WnxpEv4Y6837V8XL)
- **[F10]** U.S. SEC, press release 2023-139, 26 Jul 2023. An Item 1.05 Form 8-K is generally due four business days after a registrant determines a cybersecurity incident is material. https://www.sec.gov/newsroom/press-releases/2023-139
- **[F11]** GDPR Article 33(1): notify the supervisory authority without undue delay and, where feasible, within 72 hours of becoming aware of a personal data breach. https://gdpr-info.eu/art-33-gdpr/
- **[F12]** For the "is a vGPU-path escape real?" follow-up: CVE-2021-3546, an out-of-bounds write in QEMU's vhost-user-gpu device that could let a privileged guest user crash QEMU on the host or potentially run code with QEMU's privileges. https://nvd.nist.gov/vuln/detail/CVE-2021-3546
- **[F13]** HackUTD 2026 official site: up to three company challenge tracks per team; challenge texts; judging 1:00 to 4:00 pm; submissions due noon. https://zeroday.hackutd.co/
- **[F14]** MLH, "Prizes at HackUTD": Best Use of Gemini API, ElevenLabs, Solana, Vultr, DigitalOcean, and Best Domain Name from GoDaddy Registry. The page shows no event dates, so confirm at the MLH table. https://www.mlh.com/events/hackutd-ae/prizes
- **[F15]** ICANN registry agreement for .tech: registry operator Radix Technologies Inc. https://www.icann.org/en/registry-agreements/details/tech
- **Local check:** `ollama list` on the demo laptop shows `nemotron-3-nano:4b` (2.9 GB), and the Ollama API reports completion, tools and thinking capabilities. Checked about 02:10 CST, 8 Nov 2026.

---

## Truth check before 1:00 pm

Say a line only if its box is ticked. Otherwise use the fallback or cut the line.

- [ ] **Policy gate in SpacetimeDB reducers, module published to Maincloud.** When this draft was written (about 02:10 CST), `backend/spacetime/spacetimedb/src/index.ts` was still the SpacetimeDB starter template (a `person` table and `sayHello`). Fallback: "the policy gate is designed as a SpacetimeDB reducer," and leave the Spacetime track off Devpost.
- [ ] **Approval accepts only a human operator's identity** (used in Q2). Fallback: "the approval is recorded with the approver's identity."
- [ ] **Nemotron drives this run live** (2-minute pitch at 0:38, VO line 14). Fallback: "recorded run," then show the live tool-call trace. Use the real tool names from `backend/agents` when a judge asks.
- [ ] **One live log across consoles.** A second browser window updates during the run. Show it to the Spacetime judge.
- [ ] **War Room reads Maincloud.** Today its content comes from `apps/dashboard/src/warroom-data.ts`, static data whose own comment says live rows replace it later. Fallback: "the War Room is designed to run on Maincloud; this view uses demo data."
- [ ] **Winstead's required components:** isolated system, admin can add users, documentation to standards with real-time status, scope of compromised data, real-time comms. "Admin adds users" has no line in this pitch yet. If it shipped, show it to the Winstead judge.
- [ ] **Secure Shell is a real OpenSSH session** with a CA-signed short-lived certificate. Until the terminal module registers `window.claura.openShell`, clicking Open secure shell shows "Secure shell module not loaded" (`apps/dashboard/src/main.ts`, around line 412). If the host behind it is simulated, say "real certificate flow, simulated host."
- [ ] **Touch ID or passkey step-up and two-person approval** are wired.
- [ ] **Keystrokes are hash-chained** (each row stores the previous row's hash).
- [ ] **Ask Claura is live:** Nemotron answers, ElevenLabs speaks, the ElevenLabs key stays server-side (the repo is public), and you can demo a second language before you say "multilingual".
- [ ] **UI labels match reality.** The sidebar footer shows "NVIDIA Nemotron · on-prem" and "SpacetimeDB · live sync" (`apps/dashboard/src/shell.ts`, line 43), and the toolbar shows "synced · SpacetimeDB" (line 56). They must be true in the mode you demo, or relabel them.
- [ ] **Demo numbers are labelled:** 9.4 s ("in our demo"), 2,048 hosts and 61,207 sandboxes ("demo campus"), 0.87 ("demo data").
- [ ] **Three company tracks on Devpost, not four.**
