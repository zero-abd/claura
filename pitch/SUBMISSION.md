# Claura: Devpost submission checklist

Hard deadline: **Sunday 8 Nov, 12:00 pm CST.** Aim to press Submit by **11:30**, then re-open the public page while logged out and click every link. The project stays editable until the deadline.

---

## 1. Fields

| Field | Paste this |
|---|---|
| Project name | Claura |
| Tagline | Your network is compromised. Your command isn't. |
| Elevator pitch | The immune system for AI data centers: on-prem NVIDIA Nemotron agents contain a breached GPU host under policy, while an isolated command center keeps every human on one live record. |
| Description | `DEVPOST.md`, from "Inspiration" through "Built with". Keep the "What's live and what's simulated" box at the top. |
| Built with | spacetimedb, maincloud, nvidia-nemotron, nemotron-3-nano, ollama, typescript, node.js, vite, three.js, openssh, webauthn, simplewebauthn, xterm.js, express, websockets, hyperframes |
| Try it out | https://claura.tech (landing page) plus the console URL if it's publicly reachable. Test both in a private window. |
| Code repository | https://github.com/zero-abd/claura (must be **public**) |
| Video | Public or unlisted YouTube link to the video built from `VIDEO-SCRIPT.md`, under 2:00. It must play while logged out. |
| Team | Invite every teammate (anyone not on the project isn't prize-eligible) and list each person's school. |
| Spacetime access code | Paste the code from the Spacetime booth wherever the form or the Spacetime track asks for it. No code means no Spacetime prize. |

---

## 2. Tracks to tick

Devpost allows **three sponsor tracks**, plus one HackUTD track. Everyone is automatically in the General Track.

**Recommendation: Winstead PC + Spacetime + NVIDIA. Drop NMC².**

| Track | Tick? | Why |
|---|---|---|
| **Winstead PC: Cyber Incident Response Dashboard** | **Yes** | The closest fit we have. We built to all five required components (isolated system, admin-managed access, standards-based documentation with live status, data scope with status, real-time comms) and to the organizer's "attacker sees normal comms, phones down" scenario. Cash prize ($1,500 for first), and a niche brief means fewer direct competitors. |
| **Spacetime: Build on Spacetime** | **Yes** | Nearly the whole backend is SpacetimeDB on Maincloud (state, identities, policy gate, War Room, data scope, documentation), and the demo proves it on two screens. It's the largest cash prize of the four ($2,048 for first). It requires a public repo and the booth access code. |
| **NVIDIA: Use Nemotron Beyond a Chatbot** | **Yes** | Nemotron is the reasoning core: four agents, nine tools, a multi-step loop gated by policy, running on-prem. Logged live runs back it up (15 turns, 14 tool calls, zero malformed). Prize: RTX 5080 GPUs. |
| NMC²: Keep the World Running | No (the one we drop) | It fits the story (missed warnings, handoffs, right information at the right time), and the pitch still hits those beats for any NMC² judge we meet. But it has no technology gate, so it rewards the story alone, against the widest field. Of the four it adds the least to our odds. |

**Contingency (decide at 11:15):** if the live Nemotron path is unreliable on the venue network and we'd be demoing the replay at every table, swap **NVIDIA → NMC²**, and change the "Tracks" line at the top of `DEVPOST.md` to match.

**HackUTD track (one only):** **Best Design.** The Liquid Glass console and the clickable 3D data center are our most visual asset.

---

## 3. MLH prizes

| Prize | Enter? | Note |
|---|---|---|
| **Best Domain Name from GoDaddy Registry** | **Only after MLH confirms** | claura.tech is live and on-brand, but ICANN lists **Radix**, not GoDaddy Registry, as the .tech registry ([ICANN](https://www.icann.org/en/registry-agreements/details/tech)). Ask at the MLH table before 11:30. If .tech doesn't qualify, register a Claura name on a GoDaddy Registry extension through MLH's free-domain offer, point it at claura.tech, and enter that domain. |
| Best Use of ElevenLabs | Only if "Ask Claura" ships | Enter only if voice works end to end on venue Wi-Fi by 11:30, with the API key kept server-side. Otherwise leave it unticked. Voice is not in the video. |
| Best Use of Solana | **No** | Evidence anchoring isn't built. Don't claim it. |
| Gemini, Vultr, DigitalOcean | No | Not in the build. |

---

## 4. Video

- [ ] Built from `VIDEO-SCRIPT.md`: 262-word narration, about 1:52 on the timeline. Use the `vo.txt` block for TTS.
- [ ] Lower-third "Simulated attack replay · illustrative numbers · live software" on the first UI shot; "Simulated effect" on the containment shots; "Illustrative demo number" on the 9.4 s counter; "red-team probe" readable on the blocked row; "Roadmap" on the vision shot.
- [ ] Captions burned in. End card holds 3 s with claura.tech and github.com/zero-abd/claura.
- [ ] Uploaded as public or unlisted; plays in a private window; the link is pasted into Devpost.

## 5. Repo

- [ ] github.com/zero-abd/claura is public, and the README says what is live and what is simulated (it links each folder's README).
- [ ] No secrets in the code or the history: the ElevenLabs key and any tokens are server-side, `.env` is ignored, and no private SSH CA keys are committed.
- [ ] Run instructions for the console, the SpacetimeDB module (Maincloud), the agent runner (Ollama + `nemotron-3-nano:4b`) and the SSH gateway.
- [ ] `backend/runs/` logs stay in the repo. They're the evidence behind "15 turns, 14 tool calls".

## 6. Screenshots (gallery order)

The first image is the thumbnail, so it must read at small size.

1. **Incident with the approval card up** (thumbnail): attack path, agents busy, "Quarantine b14-gpu-07?" with evidence, scope, rollback.
2. **Overview:** the 3D data center with the amber host in Hall B.
3. **Agents trace:** tool calls with the `nemotron-3-nano:4b · local` tag.
4. **Policy ruling:** auto / needs approval / denied, with the blocked `reimage_host` red-team row.
5. **War Room:** channels, Scribe's brief ("what we know / what we don't know yet"), tasks, decision log.
6. **People & Access:** a single-use break-glass enrollment code being issued, and the audit row.
7. **Data Scope:** assets with status chips (locked by ransomware, exfil suspected, intact, evidence preserved).
8. **Reports:** NIST SP 800-61 phase status, the SHA-256 chain of custody, Export PDF.
9. **Secure Shell:** Touch ID step-up, second approver, read-only forensic banner, certificate expiry.
10. **Two consoles side by side,** showing the same incident state.

## 7. Final pass (11:30)

- [ ] Every sentence in the description matches what's live. The "What's live and what's simulated" box is intact.
- [ ] The tracks ticked match the "Tracks" line in the description.
- [ ] Spacetime access code entered.
- [ ] Press **Submit**, not just Save. Re-open the public page logged out and check the video, repo and try-it links.
- [ ] Then stop building. Rehearse `FINAL-PITCH.md` section 5 twice with a timer, and run the section 0 truth check at 12:45.
