# Claura: demo video script

Target: under 2:00 total. Narration 262 words, 29 lines, one idea per line. At the pace of our last TTS take (about 212 words in 88 s, roughly 145 words a minute) that is about 108 s of speech, plus about 4 s of holds (the Command-Enter beat and the end card), so about 112 s on the timeline. Line 1 lands in about 2 s.

Rules for the edit:
- Real console footage from line 3 onward. Lines 1 and 2 are motion graphics.
- Burn in captions.
- Lower-third on the first UI shot (line 3), held 3 s: **"Simulated attack replay · illustrative numbers · live software"**.
- Tag the 9.4 s counter **"Illustrative demo number"**. Tag the vision shot **"Roadmap"**.
- Make sure the "red-team probe" label is readable on the blocked `reimage_host` row (line 14): the probe comes from our test harness, not from Nemotron.
- Tag the containment shots (lines 12 and 17) "Simulated effect": the plan changes state in SpacetimeDB, not on real hosts.
- Voice ("Ask Claura") is not in this video.

---

## 1. Narration

1. The attacker is reading your email.
2. Your phones are down. Ransomware has the file share.
3. In your data center, an AI workload is breaking out of its virtual machine.
4. An IOMMU fault. A GPU driver fault. A shell where no shell should be.
5. Six warnings in six tools. No playbook for this attack.
6. Nobody has the whole picture.
7. This is Claura, the immune system for AI data centers.
8. Its command center runs outside your network, with its own identities.
9. Its agents run NVIDIA Nemotron on-prem, calling tools step by step.
10. Sentry connects the signals and opens the incident.
11. Triage checks inventory and reachability: one host, eleven neighbors.
12. Warden proposes containment, reversible steps first.
13. Every proposal hits a policy gate. Policy, not the model, decides.
14. Our red-team probe tries to reimage the host. Denied.
15. Quarantine needs a human. Evidence, scope, rollback, one card.
16. Command-Enter.
17. Contained. Nine point four seconds, in our simulation.
18. Then the people.
19. The War Room puts legal, executives and engineers in one live channel.
20. Scribe's brief: what we know, and what we don't know yet.
21. Outside counsel joins with a single-use break-glass code. No email. No SSO.
22. Data scope tracks every asset: intact, exfiltrated, or locked by ransomware.
23. The record follows NIST, with live phase status and a hashed chain of custody.
24. Need hands on a host? Click it.
25. A short-lived certificate, Touch ID, a second approver. Every session recorded.
26. And every screen updates live, through SpacetimeDB subscriptions.
27. Next: an immune system for every AI cloud, sharing attack fingerprints, never tenant data.
28. Claura.
29. Your network is compromised. Your command isn't.

**Word count: 262.**

---

## 2. Shot list

| # | Line (short) | Screen / feature | On screen and notes |
|---|---|---|---|
| 1 | The attacker is reading your email. | Motion graphic | Black frame. An email subject types itself ("INC bridge: dial-in details") and a read tick appears. Lands by 0:02. |
| 2 | Phones down, ransomware has the file share | Motion graphic | A desk phone glyph, "No service". A file-share card stamped LOCKED. |
| 3 | An AI workload is breaking out | **Overview 3D** | Camera pushes into Hall B; one rack pulses amber. Lower-third: "Simulated attack replay · illustrative numbers · live software". |
| 4 | IOMMU fault, GPU driver fault, a shell | **Incident** | The signal stream fills: IOMMU DMA fault, vGPU mdev fault, qemu spawned /bin/sh. |
| 5 | Six warnings in six tools; no playbook | **Incident** | Six signal rows from six different sources, not yet joined. |
| 6 | Nobody has the whole picture | **Overview 3D** | Wide shot: a calm hall with one amber rack. |
| 7 | This is Claura | Brand | The mark: the seal bar closes the ring. "The immune system for AI data centers". |
| 8 | Command center outside your network, own identities | **War Room** | The banner "Out-of-band channel · not on the corporate network" and the line "6 of 6 identities verified". 2 s. |
| 9 | Nemotron on-prem, tools step by step | **Agents trace** | The model tag (`nemotron-3-nano:4b`, local); tool calls streaming in. |
| 10 | Sentry opens the incident | **Agents trace** | Sentry: `list_recent_signals` then `open_incident`; the incident header turns red. |
| 11 | Triage: one host, eleven neighbors | **Incident** | `get_host_inventory` returns 11 guests, `check_reachability` shows the management port; the attack path lights the 11 neighbors. |
| 12 | Warden, reversible steps first | **Incident** | The containment plan ticks: isolate network, revoke credentials, cordon, pause, capture memory, fail over. |
| 13 | Policy, not the model, decides | **Agents trace** (or the Policy view) | Each proposal with its ruling: auto, needs approval, denied. |
| 14 | Our red-team probe tries to reimage the host. Denied. | **Agents trace** (or the Policy view) | The red row `reimage_host · denied`, with "red-team probe" readable. |
| 15 | Quarantine needs a human, one card | **Approval sheet** | It slides up; push in on Evidence, Scope, Rollback. |
| 16 | Command-Enter | **Approval sheet** | A ⌘↵ key-press overlay; half-second hold. |
| 17 | Contained, 9.4 s in our simulation | **Overview 3D** | The counter stops at 9.4 s, tagged "Illustrative demo number"; the rack turns sealed. |
| 18 | Then the people | **War Room** | The room opens. |
| 19 | Legal, execs, engineers, one live channel | **War Room** | Channels #command, #legal, #exec, #comms-pr, #vendors; messages arriving. |
| 20 | What we know, what we don't know yet | **War Room** | Scribe's brief card, both columns readable. |
| 21 | Single-use break-glass code | **People & Access** | Add person → Outside counsel → the single-use code appears; the access row lands in the audit log. |
| 22 | Intact, exfiltrated, locked by ransomware | **Data scope** | The asset table with status chips; push in on "locked by ransomware" and the exfiltration chips (suspected, confirmed). |
| 23 | Follows NIST, live phase status, chain of custody | **Reports / NIST** | The phase bar with live status, chain-of-custody rows with SHA-256 hashes, then Export PDF. |
| 24 | Click a host | **Overview 3D** | The cursor clicks b14-gpu-07; the host card opens; "Open secure shell". |
| 25 | Short-lived certificate, Touch ID, second approver, recorded | **Secure Shell** | Touch ID prompt, the second approver on another console, the "read-only forensic mode" banner, the certificate expiry, the hash-chained ledger. |
| 26 | Every screen updates live, SpacetimeDB subscriptions | **Two consoles syncing** | Side by side: a message sent on the right lands on the left; status flips on both. |
| 27 | Next: immune system for every AI cloud, sharing fingerprints, never tenant data | Motion graphic | Tag "Roadmap" for the whole shot. Several data-center outlines linked by thin lines; a fingerprint glyph travels from one to all, labelled "no tenant data". |
| 28 | Claura. | Brand | The mark, centred. |
| 29 | Your network is compromised. Your command isn't. | **End card** | Claura · "The immune system for AI data centers" · the tagline · claura.tech · github.com/zero-abd/claura · "Simulated attack · illustrative numbers". Hold 3 s. |

---

## 3. vo.txt (paste as-is into TTS)

Respelled for TTS: I. O. M. M. U., G. P. U., S. S. O., N. I. S. T., Spacetime D. B.

```text
The attacker is reading your email.
Your phones are down. Ransomware has the file share.
In your data center, an AI workload is breaking out of its virtual machine.
An I. O. M. M. U. fault. A G. P. U. driver fault. A shell where no shell should be.
Six warnings in six tools. No playbook for this attack.
Nobody has the whole picture.
This is Claura, the immune system for AI data centers.
Its command center runs outside your network, with its own identities.
Its agents run NVIDIA Nemotron on-prem, calling tools step by step.
Sentry connects the signals and opens the incident.
Triage checks inventory and reachability: one host, eleven neighbors.
Warden proposes containment, reversible steps first.
Every proposal hits a policy gate. Policy, not the model, decides.
Our red-team probe tries to reimage the host. Denied.
Quarantine needs a human. Evidence, scope, rollback, one card.
Command-Enter.
Contained. Nine point four seconds, in our simulation.
Then the people.
The War Room puts legal, executives and engineers in one live channel.
Scribe's brief: what we know, and what we don't know yet.
Outside counsel joins with a single-use break-glass code. No email. No S. S. O.
Data scope tracks every asset: intact, exfiltrated, or locked by ransomware.
The record follows N. I. S. T., with live phase status and a hashed chain of custody.
Need hands on a host? Click it.
A short-lived certificate, Touch ID, a second approver. Every session recorded.
And every screen updates live, through Spacetime D. B. subscriptions.
Next: an immune system for every AI cloud, sharing attack fingerprints, never tenant data.
Claura.
Your network is compromised. Your command isn't.
```
