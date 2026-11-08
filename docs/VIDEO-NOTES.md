# Claura: demo video notes

Applies to the current draft (about 80-84 s, one narrator): hook (60k agents, one breaks out) > old way fails > reveal > Sentry > Triage > Warden > evidence > human approval > contained 9.4 s > Scribe > Nemotron/policy > SpacetimeDB > end card.

## 1. Verdict

**Length is fine. Do not make it longer.**
- **No hard video limit found for 2026.** I could not open the Devpost rules (HTTP 403), so check the video field and Rules page. HackUTD's own guidance for judges' first look: keep the demo video **under 2 minutes** ([pitching workshop](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md)); last year's Devpost guide said "ideally about 2 minutes" and required a public link ([2025 guide](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/src/components/DevpostGuide/DevpostGuide.jsx)); MLH tells hackers to have a 2-minute demo video ([MLH judging plan](https://guide.mlh.com/general-information/judging-and-submissions/judging-plan)).
- Target 80-90 s. If the form shows a limit below that, cut Scribe to 3 s and "old way" to 4 s.
- The video is the one thing every judge can see before they reach the table, so it has to state the scope honestly (scripted prototype) and show real proof for each sponsor you enter.

## 2. What should change

1. **Label the data on screen.** Show "Prototype. Scripted demo data." as a lower-third on the first dashboard shot, and "Illustrative demo number" next to the 9.4 s counter. Say "in our demo" in the voice-over line about 9.4 s. A judge who finds out later that the numbers are scripted will discount the rest; a judge who is told up front will not.
2. **Shorten the hook and the "old way".** Together they should take 12-16 s. The best material, the dashboard, should start by about 0:22.
3. **Say "more than 60,000 sandboxed agents" and frame it as the scenario.** The prototype's fictional fleet is 61,207 sandboxed agents, so "60k" matches the data, but it is not a measured claim. Phrase it as "a campus running more than 60,000 agent sandboxes".
4. **Put Claura and the tagline on screen by about 0:16**, not only on the end card. HackUTD advises a memorable name and a thumbnail that works before anyone presses play.
5. **Give the human approval 8-10 s.** Hold on the approval card for at least 2 s with evidence, scope and rollback readable, then show the click. This is the idea's differentiator and the NMC "right information at the right time" proof.
6. **Add a 3 s shot of the three operator avatars and the shared timeline** (the "3 operators" presence indicator and the report). That is the handoff beat for NMC² ("unclear handoffs").
7. **Make the Nemotron / policy / SpacetimeDB beat one 10 s beat, and make it true.**
   - If shipped: show 5-6 s of the real Triage output (model name and the tool-call list) and 4-5 s of two consoles updating from one SpacetimeDB table with the row count. Say "Nemotron through NVIDIA's API in this demo; self-hosted on-prem in the design."
   - If not shipped: show the architecture with a visible "Planned" tag and say "planned" in the voice-over. Do not say "powered by" or show sponsor logos in a way that implies an integration.
8. **End card (hold 3 s or more):** Claura, tagline, claura.tech, the GitHub URL, "Prototype with scripted demo data". Add the track names you entered only if the integrations shipped.

## 3. Recommended beat sheet (about 88 s)

| Time | Beat | On screen | Notes |
|---|---|---|---|
| 0:00-0:08 | Hook | Hull plan, a cell goes orange. "A campus running more than 60,000 agent sandboxes. One of them breaks out." | Frame 0 must make sense on a muted autoplay. |
| 0:08-0:16 | The old way fails | Pager, runbook, minutes pass. | 8 s maximum. |
| 0:16-0:22 | Reveal | Claura and the tagline; door closes. Lower-third: "Prototype. Scripted demo data." | Name is on screen by 0:16. |
| 0:22-0:30 | Sentry | Signal stream, six signals correlate into INC-0419. | Name the six signals once, quickly. |
| 0:30-0:38 | Triage | Attack path: 1 suspect host, 11 co-resident guests, management plane reachable. | |
| 0:38-0:50 | Warden | Containment plan, reversible steps first, then pause, memory capture, fail-over. | Say "no live migration off a suspect host". |
| 0:50-0:58 | Evidence and approval | Approval card: evidence, scope, rollback. Hold 2 s. | |
| 0:58-1:06 | Human approves | Click Approve quarantine; counter stops at 9.4 s. Tag: "Illustrative demo number". | The payoff (SEALED) lands about 1:00; the film SPEC asks for about 55 s, so trim 5 s earlier if needed. |
| 1:06-1:11 | Scribe | Report drawer: timeline with authorizer column, hashed evidence. 3 operators. | Includes the NMC handoff shot. |
| 1:11-1:21 | Under the hood | Nemotron + policy ("policy, not the model, controls execution") + SpacetimeDB. | Real proof if shipped; "Planned" tags if not. |
| 1:21-1:28 | End card | Claura, tagline, URLs, "Prototype with scripted demo data". | Hold 3 s or more. |

## 4. Voice-over rewrites to check

| Draft idea | Safer wording |
|---|---|
| "Contained in 9.4 seconds." | "In our demo, contained in 9.4 seconds." |
| "Agents reason with Nemotron on-prem." | If not shipped: "The design runs Nemotron on-prem, so telemetry stays in the building." If shipped: "Triage here calls Nemotron through NVIDIA's API; the design self-hosts it." |
| "SpacetimeDB keeps every console on one timeline." | If not shipped: "In the design, SpacetimeDB keeps every console on one timeline." |
| "Warden never acts without policy." | "A policy layer, not the model, decides which actions are allowed." |
| "60k agents." | "More than 60,000 agent sandboxes, in this scenario." |

## 5. Must-show items by judge type

| Judge | Needs to see |
|---|---|
| General / design | Clear problem in the first 10 s; the console; the approval card; the end state. |
| NMC² | Missed warning (Sentry), shared timeline / handoff, right information on one card. |
| NVIDIA | A real Nemotron call with tools (multi-step, tool use). A claim without a visible call will not count. |
| Spacetime | Actual rows and reducers driving the live panel, ideally two consoles. A public repo link on the end card. |
| Winstead (if entered) | Documented timeline, scope, who authorized each step, hashed evidence. |

## 6. Delivery and craft

- Real dashboard footage fills at least 70% of the frame width and text stays readable (your own SPEC.md rule). Keep that.
- Burn in captions. Many viewers watch muted, and Devpost reviewers often skim (recommendation; not from a sourced rule).
- Voice: clean recording, no music louder than the narrator. One narrator is fine.
- Skip team introductions and slides of text. Sources agree that the video should open with the product working and cut long intros ([Hackathon.com](https://tips.hackathon.com/article/creating-the-best-demo-video-for-a-hackathon-what-to-know), [Devpost advice](https://dev.to/jacklyn/how-to-make-your-devpost-submissions-not-suck-37i0)).
- Show the product, not the code. If sponsors need proof, give it 3-5 s of a terminal or dashboard, not a code walk-through (search-result guidance; not fully verified).
- Use a 1080p MP4. Keep the file on disk for the table fallback.
- Upload to YouTube as public or unlisted. **Test the link logged out and in a private window.** YouTube processing can take minutes to hours (search-result guidance), so upload by about 09:30 on Sunday at the latest.
- Make the thumbnail the approval card or the full console with the name Claura, readable at small size.

## 7. Rename work in the film assets

The film repo is at `/Users/abd/repos/bulkhead-film`. I did not edit it, and only read `SPEC.md`. It was built under the old name, so check and update:
- Title card, end card, and any voice-over line that says "Bulkhead".
- **Dashboard footage**: the header wordmark in the prototype still says "Bulkhead" (`src/main.ts:98`, `index.html`). Rename the prototype first, then re-record the footage. Otherwise the video shows the old name.
- The ship's-bulkhead visual metaphor (hull plan, watertight doors) can stay. The product name is Claura; the bulkhead is the explanation, not the brand. Write "like a ship's bulkhead" in the voice-over once, early.
- Decide how Claura is pronounced and use it consistently in the video and at the table.
- The SPEC mentions "a ship's log (rows) for SpacetimeDB". That is fine as a metaphor; tag it "planned" if the integration did not ship.

## 8. Common mistakes to avoid
- A long intro or a team introduction before the product appears.
- Showing code or a terminal for more than a few seconds.
- Claims in the video that the repo does not support (on-prem Nemotron, SpacetimeDB sync, a measured 9.4 s).
- Leaving the upload until the last hour, or leaving it to one person.
- A private or unlisted link that does not play logged out.
- Different numbers in the video, the Devpost text and the pitch (keep: 6 signals, 1 suspect host, 11 co-resident guests, 2 exposed tokens, 9.4 s illustrative, 3 operators).
