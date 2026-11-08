// access: People & Access. Add person, type a name, pick the Legal counsel role, issue: the single-use break-glass code
// (with its QR) appears. No email, no phone: the code is handed over in person.
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/access.mjs
import { stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'access',
  shows: 'People & Access: Add person -> name -> Legal counsel role -> the single-use break-glass code with its QR',
  url: '/?demo=1',
  settle: 900,
  lead: 600,
  tail: 600,
  seed: 51,
  notes: 'addPersonClick = the click on "Add person"; typeName = the name starts being typed; roleLegal = the Legal counsel role chip is chosen; issueClick = "Issue break-glass code"; codeShown = the code and QR are on screen. The code is scripted demo data, different on every take.',
}

export async function prepare(page) {
  await page.app('reset')
  await page.app('go', 'access')
  await page.waitFor(`!!document.querySelector('[data-target="add-person"]')`, { label: 'add person button' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  const add = await page.find('@add-person')
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo(add, { ms: 950 })
  await sleep(200)
  stamp(page, ctx, 'addPersonClick')
  await page.click(add, { ms: 40, settle: 0 })
  await page.waitFor(`!!document.querySelector('#pName') && document.querySelector('#pName').getBoundingClientRect().width > 0`, { label: 'add person sheet' })
  await sleep(350) // the sheet settles

  const name = await page.find('@person-name')
  await page.moveTo(name, { ms: 520 })
  await sleep(100)
  await page.click(name, { ms: 40, settle: 0 })
  await sleep(150)
  stamp(page, ctx, 'typeName')
  await page.type('Deputy counsel', { cps: 20 })
  await sleep(150)

  const legal = await page.find('@role:legal')
  await page.moveTo(legal, { ms: 420 })
  await sleep(120)
  stamp(page, ctx, 'roleLegal')
  await page.click(legal, { ms: 40, settle: 0 })
  await sleep(320)

  const issue = await page.find('@issue-code')
  await page.moveTo(issue, { ms: 420 })
  await sleep(150)
  stamp(page, ctx, 'issueClick')
  await page.click(issue, { ms: 40, settle: 0 })
  await page.waitFor(`(() => { const c = document.querySelector('#pcCode'); return !!c && c.getBoundingClientRect().width > 0 && c.textContent.trim().length > 8 })()`, { timeout: 5000, label: 'break-glass code' })
  stamp(page, ctx, 'codeShown')
  await sleep(300)
  await page.move(1340, 575, { ms: 950, curve: 0.05 }) // the cursor eases out of the sheet; the code and QR stay clear in frame
  await sleep(950)
}
