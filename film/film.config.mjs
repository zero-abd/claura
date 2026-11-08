// film.config.mjs: the Claura demo film (HackUTD 2026). Built by tools/build.mjs into index.html + compositions/.
//
// Scenes are keyed by PHRASES of the voice-over (assets/vo/vo.json), so a re-recorded VO re-times everything.
// Every time inside params is a spec: number = scene-local seconds | "phrase" | {phrase, offset, n, edge} | {abs: filmSeconds}.
// Footage beats (template "footage") play the product's own screen recordings (params.clip; params.shots still works):
//   clip: { src: 'assets/clips/<name>.mp4', map: [[sceneT, clipT, src?], ...] }   -> see review/FILM-NOTES.md
//   (equal clipT on two pairs = a freeze; two pairs at one sceneT = a jump cut; a third element switches the source)
// Camera keys and focus rings are in 0..1 footage coordinates, so they keep working when a clip of the same screen
// (16:10, same layout) replaces a still.

// Music (assets/audio/music.mp3, edited to this cut, 120 BPM, bars at 0.485 + 2k s)
const HIT = { drop: 22.485, payoff: 60.485, hit2: 76.485, final: 110.485 };

// the three signal chips: where they land on the 3D shot, and where the tools scene picks them up
const SIGS = [
  { k: 'IOMMU fault', v: 'DMA outside guest range', x: 110, y: 150 },
  { k: 'GPU driver fault', v: 'vGPU mdev on b14-gpu-07', x: 110, y: 250 },
  { k: 'Shell', v: 'qemu spawned /bin/sh', x: 110, y: 350 },
];
// the mark's landing spot in the command-centre pane (reveal -> oob carry)
const MARK_TO = { x: 1270, y: 214, h: 76 };

const S = (name) => `assets/shots/${name}.png`;
const C = (name) => `assets/clips/${name}.mp4`; // masters (3456x2160); FILM_CLIPS=proxy node tools/build.mjs uses assets/clips/proxy/
const DARK = 'rgba(10, 14, 32, 1)';

export default {
  vo: { json: 'assets/vo/vo.json', audio: 'assets/audio/vo.mp3', volume: 1 },
  total: 118.0,
  lead: 0.25,
  music: {
    src: 'assets/audio/music.mp3', start: 0, volume: 0.5, fadeIn: 0, fadeOut: 0.6,
    // duck about 7 dB under the voice (volume lane from the VO word times); lighter on the four music hits
    duck: { db: -7, attack: 0.12, release: 0.4, merge: 0.55, hits: [HIT.drop, HIT.payoff, HIT.hit2, HIT.final], hitDb: -3, hitHold: 0.9 },
  },
  captions: { maxWords: 6, maxChars: 38, pause: 0.3, hide: ['reveal', 'endcard'], replace: { 'Spacetime DB': 'SpacetimeDB' } },
  autoSfx: {
    zoom: [{ src: 'assets/sfx/zoom.mp3', volume: 0.32 }],
    whip: [{ src: 'assets/sfx/whip.mp3', volume: 0.26 }, { src: 'assets/sfx/swipe.mp3', volume: 0.3 }],
    morph: [{ src: 'assets/sfx/whoosh.mp3', volume: 0.22, offset: -0.05 }],
    iris: [{ src: 'assets/sfx/swell.mp3', volume: 0.3, offset: 0 }],
  },
  sfx: [
    { src: 'assets/sfx/tick.mp3', at: 'reading', offset: -0.02, volume: 0.35 },
    { src: 'assets/sfx/thunk.mp3', at: 'has the file share', offset: -0.05, volume: 0.35 },
    { src: 'assets/sfx/pop.mp3', at: 'I. O. M. M. U.', offset: 0.1, volume: 0.2 },
    { src: 'assets/sfx/pop.mp3', at: 'G. P. U. driver', offset: 0.05, volume: 0.2 },
    { src: 'assets/sfx/pop.mp3', at: 'shell where', volume: 0.22 },
    { src: 'assets/sfx/thunk.mp3', at: 'playbook', offset: 0.12, volume: 0.5 },
    { src: 'assets/sfx/thunk.mp3', at: 'Denied', offset: 0.02, volume: 0.55 },
    { src: 'assets/sfx/click.mp3', at: HIT.payoff - 0.01, volume: 0.7 },
    { src: 'assets/sfx/click.mp3', at: HIT.hit2 - 0.01, volume: 0.5 },
    { src: 'assets/sfx/click.mp3', at: 'Click it', offset: 0.12, volume: 0.55 },
  ],

  scenes: [
    // 1 ------------------------------------------------------------------ hook
    { id: 'email', starts: 0, tone: 'nominal', toneTo: 'breach' },
    { id: 'outage', starts: 'Your phones are down', lead: 0.1, tone: 'breach',
      in: { type: 'morph', from: [250, 120, 1420, 780, 28] } },
    { id: 'breach', template: 'facility', starts: 'In your data center', tone: 'nominal', toneTo: 'breach',
      in: { type: 'zoom', rect: [878, 172, 72, 72, 20], color: DARK },
      params: {
        track: [
          { t: 0, state: 'nominal', cam: { preset: 'facility', az: 39 } },
          { t: 0.01, cam: { preset: 'facility', az: 46 }, fly: 2.0 },
          { t: { phrase: 'breaking out', offset: -0.25 }, state: 'breach' },
          { t: { phrase: 'An I. O. M. M. U.', offset: -0.6 }, cam: 'hallB', fly: 1.7 },
          { t: { phrase: 'A shell where', offset: -0.7 }, cam: 'rack14', fly: 1.9 },
        ],
        tone: [{ t: { phrase: 'breaking out', offset: -0.2 }, from: 'nominal', to: 'breach', dur: 1.0 }],
        worldOut: 0.5,
        tag: 'Simulated attack replay · live software', tagAt: 0.45, tagUntil: { phrase: 'An I. O. M. M. U.', offset: -0.4 },
        sigs: [
          { ...SIGS[0], at: { phrase: 'I. O. M. M. U.', offset: 0.1 } },
          { ...SIGS[1], at: { phrase: 'G. P. U. driver', offset: 0.05 } },
          { ...SIGS[2], at: { phrase: 'shell where' } },
        ],
      } },
    { id: 'tools', starts: 'Six warnings in six tools', tone: 'breach',
      cues: { collapse: { abs: 21.95 } },
      params: {
        sigs: SIGS,
        wins: [
          { ...SIGS[0], x: 80, y: 90, w: 700, tool: 'Hypervisor log', carry: 0 },
          { ...SIGS[1], x: 1080, y: 70, w: 760, tool: 'GPU telemetry', carry: 1 },
          { ...SIGS[2], x: 60, y: 400, w: 560, tool: 'Host EDR', carry: 2 },
          { x: 1300, y: 380, w: 560, tool: 'Network IDS', k: 'New flow', v: 'to mgmt VLAN 40' },
          { x: 220, y: 690, w: 540, tool: 'Identity', k: 'Token reuse', v: 'from vm-7f3a' },
          { x: 1140, y: 680, w: 620, tool: 'BMC / IPMI', k: 'Login attempt', v: 'from b14-gpu-07' },
        ],
      } },
    // 7 ------------------------------------------------------------------ the drop: reveal
    { id: 'reveal', starts: 'This is Claura', lead: 0.025, tone: 'breach',
      cues: { drop: { abs: HIT.drop } }, params: { markTo: MARK_TO } },
    { id: 'oob', starts: 'Its command center', lead: 0.08, tone: 'breach' },
    // 9 ------------------------------------------------------------------ the agents (recorded clips from here on)
    { id: 'agents', template: 'footage', starts: 'Its agents run NVIDIA', lead: 0.05, tone: 'breach',
      in: { type: 'zoom', rect: [636, 668, 404, 58, 29], color: DARK },
      params: {
        title: 'Claura · Agents',
        // agents.mp4: the page holds while the line names NVIDIA Nemotron; Sentry's "Show reasoning" click (1.93) lands just
        // before "calling", its tool calls are open by "tools", then ringed step by step
        clip: { src: C('agents'), map: [[0, 0.75], [3.0, 1.93], [3.45, 2.35], ['end', 2.95]] },
        cam: [
          { t: 0, u: 0.42, v: 0.2, z: 1.6, fy: 365 },
          { t: { phrase: 'NVIDIA', offset: -0.45 }, u: 0.42, v: 0.155, z: 1.95, fy: 360, d: 0.8 },
          { t: { phrase: 'on-prem', offset: 0.3 }, u: 0.39, v: 0.47, z: 2.05, fy: 480, d: 0.7 },
          { t: { phrase: 'tools', offset: 0.05 }, u: 0.39, v: 0.66, z: 2.3, fy: 500, d: 0.6 },
        ],
        focus: [
          { t: 'NVIDIA', until: { phrase: 'on-prem', offset: 0.3 }, u0: 0.322, v0: 0.141, u1: 0.469, v1: 0.165 },
          { t: { phrase: 'tools', offset: 0.1 }, until: 'step by step', u0: 0.222, v0: 0.558, u1: 0.565, v1: 0.58 },
          { t: 'step by step', until: 'by step', u0: 0.222, v0: 0.59, u1: 0.53, v1: 0.632 },
          { t: 'by step', until: { phrase: 'step', n: 1 }, u0: 0.222, v0: 0.636, u1: 0.53, v1: 0.678 },
          { t: { phrase: 'step', n: 1 }, u0: 0.222, v0: 0.683, u1: 0.53, v1: 0.725 },
        ],
      } },
    // 10-12: sentry, triage, warden are one continuous take of the incident (incident-run.mp4)
    { id: 'sentry', template: 'footage', starts: 'Sentry connects', tone: 'breach', in: { type: 'whip', dir: 1 },
      params: {
        title: 'Claura · Incident INC-0419',
        // play() at 0.90: Sentry goes from Watching to Correlating and types the signals; then the incident header
        clip: { src: C('incident-run'), map: [[0, 0.86], [0.6, 1.0], [1.9, 1.62], [2.2, 1.86], ['end', 2.12]] },
        cam: [
          { t: 0, u: 0.40, v: 0.815, z: 2.05, fy: 722 },
          { t: { phrase: 'opens', offset: -0.4 }, u: 0.36, v: 0.26, z: 2.2, fy: 470, d: 0.6 },
        ],
        focus: [
          { t: { phrase: 'connects', offset: 0.1 }, until: { phrase: 'opens', offset: -0.4 }, u0: 0.255, v0: 0.806, u1: 0.57, v1: 0.853 },
          { t: 'incident', u0: 0.232, v0: 0.31, u1: 0.437, v1: 0.341, hot: true },
        ],
      } },
    { id: 'triage', template: 'footage', starts: 'Triage checks', tone: 'breach',
      params: {
        title: 'Claura · Incident INC-0419',
        // the page glides down at real speed (2.12-3.62), then holds on 3.79 while the line lands
        clip: { src: C('incident-run'), map: [[0, 2.12], [1.5, 3.62], [2.4, 3.79], ['end', 3.79]] },
        cam: [
          { t: 0, u: 0.36, v: 0.26, z: 2.2, fy: 470 },
          { t: 0.05, u: 0.52, v: 0.45, z: 1.55, fy: 520, d: 1.1 },
          { t: { phrase: 'reachability', offset: -0.55 }, u: 0.42, v: 0.6, z: 2.1, fy: 500, d: 0.6 },
          { t: { phrase: 'one host', offset: -0.3 }, u: 0.68, v: 0.64, z: 2.1, fy: 520, d: 0.6 },
        ],
        focus: [
          { t: 'reachability', until: { phrase: 'one host', offset: -0.3 }, u0: 0.258, v0: 0.586, u1: 0.495, v1: 0.646, hot: true },
          { t: 'one host', until: 'eleven', u0: 0.605, v0: 0.621, u1: 0.735, v1: 0.643 },
          { t: 'eleven neighbors', u0: 0.605, v0: 0.693, u1: 0.758, v1: 0.715 },
        ],
      } },
    { id: 'warden', template: 'footage', starts: 'Warden proposes', tone: 'breach',
      params: {
        title: 'Claura · Incident INC-0419',
        // Warden types its plan while the containment steps tick (3 to 5 of 7 done)
        clip: { src: C('incident-run'), map: [[0, 3.79], [1.9, 4.18], ['end', 4.18]] },
        cam: [
          { t: 0, u: 0.68, v: 0.64, z: 2.1, fy: 520 },
          { t: 0.1, u: 0.52, v: 0.64, z: 2.0, fy: 520, d: 0.9 },
        ],
        focus: [
          { t: { phrase: 'Warden', offset: 0.1 }, until: 'containment', u0: 0.24, v0: 0.655, u1: 0.5, v1: 0.722 },
          { t: 'containment', until: { phrase: 'reversible', offset: -0.1 }, u0: 0.598, v0: 0.5, u1: 0.83, v1: 0.785 },
          { t: 'reversible steps first', u0: 0.258, v0: 0.678, u1: 0.5, v1: 0.722, hot: true },
        ],
      } },
    { id: 'policy', template: 'footage', starts: 'Every proposal hits', tone: 'breach', in: { type: 'whip', dir: 1 },
      params: {
        title: 'Claura · Policy',
        // policy.mp4 at 0.85x: the cursor rests on the auto column, then Needs a human, then Reimage host (on "decides")
        clip: { src: C('policy'), map: [[0, 0.45], ['end', 4.75]] },
        cam: [
          { t: 0, u: 0.44, v: 0.23, z: 1.45, fy: 370 },
          { t: { phrase: 'policy gate', offset: -0.3 }, u: 0.44, v: 0.272, z: 2.05, d: 0.6 },
          { t: { phrase: 'Policy, not', offset: -0.15 }, u: 0.42, v: 0.2, z: 1.6, fy: 360, d: 0.6 },
          { t: { phrase: 'decides', offset: -0.25 }, u: 0.68, v: 0.53, z: 2.0, d: 0.6 },
        ],
        focus: [
          { t: 'policy gate', until: { phrase: 'Policy, not', offset: -0.15 }, u0: 0.336, v0: 0.255, u1: 0.436, v1: 0.29, hot: true },
          { t: { phrase: 'decides', offset: 0.3 }, u0: 0.618, v0: 0.535, u1: 0.935, v1: 0.578 },
        ],
      } },
    { id: 'probe', template: 'gate', starts: 'Our red-team probe', tone: 'breach',
      in: { type: 'zoom', target: { u0: 0.618, v0: 0.535, u1: 0.935, v1: 0.578, r: 14 }, color: DARK } },
    { id: 'approve', template: 'footage', starts: 'Quarantine needs a human', tone: 'breach',
      in: { type: 'morph', from: [446, 420, 600, 176, 36] },
      params: {
        title: 'Claura · Incident INC-0419',
        // incident-run.mp4: the Quarantine sheet arrives with the morph, holds while the card is read, the cursor glides in
        // and the press on "Approve quarantine" (mouse down at clip 8.433) lands on the payoff hit 60.485
        clip: { src: C('incident-run'), map: [[0, 6.48], [0.7, 6.97], [4.55, 6.97], [5.45, 8.05], [{ abs: HIT.payoff }, 8.433], ['end', 8.85]] },
        cam: [
          { t: 0, u: 0.5, v: 0.5, z: 1.3 },
          { t: { phrase: 'needs a human', offset: -0.45 }, u: 0.5, v: 0.45, z: 1.9, d: 0.9 },
          { t: { phrase: 'Evidence', offset: -0.3 }, u: 0.45, v: 0.52, z: 2.15, d: 0.5 },
          { t: { phrase: 'rollback', offset: -0.3 }, u: 0.55, v: 0.51, z: 2.15, d: 0.45 },
          { t: { phrase: 'one card', offset: -0.2 }, u: 0.5, v: 0.5, z: 1.55, d: 0.6 },
          { t: { phrase: 'Command-Enter', offset: -0.3 }, u: 0.5, v: 0.643, z: 2.0, fy: 430, d: 0.5 },
        ],
        focus: [
          { t: 'needs a human', until: { phrase: 'Evidence', offset: -0.3 }, u0: 0.348, v0: 0.345, u1: 0.556, v1: 0.383 },
          { t: 'Evidence', until: { phrase: 'scope', offset: -0.05 }, u0: 0.348, v0: 0.558, u1: 0.445, v1: 0.596 },
          { t: 'scope', until: { phrase: 'rollback', offset: -0.05 }, u0: 0.353, v0: 0.458, u1: 0.498, v1: 0.545 },
          { t: 'rollback', until: { phrase: 'one card', offset: -0.1 }, u0: 0.502, v0: 0.458, u1: 0.647, v1: 0.545 },
        ],
        keys: { at: { phrase: 'Command-Enter', offset: 0.02 }, t: { abs: HIT.payoff }, labels: ['⌘', '↵'], y: 640 },
        flash: [{ t: { abs: HIT.payoff }, u0: 0.355, v0: 0.614, u1: 0.645, v1: 0.672 }],
      } },
    // 13 ----------------------------------------------------------------- the payoff on the music hit
    { id: 'contained', template: 'facility', starts: { phrase: 'Command-Enter', offset: 0.555 }, lead: 0, tone: 'breach', toneTo: 'contained',
      in: { type: 'iris', x: 960, y: 430, dur: 0.42 },
      params: {
        track: [
          { t: 0, state: 'approval', progress: 1, cam: { preset: 'rack14', az: 22 } },
          { t: 0.1, state: 'contained', blend: 0.35 },
          { t: 0.3, cam: { preset: 'rack14', az: 33 }, fly: 3.9 },
        ],
        tone: [{ t: { phrase: 'Contained', offset: -0.05 }, from: 'breach', to: 'contained', dur: 1.0 }],
        counter: { at: { phrase: 'Contained', offset: -0.05 }, from: 0, to: 9.4, dur: 1.4, note: 'in our simulation', noteAt: { phrase: 'in our simulation', offset: -0.05 } },
      } },
    // 14 ----------------------------------------------------------------- the people
    { id: 'warroom', template: 'footage', starts: 'Then the people', tone: 'contained', toneTo: 'nominal', in: { type: 'whip', dir: 1 },
      params: {
        title: 'Claura · War Room',
        // warroom.mp4 at ~0.55x: Scribe's "Report INC-0419 filed" lands in #command around "one live channel"
        clip: { src: C('warroom'), map: [[0, 0.8], [5.0, 3.4], ['end', 6.0]] },
        cam: [
          { t: 0, u: 0.5, v: 0.45, z: 1.15 },
          { t: 0.1, u: 0.5, v: 0.45, z: 1.25, d: 1.5, ease: 'power1.inOut' },
          { t: { phrase: 'The War Room', offset: -0.2 }, u: 0.44, v: 0.2, z: 1.95, fy: 440, d: 0.6 },
          { t: { phrase: 'legal', offset: -0.25 }, u: 0.33, v: 0.68, z: 2.15, d: 0.6 },
          { t: { phrase: 'one live channel', offset: -0.2 }, u: 0.56, v: 0.66, z: 2.0, d: 0.6 },
          { t: { phrase: 'brief', offset: -0.55 }, u: 0.43, v: 0.28, z: 1.85, fy: 470, d: 0.6 },
          { t: { phrase: 'what we know', offset: -0.2 }, u: 0.68, v: 0.28, z: 2.05, fy: 470, d: 0.5 },
        ],
        focus: [
          { t: { phrase: 'War Room', offset: 0.15 }, until: { phrase: 'legal', offset: -0.25 }, u0: 0.226, v0: 0.092, u1: 0.585, v1: 0.124 },
          { t: 'legal', until: 'executives', u0: 0.222, v0: 0.757, u1: 0.357, v1: 0.792 },
          { t: 'executives', until: 'engineers', u0: 0.222, v0: 0.84, u1: 0.357, v1: 0.874 },
          { t: 'engineers', until: { phrase: 'one live channel', offset: -0.2 }, u0: 0.222, v0: 0.715, u1: 0.357, v1: 0.75 },
          { t: 'one live channel', until: { phrase: 'brief', offset: -0.55 }, u0: 0.378, v0: 0.455, u1: 0.748, v1: 0.505 },
          { t: { phrase: 'brief', offset: -0.1 }, until: { phrase: 'what we know', offset: -0.2 }, u0: 0.226, v0: 0.162, u1: 0.66, v1: 0.196 },
          { t: 'what we know', until: { phrase: "what we don't", offset: -0.05 }, u0: 0.688, v0: 0.165, u1: 0.93, v1: 0.29 },
          { t: "what we don't know yet", u0: 0.688, v0: 0.305, u1: 0.93, v1: 0.402 },
        ],
      } },
    { id: 'access', template: 'footage', starts: 'Outside counsel joins', tone: 'nominal', in: { type: 'whip', dir: 1 },
      params: {
        title: 'Claura · People & Access',
        // access.mp4: the name types, Legal counsel, Issue; the code card lands on the hit 76.485 (codeShown 6.083 is where its
        // crossfade starts; 6.22 on the hit puts the code readable on the beat, crisp 0.1 s later);
        // then a cut to the isolation popover (isolation.mp4) for "No email. No SSO."
        clip: { src: C('access'), map: [[0, 3.05], [0.95, 3.85], [1.5, 4.88], [1.95, 5.92], [{ abs: HIT.hit2 }, 6.22], [3.55, 6.95], [3.55, 2.55, C('isolation')], ['end', 3.7]] },
        cam: [
          { t: 0, u: 0.5, v: 0.4, z: 2.05, fy: 480 },
          { t: { phrase: 'single-use', offset: -0.4 }, u: 0.5, v: 0.55, z: 1.85, d: 0.5 },
          { t: { abs: HIT.hit2 }, u: 0.5, v: 0.45, z: 2.2, fy: 470, d: 0 },
          { t: { abs: HIT.hit2 + 0.01 }, u: 0.5, v: 0.45, z: 2.1, fy: 470, d: 0.45, ease: 'expo.out' },
          { t: 3.55, u: 0.725, v: 0.3, z: 2.38, fy: 470, d: 0 },
          { t: 3.56, u: 0.725, v: 0.3, z: 2.3, fy: 470, d: 0.45, ease: 'expo.out' },
        ],
        focus: [
          { t: { abs: HIT.hit2 + 0.3 }, until: 3.25, u0: 0.345, v0: 0.352, u1: 0.655, v1: 0.442 },
          { t: 'No email', until: { phrase: 'No S. S. O.', offset: -0.05 }, u0: 0.734, v0: 0.418, u1: 0.817, v1: 0.445 },
          { t: 'No S. S. O.', u0: 0.734, v0: 0.45, u1: 0.814, v1: 0.477, hot: true },
        ],
      } },
    { id: 'scope', template: 'footage', starts: 'Data scope tracks', tone: 'nominal',
      params: {
        title: 'Claura · Data scope',
        // scope.mp4 at ~0.9x: the click that opens "Corporate file share FIN-02" (4.28) lands at the end of "exfiltrated",
        // then the camera pushes onto its "Locked (ransomware)" status for "locked by ransomware"
        clip: { src: C('scope'), map: [[0, 0.75], [3.95, 4.3], ['end', 5.25]] },
        cam: [
          { t: 0, u: 0.55, v: 0.3, z: 1.5, fy: 460 },
          { t: 0.1, u: 0.55, v: 0.3, z: 1.62, fy: 460, d: 1.4, ease: 'power1.inOut' },
          { t: { phrase: 'every asset', offset: -0.2 }, u: 0.51, v: 0.26, z: 2.1, fy: 470, d: 0.6 },
          { t: { phrase: 'exfiltrated', offset: -0.25 }, u: 0.5, v: 0.37, z: 2.1, fy: 500, d: 0.5 },
          { t: { phrase: 'locked', offset: -0.1 }, u: 0.72, v: 0.515, z: 2.4, fy: 470, d: 0.55 },
        ],
        focus: [
          { t: 'every asset', until: { phrase: 'intact', offset: -0.1 }, u0: 0.215, v0: 0.2, u1: 0.73, v1: 0.29 },
          { t: 'intact', until: 'exfiltrated', u0: 0.662, v0: 0.24, u1: 0.722, v1: 0.264 },
          { t: 'exfiltrated', until: { phrase: 'locked', offset: -0.1 }, u0: 0.368, v0: 0.24, u1: 0.468, v1: 0.264 },
          { t: { phrase: 'locked', offset: 0.35 }, u0: 0.73, v0: 0.482, u1: 0.912, v1: 0.535, hot: true },
        ],
      } },
    { id: 'reports', template: 'footage', starts: 'The record follows', tone: 'nominal', in: { type: 'whip', dir: 1 },
      params: {
        title: 'Claura · Reports',
        // reports.mp4: hold on the NIST header, glide to the response phases, then a cut to the evidence chain of custody
        clip: { src: C('reports'), map: [[0, 0.15], [2.2, 0.69], [2.75, 1.75], [3.85, 2.12], [3.85, 5.95], ['end', 6.55]] },
        cam: [
          { t: 0, u: 0.42, v: 0.2, z: 1.75, fy: 400 },
          { t: 0.1, u: 0.42, v: 0.2, z: 1.85, fy: 400, d: 1.4, ease: 'power1.inOut' },
          { t: { phrase: 'live phase status', offset: -0.45 }, u: 0.48, v: 0.47, z: 2.2, fy: 520, d: 0.6 },
          { t: 3.85, u: 0.42, v: 0.27, z: 2.45, fy: 470, d: 0 },
          { t: 3.86, u: 0.42, v: 0.27, z: 2.38, fy: 470, d: 0.45, ease: 'expo.out' },
          { t: { phrase: 'custody', offset: -0.25 }, u: 0.6, v: 0.29, z: 2.38, fy: 470, d: 0.55 },
        ],
        focus: [
          { t: { phrase: 'follows', offset: 0.1 }, until: { phrase: 'live phase status', offset: -0.45 }, u0: 0.338, v0: 0.14, u1: 0.468, v1: 0.168 },
          { t: 'phase status', until: 3.6, u0: 0.508, v0: 0.398, u1: 0.648, v1: 0.57, hot: true },
          { t: 'hashed', until: { phrase: 'chain', offset: -0.05 }, u0: 0.245, v0: 0.232, u1: 0.595, v1: 0.258 },
          { t: 'chain', until: { phrase: 'custody', offset: -0.1 }, u0: 0.255, v0: 0.31, u1: 0.56, v1: 0.365 },
          { t: { phrase: 'custody', offset: -0.05 }, u0: 0.565, v0: 0.31, u1: 0.86, v1: 0.365 },
        ],
      } },
    // 18 ----------------------------------------------------------------- hands on a host (the product's own 3D overview)
    { id: 'pick', template: 'footage', starts: 'Need hands on a host', tone: 'contained', in: { type: 'whip', dir: 1 },
      params: {
        title: 'Claura · Overview',
        // overview-3d.mp4: the cursor finds b14-gpu-07 in the 3D campus and clicks it on "Click it"; the frame holds on the
        // click and the Secure Shell opens from that point (iris)
        clip: { src: C('overview-3d'), map: [[0, 2.0], [{ phrase: 'Click it', offset: 0.12 }, 3.8], ['end', 3.8]] },
        cam: [
          { t: 0, u: 0.57, v: 0.45, z: 2.3, fy: 520 },
          { t: 0.05, u: 0.6, v: 0.47, z: 2.5, fy: 520, d: 1.6, ease: 'power1.inOut' },
        ],
      } },
    { id: 'shell', template: 'footage', starts: 'A short-lived certificate', tone: 'nominal',
      in: { type: 'iris', x: 1207, y: 572, dur: 0.42 },
      params: {
        title: 'Claura Secure Shell',
        // shell.mp4 (real gateway + sshd): request sheet, Request access, passkey (Touch ID), Waiting for an approver,
        // Approve as Incident Commander, the recorded read-only terminal
        clip: { src: C('shell'), map: [[0, 2.45], [1.55, 4.45], [1.75, 4.7], [2.55, 6.05], [3.55, 8.4], [4.1, 8.75], ['end', 10.6]] },
        cam: [
          { t: 0, u: 0.5, v: 0.47, z: 1.8 },
          { t: { phrase: 'short-lived', offset: -0.2 }, u: 0.52, v: 0.47, z: 2.3, d: 0.6 },
          { t: { phrase: 'Touch ID', offset: -0.3 }, u: 0.5, v: 0.47, z: 2.1, d: 0.45 },
          { t: { phrase: 'a second approver', offset: -0.3 }, u: 0.5, v: 0.55, z: 2.05, d: 0.45 },
          { t: { phrase: 'Every session', offset: -0.3 }, u: 0.42, v: 0.26, z: 2.2, fy: 470, d: 0.5 },
        ],
        focus: [
          { t: 'certificate', until: { phrase: 'Touch ID', offset: -0.3 }, u0: 0.474, v0: 0.47, u1: 0.606, v1: 0.5 },
          { t: 'Touch ID', until: { phrase: 'a second approver', offset: -0.3 }, u0: 0.345, v0: 0.405, u1: 0.66, v1: 0.555 },
          { t: 'second approver', until: 3.4, u0: 0.345, v0: 0.56, u1: 0.66, v1: 0.6 },
          { t: 'recorded', u0: 0.335, v0: 0.227, u1: 0.4, v1: 0.248, hot: true },
        ],
      } },
    { id: 'sync', starts: 'And every screen updates', tone: 'nominal', toneTo: 'contained',
      in: { type: 'morph', from: [-444, -161, 3344, 2178, 56], dur: 0.6 },
      params: { a: S('incident-breach'), b: S('incident-contained'), who: [['RK', 'Incident Commander', '#4f5dff'], ['JT', 'Legal counsel', '#14a9a4']] } },
    // 27 ----------------------------------------------------------------- next, and the end card
    { id: 'vision', starts: 'Next: an immune system', tone: 'nominal',
      in: { type: 'zoom', rect: [730, 850, 460, 86, 43], color: 'rgba(10, 14, 32, 0.5)', fadeDur: 0.24 },
      // the sealed rack pulls back to the whole facility, which then shrinks into one node of the network
      params: { track: [{ t: 0, state: 'contained', progress: 1, cam: { preset: 'rack14', az: 30 } }, { t: 0.06, cam: { preset: 'orbit' }, fly: 1.35 }] } },
    { id: 'endcard', starts: 'Claura. Your network is compromised', tone: 'nominal',
      cues: { bar: { abs: HIT.final } },
      in: { type: 'morph', from: [672, 368, 576, 324, 40] } },
  ],
};
