# Claura: When the Network Is the Crime Scene

Pitch package for HackUTD 2026 (Zero Day). Angle: out-of-band command, human-centred, Winstead-first.
Draft written Sunday 8 Nov 2026, 02:30 CST. Every statistic is cited and was checked that night. Every demo number (9.4 s, 2,048 hosts, 61,207 sandboxes, 6 signals, 11 guests) is illustrative demo data. Everything on the roadmap sits under "The vision" and is labelled as not built.

---

## 1. Logline and taglines

**Logline:** When the attacker is reading your email and the phones are dead, Claura runs the response from outside the crime scene: Nemotron agents contain the compromised GPU host while the War Room keeps legal, execs and engineers on one live record.

**Tagline options (7 words each)**

1. **Your network is compromised. Your command isn't.** Recommended. It closes the pitch and the film.
2. The attacker reads your email. Not this.
3. Seal the breach. Keep the humans talking. This one bridges to the house line, "Seal the breach before it spreads."

---

## 2. Elevator pitches

### 15 seconds (about 40 words)

> 2 a.m. The attacker is reading your email and the phones are dead. Claura runs the response off the hacked network: AI agents contain the compromised GPU host, and the War Room keeps legal, execs and engineers on one record.

### 30 seconds (about 80 words)

> Every incident plan assumes you can still talk. You can't: CISA has documented a crew that reads victims' Slack and email and dials into their response calls. Inside an AI data center, one rogue VM shares a server with eleven tenants. Claura splits the response. On-prem Nemotron agents contain the host, reversible steps first, and a human approves the quarantine. The War Room runs off the compromised network, so legal, execs and engineers stay coordinated. Your network is compromised. Your command isn't.

---

## 3. The 2-minute judge-table pitch

**Setup before the judge arrives**
- Two roles: the Speaker talks, the Driver clicks. The Speaker never touches the trackpad.
- Main laptop: Overview, nominal state, incident not yet played. The header clock reads 02:14 CST. Leave it there; it is the first line of the pitch.
- Second laptop or phone: signed in as the second approver for the Secure Shell, with the War Room open. It also shows a second console updating from the same log.
- Pick the honesty line that is true at your table (see the truth check in section 5). If the console runs live: "simulated attack, illustrative numbers, real agents and database." If it runs the scripted replay: "this replay is scripted to fit two minutes; the same run happens live, Nemotron and SpacetimeDB, in that terminal."
- Fallback: the demo video on a phone, already open and paused.

**Script.** 277 spoken words: about 1:51 at 150 words a minute, plus the ⌘↵ beat and a 5-second voice answer. Times are targets. Lines marked *(cut if behind)* go first and save about 6 seconds.

**0:00 · The hook**
[DEMO: Overview, nominal. Point once at the clock in the header. Hands off the trackpad.]

> It's 2:14 a.m. Ransomware has your files, the phones are down, and the attacker is reading your email. CISA documented a crew that reads victims' Slack and Exchange and dials into their incident calls. You don't investigate in front of the suspect. Claura runs the response from outside the crime scene. Quick label: simulated attack, illustrative numbers, real agents and database.

**0:25 · Incident replay**
[DEMO: Driver opens Incident and starts the replay. The signal stream fills, the attack path lights up, the agent rows go busy.]

> Watch: an AI workload goes for the host through the vGPU path. *(cut if behind)* NVIDIA patched this class of bug last year. Sentry correlates six signals in about a second. Triage maps the blast radius: one host, eleven innocent neighbors. Warden contains, reversible steps first: network cut, tokens revoked, host cordoned, guest paused, memory captured, all eleven neighbors moved to clean hosts.

**0:50 · The one human step**
[DEMO: The approval sheet "Quarantine b14-gpu-07?" slides up. Point at Scope, then Rollback, tap Show evidence. Then press ⌘↵.]

> One step is big enough to need a person: quarantining the host. Evidence, scope, rollback, one card. Warden can't press this. In SpacetimeDB, policy, not the model, decides.
> [⌘↵] Approved. Contained in 9.4 seconds, in our demo. That's the machine clock. Now the human clock starts.

**1:10 · War Room**
[DEMO: Click the War Room pill on the incident header. Show #exec, then #legal. Point at the brief ("What we know / What we don't"), the decision log, the clocks card.]

> The War Room runs off the compromised network, on break-glass identities issued before tonight. No email, no phones. Scribe gives the CEO plain language: what we know, what we don't. Legal sees every decision with a name on it, and the clocks: SEC, four business days after materiality; GDPR, 72 hours.

**1:32 · Secure Shell**
[DEMO: Overview, click host b14-gpu-07, then Open secure shell. Touch ID. The teammate approves on the second laptop. A read-only session opens; type one harmless command such as `uptime`.]

> Need hands on the box? Touch ID, a second approver, a certificate that expires on its own. Read-only, and every keystroke is hash-chained into the record. *(cut if behind)* You investigate without trampling the crime scene.

**1:48 · Ask Claura, then close**
[DEMO: Hold the mic button in the toolbar and ask, "Are any customers affected?" Let the spoken answer play.]

> And the CEO in the car just asks.
> [The answer plays, about 5 seconds.]
> Next: the bunker and the black box for every AI factory. Claura. Your network is compromised. Your command isn't.

**Swap-ins by judge.** Replace the Secure Shell beat (about 15 seconds) with the one that matches the judge.
- **NVIDIA:** [DEMO: Agents, Triage's tool-call trace.] "This is Nemotron 3 Nano, 2.9 gigabytes, on this laptop. It called inventory, reachability and policy tools, then proposed actions. Then we injected a labelled red-team proposal to reimage the host. Policy blocked it, and the block is in the log."
- **Spacetime:** [DEMO: Policy view, then the second laptop.] "Everything you saw is rows in one SpacetimeDB module. The policy gate is a reducer. That second console subscribes to the same log and updated live."
- **NMC²:** [DEMO: point at failover 11/11.] "The missed warning, caught in a second. The handoff, one live log. The right information at the right time, one card. And the eleven neighbors never stopped serving."

If a judge interrupts, answer, then say "let me land the plane" and press ⌘↵.

---

## 4. The problem: the network is the crime scene

### 2:14 a.m. (a composite scene, not a case study)

The on-call engineer doesn't get paged, because the phones are down. She hears about it from a Slack message on her personal laptop. The incident call opens on Teams and fills up fast. Nobody checks who everyone is. The runbook is a PDF on the file share that ransomware encrypted an hour ago. The CEO texts the CISO from a personal phone: are we on the news? Counsel asks the question nobody can answer: has a notification clock started?

Meanwhile, in Hall B, an AI workload is still pushing on the wall of its virtual machine, and eleven other companies' models share that server. Someone SSHes in with a long-lived key, and the evidence starts to change under their hands. By morning, every decision lives in somebody's DMs, and nobody can say who approved what, or when.

That is the Winstead track organizer's own clarification, almost word for word: assume the attacker sees normal communications, ransomware has locked the data, phones are down, email is sporadic, and nobody has information.

### Why now

- **AI put many tenants on one very expensive box.** A GPU host runs many customers' workloads, and on a shared vGPU host the VM and the vGPU stack are the wall between them. That wall has cracks (receipt 3).
- **Attackers now work the response itself.** They read the channels defenders use to coordinate, and they dial into the call (receipts 1 and 2).
- **Breaches cost more and are more AI-driven, and automation measurably pays** (receipt 4).

### Who bleeds

- **The eleven neighbors.** Other companies' models and data share the suspect host. They did nothing wrong, and a careless response, such as live-migrating them through a hypervisor you no longer trust, puts them at risk.
- **The incident commander,** making a high-impact call at 2 a.m. with half the facts and no record of who said what.
- **Counsel,** whose deadlines run from a determination, not from a convenient morning.
- **Executives,** who must say something in public without knowing what is true.
- **Customers,** at the end of every one of those chains.

### The receipts

1. **The attacker is in your comms.** The FBI and CISA say Scattered Spider searches victims' Slack, Microsoft Teams and Exchange Online for conversations about the intrusion and the security response, and that its members "frequently join incident remediation and response calls and teleconferences." ([CISA AA23-320A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-320a), November 2023, revised July 2025)
2. **Even the best get read.** Microsoft disclosed that a Russian state actor, Midnight Blizzard, got into a small share of its corporate mailboxes, including senior leaders and staff in cybersecurity and legal, and took emails and attachments. ([Microsoft MSRC, 19 Jan 2024](https://www.microsoft.com/en-us/msrc/blog/2024/01/microsoft-actions-following-attack-by-nation-state-actor-midnight-blizzard))
3. **The wall between AI tenants cracks.** In NVIDIA vGPU software for Linux-style hypervisors, a malicious guest could overflow a stack buffer in the host's Virtual GPU Manager, with possible code execution and privilege escalation (CVE-2025-23283, CVSS 7.8 as scored by NVIDIA, [NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-23283)). Separately, Wiz showed a three-line Dockerfile escaping the NVIDIA Container Toolkit to root on the host, which put other customers' data and models on the same hardware within reach ([Wiz, July 2025](https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape)). Wiz said the flaw affected 37% of cloud environments ([The Hacker News](https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html)).
4. **It is expensive, and automation pays.** IBM's 2026 Cost of a Data Breach Report puts the global average breach at $4.99M, up 12% and a record. AI-driven attacks rose 56%, and organizations that use security AI and automation extensively saved $1.93M compared with those that use none. ([IBM](https://www.ibm.com/reports/data-breach))

### The gap

Every tool in the response depends on the thing that is compromised. The SIEM, the tickets, the chat, the call, the runbook and the SSH keys all live on the network the attacker owns. And no playbook was written for the AI-host escape, where order matters: contain before you investigate, capture memory before anything destructive, and never live-migrate guests off a host you no longer trust, because that copies their memory through a hypervisor the attacker may control.

---

## 5. What Claura does

### Built today (what the demo shows)

| Piece | What it does | Real or simulated |
|---|---|---|
| Operator console | Liquid-Glass UI with progressive disclosure: Overview (the DFW-2 facility map), Incident, War Room, Shells, Agents, Policy, Reports. The approval sheet shows evidence, scope and rollback on one card; ⌘↵ approves. | Real |
| Four defender agents | Sentry, Triage, Warden and Scribe reason with NVIDIA Nemotron 3 Nano 4B (`nemotron-3-nano:4b`, 2.9 GB), local and on-prem through Ollama. They run a multi-step tool loop: `list_recent_signals`, `open_incident`, `get_host_inventory`, `check_reachability`, `record_finding`, `get_policy`, `propose_action`, `list_events`, `file_report`. If the model doesn't propose a denied action on its own, a labelled red-team probe proposes one (`reimage_host`) so you can watch policy block it. A deterministic fallback takes over if the model fails or times out, and each agent's state row records whether its output came from the model, the fallback or the script. | Real model and tool calls; the telemetry they read is simulated |
| SpacetimeDB backend | One module holds all incident state: hosts, guests, signals, incidents, findings, proposals, policy, the event log, reports. **The policy gate lives in the `propose_action` reducer**: each action is `auto`, `approval` or `deny`. Unknown actions fail closed, invented hosts and VMs are blocked, the agents have no approve tool, and the `approve` reducer refuses agent names. Every console subscribes to the live incident log. | Real; being published to Maincloud |
| War Room | Out-of-band stakeholder coordination on SpacetimeDB's cloud, off the compromised network, with break-glass identities. Channels #command, #legal, #exec, #comms-pr, #vendors. Scribe's plain-language brief (what we know, what we don't). Tasks with owners. A decision log. Example notification clocks, labelled "confirm with counsel": an SEC Item 1.05 8-K is generally due four business days after a materiality determination ([SEC](https://www.sec.gov/newsroom/press-releases/2023-139)); GDPR asks controllers to notify the supervisory authority within 72 hours where feasible ([GDPR Art. 33](https://gdpr-info.eu/art-33-gdpr/)). | Real UI; stakeholder messages in the replay may be scripted (truth check) |
| Secure Shell | Click any host to get a just-in-time, short-lived OpenSSH-certificate session in the browser. Passkey or Touch ID step-up, two-person approval for suspect hosts, read-only forensic mode, and every keystroke recorded and hash-chained into the incident log. | Real (truth check) |
| Claura Voice | ElevenLabs reads Scribe's brief aloud, in several languages. Push-to-talk "Ask Claura" questions are answered by Nemotron from the incident record. | Real (truth check) |
| claura.tech and the mark | The landing page, and a new logo: a C-shaped aura ring whose seal bar closes the gap. | Real |
| Simulated on purpose | The attack telemetry (a replay), the facility (2,048 hosts, 61,207 sandboxes), the people in the War Room replay, and the 9.4 s. The 9.4 s assumes an instant approval. | Illustrative |

**Truth check before 1 pm.** Say only what shipped.
- [ ] Is the console running live on SpacetimeDB, or the scripted replay? Use the matching honesty line from section 3.
- [ ] Is the module on Maincloud, or on a local SpacetimeDB server? If local, say "the War Room is designed to run on Maincloud; today it runs on a local SpacetimeDB server."
- [ ] Are War Room messages live rows, or scripted data? If scripted, say "the channel design is real; tonight's messages are a replay."
- [ ] Which Secure Shell parts are real: the certificate, Touch ID, the second approver, read-only mode, the hash chain? Name only those.
- [ ] Does voice work on venue Wi-Fi? Keep one recorded answer as a labelled fallback.
- [ ] Winstead's brief asks for admin user management and the status of compromised data (locked, exfiltrated). If the console lacks either, call it "next" in answers. Never imply it exists.
- [ ] The sidebar tags say "NVIDIA Nemotron · on-prem" and "SpacetimeDB · live sync". They are true only if the live path runs at the table.
- [ ] The backend README lists "no authentication" as an open issue: any connected identity can call `approve` or `set_policy`. If operator identities still aren't pinned with `ctx.sender`, say so when asked (Q3 has the line).
- [ ] Every "Maincloud" claim in sections 5 and 6 depends on the publish actually landing.

### The vision: 12 to 36 months (not built; this is where Claura goes)

**The big idea: every AI factory gets a bunker and a black box.** The bunker is where the humans go when the network turns on them. The black box is the signed record of what happened and who decided. Today's demo is the first room of the bunker and the first page of the black box.

**12 months: the bunker for every breach**
- **A War Room for any company and any incident.** Ransomware at a hospital, a law firm or a city gets the same out-of-band room. Break-glass kits, meaning hardware passkeys and offline instructions, are issued at onboarding. Cellular and satellite fallback paths keep it working when the building's internet doesn't.
- **Drills that run themselves.** Claura stages realistic tabletop incidents from current threat intelligence, so the first time a CEO opens the War Room isn't the real night.
- **Counsel mode.** Counsel-directed privileged workspaces, distribution controls, and a notification-clock engine that covers many regimes, with every clock marked "confirm with counsel".
- **Standards-ready records.** The incident record exports in a shape aligned with NIST SP 800-61 Rev. 3, published April 2025 and built on CSF 2.0 ([NIST](https://csrc.nist.gov/pubs/sp/800/61/r3/final)).
- **Real signals.** Connectors for hypervisor and VMM audit logs, IOMMU faults, host EDR, BMC and Redfish, and IAM. First pilots measure real time to detect and time to contain.

**24 months: enforcement below the hypervisor**
- **An agent firewall.** Every AI agent in the building, ours and our customers', routes its tool calls through Claura's policy gate: auto, approval or deny, failing closed. "Policy, not the model, decides" becomes infrastructure for the agent era.
- **DPU enforcement.** Warden's hands move into the DPU, for example NVIDIA BlueField, below the hypervisor the attacker is trying to own. Cutting the network, detaching storage and capturing memory happen from a place a compromised host can't override.
- **Confidential-computing failover.** Before any guest is evacuated, Claura attests that the destination host and GPU are clean, so neighbors land somewhere provably safe.
- **Autonomous recovery.** Re-image, re-attest, return to the pool. The machine does the work, and a human signs once.

**36 months: an immune system for AI infrastructure**
- **Cross-cloud threat sharing.** GPU clouds share breach fingerprints (signal patterns, never customer data) over open standards such as STIX and TAXII, so an escape seen in Dallas is blocked in Frankfurt within the hour.
- **Proof-of-containment attestations.** The hash-chained record becomes a signed attestation that insurers, auditors and regulators can verify. Cyber cover gets priced on measured time to contain instead of questionnaires.
- **Sovereign AI defense.** A fully air-gapped edition with on-prem Nemotron, self-hosted SpacetimeDB on its own out-of-band network, and multilingual voice, for national AI compute, defense and critical infrastructure.

**The prize.** McKinsey estimates that data centers need $6.7 trillion of capital worldwide by 2030 to keep up with compute demand, $5.2 trillion of it for AI-ready capacity ([McKinsey](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers), as reported by [IT Brew](https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030)). Every one of those buildings needs a plan for the night the network turns on it.

**How it makes money (vision, pricing untested):** the agents are priced per protected GPU host; War Room seats come with break-glass kits; insurers and auditors pay for an attestation API.

---

## 6. Why it wins each track

- **Winstead PC, Cyber Incident Response Dashboard.** We built to your brief and your clarifications literally: the attacker sees normal comms, phones are down, email is sporadic, and nobody has information. The War Room runs off the compromised network on break-glass identities, with role channels, tasks, a decision log with names on it, Scribe's plain-language brief and example notification clocks, and every action carries an actor and an authorizer while the evidence carries hashes, so counsel can reconstruct the night.
- **NMC², Keep the World Running.** Your brief names missed warnings, unclear handoffs and wrong information at the wrong time. Sentry catches the warning in about a second, one live log and the War Room carry the handoff, the approval card puts evidence, scope and rollback in front of the one person who must decide, and all eleven neighbors keep serving from clean hosts while the suspect host goes dark.
- **NVIDIA, Use Nemotron Beyond a Chatbot.** Nemotron is the reasoning core of four agents that plan and execute multi-step tool calls (inventory, reachability, policy lookup, `propose_action`, `file_report`) against a live database, and it answers spoken questions too. It runs inside the building on a 2.9 GB model, so telemetry never leaves, and the policy gate is what makes a small model safe to act on production.
- **Spacetime, Build on Spacetime.** The backend is a SpacetimeDB module: all incident state, the policy gate inside reducers (auto, approval, deny, failing closed), human approvals, and the live incident log that every console and the War Room subscribe to. The database is the incident, in a public repo, published to Maincloud.
- **MLH.** For Best Use of ElevenLabs, Claura Voice reads Scribe's brief aloud in the listener's language and answers push-to-talk questions, because at 2 a.m. the CEO is in a car, not at a dashboard ([MLH's HackUTD prize list](https://www.mlh.com/events/hackutd-ae/prizes); confirm it is this year's list). Check whether MLH's GoDaddy Registry domain prize accepts a .tech name before entering claura.tech, and enter other MLH categories only for integrations that are in the repo.

---

## 7. Demo-video voice-over (about 105 seconds, 252 spoken words)

One idea per line. Picture is real Claura UI from line 4 onward. Burn in captions. Put a lower-third on the first UI shot that says "Demo facility · simulated telemetry · illustrative numbers".

| # | Voice-over (spoken) | Picture |
|---|---|---|
| 1 | The attacker is reading your email. | Black frame. An email subject types itself, "INC bridge: dial-in", and a read tick appears. Lands by 0:02. |
| 2 | Your phones are down. Ransomware has the file shares. | A dead handset glyph; a file share stamped LOCKED. |
| 3 | And the incident call? They've dialed in. | A participant list with one unknown name. Lower-third: "Tactic documented in CISA advisory AA23-320A". |
| 4 | Now put that inside an AI data center. | Cut to Claura Overview: the DFW-2 facility map. |
| 5 | One AI workload, trying to break out of its virtual machine. | Incident replay starts; the signal stream fills. |
| 6 | Eleven other companies' models, on the same server. | Blast radius: eleven guests ring host b14-gpu-07. |
| 7 | This is Claura. | The logo; the seal bar closes the ring. |
| 8 | Command, from outside the network under attack. | Lockup with tagline. |
| 9 | Sentry connects six signals in about a second. | Six signals collapse into INC-0419. |
| 10 | Triage maps the blast radius. One host. Eleven neighbors. | The attack graph. |
| 11 | Warden contains it, reversible steps first. | The containment plan starts ticking. |
| 12 | Network cut. Tokens revoked. Guest paused. Memory captured. | Steps 1 to 5 turn done, one per word. |
| 13 | Every neighbor, moved to a clean host. | Failover 11/11. |
| 14 | One step is big enough to need a human. | The approval sheet slides up. |
| 15 | Evidence, scope and rollback, on one card. | Push in on Scope, Rollback, Show evidence. |
| 16 | Command-Enter. | A real ⌘↵ keypress overlay. Half-second hold. |
| 17 | Contained. Nine point four seconds, in our demo. | The counter freezes at 9.4 s, tagged "illustrative demo number". |
| 18 | The agents run on NVIDIA Nemotron, inside the building. | Agents view: model `nemotron-3-nano:4b (local, on-prem)` and a tool-call trace. |
| 19 | The model proposes. SpacetimeDB policy decides. | Policy view: auto, approval, deny; a blocked `reimage_host` row. |
| 20 | Then comes the part dashboards forget: the people. | The War Room opens. |
| 21 | The War Room runs off the compromised network. | Banner: "Out-of-band channel · not on the corporate network". |
| 22 | No email. No phones. Break-glass identities, issued before the bad night. | Identities verified, avatars come online. |
| 23 | Legal, execs, engineers and vendors, on one live record. | The channel list: #command, #legal, #exec, #comms-pr, #vendors. |
| 24 | Scribe tells the CEO what we know, and what we don't. | The brief card: "What we know" and "What we don't know". |
| 25 | Legal sees every decision, and every deadline. | The decision log, then the clocks card ("example obligations, confirm with counsel"). |
| 26 | Need hands on a server? | Click host b14-gpu-07, then Open secure shell. |
| 27 | Touch ID. A second approver. A certificate that expires on its own. | The passkey prompt, the second approval, the "read-only forensic mode" banner. |
| 28 | Every keystroke, hash-chained into the evidence. | The keystroke log with hashes. |
| 29 | And the CEO? Just ask. | A thumb holds the mic button. |
| 30 | *(second voice, the CEO)* Are any customers affected? | A waveform. |
| 31 | *(Claura Voice)* Not so far. One server was involved, and its workloads moved to safe servers. | The answer, captioned. Replace this text with the real output from the take you record. |
| 32 | Contain the machine. Keep the humans talking. | Split screen: the sealed host and the busy War Room. |
| 33 | Claura. | The logo, centred. |
| 34 | Your network is compromised. Your command isn't. | End card: claura.tech, github.com/zero-abd/claura, "Simulated telemetry · illustrative numbers". Hold 3 s. |

Count: 252 spoken words across 34 lines, including the CEO's question and Claura Voice's answer. At 145 to 150 words a minute that is about 101 to 104 seconds, plus the ⌘↵ beat and the end-card hold, so about 105 to 108 seconds in total. If the real voice answer runs long, cut line 13 first.

---

## 8. The five hardest judge questions

**1. "If the attacker owns your network, and maybe your SSO, why is the War Room any safer?"**
Because it shares nothing with the compromised side. It runs on SpacetimeDB's cloud, not the corporate network. By design it admits only break-glass identities, passkeys enrolled before the incident rather than corporate SSO, which is exactly the defense against the dial-into-the-bridge trick in CISA's Scattered Spider advisory. Only summaries, decisions and messages cross over; raw telemetry stays in the building with Nemotron. If you'd rather not trust a vendor cloud either, SpacetimeDB also runs self-hosted, so the room can live on its own separate network. The honest limit: a stakeholder's compromised laptop compromises that seat. That's why high-impact steps need a named approver or two people. Hardware keys, revocation and an enrollment ceremony are the production path.

**2. "Everything Scribe writes could be discoverable. Aren't you building evidence against your own client?"**
That's counsel's call, and we're not lawyers. The risk is real, though: in 2020 a federal magistrate judge ordered Capital One to produce the Mandiant report on its 2019 breach, finding it was not protected work product ([Faegre Drinker summary](https://www.faegredrinker.com/en/insights/publications/2020/6/disclosure-ordered-of-data-breach-incident-response-report-prepared-for-outside-counsel)). So the record sticks to facts (who did what, when, with hashes), #legal is its own room, and Scribe separates what we know from what we don't instead of guessing. Counsel-directed privileged workspaces and distribution controls are on the roadmap. The alternative is worse: decisions scattered across personal phones with no record at all.

**3. "You let a 4-billion-parameter model touch production hardware? What if it's wrong, or prompt-injected through the logs?"**
It never touches hardware. It can only call `propose_action`, and a SpacetimeDB reducer checks the policy table: auto, approval or deny. Unknown actions fail closed, invented hosts are blocked, and the agents have no approve tool. So even a fully hijacked model can't take an action the policy doesn't allow; the worst it can do is write a wrong finding, which a human reads next to the evidence. We can show it: a labelled red-team proposal to reimage the host shows up in the log as blocked. Flip `quarantine_host` to auto with one reducer call and the same proposal runs with no human; flip it back and it waits. Two things we haven't done yet: pin approvers to operator identities inside the reducer, and measure false positives on real telemetry. Both are pilot one.

**4. "Why not just use Signal and a printed runbook?"**
Signal moves messages. It doesn't run an incident: there's no decision log, no tasks with owners, no evidence chain, no clocks, no agents posting verified status, and no record of who may approve a quarantine. Personal apps are also a records problem. In 2022 the SEC charged 16 Wall Street firms, with combined penalties above $1.1 billion, because staff did business on personal-device messaging apps and the firms didn't preserve the messages ([SEC](https://www.sec.gov/newsroom/press-releases/2022-174)). And the printed runbook doesn't know which eleven guests are on b14-gpu-07. Claura is out-of-band and on the record.

**5. "What's actually real in what I just saw, and is 9.4 seconds real?"**
Real: the console, the SpacetimeDB module with the policy gate and the live log, the Nemotron agents making tool calls, the War Room, the Secure Shell flow and Claura Voice. Adjust this list to the truth check. Simulated: the attack telemetry (a replay), the facility, the stakeholder messages in the replay, and every number on screen. The 9.4 seconds is illustrative and assumes an instant approval. A real operator takes longer, which is exactly why everything reversible happens before the card appears. We haven't run on real hosts yet; that's the first pilot.

---

## Sources (checked 8 Nov 2026)

- CISA and FBI, Scattered Spider advisory AA23-320A: https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-320a
- Microsoft MSRC on Midnight Blizzard, 19 Jan 2024: https://www.microsoft.com/en-us/msrc/blog/2024/01/microsoft-actions-following-attack-by-nation-state-actor-midnight-blizzard
- NVD, CVE-2025-23283 (NVIDIA vGPU Virtual GPU Manager): https://nvd.nist.gov/vuln/detail/CVE-2025-23283
- Wiz, NVIDIAScape (CVE-2025-23266): https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape
- The Hacker News on CVE-2025-23266 (the 37% figure): https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html
- IBM, Cost of a Data Breach Report 2026: https://www.ibm.com/reports/data-breach
- SEC press release 2023-139 (Form 8-K Item 1.05): https://www.sec.gov/newsroom/press-releases/2023-139
- GDPR Article 33: https://gdpr-info.eu/art-33-gdpr/
- SEC press release 2022-174 (off-channel communications): https://www.sec.gov/newsroom/press-releases/2022-174
- Faegre Drinker on the Capital One and Mandiant report ruling: https://www.faegredrinker.com/en/insights/publications/2020/6/disclosure-ordered-of-data-breach-incident-response-report-prepared-for-outside-counsel
- McKinsey, "The cost of compute": https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers (figures confirmed through IT Brew: https://www.itbrew.com/stories/2025/05/09/is-usd7-trillion-really-the-magic-number-to-get-ai-data-centers-up-to-speed-by-2030)
- NIST SP 800-61 Rev. 3: https://csrc.nist.gov/pubs/sp/800/61/r3/final
- MLH, HackUTD prizes: https://www.mlh.com/events/hackutd-ae/prizes
- Ollama, Nemotron 3 Nano (model sizes): https://ollama.com/library/nemotron-3-nano
