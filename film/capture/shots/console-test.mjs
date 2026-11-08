// A 6-second smoke test of the whole pipeline against whatever the console serves:
// window.claura.reset() off camera, play() on camera, then a real cursor move + click on the sidebar's "Incident".
export const meta = {
  name: 'console-test',
  shows: 'Claura console: reset(), play() starts the breach, the cursor slides in and clicks Incident',
  url: '/', // relative to --url / --serve
  duration: 6, // the clip is exactly 6.000 s whatever the timers did
  settle: 900, // ms after prepare, before the camera rolls
  lead: 400, // ms of footage before act()
  tail: 400, // ms of footage after act()
}

export async function prepare(page) {
  // off camera: a known starting state
  await page.app('reset')
  await page.app('go', 'overview')
  await page.waitFor(`(window.claura || window.bulkhead).state === 'nominal'`, { label: 'phase nominal after reset()' })
}

export async function act(page, ctx) {
  await page.app('play') // T+0 of the incident script happens here; the sidecar records this moment
  await ctx.at(1.3) // video time: let the breach show on the facility map
  const nav = await page.findAny(['@nav:incident', 'Incident']) // the console's own click-target hook first, text second
  await page.click(nav, { ms: 1100 }) // eased, curved, seeded path; the click lands on the frame the view changes
  await ctx.at(4.6)
  await page.waitFor(`(window.claura || window.bulkhead).view === 'incident'`, { label: 'view incident after the click', timeout: 2000 })
}
