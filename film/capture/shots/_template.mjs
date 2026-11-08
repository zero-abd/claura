// TEMPLATE: copy to capture/shots/<name>.mjs and edit. Run:
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --serve /Users/abd/repos/bulkhead:4327 capture/shots/<name>.mjs
//
// A shot module exports `meta`, an optional async `prepare(page, ctx)` (off camera), a required async `act(page, ctx)`
// (on camera) and an optional async `after(page, ctx)`. The runner loads the URL fresh, parks the cursor off screen on the
// right, runs prepare, waits `settle`, starts the screencast, waits `lead`, runs act, waits `tail`, stops, encodes.
export const meta = {
  name: 'template', // output: assets/clips/<name>.mp4 (+ proxy/, contact/, events/) and a manifest.json entry. Letters, digits, - _ .
  shows: 'what this footage is for, in the film', // goes into the manifest
  url: '/', // loaded fresh before prepare; relative to --url/--serve. Omit to use the tab as it is.
  // width: 1728, height: 1080, scale: 2,  // logical px and device scale: masters are 3456x2160
  // scheme: 'dark',                       // prefers-color-scheme
  // duration: 6,                          // force the clip to exactly N seconds (trims, or holds the last frame)
  // trim: [0.5, 5.5],                     // or keep only this span of the recording (seconds)
  // lead: 500, tail: 700, settle: 800,    // ms: footage before act, footage after act, pause after prepare
  // cursor: true,                         // draw the cursor (false: hide it; the sidecar still has the path and clicks)
  // cursorStart: [x, y],                  // default: off screen right, so it slides in on the first move
  // lights: false,                        // macOS window buttons top-left (the console has none of its own)
  // webauthn: true,                       // virtual passkey authenticator, or { transport:'internal', delay: 1200 } to hold
  //                                       // each Touch ID request 1.2 s so the on-screen prompt can be read
  // seed: 7,                              // same seed = the same cursor curves and typing rhythm every take
  // match: '4327',                        // attach to the tab whose URL contains this (only when meta.url is omitted)
  // notes: 'anything the editor should know',
}

export async function prepare(page, ctx) {
  // The console's own API (window.claura, same object as window.bulkhead), through page.app():
  //   await page.app('reset'); await page.app('go', 'incident'); await page.app('seek', 4.4, { approveAt: null })
  await page.app('reset')
  await page.waitFor(`(window.claura || window.bulkhead).state === 'nominal'`)
  // page.waitFor(expr) polls any page expression; page.waitForPhase('approval') waits on window.claura.state.
}

export async function act(page, ctx) {
  // ctx.now() = seconds of video time so far; await ctx.at(2.5) waits until video time 2.5 s.
  await page.app('play') // logged in the sidecar: the film knows which video frame is script T+0
  await page.waitForPhase('approval', { timeout: 12000 }) // wait on state, not on a fixed sleep

  // Cursor: strings are element text, '@name' is the console's data-target hook (window.claura.targets()),
  // objects are { sel, text, label, target, nth, within }. findAny() takes the first candidate that exists.
  const approve = await page.findAny(['@approve', 'Approve quarantine'])
  await page.click(approve, { ms: 900 }) // move + settle 140 ms + press/release; options: dx, dy, hold, settle, mods, count
  // await page.hover('@disc:evidence'); await page.wheel(400, { ms: 600 }); await page.key('Meta+Enter')
  // await page.type('status?\n', { cps: 14 }); await page.drag({ x: 100, y: 100 }, { x: 400, y: 100 })
  page.mark('approved') // a named moment in the sidecar's events (video time), for cutting on
}

export async function after(page, ctx) {
  // optional, after the screencast stopped (nothing here is recorded)
}
