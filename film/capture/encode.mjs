#!/usr/bin/env node
// encode.mjs — screencast frames -> a constant 60 fps H.264 master, a proxy, a contact still and a contact sheet.
//
//   node capture/encode.mjs <framesDir> <name> [--out assets/clips] [--trim START END] [--duration SECONDS]
//                           [--fps 60] [--crf 12] [--preset medium] [--no-proxy]
//
// Replaces bulkhead-studio's encode.py. That one wrote a concat list with cwd-relative frame paths; ffmpeg resolves
// relative entries against the *list file's* folder (out/rec/x/out/rec/x/f000000.jpg: not found), so every encode died and
// the Node caller printed a 70-line dump that ends in a bare "Node.js v24" line. Here: no concat list. Every 60 fps tick
// is mapped explicitly to the latest frame presented at or before it (hold-last, mid-tick sample), linked as an
// absolute-path numbered sequence, and ffmpeg reads that.
//
// Outputs (outDir defaults to ../assets/clips):  <name>.mp4 (master, flat: the film's footage template reads
// assets/clips/<name>.mp4)  proxy/<name>.mp4  contact/<name>.jpg  contact/<name>-sheet.jpg
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_OUT = path.resolve(HERE, '..', 'assets', 'clips')

export function ffmpegPath() {
  for (const c of [process.env.FFMPEG, '/Users/abd/repos/bulkhead-studio/bin/ffmpeg']) if (c && fs.existsSync(c)) return c
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' })
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim()
  throw new Error('ffmpeg not found; set FFMPEG=/path/to/ffmpeg (house copy: /Users/abd/repos/bulkhead-studio/bin/ffmpeg)')
}

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw new Error(`${label}: could not run ${cmd}: ${r.error.message}`)
  if (r.status !== 0) {
    const tail = (r.stderr || '').trim().split('\n').slice(-14).join('\n')
    throw new Error(`${label} failed (exit ${r.status})\n  ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}\n${tail}`)
  }
  return r
}

// frames carry BT.709 limited-range tags end to end (ffmpeg's -color_* output options alone leave primaries/transfer 'unknown')
const STAMP = 'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv'

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] }

/** Resolves a frames.json entry to an absolute path (bare names, relative paths and absolute paths all work). */
function resolveFrame(framesDir, file) {
  if (path.isAbsolute(file) && fs.existsSync(file)) return file
  const bare = path.join(framesDir, path.basename(file))
  if (fs.existsSync(bare)) return path.resolve(bare)
  const rel = path.resolve(file)
  if (fs.existsSync(rel)) return rel
  throw new Error(`frame file missing: ${file} (looked in ${framesDir})`)
}

/**
 * opts: { framesDir, name, outDir, fps=60, trim?: [s,e], duration?, crf=12, preset='medium', proxy=true, logical?: [w,h], keepSeq=false, seqDir? }
 * trim/duration are seconds from the first frame; duration beyond the recording holds the last frame.
 */
export function encode(opts) {
  const { framesDir, name, outDir = DEFAULT_OUT, fps = 60, trim, duration, crf = 12, preset = 'medium', proxy = true, keepSeq = false } = opts
  const seq = path.resolve(opts.seqDir ?? path.join(framesDir, '_seq'))
  const FF = ffmpegPath()
  const frames = JSON.parse(fs.readFileSync(path.join(framesDir, 'frames.json'), 'utf8'))
  const real = frames.filter((f) => f.file)
  if (!real.length) throw new Error(`no frames in ${framesDir}: the screencast produced nothing (page hidden or Chrome throttled?)`)
  const t0 = real[0].t
  const last = frames[frames.length - 1]
  const endT = last.file === null ? last.t : real[real.length - 1].t + 1 / fps
  const total = endT - t0
  let [ts, te] = trim ?? [0, total]
  if (duration != null) te = ts + duration
  if (te <= ts) throw new Error(`empty range: trim/duration give ${ts}..${te}`)
  const N = Math.max(1, Math.round((te - ts) * fps))

  // tick -> source frame (hold-last, sampled at the middle of the tick)
  const ext = path.extname(real[0].file).slice(1) || 'jpg'
  fs.rmSync(seq, { recursive: true, force: true })
  fs.mkdirSync(seq, { recursive: true })
  const used = new Set()
  const usedOrder = []
  let j = 0
  for (let i = 0; i < N; i++) {
    const u = ts + (i + 0.5) / fps
    while (j + 1 < real.length && real[j + 1].t - t0 <= u) j++
    fs.symlinkSync(resolveFrame(framesDir, real[j].file), path.join(seq, `o${String(i).padStart(6, '0')}.${ext}`))
    if (!used.has(j)) { used.add(j); usedOrder.push(j) }
  }

  const master = path.join(outDir, `${name}.mp4`)
  const proxyFile = path.join(outDir, 'proxy', `${name}.mp4`)
  const contactFile = path.join(outDir, 'contact', `${name}.jpg`)
  const sheetFile = path.join(outDir, 'contact', `${name}-sheet.jpg`)
  for (const d of [outDir, path.join(outDir, 'proxy'), path.join(outDir, 'contact')]) fs.mkdirSync(d, { recursive: true })

  const tags = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709']
  // Chrome's screencast JPEGs are JFIF: full range, BT.601 matrix. Convert to limited-range BT.709 explicitly.
  const scaleIn = ext === 'png' ? '' : 'in_range=pc:in_color_matrix=bt601:'
  const vf = `scale=w=trunc(iw/2)*2:h=trunc(ih/2)*2:${scaleIn}out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p,${STAMP}`
  const t1 = Date.now()
  run(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-start_number', '0', '-i', path.join(seq, `o%06d.${ext}`), '-vf', vf,
    '-fps_mode', 'cfr', '-r', String(fps), '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-g', String(fps), '-bf', '2', ...tags,
    '-movflags', '+faststart', '-an', master], 'master encode')
  const tMaster = (Date.now() - t1) / 1000

  const [mw, mh] = probeSize(FF, master)
  const logical = opts.logical ?? [Math.round(mw / 2), Math.round(mh / 2)]
  if (proxy) {
    run(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', master, '-vf', `scale=${logical[0]}:${logical[1]}:flags=lanczos:out_range=tv:out_color_matrix=bt709,setsar=1,format=yuv420p,${STAMP}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30', ...tags, '-movflags', '+faststart', '-an', proxyFile], 'proxy encode')
  }
  const seconds = N / fps
  run(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', (seconds * 0.6).toFixed(3), '-i', master, '-frames:v', '1', '-vf', 'scale=1600:-1:flags=lanczos', '-q:v', '3', contactFile], 'contact still')
  run(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', master, '-vf', `fps=${(8 / seconds).toFixed(5)},scale=640:-1:flags=lanczos,tile=4x2:padding=6:margin=6:color=0x111111`, '-frames:v', '1', '-q:v', '3', sheetFile], 'contact sheet')

  // how well did the screencast keep up? gaps between the source frames that actually made it into the video
  const gaps = []
  for (let k = 1; k < usedOrder.length; k++) gaps.push((real[usedOrder[k]].t - real[usedOrder[k - 1]].t) * 1000)
  const stats = {
    source_frames: real.length,
    frames_used: usedOrder.length,
    unique_fps: +(usedOrder.length / seconds).toFixed(1),
    median_gap_ms: +pct(gaps, 50).toFixed(1),
    p95_gap_ms: +pct(gaps, 95).toFixed(1),
    max_gap_ms: +Math.max(0, ...gaps).toFixed(0),
    gaps_le_20ms_pct: gaps.length ? +((gaps.filter((g) => g <= 20).length / gaps.length) * 100).toFixed(0) : 0,
    gaps_gt_50ms: gaps.filter((g) => g > 50).length,
    master_encode_s: +tMaster.toFixed(1),
  }
  if (!keepSeq) fs.rmSync(seq, { recursive: true, force: true })
  return {
    name, master, proxy: proxy ? proxyFile : null, contact: contactFile, sheet: sheetFile, seconds: +seconds.toFixed(3), fps, ticks: N,
    size: [mw, mh], logical, trim: [+ts.toFixed(3), +te.toFixed(3)], recorded_seconds: +total.toFixed(3),
    bytes: { master: fs.statSync(master).size, proxy: proxy ? fs.statSync(proxyFile).size : 0 }, stats,
  }
}

function probeSize(FF, file) {
  const r = spawnSync(FF, ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const m = /Video:.*?, (\d{2,5})x(\d{2,5})/.exec(r.stderr || '')
  if (!m) throw new Error(`could not read the size of ${file}`)
  return [+m[1], +m[2]]
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v }
  try {
    const ti = args.indexOf('--trim')
    let trim
    if (ti >= 0) { trim = [+args[ti + 1], +args[ti + 2]]; args.splice(ti, 3) }
    const noProxy = args.includes('--no-proxy')
    if (noProxy) args.splice(args.indexOf('--no-proxy'), 1)
    const out = flag('out', DEFAULT_OUT)
    const dur = flag('duration')
    const fps = +flag('fps', 60)
    const crf = +flag('crf', 12)
    const preset = flag('preset', 'medium')
    const seqDir = flag('seq')
    const [framesDir, name] = args
    if (!framesDir || !name) throw new Error('usage: node capture/encode.mjs <framesDir> <name> [--out DIR] [--trim S E] [--duration S] [--fps 60] [--crf 12] [--preset medium] [--no-proxy] [--seq DIR]')
    const res = encode({ framesDir: path.resolve(framesDir), name, outDir: path.resolve(out), trim, duration: dur != null ? +dur : undefined, fps, crf, preset, proxy: !noProxy, seqDir })
    console.log(JSON.stringify({ ok: true, ...res }))
  } catch (e) {
    console.error(`[encode] ${e.message}`)
    console.log(JSON.stringify({ ok: false, error: e.message.split('\n')[0] }))
    process.exit(1)
  }
}
