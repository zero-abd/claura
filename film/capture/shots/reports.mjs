// reports: INC-0419 in NIST SP 800-61 structure, written by Scribe. A slow scroll from the identification block through the
// response-phase stepper and the 20-entry timeline to the evidence chain of custody (SHA-256, "Hash verified", every hand-off).
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/reports.mjs
import { scrollGlide, stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'reports',
  shows: 'Reports: INC-0419 NIST structure - phase stepper, timeline, evidence chain of custody; slow scroll',
  url: '/?demo=1',
  settle: 900,
  lead: 600,
  tail: 700,
  seed: 71,
  notes: 'State: the finished incident, report open with Timeline and Evidence sections expanded off camera. phaseStepper = the response-phase cards centred; timeline = the 20-entry timeline in frame; evidence = the chain-of-custody cards in frame (scrollTop 2150).',
}

export async function prepare(page) {
  await page.app('seek', 15, { approveAt: 7.4 })
  await page.app('openReport')
  await page.app('expand', 'rs:timeline')
  await page.app('expand', 'rs:evidence')
  await page.waitFor(`!!document.querySelector('.disc[data-key="rs:evidence"]')`, { label: 'report sections' })
  await sleep(900)
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  stamp(page, ctx, 'cursorEnters')
  // the cursor comes in beside the report while the response-phase stepper is brought to the middle of the frame
  const settle1 = scrollGlide(page, 430, 1000)
  await page.move(1480, 520, { ms: 950, curve: 0.1 })
  await settle1
  stamp(page, ctx, 'phaseStepper')
  await sleep(400)

  // the timeline
  const t1 = scrollGlide(page, 1000, 1300)
  await page.move(1380, 640, { ms: 1200, curve: 0.06 })
  await t1
  stamp(page, ctx, 'timeline')
  await sleep(700)

  // the evidence chain of custody
  const t2 = scrollGlide(page, 2150, 1800)
  await page.move(1330, 430, { ms: 1700, curve: 0.05 })
  await t2
  stamp(page, ctx, 'evidence')
  await sleep(1000)
}
