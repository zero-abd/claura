#!/usr/bin/env node
// shoot.mjs — runs shot modules against a page and turns each into footage:
//   prepare (off camera) -> record -> act (on camera) -> encode -> assets/clips/<name>.mp4 + proxy + contact + events + manifest
//
//   node capture/shoot.mjs [options] <shot.mjs> [<shot2.mjs> ...]
//     --serve DIR[:PORT]   start DIR's vite dev server on PORT (default 4327) for the run, stop it after (read-only use of DIR)
//     --url URL            base URL for shots (a shot's meta.url may be relative to it); default http://localhost:<serve port>/
//     --port N             Chrome debugging port (default 9230). Free port: Chrome is launched and stopped by this run.
//                          Busy port: attaches to that Chrome and leaves it running.
//     --out DIR            clips folder (default ../assets/clips)       --frames-dir DIR   scratch for raw frames
//     --keep-frames        keep the raw screencast frames               --no-encode        record frames only
//     --dry                run prepare+act without recording            --keep-chrome      leave a Chrome we launched running
//     --attach             never launch Chrome                          --headful          visible Chrome window
//     --quality N          screencast JPEG quality (default 94)         --crf N --preset P --fps N   encoder settings
//     --list               print the manifest and exit
//
// The LAST line printed on stdout is always `RESULT {json}` (ok, clips, failures with the phase that failed), and every
// failure prints its full stack and cause chain on stderr. Nothing here ever dies with a bare "Node.js vNN" line.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_PORT, RUN_DIR, alive, cdpVersion, portInUse, startChrome, tmpRoot } from './chrome.mjs'
import { connect, sleep } from './driver.mjs'
import { DEFAULT_OUT, encode } from './encode.mjs'
import { DEFAULT_SERVE_PORT, startServer } from './serve.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const wall = () => Date.now() / 1000
const log = (...a) => console.error('[shoot]', ...a)
const LOCK = path.join(RUN_DIR, 'shoot.lock')

const run = { phase: 'start', shot: null, chrome: null, server: null, ownsChrome: false, done: false }

function describe(e) {
  const out = []
  let cur = e, depth = 0
  while (cur && depth < 4) {
    out.push(cur instanceof Error ? (cur.stack ?? String(cur)) : `non-Error thrown: ${JSON.stringify(cur) ?? String(cur)}`)
    cur = cur?.cause
    depth++
    if (cur) out.push('caused by:')
  }
  return out.join('\n')
}

async function cleanup(opts = {}) {
  if (run.chrome && run.ownsChrome && !opts.keepChrome) { try { await run.chrome.stop() } catch (e) { log('chrome stop failed:', e.message) } }
  if (run.server) { try { await run.server.stop() } catch (e) { log('server stop failed:', e.message) } }
  run.chrome = null
  run.server = null
  try { fs.rmSync(LOCK, { force: true }) } catch { /* ignore */ }
}

function parseArgs(argv) {
  const o = { shots: [], port: DEFAULT_PORT, quality: 94, fps: 60, crf: 12, preset: 'medium' }
  const need = (i, n) => { if (i + 1 >= argv.length) throw new Error(`${n} needs a value`); return argv[i + 1] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--serve') { o.serve = need(i, a); i++ }
    else if (a === '--url') { o.url = need(i, a); i++ }
    else if (a === '--port') { o.port = +need(i, a); i++ }
    else if (a === '--out') { o.out = path.resolve(need(i, a)); i++ }
    else if (a === '--frames-dir') { o.framesDir = path.resolve(need(i, a)); i++ }
    else if (a === '--quality') { o.quality = +need(i, a); i++ }
    else if (a === '--crf') { o.crf = +need(i, a); i++ }
    else if (a === '--preset') { o.preset = need(i, a); i++ }
    else if (a === '--fps') { o.fps = +need(i, a); i++ }
    else if (a === '--keep-frames') o.keepFrames = true
    else if (a === '--no-encode') o.noEncode = true
    else if (a === '--dry') o.dry = true
    else if (a === '--attempts') { o.attempts = Math.max(1, +need(i, a)); i++ }
    else if (a === '--no-gate') o.noGate = true
    else if (a === '--strict') o.strict = true // a take that is still stalled on the last attempt FAILS (no encode) instead of being kept
    else if (a === '--keep-chrome') o.keepChrome = true
    else if (a === '--attach') o.attach = true
    else if (a === '--headful') o.headful = true
    else if (a === '--list') o.list = true
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`)
    else o.shots.push(path.resolve(a))
  }
  return o
}

function loadManifest(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
}
function saveManifest(file, entries) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 1))
  fs.renameSync(tmp, file)
}

class RetryTake extends Error {}

/** Stalls = screencast gaps of >= 100 ms that overlap motion. Returns { stalls, worst, worstAt, fps, bad }. */
function takeGate(rec, page, meta) {
  const fr = rec.frames.map((f) => f.t)
  if (fr.length < 2) return { stalls: [{ at: 0, ms: 9999 }], worst: 9999, worstAt: 0, fps: 0, bad: true }
  const motion = page.cursorPath.map(([t]) => [t, t])
  for (const e of page.eventLog) if (e.type === 'scroll') motion.push([e.t, e.t + (e.ms || 0) / 1000])
  if (meta.continuous) motion.push([fr[0], fr[fr.length - 1]])
  // a stall = the picture did not follow the motion for 100 ms or more: from the first motion inside a long gap to the frame
  // that finally showed it (so the 0.2 s a cursor needs to appear after a static lead-in is a short hiccup, not a long stall)
  const stalls = []
  for (let i = 1; i < fr.length; i++) {
    const p = fr[i - 1], q = fr[i]
    if ((q - p) * 1000 < 100) continue
    let m0 = Infinity
    for (const [s, e] of motion) if (e >= p + 0.02 && s <= q - 0.02) m0 = Math.min(m0, Math.max(s, p))
    if (m0 === Infinity) continue
    const delay = (q - m0) * 1000
    if (delay >= 100) stalls.push({ at: +(m0 - fr[0]).toFixed(2), ms: Math.round(delay) })
  }
  const worst = Math.max(0, ...stalls.map((x) => x.ms))
  const w = stalls.find((x) => x.ms === worst)
  const fps = +((fr.length - 1) / (fr[fr.length - 1] - fr[0])).toFixed(1)
  // tolerated: a few short hiccups; a stall longer than 250 ms or more than 3 stalls rejects the take
  return { stalls, worst, worstAt: w?.at ?? 0, fps, bad: worst > 250 || stalls.length > 3 }
}

async function runShot(file, env) {
  run.shot = path.basename(file)
  run.phase = 'load-shot'
  const mod = await import(pathToFileURL(file).href)
  const m = mod.meta
  if (!m || typeof m.name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(m.name)) throw new Error(`${file}: export const meta = { name: 'letters-digits-dashes', shows: '...' }`)
  if (typeof mod.act !== 'function') throw new Error(`${file}: export async function act(page, ctx)`)
  const meta = { width: 1728, height: 1080, scale: 2, scheme: 'dark', settle: 800, lead: 500, tail: 700, ...m }
  const { name } = meta
  const t00 = Date.now()

  run.phase = 'connect'
  const page = await connect(env.port, {
    width: meta.width, height: meta.height, scale: meta.scale, scheme: meta.scheme, match: meta.match ?? '', seed: meta.seed ?? 7,
    cursor: meta.cursor ?? true, lights: meta.lights ?? false, timezone: meta.timezone, locale: meta.locale,
  })
  const ctx = { sleep, port: env.port, meta, base: env.base, out: env.out, shotFile: file, now: () => 0, at: async () => {}, until: (expr, o) => page.waitFor(expr, o), log: (...a) => log(`[${name}]`, ...a) }
  let stop = null
  let rec = null
  try {
    // passkeys: the virtual authenticator goes in before the page can ask for one
    if (meta.webauthn) { run.phase = 'webauthn'; await page.webauthn(meta.webauthn === true ? {} : meta.webauthn) }
    if (meta.url) {
      run.phase = 'goto'
      const href = new URL(meta.url, env.base).href
      await page.goto(href)
      if (meta.webauthn && (await page.webauthnEnsure())) log(`[${name}] virtual authenticator was dropped by the navigation; re-added`)
      ctx.url = href
    }
    // the cursor starts off screen on the right and slides in on the first move()
    page.mouse = meta.cursorStart ? { x: meta.cursorStart[0], y: meta.cursorStart[1] } : { x: meta.width + 40, y: meta.height * 0.72 }

    if (mod.prepare) { run.phase = 'prepare'; await mod.prepare(page, ctx) }
    await sleep(meta.settle)

    if (env.dry) {
      run.phase = 'act'
      await mod.act(page, ctx)
      await sleep(meta.tail)
      if (mod.after) await mod.after(page, ctx)
      return { name, dry: true, problems: page.problems.length, seconds: +((Date.now() - t00) / 1000).toFixed(1) }
    }

    run.phase = 'record'
    const dir = path.join(env.framesRoot, name)
    fs.rmSync(dir, { recursive: true, force: true })
    stop = await page.record(dir, { quality: meta.quality ?? env.quality })
    const firstFrame = Date.now() + 2000
    while (!page.recording?.frames.length && Date.now() < firstFrame) await sleep(10)
    if (!page.recording?.frames.length) throw new Error('the screencast produced no frame within 2 s (is the tab visible? is Chrome throttled?)')
    const T0 = page.recording.frames[0].t
    ctx.now = () => wall() - T0 // seconds of video time
    ctx.at = async (sec) => { const d = (sec - ctx.now()) * 1000; if (d > 0) await sleep(d) }

    await sleep(meta.lead)
    run.phase = 'act'
    page.mark('act:start')
    const actResult = await mod.act(page, ctx)
    page.mark('act:end')
    await sleep(meta.tail)
    run.phase = 'stop'
    rec = await stop()
    stop = null
    // capture-stall gate: gaps of 100 ms or more between screencast frames WHILE something was moving (cursor path, a scroll
    // glide, or the whole take for pages that animate by themselves) are stalls: the machine was busy and the footage will
    // stutter. A take with too many is thrown away and shot again (the page is reloaded, so it starts clean).
    const gate = takeGate(rec, page, meta)
    if (gate.stalls.length) log(`[${name}] take ${env.attempt}/${env.attempts}: ${gate.stalls.length} stall(s) during motion, worst ${gate.worst} ms at ${gate.worstAt}s (${gate.fps} fps)`)
    if (!env.noGate && meta.retry !== false && gate.bad && env.attempt < env.attempts) {
      fs.rmSync(path.join(env.framesRoot, name), { recursive: true, force: true })
      throw new RetryTake(`${gate.stalls.length} capture stalls (worst ${gate.worst} ms)`)
    }
    if (env.strict && !env.noGate && gate.bad && (meta.retry === false || env.attempt >= env.attempts)) {
      fs.rmSync(path.join(env.framesRoot, name), { recursive: true, force: true })
      throw new Error(`take rejected: ${gate.stalls.length} capture stalls during motion (worst ${gate.worst} ms), ${gate.fps} fps`)
    }
    if (mod.after) { run.phase = 'after'; await mod.after(page, ctx) }
    const events = await page.events()
    const ignore = (meta.ignoreProblems ?? []).map((x) => new RegExp(x))
    const problems = page.problems.filter((p) => !ignore.some((re) => re.test(p.text)))
    const cursor = [...page.cursorPath]
    await page.send('Page.navigate', { url: 'about:blank' }, { timeout: 4000 }).catch(() => {}) // idle the tab (a 3D page left running starves the next take)
    await page.close()

    if (env.noEncode) return { name, frames: rec.frames.length, framesDir: dir, recorded_seconds: +(rec.endT - T0).toFixed(2) }

    run.phase = 'encode'
    const res = encode({ framesDir: dir, name, outDir: env.out, fps: env.fps, crf: env.crf, preset: env.preset, trim: meta.trim, duration: meta.duration, logical: [meta.width, meta.height] })
    if (rec.frames.length < 20) log(`[${name}] WARNING only ${rec.frames.length} screencast frames: the page was nearly static or the capture starved`)

    // sidecar: everything the edit needs to line a cursor, a click or a phase change up with the footage
    const t0 = T0 + res.trim[0]
    const rel = (t) => +(t - t0).toFixed(3)
    const inRange = (t) => t - t0 >= -0.001 && t - t0 <= res.seconds + 0.001
    const sidecar = {
      name, url: ctx.url ?? null, video: { seconds: res.seconds, fps: res.fps, size: res.size, logical: res.logical, scale: meta.scale }, t0,
      events: events.filter((e) => inRange(e.t)).map(({ t, ...rest }) => ({ t: rel(t), ...rest })),
      cursor: cursor.filter(([t]) => inRange(t)).map(([t, x, y]) => [rel(t), x, y]),
      problems: problems.map(({ t, ...rest }) => ({ t: rel(t), ...rest })),
    }
    const evFile = path.join(env.out, 'events', `${name}.json`)
    fs.mkdirSync(path.dirname(evFile), { recursive: true })
    fs.writeFileSync(evFile, JSON.stringify(sidecar))

    // key events for the edit, in CLIP seconds: every mark() the shot made (first time each label fires), plus the console's own
    // phase/view changes, the app calls that start a script (app:play = incident T+0) and every click (with what it hit).
    const keyEvents = {}
    const firstOf = (k, t) => { if (!(k in keyEvents)) keyEvents[k] = t }
    const phases = [], views = [], clicks = []
    for (const e of sidecar.events) {
      if (e.type === 'mark' && e.label && !/^act:/.test(e.label)) firstOf(e.label, e.t)
      else if (/^(bulkhead|claura):phase$/.test(e.type)) { phases.push({ t: e.t, phase: e.detail }); firstOf(`phase:${e.detail}`, e.t) }
      else if (/^(bulkhead|claura):view$/.test(e.type)) { views.push({ t: e.t, view: e.detail }); firstOf(`view:${e.detail}`, e.t) }
      else if (e.type === 'app' && ['play', 'approve', 'seek', 'reset'].includes(e.method)) firstOf(`app:${e.method}`, e.t)
      else if (e.type === 'click') clicks.push({ t: e.t, target: e.target || e.hit || '', hit: e.hit || '' })
      else if (/^webauthn:/.test(e.type)) firstOf(e.type, e.t)
    }

    const relOut = (p) => path.relative(env.out, p)
    const outBase = path.relative(path.resolve(HERE, '..'), env.out)
    const entry = {
      name, file: relOut(res.master), src: `${outBase}/${relOut(res.master)}`, proxy: res.proxy ? relOut(res.proxy) : null, contact: relOut(res.contact), sheet: relOut(res.sheet), events: relOut(evFile),
      seconds: res.seconds, fps: res.fps, size: res.size, logical: res.logical, scale: meta.scale,
      shows: meta.shows ?? '', url: ctx.url ?? null, theme: meta.scheme, shot: path.relative(path.resolve(HERE, '..'), file),
      capturedAt: new Date().toISOString(), capture: res.stats, bytes: res.bytes,
      keyEvents, phases, views, clicks, stalls: { count: gate.stalls.length, worst: gate.worst, worstAt: gate.worstAt, attempt: env.attempt },
      problems: problems.length, ...(actResult && typeof actResult === 'object' ? { result: actResult } : {}), notes: `${meta.notes ?? ''}${meta.notes ? ' ' : ''}Screencast ${res.stats.frames_used} unique frames over ${res.seconds}s (${res.stats.unique_fps}/s, median gap ${res.stats.median_gap_ms} ms) laid on a constant ${res.fps} fps timeline.`,
    }
    const manifestFile = path.join(env.out, 'manifest.json')
    saveManifest(manifestFile, [...loadManifest(manifestFile).filter((c) => c.name !== name), entry])
    if (!env.keepFrames) fs.rmSync(dir, { recursive: true, force: true })
    log(`[${name}] ${res.seconds}s ${res.size.join('x')} @${res.fps} -> ${entry.src}  (${(res.bytes.master / 1e6).toFixed(1)} MB master, ${res.stats.unique_fps} unique fps, ${problems.length} page problems, ${((Date.now() - t00) / 1000).toFixed(0)} s total)`)
    return { name, ...entry, problemList: problems.slice(0, 5).map((p) => `${p.kind}: ${p.text}`) }
  } finally {
    if (stop) { try { await stop() } catch { /* ignore */ } }
    if (!page.closed) {
      // idle the tab: a left-over 3D page keeps the GPU busy (and starves the next take) after the run
      await page.send('Page.navigate', { url: 'about:blank' }, { timeout: 4000 }).catch(() => {})
      await page.close()
    }
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const out = o.out ?? DEFAULT_OUT
  if (o.list) {
    const m = loadManifest(path.join(out, 'manifest.json'))
    for (const c of m) console.error(`${c.name.padEnd(28)} ${String(c.seconds).padStart(6)}s  ${c.size?.join('x')}  ${c.src}  ${c.shows}`)
    console.log('RESULT ' + JSON.stringify({ ok: true, clips: m.map((c) => c.name) }))
    return 0
  }
  if (!o.shots.length) throw new Error('usage: node capture/shoot.mjs [--serve DIR[:PORT]] [--url URL] [--port 9230] <shot.mjs> ...   (see the header of capture/shoot.mjs)')
  fs.mkdirSync(RUN_DIR, { recursive: true })
  if (fs.existsSync(LOCK)) {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8') || '{}')
    if (l.pid && alive(l.pid)) throw new Error(`another shoot is running (pid ${l.pid}, started ${l.startedAt}); wait for it or kill that pid`)
  }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))

  const env = { port: o.port, out, fps: o.fps, crf: o.crf, preset: o.preset, quality: o.quality, keepFrames: o.keepFrames, noEncode: o.noEncode, dry: o.dry, base: o.url, attempts: o.attempts ?? 3, noGate: o.noGate, strict: o.strict, attempt: 1 }
  env.framesRoot = o.framesDir ?? path.join(tmpRoot(), 'claura-cap-frames')
  fs.mkdirSync(env.framesRoot, { recursive: true })

  // 1. the app under capture
  if (o.serve) {
    run.phase = 'serve'
    const i = o.serve.lastIndexOf(':')
    const hasPort = i > 0 && /^\d+$/.test(o.serve.slice(i + 1))
    const dir = hasPort ? o.serve.slice(0, i) : o.serve
    const port = hasPort ? +o.serve.slice(i + 1) : DEFAULT_SERVE_PORT
    run.server = await startServer({ dir, port })
    env.base ??= run.server.url
    log(`dev server for ${dir} up at ${run.server.url} (pid ${run.server.pid})`)
  }

  // 2. Chrome
  run.phase = 'chrome'
  const first = await import(pathToFileURL(o.shots[0]).href)
  const fm = first.meta ?? {}
  if (await portInUse(o.port)) {
    const v = await cdpVersion(o.port)
    if (!v) throw new Error(`port ${o.port} is in use by something that is not a Chrome DevTools endpoint`)
    log(`attaching to the Chrome already on port ${o.port} (${v.Browser}); it will be left running`)
  } else if (o.attach) {
    throw new Error(`--attach given but no Chrome is on port ${o.port}`)
  } else {
    run.chrome = await startChrome({ url: 'about:blank', port: o.port, width: fm.width ?? 1728, height: fm.height ?? 1080, scale: fm.scale ?? 2, headful: o.headful })
    run.ownsChrome = true
    log(`launched isolated ${run.chrome.version} on port ${o.port} (pid ${run.chrome.pid}, profile ${path.basename(run.chrome.profile)})`)
  }

  // 3. the shots
  const clips = []
  const failures = []
  for (const file of o.shots) {
    for (env.attempt = 1; env.attempt <= env.attempts; env.attempt++) {
      try {
        clips.push(await runShot(file, env))
        break
      } catch (e) {
        if (e instanceof RetryTake) { log(`[${path.basename(file)}] ${e.message}: shooting it again (${env.attempt}/${env.attempts})`); await sleep(1500); continue }
        failures.push({ shot: path.basename(file), phase: run.phase, error: e.message.split('\n')[0] })
        console.error(`[shoot] FAILED ${path.basename(file)} in phase "${run.phase}":\n${describe(e)}`)
        break
      }
    }
  }
  const ok = failures.length === 0
  await cleanup({ keepChrome: o.keepChrome })
  if (o.keepChrome && run.ownsChrome) log(`Chrome left running on port ${o.port}; stop it with: node capture/chrome.mjs stop --port ${o.port}`)
  console.log('RESULT ' + JSON.stringify({ ok, clips: clips.map((c) => (c.dry ? c : { name: c.name, seconds: c.seconds, src: c.src, size: c.size, capture: c.capture, problems: c.problems, problemList: c.problemList })), failures }))
  return ok ? 0 : 1
}

const fatal = async (e, where) => {
  console.error(`[shoot] FATAL${where ? ` (${where})` : ''} in phase "${run.phase}"${run.shot ? ` of ${run.shot}` : ''}:\n${describe(e)}`)
  const hint = /ECONNREFUSED/.test(String(e?.message) + String(e?.cause?.code)) ? 'nothing is listening there: start the dev server / Chrome, or let --serve and the launcher do it' : undefined
  await cleanup()
  console.log('RESULT ' + JSON.stringify({ ok: false, phase: run.phase, shot: run.shot, error: String(e?.message ?? e).split('\n')[0], ...(hint ? { hint } : {}) }))
  process.exit(1)
}
process.on('uncaughtException', (e) => fatal(e, 'uncaughtException'))
process.on('unhandledRejection', (e) => fatal(e, 'unhandledRejection'))
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { console.error(`[shoot] ${sig}: cleaning up`); await cleanup(); process.exit(130) })
process.on('exit', () => { try { fs.rmSync(LOCK, { force: true }) } catch { /* ignore */ } })

main().then((code) => process.exit(code), (e) => fatal(e, 'main'))
