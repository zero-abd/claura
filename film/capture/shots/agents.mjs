// agents: the Agents view after INC-0419. The cursor opens Sentry's "Show reasoning" (reasoning, tool calls, policy bounds:
// what it can and cannot do), glides down and opens Warden's, then slowly reveals the end of Warden's card (its tool-call
// trace and the bounds: it cannot quarantine a host on its own).
//
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 --url http://127.0.0.1:4328/ capture/shots/agents.mjs
import { scrollGlide, stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'agents',
  shows: 'Agents view: expand Sentry then Warden to show the tool-call trace and policy bounds (Can / Cannot)',
  url: '/?demo=1',
  settle: 900,
  lead: 600,
  tail: 600,
  seed: 21,
  notes: 'State: the finished incident (script T+15), so every agent has a real trace. expandSentry / expandWarden = the clicks that open the cards; revealBounds = the slow glide to the end of Warden\'s card (Tool calls, Policy bounds).',
}

export async function prepare(page) {
  await page.app('seek', 15, { approveAt: 7.4 }) // the finished INC-0419, paused
  await page.app('go', 'agents')
  await page.waitFor(`!!document.querySelector('.agent-card') || !!document.querySelector('[data-disc="agent:sentry"]')`, { label: 'agent cards' })
  await page.eval(`document.querySelector('#scroll').scrollTop = 0`)
}

export async function act(page, ctx) {
  // Sentry
  const sentry = await page.find('@disc:agent:sentry')
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo(sentry, { ms: 900 })
  await sleep(200)
  stamp(page, ctx, 'expandSentry')
  await page.click(sentry, { ms: 40, settle: 0 })
  await sleep(1450) // reasoning + tool calls + policy bounds are on screen: let them be read

  // Warden: the page glides down while the cursor follows to where Warden's header lands (upper third)
  const scroll = scrollGlide(page, 880, 900)
  await page.move(680, 330, { ms: 900, curve: 0.05 })
  await scroll
  const warden = await page.find('@disc:agent:warden')
  await sleep(120)
  stamp(page, ctx, 'expandWarden')
  await page.click(warden, { ms: 40, settle: 0 })
  await sleep(520)

  // the end of Warden's card: tool calls and policy bounds
  stamp(page, ctx, 'revealBounds')
  const reveal = scrollGlide(page, 9999, 1700)
  await page.move(1010, 560, { ms: 1500, curve: 0.06 }) // the cursor leaves the card: the bounds read clean
  await reveal
  await sleep(300)
}
