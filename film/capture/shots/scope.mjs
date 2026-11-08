// scope: Data scope after INC-0419. The status pills (locked by ransomware, exfil suspected, accessed, evidence preserved,
// intact) in the summary card and on every asset; the cursor walks the first pills, then opens one row (the corporate file
// share FIN-02: "Locked (ransomware)") to show what the status means and who set it.
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/scope.mjs
import { stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'scope',
  shows: 'Data scope: the status pills (locked by ransomware, exfil suspected, accessed, ...); one row expanded',
  url: '/?demo=1',
  settle: 900,
  lead: 600,
  tail: 600,
  seed: 61,
  notes: 'State: the finished incident (script T+15): 7 assets, 5 statuses. hoverPills = the cursor on the status chips; expandRow = the click that opens "Corporate file share FIN-02" (Locked, ransomware).',
}

export async function prepare(page) {
  await page.app('seek', 15, { approveAt: 7.4 })
  await page.app('go', 'scope')
  await page.waitFor(`!!document.querySelector('[data-target="scope-filter:all"]')`, { label: 'scope filters' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  // the pills, left to right
  const locked = await page.find('@scope-filter:locked_ransomware')
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo(locked, { ms: 900 })
  stamp(page, ctx, 'hoverPills')
  await sleep(300)
  const exfil = await page.find('@scope-filter:exfil_suspected')
  await page.moveTo(exfil, { ms: 420, curve: 0.04 })
  await sleep(180)
  const accessed = await page.find('@scope-filter:accessed')
  await page.moveTo(accessed, { ms: 420, curve: 0.04 })
  await sleep(200)

  // open the first row
  const row = await page.find('@disc:asset:6')
  await page.moveTo({ x: row.x - 330, y: row.y }, { ms: 700 })
  await sleep(180)
  stamp(page, ctx, 'expandRow')
  await page.click({ x: row.x - 330, y: row.y }, { ms: 40, settle: 0 })
  await sleep(1800) // the detail panel opens: what the status means, who set it, the Set status pills
}
