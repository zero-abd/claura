// incident-run: the film's hero take. Incident view, reset, play(). The breach opens, the agents light up and the containment
// steps tick (a slow glide down to the Agents and Containment cards shows them), the approval sheet appears, the cursor
// comes in, moves to "Approve quarantine" and clicks, the view glides back up and the orb in the 3D facility turns green.
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/incident-run.mjs
import { scrollGlide, stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'incident-run',
  shows: 'Incident view: reset, play(); agents light up, steps tick; approval sheet; the cursor approves the quarantine; contained, the orb turns green',
  url: '/?demo=1',
  settle: 1600, // the 3D facility is on screen: let it draw a few frames first
  lead: 800,
  tail: 950,
  seed: 11,
  continuous: true, // the breach animates every frame (counter, ticker, 3D camera): any screencast gap is a stall
  notes: 'Script T+0 is scriptT0 (= app:play). approvalSheet = the Quarantine sheet appears (script T+5.5). approveClick = the click on "Approve quarantine". phase:contained = the counter freezes at 9.4 s; orbGreen (added by finalize) = the orb in the 3D facility is green.',
}

export async function prepare(page) {
  await page.app('reset')
  await page.app('go', 'incident')
  await page.waitFor(`window.claura.state === 'nominal' && window.claura.stage === 'mounted'`, { label: 'calm incident view with the 3D stage' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  // calm for a beat, then the breach
  await page.app('play')
  const t0 = stamp(page, ctx, 'scriptT0')

  // 1. the agents work; glide down so the Agents and Containment cards are in frame while the steps tick
  await ctx.at(t0 + 1.2)
  await scrollGlide(page, 9999, 1500)

  // 2. the approval sheet (the script pauses at T+5.5 for a human)
  await page.waitFor(`window.claura.state === 'approval'`, { timeout: 14000, label: 'approval phase' })
  const sheet = stamp(page, ctx, 'approvalSheet')
  await sleep(550) // a beat to read the sheet
  const approve = await page.findAny(['@approve', 'Approve quarantine'])
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo(approve, { ms: 1000 })
  await sleep(260) // settle on the button, the hover lights up
  const approveAt = stamp(page, ctx, 'approveClick')
  await page.click(approve, { ms: 40, settle: 0, hold: 90 })

  // 3. the sheet leaves; glide back up to the hero and let the cursor drift off the content
  await sleep(500)
  const drift = page.move(1470, 690, { ms: 1900, curve: 0.08 })
  await scrollGlide(page, 0, 1200)
  await drift
  await page.waitFor(`window.claura.state === 'contained'`, { timeout: 8000, label: 'contained phase' })

  // 4. the orb turns green (about 1.9 s after the contained phase), Scribe files the report, the script ends
  //    (approval + 6.6 s of script time, the last scripted motion), then a short hold
  await ctx.at(approveAt + 6.8)
  return { scriptT0: t0, approvalSheet: sheet, approveClick: approveAt }
}
