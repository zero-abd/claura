# Claura: pitch kit

What to say. How to run the demo while saying it is in [DEMO-FLOW.md](DEMO-FLOW.md).

Format: HackUTD's pitching workshop gives **3 minutes to pitch and 2 minutes for questions**
([source](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md)).
Table judging is often shorter, so be ready to cut to the 30-second version.

## 30-second pitch

> AI agents now run model-written code inside sandbox VMs on shared GPU hosts. If one escapes through the vGPU path,
> it can reach the host and every other tenant on it. Claura is incident response for that moment. Four agents on
> NVIDIA Nemotron, running locally, detect it, size the blast radius and contain it with reversible steps first. They
> can only propose: a policy gate inside SpacetimeDB decides what runs, and quarantining the host waits for a person.
> Agents propose, policy decides.

About 85 words, roughly 30 seconds.

## What is true, in one breath

Use these numbers and no others.

- **Real:** the SpacetimeDB module (tables, the policy gate, human approval), the four agents calling tools on
  Nemotron 3 Nano 4B through Ollama on this laptop, the console's Live view on real rows.
- **Simulated:** the telemetry (six fixture signals), the hosts and guests (seeded), and the effects of containment
  (database rows; nothing touches real infrastructure). The red-team reimage attempt is scripted by the runner and
  labelled as such.
- **The replay:** contained at 9.4 s. It is a scripted timeline.
- **Live on a laptop:** 61–79 s from the first signal to contained in the two logged runs (`backend/runs/`); the
  agents README reports a run of about 34 s. All four agents finished on the model with zero bad tool calls and no fallback in both
  logged runs.
- **Fleet numbers** on the Overview (2,048 hosts, 61,207 agents) are illustrative.

## Track lines (10 seconds each; use the one matching the judge)

- **NMC² (Keep the World Running):** "Your brief names missed warnings, unclear handoffs and wrong information at the
  wrong time. Sentry catches the warning, one incident log in SpacetimeDB is the handoff, and the approval card puts
  evidence, scope and rollback on one screen."
- **NVIDIA (Nemotron beyond a chatbot):** "Nemotron 3 Nano runs locally and never chats. It calls tools in a loop
  with schema checks, retries and a deterministic fallback, and every agent card records whether the model or the
  fallback did the work. In both logged runs the model did all of it."
- **Spacetime:** "The database is the referee. The policy gate is a reducer, agents write only through reducers, and
  the console you just saw is subscribed to the same tables. The rule that quarantine needs a human is one row."
- **Winstead (only if entered):** "Every action records who proposed it and who approved it, and the report is
  written from the database's own log. What it lacks: user administration, in-app chat and an isolated deployment."

## Judge questions

**Is this live?**
The Incident view is a scripted replay; the toolbar says so. The Live view is real: SpacetimeDB rows written by
agents running on Nemotron on this laptop, and its buttons call the real reducers.

**Why agents instead of SOAR playbooks?**
The playbook order is fixed on purpose. The model does what playbooks are bad at: reading six different signal types
as one incident, picking which guests are exposed, and writing the report. Execution stays deterministic, because the
model's only write is a proposal and the policy decides. A wrong answer can only fail safe: a refused proposal, never
a wrong action.

**What if the model is wrong, or picks something destructive?**
Three limits. The policy table rejects unknown actions and denies destructive ones (`reimage_host`, `power_off_hall`,
`delete_vm`). Targets are checked, so a hallucinated host is blocked. And quarantine waits for a person. The reimage
attempt in the demo is scripted by the runner, not chosen by the model, and the runner says so.

**How much did the model actually do?**
Each agent records `model`, `model+fallback`, `fallback` or `scripted`. In both logged live runs all four finished on
the model with zero bad tool calls (`backend/runs/live-run-1.log`, summary table at the end).

**Can't anyone call `approve` with your name?**
Yes, today. `approve` and `set_policy` check the operator name, not the caller's identity. The gate protects against
the model, not against a hostile client. Binding operator identities is the next step. Say this before they find it.

**Could an attacker steer the agents through log text?**
Signals reach the model only as tool results. The worst injected text can do is make the model propose something,
and the policy still decides. The model has no approve tool, so it cannot forge an approval. We have not tested
injection systematically; that is on the list.

**What does a false positive cost?**
Most of the cost is in the automatic steps: failing over 11 guests restarts 11 workloads elsewhere (no live migration
off a suspect host, because that copies memory through the hypervisor we no longer trust). Those steps are reversible,
Triage scores the blast radius first (0.87 here), and the policy can require approval for fail-over too. Un-quarantine
returns the host to the pool. We have not measured the rate.

**9.4 seconds? Really?**
That is the scripted replay. Live on a laptop with a 4B model it takes about a minute, most of it Warden's seven
proposals, one per turn. Both are faster than paging a person at 3 am.

**How is this different from Wiz or CrowdStrike?**
They are detection and posture products: Wiz for cloud configuration and workload risk, CrowdStrike for endpoint
detection. Claura is the response layer for one incident class, a suspected guest-to-host escape on a multi-tenant
GPU host, and it would consume signals like host EDR rather than replace them. We have not built integrations with
either.

**Is VM escape real?**
Yes, and rare. CVE-2021-3546, an out-of-bounds write in QEMU's vhost-user-gpu that
[NVD](https://nvd.nist.gov/vuln/detail/CVE-2021-3546) says can let a malicious guest crash host QEMU or potentially
run code on the host; a Black Hat Asia 2020 guest-to-host escape through a QEMU/KVM virtio device
([slides](https://i.blackhat.com/asia-20/Thursday/asia-20-Shao-3D-Red-Pill-A-Guest-To-Host-Escape-On-QEMUKVM-Virtio-Device.pdf));
two VM escapes at Pwn2Own 2017
([Computerworld](https://www.computerworld.com/article/1667668/pwn2own-ends-with-two-virtual-machine-escapes.html)).
NVIDIA vGPU Manager has had guest-reachable host bugs too; check NVIDIA's security bulletin before naming a CVE.

**What would it take to run this for real?**
Real telemetry (IOMMU faults, VMM audit, EDR, BMC flows) in place of fixtures, effects that call the hypervisor and
network instead of updating rows, and identity on the reducers. The gate and the data model stay.

**How is the War Room kept away from the attacker?**
It is designed as an out-of-band channel on separate infrastructure. In this build it is scripted.

## At the table

- Open with the problem, not your names. Say "Agents propose, policy decides" once, at the end.
- Say "replay" before showing the replay. Judges who find out later discount everything else.
- Point at one thing at a time. Don't read the screen aloud.
- Two people: one talks, one drives.
- Rehearse the failure case too: Ollama down, console disconnected, judge arriving mid-run.
