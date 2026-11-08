#!/usr/bin/env node
// finalize.mjs — tidies assets/clips/manifest.json after a round of shoots:
//   * moves the pipeline smoke-test clips (console-test, webauthn-io-test) out into manifest.smoke-tests.json (files stay);
//   * adds the key events that can only be measured on the picture: incident-run.orbGreen (the orb in the 3D facility turns green);
//   * prints a compact summary (name, seconds, size, fps, key events) as JSON on stdout.
//
//   node capture/finalize.mjs [--no-orb]
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_OUT, ffmpegPath } from './encode.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
void HERE
const OUT = DEFAULT_OUT
const manifestFile = path.join(OUT, 'manifest.json')
const smokeFile = path.join(OUT, 'manifest.smoke-tests.json')
const SMOKE = new Set(['console-test', 'webauthn-io-test'])
const FF = ffmpegPath()

let entries = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const smoke = entries.filter((e) => SMOKE.has(e.name))
if (smoke.length) {
  let prev = []
  try { prev = JSON.parse(fs.readFileSync(smokeFile, 'utf8')) } catch { /* none yet */ }
  fs.writeFileSync(smokeFile, JSON.stringify([...prev.filter((p) => !smoke.some((s) => s.name === p.name)), ...smoke], null, 1))
  entries = entries.filter((e) => !SMOKE.has(e.name))
}

/** mean colour of a (2*half)^2 CSS-px square around (cx, cy) at clip time t (the master is at 2x). */
function meanRgb(file, t, cx, cy, half = 12) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', `crop=${half * 4}:${half * 4}:${(cx - half) * 2}:${(cy - half) * 2},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 })
  return r.stdout?.length >= 3 ? [r.stdout[0], r.stdout[1], r.stdout[2]] : null
}

if (!process.argv.includes('--no-orb')) {
  const inc = entries.find((e) => e.name === 'incident-run')
  const contained = inc?.keyEvents?.['phase:contained']
  if (inc && contained != null) {
    const file = path.join(OUT, inc.file)
    let found = null
    for (let t = contained; t <= Math.min(inc.seconds - 0.05, contained + 5); t += 0.05) {
      const c = meanRgb(file, t, 1248, 240)
      if (c && c[1] > c[0] + 25 && c[1] > c[2] + 25) { found = +t.toFixed(2); break } // green: the orb is lit green
    }
    if (found != null) {
      inc.keyEvents.orbGreen = found
      console.error(`[finalize] incident-run: orb turns green at ${found}s (phase:contained at ${contained}s)`)
    } else console.error('[finalize] incident-run: could not find the green orb after the contained phase')
  }
}

// derived from the console's own script timings (script.ts: sentry [0.2,1.0], triage [1.0,2.0], containment steps 2.0..5.3,
// Scribe files the report at approval + 5.0 s, the last scripted motion at approval + 6.6 s); clip seconds
{
  const inc = entries.find((e) => e.name === 'incident-run')
  const k = inc?.keyEvents
  if (k && k.scriptT0 != null) {
    const r = (v) => +v.toFixed(3)
    const d = { sentryLights: r(k.scriptT0 + 0.2), triageLights: r(k.scriptT0 + 1.0), stepsTickStart: r(k.scriptT0 + 2.0), stepsTickEnd: r(k.scriptT0 + 5.3) }
    if (k['phase:isolating'] != null) Object.assign(d, { reportFiled: r(k['phase:isolating'] + 5.0), scriptEnd: r(k['phase:isolating'] + 6.6) })
    Object.assign(k, d)
    inc.derivedKeyEvents = Object.keys(d).concat(k.orbGreen != null ? ['orbGreen (measured on the picture)'] : [])
  }
}

fs.writeFileSync(manifestFile, JSON.stringify(entries, null, 1))
const summary = entries.map((e) => ({
  name: e.name, file: e.src, seconds: e.seconds, size: e.size?.join('x'), fps: e.fps, unique_fps: e.capture?.unique_fps,
  keyEvents: e.keyEvents, problems: e.problems, shows: e.shows,
}))
console.log(JSON.stringify(summary, null, 1))
