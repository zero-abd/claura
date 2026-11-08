#!/usr/bin/env node
// serve.mjs — starts a project's dev server (vite) for capture, in its own process group, and stops it again.
//
//   node capture/serve.mjs start <projectDir> [port=4327]     (vite --port N --strictPort; read-only use of the project)
//   node capture/serve.mjs status [port] | stop [port]
//
// Why not just `npx vite --port 4317 --strictPort`: another agent may already hold 4317 (it did: PID 8755), and --strictPort
// then exits with "Port 4317 is already in use". Pick a free port; never stop a server this tool did not start.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RUN_DIR, alive, clearState, portInUse, readState, writeState } from './chrome.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const DEFAULT_SERVE_PORT = 4327

/** Resolves once http://localhost:<port>/ answers (any status below 500). */
async function waitReady(port, child, timeoutMs, logFile) {
  const until = Date.now() + timeoutMs
  let early = null
  child.once('exit', (code, sig) => { early = `exited early (code ${code}, signal ${sig})` })
  while (Date.now() < until) {
    if (early) break
    try {
      const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) })
      if (r.status < 500) return
    } catch { /* not up yet */ }
    await sleep(200)
  }
  const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-12).join('\n') : ''
  throw new Error(`dev server on port ${port} did not come up${early ? ` (${early})` : ` within ${timeoutMs} ms`}\n${tail}`)
}

/**
 * opts: { dir, port=4327, cmd?: [bin, ...args], timeout=40000 }
 * Default command: <dir>/node_modules/.bin/vite --port N --strictPort (else `npx --yes vite ...`).
 * Returns { pid, port, url, started: true, stop() }.
 */
export async function startServer({ dir, port = DEFAULT_SERVE_PORT, cmd, timeout = 40000 } = {}) {
  if (!dir) throw new Error('startServer: dir is required')
  dir = path.resolve(dir)
  if (!fs.existsSync(dir)) throw new Error(`project folder not found: ${dir}`)
  if (await portInUse(port)) throw new Error(`port ${port} is already taken (something else is serving there; this tool will not stop it). Use another port, e.g. ${port + 1}, or point --url at it.`)
  fs.mkdirSync(RUN_DIR, { recursive: true })
  const vite = path.join(dir, 'node_modules', '.bin', 'vite')
  const argv = cmd ?? (fs.existsSync(vite) ? [vite, '--port', String(port), '--strictPort'] : ['npx', '--yes', 'vite', '--port', String(port), '--strictPort'])
  const logFile = path.join(RUN_DIR, `serve-${port}.log`)
  const out = fs.openSync(logFile, 'w')
  const env = { ...process.env }
  delete env.NODE_USE_SYSTEM_CA
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, detached: true, stdio: ['ignore', out, out], env })
  fs.closeSync(out)
  writeState(port, { pid: child.pid, port, dir, cmd: argv, logFile, startedAt: new Date().toISOString() }, 'serve')
  try {
    await waitReady(port, child, timeout, logFile)
  } catch (e) {
    await stopServer(port, { quiet: true })
    throw e
  }
  return { pid: child.pid, port, url: `http://localhost:${port}/`, started: true, child, stop: () => stopServer(port) }
}

/** Stops the dev server this tool started on the port (whole process group). */
export async function stopServer(port = DEFAULT_SERVE_PORT, { quiet = false } = {}) {
  const st = readState(port, 'serve')
  if (!st) return { stopped: false, reason: 'no state file (this tool did not start a server on that port)' }
  const sig = (s) => { try { process.kill(-st.pid, s) } catch { try { process.kill(st.pid, s) } catch { /* gone */ } } }
  if (alive(st.pid)) {
    sig('SIGTERM')
    const until = Date.now() + 4000
    while (alive(st.pid) && Date.now() < until) await sleep(100)
    if (alive(st.pid)) { sig('SIGKILL'); await sleep(300) }
  }
  await sleep(100)
  try { process.kill(-st.pid, 0); sig('SIGKILL') } catch { /* group empty */ }
  clearState(port, 'serve')
  if (!quiet) console.error(`[serve] stopped pid ${st.pid} (port ${port})`)
  return { stopped: true, pid: st.pid }
}

export async function serveStatus(port = DEFAULT_SERVE_PORT) {
  const st = readState(port, 'serve')
  return { port, listening: await portInUse(port), ours: !!st && alive(st.pid), pid: st?.pid ?? null, dir: st?.dir ?? null }
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2)
  try {
    if (cmd === 'start') {
      const s = await startServer({ dir: a, port: +(b ?? DEFAULT_SERVE_PORT) })
      s.child.unref()
      console.log(JSON.stringify({ ok: true, pid: s.pid, port: s.port, url: s.url, stopWith: `node capture/serve.mjs stop ${s.port}` }))
      process.exit(0)
    } else if (cmd === 'stop') {
      console.log(JSON.stringify(await stopServer(+(a ?? DEFAULT_SERVE_PORT))))
    } else if (cmd === 'status') {
      console.log(JSON.stringify(await serveStatus(+(a ?? DEFAULT_SERVE_PORT))))
    } else {
      console.error('usage: node capture/serve.mjs start <projectDir> [port=4327] | status [port] | stop [port]')
      process.exit(2)
    }
  } catch (e) {
    console.error(`[serve] ${e.message}`)
    console.log(JSON.stringify({ ok: false, error: e.message.split('\n')[0] }))
    process.exit(1)
  }
}
