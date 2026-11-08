// isolation: the "Isolated · out-of-band" pill in the top bar. The cursor clicks it and the "Isolated by design" popover
// opens: sealed appliance, out-of-band cloud, what Claura does not depend on (email, phones, SSO, corporate DNS and VPN).
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/isolation.mjs
import { stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'isolation',
  shows: 'Click the "Isolated · out-of-band" pill: the isolation popover opens',
  url: '/?demo=1',
  settle: 1200,
  lead: 500,
  tail: 600,
  seed: 81,
  notes: 'Overview (calm) behind. isolationClick = the click on the pill; popoverOpen = the popover is open.',
}

export async function prepare(page) {
  await page.app('reset')
  await page.app('go', 'overview')
  await page.waitFor(`window.claura.state === 'nominal' && window.claura.stage === 'mounted'`, { label: 'calm overview' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  const pill = await page.find('@isolation')
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo(pill, { ms: 900 })
  await sleep(260)
  stamp(page, ctx, 'isolationClick')
  await page.click(pill, { ms: 40, settle: 0 })
  await page.waitFor(`window.claura.isOpen('isolation')`, { timeout: 3000, label: 'isolation popover open' })
  stamp(page, ctx, 'popoverOpen')
  await sleep(350)
  await page.move(1050, 160, { ms: 850, curve: 0.08 }) // eases off the pill (empty hero space) so the popover reads clean
  await sleep(1000)
}
