# Claura

**Tagline:** Your network is compromised. Your command isn't.

**Elevator pitch (short field):** The immune system for AI data centers: on-prem NVIDIA Nemotron agents contain a breached GPU host under policy, while an isolated command center keeps every human on one live record.

**Links:** Try it: https://claura.tech · Code: https://github.com/zero-abd/claura · Video: [paste the public link]

**Tracks:** Winstead PC (Cyber Incident Response Dashboard) · Spacetime (Build on Spacetime) · NVIDIA (Use Nemotron Beyond a Chatbot). Built with NMC²'s "Keep the World Running" problems in mind too: missed warnings, unclear handoffs, wrong information at the wrong time.

> **What's live and what's simulated.** Live: the console, the SpacetimeDB module on Maincloud (database `claura`: all incident state, identities and roles, the policy gate, War Room, data scope, documentation), four agents driven by Nemotron running locally, and the Secure Shell certificate flow. Simulated: the attack telemetry is a replayed fixture, containment changes state in the database rather than touching real hypervisors, and the shell targets are real OpenSSH daemons in sandboxes standing in for GPU hosts. Evidence anchoring on Solana devnet is built and tested, but our devnet wallet is not funded yet, so the console shows "Simulated anchor" and writes nothing to the chain (pending funding). The 9.4 s of the scripted replay, 2,048 hosts and 61,207 agent sandboxes on screen are illustrative. Measured, on a laptop with a local 4B model against Maincloud: live runs took about 38 to 50 s from first signal to contained, a human approval included, and a click on one console reached the other's screen in about 335 ms.

---

## Inspiration

Winstead's track brief asked us to assume the worst: the attacker can see normal communications, ransomware has locked the data, phones are down, email is sporadic, and nobody has information. That isn't paranoia. CISA and the FBI document a crew, Scattered Spider, that searches victims' Slack, Teams and Exchange for conversations about the response and "frequently join[s] incident remediation and response calls" ([CISA AA23-320A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-320a)). Every tool in a normal response (the SIEM, the tickets, the chat, the bridge call, the runbook on the file share, the long-lived SSH keys) lives on the network the attacker owns. You don't investigate in front of the suspect.

Then we put that night inside an AI data center. A GPU host there carries many customers' workloads, and the wall between them is software that cracks. On 30 Sep 2026 NVIDIA disclosed CVE-2026-47498, which lets a user inside a guest VM trigger an out-of-bounds write in the host's vGPU Manager ([NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-47498)). A year earlier, Wiz's NVIDIAScape showed a three-line Dockerfile taking root on a GPU host ([The Hacker News](https://thehackernews.com/2025/07/critical-nvidia-container-toolkit-flaw.html)). The attackers are speeding up too: in a campaign Anthropic disrupted, AI did 80 to 90 percent of the work ([Anthropic](https://www.anthropic.com/news/disrupting-AI-espionage)), and the fastest breakout CrowdStrike recorded in 2025 took 27 seconds ([CrowdStrike](https://www.crowdstrike.com/en-us/press-releases/2026-crowdstrike-global-threat-report/)).

So we set three rules. The first responder has to be a machine. The last word has to be a human. Everything in between has to be policy. And the command post has to live outside the crime scene.

## What it does

Claura is the immune system for AI data centers. It turns a scattered attack into one incident, one policy-gated containment decision and one live record for every responder. In our demo scenario, one customer's AI workload tries to break out of its virtual machine toward the shared GPU host where eleven other tenants are working. Claura's agents detect it in the replayed telemetry, map the blast radius and propose containment; policy and one human approval decide what happens; and every stakeholder coordinates and documents the response in a command plane hosted outside the compromised network.

**The machine side**
- **Overview.** A real-time 3D data center you can click: halls, racks and hosts, with the suspect host lighting up.
- **Four defender agents on NVIDIA Nemotron, on-prem.** In plain terms, they connect the clues, measure who could be affected, recommend a safe response and write the handoff. Sentry correlates six weak signals (an IOMMU fault, a vGPU driver fault, qemu spawning a shell, a flow to the management port and more) and opens the incident. Triage queries host inventory and reachability and records the blast radius: one host, eleven co-resident neighbors. Warden proposes containment, reversible steps first: isolate the network, revoke credentials, cordon the host, pause the guest, capture memory, fail the neighbors over to clean hosts. In the demo these effects are recorded as state in SpacetimeDB rather than executed on real infrastructure. Scribe writes the plain-language brief and the shift handoff.
- **A policy gate the model can't talk its way past.** Every agent action is a proposal to a SpacetimeDB reducer, which rules from the policy table: auto, needs approval, or denied. Unknown actions and hosts that don't exist fail closed. A labelled red-team probe from our test harness (not Nemotron) asks to reimage the host, and the gate blocks it. Policy, not the model, decides.
- **One human step.** Quarantining the host needs a person: evidence, scope and rollback on one card, approved with Cmd+Enter.

**The human side (Winstead's five requirements)**

| Requirement | What Claura does |
|---|---|
| Highly secure, isolated inside a compromised network | The command plane is hosted outside the corporate network, on SpacetimeDB, and needs no corporate SSO, email or phones. Approvals and admin actions are identity-checked in the reducers: only admins can add people or change policy. |
| Access control, admin adds individuals | **People & Access:** the admin adds someone (outside counsel, say) with a role by issuing a single-use break-glass enrollment code. No email, no phone, no SSO. The access event lands in the audit log. |
| Documentation to incident standards, real-time status | **Reports:** the incident record is structured to NIST SP 800-61, with live phase status, a SHA-256 chain of custody for evidence, and a PDF export for counsel to review. |
| Scope of compromised data and its status | **Data Scope:** every data asset carries a status: intact, accessed, exfiltration suspected, exfiltration confirmed, locked by ransomware, restored, or evidence preserved. |
| Real-time communications | **War Room:** channels for #command, #legal, #exec, #comms-pr and #vendors; Scribe's brief ("what we know / what we don't know yet"); tasks with owners; a decision log recording who decided what, and when; example notification clocks labelled "confirm with counsel". Every console updates live. The admin controls enrollment; counsel, not the channel name or the software, decides privilege and distribution. |

**Secure Shell.** Click a host and Claura's own SSH certificate authority mints a just-in-time OpenSSH user certificate that expires within minutes. The host presents a CA-signed host certificate, so there's no trust-on-first-use. A passkey or Touch ID step-up is required, a suspect host needs a second approver and accepts only a read-only forensic principal, and every session is recorded into a hash-chained ledger.

**Also built, outside the two-minute demo.** *Ask Claura* is push-to-talk voice in the console: local Nemotron answers from the incident record and ElevenLabs speaks it (read-only: it can't approve anything, and it runs in mock mode without a key). *Evidence anchoring* writes the SHA-256 of the incident record to a Solana **devnet** Memo transaction and can re-read the chain to verify it. The code and its checks are done; the live send is pending devnet funding, so until then the console labels the anchor "Simulated", shows no Explorer link and keeps it out of the PDF.

## How we built it

```
 ON-PREM (next to the hardware)                      OUT-OF-BAND (outside the corporate network)

 Agent runner (Node + TypeScript)  ── reducers ──▶   SpacetimeDB module on Maincloud
   Nemotron 3 Nano 4B via Ollama   ◀─ subscribe ──     tables: hosts, guests, signals, incidents,
   Sentry · Triage · Warden · Scribe                   findings, proposals, policy, operators, roles,
                                                       War Room messages, data scope, evidence, reports
 Secure Shell gateway                                  reducers: policy gate, approvals, access
   SSH CA · passkeys · session ledger                  control, documentation
                                                               ▲
                                                               │ live subscriptions
                                                     Liquid Glass consoles (every operator, every device)
```

- **SpacetimeDB is the backend.** One TypeScript module on Maincloud (database `claura`; 18 tables, 18 role-gated views, 24 reducers) holds every piece of incident state, plus operator identities, roles and the War Room. The policy gate lives in the `propose_action` reducer: in one transaction it reads the policy row and validates the target, then commits the proposal as executed, pending approval, or blocked. A blocked proposal stays in the record for audit and live sync, but its action is never applied. Admin-only reducers handle enrollment and policy changes, and every console is a live subscription, which is how two laptops show the same incident at the same moment. The only processes outside SpacetimeDB are the two that must sit next to hardware: the on-prem agent runner and the SSH gateway.
- **Nemotron agents, beyond a chatbot.** A Node and TypeScript runner drives NVIDIA Nemotron 3 Nano (`nemotron-3-nano:4b`, 2.9 GB) through Ollama on local hardware. No model API sits in the loop. Four agents share twelve tools (`list_recent_signals`, `open_incident`, `get_host_inventory`, `check_reachability`, `record_finding`, `record_scope`, `get_policy`, `propose_action`, `list_events`, `set_brief`, `file_report`, `post_handoff`), and every effect is a reducer call. The loop has real guardrails: JSON-schema validation of every argument, one retry with the error fed back to the model, stall detection, step and time limits, completion judged by database state rather than by the model's say-so, and a deterministic fallback per agent. Every output is tagged `model`, `model+fallback` or `fallback`, so you can always see what Nemotron did.
- **The console.** TypeScript and Vite, with a Liquid Glass design and progressive disclosure: calm when nothing is wrong, one card when it needs you. The 3D data center is three.js and deterministic, so the film and the live view match.
- **Secure Shell.** A Node, Express and WebSocket gateway with xterm.js in the browser, passkeys through SimpleWebAuthn, and OpenSSH certificates signed by `ssh-keygen`: one principal per user certificate and a 15-minute maximum. Each target `sshd` accepts only the principals in its `AuthorizedPrincipalsFile` (no keys, no passwords), and presents a host certificate signed by Claura's host CA, which the client trusts instead of trusting on first use. The session ledger chains each entry to the previous one with SHA-256, so editing history breaks every hash after it.
- **Brand and film.** claura.tech and the mark (a C-shaped aura ring whose seal bar closes the gap), and a demo film built with HyperFrames.

## Challenges we ran into

- **Making a 4B model a reliable tool user.** Early runs produced malformed arguments and early stops. Schema checks with readable errors, a single retry, and judging "done" from the database fixed it. In one live run Nemotron wrote a finding shorter than the minimum, was told why, and fixed it on the retry.
- **Honesty about the forbidden action.** We wanted to show the gate refusing a destructive step. Across four prompt variants, Nemotron never proposed one on its own. So the demo doesn't attribute it to the model: a clearly labelled red-team probe from our test harness submits it to the same policy gate, and the gate blocks it (details in `backend/agents/README.md`).
- **Isolation without the usual identity stack.** If SSO, email and phones are compromised, you can't use them to invite people. Single-use break-glass enrollment codes and identities held in SpacetimeDB solved it.
- **SSH without trust-on-first-use.** That meant a host CA as well as a user CA, short certificate lifetimes, and a principal model where a suspect host accepts only the read-only forensic role.
- **Data scope is not infrastructure scope.** "One host, eleven guests" says nothing about whether a dataset was encrypted or copied. We modelled data assets and their status separately.

## Accomplishments that we're proud of

- The decision loop runs live on a laptop: in one logged run Nemotron made 15 turns and 14 tool calls (Sentry, Triage and Warden; 19 and 18 with Scribe) with zero malformed calls, every proposal was ruled by the policy gate, and after a human approval the simulated containment state committed in SpacetimeDB (`backend/runs/`).
- Measured, not imagined: in our dress-rehearsal live runs (Maincloud, a 4B model on a laptop) the breach showed on screen about 8 s after the start and the approval card at a median of about 45 s. First signal to contained took about 38 to 50 s with a human approval, and the time-to-contain counter read 33 to 47 s. Scribe's brief landed about 21 s after the approval and the filed report about 33 s after it. The 9.4 s on the scripted replay is a demo clock, and we label it as one.
- Changing one policy row changes behavior with no code change: set quarantine to auto and the same proposal executes with no human; set it back and it waits (verified end to end, `backend/spacetime/README.md`).
- All five Winstead requirements in one console, usable under stress: one card, one keystroke, one plain-language brief.
- Two consoles, one truth, with no refresh: a War Room message or an approval on one console reached the other's screen in about 335 ms against Maincloud (`apps/dashboard/shots/live-run.json`).
- Real OpenSSH certificates and a tamper-evident session ledger behind a single click.

## What we learned

- **Policy, not the model, decides.** A deterministic gate is what makes a small, local model safe to act on production systems.
- **Incident response is a coordination problem.** Detection gets the headlines, but the night is lost when people can't talk safely or can't agree on what's true. The communications plane has to sit outside the blast radius.
- **Plain language is a security feature.** "What we know / what we don't know yet" stops guessing from spreading.
- **Label the simulated parts.** It cost us nothing, and it makes everything we show live more believable. The same goes for numbers: the replay's 9.4 s is a demo clock, while the live console shows the real one, 33 to 47 s on a laptop with a local model, and we'd rather show the real one.

## What's next for Claura

All of this is roadmap and not built yet. (Ask Claura voice and the Solana devnet anchor are built; see "What it does".)

- **Real senses:** hypervisor, IOMMU, vGPU, EDR, BMC and identity connectors, with design partners measuring time-to-contain and false-positive rates to replace our illustrative numbers.
- **The agent firewall:** the same policy gate in front of every AI agent's tool calls in the building.
- **Voice beyond the console:** "Ask Claura" works today inside the console. Next is reaching an executive on a phone call or a mobile device, away from the screen, with the same read-only answers from the incident record.
- **Autonomous recovery:** reimage, re-attest and return hosts to the pool, with a human signing once.
- **DPU enforcement:** containment on NVIDIA BlueField-class DPUs, below the hypervisor, so a compromised host can't undo its own quarantine.
- **Confidential-computing attestation:** prove a destination host and GPU are clean before any tenant fails over onto it.
- **Insurance and compliance evidence:** signed proof-of-containment packs for auditors, regulators and cyber insurers.
- **Cross-cloud threat sharing on SpacetimeDB:** operators exchange signed "antibodies" (escape fingerprints and policy rules, never tenant data), so every breach makes the whole fleet immune.
- **Sovereign on-prem defense:** an air-gapped edition with on-prem Nemotron and self-hosted SpacetimeDB for national AI compute and critical infrastructure.

Why it matters: McKinsey projects $6.7 trillion of data-center capex by 2030, $5.2 trillion of it for AI ([McKinsey](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-cost-of-compute-a-7-trillion-dollar-race-to-scale-data-centers)). The customers we want first, multi-tenant GPU clouds, passed $25 billion in revenue in 2025, and Synergy forecasts close to $400 billion by 2031 ([Synergy Research](https://srgresearch.com/articles/neocloud-market-forecast-to-approach-400b-by-2031-driven-by-surging-ai-infrastructure-demand)). We haven't validated pricing yet; customer discovery with GPU-cloud operators is the next step. The average breach now costs a record $4.99 million ([IBM via Baker Donelson](https://www.bakerdonelson.com/ten-takeaways-from-ibms-2026-cost-of-a-data-breach-report)).

## Built with

spacetimedb · maincloud · nvidia-nemotron · nemotron-3-nano · ollama · typescript · node.js · vite · three.js · openssh · webauthn · simplewebauthn · passkeys · xterm.js · express · websockets · elevenlabs · hyperframes
