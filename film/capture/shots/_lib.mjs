// Shared helpers for the console shots (imported by the shot modules next to this file).
import { sleep } from '../driver.mjs'

/**
 * Eased scroll of the console's main scroll container (#scroll), driven frame by frame inside the page so it is smooth
 * and repeatable. Resolves with the final scrollTop when the glide ends. Does not block the caller if you do not await it
 * (start it, move the cursor, then await it).
 *   to: pixels from the top, or { by: dy } relative to the current position. ms: duration. sel: another scroller.
 */
export function scrollGlide(page, to, ms = 900, { sel = '#scroll' } = {}) {
  const target = typeof to === 'number' ? `${to}` : `el.scrollTop + ${Number(to.by) || 0}`
  page.log('scroll', { to: typeof to === 'number' ? to : null, by: typeof to === 'number' ? null : to.by, ms })
  return page.eval(`new Promise((resolve) => {
    const el = document.querySelector(${JSON.stringify(sel)})
    if (!el) return resolve(null)
    const from = el.scrollTop
    const to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, ${target}))
    const dur = ${Number(ms)}
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    let t0 = null
    const step = (now) => {
      if (t0 === null) t0 = now
      const k = Math.min(1, (now - t0) / dur)
      el.scrollTop = from + (to - from) * ease(k)
      if (k < 1) requestAnimationFrame(step)
      else resolve(el.scrollTop)
    }
    requestAnimationFrame(step)
  })`)
}

/** Clip time (seconds of video so far) with a label, in the manifest's key events. Returns the time. */
export function stamp(page, ctx, label, data = {}) {
  const t = +ctx.now().toFixed(3)
  page.mark(label, data)
  return t
}

/** Waits until an expression is true; never throws (returns false on timeout). Handy for "wait for the UI, but do not die". */
export async function tryWait(page, expr, opts = {}) {
  try { return await page.waitFor(expr, opts) } catch { return false }
}

export { sleep }
