// driver.mjs — drives one Chrome page over CDP for screen capture: real input events, eased and seeded cursor paths, a drawn
// cursor (the screencast sees only web contents), a Chrome DevTools *virtual WebAuthn authenticator* so passkey (Touch ID)
// prompts complete by themselves, an event log for the edit (clicks, cursor path, app phase changes), and the screencast.
//
// Adapted from bulkhead-studio/tools/capture/driver.mjs. Changes: WebAuthn; seeded randomness (same take every run);
// frames.json stores bare file names (the old absolute-vs-relative mix is what broke encoding); event log + page problems;
// `@name` targets via window.claura.targets(); waitFor(); goto(); app(); init script survives reloads.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wall = () => Date.now() / 1000

/** Small seeded PRNG (mulberry32): the cursor curves and typing jitter repeat exactly from take to take. */
export function rng(seed = 7) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- in-page init (runs in every new document)
// 1. an event log: bulkhead:* / claura:* CustomEvents (phase, view) land in window.__capEvents with wall-clock seconds;
// 2. the drawn cursor and optional macOS window buttons (z-index max, pointer-events none).
const INIT = String.raw`(() => {
  if (window.__capInit) return 'already'
  window.__capInit = true
  const events = (window.__capEvents = [])
  const wall = () => (performance.timeOrigin + performance.now()) / 1000
  const plain = (d) => { try { return d === undefined ? null : JSON.parse(JSON.stringify(d)) } catch { return String(d) } }
  // each event also goes to Node at once through the __capPush binding, so a navigation (which resets this array) loses nothing
  const emit = (type, detail) => { const ev = { t: wall(), type, detail: plain(detail) }; events.push(ev); try { if (window.__capPush) window.__capPush(JSON.stringify(ev)) } catch {} }
  window.__capLog = emit
  const dispatch = window.dispatchEvent.bind(window)
  window.dispatchEvent = (e) => {
    try { if (e && /^(bulkhead|claura):/.test(e.type)) emit(e.type, e.detail) } catch {}
    return dispatch(e)
  }
  const mount = () => {
    if (document.getElementById('__demo_overlay') || !document.documentElement) return
    const root = document.createElement('div')
    root.id = '__demo_overlay'
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    const lights = document.createElement('div')
    lights.style.cssText = 'position:absolute;left:20px;top:13px;display:none;gap:8px'
    for (const [c, b] of [['#ff5f57', '#e0443e'], ['#febc2e', '#dea123'], ['#28c840', '#1aab29']]) {
      const d = document.createElement('div')
      d.style.cssText = 'width:12px;height:12px;border-radius:50%;background:' + c + ';box-shadow:inset 0 0 0 0.5px ' + b
      lights.appendChild(d)
    }
    root.appendChild(lights)
    const cur = document.createElement('div')
    cur.style.cssText = 'position:absolute;left:0;top:0;width:24px;height:24px;transform:translate(-100px,-100px);transition:none;will-change:transform;display:' + (window.__capCursorOn === false ? 'none' : 'block')
    cur.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45));transform-origin:3px 2px;transition:transform 90ms ease"><path d="M3.5 2.2 L3.5 19.2 L7.9 15.2 L10.6 21.4 L13.4 20.2 L10.8 14.2 L16.8 14.2 Z" fill="#111" stroke="#fff" stroke-width="1.35" stroke-linejoin="round"/></svg>'
    root.appendChild(cur)
    document.documentElement.appendChild(root)
    const svg = cur.firstChild
    let sc = 1
    const at = (x, y) => { cur.style.transform = 'translate(' + (x - 3 * sc) + 'px,' + (y - 2 * sc) + 'px) scale(' + sc + ')'; cur.style.transformOrigin = '0 0' }
    window.__demoCursor = at
    window.__demoCursorScale = (s) => { sc = s }
    addEventListener('mousemove', (e) => at(e.clientX, e.clientY), true)
    addEventListener('mousedown', () => { svg.style.transform = 'scale(0.86)' }, true)
    addEventListener('mouseup', () => { svg.style.transform = 'scale(1)' }, true)
    window.__demoShowCursor = (on) => { window.__capCursorOn = !!on; cur.style.display = on ? 'block' : 'none' }
    window.__demoShowLights = (on) => { lights.style.display = on ? 'flex' : 'none' }
    if (window.__capLightsOn) lights.style.display = 'flex'
  }
  if (document.documentElement) mount()
  else document.addEventListener('readystatechange', mount)
  document.addEventListener('DOMContentLoaded', mount)
  return 'ok'
})()`

// Optional: hold every navigator.credentials.create/get for N ms before it reaches the (virtual) authenticator, so a
// "waiting for Touch ID" sheet stays on screen long enough to read before the passkey completes.
const webauthnDelaySource = (ms) => String.raw`(() => {
  if (!navigator.credentials || window.__capWebAuthnDelay !== undefined) return
  window.__capWebAuthnDelay = ${Number(ms) || 0}
  for (const name of ['create', 'get']) {
    const orig = navigator.credentials[name]?.bind(navigator.credentials)
    if (!orig) continue
    navigator.credentials[name] = async (...a) => {
      if (a[0] && a[0].mediation === 'conditional') return orig(...a) // autofill-style requests have no prompt to hold
      if (window.__capLog) window.__capLog('webauthn:' + name + ':requested', null)
      await new Promise((r) => setTimeout(r, window.__capWebAuthnDelay))
      const res = await orig(...a)
      if (window.__capLog) window.__capLog('webauthn:' + name + ':done', null)
      return res
    }
  }
})()`

const KEYCODES = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageUp: 33, PageDown: 34, Space: 32, ' ': 32, F6: 117 }
const CODES = { Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', ArrowDown: 'ArrowDown', ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Home: 'Home', End: 'End', ' ': 'Space', ',': 'Comma', '.': 'Period', '/': 'Slash', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '-': 'Minus', '=': 'Equal' }
const MODS = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Cmd: 4, Shift: 8 }

export class Page {
  constructor(ws, opts) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    this.W = opts.width
    this.H = opts.height
    this.scale = opts.scale
    this.rand = rng(opts.seed ?? 7)
    this.mouse = { x: opts.width * 0.6, y: opts.height * 0.55 }
    this.eventLog = [] // node-side events: {t, type, ...}; t = wall-clock seconds
    this.pageEvents = [] // events pushed from the page (phase/view changes, passkey requests), same clock
    this.cursorPath = [] // [t, x, y]
    this.problems = [] // console errors, uncaught exceptions, failed requests
    this.authenticator = null
    this.recording = null
    this.scriptIds = [] // addScriptToEvaluateOnNewDocument identifiers, removed on close()
    this.closed = false
    ws.onmessage = (m) => {
      const d = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8'))
      if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id) }
      else if (d.method) for (const l of [...this.listeners]) { try { l(d) } catch (e) { this.problems.push({ t: wall(), kind: 'driver', text: `listener for ${d.method} threw: ${e.message}` }) } }
    }
    ws.onclose = () => {
      this.closed = true
      for (const [, cb] of this.pending) cb({ error: { message: 'CDP connection closed (Chrome exited or the tab was closed)' } })
      this.pending.clear()
    }
    this.on('Runtime.bindingCalled', (d) => {
      if (d.params.name !== '__capPush') return
      try { this.pageEvents.push(JSON.parse(d.params.payload)) } catch { /* ignore a malformed payload */ }
    })
    this.on('Runtime.exceptionThrown', (d) => {
      const x = d.params.exceptionDetails
      this.problems.push({ t: wall(), kind: 'exception', text: (x.exception?.description ?? x.text ?? 'exception').split('\n')[0].slice(0, 300), url: x.url, line: x.lineNumber })
    })
    this.on('Runtime.consoleAPICalled', (d) => {
      if (d.params.type !== 'error' && d.params.type !== 'assert') return
      this.problems.push({ t: wall(), kind: 'console.' + d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) })
    })
    this.on('Log.entryAdded', (d) => {
      const e = d.params.entry
      if (e.level === 'error') this.problems.push({ t: wall(), kind: 'log.' + e.source, text: `${e.text}${e.url ? ' ' + e.url : ''}`.slice(0, 300) })
    })
  }

  // ------------------------------------------------------------ transport
  send(method, params = {}, { timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error(`${method}: CDP connection is closed`))
      const i = ++this.id
      const timer = timeout > 0 ? setTimeout(() => { this.pending.delete(i); reject(new Error(`${method}: no answer from Chrome in ${timeout} ms`)) }, timeout) : null
      this.pending.set(i, (d) => { if (timer) clearTimeout(timer); d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result) })
      try { this.ws.send(JSON.stringify({ id: i, method, params })) } catch (e) { if (timer) clearTimeout(timer); this.pending.delete(i); reject(e) }
    })
  }

  /** Subscribes to a CDP event; returns an unsubscribe function. */
  on(method, fn) {
    const l = (d) => { if (d.method === method) fn(d) }
    this.listeners.push(l)
    return () => { this.listeners = this.listeners.filter((x) => x !== l) }
  }

  /** Resolves with the params of the next matching CDP event. */
  once(method, { match = () => true, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`timed out waiting for ${method}`)) }, timeout)
      const off = this.on(method, (d) => { if (match(d.params)) { clearTimeout(timer); off(); resolve(d.params) } })
    })
  }

  async eval(expression, { gesture = false } = {}) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: gesture })
    if (r.exceptionDetails) {
      const x = r.exceptionDetails
      throw new Error(`eval failed: ${x.exception?.description?.split('\n')[0] ?? x.text}\n  in: ${expression.replace(/\s+/g, ' ').slice(0, 160)}`)
    }
    return r.result?.value
  }

  /** Runs fn(...args) in the page; args must be JSON-able. */
  evalFn(fn, ...args) { return this.eval(`(${fn.toString()})(...${JSON.stringify(args)})`) }

  // ------------------------------------------------------------ setup / navigation
  /**
   * Applies the capture environment: viewport at the scale factor, focus emulation, colour scheme, UA without "Headless",
   * hidden scrollbars, the init script (cursor overlay + event log) for this and every later document.
   */
  async setup({ scheme = 'dark', ua = true, cursor = true, lights = false, timezone, locale } = {}) {
    await this.send('Page.enable')
    await this.send('Runtime.enable')
    await this.send('Runtime.addBinding', { name: '__capPush' })
    await this.send('Log.enable').catch(() => {})
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.W, height: this.H, deviceScaleFactor: this.scale, mobile: false, screenWidth: this.W, screenHeight: this.H })
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await this.send('Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {})
    const features = [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    if (scheme) features.push({ name: 'prefers-color-scheme', value: scheme })
    await this.send('Emulation.setEmulatedMedia', { features })
    if (timezone) await this.send('Emulation.setTimezoneOverride', { timezoneId: timezone })
    if (locale) await this.send('Emulation.setLocaleOverride', { locale })
    if (ua) {
      // the same browser, minus the "Headless" in its name (UA string and client hints)
      const ua0 = (await this.eval('navigator.userAgent')) ?? ''
      const v = /Chrome\/([\d.]+)/.exec(ua0)?.[1] ?? '156.0.0.0'
      const major = v.split('.')[0]
      await this.send('Emulation.setUserAgentOverride', {
        userAgent: ua0.replace('HeadlessChrome', 'Chrome'),
        platform: 'MacIntel',
        userAgentMetadata: { brands: [{ brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }, { brand: 'Not.A/Brand', version: '99' }], fullVersion: v, platform: 'macOS', platformVersion: '14.0.0', architecture: 'arm', model: '', mobile: false },
      }).catch(() => {})
    }
    this.cursorOn = cursor
    this.lightsOn = lights
    const pre = `window.__capCursorOn = ${cursor ? 'true' : 'false'}; window.__capLightsOn = ${lights ? 'true' : 'false'};`
    this.scriptIds.push((await this.send('Page.addScriptToEvaluateOnNewDocument', { source: pre + INIT })).identifier)
    await this.eval(pre + INIT)
  }

  /** Navigates and waits for load, web fonts and two animation frames. Throws on network errors with the URL. */
  async goto(url, { timeout = 30000 } = {}) {
    const loaded = this.once('Page.loadEventFired', { timeout })
    const r = await this.send('Page.navigate', { url })
    if (r.errorText) { loaded.catch(() => {}); throw new Error(`navigation to ${url} failed: ${r.errorText}`) }
    await loaded
    await this.eval(`document.fonts ? document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))) : true`)
    // the overlay mounts at DOMContentLoaded with the setup-time flags; re-apply any later cursor()/lights() choice
    await this.eval(`window.__demoShowCursor && window.__demoShowCursor(${this.cursorOn !== false}); window.__demoShowLights && window.__demoShowLights(${!!this.lightsOn})`)
    this.log('goto', { url })
  }

  href() { return this.eval('location.href') }

  async cursor(on) { this.cursorOn = on; await this.eval(`window.__demoShowCursor && window.__demoShowCursor(${on})`) }
  async lights(on) { this.lightsOn = on; await this.eval(`window.__demoShowLights && window.__demoShowLights(${on})`) }
  async cursorScale(s) { await this.eval(`window.__demoCursorScale && window.__demoCursorScale(${s})`) }

  // ------------------------------------------------------------ event log
  log(type, data = {}) { this.eventLog.push({ t: wall(), type, ...data }) }
  mark(label, data = {}) { this.log('mark', { label, ...data }) }

  /** Node-side events plus the ones the page pushed (app phase/view changes, passkey requests), sorted by time. */
  async events() {
    return [...this.eventLog, ...this.pageEvents].sort((a, b) => a.t - b.t)
  }

  // ------------------------------------------------------------ the app under capture
  /** Calls window.claura.<method>(...args) (or window.bulkhead); logs it. Returns primitives only. */
  async app(method, ...args) {
    this.log('app', { method, args })
    const m = JSON.stringify(method)
    return this.eval(`(() => {
      const a = window.claura || window.bulkhead
      if (!a || typeof a[${m}] !== 'function') throw new Error('window.claura.' + ${m} + ' is not available')
      const r = a[${m}](...${JSON.stringify(args)})
      return r === undefined || (typeof r === 'object' && r !== null && !(r instanceof Promise)) ? null : r
    })()`)
  }
  async hasApp(method) {
    return this.eval(`(() => { const a = window.claura || window.bulkhead; return !!a && ${method ? `typeof a[${JSON.stringify(method)}] === 'function'` : 'true'} })()`)
  }
  /** A property of window.claura (state, view, time, ...). */
  appGet(prop) { return this.eval(`(() => { const a = window.claura || window.bulkhead; return a ? a[${JSON.stringify(prop)}] : undefined })()`) }

  /** Polls a page expression until it is truthy. Throws with the label on timeout. */
  async waitFor(expr, { timeout = 10000, every = 50, label } = {}) {
    const until = Date.now() + timeout
    for (;;) {
      let v = null
      try { v = await this.eval(expr) } catch { /* page busy or navigating */ }
      if (v) return v
      if (Date.now() > until) throw new Error(`waitFor timed out after ${timeout} ms: ${label ?? expr}`)
      await sleep(every)
    }
  }
  /** Polls a Node-side (sync or async) predicate until it returns truthy. */
  async waitUntil(fn, { timeout = 10000, every = 50, label = 'condition' } = {}) {
    const until = Date.now() + timeout
    for (;;) {
      let v = null
      try { v = await fn() } catch { /* not yet */ }
      if (v) return v
      if (Date.now() > until) throw new Error(`waitUntil timed out after ${timeout} ms: ${label}`)
      await sleep(every)
    }
  }
  /** Waits until window.claura.state (the incident phase) equals one of the phases. */
  waitForPhase(phases, opts = {}) {
    const list = JSON.stringify([].concat(phases))
    return this.waitFor(`(() => { const a = window.claura || window.bulkhead; return a && ${list}.includes(a.state) })()`, { label: `phase ${[].concat(phases).join('|')}`, ...opts })
  }

  // ------------------------------------------------------------ finding things
  /**
   * Centre of the first visible element. target: 'Button text' | '@name' (data-target / claura.targets()) | {text, label, sel, target, nth, within, exact}
   */
  async find(target, { nth = 0, within, exact = true, timeout = 4000 } = {}) {
    let spec = typeof target === 'string' ? (target.startsWith('@') ? { target: target.slice(1) } : { text: target }) : target
    if (spec.target) spec = { sel: `[data-target="${spec.target}"]`, viaApp: spec.target, nth: spec.nth }
    const expr = `(() => {
      const spec = ${JSON.stringify(spec)}; const exact = ${exact}; const within = ${JSON.stringify(within ?? null)}
      const nth = spec.nth ?? ${nth}
      if (spec.viaApp) {
        const a = window.claura || window.bulkhead
        const t = a && typeof a.targets === 'function' ? a.targets()[spec.viaApp] : null
        if (t && t.visible) return { x: t.x, y: t.y, w: t.w, h: t.h, left: t.x - t.w / 2, top: t.y - t.h / 2 }
      }
      const scope = within ? document.querySelector(within) : document
      if (!scope) return null
      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); const min = spec.sel ? 0 : 3; return r.width > min && r.height > min && s.visibility !== 'hidden' && s.display !== 'none' && e.closest('#__demo_overlay') === null }
      let els
      if (spec.sel) els = [...scope.querySelectorAll(spec.sel)]
      else if (spec.label) els = [...scope.querySelectorAll('[aria-label],[title]')].filter(e => { const l = e.getAttribute('aria-label') ?? e.getAttribute('title'); return exact ? l === spec.label : l?.includes(spec.label) })
      else {
        const hit = (e) => { const t = (e.textContent || '').replace(/\\s+/g, ' ').trim(); return exact ? t === spec.text : t.includes(spec.text) }
        els = [...scope.querySelectorAll('body *')].filter(e => hit(e) && ![...e.children].some(hit))
      }
      els = els.filter(vis)
      const e = els[nth]
      if (!e) return null
      let r = e.getBoundingClientRect()
      const covered = () => { const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !h || !(h === e || e.contains(h) || h.contains(e)) || h.closest('#__demo_overlay') }
      if (r.bottom > innerHeight - 30 || r.top < 0 || covered()) { e.scrollIntoView({ block: 'center' }); r = e.getBoundingClientRect() }
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.x, top: r.y }
    })()`
    const until = Date.now() + timeout
    for (;;) {
      const r = await this.eval(expr)
      if (r) return r
      if (Date.now() > until) throw new Error('not found: ' + JSON.stringify(typeof target === 'string' ? target : spec))
      await sleep(100)
    }
  }

  /** First of several candidates that exists now (strings or specs); throws when none does. */
  async findAny(candidates, { timeout = 2500 } = {}) {
    const until = Date.now() + timeout
    for (;;) {
      for (const c of candidates) { try { const p = await this.find(c, { timeout: 0 }); return { ...p, matched: c } } catch { /* next */ } }
      if (Date.now() > until) throw new Error('none of these were found: ' + JSON.stringify(candidates))
      await sleep(100)
    }
  }

  async exists(target, opts = {}) {
    try { await this.find(target, { ...opts, timeout: opts.timeout ?? 0 }); return true } catch { return false }
  }

  // ------------------------------------------------------------ mouse
  /** Moves the pointer along an eased, slightly curved path, as a hand would. Seeded: the curve repeats every take. */
  async move(x, y, { ms, curve = 0.12, mods = [] } = {}) {
    const modifiers = mods.reduce((a, m) => a | MODS[m], 0)
    const from = { ...this.mouse }
    const dist = Math.hypot(x - from.x, y - from.y)
    ms = ms ?? Math.min(900, Math.max(260, 180 + dist * 0.55))
    const nx = -(y - from.y) / (dist || 1), ny = (x - from.x) / (dist || 1)
    const bend = dist * curve * (this.rand() < 0.5 ? -1 : 1)
    const cx = (from.x + x) / 2 + nx * bend, cy = (from.y + y) / 2 + ny * bend
    // Time-based: the position at each tick comes from the wall clock, not from a step counter. While Chrome is busy (a
    // screencast at 2x, WebGL) every dispatch takes longer than a frame; counting steps then stretched a 900 ms move to
    // 1.7 s. Now the move always lasts `ms`; a slow tick just skips ahead along the same path.
    // The events go out on a fixed ~16 ms clock and are NOT awaited one by one: with Chrome under load each reply took
    // 25-40 ms, which capped a mostly static page (policy, scope) at 25 unique frames per second. Chrome handles the
    // events in order; the replies are collected at the end so errors still surface.
    const t0 = Date.now()
    const pending = []
    let failed = null
    for (;;) {
      const tick = Date.now()
      const lin = Math.min(1, (tick - t0) / ms)
      const t = lin < 0.5 ? 4 * lin * lin * lin : 1 - Math.pow(-2 * lin + 2, 3) / 2
      const px = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * x
      const py = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * y
      pending.push(this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, modifiers }).catch((e) => { failed ??= e }))
      this.mouse = { x: px, y: py }
      this.cursorPath.push([wall(), +px.toFixed(1), +py.toFixed(1)])
      if (lin >= 1) break
      const wait = 16 - (Date.now() - tick)
      if (wait > 0) await sleep(wait)
    }
    await Promise.all(pending)
    if (failed) throw failed
  }

  async moveTo(target, opts = {}) {
    const p = typeof target === 'object' && 'x' in target ? target : await this.find(target, opts)
    await this.move(p.x + (opts.dx ?? 0), p.y + (opts.dy ?? 0), opts)
    return p
  }

  async hover(target, opts = {}) { return this.moveTo(target, opts) }

  async click(target, opts = {}) {
    const p = await this.moveTo(target, opts)
    await sleep(opts.settle ?? 140)
    const button = opts.button ?? 'left'
    const mods = (opts.mods ?? []).reduce((a, m) => a | MODS[m], 0)
    const what = await this.eval(`(() => {
      const e = document.elementFromPoint(${this.mouse.x}, ${this.mouse.y}); if (!e) return ''
      const c = e.closest('[data-target]'); if (c) return '@' + c.dataset.target
      const b = e.closest('button,a,[role=button],input,textarea,select,label') || e
      return (b.getAttribute('aria-label') || b.placeholder || (b.id ? '#' + b.id : '') || (b.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 48)
    })()`).catch(() => '')
    this.log('click', { x: +this.mouse.x.toFixed(1), y: +this.mouse.y.toFixed(1), target: typeof target === 'string' ? target : what, hit: what, button })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: this.mouse.x, y: this.mouse.y, button, buttons: button === 'left' ? 1 : 2, clickCount: opts.count ?? 1, modifiers: mods })
    await sleep(opts.hold ?? 70)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: this.mouse.x, y: this.mouse.y, button, buttons: 0, clickCount: opts.count ?? 1, modifiers: mods })
    return p
  }

  async dblclick(target, opts = {}) {
    const p = await this.click(target, { ...opts, count: 1 })
    await sleep(80)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: this.mouse.x, y: this.mouse.y, button: 'left', buttons: 1, clickCount: 2 })
    await sleep(50)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: this.mouse.x, y: this.mouse.y, button: 'left', buttons: 0, clickCount: 2 })
    return p
  }

  async drag(from, to, { ms = 600 } = {}) {
    await this.move(from.x, from.y)
    await sleep(120)
    this.log('drag', { from, to })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
    const steps = Math.round(ms / 16)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
      this.mouse = { x, y }
      this.cursorPath.push([wall(), +x.toFixed(1), +y.toFixed(1)])
      await sleep(16)
    }
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 })
  }

  /** Smooth wheel scroll at the pointer: dy pixels over ms. */
  async wheel(dy, { dx = 0, ms = 500, at } = {}) {
    const p = at ?? this.mouse
    const steps = Math.max(1, Math.round(ms / 16))
    this.log('wheel', { dx, dy })
    for (let i = 0; i < steps; i++) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: dx / steps, deltaY: dy / steps })
      await sleep(16)
    }
  }

  // ------------------------------------------------------------ keyboard
  /** A chord like 'Meta+D', 'Enter', 'Meta+Enter' (the console's approve), 'Shift+Meta+Enter'. */
  async key(chord) {
    this.log('key', { chord })
    const parts = chord.split('+')
    let key = parts.pop()
    if (key === '') key = '+'
    const mods = parts.reduce((a, m) => a | MODS[m], 0)
    const single = key.length === 1
    const upper = single && mods & 8 ? key.toUpperCase() : key
    const code = CODES[key] ?? (single ? (/[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : key) : key)
    const vk = KEYCODES[key] ?? (single && /[a-z0-9]/i.test(key) ? key.toUpperCase().charCodeAt(0) : 0)
    const text = single && !(mods & 6) ? upper : key === 'Enter' ? '\r' : undefined
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: upper, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods, ...(text ? { text, unmodifiedText: text } : {}), ...(mods & 4 && single ? { commands: [] } : {}) })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: upper, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods })
  }

  /** Presses or releases one modifier ('Meta', 'Shift', ...) and leaves it that way. */
  async modifier(name, down) {
    const key = name === 'Cmd' ? 'Meta' : name
    const code = { Meta: 'MetaLeft', Shift: 'ShiftLeft', Alt: 'AltLeft', Control: 'ControlLeft' }[key]
    const vk = { Meta: 91, Shift: 16, Alt: 18, Control: 17 }[key]
    await this.send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: down ? MODS[key] : 0 })
  }

  /** Types like a person: per-character key events at a varying (seeded) pace. */
  async type(text, { cps = 14, jitter = 0.45 } = {}) {
    this.log('type', { text })
    // paced on a schedule (not "send, then sleep"): the key round trips under load no longer slow the typing down
    let next = Date.now()
    for (const ch of text) {
      if (ch === '\n') await this.key('Enter')
      else if (ch.charCodeAt(0) > 126) await this.insert(ch)
      else await this.key(ch === ' ' ? ' ' : ch)
      const base = 1000 / cps
      next += base * (1 - jitter / 2 + this.rand() * jitter) + (ch === ' ' ? 25 : 0)
      const wait = next - Date.now()
      if (wait > 0) await sleep(wait)
      else next = Date.now() // fell behind: no catch-up burst
    }
  }

  async insert(text) { await this.send('Input.insertText', { text }) }

  /** Empties the focused input/textarea/contenteditable (click it first). */
  async clearFocused() {
    await this.eval(`(() => { const e = document.activeElement; if (!e) return; if (e.select) e.select(); else { const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r) } })()`)
    await this.key('Backspace')
  }

  // ------------------------------------------------------------ WebAuthn: a virtual authenticator (passkeys without a human)
  /**
   * Adds a Chrome DevTools virtual authenticator to this page so navigator.credentials.create()/get() succeed with no
   * Touch ID sheet, no security key, no keychain. Defaults model a Mac platform authenticator: internal transport,
   * resident keys, user verification that always passes, presence tests that pass immediately.
   *   opts: { transport='internal', protocol='ctap2', hasResidentKey=true, hasUserVerification=true, isUserVerified=true,
   *           automaticPresenceSimulation=true, delay=0 }
   *   delay: ms to hold every create/get before it completes (the site's own "waiting for Touch ID" UI stays visible).
   * Call it BEFORE the action that starts the passkey request; it survives navigations on the same tab (re-checked by
   * webauthnEnsure()).
   */
  async webauthn(opts = {}) {
    const { delay = 0, ...o } = opts
    const options = { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, ...o }
    await this.send('WebAuthn.enable', { enableUI: false })
    const { authenticatorId } = await this.send('WebAuthn.addVirtualAuthenticator', { options })
    const auth = { id: authenticatorId, options, delay, added: 0, asserted: 0 }
    this.authenticator = auth
    this.on('WebAuthn.credentialAdded', () => { auth.added++; this.log('webauthn', { what: 'credential-added' }) })
    this.on('WebAuthn.credentialAsserted', () => { auth.asserted++; this.log('webauthn', { what: 'credential-asserted' }) })
    if (delay > 0) {
      this.scriptIds.push((await this.send('Page.addScriptToEvaluateOnNewDocument', { source: webauthnDelaySource(delay) })).identifier)
      await this.eval(webauthnDelaySource(delay)).catch(() => {})
    }
    this.log('webauthn', { what: 'authenticator-added', transport: options.transport })
    return authenticatorId
  }

  /** The authenticator's credentials, without private keys: [{credentialId, rpId, isResident, signCount}]. */
  async webauthnCredentials() {
    if (!this.authenticator) return []
    const { credentials } = await this.send('WebAuthn.getCredentials', { authenticatorId: this.authenticator.id })
    return credentials.map((c) => ({ credentialId: c.credentialId.slice(0, 12) + '...', rpId: c.rpId, isResident: c.isResidentCredential, signCount: c.signCount }))
  }
  /** Flip whether the "fingerprint" matches (false = a failed Touch ID: user verification fails). */
  async webauthnSetUserVerified(ok) { await this.send('WebAuthn.setUserVerified', { authenticatorId: this.authenticator.id, isUserVerified: !!ok }); this.log('webauthn', { what: 'uv', ok: !!ok }) }
  async webauthnSetPresence(auto) { await this.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: this.authenticator.id, enabled: !!auto }) }
  /** Re-adds the authenticator when Chrome dropped it (e.g. after a cross-process navigation). Returns true if it re-added. */
  async webauthnEnsure() {
    if (!this.authenticator) return false
    try { await this.send('WebAuthn.getCredentials', { authenticatorId: this.authenticator.id }); return false } catch {
      const { id, delay, added, asserted, ...rest } = this.authenticator
      void id; void added; void asserted
      await this.webauthn({ ...rest.options, delay })
      return true
    }
  }
  async webauthnRemove() {
    if (!this.authenticator) return
    try { await this.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: this.authenticator.id }); await this.send('WebAuthn.disable') } catch { /* tab gone */ }
    this.authenticator = null
  }

  // ------------------------------------------------------------ pictures
  /** One PNG of the page at device resolution (3456x2160 at scale 2). */
  async shot(path, { clip } = {}) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })
    writeFileSync(path, Buffer.from(r.data, 'base64'))
    return path
  }

  /**
   * Starts a screencast into dir (f000000.jpg ...; frames.json lists {file, t} with bare file names and wall-clock seconds).
   * Returns stop(), which resolves to {dir, frames}. quality: JPEG 1-100 (default 94). format: 'jpeg' | 'png' (png is lossless but slow).
   */
  async record(dir, { quality = 94, format = 'jpeg' } = {}) {
    mkdirSync(dir, { recursive: true })
    const frames = []
    const ext = format === 'png' ? 'png' : 'jpg'
    let n = 0
    const onFrame = (d) => {
      if (d.method !== 'Page.screencastFrame') return
      const { data, metadata, sessionId } = d.params
      this.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) // ack first so Chrome keeps sending while we write
      const file = `f${String(n++).padStart(6, '0')}.${ext}`
      writeFileSync(join(dir, file), Buffer.from(data, 'base64'))
      frames.push({ file, t: metadata.timestamp })
    }
    this.listeners.push(onFrame)
    await this.send('Page.startScreencast', { format, ...(format === 'jpeg' ? { quality } : {}), maxWidth: this.W * this.scale, maxHeight: this.H * this.scale, everyNthFrame: 1 })
    // A still page sends no frames; nudging the overlay guarantees a first one.
    await this.eval(`(() => { const o = document.getElementById('__demo_overlay'); if (o) o.style.opacity = '0.999' })()`)
    this.recording = { dir, frames }
    return async () => {
      await this.eval(`(() => { const o = document.getElementById('__demo_overlay'); if (o) o.style.opacity = '1' })()`).catch(() => {})
      await sleep(140)
      await this.send('Page.stopScreencast').catch(() => {})
      this.listeners = this.listeners.filter((l) => l !== onFrame)
      const endT = wall()
      writeFileSync(join(dir, 'frames.json'), JSON.stringify([...frames, { file: null, t: endT }]))
      this.recording = null
      return { dir, frames, endT }
    }
  }

  async close() {
    if (this.closed) return
    try { if (this.authenticator) await this.webauthnRemove() } catch { /* ignore */ }
    for (const identifier of this.scriptIds) await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }, { timeout: 3000 }).catch(() => {})
    this.scriptIds = []
    try { this.ws.close() } catch { /* ignore */ }
    this.closed = true
  }
}

// ---------------------------------------------------------------- connecting
const cdpList = async (port) => {
  try {
    return await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  } catch (e) {
    const code = e.cause?.code ?? e.code
    throw new Error(code === 'ECONNREFUSED'
      ? `no Chrome is listening on port ${port} (ECONNREFUSED). Start one: node capture/chrome.mjs start <url> --port ${port}   (or let shoot.mjs launch it: it does so when the port is free)`
      : `cannot reach Chrome DevTools on port ${port}: ${e.cause?.message ?? e.message}`)
  }
}

/** Opens a fresh tab at url (about:blank by default) and returns its target record. */
export async function newTab(port, url = 'about:blank') {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!r.ok) throw new Error(`could not open a tab on port ${port}: HTTP ${r.status}`)
  return r.json()
}

/**
 * Connects to the first page whose URL contains `match` (any page when empty) and applies the capture setup.
 * opts: { width=1728, height=1080, scale=2, scheme='dark', match='', seed=7, ua, cursor, lights, timezone, locale }
 */
export async function connect(port, { width = 1728, height = 1080, scale = 2, scheme = 'dark', match = '', seed = 7, targetId, ...setup } = {}) {
  const list = await cdpList(port)
  const pages = list.filter((p) => p.type === 'page')
  const target = targetId ? pages.find((p) => p.id === targetId) : (pages.find((p) => p.url.includes(match)) ?? (match ? null : pages[0]))
  if (!target) throw new Error(`no page matching "${match}" on port ${port} (pages: ${pages.map((p) => p.url).join(', ') || 'none'})`)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = (e) => reject(new Error(`WebSocket to ${target.webSocketDebuggerUrl} failed: ${e.message ?? e.type ?? 'unknown'} (is another client attached with --remote-allow-origins restrictions?)`))
  })
  const page = new Page(ws, { width, height, scale, seed })
  page.target = target
  await page.setup({ scheme, ...setup })
  return page
}
