# Claura demo film: notes

**Final (mono, 2026-11-08 10:25):** `renders/claura.mp4`, 1920x1080, 30 fps, **118.0 s** (3540 frames), H.264 (5.6 Mb/s)
+ AAC 256k stereo 48 kHz, 86.0 MB. Loudness (ffmpeg ebur128): **-14.8 LUFS integrated, true peak -1.8 dBTP**, LRA 2.3 LU.
The straight HyperFrames render (`renders/claura-raw.mp4`, -16.2 LUFS / -1.1 dBTP) gets +1.5 dB and a -2 dBFS limiter on
the audio only (video copied bit-for-bit, same video MD5 7f22bd0f...). Contact sheet of the final (one frame every 3 s
from 0 s, row by row): `review/final-mono-contact.png`. Exports: `~/Downloads/Claura/Claura-demo.mp4` (= final),
`Claura-demo-720p.mp4` (x264 crf 27, AAC 128k, faststart, 11.0 MB, -14.9 LUFS / -1.4 dBTP), `Claura-thumbnail.png`
(1920x1080, 64.45 s built `--no-captions`: the sealed rack with the green orb and "Contained 9.4 s, in our simulation";
= `review/mono-thumbnail.png`); the site copies are `bulkhead-site/public/media/claura-demo.mp4` (= the 720p) and
`claura-poster.png` (= the thumbnail; the console screenshot that was there from 09:53 is kept in
`review/site-poster-console-0953.png`). The colour cut: `renders/claura-v1-color.mp4` (+ `claura-v1-color-raw.mp4`),
`review/final-contact.png`, and the `*-v1-color*` files in `~/Downloads/Claura/`. Earlier drafts: `renders/claura-draft.mp4`,
`claura-draft-v1.mp4` (stills only). Look: `SPEC.md`.

## Final cut, mono (2026-11-08 10:10-10:25)

Re-timed to the re-recorded mono clips (`assets/clips/`, `design: "mono"`; the colour takes are in `assets/clips-orig/`,
none were needed). Every map point was moved by its nearest key event (`events/*.json`, old -> new); a frame
cross-correlation of old vs new at those points showed no layout shift except `reports` (below). Changes in `film.config.mjs`:
- agents `[0.73, 1.915 ("Show reasoning" click 1.907), 2.335, 2.935]`; sentry / triage / warden `+0.01` (0.87 ... 2.13,
  2.13 ... 3.80 hold, 3.80 ... 4.19 hold); policy `0.44 -> 4.68` (hoverReimage 0.074 earlier); warroom `0.78 / 3.38 / 5.98`;
  scope `0.70 / 4.26 (click 4.24) / 5.21`; reports `0.15 / 0.69 / 1.73 / 2.10 | 5.945 / 6.545`; pick hold `3.775` (click 3.786).
- **approve:** `[6.467, 6.967 hold, 8.02, {abs 60.485} 8.417, end 8.8]`. In the mono take the click event is 8.372 and the
  first pressed frame (button #D70015) is frame 505 = 8.417; mapped to the hit, the render shows the bright button at
  60.467 and the pressed one at **60.500**, the first frame after 60.485 (checked in `renders/claura.mp4`), the flash at
  60.533, the iris from 60.567.
- **access:** the mono take types **"Outside counsel"** (matches the VO; the code card reads "Code ready for Outside
  counsel"). `[3.12, 3.94, 4.99, 5.99, {abs 76.485} 6.27, 7.0 | isolation 2.55 -> 3.7]`: codeShown moved 6.083 -> 6.133
  and the crossfade 3 frames later, so 6.27 keeps "readable on the beat, crisp ~0.1 s later" (76.5 readable, 76.6 crisp).
- **shell** (re-paced take, 13.6 s): `[0 1.62, 1.55 2.708, 1.75 2.946, 2.55 3.804, 3.55 5.224, 4.1 5.578, end 7.45]`, the
  same beats as before (sheet, Request access, passkey, Touch ID done, Approve as IC, terminal) at near real speed (0.7-1.5x).
  The 'a second approver' camera key now goes to v 0.6 (0.15 s earlier): the mono "Approve as Incident Commander" button is
  white and sat under the captions (white text on a grey scrim); it is now above them.
- **Rings:** agents "on-prem with NVIDIA Nemotron" u 0.3264-0.4725 (was clipped on the right and cut "reason"); reports
  NIST u 0.3413-0.4617 (cut "in" and "written"). **reports:** the mono take's report title wraps to two lines next to a new
  "Anchor evidence on Solana devnet" button, so everything below it sits 30 px (v 0.0278) lower than in the colour take:
  the phase-status, hashed, chain and custody rings and the camera keys after the scroll are shifted by +0.0278.
- Checked: `npm run check` ok (0 errors, the same kept warnings); snapshots of every ring and footage beat (proxy, then the
  masters), `snapshot --review` (46 beats, 24 seams) looked at; the final's contact sheet looked at; blackdetect: none;
  freezedetect: only the end-card hold (115.3 s on). Render 1m 01s.

## Mono re-skin (2026-11-08, approved design; look: `SPEC.md` LOOK)

The colour cut is kept: `renders/claura-v1-color.mp4` (= the old `claura.mp4`), `~/Downloads/Claura/Claura-demo-v1-color.mp4`,
`Claura-demo-v1-color-720p.mp4`, `Claura-thumbnail-v1-color.png`; its sources (src, tools, config, 3D bundle, brand) are in
`.backup-v1-color/`. What changed (colour and material only; layout, timing, motion, transitions unchanged):
- `src/common.css`: mono tokens (ink #F5F5F7/#A1A1A6/#6E6E73, red #FF3B30, orange #FF9F0A, green #30D158), black wallpaper
  with grey lights, faint red ember (breach), no green wash (contained), white bloom on the drop; graphite glass (blur 30,
  saturate 1.15, 16 % specular edge); `.glass.safe` neutral; red primary button, hot chips, stamps and hot focus rings;
  graphite traffic lights; signal chips = orange dot + white key; `.chip.warn` added. `src/index.html`: ground + accent var.
- Every literal colour in `src/*.html`, `src/kit/*`, `film.config.mjs` went through `tools/mono-remap.mjs` (copied from the
  product's mono theme; meant for colour originals: on the mono sources it only nudges #E5E5EA / #F5F5F7 to pure grey). Hand edits: avatars graphite, the gate's "Needs a human" lights orange, Contained in
  white with a green dot, fingerprints graphite with a red ring, vision nodes all-grey (all clear), FIN-02 lock fill lighter.
- Brand: the mark is light-grey C #E5E5EA + red orb (green once sealed) everywhere (reveal, oob, endcard lockup, kit), the
  end card uses the new `claura-brand/app-icon-1024.png` (copied to `assets/brand/`). For a red C: replace `#E5E5EA` with
  `#FF3B30` in src/reveal.html, oob.html, endcard.html, kit/lockup.html, kit/mark.html, and drop the ring lines in mono-3d.
- 3D: `tools/mono-3d.mjs` re-tinted `assets/vendor/facility.global.min.js` (grey racks, red breach glow and labels, grey
  cradle ring, green sealed orb, floor glow halved). Run it on the colour original only (`.backup-v1-color/assets/vendor/`).
- `sync` now shows the mono product stills (`assets/shots/mono/incident-*.png`, from ~/Downloads/Claura/ui-mono).
- `tools/build.mjs`: a cached freeze frame (`assets/clips/stills/`) is re-extracted when its clip is newer, so the
  re-recorded clips can never show an old colour hold.
- `review/mono-thumbnail.png` = the new `~/Downloads/Claura/Claura-thumbnail.png` (64.45 s, built `--no-captions`).
- Checked: `npm run check` passes in this project with the re-recorded mono clips (10:05 build; 0 errors, the same kept
  warnings as before), and in a scratch copy with the old clips; stills looked at for every non-footage beat and a few
  footage beats. Not rendered here; the maps, rings and holds were re-timed and the film rendered in the final cut
  (see "Final cut, mono" above).

Everything is generated: edit `film.config.mjs` and `src/*.html` (never `index.html` or `compositions/`), then
`node tools/build.mjs`. Scenes start on phrases of the voice-over, so a new VO take re-times the film.
`review/timing.json` lists every word, scene, cue and caption group as resolved.

## Scenes

Footage beats now play the product's own screen recordings (`assets/clips/*.mp4`, 3456x2160 at 60 fps, the
web app at 1728x1080 CSS px). "map" is the scene-time -> clip-time map (see below); "hold" = a freeze frame from the clip.

| # | id | kind | film time | VO line | on screen (clip, clip seconds) | in |
|---|----|------|-----------|---------|-------------------------------|----|
| 1 | email | glass | 0.00-1.68 | The attacker is reading your email. | Mail window; a ghost cursor reads the bridge email; "Unknown reader" | (frame 0) |
| 2 | outage | glass | 1.68-5.22 | Your phones are down. Ransomware has the file share. | Phone: Call failed, No Service; FIN-02 locks folder by folder | morph (reveal) |
| 3 | breach | 3D | 5.22-15.80 | In your data center... A shell where no shell should be. | DFW-2, B14 goes orange; Hall B, rack 14; three signal chips | zoom |
| 4 | tools | glass | 15.80-22.48 | Six warnings in six tools... Nobody has the whole picture. | Chips into 3 of 6 tool windows; NO MATCH; collapse to one point | cut (carry) |
| 5 | reveal | glass | 22.48-25.88 | This is Claura, the immune system for AI data centers. | DROP 22.485: orb, C sweep, wordmark | cut on the drop |
| 6 | oob | diagram | 25.88-29.66 | Its command center runs outside your network, with its own identities. | Command-center pane beside "Your network: compromised" | cut (carry) |
| 7 | agents | **agents.mp4** | 29.66-34.31 | Its agents run NVIDIA Nemotron on-prem, calling tools step by step. | Agents page held 0.73-1.915 while "on-prem with NVIDIA Nemotron" is ringed (z 1.95); Sentry "Show reasoning" click (1.907) on "calling"; tool calls ringed step by step (z 2.3) | zoom (agents chip) |
| 8 | sentry | **incident-run.mp4** 0.87-2.13 | 34.31-37.54 | Sentry connects the signals and opens the incident. | play(): Sentry goes Watching -> Correlating and types the signals (z 2.05); incident header "INC-0419 b14-gpu-07" ringed | whip |
| 9 | triage | **incident-run** 2.13-3.80, hold | 37.54-42.37 | Triage checks inventory and reachability: one host, eleven neighbors. | The page glides down at real speed; Triage "mgmt plane is reachable" ringed; "Cordon host b14-gpu-07", "Fail over 11 co-resident guests" | cut (continuous) |
| 10 | warden | **incident-run** 3.80-4.19, hold | 42.37-46.06 | Warden proposes containment, reversible steps first. | Warden row, Containment card (2 of 7 done), "Reversible steps first: cut the network, pull credentials, cordon the host." | cut (continuous) |
| 11 | policy | **policy.mp4** 0.44-4.68 (0.84x) | 46.06-51.13 | Every proposal hits a policy gate. Policy, not the model, decides. | "Policy checks" ringed; the headline; the cursor rests on Reimage host (locked off) on "decides" | whip |
| 12 | probe | diagram | 51.13-54.72 | Our red-team probe tries to reimage the host. Denied. | reimage_host(b14-gpu-07) into the policy gate; DENIED | zoom (Reimage host row) |
| 13 | approve | **incident-run** 6.467-8.8, hold 6.967 | 54.72-60.49 | Quarantine needs a human. Evidence, scope, rollback, one card. Command-Enter. | The Quarantine sheet arrives with the morph and holds while "needs a human", Evidence, Scope, Rollback are ringed (z 2.15); the cursor glides in; **first pressed frame of Approve (clip 8.417) on the frame after 60.485** (the music hit), with the keycaps and the flash | morph (reveal from the gate card) |
| 14 | contained | 3D | 60.49-64.79 | Contained. Nine point four seconds, in our simulation. | Rack 14 sealed, orb green, "9.4 s, in our simulation" | iris from the button |
| 15 | warroom | **warroom.mp4** 0.78-5.98 | 64.79-74.33 | Then the people. The War Room... Scribe's brief... | Out-of-band banner, People (legal, CEO, IC), #command where Scribe's "Report INC-0419 filed" lands, the brief: what we know / don't know yet | whip |
| 16 | access | **access.mp4** 3.12-7.0 + **isolation.mp4** 2.55-3.7 | 74.33-79.97 | Outside counsel joins with a single-use break-glass code. No email. No SSO. | "Outside counsel" typed, Legal counsel role, Issue; **the code card lands on 76.485** (clip 6.27, readable on the beat, crisp +0.1 s); jump cut to the "Isolated by design" popover: Corporate email, Corporate SSO ringed | whip |
| 17 | scope | **scope.mp4** 0.70-5.21 | 79.97-85.66 | Data scope tracks every asset: intact, exfiltrated, or locked by ransomware. | Summary (7 assets), "2 intact", "1 exfil suspected"; the click opens Corporate file share FIN-02; push to "184K locked / Locked (ransomware)" (z 2.4) | cut |
| 18 | reports | **reports.mp4** 0.15-2.10, jump to 5.945-6.545 | 85.66-91.16 | The record follows NIST, with live phase status and a hashed chain of custody. | "NIST SP 800-61 structure" ringed; the page glides to the response phases (Eradication current, mid-frame); jump cut to the evidence: SHA-256 and custody | whip |
| 19 | pick | **overview-3d.mp4** 2.0-3.775, hold | 91.16-93.27 | Need hands on a host? Click it. | The product's own 3D overview; the cursor finds b14-gpu-07 and clicks on "Click it"; the frame holds on the click | whip |
| 20 | shell | **shell.mp4** 1.62-7.45 (re-paced mono take) | 93.27-98.64 | A short-lived certificate, Touch ID, a second approver. Every session recorded. | Request sheet ("Certificate lasts up to 15 min" ringed), Request access, passkey sheet (Touch ID), Waiting for an approver, Approve as Incident Commander, the recorded read-only terminal ("Recording" ringed) | iris from the clicked host |
| 21 | sync | diagram (2 stills) | 98.64-103.39 | And every screen updates live, through SpacetimeDB subscriptions. | Two consoles (RK, JT) flip breach -> contained on the same frame | morph (the terminal flies into console A) |
| 22 | vision | 3D + diagram | 103.39-109.97 | Next: an immune system for every AI cloud... never tenant data. | ROADMAP; the sealed rack pulls back to the whole facility (1.35 s fly), which shrinks into a node of a network of AI clouds; fingerprints travel; "Never tenant data" | zoom (SpacetimeDB pill) |
| 23 | endcard | glass | 109.97-118.00 | Claura. Your network is compromised. Your command isn't. | App icon lands on 110.485, lockup, tagline, claura.tech, github.com/zero-abd/claura, HackUTD 2026; holds 4.5 s | morph (reveal from the centre node) |

Transition kinds (22 seams): morph 4, zoom through 4, whip 6, iris 2, cut 6 (all carries or one continuous take).
Captions: word-synced, 46 px on a dark scrim; hidden on `reveal` and `endcard`. Honest labels: "Simulated attack replay ·
live software" (first 3D shot), "in our simulation" (9.4 s), "Roadmap" (vision).

**Still images left:** `sync` shows two product stills (`incident-breach`, `incident-contained`) inside its labelled diagram.
`probe`, `oob`, `vision` are labelled diagrams; `email`, `outage`, `tools`, `reveal`, `endcard` are motion graphics; `breach`,
`contained`, `vision` draw the live three.js facility. No footage beat uses `assets/shots/` any more; the four holds
(`triage`, `warden`, `approve`, `pick`) are freeze frames of the recordings (`assets/clips/stills/`).
Unused clips: `console-test`, `webauthn-io-test` (tests), `agents` 3-8 s (Warden's card and policy bounds), `shell` 7.45-13.6
(the end of `ps`, `rm -rf` denied by policy at 8.5, the summary with the recording hash at 10.1) - the line is over before those.

## Clip maps

```js
clip: { src: C('incident-run'), map: [[0, 6.467], [0.7, 6.967], [4.55, 6.967], [5.45, 8.02], [{ abs: HIT.payoff }, 8.417], ['end', 8.8]] },
```

Pairs `[sceneT, clipT, src?]`: at scene time `sceneT` the clip shows second `clipT`; between pairs it plays at
(clip delta / scene delta), which must be 0.1-10x (the build throws otherwise). Equal `clipT` on consecutive pairs is a
**hold**: the build extracts that frame once with ffmpeg (`assets/clips/stills/<clip>-<t>.png`) and shows it as an image.
Two pairs at the same `sceneT` are a **jump cut**; a third element switches the **source** from that pair on (access cuts to
`isolation.mp4`). Scene times can be phrases, `{abs}` film times, `'end'` (scene end incl. overlap) or `'cut'`. Each
segment is one `<video>` (`data-media-start`, `data-playback-rate`). Camera keys and rings are in 0..1 footage coordinates.
`FILM_CLIPS=proxy node tools/build.mjs` builds against `assets/clips/proxy/` (1728x1080) for fast checks and snapshots;
the delivery build uses the masters. The renderer handles both; the masters add ~15 s of frame extraction on the first
render (cached after) and are visibly sharper at the 2-2.4x push-ins, so the final uses them.
Event times per clip: `assets/clips/events/<name>.json` and `manifest.json` (`keyEvents`). Note a click's `mark` comes
~0.06 s before its `click` event; the approve press is mapped to the first frame where the button darkens (mono take:
click 8.372, pressed frame 505 = 8.417; the colour take used 8.433). Find it by sampling the button colour frame by frame.

Text size: footage is drawn at 1520 px for 1728 CSS px (0.88), so on-screen px = CSS px x 0.88 x zoom. The named text at
each push is >= 26 px: 13.5 px terminal at z 2.2 (26.1), 12.5 px status pill at z 2.4 (26.4), 15 px rows at z 2.0-2.3.

## Morph (reveal)

`K.morphIn` now grows the incoming scene's own content out of the outgoing pane's rect (uniform scale, `fit: contain` or
`cover`) inside a rounded clip that opens to the frame, with a glass rim (`#P-fx-rim`) flying from the old rect to the
target; the outgoing pane keeps its content until the last 0.1 s. No frame shows an empty glass pane or bare wallpaper
(was 0.2-0.35 s at email -> outage, probe -> approve, vision -> endcard). The old ghost-pane morph is `morph: { ghost: true }`.

## Commands

```sh
cd /Users/abd/repos/bulkhead-film
unset NODE_USE_SYSTEM_CA
export PATH="$PWD/tools/bin:/Users/abd/repos/bulkhead-studio/bin:$PATH" DO_NOT_TRACK=1   # ffprobe + ffmpeg
node tools/build.mjs                                   # (FILM_CLIPS=proxy for fast iteration)
npx --yes hyperframes@0.9.23 check                      # gate (or sh tools/check.sh for a short summary)
npx --yes hyperframes@0.9.23 snapshot --review          # beat, seam and phone sheets
npx --yes hyperframes@0.9.23 render --quality delivery -o renders/claura-raw.mp4     # ~2 min on this Mac, 5 workers
ffmpeg -i renders/claura-raw.mp4 -map 0:v:0 -map 0:a:0 -c:v copy \
  -af "volume=1.5dB,alimiter=limit=0.7943:attack=5:release=80:level=false" -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart renders/claura.mp4               # master: -14.8 LUFS, -1.8 dBTP
ffmpeg -i renders/claura.mp4 -af ebur128=peak=true -f null -                         # measure
ffmpeg -i renders/claura.mp4 -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart ~/Downloads/Claura/Claura-demo-720p.mp4
```

`tools/bin/ffprobe` wraps Remotion's bundled ffprobe (bulkhead-studio/bin only has ffmpeg). The 3D is the bulkhead-3d module
(`assets/vendor/facility.global.min.js`), drawn from `hf-seek` by `K.facility`. Audio: VO 1.0; music 0.5 with a volume lane
built from the VO words (-7 dB under speech, -3 dB for 0.9 s after the hits 22.485 / 60.485 / 76.485 / 110.485); SFX on
the clicks (60.485, 76.485, "Click it"), stamps and transitions.

## Review (measured, looked at, not heard)

- `check`: ok, 0 errors. Kept warnings: `nested_media_start_basis_ambiguous` x24 (the clip segments' `data-start` is
  scene-local on purpose), `duplicate_media_discovery_risk` (sync shows one still in two consoles), `composition_heavy_overlay_count_high`
  (tools: 30 glass/blur elements, under ~40), `text_below_floor` on the "IB" avatar and the tool windows while they collapse
  (0.5 s), `composition_file_too_large`, and info: the warroom opener (z 1.15) shows the window edge on purpose.
- `snapshot --review`: all 46 beat frames, 24 seam strips and the phone sheet looked at; P0/P1 found and fixed: the approve
  morph's clip did not interpolate (content clipped to the gate card for the whole morph; now driven from a tweened
  progress), the sync flip's blur, ring positions on the recordings, the code card mapped to its crossfade (moved to 6.22),
  the scope pill under 26 px, the vision opener (now pulls back from the sealed rack: no near-empty frame at 104 s), and the
  device's top/left edges in the agents and policy openers.
- The final: 118.000 s, 1920x1080, 30 fps, audio present; `review/final-contact.png` looked at; the frames around 60.485
  checked: the recording's mouse-down frame, the keycap press and the button flash land on the hit, the iris opens at 60.49.
- The mono final: the same checks (`review/final-mono-contact.png`; pressed button on 60.500, code card readable on
  76.500); see "Final cut, mono" above.
- Sound measured (ebur128), not heard.

## Open issues

- **shell** ends on the terminal header ("Recording", the read-only banner) with `dmesg` and `ps` typed; the policy refusal
  of `rm -rf` (8.5) and the session summary with the recording hash (10.1) are in the re-paced `shell.mp4` but after the
  line (the scene ends on clip 7.45). About 3 s more VO would now let them in.
- **shell** terminal: for ~0.5 s after it opens, its banner is wrapped until the sheet widens (in the recording, both takes).
- **access** (fixed in the mono take): it types "Outside counsel", verbatim with the VO.
- **warroom** opens on a wide shot (z 1.15) where the window's sides are visible; kept as the establishing frame.
- The mix is mastered outside HyperFrames (gain + limiter); re-run that step after every render.
- The 3D scenes (breach, contained, vision) are live three.js and are most of the render time.
