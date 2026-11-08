/* Claura Voice: browser side. One ES module, no dependencies.
 *
 *   import { mountUI, voice } from '/ui.js';
 *   mountUI(document.querySelector('#voice'));          // optional "Voice" panel
 *   window.claura.voice.toggle();                       // push to talk, from any button
 *   window.claura.voice.playBrief('es');                // the War Room brief, spoken
 *
 * The console already calls window.claura.voice.toggle() (mic button) and playBrief() (no arguments), so both work
 * with zero arguments: playBrief() reads the brief currently on screen (the War Room card) and speaks it in the
 * last chosen language.
 *
 * REAL: ElevenLabs voices through the server (/api/voice), speech to text, local Nemotron answers.
 * FALLBACK: if the server or ElevenLabs is unreachable, answers are spoken with the browser's own speech synthesis.
 */

const VERSION = '0.1.0';

export const LANGUAGES = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'es', short: 'ES', name: 'Español' },
  { code: 'hi', short: 'हि', name: 'हिन्दी' },
  { code: 'zh', short: '中', name: '中文' },
  { code: 'fr', short: 'FR', name: 'Français' },
];
const SPEECH_LANG = { en: 'en-US', es: 'es-ES', hi: 'hi-IN', zh: 'zh-CN', fr: 'fr-FR' };
const isLang = (c) => LANGUAGES.some((l) => l.code === c);

const cfg = { base: '/api/voice', hotkey: 'Alt+V', hud: true, theme: 'dark', maxRecordMs: 25000, minRecordMs: 450, holdMs: 450, autoHideMs: 5200 };

const keep = {
  get(k) { try { return localStorage.getItem(`claura.voice.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`claura.voice.${k}`, v); } catch { /* storage may be blocked */ } },
};

// ------------------------------------------------------------------ state + events
const S = {
  state: 'idle', // idle | listening | transcribing | thinking | speaking | error
  mode: null, // ask | brief | say
  lang: isLang(keep.get('lang')) ? keep.get('lang') : 'en',
  stage: null, // explicit stage hint; otherwise document.body.dataset.phase is used
  transcript: '',
  answer: '',
  caption: null, // {sections:[{label,text}], text}
  label: '',
  prov: '',
  err: '',
  errKind: '',
  needGesture: false,
  levelHint: '',
  startedAt: 0,
};
let briefSource = null;
const listeners = new Map();

function emit(type, detail = {}) {
  for (const fn of [...(listeners.get(type) ?? []), ...(listeners.get('*') ?? [])]) {
    try { fn({ type, ...detail }); } catch (e) { console.warn('[claura.voice] listener failed', e); }
  }
  try {
    window.dispatchEvent(new CustomEvent('claura:voice', { detail: { type, state: S.state, listening: S.state === 'listening', speaking: S.state === 'speaking', ...detail } }));
  } catch { /* old browsers */ }
}
function setState(next, patch = {}) {
  const changed = next !== S.state;
  Object.assign(S, patch);
  S.state = next;
  if (changed) emit('state', { mode: S.mode });
  renderAll();
}

// ------------------------------------------------------------------ run control (everything is interruptible)
let runId = 0;
let abortCtl = null;
let mic = null; // {stream, rec, chunks, an, src, startedAt, timer, max}
let playback = null; // {stop(), analyser, progress(), duration}
let localSpeech = null;
let hideTimer = 0;

function newRun(mode) {
  hardStop();
  runId += 1;
  abortCtl = new AbortController();
  Object.assign(S, { mode, transcript: '', answer: '', caption: null, err: '', errKind: '', prov: '', needGesture: false, levelHint: '', label: '' });
  clearTimeout(hideTimer);
  const id = runId;
  return { id, signal: abortCtl.signal, live: () => id === runId };
}
function hardStop() {
  try { abortCtl?.abort(); } catch { /* ignore */ }
  abortCtl = null;
  releaseMic(true);
  try { playback?.stop(); } catch { /* ignore */ }
  playback = null;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  localSpeech = null;
}
function releaseMic(discard) {
  if (!mic) return;
  const m = mic;
  mic = null;
  clearTimeout(m.timer);
  try { if (discard && m.rec && m.rec.state !== 'inactive') { m.rec.onstop = null; m.rec.stop(); } } catch { /* ignore */ }
  try { m.src?.disconnect(); } catch { /* ignore */ }
  try { m.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ audio engine
let ac = null;
function audioCtx() {
  if (ac) return ac;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try { ac = new C(); } catch { ac = null; }
  return ac;
}
async function unlockAudio() {
  const c = audioCtx();
  if (c && c.state === 'suspended') {
    try { await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 250))]); } catch { /* needs a gesture */ }
  }
  return c;
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, () => { void unlockAudio(); }, { capture: true, passive: true });

let lastPtr = null;
window.addEventListener('pointerdown', (e) => { lastPtr = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { capture: true, passive: true });

function nextGesture(ms = 9000) {
  return new Promise((resolve) => {
    const done = (ok) => { for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, h, true); clearTimeout(t); resolve(ok); };
    const h = () => done(true);
    const t = setTimeout(() => done(false), ms);
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, h, true);
  });
}

/** Decode + play an audio file. Resolves when it ends or is stopped. */
async function playBuffer(arrayBuffer, run, { gain = 1 } = {}) {
  let c = await unlockAudio();
  if (c && c.state !== 'running') {
    S.needGesture = true;
    renderAll();
    await nextGesture();
    S.needGesture = false;
    c = await unlockAudio();
  }
  if (!run.live()) return 'stale';
  if (!c || c.state !== 'running') throw Object.assign(new Error('Audio is locked by the browser. Click once, then try again.'), { code: 'audio_locked' });
  const buf = await new Promise((res, rej) => c.decodeAudioData(arrayBuffer.slice(0), res, rej));
  if (!run.live()) return 'stale';
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const an = c.createAnalyser();
  an.fftSize = 512;
  an.smoothingTimeConstant = 0.55;
  src.connect(g);
  g.connect(an);
  an.connect(c.destination);
  const t0 = c.currentTime;
  const done = new Promise((resolve) => { src.onended = () => resolve('ended'); });
  playback = {
    analyser: an,
    duration: buf.duration,
    progress: () => Math.min(1, Math.max(0, (c.currentTime - t0) / buf.duration)),
    stop() { try { src.onended = null; src.stop(); } catch { /* already stopped */ } },
  };
  src.start();
  const result = await done;
  playback = null;
  return result;
}

/** Browser speech synthesis: the offline / mock / budget fallback. */
function speakLocal(text, lang, run) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || !text) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[lang] || 'en-US';
      u.rate = 1.02;
      const voices = synth.getVoices();
      const v = voices.find((x) => x.lang === u.lang) || voices.find((x) => x.lang?.startsWith(lang));
      if (v) u.voice = v;
      let prog = 0;
      localSpeech = { progress: () => prog, duration: Math.max(1, text.length / 14) };
      u.onboundary = (e) => { prog = Math.min(1, (e.charIndex || 0) / text.length); };
      u.onend = () => { localSpeech = null; resolve(run.live()); };
      u.onerror = () => { localSpeech = null; resolve(false); };
      synth.speak(u);
    } catch { resolve(false); }
  });
}

// ------------------------------------------------------------------ http
async function api(path, init = {}) {
  let res;
  try {
    res = await fetch(cfg.base + path, { credentials: 'same-origin', ...init });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw Object.assign(new Error('The voice service is not reachable.'), { code: 'offline', fallback: 'speechSynthesis' });
  }
  if (!res.ok) {
    let j = null;
    try { j = await res.json(); } catch { /* not json */ }
    throw Object.assign(new Error(j?.message || `Voice service error ${res.status}`), { code: j?.error || `http_${res.status}`, status: res.status, fallback: j?.fallback });
  }
  return res;
}
const stageHint = () => (S.stage ? { stage: S.stage } : document.body?.dataset?.phase ? { phase: document.body.dataset.phase } : {});
const jsonInit = (body, signal) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

// ------------------------------------------------------------------ speaking a clip (shared by say / brief / ask)
async function playClip(url, text, run, { lang = S.lang } = {}) {
  const res = await api(url.startsWith('/api/') || url.startsWith('http') ? url.replace(cfg.base, '') : url, { signal: run.signal });
  const ab = await res.arrayBuffer();
  if (!run.live()) return;
  setState('speaking', { label: 'Speaking' });
  await playBuffer(ab, run);
}
async function speakText(text, run, lang, { fallbackOnly = false } = {}) {
  if (!fallbackOnly) {
    try {
      const res = await api('/tts', jsonInit({ text, lang }, run.signal));
      if (res.headers.get('x-voice-mode') !== 'mock') {
        const ab = await res.arrayBuffer();
        if (!run.live()) return;
        setState('speaking', { label: 'Speaking', prov: 'ElevenLabs voice' });
        return await playBuffer(ab, run);
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (!e.fallback && e.code !== 'offline') throw e;
    }
  }
  if (!run.live()) return;
  setState('speaking', { label: 'Speaking', prov: 'on-device voice' });
  await speakLocal(text, lang, run);
}

// ------------------------------------------------------------------ public actions
async function say(text, opts = {}) {
  const t = String(text ?? '').trim();
  if (!t) return;
  const lang = isLang(opts.lang) ? opts.lang : S.lang;
  const run = newRun('say');
  setState('thinking', { label: 'Preparing voice', answer: t, caption: { sections: [{ label: '', text: t }], text: t } });
  try {
    await speakText(t, run, lang);
  } catch (e) {
    if (e?.name !== 'AbortError' && run.live()) return fail(run, e);
  }
  finish(run);
}

async function playBrief(lang = S.lang, brief) {
  const code = isLang(lang) ? lang : S.lang;
  if (code !== S.lang) { S.lang = code; keep.set('lang', code); }
  const run = newRun('brief');
  setState('thinking', { label: 'Preparing brief' });
  try {
    const src = brief ?? resolveBriefSource();
    const body = { lang: code, ...stageHint() };
    if (src) {
      if (typeof src === 'string') body.text = src;
      else body.brief = src;
    }
    const j = await (await api('/brief?format=json', jsonInit(body, run.signal))).json();
    if (!run.live()) return;
    const prov = j.mode === 'mock' ? 'mock audio' : `ElevenLabs multilingual voice${j.translation === 'nemotron' ? ' · machine-translated by Nemotron' : j.translation === 'mixed' ? ' · partly machine-translated' : ''}`;
    setState('thinking', { label: 'Preparing brief', caption: { sections: j.sections, text: j.text }, answer: j.text, prov });
    if (j.mode === 'mock') {
      setState('speaking', { label: 'Speaking', prov: 'on-device voice (mock mode)' });
      await speakLocal(j.text, code, run);
    } else {
      try {
        await playClip(j.audioUrl, j.text, run, { lang: code });
      } catch (e) {
        if (e?.name === 'AbortError' || !run.live()) return;
        if (e.code === 'audio_locked') throw e;
        setState('speaking', { label: 'Speaking', prov: 'on-device voice' });
        await speakLocal(j.text, code, run);
      }
    }
  } catch (e) {
    if (e?.name !== 'AbortError' && run.live()) return fail(run, e);
  }
  finish(run);
}

async function sting() {
  try {
    const res = await api('/sting');
    const ab = await res.arrayBuffer();
    const c = await unlockAudio();
    if (!c || c.state !== 'running') return false;
    const buf = await new Promise((r, j) => c.decodeAudioData(ab.slice(0), r, j));
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(c.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

/** Push to talk. Tap to start, tap again to send. Anything else in progress is interrupted first. */
async function toggle() {
  if (S.state === 'listening') return stopListening();
  return startListening();
}

async function startListening() {
  const run = newRun('ask');
  S.startedAt = performance.now();
  setState('listening', { label: 'Listening' });
  await unlockAudio();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return fail(run, Object.assign(new Error(window.isSecureContext ? 'This browser cannot record audio.' : 'The microphone needs https or localhost. You can type your question instead.'), { code: 'mic_unsupported' }));
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    if (!run.live()) return;
    const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    return fail(run, Object.assign(new Error(denied ? 'Microphone blocked. Allow it in the address bar, or type your question.' : 'No microphone found. You can type your question instead.'), { code: 'mic_denied' }));
  }
  if (!run.live()) { stream.getTracks().forEach((t) => t.stop()); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { stream.getTracks().forEach((t) => t.stop()); return fail(run, Object.assign(new Error('Recording is not available in this browser.'), { code: 'mic_unsupported' })); }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const c = audioCtx();
  let an = null;
  let src = null;
  if (c) {
    try {
      src = c.createMediaStreamSource(stream);
      an = c.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.5;
      src.connect(an);
    } catch { an = null; }
  }
  mic = { stream, rec, chunks, an, src, startedAt: performance.now(), timer: setTimeout(() => { if (run.live() && S.state === 'listening') void stopListening(); }, cfg.maxRecordMs), mime: rec.mimeType || mime || 'audio/webm', peak: 0 };
  rec.start(200);
  S.startedAt = performance.now();
  renderAll();
}

async function stopListening() {
  const m = mic;
  if (!m || S.state !== 'listening') return;
  const run = { id: runId, signal: abortCtl?.signal, live: ((id) => () => id === runId)(runId) };
  const heldMs = performance.now() - m.startedAt;
  const done = new Promise((resolve) => { m.rec.onstop = () => resolve(); });
  try { if (m.rec.state !== 'inactive') m.rec.stop(); } catch { /* ignore */ }
  await done;
  const blob = new Blob(m.chunks, { type: m.mime });
  const peak = m.peak;
  releaseMic(false);
  if (!run.live()) return;
  if (heldMs < cfg.minRecordMs || blob.size < 1200) {
    return fail(run, Object.assign(new Error('That was too short. Tap, speak, then tap again (or hold the button while you speak).'), { code: 'too_short' }), { soft: true });
  }
  if (peak < 0.012) {
    return fail(run, Object.assign(new Error("I couldn't hear anything. Check that the right microphone is selected, or type your question."), { code: 'silent' }), { soft: true });
  }
  setState('transcribing', { label: 'Transcribing' });
  try {
    const res = await api(`/ask?stream=1&${new URLSearchParams(stageHint())}`, { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob, signal: run.signal });
    await consumeAsk(res, run);
  } catch (e) {
    if (e?.name !== 'AbortError' && run.live()) return fail(run, e);
  }
  finish(run);
}

/** Ask with text (also what the panel's text box uses). */
async function ask(text) {
  const q = String(text ?? '').trim();
  if (!q) return null;
  const run = newRun('ask');
  setState('thinking', { label: 'Thinking', transcript: q });
  try {
    const res = await api('/ask?stream=1', jsonInit({ transcript: q, ...stageHint() }, run.signal));
    await consumeAsk(res, run);
  } catch (e) {
    if (e?.name !== 'AbortError' && run.live()) return fail(run, e);
  }
  finish(run);
  return { transcript: S.transcript, answer: S.answer };
}

async function consumeAsk(res, run) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let fallbackText = '';
  const handle = async (evt) => {
    if (!run.live()) return;
    switch (evt.type) {
      case 'transcript':
        if (evt.lang && isLang(evt.lang) && evt.lang !== S.lang) { /* answers follow the spoken language; the chip choice is for briefs */ }
        setState('thinking', { label: 'Thinking', transcript: evt.transcript || '' });
        emit('transcript', { text: evt.transcript, lang: evt.lang });
        break;
      case 'answer': {
        fallbackText = evt.answer;
        const who = evt.source === 'policy' ? 'policy guard' : evt.source === 'rules' ? 'rules fallback' : 'Nemotron on-prem';
        setState('thinking', { label: 'Preparing voice', answer: evt.answer, caption: { sections: [{ label: '', text: evt.answer }], text: evt.answer }, prov: who, answerLang: evt.lang });
        emit('answer', { text: evt.answer, source: evt.source, lang: evt.lang });
        break;
      }
      case 'audio':
        if (evt.mode === 'mock') {
          setState('speaking', { label: 'Speaking', prov: 'on-device voice (mock mode)' });
          await speakLocal(fallbackText, S.answerLang || S.lang, run);
        } else {
          try {
            S.prov = `${S.prov} · ElevenLabs voice`;
            await playClip(evt.audioUrl, fallbackText, run);
          } catch (e) {
            if (e?.name === 'AbortError' || !run.live()) return;
            if (e.code === 'audio_locked') throw e;
            setState('speaking', { label: 'Speaking', prov: 'on-device voice' });
            await speakLocal(fallbackText, S.answerLang || S.lang, run);
          }
        }
        break;
      case 'audio_error':
        setState('speaking', { label: 'Speaking', prov: `on-device voice (${evt.error === 'voice_budget_exhausted' ? 'voice budget reached' : 'ElevenLabs unavailable'})` });
        await speakLocal(fallbackText, S.answerLang || S.lang, run);
        break;
      case 'error':
        throw Object.assign(new Error(evt.message || 'The request failed.'), { code: evt.error });
      default:
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) await handle(JSON.parse(line));
    }
  }
  if (buf.trim()) await handle(JSON.parse(buf.trim()));
}

function fail(run, e, { soft = false } = {}) {
  if (!run.live()) return;
  releaseMic(true);
  setState('error', { err: e.message || 'Something went wrong.', errKind: e.code || 'error', label: soft ? 'Try again' : 'Voice unavailable' });
  emit('error', { message: e.message, code: e.code });
  scheduleHide(soft ? 3600 : 6500);
}
function finish(run) {
  if (!run.live()) return;
  if (S.state !== 'error') {
    setState('idle', { label: '' });
    scheduleHide(cfg.autoHideMs);
  }
}
function cancel() {
  runId += 1;
  hardStop();
  clearTimeout(hideTimer);
  setState('idle', { label: '', err: '', needGesture: false });
  hud?.hide();
}
function scheduleHide(ms) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (S.state === 'idle' || S.state === 'error') hud?.hide(); }, ms);
}

// ------------------------------------------------------------------ brief source: explicit, provider, or the War Room card on screen
function scrapeBrief() {
  const root = document.querySelector('.wr-brief') || document.querySelector('[data-act="play-brief"]')?.closest('section, article, .glass, div');
  if (!root) return null;
  const clean = (n) => n?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const rows = [...root.querySelectorAll('.bl')].map((r) => ({ k: clean(r.querySelector('dt')).toLowerCase(), v: clean(r.querySelector('dd')) }));
  const pick = (re) => rows.find((r) => re.test(r.k))?.v || '';
  const know = [...root.querySelectorAll('ul.know li')].map(clean).filter(Boolean);
  const dont = [...root.querySelectorAll('ul.dont li')].map(clean).filter(Boolean);
  const b = { happened: pick(/happened/), contained: pick(/contained/), impact: pick(/impact/), need: pick(/need/), know, dont };
  if (b.happened || b.contained || b.impact || b.need || know.length || dont.length) return b;
  return null;
}
function resolveBriefSource() {
  if (typeof briefSource === 'function') {
    try { const b = briefSource(); if (b) return b; } catch { /* fall through */ }
  }
  return scrapeBrief();
}

// ------------------------------------------------------------------ rendering
const ICON = {
  mic: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="3"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4 4 4-4"/></svg>',
};

const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root {
  --accent: #ff5a1f; --accent-rgb: 255, 90, 31; --safe: #2fbf71; --safe-rgb: 47, 191, 113;
  --ink: rgba(247, 249, 255, 0.96); --ink-2: rgba(226, 232, 250, 0.72); --ink-3: rgba(214, 222, 246, 0.46); --ink-4: rgba(214, 222, 246, 0.28);
  --hair: rgba(255, 255, 255, 0.09); --fill-1: rgba(255, 255, 255, 0.055); --fill-2: rgba(255, 255, 255, 0.095); --fill-3: rgba(255, 255, 255, 0.15);
  --glass: rgba(16, 22, 46, 0.42);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif;
  --spring: cubic-bezier(0.22, 1, 0.36, 1); --pop: cubic-bezier(0.34, 1.4, 0.5, 1);
  font: 400 14px/1.45 var(--font); letter-spacing: -0.003em; color: var(--ink); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  color-scheme: dark;
}
.root[data-theme="light"] {
  --ink: rgba(18, 22, 38, 0.94); --ink-2: rgba(28, 34, 58, 0.7); --ink-3: rgba(28, 34, 58, 0.5); --ink-4: rgba(28, 34, 58, 0.3);
  --hair: rgba(0, 0, 0, 0.08); --fill-1: rgba(0, 0, 0, 0.04); --fill-2: rgba(0, 0, 0, 0.07); --fill-3: rgba(0, 0, 0, 0.11);
  --glass: rgba(255, 255, 255, 0.5); color-scheme: light;
}
@media (prefers-color-scheme: light) {
  .root[data-theme="auto"] {
    --ink: rgba(18, 22, 38, 0.94); --ink-2: rgba(28, 34, 58, 0.7); --ink-3: rgba(28, 34, 58, 0.5); --ink-4: rgba(28, 34, 58, 0.3);
    --hair: rgba(0, 0, 0, 0.08); --fill-1: rgba(0, 0, 0, 0.04); --fill-2: rgba(0, 0, 0, 0.07); --fill-3: rgba(0, 0, 0, 0.11);
    --glass: rgba(255, 255, 255, 0.5); color-scheme: light;
  }
}
button, input { font: inherit; color: inherit; letter-spacing: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 2px; }
.root[data-theme="light"] :focus-visible { outline-color: rgba(18, 22, 38, 0.8); }

/* ---- the material: blur + saturate, hairline specular edge, soft sheen, deep shadow */
.glass {
  position: relative; isolation: isolate; border-radius: 28px;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.115) 0%, rgba(255, 255, 255, 0.04) 40%, rgba(255, 255, 255, 0.02) 100%), var(--glass);
  -webkit-backdrop-filter: blur(34px) saturate(1.9) brightness(1.08); backdrop-filter: blur(34px) saturate(1.9) brightness(1.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.3),
    inset 0 22px 34px -22px rgba(255, 255, 255, 0.12), 0 1px 2px rgba(0, 0, 0, 0.3), 0 20px 44px -16px rgba(0, 0, 0, 0.55), 0 44px 90px -34px rgba(0, 0, 0, 0.5);
}
.glass::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none; z-index: 2;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.11) 22%, rgba(255, 255, 255, 0.03) 55%, rgba(255, 255, 255, 0.24) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
}
.glass::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 0; background: radial-gradient(110% 70% at 6% -4%, rgba(255, 255, 255, 0.1), transparent 55%); }
.glass > * { position: relative; z-index: 1; }
@supports (corner-shape: squircle) { .glass, .glass::before, .glass::after, .btn, .seg, .seg button, .mic, .chip, .field, .hud-x { corner-shape: squircle; } }
@media (prefers-reduced-transparency: reduce) { .glass { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgb(20, 26, 50); } }
@media (prefers-contrast: more) { .glass { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.55), 0 20px 44px -16px rgba(0, 0, 0, 0.6); } }

/* ---- small controls (lighter material: they sit on the heavier panel) */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 14px; border-radius: 18px; font-weight: 560; font-size: 13px; background: var(--fill-1); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 0 0 1px var(--hair); transition: transform 0.12s var(--spring), background 0.2s ease; }
.btn:hover { background: var(--fill-2); }
.btn:active, .btn.press { transform: scale(0.965); background: var(--fill-3); transition-duration: 0.06s; }
.btn[disabled] { opacity: 0.45; pointer-events: none; }
.btn.primary { background: linear-gradient(180deg, rgba(var(--accent-rgb), 0.95), rgba(var(--accent-rgb), 0.78)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 6px 18px -6px rgba(var(--accent-rgb), 0.6); color: #fff; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 11.5px; font-weight: 560; letter-spacing: 0.02em; color: var(--ink-2); background: var(--fill-1); box-shadow: inset 0 0 0 1px var(--hair); white-space: nowrap; }
.chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-4); }
.chip[data-tone="ok"] i { background: var(--safe); box-shadow: 0 0 8px rgba(var(--safe-rgb), 0.8); }
.chip[data-tone="warn"] i { background: var(--accent); box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.8); }

.seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 17px; background: var(--fill-1); box-shadow: inset 0 0 0 1px var(--hair); }
.seg button { min-width: 36px; height: 28px; padding: 0 9px; border-radius: 14px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); transition: background 0.2s ease, color 0.2s ease, transform 0.12s var(--spring); }
.seg button:active { transform: scale(0.94); }
.seg button[aria-checked="true"] { background: var(--fill-3); color: var(--ink); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22); }

/* ---- the Voice panel */
.panel { padding: 18px; border-radius: 30px; width: 100%; max-width: 440px; display: grid; gap: 16px; }
.p-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.p-title { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 640; letter-spacing: -0.014em; }
.p-title svg { color: var(--ink-2); }
.p-main { display: flex; align-items: center; gap: 16px; }
.mic {
  flex: none; width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; color: var(--ink);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.06)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 10px 26px -10px rgba(0, 0, 0, 0.6);
  transition: transform 0.45s var(--pop), background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease; touch-action: none; user-select: none; -webkit-user-select: none;
}
.mic:active, .mic.press { transform: scale(0.94); transition-duration: 0.06s; }
.mic[aria-pressed="true"] { background: linear-gradient(160deg, #ff7a45, #ff5a1f); color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 0 6px rgba(var(--accent-rgb), 0.18), 0 12px 34px -8px rgba(var(--accent-rgb), 0.8); animation: ring 1.6s ease-in-out infinite; }
@keyframes ring { 50% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 0 12px rgba(var(--accent-rgb), 0.06), 0 12px 34px -8px rgba(var(--accent-rgb), 0.8); } }
.p-copy { display: grid; gap: 2px; min-width: 0; }
.p-copy b { font-size: 15.5px; font-weight: 620; letter-spacing: -0.01em; }
.p-copy span { font-size: 12.5px; color: var(--ink-3); }
kbd { font: 600 10.5px/1 var(--font); padding: 2px 5px; border-radius: 5px; background: var(--fill-2); box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.25); color: var(--ink-2); }
.p-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
details.more { border-top: 1px solid var(--hair); padding-top: 12px; }
details.more summary { list-style: none; display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-3); cursor: pointer; user-select: none; }
details.more summary::-webkit-details-marker { display: none; }
details.more summary svg { transition: transform 0.35s var(--spring); }
details.more[open] summary svg { transform: rotate(180deg); }
.more-body { display: grid; gap: 12px; padding-top: 12px; animation: rise 0.45s var(--spring); }
@keyframes rise { from { opacity: 0; transform: translateY(-6px); } }
.field { display: flex; gap: 8px; }
.field input { flex: 1; min-width: 0; height: 38px; padding: 0 14px; border-radius: 19px; border: 0; outline: none; background: var(--fill-1); box-shadow: inset 0 0 0 1px var(--hair); font-size: 14px; }
.field input::placeholder { color: var(--ink-3); }
.field input:focus { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.55); }
.meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; font-size: 12px; }
.meta dt { color: var(--ink-3); }
.meta dd { margin: 0; color: var(--ink-2); text-align: right; overflow-wrap: anywhere; }
.note { font-size: 11.5px; color: var(--ink-3); }

/* ---- the HUD */
.hud {
  position: fixed; left: 50%; bottom: max(22px, env(safe-area-inset-bottom)); z-index: 2147483000; width: min(560px, calc(100vw - 28px));
  transform: translate(-50%, 16px) scale(0.9); opacity: 0; filter: blur(10px); visibility: hidden; pointer-events: none;
  transition: opacity 0.3s ease, transform 0.55s var(--spring), filter 0.4s ease, visibility 0s linear 0.55s;
}
.hud.on { transform: translate(-50%, 0) scale(1); opacity: 1; filter: blur(0); visibility: visible; pointer-events: auto; transition-delay: 0s; }
.hud .glass { padding: 14px 18px 12px; border-radius: 30px; transition: box-shadow 0.5s ease; }
.hud[data-state="listening"] .glass { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.3), 0 20px 44px -16px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(var(--accent-rgb), 0.4), 0 0 70px -12px rgba(var(--accent-rgb), 0.5); }
.hud[data-state="speaking"] .glass { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.3), 0 20px 44px -16px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(var(--safe-rgb), 0.35), 0 0 70px -12px rgba(var(--safe-rgb), 0.42); }
.hud[data-state="error"] .glass { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.07), 0 20px 44px -16px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(var(--accent-rgb), 0.5); }
.h-top { display: flex; align-items: center; gap: 10px; min-height: 28px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ink-4); flex: none; transition: background 0.3s ease, box-shadow 0.3s ease; }
.hud[data-state="listening"] .dot { background: var(--accent); box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.9); animation: blink 1.1s ease-in-out infinite; }
.hud[data-state="speaking"] .dot { background: var(--safe); box-shadow: 0 0 12px rgba(var(--safe-rgb), 0.9); animation: blink 1.4s ease-in-out infinite; }
.hud[data-state="transcribing"] .dot, .hud[data-state="thinking"] .dot { background: var(--ink); animation: blink 0.9s ease-in-out infinite; }
.hud[data-state="error"] .dot { background: var(--accent); }
@keyframes blink { 50% { opacity: 0.35; } }
.h-label { font-size: 13px; font-weight: 620; letter-spacing: 0.01em; }
.h-time { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.h-spacer { flex: 1; }
.hud-x { width: 28px; height: 28px; border-radius: 14px; display: grid; place-items: center; color: var(--ink-3); background: var(--fill-1); transition: background 0.2s ease, transform 0.12s var(--spring); }
.hud-x:hover { background: var(--fill-2); color: var(--ink); }
.hud-x:active { transform: scale(0.92); }
.chips { display: inline-flex; gap: 2px; padding: 2px; border-radius: 15px; background: var(--fill-1); box-shadow: inset 0 0 0 1px var(--hair); }
.chips button { min-width: 30px; height: 24px; padding: 0 8px; border-radius: 12px; font-size: 11.5px; font-weight: 640; color: var(--ink-3); transition: background 0.2s ease, color 0.2s ease; }
.chips button[aria-checked="true"] { background: var(--fill-3); color: var(--ink); }
canvas.wave { display: block; width: 100%; height: 54px; margin: 6px 0 2px; }
.talk { display: grid; gap: 8px; margin-top: 4px; }
.row { display: grid; grid-template-columns: 52px 1fr; gap: 10px; align-items: baseline; }
.row .tag { font-size: 10.5px; font-weight: 640; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-3); }
.row p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--ink-2); overflow-wrap: anywhere; }
.row.you p { color: var(--ink); }
.row.say p { font-size: 15.5px; letter-spacing: -0.008em; max-height: 9.6em; overflow: auto; scrollbar-width: none; -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 10px, #000 calc(100% - 14px), transparent 100%); mask-image: linear-gradient(180deg, transparent 0, #000 10px, #000 calc(100% - 14px), transparent 100%); padding: 4px 0; }
.row.say p::-webkit-scrollbar { display: none; }
.row.say .w { color: var(--ink-3); transition: color 0.2s ease; }
.row.say .w.on, .row.say.all .w { color: var(--ink); }
.row.say .lbl { display: block; margin-top: 8px; font-size: 10.5px; font-weight: 640; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-3); }
.row.say .lbl:first-child { margin-top: 0; }
.err { margin: 6px 0 2px; font-size: 14px; color: var(--ink); }
.err small { display: block; margin-top: 4px; color: var(--ink-3); font-size: 12px; }
.typein { display: flex; gap: 8px; margin-top: 10px; }
.typein input { flex: 1; min-width: 0; height: 38px; padding: 0 14px; border-radius: 19px; border: 0; outline: none; background: var(--fill-1); box-shadow: inset 0 0 0 1px var(--hair); font-size: 14px; }
.h-foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--hair); font-size: 11.5px; color: var(--ink-3); }
.h-foot span:last-child { flex: none; }
.gesture { margin-top: 8px; font-size: 12.5px; color: var(--accent); }
[hidden] { display: none !important; }

@media (prefers-reduced-motion: reduce) {
  .hud { transform: translate(-50%, 0); filter: none; transition: opacity 0.2s ease, visibility 0s linear 0.2s; }
  .hud.on { transition-delay: 0s; }
  .mic, .btn, .seg button, .hud-x { transition: none; }
  .mic[aria-pressed="true"], .hud .dot { animation: none !important; }
  .more-body { animation: none; }
}
@media (max-width: 480px) { .panel { padding: 14px; border-radius: 26px; } .row { grid-template-columns: 1fr; gap: 2px; } }
`;

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // constants only (icons); dynamic text always uses textContent
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const themeOf = (t) => (t === 'light' || t === 'auto' ? t : 'dark');

// ------------------------------------------------------------------ waveform
function createWave(canvas) {
  const g = canvas.getContext('2d');
  const buf = new Uint8Array(512);
  let w = 1, hgt = 1, dpr = 1, raf = 0, last = 0, push = 0;
  const bars = [];
  const goal = [];
  const rms = (an) => {
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / buf.length);
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, r.width);
    hgt = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const level = (t) => {
    if (S.state === 'listening' && mic?.an) {
      const r = rms(mic.an);
      mic.peak = Math.max(mic.peak, r);
      return Math.min(1, Math.pow(r * 6, 0.8));
    }
    if (S.state === 'speaking') {
      if (playback?.analyser) return Math.min(1, Math.pow(rms(playback.analyser) * 3.4, 0.85));
      return 0.22 + 0.22 * Math.abs(Math.sin(t / 150)) * Math.abs(Math.sin(t / 370 + 1));
    }
    return 0;
  };
  const frame = (t) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (!w || w < 2) resize();
    const bw = 3, gap = 3;
    const n = Math.max(8, Math.floor((w + gap) / (bw + gap)));
    while (bars.length < n) { bars.push(0.04); goal.push(0.04); }
    bars.length = goal.length = n;
    push += dt;
    const active = S.state === 'listening' || S.state === 'speaking';
    if (active && push > 1 / 28) {
      push = 0;
      goal.shift();
      goal.push(Math.max(0.05, level(t)));
    } else if (!active) {
      for (let i = 0; i < n; i++) {
        const wave = S.state === 'transcribing' || S.state === 'thinking' ? 0.13 + 0.1 * Math.sin(t / 240 + i * 0.32) * Math.sin(t / 900 + i * 0.07) : 0.04;
        goal[i] += (Math.max(0.04, wave) - goal[i]) * Math.min(1, dt * 7);
      }
    }
    const k = 1 - Math.exp(-dt * 22);
    for (let i = 0; i < n; i++) bars[i] += (goal[i] - bars[i]) * k;
    g.clearRect(0, 0, w, hgt);
    const total = n * bw + (n - 1) * gap;
    let x = (w - total) / 2;
    const rgb = S.state === 'speaking' ? '47,191,113' : S.state === 'listening' ? '255,90,31' : '235,240,255';
    for (let i = 0; i < n; i++) {
      const edge = Math.min(1, Math.min(i, n - 1 - i) / 6);
      const v = Math.max(3, bars[i] * hgt * 0.92 * (0.35 + 0.65 * edge));
      g.fillStyle = `rgba(${rgb},${0.28 + Math.min(0.72, bars[i] * 1.3)})`;
      const y = (hgt - v) / 2;
      g.beginPath();
      g.roundRect ? g.roundRect(x, y, bw, v, bw / 2) : g.rect(x, y, bw, v);
      g.fill();
      x += bw + gap;
    }
  };
  return {
    start() { if (!raf) { resize(); last = 0; raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    resize,
  };
}

// ------------------------------------------------------------------ HUD
let hud = null;
const renderers = new Set();
function renderAll() { for (const r of renderers) r(); }

function createHud() {
  const host = h('div', { 'data-claura-voice-hud': '' });
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', {}, CSS));
  const wrap = h('div', { class: 'root', 'data-theme': themeOf(cfg.theme) });

  const dot = h('span', { class: 'dot' });
  const label = h('span', { class: 'h-label', role: 'status', 'aria-live': 'polite' });
  const time = h('span', { class: 'h-time' });
  const chips = h('span', { class: 'chips', role: 'radiogroup', 'aria-label': 'Brief language' },
    LANGUAGES.map((l) => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-lang': l.code, title: l.name, 'aria-label': l.name, onclick: () => { if (S.mode === 'brief') void playBrief(l.code, undefined); else { S.lang = l.code; keep.set('lang', l.code); renderAll(); } } }, l.short)));
  const close = h('button', { type: 'button', class: 'hud-x', 'aria-label': 'Close (Esc)', title: 'Close (Esc)', html: ICON.x, onclick: () => cancel() });
  const canvas = h('canvas', { class: 'wave', 'aria-hidden': 'true' });
  const youP = h('p', { 'aria-live': 'polite' });
  const youRow = h('div', { class: 'row you', hidden: true }, h('span', { class: 'tag' }, 'You'), youP);
  const sayP = h('p', { 'aria-live': 'polite' });
  const sayRow = h('div', { class: 'row say', hidden: true }, h('span', { class: 'tag' }, 'Claura'), sayP);
  const err = h('div', { class: 'err', hidden: true });
  const gesture = h('div', { class: 'gesture', hidden: true }, 'Click anywhere to turn the sound on.');
  const typeInput = h('input', { type: 'text', placeholder: 'Type your question and press Return', 'aria-label': 'Type your question', autocomplete: 'off' });
  const typein = h('form', { class: 'typein', hidden: true, onsubmit: (e) => { e.preventDefault(); const v = typeInput.value; typeInput.value = ''; void ask(v); } }, typeInput);
  const prov = h('span', {});
  const hint = h('span', {}, 'Esc to close');
  const glass = h('div', { class: 'glass' },
    h('div', { class: 'h-top' }, dot, label, time, h('span', { class: 'h-spacer' }), chips, close),
    canvas, h('div', { class: 'talk' }, youRow, sayRow), err, gesture, typein,
    h('div', { class: 'h-foot' }, prov, hint));
  const el = h('div', { class: 'hud', role: 'dialog', 'aria-label': 'Claura voice', 'aria-modal': 'false', 'data-state': 'idle' }, glass);
  wrap.append(el);
  root.append(wrap);
  document.body.append(host);

  const wave = createWave(canvas);
  let wordEls = [];
  let wordKey = '';
  let timer = 0;
  let reveal = 0;

  const buildWords = () => {
    const cap = S.caption;
    const key = cap ? cap.text : '';
    if (key === wordKey) return;
    wordKey = key;
    sayP.textContent = '';
    wordEls = [];
    if (!cap) return;
    for (const sec of cap.sections) {
      if (sec.label) sayP.append(h('span', { class: 'lbl' }, sec.label));
      const parts = S.lang === 'zh' || /[一-鿿]/.test(sec.text) ? Array.from(sec.text) : sec.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        if (/^\s+$/.test(p)) { sayP.append(document.createTextNode(p)); continue; }
        const s = h('span', { class: 'w' }, p);
        sayP.append(s);
        wordEls.push(s);
      }
    }
  };
  const tickReveal = () => {
    const p = S.state === 'speaking' ? (playback?.progress?.() ?? localSpeech?.progress?.() ?? 0) : S.state === 'idle' ? 1 : 0;
    const upto = Math.round(p * wordEls.length);
    if (upto === reveal && S.state !== 'idle') return;
    reveal = upto;
    for (let i = 0; i < wordEls.length; i++) wordEls[i].classList.toggle('on', i < upto);
    if (S.state === 'speaking' && wordEls[upto - 1]) {
      const w = wordEls[upto - 1];
      const top = w.offsetTop - sayP.offsetTop;
      if (top > sayP.scrollTop + sayP.clientHeight - 24 || top < sayP.scrollTop) sayP.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
    }
  };

  const render = () => {
    const live = S.state !== 'idle' || S.mode !== null;
    if (!el.classList.contains('on') && !live) return;
    el.dataset.state = S.state;
    dot.setAttribute('data-s', S.state);
    label.textContent = S.state === 'idle' ? (S.mode === 'brief' ? 'Brief' : S.mode === 'ask' ? 'Claura' : 'Voice') : S.state === 'error' ? S.label || 'Voice unavailable' : S.label || S.state;
    chips.hidden = S.mode !== 'brief';
    for (const b of chips.children) b.setAttribute('aria-checked', String(b.dataset.lang === S.lang));
    const showErr = S.state === 'error';
    err.hidden = !showErr;
    if (showErr) {
      err.textContent = S.err;
      const small = h('small', {}, S.errKind === 'offline' ? 'Answers will use the on-device voice when the service is unreachable.' : '');
      if (small.textContent) err.append(small);
    }
    typein.hidden = !(showErr && ['mic_denied', 'mic_unsupported', 'silent', 'too_short'].includes(S.errKind));
    youRow.hidden = !S.transcript;
    youP.textContent = S.transcript;
    buildWords();
    sayRow.hidden = !S.caption;
    sayRow.classList.toggle('all', S.state !== 'speaking' && S.state !== 'idle');
    gesture.hidden = !S.needGesture;
    prov.textContent = S.prov;
    canvas.hidden = showErr;
    hint.textContent = S.state === 'listening' ? 'Tap the mic again to send' : 'Esc to close';
    if (S.state === 'listening') {
      clearInterval(timer);
      timer = setInterval(() => { time.textContent = fmtTime(performance.now() - (mic?.startedAt || S.startedAt)); }, 250);
    } else {
      clearInterval(timer);
      time.textContent = '';
    }
    cancelAnimationFrame(reveal);
  };

  let revealTimer = 0;
  const api2 = {
    el, host,
    render,
    show() {
      const r = el.getBoundingClientRect();
      if (lastPtr && performance.now() - lastPtr.t < 1800 && r.width > 0) {
        el.style.transformOrigin = `${Math.round(lastPtr.x - r.left)}px ${Math.round(lastPtr.y - r.top)}px`; // grows out of the thing you tapped
      } else el.style.transformOrigin = '50% 100%';
      if (!el.classList.contains('on')) {
        void el.offsetWidth;
        el.classList.add('on');
      }
      wave.start();
      clearInterval(revealTimer);
      revealTimer = setInterval(tickReveal, 90);
      render();
    },
    hide() {
      el.classList.remove('on');
      clearInterval(revealTimer);
      clearInterval(timer);
      setTimeout(() => { if (!el.classList.contains('on')) wave.stop(); }, 700);
    },
    focusInput() { setTimeout(() => typeInput.focus(), 30); },
    get shown() { return el.classList.contains('on'); },
    destroy() { wave.stop(); host.remove(); },
  };
  el.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  el.addEventListener('pointerleave', () => { if (S.state === 'idle') scheduleHide(2400); });
  window.addEventListener('resize', () => wave.resize());
  return api2;
}

function ensureHud() {
  if (!cfg.hud) return null;
  if (!hud) {
    hud = createHud();
    renderers.add(() => {
      if (!hud) return;
      const live = S.state !== 'idle' || (S.mode !== null && (S.caption || S.transcript || S.err));
      if (live && !hud.shown) hud.show();
      else if (hud.shown) hud.render();
    });
  }
  return hud;
}

// ------------------------------------------------------------------ the optional "Voice" panel
export function mountUI(container, opts = {}) {
  if (!container) throw new Error('mountUI(container): container is required');
  if (opts.base) cfg.base = String(opts.base).replace(/\/+$/, '');
  if (opts.hotkey !== undefined) cfg.hotkey = opts.hotkey;
  if (opts.hud === false) cfg.hud = false;
  if (opts.theme) cfg.theme = opts.theme;
  if (isLang(opts.lang)) { S.lang = opts.lang; keep.set('lang', opts.lang); }
  if (typeof opts.getBrief === 'function') briefSource = opts.getBrief;
  ensureHud();

  const host = h('div', { 'data-claura-voice-panel': '', style: 'display:block' });
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', {}, CSS));
  const wrap = h('div', { class: 'root', 'data-theme': themeOf(cfg.theme) });

  const modeChip = h('span', { class: 'chip', 'data-tone': '' }, h('i'), h('span', {}, 'Checking'));
  const mic = h('button', { type: 'button', class: 'mic', 'aria-label': 'Ask Claura. Tap to talk, tap again to send', 'aria-pressed': 'false', html: ICON.mic });
  const copy = h('div', { class: 'p-copy' }, h('b', {}, 'Ask Claura'), h('span', {}, 'Tap, speak, tap again. Or hold to talk. ', cfg.hotkey ? [h('kbd', {}, cfg.hotkey.split('+')[0]), ' ', h('kbd', {}, cfg.hotkey.split('+').slice(1).join('+'))] : ''));
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Brief language' },
    LANGUAGES.map((l) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(l.code === S.lang), 'data-lang': l.code, title: l.name, 'aria-label': l.name, onclick: () => { S.lang = l.code; keep.set('lang', l.code); renderAll(); } }, l.short)));
  const play = h('button', { type: 'button', class: 'btn primary', html: `${ICON.speaker}<span>Play brief</span>`, onclick: () => void playBrief(S.lang) });
  const input = h('input', { type: 'text', placeholder: 'Type a question, or text to speak', 'aria-label': 'Type a question or text to speak', autocomplete: 'off' });
  const askBtn = h('button', { type: 'submit', class: 'btn' }, 'Ask');
  const sayBtn = h('button', { type: 'button', class: 'btn', onclick: () => { const v = input.value.trim(); if (v) { input.value = ''; void say(v); } } }, 'Speak');
  const form = h('form', { class: 'field', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ''; void ask(v); } } }, input, askBtn, sayBtn);
  const stingBtn = h('button', { type: 'button', class: 'btn', html: `${ICON.bell}<span>Alert sting</span>`, onclick: () => void sting() });
  const meta = h('dl', { class: 'meta' });
  const more = h('details', { class: 'more' },
    h('summary', { html: `<span>More</span>${ICON.chevron}` }),
    h('div', { class: 'more-body' }, form, h('div', {}, stingBtn), meta, h('div', { class: 'note' }, 'Voice is read-only. Approvals stay on the approval card.')));
  const panel = h('section', { class: 'glass panel', 'aria-label': 'Claura voice' },
    h('div', { class: 'p-head' }, h('div', { class: 'p-title', html: `${ICON.speaker}<span>Voice</span>` }), modeChip),
    h('div', { class: 'p-main' }, mic, copy),
    h('div', { class: 'p-row' }, seg, play),
    more);
  wrap.append(panel);
  root.append(wrap);
  container.append(host);

  // Press-and-hold talks, a quick tap toggles. Feedback starts on pointer-down, not on release.
  let downAt = 0;
  let tapToStop = false;
  mic.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    mic.classList.add('press');
    mic.setPointerCapture?.(e.pointerId);
    downAt = performance.now();
    tapToStop = S.state === 'listening';
    if (!tapToStop) void startListening();
  });
  const release = () => {
    mic.classList.remove('press');
    if (!downAt) return;
    const held = performance.now() - downAt;
    downAt = 0;
    if (tapToStop || (held >= cfg.holdMs && S.state === 'listening')) void stopListening();
  };
  mic.addEventListener('pointerup', release);
  mic.addEventListener('pointercancel', () => { mic.classList.remove('press'); downAt = 0; });
  mic.addEventListener('click', (e) => { if (e.detail === 0) void toggle(); }); // keyboard (Enter / Space)

  const refresh = async () => {
    try {
      const j = await (await api('/status')).json();
      const live = j.mode === 'live';
      modeChip.dataset.tone = live && j.nemotron?.up ? 'ok' : 'warn';
      modeChip.lastChild.textContent = live ? (j.nemotron?.up ? 'Live' : 'Live · Nemotron offline') : 'Mock audio';
      const rows = [
        ['Voice', j.elevenlabs?.voice?.name ?? '-'],
        ['Speech', `${j.elevenlabs?.models?.live ?? '-'} · ${j.elevenlabs?.models?.brief ?? '-'}`],
        ['Transcription', j.elevenlabs?.models?.stt ?? '-'],
        ['Answers', `${j.nemotron?.model ?? '-'} ${j.nemotron?.up ? '(local)' : '(offline)'}`],
        ['Characters', `${j.usage?.charsUsed ?? 0} of ${j.usage?.budget ?? '-'}`],
      ];
      meta.textContent = '';
      for (const [k, v] of rows) meta.append(h('dt', {}, k), h('dd', {}, v));
    } catch {
      modeChip.dataset.tone = 'warn';
      modeChip.lastChild.textContent = 'Offline: on-device voice';
    }
  };
  const draw = () => {
    mic.setAttribute('aria-pressed', String(S.state === 'listening'));
    mic.innerHTML = S.state === 'listening' ? ICON.stop : ICON.mic;
    for (const b of seg.children) b.setAttribute('aria-checked', String(b.dataset.lang === S.lang));
    play.disabled = false;
  };
  renderers.add(draw);
  void refresh();
  const poll = setInterval(() => { if (document.visibilityState === 'visible' && more.open) void refresh(); }, 15000);
  more.addEventListener('toggle', () => { if (more.open) void refresh(); });
  draw();
  return {
    el: host,
    refresh,
    destroy() { clearInterval(poll); renderers.delete(draw); host.remove(); },
  };
}

// ------------------------------------------------------------------ hotkey + escape
function parseHotkey(s) {
  const parts = String(s || '').split('+').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return null;
  const key = parts.pop();
  return { alt: parts.includes('alt') || parts.includes('option'), ctrl: parts.includes('ctrl') || parts.includes('control'), meta: parts.includes('cmd') || parts.includes('meta'), shift: parts.includes('shift'), key };
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (hud?.shown || S.state !== 'idle')) {
    e.preventDefault();
    e.stopImmediatePropagation(); // Esc closes the voice HUD first, before the console sees it
    cancel();
    return;
  }
  const hk = parseHotkey(cfg.hotkey);
  if (!hk || e.repeat) return;
  const code = e.code?.toLowerCase();
  const keyMatch = code === `key${hk.key}` || code === hk.key || e.key?.toLowerCase() === hk.key;
  if (keyMatch && e.altKey === hk.alt && e.ctrlKey === hk.ctrl && e.metaKey === hk.meta && e.shiftKey === hk.shift) {
    e.preventDefault();
    void toggle();
  }
}, true);
window.addEventListener('pagehide', () => hardStop());

// ------------------------------------------------------------------ the public API
export const voice = {
  version: VERSION,
  toggle,
  /** Start / stop listening explicitly (toggle() does both). */
  start: startListening,
  stop: () => (S.state === 'listening' ? stopListening() : cancel()),
  cancel,
  playBrief,
  say,
  sting,
  ask,
  get state() { return S.state; },
  get listening() { return S.state === 'listening'; },
  get language() { return S.lang; },
  setLanguage(code) { if (isLang(code)) { S.lang = code; keep.set('lang', code); renderAll(); } return S.lang; },
  /** Pin the demo stage (quiet | detect | contain | approval | quarantine | contained). null = follow the console. */
  setStage(stage) { S.stage = stage || null; return S.stage; },
  /** Provide the brief to speak: a function returning a string or {happened, contained, impact, need, know[], dont[]}. */
  setBriefSource(fn) { briefSource = typeof fn === 'function' ? fn : null; },
  configure(o = {}) { Object.assign(cfg, o); if (o.base) cfg.base = String(o.base).replace(/\/+$/, ''); return { ...cfg }; },
  async status() { return (await api('/status')).json(); },
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); },
  off(type, fn) { listeners.get(type)?.delete(fn); },
  mountUI,
  LANGUAGES,
};

(function attach() {
  const root = window.claura && typeof window.claura === 'object' ? window.claura : (window.claura = {});
  if (!('voice' in root)) root.voice = voice; // never overwrite what another module already put there
  if (!('mountVoiceUI' in root)) root.mountVoiceUI = mountUI;
})();

export default voice;
