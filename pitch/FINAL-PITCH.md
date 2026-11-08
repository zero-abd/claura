# Claura: final pitch package

HackUTD 2026 (Zero Day). Devpost closes 12:00 pm CST. Science-fair judging 1:00 to 4:00 pm, about 3 to 4 minutes per table.
Angle: Crime Scene hook ("the attacker is reading your email"), Immune System category, Agents-vs-Agents proof that Nemotron is necessary, one borrowed idea from Bulkheads ("seal the compartment").

---

## 0. Claim discipline (read before every rehearsal)

| Say it as | What it covers |
|---|---|
| **Live** (present tense) | The Liquid Glass console: Overview with a clickable real-time 3D data center, Incident, the approval card, War Room, People & Access, Data Scope, Reports. The SpacetimeDB module on Maincloud: all incident state, operator identities and admin-only reducers, the policy gate, War Room messages, data scope, the NIST-structured record with SHA-256 chain of custody and PDF export. Every console subscribes live. Four agents driven by NVIDIA Nemotron (`nemotron-3-nano:4b`) on this laptop, making multi-step tool calls. Secure Shell: just-in-time OpenSSH certificates, CA-signed host certificates, Touch ID step-up, two-person approval, read-only forensic mode, hash-chained session recording. |
| **Simulated** (say "replay" or "simulated") | The attack telemetry (a replayed fixture). The effects of containment (state changes in the database; no real NIC, hypervisor or BMC is touched). The Secure Shell targets (real OpenSSH daemons in sandboxes, standing in for GPU hosts). The people in the scenario. |
| **Illustrative** (say "on our demo clock" or "in our demo") | 9.4 s to contain, 2,048 hosts, 61,207 agent sandboxes. |
| **Roadmap** (say "next" or "the vision") | Everything in section 11. Also "Ask Claura" voice: a bonus only, never in the two-minute pitch unless a judge asks and it works on venue Wi-Fi. |
| **Measured** (true, from our logged live runs) | One full live run on this laptop: 15 Nemotron turns, 14 tool calls, 0 malformed calls, about a minute of machine time from first signal to the approval card (`backend/runs/live-run-1.log`, `live-run-2-verbose.log`). The decision loop is live; the containment it triggers is simulated state. |
| **Repo-verified details** (say them only to a technical judge, and offer the file) | Nine agent tools and the `model` / `fallback` provenance tags (`backend/agents/README.md`, `src/tools.ts`). The gate blocks unknown actions and nonexistent hosts, and flipping `quarantine_host` to auto runs the same proposal with no human (`backend/spacetime/README.md`). User certificates last at most 15 minutes, and a suspect host accepts only the read-only `forensics` principal (`ssh/lib/hosts.mjs`, `ssh/lib/targets.mjs`). Example notification clocks sit in the War Room's #legal view (`apps/dashboard/src/warroom-data.ts`). |

**12:45 truth check (60 seconds, before the first judge).** Say a line only if it passes.
- [ ] A War Room message sent on Screen B appears on Screen A without a refresh.
- [ ] The Agents trace shows `model` tags from this run. If it shows `fallback` or `scripted`, say "fallback" or "replay".
- [ ] People & Access: a fresh enrollment code works once in a private window, then fails on reuse.
- [ ] Data Scope shows at least "locked by ransomware", "exfil suspected" and "intact"; Reports exports a PDF.
- [ ] Secure Shell: Touch ID prompt, second approver and the read-only banner all work on venue Wi-Fi.
- [ ] The War Room's #legal view shows the example notification clocks. If it doesn't, answer Q11 without "the War Room shows".
- [ ] Ollama is warm: `ollama run nemotron-3-nano:4b "ok"` (Ollama unloads an idle model after about 5 minutes).

---

## 1. Logline

Claura is the immune system for AI data centers: when an AI workload breaks out of its virtual machine and the attacker is reading your email, on-prem NVIDIA Nemotron agents contain it under policy, while an isolated command center keeps every human on one live record.

## 2. Taglines

1. **Your network is compromised. Your command isn't.** (Recommended. Closes the table pitch and the video, and it is literally true of the build.)
2. **Policy, not the model, decides.** (For the NVIDIA, security and Spacetime judges.)
3. **Every breach makes the whole fleet immune.** (Vision line only: it describes the roadmap, so say "next" before it.)

## 3. Elevator pitches

**15 seconds (45 words)**
> The attacker is reading your email, and one customer's AI just broke out into a server it shares with others. Claura is the immune system for AI data centers: on-prem Nemotron agents contain it under policy, and an isolated War Room keeps humans in command.

**30 seconds (84 words)**
> It's 2 a.m. The phones are down, and the attacker is reading your email. One customer's AI workload is breaking out toward a server it shares with eleven other companies. Claura is the immune system for AI data centers. NVIDIA Nemotron agents, on-prem, detect and contain it; a policy gate, not the model, decides what they may do; one human approves the quarantine. And an isolated War Room keeps legal, executives and engineers on one live record. Your network is compromised. Your command isn't.

---

## 4. Table setup

- **Two roles.** The Speaker talks and never touches the trackpad. The Driver clicks only on cues.
- **Screen A (main laptop):** console in live mode on Overview, all clear, signed in as RK (Incident Commander, admin).
- **Table card:** a small printed card next to Screen A: "Simulated attack replay · live software · illustrative numbers". The Speaker points at it during the reveal.
- **Screen B (second laptop or phone):** the same console, signed in as a second operator (JT, counsel), War Room open on #legal. This is the live-sync proof.
- **Reset between judges** and re-warm Ollama.
- **If live mode breaks:** switch to the replay and say "this is the replay; the live run takes about a minute on this laptop." Never let a judge discover it.
- **Fallback:** the demo video, open and paused on a phone.

---

## 5. The two-minute table pitch

About 265 spoken words. Times assume about 150 words a minute plus the click beats, landing near 1:56. Tags in the cues show which requirement each beat proves: **W1 to W5** are Winstead's five, **NMC** is NMC², **NV** is NVIDIA, **ST** is Spacetime.

**0:00 · Hook**
[DEMO: Screen A, Overview. The 3D data center turns slowly, every rack green. Hands off the trackpad.]
> It's 2 a.m. Ransomware has the file share, the phones are down, and the attacker is reading your email. You don't investigate in front of the suspect.

*Security and legal judges only, add:* "That's a documented tactic: CISA warns of attackers joining their victims' incident calls."

**0:12 · Reveal and honesty** (W1)
[DEMO: point at the Claura mark, then at the table card "Simulated attack replay · live software".]
> This is Claura, the immune system for AI data centers. Its command center runs outside your network, with its own identities. The attack is a replay; the software is live.

**0:24 · The breach** (NMC: the missed warning)
[DEMO: the Driver clicks the amber rack in Hall B; host b14-gpu-07 opens. Click Open incident: the attack path lights from vm-7f3a to the host and its eleven neighbors.]
> One customer's AI workload is breaking out of its virtual machine, toward a server shared with eleven other companies. Six warnings in six tools; none says "incident."

**0:37 · The agents** (NV)
[DEMO: Agents view, the live tool-call trace. Point at the model tag (`nemotron-3-nano:4b`, local) and at Triage's `get_host_inventory` and `check_reachability` rows.]
> Our agents run NVIDIA Nemotron on-prem, calling tools. Sentry correlates the six signals and opens the incident. Triage checks inventory and reachability: one host, eleven neighbors. Warden proposes containment, reversible steps first.

**0:50 · Policy and the one human step** (ST, NV, NMC: right information at the right time)
[DEMO: point at the policy column: auto / needs approval / denied. Point at the red row "reimage_host · denied · red-team probe". The approval sheet slides up: touch Evidence, Scope, Rollback, then press ⌘↵. Screen B flips to Contained at the same moment.]
> Every proposal hits a policy gate inside a SpacetimeDB reducer. Policy, not the model, decides. Our own red-team test, not Nemotron, tried to reimage the host: denied. Quarantine needs a human: evidence, scope, rollback, one card.
> [⌘↵] Contained: 9.4 seconds on our demo clock.

**1:09 · The people** (W5, ST)
[DEMO: War Room on Screen A. On Screen B the teammate posts in #legal: "Counsel here. Preserve the memory image." It lands on Screen A.]
> Then the people. The War Room is live chat inside Claura; that message just arrived from the other laptop. Scribe's brief: what we know, and what we don't know yet.

**1:23 · Access** (W2, W1)
[DEMO: People & Access → Add person → "Outside counsel", role Counsel → Generate code. The single-use code appears and the access event lands in the audit log.]
> Need outside counsel? The admin issues a single-use break-glass code. No email, no phones, no SSO.

**1:31 · Data scope** (W4)
[DEMO: Data Scope. Point at one row per status as you say it; use the asset names on screen if a judge leans in.]
> Data scope tracks every asset: locked by ransomware, exfiltration suspected, intact.

**1:36 · Documentation** (W3)
[DEMO: Reports. Point at the phase bar, then the chain-of-custody hashes, then click Export PDF.]
> The record follows NIST 800-61: live phase status, SHA-256 evidence hashes, a PDF for counsel to review.

**1:43 · Handoff, vision and close** (NMC: the handoff)
[DEMO: point at Scribe's shift-handoff card, then gesture at both screens.]
> At shift change, Scribe hands over the same record; nothing gets lost. Next: an immune system for every AI cloud, where one breach protects them all. Your network is compromised. Your command isn't.

**If a judge interrupts:** answer in one sentence, offer to show it, then say "let me land the plane" and press ⌘↵.
**If the judge arrives mid-run:** use the 60-second version (section 6) from whatever screen is up.

### Coverage check

| Requirement | Where the pitch proves it |
|---|---|
| W1 Highly secure, isolated inside a compromised network | 0:12 "command center runs outside your network, with its own identities"; 1:23 "no email, no phones, no SSO"; Secure Shell swap-in |
| W2 Access control, admin adds individuals | 1:23 single-use break-glass enrollment code, role, audit event |
| W3 Documentation to a standard, real-time status | 1:36 NIST SP 800-61 structure, live phase status, SHA-256 evidence hashes, PDF |
| W4 Scope of compromised data and its status | 1:31 per-asset status: locked by ransomware, exfiltration suspected, intact |
| W5 Real-time communications inside the system | 1:09 War Room message from Screen B lands on Screen A |
| NMC² missed warnings / handoffs / right info | 0:24 six warnings, none of which says "incident"; 0:50 one card; 1:43 shift handoff |
| NVIDIA multi-step tool use | 0:37 live tool-call trace with the model tag |
| Spacetime live sync | 0:50 policy reducer and Screen B flipping to Contained; 1:09 message arriving from Screen B |
| VC: the vision | 1:43 "Next: an immune system for every AI cloud" (the full roadmap is section 11) |

---

## 6. The 60-second version (judge arrives late)

About 110 spoken words, about 60 seconds with the clicks. Start from whatever screen is up.

> The attacker is reading your email, the phones are down, and an AI workload is breaking out of its virtual machine. This is Claura, the immune system for AI data centers.
> [DEMO: Agents trace.] Its agents run NVIDIA Nemotron on-prem and call tools step by step: correlate the signals, map the blast radius, propose containment.
> [DEMO: the blocked row, then the approval sheet, then ⌘↵.] A policy gate in SpacetimeDB decides. Our red-team reimage request was denied; quarantine waited for a human. Contained, on our demo clock.
> [DEMO: War Room on both screens, then People & Access, Data Scope, Reports.] Then the people, outside the compromised network: live chat, a plain-language brief, counsel added with a single-use code, data scope asset by asset, and a NIST-structured record with chain of custody.
> Your network is compromised. Your command isn't.

---

## 7. Swap-ins by judge (about 15 seconds each, after the pitch)

- **NVIDIA.** [DEMO: Agents trace, one agent expanded.] "One live trajectory: Triage called `get_host_inventory`, found eleven co-resident guests, called `check_reachability`, saw the management port reachable, then wrote its finding with a blast score. Every row is tagged `model` or `fallback`, so you can see exactly what Nemotron did. Our logged live run: 15 turns, 14 tool calls, zero malformed."
- **Spacetime.** [DEMO: Policy view, then Screen B.] "The gate is the `propose_action` reducer. In one transaction it reads the policy row and the target, then commits the proposal as executed, pending or blocked. A blocked proposal stays in the record for audit and live sync, but its action is never applied. Approvals and admin actions are identity-checked in the reducers: only an admin adds people or changes policy. Both screens are just subscriptions."
- **Security / CISO.** [DEMO: Overview, click b14-gpu-07, Open secure shell.] "Click the host. Claura's CA mints a short-lived OpenSSH certificate for the read-only forensics principal; the host proves itself with a CA-signed host certificate, so there's no trust-on-first-use. Touch ID, then a second approver. Every session lands in a hash-chained ledger."
- **NMC².** [DEMO: War Room tasks, then the handoff card.] "Missed warning: six signals, one incident. Handoff: tasks with owners and Scribe's shift handoff on the same record, so the next shift doesn't rebuild the night from memory. In the simulated plan, the eleven neighbors restart on clean hosts instead of being live-migrated through a hypervisor we no longer trust. The demo changes database state; it doesn't perform or time a real failover yet."
- **Winstead attorney.** [DEMO: #legal, the decision log, the clocks card.] "The decision log records who decided what, and when. The notification clocks are examples labelled 'confirm with counsel', and they start only when counsel makes the call. The PDF is a contemporaneous export for outside counsel to validate and use as they see fit; Claura doesn't decide privilege, materiality or notification duties."

---

## 8. The problem, in receipts

Every number here has a source in section 12. Never add a number at the table that isn't in this file.

- **The attacker is in your comms.** CISA and the FBI say Scattered Spider searches victims' Slack, Microsoft Teams and Exchange Online for conversations about the intrusion and the response, and "frequently join[s] incident remediation and response calls" ([CISA AA23-320A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-320a)).
- **The wall between AI tenants cracks.** On 30 Sep 2026 NVIDIA disclosed CVE-2026-47498: a user inside a guest VM can trigger an out-of-bounds write in the host's vGPU Manager with a crafted RPC message (CVSS 7.8) ([NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-47498)). Wiz's NVIDIAScape (CVE-2025-23266, CVSS 9.0) let a three-line Dockerfile take root on a GPU host; Wiz estimated 37% of cloud environments were vulnerable ([The Hacker News](https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html)).
- **Attackers are already agents.** In a campaign Anthropic disrupted, AI performed 80 to 90 percent of the work, at peak "thousands of requests, often multiple per second" ([Anthropic](https://www.anthropic.com/news/disrupting-AI-espionage)).
- **Seconds, not shifts.** Average eCrime breakout fell to 29 minutes in 2025; the fastest took 27 seconds ([CrowdStrike 2026 Global Threat Report](https://www.crowdstrike.com/en-us/press-releases/2026-crowdstrike-global-threat-report/)).
- **At 2 a.m.** 88% of ransomware payloads were deployed outside business hours (661 cases, Nov 2024 to Oct 2025) ([Sophos Active Adversary Report 2026](https://www.sophos.com/en-us/press/press-releases/sophos-active-adversary-report-2026-identity-attacks-dominate-as-threat-groups-proliferate)).
- **It's expensive, and automation pays.** The global average breach hit a record $4.99M; organizations using security AI and automation extensively saved $1.93M on average ([IBM press release](https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average); [eSecurity Planet on the IBM report](https://www.esecurityplanet.com/cybersecurity/ibm-2026-cost-of-a-data-breach-report-key-findings/)).

**The gap.** Every tool in today's response (SIEM, tickets, chat, the bridge call, the runbook on the file share, the long-lived SSH keys) lives on the network the attacker owns. And no playbook covers the AI-host escape, where the order matters: contain before you investigate, capture memory before anything destructive, and never live-migrate guests off a host you no longer trust.

---

## 9. Judge Q&A (12 hard questions)

Answer in one or two sentences, then offer to show it.

**1. "What happens on a false positive?"**
False positives are the real operating cost, so automation is limited to cheap, undoable steps: cut one VM's network, revoke its tokens, cordon the host, pause the guest. Failing over the eleven neighbors restarts their workloads, so it's the expensive automatic step, and one admin-only policy change moves it to "needs approval". Quarantine always needs a named human. Honest gap: we haven't measured a false-positive rate on real telemetry; that's the first number a pilot produces.

**2. "Can the attacker prompt-inject your agents through the logs they read?"**
They'll try, which is why the model is never the authority. It can call only a fixed set of tools; every argument is schema-checked; it can't add a tool, widen its scope or approve anything. Every action goes through `propose_action`, where the policy table rules, and unknown actions or hosts that don't exist fail closed. Worst case, a hijacked agent writes a wrong finding that a human reads next to the evidence. Red-teaming injection through telemetry is first on our test plan.

**3. "Is VM escape even real?"**
Yes. On 30 Sep 2026 NVIDIA disclosed CVE-2026-47498, a guest-triggerable out-of-bounds write in the host's vGPU Manager. Wiz's NVIDIAScape got root on GPU hosts from a three-line Dockerfile. Broadcom's VMSA-2025-0004 ESXi flaws allowed VM escape and were exploited in the wild ([Tenable](https://www.tenable.com/blog/cve-2025-22224-cve-2025-22225-cve-2025-22226-zero-day-vulnerabilities-in-vmware-esxi)). Our demo plays the vGPU version; the response works the same for a container escape or a hijacked agent.

**4. "Why not a SOAR, Wiz or CrowdStrike?"**
They're the senses; Claura is the reflex and the command post. EDR and cloud-security tools detect, and host EDR is one of Sentry's six signals. A SOAR runs the playbook you chose in advance, usually over the same SSO, chat and email the attacker owns. Claura works out scope on this host, gates every action through policy, and keeps the people coordinated outside the compromised network. Hyperscalers staff this in-house; fast-growing GPU clouds mostly can't.

**5. "If the attacker owns your network, why is Claura safe?" (the isolation boundary)**
Because it's built not to depend on what the attacker is assumed to own. In this build, state, identities and the War Room are hosted on SpacetimeDB's Maincloud, outside the corporate network, and nobody needs corporate SSO, email or phones: people join with single-use break-glass codes and can connect over an independent path, such as a cellular hotspot. Approvals and admin actions are identity-checked in the reducers. Shell access runs through Claura's own SSH CA: certificates that expire within minutes, CA-signed host certificates, Touch ID, and two people for a suspect host. What it doesn't cover: a compromised operator laptop compromises that seat, which is why high-impact steps need a second person. Maincloud is a third party, so a regulated customer would self-host SpacetimeDB in its own isolated enclave. And nobody has pen-tested us yet.

**6. "What's real and what's simulated?"**
Live: the console, the SpacetimeDB module on Maincloud (state, identities, the policy gate, War Room, data scope, the record), Nemotron on this laptop making the tool calls, and the Secure Shell certificate flow. Simulated: the telemetry is a replayed fixture, containment changes database state rather than real hypervisors, and the shell targets are real OpenSSH daemons in sandboxes standing in for GPU hosts. 9.4 seconds, 2,048 hosts and 61,207 sandboxes are illustrative. Measured: a full live Nemotron run on this laptop takes about a minute, with 15 turns, 14 tool calls and zero malformed calls.

**7. "Who pays, and how?"**
Our buyer hypothesis is the CISO or head of infrastructure security at a multi-tenant GPU cloud, a market Synergy Research puts at more than $25B of revenue in 2025 and close to $400B by 2031. Isolation is what they sell, and one shared-host escape puts several tenants in scope at once. Our hypothesis, not yet validated, is that smaller GPU clouds want a packaged response capability rather than a hyperscaler-sized team. We haven't tested willingness to pay; customer discovery starts with the GPU-cloud operators here this weekend and will test per-protected-host pricing against per-deployment pricing, plus War Room seats and, later, an attestation API for insurers and auditors. The moat isn't the model. It's tested containment policies, host integrations, incident-outcome data, and signed attack fingerprints shared across fleets, which get more valuable with every operator that joins.

**8. "Why Nemotron, and why such a small model?"**
Because the reasoning has to happen inside the building: mid-breach you shouldn't ship incident telemetry to someone else's model API. Nemotron runs on-prem through Ollama, 2.9 GB, with tool calling. Rules recognize known indicators; Nemotron joins weak evidence across tools and decides which tool to call next. Small is deliberate: safety sits in policy, not model size, and every output is tagged `model` or `fallback`. A larger Nemotron on a GPU server in the hall is one setting in the runner.

**9. "Why SpacetimeDB, and how much of the backend is on it?"**
SpacetimeDB is the backend. Hosts, guests, signals, incidents, findings, proposals, policy, approvals, operators and roles, War Room messages, data scope, evidence and reports are tables. The policy gate and access control are reducers that run as transactions: a refused proposal is committed as blocked, so it's visible and audited, but its action is never applied. Every console subscribes, which is how the two screens stay in sync. The only processes outside it are clients that must sit next to hardware: the on-prem Nemotron runner and the SSH certificate gateway. The repo is public: github.com/zero-abd/claura.

**10. "Everything Scribe writes could be discoverable. What about privilege?"**
Counsel decides privilege, not software, and we're not lawyers. The risk is real: in 2020 a federal court ordered Capital One to produce its Mandiant breach report ([Faegre Drinker](https://www.faegredrinker.com/en/insights/publications/2020/6/disclosure-ordered-of-data-breach-incident-response-report-prepared-for-outside-counsel)). So Scribe records facts (who did what, when, with hashes) and separates what we know from what we don't instead of speculating; #legal is its own channel; and the admin decides who is enrolled and in which role. Counsel-controlled workspaces and legal holds are on the roadmap.

**11. "What about notification clocks?"**
The War Room shows example clocks labelled "confirm with counsel": an SEC Item 1.05 Form 8-K is generally due four business days after a materiality determination ([SEC](https://www.sec.gov/newsroom/press-releases/2023-139)); GDPR Article 33 asks for notice within 72 hours of becoming aware, where feasible ([GDPR](https://gdpr-info.eu/art-33-gdpr/)). A clock starts only when counsel makes the call, and Claura records who made it and when, which is what regulators ask about later. We never give legal conclusions.

**12. "Does it scale?"**
The expensive work scales with incidents, not hosts: agents wake per incident, each console subscribes only to its incident's rows, and the policy gate is one lookup per proposal inside a transaction. SpacetimeDB's own MMO, BitCraft Online, runs its entire backend as a SpacetimeDB module ([SpacetimeDB](https://github.com/clockworklabs/SpacetimeDB)). At fleet scale, Sentry sits behind existing detection and sees only candidate signals, and Nemotron runs per hall on an edge GPU box. Honest: we haven't load-tested beyond the demo fleet.

**Bonus, only if it's live:** "Can executives just ask?" Hold the mic: Ask Claura answers from the incident record with ElevenLabs. If it isn't live: "Voice briefings are next; the brief you just saw is what it reads."

---

## 10. Why we win, track by track

**Winstead PC: Cyber Incident Response Dashboard.** We built to the brief and to the organizer's clarification (the attacker sees normal comms, phones are down, email is sporadic, nobody has information).

| Requirement | Claura, live |
|---|---|
| 1. Highly secure, isolated system inside a potentially compromised network | Command plane hosted outside the corporate network on SpacetimeDB; no dependency on corporate SSO, email or phones; identity-checked approvals and admin actions; Secure Shell with short-lived certificates, CA-signed hosts (no trust-on-first-use), Touch ID, two-person approval, read-only forensics, hash-chained recordings |
| 2. Access control, admin can add individuals | People & Access: the admin adds a person with a role via a single-use break-glass enrollment code; admin-only reducers; access events in the audit log |
| 3. Documentation to incident standards, real-time updating and status | The record is structured to NIST SP 800-61, with live phase status, a SHA-256 chain of custody for evidence, and a PDF export for counsel to review |
| 4. Scope of compromised data and its status | Data Scope, every asset: intact, accessed, exfil suspected, exfil confirmed, locked by ransomware, restored, evidence preserved |
| 5. Real-time communications | War Room channels (#command, #legal, #exec, #comms-pr, #vendors), Scribe's brief ("what we know / what we don't know yet"), tasks, decision log, shift handoff. The admin controls enrollment; counsel, not the channel name or the software, decides privilege and distribution. |

Judging criteria: **security assuming the attacker has every internal system** (Claura doesn't depend on the corporate SSO, email, phones or chat the attacker is assumed to own); **ease of use under stress** (one card, one keystroke, a plain-language brief, progressive disclosure); **creativity** (agents contain the machine while the humans coordinate in a command plane outside the compromised network).

**NMC²: Keep the World Running.** Their three named failures map one to one. Missed warnings: Sentry fuses six weak signals that no single tool calls an incident. Unclear handoffs: tasks with owners, a decision log and Scribe's shift handoff on one live record. Wrong information at the wrong time: one approval card with evidence, scope and rollback at the moment of decision, plus a plain-language brief for everyone else. The demo models the operating goal: seal one compartment and restart its eleven neighbors on clean capacity, never live-migrated through a suspect hypervisor. It changes database state; we haven't integrated a real hypervisor or measured interruption time yet. The goal matters: in Uptime Institute's 2025 survey, one in five respondents said their most recent major outage cost more than $1M ([ITWeb on Uptime 2026](https://itweb.africa/article/uptime-announces-annual-outage-analysis-report-2026/WnxpEv4Y6837V8XL)).

**NVIDIA: Use Nemotron Beyond a Chatbot.** Nobody chats with these agents. Nemotron drives four agents through nine tools (`list_recent_signals`, `open_incident`, `get_host_inventory`, `check_reachability`, `record_finding`, `get_policy`, `propose_action`, `list_events`, `file_report`) against a live database: 15 turns and 14 tool calls in one logged run. Tool integration is real (every effect is a SpacetimeDB reducer call), and so is the engineering around a small model: schema validation, retry on malformed calls, stall detection, completion judged by database state rather than the model's word, and a deterministic fallback with provenance tags. It runs on-prem because incident telemetry is the one dataset you can't send out mid-breach, and the policy gate is what makes a small model safe to act.

**Spacetime: Build on Spacetime.** The majority of the backend isn't a stretch here; it's nearly all of it. All incident state, operator identities and roles, admin-only reducers, the policy gate (auto, needs approval, denied, failing closed), War Room messages, data scope and the documentation live in one SpacetimeDB module on Maincloud, and every console subscribes. The database is the referee: a proposal the policy refuses is committed as blocked, visible on every screen, and never applied. Public repo, booth access code on the submission.

**MLH: Best Domain Name from GoDaddy Registry.** claura.tech is short, brandable and live. Caveat: ICANN lists Radix, not GoDaddy Registry, as the .tech registry ([ICANN](https://www.icann.org/en/registry-agreements/details/tech)), so confirm eligibility with MLH before entering (SUBMISSION.md has the fallback).

---

## 11. The vision (ROADMAP: not built; say "next" out loud)

**The immune system for every AI cloud.** Today Claura contains one breach class end to end, under policy, with the humans in command. Next it becomes standard equipment: every AI factory ships with an immune system, the way every building ships with sprinklers.

| Horizon | Bet | What it means |
|---|---|---|
| 0 to 12 months | **Real senses** | Connectors for hypervisor and VMM audit logs, IOMMU faults, vGPU telemetry, host EDR, BMC and Redfish, workload identity. Design partners give us measured time-to-contain and false-positive rates to replace every illustrative number. |
| 0 to 12 months | **The agent firewall** | The same policy gate in front of every AI agent's tool calls in the building, not only ours: scope, rate and reversibility checked before any agent acts. |
| 0 to 12 months | **Voice briefings** | "Ask Claura": executives on the move ask out loud and hear the answer from the incident record, spoken by ElevenLabs in their own language. |
| 12 to 24 months | **Autonomous recovery** | Reimage, re-attest, return the host to the pool and fail tenants back, all logged; a human signs once. |
| 12 to 24 months | **DPU enforcement** | Containment moves into DPUs such as NVIDIA BlueField, below the hypervisor, so a compromised host can't lift its own quarantine. |
| 12 to 24 months | **Confidential-computing attestation** | Before any guest fails over, Claura verifies the destination host and GPU through hardware attestation, so neighbors land somewhere provably clean. |
| 12 to 24 months | **Insurance and compliance evidence** | The hash-chained record becomes a signed proof-of-containment pack that auditors, regulators and cyber insurers can verify; cover priced on measured containment instead of questionnaires. |
| 24 to 36 months | **Cross-cloud threat sharing on SpacetimeDB** | Operators share signed "antibodies" (escape fingerprints and policy rules, never tenant data) through subscribed SpacetimeDB modules, exportable as STIX/TAXII. One fleet's breach inoculates every subscriber: every breach makes the whole fleet immune. |
| 24 to 36 months | **Sovereign on-prem defense** | An air-gapped edition for national AI compute and critical infrastructure: on-prem Nemotron, self-hosted SpacetimeDB on its own out-of-band network, no data leaving the jurisdiction. |

**Why this becomes a company (real numbers only)**
- **The body is enormous.** McKinsey estimates $6.7 trillion of data-center capex worldwide by 2030, $5.2 trillion of it for AI-ready capacity ([McKinsey](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers)).
- **The beachhead is growing fastest.** Neocloud (GPU-as-a-service) revenue passed $25B in 2025, with Q4 at $9B, up 223% year over year; Synergy forecasts close to $400B by 2031 ([Synergy Research](https://srgresearch.com/articles/neocloud-market-forecast-to-approach-400b-by-2031-driven-by-surging-ai-infrastructure-demand)).
- **The infections are AI-shaped.** One in four malicious breaches was AI-enabled in IBM's 2026 study, costing about $6M on average ([IBM](https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average)). Gartner predicts that by 2028, 25% of enterprise breaches will be traced back to AI agent abuse, and that 40% of CIOs will demand "guardian agents" that track, oversee or contain what AI agents do ([Gartner, republished by CXOToday](https://cxotoday.com/press-release/gartner-unveils-top-predictions-for-it-organizations-and-users-in-2025-and-beyond/)).
- **Wedge, then platform.** Guest-escape response for multi-tenant GPU clouds that run untrusted customer code on shared hardware → the agent firewall for every agent in the building → the cross-cloud immunity network, which gets more valuable with every operator that joins.

**The line to say out loud:** "Today, one host sealed under policy. Next, every breach makes the whole fleet immune."

---

## 12. Sources (checked 8 Nov 2026)

- CISA and FBI, Scattered Spider advisory AA23-320A (16 Nov 2023, revised 29 Jul 2025): https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-320a
- NVD, CVE-2026-47498 (NVIDIA vGPU Manager GSP plugin, CVSS 7.8, published 30 Sep 2026): https://nvd.nist.gov/vuln/detail/CVE-2026-47498 ; NVIDIA bulletin: https://github.com/NVIDIA/product-security/tree/main/2026/5861
- Wiz NVIDIAScape, CVE-2025-23266 (37% estimate): https://www.wiz.io/blog/nvidia-ai-vulnerability-cve-2025-23266-nvidiascape and https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html
- Broadcom VMSA-2025-0004 (VM escape, exploited in the wild): https://www.tenable.com/blog/cve-2025-22224-cve-2025-22225-cve-2025-22226-zero-day-vulnerabilities-in-vmware-esxi
- Anthropic, "Disrupting the first reported AI-orchestrated cyber espionage campaign" (13 Nov 2025): https://www.anthropic.com/news/disrupting-AI-espionage
- CrowdStrike 2026 Global Threat Report (24 Feb 2026): https://www.crowdstrike.com/en-us/press-releases/2026-crowdstrike-global-threat-report/
- Sophos Active Adversary Report 2026: https://www.sophos.com/en-us/press/press-releases/sophos-active-adversary-report-2026-identity-attacks-dominate-as-threat-groups-proliferate
- IBM Cost of a Data Breach 2026 (29 Jul 2026): https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average ; $1.93M savings: https://www.esecurityplanet.com/cybersecurity/ibm-2026-cost-of-a-data-breach-report-key-findings/
- McKinsey, "The cost of compute: A $7 trillion race to scale data centers" (Apr 2025): https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers
- Synergy Research, neocloud forecast (2 Apr 2026): https://srgresearch.com/articles/neocloud-market-forecast-to-approach-400b-by-2031-driven-by-surging-ai-infrastructure-demand
- Gartner top predictions (22 Oct 2024), republished: https://cxotoday.com/press-release/gartner-unveils-top-predictions-for-it-organizations-and-users-in-2025-and-beyond/
- Uptime Institute Annual Outage Analysis 2026 (via ITWeb): https://itweb.africa/article/uptime-announces-annual-outage-analysis-report-2026/WnxpEv4Y6837V8XL
- SEC press release 2023-139 (Form 8-K Item 1.05): https://www.sec.gov/newsroom/press-releases/2023-139
- GDPR Article 33: https://gdpr-info.eu/art-33-gdpr/
- NIST SP 800-61 Rev. 3 (Apr 2025): https://csrc.nist.gov/pubs/sp/800/61/r3/final
- Capital One and Mandiant report ruling (2020): https://www.faegredrinker.com/en/insights/publications/2020/6/disclosure-ordered-of-data-breach-incident-response-report-prepared-for-outside-counsel
- SpacetimeDB (BitCraft runs on one module): https://github.com/clockworklabs/SpacetimeDB
- ICANN .tech registry agreement (Radix): https://www.icann.org/en/registry-agreements/details/tech
- Ollama, Nemotron 3 Nano: https://ollama.com/library/nemotron-3-nano (local check: `ollama list` shows `nemotron-3-nano:4b`, 2.9 GB)
