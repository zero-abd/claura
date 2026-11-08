# Claura: Devpost submission checklist

Hard deadline: **Sunday 8 Nov, 12:00 pm CST.** Aim to press Submit by **11:30**, then re-open the public page while logged out and click every link. The project stays editable until the deadline.

---

## 0. Only the owner can do these (in this order)

1. **Video.** Upload `/Users/abd/Downloads/Claura/Claura-demo.mp4` (1:58, 1080p, 113 MB) to YouTube; unlisted is fine. If the upload is slow, `Claura-demo-720p.mp4` in the same folder is 12 MB. Set `/Users/abd/Downloads/Claura/Claura-thumbnail.png` (1920 x 1080) as the thumbnail. Open the link in a private window: it must play logged out.
2. **Paste the video link** into the Devpost "Video demo link" field and into the `Demo video: <YouTube link>` line near the top of `README.md` (replace `<YouTube link>`, and drop the two backslashes). For consistency also replace `[paste the public link]` in the `Links:` line of `pitch/DEVPOST.md` and its copies `docs/DEVPOST.md` and `~/repos/bulkhead/docs/DEVPOST.md` (keep the three identical).
3. **Spacetime booth access code:** paste it wherever the form or the Spacetime track asks. No code means no Spacetime prize.
4. **Team:** invite every teammate to the Devpost project and confirm each one has accepted, with a school listed. Anyone not on the project isn't prize-eligible.
5. **Repo:** from `~/repos/claura` run `npm run push` (it snapshots the component folders, runs the secret scan, commits and pushes). Then open https://github.com/zero-abd/claura logged out: it must be public and the README must render the screenshots.
6. **Optional, 30 seconds, only if you want the MLH Solana prize:** open https://faucet.solana.com (sign in with GitHub, pick Devnet), paste the PUBLIC address `GawzFG3iwB1yP2eXpF25emn4CU7VWAGFy5MfQQs1PbUN`, request 1 devnet SOL, then run `cd ~/repos/claura/integrations/solana-anchor && npm run smoke`. It anchors one hash for real and prints the signature and the Explorer link. Only then: tick the MLH Solana prize, add `solana` to "Built with", and in the description's "What's live and what's simulated" box replace the sentence that says the anchor is simulated and pending funding with: "Evidence anchoring writes the record's SHA-256 to a Solana devnet Memo transaction (real signature, Explorer link)." Until that works, leave Solana unticked and the box as it is.

---

## 1. Fields

| Field | Paste this |
|---|---|
| Project name | Claura |
| Tagline | Your network is compromised. Your command isn't. |
| Elevator pitch | The immune system for AI data centers: on-prem NVIDIA Nemotron agents contain a breached GPU host under policy, while an isolated command center keeps every human on one live record. |
| Description | `DEVPOST.md`, from "Inspiration" through "Built with". Keep the "What's live and what's simulated" box at the top, with its Maincloud database name (`claura`), the measured live numbers and the Solana status. |
| Built with | spacetimedb, maincloud, nvidia-nemotron, nemotron-3-nano, ollama, typescript, node.js, vite, three.js, openssh, webauthn, simplewebauthn, xterm.js, express, websockets, elevenlabs, hyperframes (add `solana` only after step 6 above) |
| Try it out | https://claura.tech (landing page). The console itself runs locally; the README says how to run it. Test the link in a private window. |
| Code repository | https://github.com/zero-abd/claura (must be **public**) |
| Video | The public or unlisted YouTube link from step 1, under 2:00. It must play while logged out. |
| Image gallery | Section 6 below. The thumbnail is `Claura-thumbnail.png`. |
| Team | Step 4 above. List each person's school. |
| Spacetime access code | Step 3 above. |

---

## 2. Tracks to tick

Devpost allows **three sponsor tracks**, plus one HackUTD track. Everyone is automatically in the General Track.

**Recommendation: Winstead PC + Spacetime + NVIDIA. NMC² is the one to swap out.**

| Track | Tick? | Why |
|---|---|---|
| **Winstead PC: Cyber Incident Response Dashboard** | **Yes** | The closest fit we have. We built to all five required components (isolated system, admin-managed access, standards-based documentation with live status, data scope with status, real-time comms) and to the organizer's "attacker sees normal comms, phones down" scenario. Cash prize ($1,500 for first), and a niche brief means fewer direct competitors. |
| **Spacetime: Build on Spacetime** | **Yes** | Nearly the whole backend is one SpacetimeDB module on Maincloud (database `claura`: 18 tables, 18 role-gated views, 24 reducers: state, identities, policy gate, War Room, data scope, documentation), and the demo proves it on two screens (a click reaches the other console in about 335 ms). It's the largest cash prize of the four ($2,048 for first). It requires a public repo and the booth access code. |
| **NVIDIA: Use Nemotron Beyond a Chatbot** | **Yes** | Nemotron is the reasoning core: four agents, twelve tools, a multi-step loop gated by policy, running on-prem. Logged live runs back it up (15 turns, 14 tool calls, zero malformed up to the approval card). Prize: RTX 5080 GPUs. |
| NMC²: Keep the World Running | No (the swap) | It fits the story (missed warnings, handoffs, right information at the right time), and the pitch still hits those beats for any NMC² judge we meet. But it has no technology gate, so it rewards the story alone, against the widest field. Of the four it adds the least to our odds. |

**Contingency (decide at 11:15):** if the live Nemotron path is unreliable on the venue network and we'd be demoing the replay at every table, swap **NVIDIA → NMC²**, and change the "Tracks" line at the top of `DEVPOST.md` (and its two copies) to match.

**HackUTD track (one only): Best Design.** The console is a Liquid Glass UI with a clickable 3D data center, our most visual asset. **Virality** is the alternative if the video is the thing you expect to spread; take only one.

---

## 3. MLH prizes

| Prize | Enter? | Note |
|---|---|---|
| **Best Domain Name from GoDaddy Registry** | **Only if the domain was registered through the MLH GoDaddy Registry page** | claura.tech is live and on-brand, but ICANN lists **Radix**, not GoDaddy Registry, as the .tech registry ([ICANN](https://www.icann.org/en/registry-agreements/details/tech)). Ask at the MLH table before 11:30. If the domain did not come through that page, don't enter it; or register a Claura name on a GoDaddy Registry extension through MLH's free-domain offer, point it at claura.tech, and enter that one. |
| Best Use of ElevenLabs | Optional | "Ask Claura" is built and runs live when the ElevenLabs key is present (`voice live` in `demo/start.sh`). Enter only if it works end to end on venue Wi-Fi by 11:30, with the API key kept server-side. Voice is not in the video. |
| Best Use of Solana | **Only after funding and a real anchor** | Anchoring is built and tested, but the devnet wallet is unfunded, so the console says "Simulated anchor" and nothing reaches the chain. Do step 6 in section 0 first. Without a real signature and Explorer link, don't claim it and don't tick it. |
| Gemini, Vultr, DigitalOcean | No | Not in the build. |

---

## 4. Video

- [ ] `Claura-demo.mp4` (1:58) uploaded as public or unlisted; plays in a private window; the link is in Devpost and in `README.md` (and in the `Links:` line of `DEVPOST.md` and its two copies).
- [ ] Spot-check the labels the script promises: lower-third "Simulated attack replay · illustrative numbers · live software" on the first UI shot; "Simulated effect" on the containment shots; "Illustrative demo number" on the 9.4 s counter; "red-team probe" readable on the blocked row; "Roadmap" on the vision shot. (The 9.4 s is the replay's demo clock; the live console shows the measured number.)
- [ ] Captions burned in. End card shows claura.tech and github.com/zero-abd/claura.

## 5. Repo

- [ ] github.com/zero-abd/claura is public, and the README says what is live, simulated and measured, how to run it, and maps each track (it links each folder's README).
- [ ] No secrets in the code or the history: the ElevenLabs key, codes and tokens, the SSH CA keys and the Solana keypair live in `~/.config/claura/` and `.env` is ignored. (`tools/sync.sh` refuses to continue if it finds a key-shaped string.)
- [ ] `demo/rehearsal/` (about 130 MB of dress-rehearsal screenshots) and `demo/.run/` are ignored by `.gitignore` and are not pushed.
- [ ] Run instructions are in the README: the replay, and the whole stack on one laptop (local appliance mode).
- [ ] `backend/runs/` logs stay in the repo. They're the evidence behind "15 turns, 14 tool calls".

## 6. Screenshots (gallery order)

The first image is the gallery thumbnail, so it must read at small size. The files are in `~/repos/bulkhead/shots` (`apps/dashboard/shots` in the monorepo).

1. **Approval card** (`incident-approval.png`): "Quarantine b14-gpu-07?" with scope, rollback and evidence. Or use `Claura-thumbnail.png` first.
2. **Overview** (`overview-breach.png`): the 3D data center with the glowing rack in Hall B.
3. **Agents trace** (`agents-expanded.png`): tool calls with the `nemotron-3-nano:4b · local` tag.
4. **Policy ruling** (`policy.png`): auto / needs approval / denied, with the blocked `reimage_host` red-team row.
5. **War Room** (`warroom.png`): channels, Scribe's brief ("what we know / what we don't know yet"), tasks, decision log.
6. **People & Access** (`access-code.png`): a single-use break-glass enrollment code being issued.
7. **Data Scope** (`scope.png`): assets with status chips (locked by ransomware, exfil suspected, intact, evidence preserved).
8. **Reports** (`report.png`): NIST SP 800-61 phase status, the SHA-256 chain of custody, Export PDF.
9. **Secure Shell** (`shells.png`, and the terminal shots in `ssh/shots`): Touch ID step-up, second approver, read-only forensic banner, certificate expiry.
10. **Two consoles, live on Maincloud** (`live-3-contained.png`): the same incident on both screens, with the measured time to contain.

## 7. Final pass (11:30)

- [ ] Every sentence in the description matches what's live. The "What's live and what's simulated" box is intact: Maincloud database `claura`, the measured numbers, and the Solana sentence that matches whether step 6 was done.
- [ ] The tracks ticked match the "Tracks" line in the description.
- [ ] Spacetime access code entered. Team members all accepted.
- [ ] Press **Submit**, not just Save. Re-open the public page logged out and check the video, repo and try-it links.
- [ ] Then stop building. Rehearse `FINAL-PITCH.md` section 5 twice with a timer, using `demo/JUDGING.md` for the live clock (Enter at 0:05), and run the truth check at 12:45.
