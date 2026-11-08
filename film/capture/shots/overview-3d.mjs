// overview-3d: the calm facility in 3D. The cursor travels over the campus to host b14-gpu-07 in Hall B (the rack outlines on
// hover), clicks it in the 3D scene, and the Host sheet opens with "Open secure shell". The click lands on the real 3D pick:
// the host's screen position is found off camera with the module's own pickAt().
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/overview-3d.mjs
import { stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'overview-3d',
  shows: 'Overview, calm 3D facility; the cursor clicks host b14-gpu-07 in the 3D scene -> Host sheet with "Open secure shell"',
  url: '/?demo=1',
  settle: 1500,
  lead: 800,
  tail: 800,
  seed: 91,
  notes: 'hoverHost = the cursor is on b14-gpu-07 (rack outline + host lit in the scene); hostClick = the click in the 3D scene; hostSheet = the Host sheet is open. Needs window.__fac3d (the capture build exposes the 3D instance for pickAt).',
}

export async function prepare(page, ctx) {
  await page.app('reset')
  await page.app('go', 'overview')
  await page.waitFor(`window.claura.state === 'nominal' && window.claura.stage === 'mounted' && !!window.__fac3d`, { label: 'calm 3D overview' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
  // where is b14-gpu-07 on screen? scan the canvas with the module's own picker, take the centre of the hits
  const pos = await page.eval(`(() => {
    const f = window.__fac3d, r = f.canvas.getBoundingClientRect(), pts = []
    for (let y = 0; y < r.height; y += 2) for (let x = 0; x < r.width; x += 2) { const h = f.pickAt(x, y); if (h && h.host === 'b14-gpu-07') pts.push([r.left + x, r.top + y]) }
    if (!pts.length) return null
    const n = pts.length
    return { x: pts.reduce((s, p) => s + p[0], 0) / n, y: pts.reduce((s, p) => s + p[1], 0) / n, n }
  })()`)
  if (!pos) throw new Error('b14-gpu-07 was not found in the 3D scene (is window.__fac3d the facility instance?)')
  ctx.host = pos
  ctx.log(`b14-gpu-07 at ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)} (${pos.n} pick samples)`)
}

export async function act(page, ctx) {
  const { x, y } = ctx.host
  stamp(page, ctx, 'cursorEnters')
  // over the campus, then a slow final approach onto the host so the hover outline is seen to arrive
  await page.move(x + 250, y + 150, { ms: 1100, curve: 0.1 })
  await page.move(x, y, { ms: 800, curve: 0.04 })
  stamp(page, ctx, 'hoverHost')
  await sleep(900)
  stamp(page, ctx, 'hostClick')
  await page.click({ x, y }, { ms: 40, settle: 0 })
  await page.waitFor(`document.body.dataset.sheet === '1'`, { timeout: 3000, label: 'host sheet' })
  stamp(page, ctx, 'hostSheet')
  await sleep(500)
  // the cursor settles on "Open secure shell" (not clicked: the shell flow is its own take)
  const open = await page.find('@open-shell')
  await page.moveTo(open, { ms: 750 })
  stamp(page, ctx, 'hoverOpenShell')
  await sleep(1000)
}
