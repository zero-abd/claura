#!/usr/bin/env node
// tools/build.mjs (v2) — builds the Claura film from film.config.mjs, the src/ templates and the voice-over timings.
//
//   node tools/build.mjs [--config film.config.mjs] [--vo assets/vo/x.json] [--no-captions] [--quiet]
//
// Writes index.html (scene hosts on the voice clock, the captions host, VO / music / SFX audio), compositions/<id>.html
// for every scene, compositions/captions.html, and review/timing.json (every word, scene and cue, resolved).
//
// VO JSON: ElevenLabs character timings {"chars":[{c,s,e}]} (what bulkhead-studio/tools/vo.mjs writes; [tags] skipped),
// the raw ElevenLabs {"alignment":{characters,character_start_times_seconds,...}}, or words: {"words":[{text,start,end}]},
// [{text,start,end}] (hyperframes transcribe), or [[i,text,s,e]] / [[text,s,e]].
//
// Scenes are keyed by PHRASE cues (film.config.mjs). In a template, {{ expr }} is evaluated at build time with:
//   at("phrase", n=0)   scene-local start (s) of the n-th occurrence of the phrase at/after the scene's own cue
//   end("phrase", n=0)  scene-local end of that occurrence           times("phrase")  local start of each word in it
//   AT / END            the same in film time                         cue("name", fallback?) / cueEnd(...)  config cues
//   T(x)                any time spec -> local s: number (local s) | "phrase" | "@cue" | {phrase,n,offset,edge}
//   timed(obj)          deep copy of obj with every `t` / `at` field resolved through T (camera keys, callouts, clips)
//   w(i) we(i) W(i) WE(i)  word i's start/end, local / film time (v1 API)
//   D  host duration (incl. any transition overlap)   CUT  local time of the cut to the next scene   TOTAL  film length
//   ID  scene id   P  id prefix ("<id>-")   S  span {id,from,to,cut,dur,in,out,tone,toneTo,prev,next}   p  scene params
//   json(v) esc(s) words("Seal the *breach*", cls)  -> <span class="w">…</span> per word (*x* gets class "acc")
// Inlined before evaluation: /*COMMON*/ -> src/common.css, /*KIT*/ -> src/kit/kit.js,
// <!--KIT:name a=1 b="x y"--> -> src/kit/name.html (its own {{ }} see the args as `a`). Missing template -> a stub scene.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const QUIET = flag('--quiet');
const log = (...a) => { if (!QUIET) console.log(...a); };
const warnings = [];
const warn = (m) => { warnings.push(m); console.warn('warn:', m); };
const r3 = (x) => +(+x).toFixed(3);

const cfgPath = path.resolve(opt('--config', 'film.config.mjs'));
const cfg = (await import(pathToFileURL(cfgPath).href + '?t=' + Date.now())).default;
const voFile = opt('--vo', cfg.vo?.json);
if (!voFile || !fs.existsSync(voFile)) throw new Error(`VO timings not found: ${voFile} (set vo.json in ${path.basename(cfgPath)} or pass --vo)`);

// ------------------------------------------------------------------ voice-over words
function loadWords(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fromChars = (chars) => {
    const out = [];
    let cur = '', s = 0, e = 0, tag = false;
    const push = () => { if (cur) out.push({ text: cur, s, e }); cur = ''; };
    for (const c of chars) {
      const ch = c.c ?? c.char ?? c.character;
      if (ch === '[') { push(); tag = true; }
      if (tag) { if (ch === ']') tag = false; continue; }
      if (/\s/.test(ch)) { push(); continue; }
      if (!cur) s = c.s ?? c.start;
      cur += ch;
      e = c.e ?? c.end;
    }
    push();
    return out;
  };
  const fromWords = (ws) => ws.map((w) => {
    if (Array.isArray(w)) return w.length >= 4 ? { text: String(w[1]), s: +w[2], e: +w[3] } : { text: String(w[0]), s: +w[1], e: +w[2] };
    return { text: String(w.text ?? w.word ?? w.w), s: +(w.start ?? w.s), e: +(w.end ?? w.e) };
  }).flatMap((w) => w.text.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).filter(Boolean).map((t) => ({ ...w, text: t })));
  let words;
  if (Array.isArray(j)) words = fromWords(j);
  else if (Array.isArray(j.words)) words = fromWords(j.words);
  else if (Array.isArray(j.chars)) words = fromChars(j.chars);
  else if (j.alignment || j.normalized_alignment) {
    const a = j.alignment || j.normalized_alignment;
    words = fromChars(a.characters.map((c, i) => ({ c, s: a.character_start_times_seconds[i], e: a.character_end_times_seconds[i] })));
  } else throw new Error(`${file}: unknown VO format (want {chars}, {alignment}, {words} or a word array)`);
  return words.filter((w) => w.text && !/^\[.*\]$/.test(w.text)).map((w) => ({ ...w, s: r3(w.s), e: r3(Math.max(w.e, w.s)), n: norm(w.text) }));
}
function norm(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, ''); }

const WORDS = loadWords(voFile);
if (!WORDS.length) throw new Error(`${voFile}: no words`);
const LAST = WORDS[WORDS.length - 1];

// Phrase lookup: case- and punctuation-insensitive, whole words, across token splits ("GPU" finds "G. P. U.").
function findAll(phrase, from = 0) {
  const target = norm(phrase);
  if (!target) throw new Error(`empty phrase: ${JSON.stringify(phrase)}`);
  const hits = [];
  for (let i = from; i < WORDS.length; i++) {
    if (!WORDS[i].n || !target.startsWith(WORDS[i].n)) continue;
    let acc = '';
    for (let j = i; j < WORDS.length; j++) {
      acc += WORDS[j].n;
      if (acc === target) { hits.push([i, j]); break; }
      if (!target.startsWith(acc)) break;
    }
  }
  return hits;
}
function find(phrase, from, n = 0, where = '') {
  let hits = findAll(phrase, from);
  if (hits.length <= n) {
    const all = findAll(phrase, 0);
    if (all.length > n) { hits = all; }
    else {
      const first = norm(String(phrase).split(/\s+/)[0]);
      const near = [...new Set(WORDS.filter((w) => w.n && (w.n.includes(first) || first.includes(w.n)) && w.n.length > 2).map((w) => w.text))].slice(0, 8);
      throw new Error(`${where}phrase not in the voice-over: ${JSON.stringify(phrase)}${n ? ` (occurrence ${n})` : ''}` +
        (near.length ? `\n  similar words: ${near.join(', ')}` : '') + `\n  VO file: ${voFile}`);
    }
  }
  return hits[n];
}

// ------------------------------------------------------------------ scenes on the voice clock
const LEAD = cfg.lead ?? 0.25;
const TOTAL = r3(cfg.total ?? LAST.e + (cfg.tail ?? 3.5));
const scenes = cfg.scenes.filter((s) => s.enabled !== false);
const idxAt = (t) => { const i = WORDS.findIndex((w) => w.s >= t - 1e-6); return i < 0 ? WORDS.length - 1 : i; };
let cursor = 0;
const spans = scenes.map((sc, k) => {
  const where = `scene "${sc.id}": `;
  let from, idx;
  const st = sc.starts;
  if (k === 0 && (st === undefined || st === 0)) { from = 0; idx = 0; }
  else if (typeof st === 'number') { from = st; idx = idxAt(st); }
  else if (typeof st === 'string' || (st && st.phrase)) {
    const ph = typeof st === 'string' ? st : st.phrase;
    const [i] = find(ph, cursor, st.n ?? 0, where);
    idx = i;
    from = WORDS[i].s - (sc.lead ?? LEAD) + (st.offset ?? 0);
  } else throw new Error(`${where}needs starts: "<phrase>" | seconds`);
  cursor = idx;
  return { id: sc.id, k, from: r3(Math.max(0, from)), idx, sc };
});
spans.forEach((sp, k) => {
  if (k && sp.from <= spans[k - 1].from) throw new Error(`scene "${sp.id}" starts at ${sp.from}s, not after "${spans[k - 1].id}" (${spans[k - 1].from}s): check the phrase order`);
  sp.to = k < spans.length - 1 ? spans[k + 1].from : TOTAL;
  sp.cut = r3(sp.to - sp.from);
});
// transitions: a scene's `in` is also the previous scene's `out`; an iris overlaps the previous host by its duration
const TDEF = { cut: {}, blur: { dur: 0.22 }, whip: { dir: 1, dur: 0.3 }, zoom: { dur: 0.36, color: 'rgba(255,255,255,0.92)' }, iris: { x: 960, y: 540, dur: 0.42 }, morph: { dur: 0.55 } };
spans.forEach((sp, k) => {
  const raw = typeof sp.sc.in === 'string' ? { type: sp.sc.in } : sp.sc.in;
  sp.in = k === 0 || !raw ? { type: 'cut' } : { ...(TDEF[raw.type] ?? {}), ...raw };
  if (!TDEF[sp.in.type]) throw new Error(`scene "${sp.id}": unknown transition ${sp.in.type} (cut|blur|whip|zoom|iris|morph)`);
  sp.overlap = sp.in.type === 'iris' ? sp.in.dur : (sp.in.overlap ?? 0);
});
spans.forEach((sp, k) => {
  const nx = spans[k + 1];
  sp.out = nx ? { ...nx.in, next: nx.id } : { type: 'end' };
  sp.dur = r3(sp.cut + (nx ? nx.overlap : 0));
  sp.tone = sp.sc.tone ?? (k ? spans[k - 1].toneTo : 'nominal');
  sp.toneTo = sp.sc.toneTo ?? sp.tone;
});

// ------------------------------------------------------------------ template expansion
const read = (f) => fs.readFileSync(f, 'utf8');
const COMMON = read('src/common.css');
const KITJS = fs.existsSync('src/kit/kit.js') ? read('src/kit/kit.js') : '';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (v) => JSON.stringify(v);
const words = (text, cls = 'w') => String(text).trim().split(/\s+/).map((t) => {
  const acc = /^\*.+\*[.,;:!?]*$/.test(t);
  const clean = acc ? t.replace(/^\*/, '').replace(/\*([.,;:!?]*)$/, '$1') : t;
  return `<span class="${cls}${acc ? ' acc' : ''}">${esc(clean)}</span>`;
}).join(' ');

function lineOf(src, i) { return src.slice(0, i).split('\n').length; }
function evalIn(expr, ctx, where) {
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function(...Object.keys(ctx), `"use strict"; return (${expr});`)(...Object.values(ctx));
    if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`evaluates to ${v}`);
    if (typeof v === 'number') return String(r3(v));
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  } catch (e) { throw new Error(`${where}: {{ ${expr} }} -> ${e.message}`); }
}
function expand(src, ctx, where) {
  let out = '', i = 0;
  for (;;) {
    const a = src.indexOf('{{', i);
    if (a < 0) { out += src.slice(i); break; }
    out += src.slice(i, a);
    let j = a + 2, depth = 0, q = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0 && src[j + 1] === '}') break; depth--; }
    }
    if (j >= src.length) throw new Error(`${where}:${lineOf(src, a)}: unclosed {{`);
    out += evalIn(src.slice(a + 2, j).trim(), ctx, `${where}:${lineOf(src, a)}`);
    i = j + 2;
  }
  return out;
}
function parseArgs(s) {
  const a = {};
  for (const m of String(s || '').matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g)) {
    const raw = m[3] ?? m[4] ?? m[5];
    a[m[1]] = m[3] === undefined && m[4] === undefined && /^-?\d+(\.\d+)?$/.test(raw) ? +raw : raw;
  }
  return a;
}
function inline(src, ctx, where, depth = 0) {
  if (depth > 5) throw new Error(`${where}: KIT snippets nest too deep`);
  return src.replace('/*COMMON*/', () => COMMON).replace('/*KIT*/', () => KITJS).replace(/<!--KIT:([\w-]+)([^>]*?)-->/g, (_, name, args) => {
    const f = `src/kit/${name}.html`;
    if (!fs.existsSync(f)) throw new Error(`${where}: missing snippet ${f}`);
    const a = parseArgs(args);
    return expand(inline(read(f), ctx, f, depth + 1), { ...ctx, a }, f);
  });
}

function sceneCtx(sp) {
  const sc = sp.sc, where = `scene "${sp.id}": `;
  const local = (t) => r3(t - sp.from);
  const hit = (ph, n = 0) => find(ph, sp.idx, n, where);
  const cueSpec = (name) => (sc.cues || {})[name];
  const resolve = (spec, edge = 'start') => {
    if (typeof spec === 'number') return spec; // local seconds
    if (typeof spec === 'string') {
      if (spec.startsWith('@')) return cue(spec.slice(1));
      const [i, j] = hit(spec);
      return local(edge === 'end' ? WORDS[j].e : WORDS[i].s);
    }
    if (spec && typeof spec === 'object') {
      if (spec.abs !== undefined) return local(spec.abs) + (spec.offset ?? 0);
      if (spec.cue) return cue(spec.cue) + (spec.offset ?? 0);
      const [i, j] = hit(spec.phrase, spec.n ?? 0);
      return local((spec.edge ?? edge) === 'end' ? WORDS[j].e : WORDS[i].s) + (spec.offset ?? 0);
    }
    throw new Error(`${where}bad time spec ${JSON.stringify(spec)}`);
  };
  const warned = new Set();
  function cue(name, fallback) {
    const spec = cueSpec(name);
    if (spec === undefined) {
      if (fallback === undefined) throw new Error(`${where}cue "${name}" is not set in film.config.mjs (scenes[].cues) and the template gives no fallback`);
      if (!warned.has(name)) { warned.add(name); warn(`${where}cue "${name}" not in config, placeholder ${fallback}s`); }
      return fallback;
    }
    return resolve(spec, 'start');
  }
  function cueEnd(name, fallback) {
    const spec = cueSpec(name);
    if (spec === undefined) { if (fallback === undefined) throw new Error(`${where}cue "${name}" missing`); return fallback; }
    return resolve(typeof spec === 'object' && !spec.cue && spec.abs === undefined ? { ...spec, edge: 'end' } : spec, 'end');
  }
  const T = (x) => resolve(x);
  const timed = (v) => {
    if (Array.isArray(v)) return v.map(timed);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = (k === 't' || k === 'at' || k === 'until' || /^[a-z]+(At|Until)$/.test(k)) && x !== undefined && x !== null && (typeof x !== 'object' || x.phrase || x.abs !== undefined || x.cue) ? r3(T(x)) : timed(x);
      return o;
    }
    return v;
  };
  const span = { id: sp.id, from: sp.from, to: sp.to, cut: sp.cut, dur: sp.dur, in: sp.in, out: sp.out, tone: sp.tone, toneTo: sp.toneTo,
    prev: spans[sp.k - 1]?.id ?? null, next: spans[sp.k + 1]?.id ?? null };
  return {
    ID: sp.id, P: sp.id + '-', S: span, D: sp.dur, CUT: sp.cut, TOTAL, p: sc.params ?? {}, a: {},
    at: (ph, n = 0) => local(WORDS[hit(ph, n)[0]].s),
    end: (ph, n = 0) => local(WORDS[hit(ph, n)[1]].e),
    times: (ph, n = 0) => { const [i, j] = hit(ph, n); return WORDS.slice(i, j + 1).map((w) => local(w.s)); },
    AT: (ph, n = 0) => WORDS[hit(ph, n)[0]].s,
    END: (ph, n = 0) => WORDS[hit(ph, n)[1]].e,
    cue, cueEnd, T, timed,
    cueTimes: (name, fallback) => {
      const spec = cueSpec(name);
      if (typeof spec === 'string' && !spec.startsWith('@')) { const [i, j] = hit(spec); return WORDS.slice(i, j + 1).map((w) => local(w.s)); }
      if (spec && typeof spec === 'object' && spec.phrase) { const [i, j] = hit(spec.phrase, spec.n ?? 0); return WORDS.slice(i, j + 1).map((w) => local(w.s) + (spec.offset ?? 0)); }
      return [cue(name, fallback)];
    },
    w: (i) => local(WORDS[i].s), we: (i) => local(WORDS[i].e), W: (i) => WORDS[i].s, WE: (i) => WORDS[i].e,
    json, esc, words, still,
  };
}

// a freeze frame of a clip at clip time t (a hold in a footage map), extracted once with ffmpeg into assets/clips/stills/
function still(src, t) {
  const dir = 'assets/clips/stills';
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${path.basename(src, path.extname(src))}${src.includes('/proxy/') ? '-proxy' : ''}-${(+t).toFixed(3)}.png`);
  // re-extract when the clip is newer than the cached frame (a re-recorded clip must never show an old freeze frame)
  const stale = fs.existsSync(out) && fs.existsSync(src) && fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs;
  if (!fs.existsSync(out) || stale) {
    if (!fs.existsSync(src)) throw new Error(`still: ${src} missing`);
    execFileSync(FFMPEG, ['-v', 'error', '-ss', (+t).toFixed(3), '-i', src, '-frames:v', '1', '-y', out], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return out;
}

// ------------------------------------------------------------------ media durations (ffmpeg)
const FFMPEG = process.env.FFMPEG || [path.join(process.env.HOME || '', 'repos/bulkhead-studio/bin/ffmpeg'), 'ffmpeg'].find((f) => f === 'ffmpeg' || fs.existsSync(f));
const durCacheFile = 'review/.media-durations.json';
const durCache = fs.existsSync(durCacheFile) ? JSON.parse(read(durCacheFile)) : {};
function mediaDuration(f) {
  if (!fs.existsSync(f)) return null;
  const key = `${f}@${fs.statSync(f).mtimeMs}`;
  if (durCache[key] !== undefined) return durCache[key];
  let d = null;
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', f], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {
    const m = String(e.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) d = r3(+m[1] * 3600 + +m[2] * 60 + +m[3]);
  }
  durCache[key] = d;
  return d;
}

// ------------------------------------------------------------------ captions
function captionData() {
  const C = { enabled: true, maxWords: 6, maxChars: 40, pause: 0.32, hide: [], replace: {}, ...(cfg.captions === false ? { enabled: false } : cfg.captions) };
  if (!C.enabled || flag('--no-captions')) return null;
  // display tokens: merge spelled letters ("G. P. U.," -> "GPU,"), then the replace map ("Spacetime DB" -> "SpacetimeDB")
  let toks = [];
  for (let i = 0; i < WORDS.length; i++) {
    const w = WORDS[i];
    const letter = (x) => /^[A-Z]\.[,.;:!?]*$/.test(x.text);
    if (letter(w) && WORDS[i + 1] && letter(WORDS[i + 1])) {
      let j = i, txt = '';
      while (j < WORDS.length && letter(WORDS[j])) { txt += WORDS[j].text[0]; j++; }
      const tail = WORDS[j - 1].text.slice(2);
      const nx = WORDS[j];
      const stop = !tail && nx && /^[A-Z][a-z]/.test(nx.text) && /\.$/.test(WORDS[j - 1].text);
      toks.push({ text: txt + (stop ? '.' : tail), s: w.s, e: WORDS[j - 1].e });
      i = j - 1;
    } else toks.push({ text: w.text, s: w.s, e: w.e });
  }
  for (const [from, to] of Object.entries(C.replace)) {
    const target = norm(from);
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      let acc = '', j = i, hitJ = -1;
      for (; j < toks.length; j++) { acc += norm(toks[j].text); if (acc === target) { hitJ = j; break; } if (!target.startsWith(acc)) break; }
      if (hitJ >= 0) {
        const tail = (toks[hitJ].text.match(/[.,;:!?]+$/) || [''])[0];
        out.push({ text: to + (/[.,;:!?]$/.test(to) ? '' : tail), s: toks[i].s, e: toks[hitJ].e });
        i = hitJ;
      } else out.push(toks[i]);
    }
    toks = out;
  }
  // sentences (punctuation or a pause), then balanced chunks of <= maxWords words and <= maxChars characters
  const sentences = [];
  let cur = [];
  toks.forEach((t, i) => {
    if (cur.length && t.s - cur[cur.length - 1].e >= C.pause) { sentences.push(cur); cur = []; }
    cur.push(t);
    if (/[.!?]["')\]]*$/.test(t.text) || i === toks.length - 1) { sentences.push(cur); cur = []; }
  });
  if (cur.length) sentences.push(cur);
  const len = (g) => g.map((t) => t.text).join(' ').length;
  const chunk = (g) => {
    if (g.length <= C.maxWords && len(g) <= C.maxChars) return [g];
    const k = Math.max(2, Math.ceil(g.length / C.maxWords), Math.ceil(len(g) / C.maxChars));
    const size = g.length / k;
    let best = Math.round(size);
    // prefer a break just after a comma near the balanced point
    for (let d = 0; d <= 2; d++) for (const c of [Math.round(size) + d, Math.round(size) - d]) if (c > 0 && c < g.length && /[,;:—]$/.test(g[c - 1].text)) { best = c; d = 9; break; }
    // else break before a preposition or conjunction near the middle ("breaking out | of its virtual machine")
    if (!/[,;:—]$/.test(g[best - 1]?.text || '')) for (let d = 0; d <= 1; d++) for (const c of [Math.round(size) + d, Math.round(size) - d]) if (c > 1 && c < g.length - 1 && /^(of|in|with|through|for|to|and|or|on|from|into|via|no|where)$/i.test(g[c].text)) { best = c; d = 9; break; }
    return [...chunk(g.slice(0, best)), ...chunk(g.slice(best))];
  };
  let groups = sentences.flatMap(chunk);
  const hide = spans.filter((s) => (C.hide || []).includes(s.id));
  groups = groups.filter((g) => !hide.some((s) => (g[0].s + g[g.length - 1].e) / 2 >= s.from && (g[0].s + g[g.length - 1].e) / 2 < s.to));
  const G = groups.map((g, gi) => {
    const prevEnd = gi ? groups[gi - 1][groups[gi - 1].length - 1].e : 0;
    const next = groups[gi + 1];
    const start = r3(Math.max(0.12, g[0].s - 0.1, gi ? prevEnd : 0));
    let end = r3(Math.max(g[g.length - 1].e + 0.3, start + 0.7));
    if (next) end = r3(Math.min(end, next[0].s - 0.1));
    end = r3(Math.min(Math.max(end, g[g.length - 1].e), TOTAL - 0.05));
    return { start, end, words: g.map((t, k) => ({ text: t.text, s: r3(t.s), e: r3(k < g.length - 1 ? g[k + 1].s : Math.min(end, t.e + 0.15)) })) };
  });
  // groups never overlap: each opens at or after the previous one's end
  for (let i = 1; i < G.length; i++) if (G[i].start < G[i - 1].end) G[i].start = G[i - 1].end;
  return G;
}

// ------------------------------------------------------------------ write scenes
fs.mkdirSync('compositions', { recursive: true });
fs.mkdirSync('review', { recursive: true });
const manifestFile = 'compositions/.built.json';
const oldManifest = fs.existsSync(manifestFile) ? JSON.parse(read(manifestFile)) : [];
const built = [];
function stub(sp) {
  const src = `<template>
  <style>/*COMMON*/
    #{{P}}card { left: 160px; top: 300px; width: 1100px; padding: 56px 64px; }
  </style>
  <div id="root" data-composition-id="{{ID}}" data-width="1920" data-height="1080">
    <div id="{{P}}stage" class="stage"><!--KIT:wallpaper-->
      <div id="{{P}}whip" class="whip"><div id="{{P}}cam" class="cam">
        <div id="{{P}}card" class="glass"><div class="t-label">Stub: src/{{ID}}.html is missing</div><div class="t-title" style="margin-top:18px">{{esc(ID)}}</div><div class="t-body" style="margin-top:18px">{{esc(String(S.from))}} s to {{esc(String(S.to))}} s</div></div>
      </div></div><!--KIT:fx--></div>
  </div>
  <script>(function () { /*KIT*/
    const P = '#{{P}}', tl = gsap.timeline({ paused: true });
    K.scene(tl, P, {{json(S)}});
    window.__timelines['{{ID}}'] = tl;
  })();</script>
</template>`;
  return src;
}
for (const sp of spans) {
  const tpl = sp.sc.template ?? sp.id;
  const f = `src/${tpl}.html`;
  const ctx = sceneCtx(sp);
  let src;
  if (fs.existsSync(f)) src = read(f);
  else { warn(`stub for scene "${sp.id}" (no ${f})`); src = stub(sp); }
  const html = expand(inline(src, ctx, f), ctx, f);
  fs.writeFileSync(`compositions/${sp.id}.html`, html);
  built.push(`compositions/${sp.id}.html`);
}

// captions composition
const CAPS = captionData();
if (CAPS) {
  const f = 'src/captions.html';
  const ctx = { ...sceneCtx({ ...spans[0], id: 'captions', k: -1, from: 0, sc: { cues: {} }, idx: 0, cut: TOTAL, dur: TOTAL }), ID: 'captions', P: 'cap-', D: TOTAL, CAPS };
  fs.writeFileSync('compositions/captions.html', expand(inline(read(f), ctx, f), ctx, f));
  built.push('compositions/captions.html');
}

// stale outputs of an earlier build
for (const f of oldManifest) if (!built.includes(f) && fs.existsSync(f)) { fs.unlinkSync(f); log('removed stale', f); }
fs.writeFileSync(manifestFile, JSON.stringify(built, null, 1));


// ------------------------------------------------------------------ music ducking (volume lane from the VO word times)
// level(t): 1 in the gaps, 10^(db/20) under speech (attack before a span, release after), lighter (hitDb) for hitHold s
// from each music hit so the hits land; sampled every 20 ms and simplified (RDP) to at most 512 points.
function duckLane(d, clipStart, clipDur) {
  const duck = Math.pow(10, (d.db ?? -7) / 20), hitLvl = Math.pow(10, (d.hitDb ?? -3) / 20);
  const atk = d.attack ?? 0.12, rel = d.release ?? 0.4, merge = d.merge ?? 0.55, hold = d.hitHold ?? 0.9;
  const spans = [];
  for (const w of WORDS) {
    const last = spans[spans.length - 1];
    if (last && w.s - last[1] < merge) last[1] = Math.max(last[1], w.e); else spans.push([w.s, w.e]);
  }
  const base = (t) => {
    let v = 1;
    for (const [a, b] of spans) {
      if (t < a - atk || t > b + rel) continue;
      const x = t < a ? 1 + (duck - 1) * ((t - (a - atk)) / atk) : t <= b ? duck : duck + (1 - duck) * ((t - b) / rel);
      v = Math.min(v, x);
    }
    return v;
  };
  const level = (t) => {
    let v = base(t);
    for (const h of d.hits || []) {
      const w = t >= h - 0.04 && t <= h + hold ? 1 : t > h + hold && t < h + hold + 0.35 ? 1 - (t - h - hold) / 0.35 : 0;
      if (w > 0) v = v + w * Math.max(0, hitLvl - v);
    }
    return v;
  };
  const pts = [];
  for (let t = 0; t <= clipDur + 1e-9; t += 0.02) pts.push([+t.toFixed(3), +level(clipStart + t).toFixed(4)]);
  const rdp = (P, eps) => {
    if (P.length < 3) return P;
    const [x0, y0] = P[0], [x1, y1] = P[P.length - 1];
    let iMax = 0, dMax = 0;
    for (let i = 1; i < P.length - 1; i++) {
      const [x, y] = P[i];
      const yl = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
      const dd = Math.abs(y - yl);
      if (dd > dMax) { dMax = dd; iMax = i; }
    }
    if (dMax <= eps) return [P[0], P[P.length - 1]];
    return [...rdp(P.slice(0, iMax + 1), eps).slice(0, -1), ...rdp(P.slice(iMax), eps)];
  };
  let eps = 0.003, out = rdp(pts, eps);
  while (out.length > 500) { eps *= 1.5; out = rdp(pts, eps); }
  const lane = { version: 1, lanes: [{ target: 'volume', points: out.map(([t, v]) => ({ t, v })) }] };
  log(`music duck lane: ${out.length} points, ${spans.length} speech spans, ${(d.db ?? -7)} dB (hits ${(d.hits || []).join(', ')})`);
  return JSON.stringify(lane).replace(/"/g, '&quot;');
}

// ------------------------------------------------------------------ audio: VO, music, SFX
const audio = [];
if (cfg.vo?.audio) {
  if (!fs.existsSync(cfg.vo.audio)) warn(`VO audio missing: ${cfg.vo.audio}`);
  else audio.push(`      <audio id="vo" class="clip" data-start="${cfg.vo.start ?? 0}" data-track-index="10" data-volume="${cfg.vo.volume ?? 1}" src="${cfg.vo.audio}"></audio>`);
}
if (cfg.music?.src) {
  if (!fs.existsSync(cfg.music.src)) warn(`music not wired: ${cfg.music.src} does not exist yet`);
  else {
    const md = mediaDuration(cfg.music.src);
    const start = cfg.music.start ?? 0;
    const dur = r3(Math.min(TOTAL - start, md ? md - (cfg.music.mediaStart ?? 0) : TOTAL - start));
    const lane = cfg.music.duck ? duckLane(cfg.music.duck, start, dur) : null;
    audio.push(`      <audio id="music" class="clip" data-start="${start}" data-duration="${dur}"${cfg.music.mediaStart ? ` data-media-start="${cfg.music.mediaStart}"` : ''} data-track-index="11" data-volume="${cfg.music.volume ?? 0.14}" data-fade-in="${cfg.music.fadeIn ?? 0.4}" data-fade-out="${cfg.music.fadeOut ?? 1.5}"${lane ? ` data-automation="${lane}"` : ''} src="${cfg.music.src}"></audio>`);
  }
}
const sfxList = [...(cfg.sfx ?? [])];
// automatic transition sounds, rotating takes per transition type
const rot = {};
if (cfg.autoSfx) spans.forEach((sp, k) => {
  if (!k) return;
  const takes = cfg.autoSfx[sp.in.type];
  if (!takes || !takes.length) return;
  const n = (rot[sp.in.type] = (rot[sp.in.type] ?? -1) + 1);
  const take = takes[n % takes.length];
  const t = typeof take === 'string' ? { src: take } : take;
  // a whip / zoom / morph peaks on the cut; an iris starts on the click (the cut)
  sfxList.push({ ...t, abs: sp.from + (t.offset ?? (sp.in.type === 'iris' ? -0.02 : -0.12)), _auto: `${sp.in.type} into ${sp.id}` });
});
const sfxTags = [];
sfxList.forEach((x, i) => {
  if (!fs.existsSync(x.src)) { warn(`sfx missing: ${x.src}`); return; }
  let t;
  if (x.abs !== undefined) t = x.abs;
  else if (x.scene) { const sp = spans.find((s) => s.id === x.scene); if (!sp) throw new Error(`sfx ${i}: no scene ${x.scene}`); t = sp.from + (x.offset ?? 0); }
  else if (typeof x.at === 'number') t = x.at + (x.offset ?? 0);
  else if (typeof x.at === 'string') { const [a, b] = find(x.at, 0, x.n ?? 0, `sfx ${i}: `); t = (x.edge === 'end' ? WORDS[b].e : WORDS[a].s) + (x.offset ?? 0); }
  else throw new Error(`sfx ${i}: needs at: "<phrase>" | seconds, or scene: "<id>"`);
  t = r3(Math.max(0, t));
  if (t >= TOTAL - 0.05) { warn(`sfx ${x.src} at ${t}s is past the end`); return; }
  const len = mediaDuration(x.src);
  const dur = r3(Math.min(len ?? 2, TOTAL - t, x.dur ?? Infinity));
  sfxTags.push(`      <audio id="sfx-${String(sfxTags.length + 1).padStart(2, '0')}" class="clip" data-start="${t}" data-duration="${dur}" data-track-index="${20 + (sfxTags.length % 4)}" data-volume="${x.volume ?? 0.5}" src="${x.src}"></audio>${x._auto ? ` <!-- ${x._auto} -->` : ''}`);
});
fs.writeFileSync(durCacheFile, JSON.stringify(durCache, null, 1));

// ------------------------------------------------------------------ index.html
const hosts = spans.map((sp, k) => `      <div id="${sp.id}" data-composition-id="${sp.id}" data-composition-src="compositions/${sp.id}.html" data-start="${sp.from}" data-duration="${sp.dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:${k + 2}"></div>`).join('\n');
const capHost = CAPS ? `      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${TOTAL}" data-track-index="5" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index:900"></div>` : '';
const rootCtx = { ...sceneCtx({ ...spans[0], id: 'main', k: -1, from: 0, sc: { cues: {} }, idx: 0, cut: TOTAL, dur: TOTAL }), ID: 'main', P: 'main-', D: TOTAL };
const shell = expand(inline(read('src/index.html'), rootCtx, 'src/index.html'), rootCtx, 'src/index.html');
fs.writeFileSync('index.html', shell.replace('<!--SCENES-->', hosts).replace('<!--CAPTIONS-->', capHost).replace('<!--AUDIO-->', audio.join('\n')).replace('<!--SFX-->', sfxTags.join('\n')).replace(/__TOTAL__/g, String(TOTAL)));

// ------------------------------------------------------------------ report
const cueReport = {};
for (const sp of spans) {
  const ctx = sceneCtx(sp);
  cueReport[sp.id] = Object.fromEntries(Object.keys(sp.sc.cues || {}).map((n) => { try { return [n, r3(sp.from + ctx.cue(n))]; } catch (e) { return [n, `ERROR ${e.message}`]; } }));
}
fs.writeFileSync('review/timing.json', JSON.stringify({
  voFile, total: TOTAL, lead: LEAD,
  scenes: spans.map((s) => ({ id: s.id, template: s.sc.template ?? s.id, from: s.from, cut: s.cut, dur: s.dur, to: s.to, firstWord: WORDS[s.idx]?.text, in: s.in.type, tone: s.tone, toneTo: s.toneTo, cues: cueReport[s.id] })),
  captions: CAPS ? CAPS.map((g) => [g.start, g.end, g.words.map((w) => w.text).join(' ')]) : null,
  words: WORDS.map((w, i) => [i, w.text, w.s, w.e]),
}, null, 1));
log(`total ${TOTAL}s · ${spans.length} scenes · ${CAPS ? CAPS.length + ' caption groups' : 'captions off'} · ${sfxTags.length} sfx · vo ${voFile}`);
for (const s of spans) log(`  ${s.id.padEnd(10)} ${String(s.from).padStart(7)}s  ${String(s.dur).padStart(6)}s  in:${s.in.type.padEnd(5)} ${s.tone}${s.toneTo !== s.tone ? '->' + s.toneTo : ''}  "${WORDS[s.idx]?.text ?? ''}"`);
if (warnings.length) log(`${warnings.length} warning(s)`);
