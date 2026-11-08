# Claura at HackUTD 2026: findings, risks, checklist

Research date: Sunday 8 Nov 2026, 01:40 CST (checked with `date`). Sources are linked inline and listed at the end.
Product name: **Claura** (claura.tech). Tagline: "Seal the breach before it spreads."

## 1. Read this first

1. **The event is happening now, and the deadline is today.** HackUTD 2026 is "Zero Day", 7-8 Nov 2026. Final Devpost submissions are due **Sunday 8 Nov, 12:00 pm CST**. That is about 10 hours from the research time. Judging is 1:00-4:00 pm. ([zeroday.hackutd.co](https://zeroday.hackutd.co/))
2. **The "initial Devpost deadline" has already passed** (Saturday 11:00-11:15 pm). Last year's HackUTD guide says this step is team registration: create a Devpost project, invite teammates, and click the final Submit step; placeholder text and links are allowed ([2025 guide](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/src/components/DevpostGuide/DevpostGuide.jsx)). If no Devpost project exists yet, create it now and ask a staff member whether a late registration is accepted. I could not verify the 2026 rule.
3. **The Spacetime and NVIDIA prizes require using the technology**, and the prototype does not use either yet. See section 5.
4. **The prototype UI currently claims integrations that do not exist.** It shows "synced via SpacetimeDB", "SpacetimeDB · incident_events · N rows", "NVIDIA Nemotron · on-prem", a `nemotron-on-prem` tag on each agent, and a report footer saying "Agents reasoned with NVIDIA Nemotron on-prem" (`src/main.ts` lines 106, 149, 181, 189, 220). Sponsor judges will check. Either make them true (section 5) or relabel them "planned" before judging. I did not edit these files.
5. **The prototype still says "Bulkhead".** `index.html` (title and meta description), the header wordmark at `src/main.ts:98`, and the favicon comment need the rename to Claura. The dashboard footage in the film repo will also show the old wordmark and needs re-recording after the rename.
6. **Devpost returned HTTP 403 to my fetcher**, so I could not read the 2026 judging criteria, rules or video requirement firsthand. Facts marked "via search summary" come from a search tool's summary of the Devpost page. Check the Devpost page's Rules and Judging sections yourself.

## 2. Event facts

| Item | Finding | Source |
|---|---|---|
| Name and dates | HackUTD 2026: Zero Day, presented by T-Mobile. 7-8 Nov 2026, UT Dallas, ECSW building. 24 hours. | [zeroday.hackutd.co](https://zeroday.hackutd.co/) |
| Hacking starts | Sat 7 Nov, 12:00 pm | same |
| Initial Devpost deadline | Sat 7 Nov, 11:00-11:15 pm (passed) | same |
| **Final submission** | **Sun 8 Nov, 12:00 pm CST** | same; Devpost "Nov 8, 2026 @ 12:00pm CST" via search summary ([Devpost](https://hackutd-zeroday.devpost.com/)) |
| Judging | Sun 1:00-4:00 pm. Closing ceremony 5:00-6:00 pm, ATEC Auditorium. | [zeroday.hackutd.co](https://zeroday.hackutd.co/) |
| Team size | 1 to 4 | same |
| Prize pool | $60,000+ | [Devpost via search summary](https://hackutd-zeroday.devpost.com/); [Hackathon Radar](https://www.hackathonradar.com/database/hackathon/hackutd-2026-zeroday) |
| Tracks per team | Up to **three** sponsor tracks and one HackUTD track (Best Hardware, Best Design or Virality). Everyone is automatically in the General Track. | Devpost via search summary. **Verify.** The 2025 guide said two sponsor tracks. |
| Special awards | Best Design, Best Beginner, Best Hardware, Virality. Descriptions were "coming soon" on the site. | [zeroday.hackutd.co](https://zeroday.hackutd.co/) |
| General Track | 1st: MacBook Pro M5 Pro or a trip ($1,500 flight and $900 hotel gift cards). 2nd: Fujifilm camera or iPad Pro. 3rd: Breville coffee maker or DJI drone. | same |

## 3. What "the wind", "NMC" and the others most likely are

| Student said | Most likely | Evidence | Confidence |
|---|---|---|---|
| "space-time" | **Spacetime** (Clockwork Labs, maker of SpacetimeDB). Challenge: "Build on Spacetime". Silver sponsor. | The sponsor link goes to [clockworklabs.com](https://clockworklabs.com/join), which describes Clockwork Labs as the maker of Spacetime. The site writes "Spacetime", never "SpacetimeDB". | High |
| "NMC" | **Northmark Compute & Cloud (NMC²)**. Challenge: "Keep the World Running". Gold sponsor. NMC ran a workshop on Saturday. | [zeroday.hackutd.co](https://zeroday.hackutd.co/). NMC²'s own site describes a large GPU cluster and says it took part in HackTX '25 ([nmc2.com](https://nmc2.com)). | High |
| "the wind" | **Winstead PC** (Gold sponsor), most likely a speech-to-text slip for "Winstead". Challenge: "Cyber Incident Response Dashboard". | No sponsor, track or challenge on the official site, the Devpost summary or Hackathon Radar contains "wind". Windsurf also does not appear. Winstead is the only close match. Winstead is a law firm with cybersecurity and data privacy practices ([winstead.com](https://www.winstead.com)). | Medium. **Ask the student to confirm.** |
| "cyber security stuff" | The same Winstead challenge. It is the only cybersecurity challenge listed. | [zeroday.hackutd.co](https://zeroday.hackutd.co/) | Medium-high |
| "NVIDIA, Nemotron" | **Use Nemotron Beyond a Chatbot** (NVIDIA, Silver). | same | High |

If "the wind" and "cyber security stuff" are both Winstead, the student is targeting **four** sponsor tracks (Spacetime, Winstead, NVIDIA, NMC). That is one over the reported cap of three. See section 6.

## 4. The four challenges and how Claura fits

Text paraphrased from [zeroday.hackutd.co](https://zeroday.hackutd.co/).

### NMC²: Keep the World Running
- Ask: help data center teams stay ahead of disruptions. Named problems: missed warnings, unclear handoffs, wrong information at the wrong time. Prizes: AirPods Max Gen 2, Apple Watch Series 12, Echo Show 11.
- Technology requirement: **none listed**. No judging criteria listed.
- Fit: **best**. Claura is a data-center incident console. Map it to their three named problems: Sentry (missed warnings), one live timeline shared by all operators (unclear handoffs), one approval card with evidence, scope and rollback (right information at the right time).
- Risk: low. Say clearly that it is a prototype.

### NVIDIA: Use Nemotron Beyond a Chatbot
- Ask: the project **must use Nemotron** and include multi-step workflows (agents that plan and carry out complex tasks), tool integration (external APIs and services), and real-world applicability. Prizes: 1st, 2 RTX 5080 GPUs and $200 Brev credits per team; 2nd, 1 RTX 5080 and $200 credits.
- Fit: good on concept. Four agents, a multi-step containment plan, a real problem.
- Risk: **high as it stands.** The prototype does not call Nemotron. The agents' text is scripted.

### Spacetime: Build on Spacetime
- Ask: build any app or game. Requirements: **a public GitHub repo**, **the majority of the backend must be built on Spacetime**, and an **access code from the Spacetime booth**. Prizes: $2,048 / $1,024 / $512 per team (the largest cash among the targeted tracks). The separate ScrabbleBot challenge ran Saturday 11 pm.
- Fit: good on concept. The incident state machine is a natural database-with-logic.
- Risk: **high as it stands.** The prototype has no backend, so zero percent of a backend is on Spacetime.
- Local note: `spacetime` is already installed on this Mac at `/Users/abd/.local/bin/spacetime` (found with `which`). If the student already got an access code at the booth (for example for ScrabbleBot), reuse it. Otherwise get one from the booth.

### Winstead PC: Cyber Incident Response Dashboard
- Ask: a "command center" for use during and after a cyber incident. Required: (1) highly secure and able to run as an **isolated system** inside a possibly compromised network; (2) **admin can add users**; (3) incident documentation following **cyber incident documentation standards**, with real-time updates and status monitoring; (4) **scope definitions** of which data was compromised and its status (locked by ransomware, exfiltrated, and so on); (5) **real-time communications** inside the system. Judged on security (assume the attacker can reach internal systems), ease of use under stress, and creativity. Prizes: $1,500 / $900 / $300 per team.
- Fit: partial. Claura covers documentation (Scribe timeline, hashed evidence), scope (scope line on the approval card) and ease of use under stress (one card). It does **not** have user admin, in-app communications, or an isolated-deployment story, which are three of five stated requirements.
- Inference, not sourced: Winstead's judges are probably lawyers and privacy counsel. Chain of custody, who authorized what, and evidence hashing are likely to land with them.
- Risk: medium-high. A long shot unless the student has spare time for user admin and chat.

## 5. Sponsor prize eligibility risk, and the smallest honest integrations

**Risk statement.** The NVIDIA challenge says the project "must use Nemotron". The Spacetime challenge says "the majority of the backend must be built on Spacetime". A frontend-only prototype with scripted data satisfies neither. Entering either track as-is is likely to be disqualified, and claiming the integration in the UI without having it is worse than not entering. I could not read the formal Devpost rules to see how strictly they are enforced.

Both integrations below are small, honest and mutually reinforcing: Nemotron proposes, a Spacetime reducer enforces policy, a human approves.

### 5a. Smallest honest SpacetimeDB integration (estimate 2-3 hours)

Goal: the incident state machine and the policy gate live in a Spacetime module, and the console reads them through a subscription. Then "the majority of the backend" is true, because the state machine and policy are the entire backend.

| Piece | What it does |
|---|---|
| Tables (public) | `incident`, `incident_event` (signals, proposals, actions, approvals; this is the timeline), `action` (kind, target, status: proposed / approved / executed / rejected), `operator` |
| Reducer `ingest_signal` | Appends a signal row. A scripted "attack simulator" calls this on a timer, so the telemetry remains simulated. Say so. |
| Reducer `propose_action` | **Policy gate.** Checks the action kind against an allowlist. Reversible kinds go straight to `approved`. `quarantine_host` is set to `awaiting_approval`. Anything not on the list is rejected. |
| Reducer `approve_action` | Records the caller's identity as approver. Fails unless the action is `awaiting_approval`. |
| Client | Replace the scripted "Signal stream" with a subscription to `incident_event`, so the "N rows" counter is a real row count. The **Approve quarantine** button calls `approve_action`. Open two browser windows to show two operators on one timeline. |

Doc-backed API shape (confirm names against the docs before coding):
- `spacetime init --lang typescript`, `spacetime dev` (local server and hot publish), `spacetime publish <name> --server maincloud` ([developing](https://spacetimedb.com/docs/databases/developing), [maincloud](https://spacetimedb.com/docs/how-to/deploy/maincloud)).
- Modules use `schema`, `table` and `t` from `spacetimedb/server`, and `spacetimedb.reducer(args, (ctx, args) => ...)`. Reducers run in transactions, and a thrown error rolls back all changes ([reducers](https://spacetimedb.com/docs/functions/reducers)).
- Client: `DbConnection.builder().withUri(...).withDatabaseName(...).onConnect(...)`; subscribe with `subscriptionBuilder().onApplied(...).subscribe([...])`; live rows via `conn.db.<table>.onInsert` ([connection](https://spacetimedb.com/docs/clients/connection), [subscriptions](https://spacetimedb.com/docs/clients/subscriptions)).

Rules to respect: public repo, an access code from the booth, and no second backend. Keep any helper server (see 5b) stateless.

### 5b. Smallest honest Nemotron integration (estimate 1-1.5 hours)

Goal: one real, multi-step, tool-using Nemotron call that produces the Triage output. "Beyond a chatbot" means more than a single prompt and response, so use tool calling:

1. A small script (Node is installed here) calls the OpenAI-compatible endpoint `https://integrate.api.nvidia.com/v1/chat/completions` with `Authorization: Bearer $NVIDIA_API_KEY` ([model card](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)).
2. Give the model 2-3 tools backed by fixture data: `list_coresident_guests(host)`, `get_token_scope(identity)`, `get_mgmt_reachability(host)`. Let it call them, then return a structured JSON proposal (summary, blast radius, ordered actions).
3. Send the proposal to the Spacetime `propose_action` reducer. The policy layer, not the model, accepts or rejects each action.
4. Show the real output (model name and tool-call trace) in the console's Triage panel.

Notes:
- **Model id.** The Nemotron models page lists, among others, Nemotron 3.5 Lightning 30B-A3B, Nemotron 3 Ultra 550B-A55B and Nemotron 3.5 Bolt E4B; tool calling is mentioned for Bolt, Ultra and Super VL on the list page, and "Function Calling: Supported" on the Lightning card ([models](https://build.nvidia.com/models), [Lightning card](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)). The card's code samples leave the `model` field blank, so copy the exact id from the live "View Code" panel.
- **Key and limits.** Get a key from build.nvidia.com (NVIDIA Developer Program). Third-party and forum reports say free keys are limited to about 40 requests per minute; this is secondhand ([forum thread](https://forums.developer.nvidia.com/t/request-to-increase-nvidia-nim-api-rate-limit-from-40-rpm-to-250-300-rpm/372594)). The card says the trial service is governed by the NVIDIA API Trial Terms of Service.
- **Never commit the key.** The repo has to be public for the Spacetime prize. Use an environment variable, keep `.env` out of the repo, and do not put the key in the browser bundle. Calling the endpoint from the browser may also hit CORS (not tested), so call it from a script or a tiny stateless proxy.
- **Say "hosted" honestly.** The build.nvidia.com API is NVIDIA-hosted, not on-prem. Write "Nemotron via NVIDIA's hosted API in this demo; the planned design self-hosts the same model on-prem". The same OpenAI-compatible client works against a self-hosted NIM by changing the base URL and model ([example](https://dev.to/creeta/nemotron-3-ultra-went-live-june-4-heres-the-call-that-works-55g7), third-party).
- **Fallback.** Save one real response to a JSON file and label it "recorded output of a real Nemotron call" so the demo survives a rate limit or Wi-Fi failure. Do not present it as live.

### 5c. If there is no time for one of them

Do not enter that sponsor's track, and change every on-screen label to "planned". An honest NMC + General entry is better than a disqualified sponsor entry and a credibility hit with every other judge.

### 5d. Suggested relabeling if nothing gets integrated
- Header: "3 operators, synced via SpacetimeDB" becomes "3 operators (planned: SpacetimeDB sync)".
- Stream header: "SpacetimeDB · incident_events" becomes "Signal stream (scripted)".
- Agents: "NVIDIA Nemotron · on-prem" becomes "Planned: Nemotron, self-hosted".
- Report footer: remove the sentence that agents reasoned with Nemotron.

## 6. Which tracks to enter (cap reported as three)

| Track | Decision | Reason |
|---|---|---|
| NMC² Keep the World Running | **Enter** | Best fit, no technology gate. |
| NVIDIA Use Nemotron | **Enter only if 5b works** | Hard "must use Nemotron" requirement. |
| Spacetime | **Enter only if 5a works** | Hard backend requirement; best cash. |
| Winstead | **Enter only as a swap** if you cannot do 5a or 5b and want a third track | Three of five required components are missing. |
| General Track | Automatic | |
| HackUTD track (Design / Virality) | Optional, one only | The Design award is plausible given the visual polish; criteria unpublished. |

Choose tracks on the Devpost form last, after you know what works. The Devpost entry can be edited until the deadline.

## 7. Judging and submission requirements

### What is known for 2026
- Devpost: sponsor tracks selected on the form (cap reported as three), one project per team.
- The HackUTD pitching workshop, listed in the 2026-season guide (Pitching, 10/20) ([guide.hackutd.co](https://guide.hackutd.co)): **3 minutes to pitch and 2 minutes for judge questions**. Flow: problem, solution, demo, impact, questions. Keep the demo video **under 2 minutes**. Use a compelling thumbnail, a memorable name, and a description that states the problem and solution quickly. Judges may see the Devpost page, thumbnail, name, description or video first. Assign roles: storyteller, demo driver, tech lead, closer. Source: [Pitching workshop](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md).
- Judging time: 1:00-4:00 pm. The site does not say whether judging is at tables, how many judges visit, or whether sponsors judge their own tracks.

### Fallback: 2025 HackUTD format (label: past year)
From the [2025 Devpost guide](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/src/components/DevpostGuide/DevpostGuide.jsx): final submission was due Sunday noon; **demo video required**, public link, "ideally about 2 minutes"; **public GitHub repo required** (private repos are a disqualification risk); one submission per team; invite every teammate or they are not prize-eligible; list each teammate's school; judges skim the Project Overview first and verify through the repo; say what is demo-ready versus prototype; screenshots or GIFs recommended.

### Not found (verify on the Devpost page)
- Any hard video length cap for 2026. **No cap found.** HackUTD guidance is "under 2 minutes".
- Judging criteria and weights for the General Track.
- Whether the demo video is mandatory in 2026 (assume yes).
- Whether the public repo is mandatory for all tracks (assume yes; it is explicitly required for Spacetime).
- How the late "initial Devpost deadline" is enforced.

### Judging platform
hackutd.co mentions Jury, an open-source pairwise judging platform ([hackutd/jury](https://github.com/hackutd/jury), inspired by [Gavel](https://github.com/anishathalye/gavel)). The page presents it as an open-source project, not as the 2026 process, so do not assume it. If pairwise judging is used, judges compare two projects at a time, which rewards a clear one-sentence differentiator and a first impression that holds after a quick look.

## 8. What wins hackathons (synthesis)

Sources: [MLH judging plan](https://guide.mlh.com/general-information/judging-and-submissions/judging-plan) (fetched), [HackUTD pitching workshop](https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md) (fetched), [Devpost submission advice](https://dev.to/jacklyn/how-to-make-your-devpost-submissions-not-suck-37i0) (fetched), [Hackathon.com video tips](https://tips.hackathon.com/article/creating-the-best-demo-video-for-a-hackathon-what-to-know) (fetched). Items marked (search only) came from search-result snippets, not full pages.

- **Table judging is short.** MLH recommends science-fair-style, in-person judging, each project seen by at least 3 judges, about 3-4 minutes per team (about 2 minutes presenting and demoing, 1 minute questions), and stack-ranking top 3 per judge set. MLH tells hackers to have a 2-minute demo video available and to keep the project number visible. Plan for a judge arriving mid-sentence.
- **Devpost pages are often the main view.** Judges can spend about five minutes per project, so the write-up may be most of what they see (Devpost advice article). Keep the template headings; put sponsor-prize details up front (which product, why, what it does in the project); tailor the text to the published criteria; do not leave the video to the last hour.
- **Demo first.** "Open by demonstrating your project right away" and cut long intros (Hackathon.com). Videos are usually capped around 3 minutes and some judges stop at 3 (search only). Show the working product, not code (search only).
- **Pitch as a story, not a status report.** Problem, solution, demo, impact, next. Speak as if persuading an investor, rehearse once, and know who talks when (HackUTD workshop).
- **Common mistakes:** rushing the submission on the last morning; deleting template headings; burying sponsor-specific information; ignoring the judging criteria; leaving the video to one person at the end; missing required items (repo, video) before the deadline; a pitch that reads like a feature list; claiming integrations that are not there.

## 9. Work plan, backward from noon

Times are CST, Sunday 8 Nov. Adjust for sleep. The only fixed points are 12:00 (hard deadline) and 1:00 pm (judging).

| Time | Task |
|---|---|
| Now (about 02:00) | Confirm a Devpost project exists and teammates are invited. Confirm the track list with the student. Decide go or no-go on 5a and 5b. |
| 02:00-05:00 | 5a: Spacetime module and client wiring. Get the booth access code if needed. |
| 05:00-06:30 | 5b: Nemotron tool-calling script feeding `propose_action`. Save one recorded response as the fallback. |
| 06:30-07:30 | Rename to Claura in the prototype. Fix or relabel every integration claim. Deploy to claura.tech and check that `?play=1` works there. |
| 07:30-09:00 | Re-record dashboard footage, finish the video (VIDEO-NOTES.md), upload it, test the link while logged out. |
| 09:00-10:30 | Fill Devpost from DEVPOST.md. Add screenshots, thumbnail, repo, video, tracks. Edit the "planned" sentences to match what shipped. |
| 10:30-11:00 | Submit. Re-open the public page logged out and check every link. |
| 11:00-12:00 | Buffer only. No new features. Rehearse PITCH.md twice with a timer. |
| 13:00-16:00 | Judging. |

## 10. Submission checklist

Devpost
- [ ] Devpost account for every teammate; all invited to the project; school listed for each
- [ ] Project name: Claura. Tagline: "Seal the breach before it spreads."
- [ ] Elevator pitch (short field; check the character limit in the form)
- [ ] Thumbnail / first image is the approval card or the full console, readable at small size
- [ ] Description pasted from DEVPOST.md, with every `[UPDATE IF ...]` marker resolved
- [ ] Demo video link (public or unlisted, plays logged out), under 2 minutes
- [ ] Public GitHub repo link; no secrets in history; README with run instructions and a "what is real / what is scripted" section
- [ ] "Try it out" link: claura.tech (confirm it serves the prototype; confirm `?play=1` works)
- [ ] Screenshots: nominal, breach, approval card, contained, report (files exist in `/Users/abd/repos/bulkhead/shots/`; re-shoot after the rename)
- [ ] Sponsor tracks selected (max 3 reported); each one has a sentence in the description that names the sponsor's technology and what it does in the project
- [ ] Optional HackUTD track (Design or Virality), one only
- [ ] Submit, not just save. Re-open the public project page and check it.

Prototype
- [ ] Rename Bulkhead to Claura: `index.html` title and meta, header wordmark, favicon comment, optional internal names
- [ ] Every "SpacetimeDB" and "Nemotron" label is true or says "planned"
- [ ] Demo numbers visibly marked illustrative: the 9.4 s, 2,048 hosts, 61,207 agents, 11.8 s mean, INC-0418 at 8.1 s
- [ ] Production build runs (`npm run build`); `?play=1` autoplay works; ⌘↵ and the Approve button both work

Table
- [ ] Project number visible at the table
- [ ] Laptop charged, brightness up, screen sleep off, notifications off
- [ ] Prototype running locally as well as at claura.tech (venue Wi-Fi can fail)
- [ ] Screen recording of the full run on the desktop as a last-resort fallback
- [ ] Roles assigned (HackUTD workshop): storyteller, demo driver, tech lead, closer

## 11. Questions to settle with organizers or on the Devpost page
1. Was a draft Devpost project required by Saturday 11:15 pm, and what happens if a team missed it?
2. Is the cap three sponsor tracks (as the Devpost summary says) or two (as in 2025)?
3. Is there a video length limit on the 2026 form?
4. Do sponsor judges judge their own tracks at the table, and are those separate from General judging?
5. Which exact Nemotron model should NVIDIA's challenge accept (any Nemotron, or a specific family)?
6. Does Spacetime count a stateless helper script for calling Nemotron as "backend not on Spacetime"?

## Sources

Official event
- https://zeroday.hackutd.co/ (schedule, deadlines, challenge texts; fetched in full)
- https://hackutd-zeroday.devpost.com/ (HTTP 403 to my fetcher; facts via search-tool summary only)
- https://hackutd.co (organizer home; fetched)
- https://guide.hackutd.co (workshop list; fetched)
- https://github.com/hackutd/zero-day-2026 (event website repo; no challenge details)
- https://www.hackathonradar.com/database/hackathon/hackutd-2026-zeroday (aggregator; sponsors, prize pool)

HackUTD guidance (2025 season unless noted)
- https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/docs/Workshops/Pitching/index.md (pitching workshop; listed in the 2026-season guide)
- https://raw.githubusercontent.com/acmutd/hackutd-tech-guide/main/src/components/DevpostGuide/DevpostGuide.jsx (2025 Devpost guide)
- https://github.com/hackutd/jury and https://github.com/anishathalye/gavel (judging platforms)

Sponsors
- https://nmc2.com ; https://www.winstead.com ; https://clockworklabs.com/join
- https://spacetimedb.com/docs/databases/developing ; https://spacetimedb.com/docs/functions/reducers ; https://spacetimedb.com/docs/clients/connection ; https://spacetimedb.com/docs/clients/subscriptions ; https://spacetimedb.com/docs/how-to/deploy/maincloud
- https://build.nvidia.com/models ; https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b
- https://forums.developer.nvidia.com/t/request-to-increase-nvidia-nim-api-rate-limit-from-40-rpm-to-250-300-rpm/372594 (secondhand rate limit)
- https://dev.to/creeta/nemotron-3-ultra-went-live-june-4-heres-the-call-that-works-55g7 (third-party)

Judging and demos
- https://guide.mlh.com/general-information/judging-and-submissions/judging-plan
- https://dev.to/jacklyn/how-to-make-your-devpost-submissions-not-suck-37i0
- https://tips.hackathon.com/article/creating-the-best-demo-video-for-a-hackathon-what-to-know

VM escape evidence (used in PITCH.md)
- https://nvd.nist.gov/vuln/detail/CVE-2021-3546
- https://i.blackhat.com/asia-20/Thursday/asia-20-Shao-3D-Red-Pill-A-Guest-To-Host-Escape-On-QEMUKVM-Virtio-Device.pdf
- https://www.computerworld.com/article/1667668/pwn2own-ends-with-two-virtual-machine-escapes.html
- https://www.sentinelone.com/vulnerability-database/cve-2024-0099/ (third-party tracker; confirm in NVIDIA's bulletin)

## Winstead track: organizer clarifications (from the HackUTD Discord, answered by the track lead, 2026-11-07)
- **Attacker's reach:** unknown, so assume they can see normal communications. Ransomware has locked a substantial amount of data, phones are down and email is sporadic.
- **Where the command center runs** (inside the compromised network or outside it): "we will allow you to take a creative approach here, it's up to you."
- **Dashboard comms:** "the assumption is nobody has information. There needs to be a way for stakeholders to communicate and coordinate over the given issue."

**How Claura answers it:**
- **War Room:** an out-of-band coordination channel. It runs off the compromised network on SpacetimeDB's cloud (Maincloud) and uses break-glass identities issued before any incident. It doesn't need email or phones.
- **Scribe's brief:** a plain-language brief for non-technical stakeholders, covering what we know and what we don't know yet.
- **Coordination:** channels by role, tasks with owners, and a decision log in which the quarantine approval is recorded.
- **Notification clocks:** example obligations, to be confirmed with counsel.
- **On-prem agents:** Nemotron runs on-prem, so raw telemetry stays in the building. Only summaries, decisions and messages cross into the out-of-band plane.
