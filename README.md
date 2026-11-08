# Claura

**Seal the breach before it spreads.** Agentic incident response for AI data centers. When an AI workload tries to
escape its VM, Claura's defender agents (Sentry, Triage, Warden, Scribe) detect it, map the blast radius and contain
it, reversible steps first. A human approves the one high-impact step. Built at HackUTD 2026. Domain: claura.tech.

| Folder | What it is |
|---|---|
| `apps/dashboard` | The operator console (Liquid Glass UI). Scripted demo mode plus a live mode on SpacetimeDB |
| `backend/spacetime` | SpacetimeDB module: incident state, the policy gate (policy, not the model, decides), the live incident log |
| `backend/agents` | Defender agents: NVIDIA Nemotron (local, on-prem via Ollama) driving multi-step tool calls into SpacetimeDB |
| `packages/facility-3d` | 3D data center view (three.js), deterministic so the demo film can render it |
| `apps/site` | Landing page for claura.tech |
| `brand` | Logo, app icon, brand rules |
| `film` | The demo video, built with HyperFrames |
| `docs` | Devpost write-up, pitch, hackathon notes |

Work in progress during the hackathon: each folder's README says what is real and what is demo data.
