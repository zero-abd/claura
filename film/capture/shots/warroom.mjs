// warroom: the out-of-band War Room just after INC-0419 is contained. The brief (what we know / what we don't know yet) is
// up, a message lands live in #command (Scribe files the report), and the cursor switches to #exec to read the
// plain-language thread. (The approval sheet covers every view from the gate at T+5.5 until T+10.3, so the take starts after it.)
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/warroom.mjs
import { stamp, sleep } from './_lib.mjs'

const RESUME_AT = 10.9 // script seconds: contained at 9.4, the "Approved" sheet is gone at 10.3

export const meta = {
  name: 'warroom',
  shows: 'War Room during the incident: brief (what we know / do not know yet), a message arrives, the cursor switches to #exec',
  url: '/?demo=1',
  settle: 1000,
  lead: 600,
  tail: 700,
  seed: 41,
  notes: `Script time at scriptResumes is T+${RESUME_AT} (incident contained, approval sheet gone) and runs live from there. messageArrives = Scribe's "Report INC-0419 filed" lands in #command (T+12.4). selectExec = the click on #exec (its thread: CEO question, Scribe plain-language answer, CEO, AL). readBrief = the cursor on "What we don't know yet".`,
}

export async function prepare(page) {
  await page.app('seek', RESUME_AT, { approveAt: 7.4, run: false }) // paused, already approved and contained: no sheet
  await page.app('go', 'warroom')
  await page.waitFor(`!!document.querySelector('#wrInput')`, { label: 'war room composer' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  // the script runs from here: T+10.9 now
  await page.app('seek', RESUME_AT, { approveAt: 7.4, run: true })
  const r0 = stamp(page, ctx, 'scriptResumes')
  // T+12.4 (1.5 s from now): Scribe files the report and the message lands in #command. Watched in the background so the
  // key event is stamped when it happens, not when the cursor gets around to checking.
  const arrival = page.waitFor(`window.claura.time >= 12.4`, { timeout: 9000, label: 'script T+12.4' }).then(() => stamp(page, ctx, 'messageArrives'))

  // the cursor reads the brief (what we know, then what we do not know yet) and settles as the message lands
  await sleep(80)
  const known = await page.find('What we know')
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo({ x: known.x + 90, y: known.y + 48 }, { ms: 700 })
  await sleep(200)
  const unknown = await page.find("What we don't know yet")
  await page.moveTo({ x: unknown.x + 110, y: unknown.y + 44 }, { ms: 500, curve: 0.05 })
  stamp(page, ctx, 'readBrief')
  await arrival
  await sleep(1000) // the message animates in; let the eye find it
  await page.move(930, 770, { ms: 800, curve: 0.06 }) // down to the thread where the new message sits
  await sleep(350)

  // switch to #exec
  const exec = await page.find('@ch:#exec')
  await page.moveTo(exec, { ms: 800 })
  await sleep(250)
  stamp(page, ctx, 'selectExec')
  await page.click(exec, { ms: 40, settle: 0 })
  await sleep(350)
  await page.move(1010, 650, { ms: 1400, curve: 0.06 }) // the cursor drifts into the exec thread while it is read
  await ctx.at(r0 + 7.3)
}
