# Claura: six slides (exact copy)

Use this copy word for word. One idea per slide, with the live console doing the rest. Footnote sources go in small type at the bottom of the slide they support.

---

## Slide 1: Title

**Claura**
The immune system for AI data centers.

*Your network is compromised. Your command isn't.*

Footer: claura.tech · github.com/zero-abd/claura · HackUTD 2026

---

## Slide 2: The problem

**2 a.m. The attacker is reading your email.**

- Ransomware has the file share. The phones are down.
- Attackers join their victims' incident calls.¹
- One customer's AI workload breaks out of its virtual machine, toward a GPU server it shares with eleven other companies.²
- Six warnings in six tools. No playbook. Nobody has the whole picture.
- The fastest breakout on record took 27 seconds.³

Footnotes: ¹ CISA AA23-320A (Scattered Spider). ² CVE-2026-47498, a guest-triggerable flaw in NVIDIA vGPU Manager, NVD, Sep 2026. ³ CrowdStrike 2026 Global Threat Report.

---

## Slide 3: How Claura contains the machine

**Agents propose. Policy decides. A human approves.**

- **Sentry** correlates the signals and opens the incident.
- **Triage** checks inventory and reachability: one host, eleven neighbors.
- **Warden** proposes containment, reversible steps first.
- **Scribe** writes the brief and the shift handoff.

All four run NVIDIA Nemotron on-prem and call tools step by step. Every proposal hits a policy gate in a SpacetimeDB reducer: **auto · needs approval · denied.** A blocked proposal is recorded and never applied. Quarantine waits for one human: evidence, scope, rollback, one card, ⌘↵.

---

## Slide 4: Command from outside the crime scene

**Built to the five requirements of an incident command center.**

| | |
|---|---|
| **Isolated** | Hosted outside your network, with its own identities. No corporate SSO, email or phones. |
| **Access control** | The admin adds people with single-use break-glass codes. Every change is audited. |
| **Documentation** | Structured to NIST SP 800-61. Live phase status, SHA-256 chain of custody, PDF export. |
| **Data scope** | Every asset: intact · accessed · exfil suspected · exfil confirmed · locked by ransomware · restored · evidence preserved. |
| **Real-time comms** | War Room channels, a plain-language brief ("what we know / what we don't know yet"), tasks, a decision log. |

Plus **Secure Shell:** click a host for a short-lived OpenSSH certificate, a CA-verified host, Touch ID, a second approver, read-only forensics, every session recorded.

---

## Slide 5: Under the hood

**One live record. Every screen.**

- **SpacetimeDB on Maincloud** is the backend: incident state, identities and roles, the policy gate, War Room, data scope, documentation. Every console subscribes live.
- **NVIDIA Nemotron 3 Nano**, local through Ollama: four agents, nine tools. One logged live run: 15 turns, 14 tool calls, zero malformed.
- **Claura SSH CA:** user and host certificates, passkeys, a hash-chained session ledger.

*Live:* console, database, agents, policy gate, certificate flow. *Simulated:* the attack telemetry (a replay), the containment effects, the target hosts. *Illustrative:* 9.4 s, 2,048 hosts, 61,207 sandboxes.

---

## Slide 6: The vision (roadmap)

**Next: an immune system for every AI cloud.**

- Autonomous recovery: reimage, re-attest, return to the pool.
- Containment in the DPU (NVIDIA BlueField), below the hypervisor.
- Confidential-computing attestation before any tenant fails over.
- Signed proof of containment for insurers, auditors and regulators.
- Cross-cloud threat sharing on SpacetimeDB: one fleet's breach inoculates every fleet.
- Sovereign, air-gapped defense for national AI compute.

$6.7T of data-center capex by 2030.⁴ Neocloud revenue passed $25B in 2025.⁵ The average breach costs $4.99M.⁶

**Every breach makes the whole fleet immune.**

Footnotes: ⁴ McKinsey, Apr 2025. ⁵ Synergy Research, Apr 2026. ⁶ IBM Cost of a Data Breach 2026.
