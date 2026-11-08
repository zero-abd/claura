// policy: "Policy, not the model, controls execution." The cursor walks the tiers: what Warden does on its own
// (reversible, read-only), then the actions that need a person (Quarantine host) and the ones it can never take on its
// own (Reimage host: locked, off).
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/policy.mjs
import { stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'policy',
  shows: 'Policy view: auto (Warden acts on its own) / needs a human (Quarantine) / locked off (Reimage host, Terminate guest VM)',
  url: '/?demo=1',
  settle: 800,
  lead: 500,
  tail: 600,
  seed: 31,
  notes: 'The console has two columns, not three tiers: "Warden acts on its own" (6 reversible actions, on) and "Needs a human" (Quarantine, Reimage host, Terminate guest VM: locked, off, "High-impact steps never run unattended"). There is no separate "denied" tier in the UI; Reimage host is the locked-off switch the take ends on. hoverAuto / hoverNeedsHuman / hoverReimage = where the cursor rests.',
}

export async function prepare(page) {
  await page.app('go', 'policy')
  await page.waitFor(`!!document.querySelector('.switch[data-pol="isolate"]')`, { label: 'policy switches' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  stamp(page, ctx, 'cursorEnters')
  // the auto column: land on the first switch, then walk down two rows
  const isolate = await page.find('@pol:isolate')
  await page.moveTo(isolate, { ms: 850 })
  stamp(page, ctx, 'hoverAuto')
  await sleep(250)
  const pause = await page.find('@pol:pause')
  await page.moveTo(pause, { ms: 600, curve: 0.04 })
  await sleep(200)

  // across to the human-gated column
  const quarantine = await page.find('@pol:quarantine')
  await page.moveTo(quarantine, { ms: 650 })
  stamp(page, ctx, 'hoverNeedsHuman')
  await sleep(350)
  const reimage = await page.find('@pol:reimage')
  await page.moveTo(reimage, { ms: 400, curve: 0.04 })
  stamp(page, ctx, 'hoverReimage')
  await sleep(800)
}
