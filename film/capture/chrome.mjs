#!/usr/bin/env node
// chrome.mjs — an isolated, headless Chrome for screen capture.
//
//   node capture/chrome.mjs start [url] [--port 9230] [--size 1728x1080] [--scale 2] [--headful] [--profile DIR]
//   node capture/chrome.mjs status [--port 9230]
//   node capture/chrome.mjs stop   [--port 9230]
//
// Isolation: its own --user-data-dir (a fresh temp profile, deleted on stop), its own debugging port (9230), its own
// process group (so `stop` takes down every helper), a mock keychain (no macOS keychain prompt). It never touches the
// person's Chrome or the shared in-app Browser pane. As a module: startChrome(), stopChrome(), chromeStatus().
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const RUN_DIR = path.join(HERE, '.run')
export const DEFAULT_PORT = 9230
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

export function findChrome() {
  for (const c of [process.env.CHROME_PATH, ...CHROME_CANDIDATES]) if (c && fs.existsSync(c)) return c
  throw new Error('no Chrome found; set CHROME_PATH to the browser binary')
}

/** Where temporary profiles go. CAP_TMP overrides the system temp dir (use a session scratch dir). */
export function tmpRoot() {
  return process.env.CAP_TMP || os.tmpdir()
}

const stateFile = (port, kind = 'chrome') => path.join(RUN_DIR, `${kind}-${port}.json`)
export function readState(port, kind = 'chrome') {
  try { return JSON.parse(fs.readFileSync(stateFile(port, kind), 'utf8')) } catch { return null }
}
export function writeState(port, state, kind = 'chrome') {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.writeFileSync(stateFile(port, kind), JSON.stringify(state, null, 1))
}
export function clearState(port, kind = 'chrome') {
  try { fs.rmSync(stateFile(port, kind), { force: true }) } catch { /* ignore */ }
}

export const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

/** True when something accepts TCP connections on the port (CDP or not), on IPv4 or IPv6 loopback (vite binds only [::1] here). */
export async function portInUse(port, hosts = ['127.0.0.1', '::1']) {
  const one = (host) => new Promise((resolve) => {
    const s = net.connect({ port, host })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
    s.setTimeout(800, () => { s.destroy(); resolve(false) })
  })
  return (await Promise.all(hosts.map(one))).some(Boolean)
}

/** Browser version info when a Chrome answers the DevTools HTTP endpoint on the port, else null. */
export async function cdpVersion(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

export function chromeArgs({ port, width, height, scale, profile, headful }) {
  return [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
    ...(headful ? [] : ['--headless=new']),
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`,
    '--force-color-profile=srgb', // sRGB frames regardless of the display's profile
    '--font-render-hinting=none',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run', '--no-default-browser-check', '--disable-default-apps', '--disable-sync', '--disable-component-update',
    '--disable-background-networking', '--disable-breakpad', '--disable-search-engine-choice-screen',
    '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication',
    // no timer/render throttling while the page is "in the background" or occluded
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-ipc-flooding-protection',
    // never ask the macOS keychain for anything
    '--password-store=basic', '--use-mock-keychain',
  ]
}

/**
 * Starts Chrome and resolves once the DevTools endpoint answers.
 * opts: { url='about:blank', port=9230, width=1728, height=1080, scale=2, profile?, headful=false, detach=false, log? }
 * Returns { pid, port, profile, url, version, logFile, started: true, stop() }.
 */
export async function startChrome(opts = {}) {
  const { url = 'about:blank', port = DEFAULT_PORT, width = 1728, height = 1080, scale = 2, headful = false, detach = false } = opts
  if (await portInUse(port)) {
    const v = await cdpVersion(port)
    const known = readState(port)
    throw new Error(`port ${port} is already in use${v ? ` by a Chrome (${v.Browser})` : ''}${known ? ` (started by capture, pid ${known.pid}: run "node capture/chrome.mjs stop --port ${port}")` : ''}; pick another --port or stop that process`)
  }
  fs.mkdirSync(RUN_DIR, { recursive: true })
  const profile = opts.profile ?? fs.mkdtempSync(path.join(tmpRoot(), 'claura-cap-'))
  fs.mkdirSync(profile, { recursive: true })
  const bin = findChrome()
  const logFile = opts.log ?? path.join(RUN_DIR, `chrome-${port}.log`)
  const out = fs.openSync(logFile, 'w')
  const env = { ...process.env }
  delete env.NODE_USE_SYSTEM_CA
  const child = spawn(bin, [...chromeArgs({ port, width, height, scale, profile, headful }), url], {
    detached: true, // own process group: `stop` signals the whole tree
    stdio: ['ignore', out, out],
    env,
  })
  fs.closeSync(out)
  let early = null
  child.once('exit', (code, sig) => { early = `exited early (code ${code}, signal ${sig})` })
  child.once('error', (e) => { early = `failed to start: ${e.message}` })
  const state = { pid: child.pid, port, profile, url, bin, logFile, startedAt: new Date().toISOString(), ownedProfile: !opts.profile }
  writeState(port, state)

  let version = null
  const until = Date.now() + 20000
  while (Date.now() < until) {
    if (early) break
    version = await cdpVersion(port)
    if (version) break
    await sleep(150)
  }
  if (!version) {
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').slice(-12).join('\n') : ''
    await stopChrome(port, { quiet: true })
    throw new Error(`Chrome did not open DevTools on port ${port}${early ? ` (${early})` : ' within 20 s'}\n${tail}`)
  }
  if (detach) child.unref()
  return { ...state, version: version.Browser, started: true, child, stop: () => stopChrome(port) }
}

/** Stops the Chrome that capture started on this port (its whole process group) and removes its temp profile. */
export async function stopChrome(port = DEFAULT_PORT, { quiet = false } = {}) {
  const st = readState(port)
  if (!st) return { stopped: false, reason: 'no state file (nothing started by capture on this port)' }
  const sig = (s) => { try { process.kill(-st.pid, s) } catch { try { process.kill(st.pid, s) } catch { /* gone */ } } }
  if (alive(st.pid)) {
    sig('SIGTERM')
    const until = Date.now() + 4000
    while (alive(st.pid) && Date.now() < until) await sleep(100)
    if (alive(st.pid)) { sig('SIGKILL'); await sleep(300) }
  }
  // helpers can outlive the leader by a moment; make sure the group is empty
  await sleep(150)
  try { process.kill(-st.pid, 0); sig('SIGKILL') } catch { /* group empty */ }
  if (st.ownedProfile && st.profile && path.basename(st.profile).startsWith('claura-cap-')) {
    try { fs.rmSync(st.profile, { recursive: true, force: true, maxRetries: 3 }) } catch { /* ignore */ }
  }
  clearState(port)
  if (!quiet) console.error(`[chrome] stopped pid ${st.pid} (port ${port})`)
  return { stopped: true, pid: st.pid }
}

export async function chromeStatus(port = DEFAULT_PORT) {
  const st = readState(port)
  const version = await cdpVersion(port)
  let targets = []
  if (version) {
    try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page').map((t) => ({ id: t.id, url: t.url, title: t.title })) } catch { /* ignore */ }
  }
  return { running: !!version, port, pid: st?.pid ?? null, ours: !!st && alive(st.pid), version: version?.Browser ?? null, profile: st?.profile ?? null, targets }
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const cmd = args.shift()
  const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v }
  const bool = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true }
  try {
    const port = +flag('port', DEFAULT_PORT)
    if (cmd === 'start') {
      const [w, h] = String(flag('size', '1728x1080')).split('x').map(Number)
      const scale = +flag('scale', 2)
      const profile = flag('profile')
      const headful = bool('headful')
      const url = args.find((a) => !a.startsWith('--')) ?? 'about:blank'
      const c = await startChrome({ url, port, width: w, height: h, scale, profile, headful, detach: true })
      console.log(JSON.stringify({ ok: true, pid: c.pid, port, version: c.version, profile: c.profile, url, stopWith: `node capture/chrome.mjs stop --port ${port}` }))
      process.exit(0)
    } else if (cmd === 'stop') {
      console.log(JSON.stringify(await stopChrome(port)))
    } else if (cmd === 'status') {
      console.log(JSON.stringify(await chromeStatus(port)))
    } else {
      console.error('usage: node capture/chrome.mjs start [url] [--port 9230] [--size 1728x1080] [--scale 2] [--headful] | status | stop')
      process.exit(2)
    }
  } catch (e) {
    console.error(`[chrome] ${e.message}`)
    console.log(JSON.stringify({ ok: false, error: e.message }))
    process.exit(1)
  }
}
