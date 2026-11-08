# Codex judge panel: round 1 vs round 2

Both rounds used `codex exec --skip-git-repo-check -s read-only` with the same eight judge personas.

- **Round 1** (`round1-prompt.txt`, `round1-final.md`) scored the four drafts in `drafts/`.
- **Round 2** (`round2-prompt.txt`, `round2.out`) scored the merged package: `FINAL-PITCH.md`, `VIDEO-SCRIPT.md` and `DEVPOST.md`. Codex finished in about 4 minutes, exit 0.

The two rounds don't measure quite the same thing. Round 1 scores were conditional: they assumed we demonstrate only what is live, and the panel said to subtract 2 to 4 points for any unchecked claim. Round 2 checked every line against an explicit live list and penalised anything beyond it. So the round-2 numbers include the credibility haircut that round 1 only warned about.

## Scores per persona

| # | Persona | R1 Immune | R1 Bulkheads | R1 Crime Scene | R1 Agents | R1 best | **R2 package** | R2 pitch / video / Devpost |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | CISO / security engineer | 9 | 7 | 8 | 8 | 9 | **7** | 8 / 7 / 7 |
| 2 | Seed-stage VC | 9 | 8 | 7 | 9 | 9 | **6** | 8 / 6 / 7 |
| 3 | Winstead PC attorney | 7 | 7 | 9 | 7 | 9 | **8** | 8 / 8 / 9 |
| 4 | NMC² operations lead | 9 | 9 | 8 | 8 | 9 | **8** | 8 / 7 / 8 |
| 5 | NVIDIA DevRel | 9 | 8 | 8 | 10 | 10 | **9** | 9 / 9 / 9 |
| 6 | SpacetimeDB engineer | 8 | 9 | 8 | 9 | 9 | **9** | 9 / 8 / 9 |
| 7 | MLH generalist | 10 | 8 | 9 | 9 | 10 | **8** | 8 / 9 / 7 |
| 8 | Non-technical student | 10 | 8 | 9 | 8 | 10 | **8** | 8 / 8 / 6 |
| | **Average** | 8.88 | 8.00 | 8.25 | 8.50 | 9.38 | **7.88** | 8.25 / 7.75 / 7.75 |

- **Round-2 average: 7.9 / 10** (package). Sub-score averages: pitch 8.3, video 7.8, Devpost 7.8.
- **Lowest persona in round 2: the seed-stage VC, 6 / 10** ("a compelling product and category, but no customer evidence, quantified beachhead or defensible wedge-to-venture reason"). The CISO is next at 7.
- **Round-2 verdict:** "dramatically better than round 1". The remaining risks were absolute isolation claims, simulated containment described like a live outcome, failover language, and a technically wrong line about blocked proposals.
- The scores above are round 2 as reviewed, **before** the fixes below. We did not run a round 3.

## Changes made after round 2

Rule applied: take every fix that lifts the weakest judges (VC 6, CISO 7) or corrects a factual error, unless it costs another judge or breaks the brief.

**For the VC (lowest)**
- Q7 rewritten: the buyer is stated as a hypothesis, the market as Synergy's numbers, willingness to pay as untested, and customer discovery with GPU-cloud operators as the next step. The moat now includes signed attack fingerprints shared across fleets. The weakest line ("they can't staff a hyperscaler-sized response team") is replaced by an explicit, unvalidated hypothesis.
- A vision line now closes the table pitch: "Next: an immune system for every AI cloud, where one breach protects them all."
- Video line 27 made concrete: "Next: an immune system for every AI cloud, sharing attack fingerprints, never tenant data."
- The unsourced "500 to 10,000 hosts" beachhead range was removed. DEVPOST's "Why it matters" now says "the customers we want first" and "we haven't validated pricing yet".

**For the CISO**
- Q5 (isolation boundary) rewritten: "built not to depend on what the attacker is assumed to own"; hosted on Maincloud outside the corporate network; no SSO, email or phone dependency; identity-checked approvals and admin actions; explicit limits (a compromised laptop, Maincloud as a third party, no pen test yet).
- Absolute claims removed everywhere: "shares nothing the attacker owns", "somewhere the attacker can't read", "we depend on none of them", the DNS-independence claim, and "every reducer checks the caller's identity".
- DEVPOST "What it does" now says the agents detect from replayed telemetry and that containment is recorded as state; "the full loop runs live" became "the decision loop runs live". The claim table gained "the decision loop is live; the containment it triggers is simulated state".
- Video line 8: "Its command center runs outside your network, with its own identities." The panel's "hosted outside the demo network" was confusing for a viewer, so we didn't use it. Line 17 now ends "in our simulation". The containment shots are tagged "Simulated effect".

**For the SpacetimeDB engineer (a factual fix)**
- "A refused action never commits" was wrong: the blocked proposal must commit for the audit row and the live UI to exist. Fixed in the pitch's §7, Q9 and §10, in DEVPOST "How we built it", and on slide 3: the proposal "is committed as blocked, visible on every screen, and never applied".
- Video line 26: "And every screen updates live, through SpacetimeDB subscriptions."

**For NVIDIA**
- The red-team provenance is now unmistakable. Pitch: "Our own red-team test, not Nemotron, tried to reimage the host: denied." Video line 14: "Our red-team probe tries to reimage the host. Denied." DEVPOST: "a labelled red-team probe from our test harness (not Nemotron)", plus the four-prompt-variant finding with a pointer to `backend/agents/README.md`.

**For the Winstead attorney**
- "The PDF is what you'd hand outside counsel the next morning" (their weakest line) became "a contemporaneous export for outside counsel to validate and use as they see fit; Claura doesn't decide privilege, materiality or notification duties."
- "Writes itself" removed from the documentation lines: the pitch now says "follows NIST 800-61: live phase status, SHA-256 evidence hashes, a PDF for counsel to review", and video line 23 "The record follows NIST, with live phase status and a hashed chain of custody."
- The comms rows in DEVPOST and §10 now say the admin controls enrollment, and counsel, not the channel name or the software, decides privilege and distribution. "Every decision carries a name" became "the decision log records who decided what, and when".

**For the NMC² ops lead**
- "The hall keeps running" and "the eleven neighbors restart" are now framed as the modelled operating goal: "It changes database state; we haven't integrated a real hypervisor or measured interruption time yet." Fixed in the NMC² swap-in, in §10, and in DEVPOST's Warden sentence.

**For MLH and the student**
- The CISA sentence came out of the default hook and is now an add-on for security and legal judges only, so the default hook is the clean two-sentence version.
- DEVPOST "What it does" opens with the panel's one-line loop ("one incident, one policy-gated containment decision and one live record") and a plain-language gloss of the four agents.
- The 15-second pitch now opens "one customer's AI just broke out into a server it shares with others".

**From our own source check** (done during the review)
- The IBM $1.93M savings figure was cited to a Baker Donelson page that doesn't contain it. It now cites the IBM press release and eSecurity Planet, which do.
- The Uptime statistic now reads "respondents" in the 2025 survey, matching the source.
- The console has no on-screen "simulated" label, so the table setup now uses a printed card. The model-tag cue was corrected to the label the console actually shows.

## Round-2 fixes not applied, and why

| Suggested fix | Decision |
|---|---|
| Student: replace "An IOMMU fault. A GPU driver fault." with "Hardware fault. Driver fault." | Not applied. The brief requires the I. O. M. M. U. and G. P. U. TTS respellings, so the terms stay; the shot shows the signal names on screen. |
| MLH: merge shell lines 24-25 into one line without the certificate | Not applied. The brief requires "click a host, short-lived certificate, recorded" in the video. |
| VC: change the Devpost elevator pitch to "an out-of-band incident command and policy system for multi-tenant GPU clouds" | Not applied verbatim. It would drop the immune-system category that MLH and the student scored highest. The beachhead now lives in Q7 and Devpost's "Why it matters". |
| Synthesis: open video line 3 with "In this replayed attack" | Not applied. The lower-third discloses the replay from the first UI shot, and line 17 now says "in our simulation". The hook keeps its pace. |
| Remove the notification clocks and repo-level details (nine tools, fallback tags, fail-closed gate, policy flip, 15-minute certificates, principals file) as "beyond the live list" | Kept, because each one is in the repo: `backend/agents/README.md`, `backend/spacetime/README.md`, `ssh/lib/hosts.mjs`, `ssh/lib/targets.mjs` and `apps/dashboard/src/warroom-data.ts`. We added a "Repo-verified details" row to the claim table and a truth-check item for the clocks. |

## Word counts after the fixes

- Video narration: **262 words** (was 263), 29 lines, about 108 s of speech and about 112 s on the timeline.
- Two-minute table pitch: 266 spoken words. The 60-second version: 112. The 15-second pitch: 45. The 30-second pitch: 84.
