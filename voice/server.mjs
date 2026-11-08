// Claura Voice: server side.
//
//   import { mount } from './server.mjs';
//   const voice = mount(app, { env, log, ledger, getBrief, getIncidentContext });
//
// REAL: ElevenLabs text to speech (eleven_flash_v2_5 live, eleven_multilingual_v2 briefs), speech to text (scribe_v1)
//       and sound effects; local NVIDIA Nemotron (Ollama, nemotron-3-nano:4b) for the spoken answers.
// SIMULATED: the default incident context and brief (lib/fixtures.mjs) are scripted demo data; ctx.getBrief() and
//       ctx.getIncidentContext() replace them with live state. With no ELEVENLABS_API_KEY the feature runs in MOCK
//       mode (silent audio, canned transcript) so every path can still be exercised.
//
// Routes (base /api/voice):
//   GET  /status                       what is configured, usage, Nemotron health
//   POST /tts   {text, voiceId?, lang?, model?}           -> audio/mpeg
//   GET  /brief?lang=en|es|hi|zh|fr[&format=json]         -> audio/mpeg (or JSON with captions + audioUrl)
//   POST /brief {lang, brief?|text?, stage?}              -> same, speaking a brief the page already has
//   POST /stt   (audio body)                              -> {transcript, lang}
//   POST /ask   (audio body, or JSON {transcript})        -> {transcript, answer, audioUrl, ...}  [?stream=1 for NDJSON]
//   GET  /sting                                           -> the cached alert chime
//   GET  /audio/:name                                     -> a cached clip (what audioUrl points at)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { answerQuestion } from './lib/answer.mjs';
import { chimeWav, estimateSeconds, silentMp3 } from './lib/audio.mjs';
import { createBriefBuilder } from './lib/brief.mjs';
import { createEleven, ElevenError, FALLBACK_VOICE_ID, MODELS, pickVoice, resolveModel } from './lib/eleven.mjs';
import { elevenKey, envFilePath, loadEnv, loadEnvFile } from './lib/env.mjs';
import { buildIncidentContext, DEFAULT_STAGE, defaultBrief, isStage, phaseToStage } from './lib/fixtures.mjs';
import { makeLog } from './lib/log.mjs';
import { createNemotron, DEFAULT_MODEL, DEFAULT_OLLAMA } from './lib/nemotron.mjs';
import { LANG_CODES, LANGS, miscFor, normLang } from './lib/phrases.mjs';
import { speechify } from './lib/speech.mjs';
import { BudgetError, createStore, DEFAULT_BUDGET, DEFAULT_CACHE_DIR, sha } from './lib/store.mjs';

export const VERSION = '0.1.0';
export const BASE = '/api/voice';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const MAX_TTS_CHARS = 1500;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const STING_PROMPT = 'short urgent but calm two-tone security alert chime';
const STING_SECONDS = 1.5;
const SETTINGS_VERSION = 'v1'; // bump to invalidate every cached clip

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

/** In-memory stand-in for the SpacetimeDB incident log. A real adapter only needs append(entry). */
export function createMemoryLedger(max = 200) {
  const rows = [];
  return {
    async append(entry) {
      const row = { id: rows.length ? rows.at(-1).id + 1 : 1, at: new Date().toISOString(), ...entry };
      rows.push(row);
      if (rows.length > max) rows.shift();
      return row;
    },
    list(limit = 50) {
      return rows.slice(-limit);
    },
  };
}

// ------------------------------------------------------------------ small helpers
function readStream(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'too_large', `Request body is larger than ${Math.round(limit / 1024)} KB`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function jsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const buf = Buffer.isBuffer(req.body) ? req.body : await readStream(req, 512 * 1024);
  if (!buf.length) return {};
  try {
    const j = JSON.parse(buf.toString('utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    throw new HttpError(400, 'bad_json', 'The request body is not valid JSON');
  }
}
const rawBody = async (req) => (Buffer.isBuffer(req.body) ? req.body : readStream(req, MAX_AUDIO_BYTES));

/** Cheap language guess for typed questions (spoken ones carry Scribe's language code). */
export function guessLang(text) {
  const s = String(text ?? '');
  if (/[ऀ-ॿ]/.test(s)) return 'hi';
  if (/[一-鿿]/.test(s)) return 'zh';
  const words = s.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  const score = (set) => words.filter((w) => set.has(w)).length;
  const es = score(new Set(['el', 'la', 'los', 'las', 'qué', 'que', 'está', 'es', 'son', 'de', 'un', 'una', 'por', 'con', 'para', 'servidor', 'cuántos', 'quién', 'cómo', 'hay', 'y']));
  const fr = score(new Set(['le', 'les', 'est', 'sont', 'des', 'qui', 'une', 'pour', 'avec', 'dans', 'quoi', "l'hôte", 'hôte', 'combien', 'comment', 'et', 'du']));
  if (es >= 2 && es > fr) return 'es';
  if (fr >= 2 && fr > es) return 'fr';
  return 'en';
}

const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

// ------------------------------------------------------------------ mount
/**
 * @param {import('express').Express} app  an Express 5 app (or Router)
 * @param {object} ctx
 * @param {object}   [ctx.env]    environment (defaults to process.env + the shared Claura .env file)
 * @param {object|Function} [ctx.log]
 * @param {{append:Function}} [ctx.ledger]  incident-log adapter; defaults to an in-memory ledger
 * @param {Function} [ctx.getBrief]            ({lang, stage, incidentId, req}) -> string | {text,lang} | {happened,contained,impact,need,know,dont}
 * @param {Function} [ctx.getIncidentContext]  ({stage, incidentId, lang, req}) -> object | string
 * @param {object}   [ctx.voice]  {base, prewarm, stage, allowedOrigins}
 */
export function mount(app, ctx = {}) {
  const opt = ctx.voice ?? {};
  const base = String(opt.base ?? BASE).replace(/\/+$/, '');
  const fileEnv = loadEnvFile();
  const env = { ...fileEnv, ...(ctx.env && typeof ctx.env === 'object' ? ctx.env : process.env) };
  const apiKey = elevenKey(env) || elevenKey(fileEnv);
  const forceMock = /^(1|true|yes)$/i.test(String(env.CLAURA_VOICE_MOCK ?? ''));
  const log = makeLog(ctx.log, { secrets: [apiKey], debug: !!env.CLAURA_VOICE_DEBUG });
  const eleven = apiKey && !forceMock ? createEleven({ apiKey, log }) : null;
  const mode = () => (eleven ? 'live' : 'mock');

  const budget = Number.isFinite(Number(env.CLAURA_VOICE_CHAR_BUDGET)) && env.CLAURA_VOICE_CHAR_BUDGET !== undefined && env.CLAURA_VOICE_CHAR_BUDGET !== '' ? Number(env.CLAURA_VOICE_CHAR_BUDGET) : DEFAULT_BUDGET;
  const store = createStore({ dir: env.CLAURA_VOICE_CACHE || DEFAULT_CACHE_DIR, budget, log });
  const nemotron = createNemotron({ host: env.OLLAMA_HOST || DEFAULT_OLLAMA, model: env.CLAURA_NEMOTRON_MODEL || DEFAULT_MODEL, log });
  const briefs = createBriefBuilder({ nemotron, store, log });
  const ledger = ctx.ledger && typeof ctx.ledger.append === 'function' ? ctx.ledger : createMemoryLedger();
  const defaultStage = isStage(opt.stage) ? opt.stage : DEFAULT_STAGE;
  const models = {
    live: resolveModel(env.CLAURA_VOICE_MODEL_LIVE, MODELS.live),
    brief: resolveModel(env.CLAURA_VOICE_MODEL_BRIEF, MODELS.brief),
    stt: env.CLAURA_VOICE_MODEL_STT || MODELS.stt,
  };

  const note = async (entry) => {
    try { await ledger.append({ actor: 'voice', ...entry }); } catch (e) { log.warn(`ledger append failed: ${e.message}`); }
  };

  // ---------------------------------------------------------------- voice selection
  let defaultVoice = null;
  async function ensureDefaultVoice() {
    if (defaultVoice) return defaultVoice;
    const fixed = String(env.CLAURA_VOICE_ID || env.ELEVENLABS_VOICE_ID || '').trim();
    if (VOICE_ID_RE.test(fixed)) return (defaultVoice = { id: fixed, name: 'configured voice' });
    if (!eleven) return (defaultVoice = { id: 'mock', name: 'mock voice' });
    const cached = store.readJson('voices', 'default');
    if (cached?.id && Date.now() - Date.parse(cached.at) < 24 * 3600 * 1000) return (defaultVoice = { id: cached.id, name: cached.name });
    try {
      const v = pickVoice(await eleven.voices());
      store.writeJson('voices', 'default', { id: v.id, name: v.name, at: new Date().toISOString() });
      return (defaultVoice = { id: v.id, name: v.name });
    } catch (e) {
      log.warn(`could not list voices (${e.message}); using the built-in default voice`);
      return (defaultVoice = { id: FALLBACK_VOICE_ID, name: 'Sarah' });
    }
  }
  async function voiceFor(lang, override) {
    if (override !== undefined && override !== null && override !== '') {
      if (!VOICE_ID_RE.test(String(override))) throw new HttpError(400, 'bad_voice', 'voiceId must be 10 to 40 letters and digits');
      return { id: String(override), name: 'custom voice' };
    }
    const perLang = String(env[`CLAURA_VOICE_ID_${String(lang).toUpperCase()}`] ?? '').trim();
    if (VOICE_ID_RE.test(perLang)) return { id: perLang, name: `${lang} voice` };
    return ensureDefaultVoice();
  }

  // ---------------------------------------------------------------- text to speech (cached)
  async function speak({ text, lang = 'en', voiceId, model = 'live', raw = false }) {
    const spoken = raw ? String(text ?? '').trim() : speechify(text, lang, { maxChars: MAX_TTS_CHARS });
    if (!spoken) throw new HttpError(400, 'empty_text', 'There is no text to speak');
    if (spoken.length > MAX_TTS_CHARS) throw new HttpError(413, 'text_too_long', `The text is ${spoken.length} characters; the limit is ${MAX_TTS_CHARS}`);
    const m = mode();
    const modelId = model === 'live' ? models.live : model === 'brief' ? models.brief : resolveModel(model, models.live);
    const voice = await voiceFor(lang, voiceId);
    const kind = m === 'live' ? 'tts' : 'mock-tts';
    const id = sha('tts', voice.id, modelId, ['eleven_flash_v2_5', 'eleven_turbo_v2_5'].includes(modelId) ? lang : '', spoken, SETTINGS_VERSION);
    const name = `${kind}-${id}.mp3`;
    const file = store.file(kind, id);
    const started = Date.now();
    const cached = store.has(kind, id);
    if (!cached) {
      await store.once(name, async () => {
        if (m === 'mock') {
          store.write(kind, id, silentMp3(estimateSeconds(spoken)));
          return;
        }
        const ticket = store.reserve(spoken.length, 'tts');
        try {
          const buf = await eleven.tts({ text: spoken, voiceId: voice.id, modelId, languageCode: lang });
          store.write(kind, id, buf);
          ticket.commit();
        } catch (e) {
          ticket.release();
          throw e;
        }
      });
    }
    log.info(`tts ${cached ? 'cache hit' : 'generated'}`, { chars: spoken.length, model: modelId, ms: Date.now() - started, mode: m });
    return { file, name, cached, chars: spoken.length, model: modelId, voice, mode: m, spoken, url: `${base}/audio/${name}` };
  }

  // ---------------------------------------------------------------- speech to text
  async function transcribe(buf, mime) {
    if (!buf?.length) throw new HttpError(400, 'empty_audio', 'No audio was received');
    if (mode() === 'mock') return { text: env.CLAURA_VOICE_MOCK_TRANSCRIPT || 'Is the host contained?', languageCode: 'eng', mock: true };
    store.recordStt(buf.length);
    const r = await eleven.stt({ buffer: buf, mime: mime || 'audio/webm', modelId: models.stt });
    return { text: r.text, languageCode: r.languageCode, languageProbability: r.languageProbability, mock: false };
  }

  // ---------------------------------------------------------------- context + brief sources
  const resolveStage = (q = {}) => (isStage(q.stage) ? q.stage : phaseToStage(q.phase) ?? defaultStage);

  async function getContext({ stage, incidentId, lang, req }) {
    if (typeof ctx.getIncidentContext === 'function') {
      try {
        const c = await ctx.getIncidentContext({ stage, incidentId, lang, req });
        if (c && (typeof c === 'object' || typeof c === 'string')) return c;
      } catch (e) {
        log.warn(`ctx.getIncidentContext failed (${e.message}); using the default demo context`);
      }
    }
    return buildIncidentContext(stage);
  }
  async function getBriefInput({ lang, stage, incidentId, req }) {
    if (typeof ctx.getBrief === 'function') {
      try {
        const b = await ctx.getBrief({ lang, stage, incidentId, req });
        if (b) return { input: b, from: 'ctx' };
      } catch (e) {
        log.warn(`ctx.getBrief failed (${e.message}); using the default demo brief`);
      }
    }
    return { input: defaultBrief(stage), from: 'default' };
  }

  // ---------------------------------------------------------------- the ask pipeline (shared by JSON and NDJSON)
  async function* askPipeline({ audio, mime, transcript, lang: langHint, stage, incidentId, req, signal }) {
    const t0 = Date.now();
    const timings = {};
    let text = String(transcript ?? '').trim();
    let lang = langHint && LANGS[langHint] ? langHint : null;
    let sttMock = false;

    if (!text && audio?.length) {
      const t = Date.now();
      const r = await transcribe(audio, mime);
      timings.stt = Date.now() - t;
      text = r.text;
      sttMock = !!r.mock;
      lang ??= normLang(r.languageCode, 'en');
    }
    lang ??= guessLang(text);
    yield { type: 'transcript', transcript: text, lang, mock: sttMock };

    const context = await getContext({ stage, incidentId, lang, req });
    const a = await answerQuestion({ question: text, context, lang, nemotron, log, signal });
    timings.answer = a.ms ?? 0;
    yield { type: 'answer', answer: a.answer, source: a.source, model: a.model, intent: a.intent, note: a.note, lang };
    note({ kind: 'voice.ask', incidentId, summary: `Asked Claura: ${text.slice(0, 140)}`, data: { transcript: text, answer: a.answer, source: a.source, lang } });

    try {
      const t = Date.now();
      const clip = await speak({ text: a.answer, lang, model: 'live' });
      timings.tts = Date.now() - t;
      yield { type: 'audio', audioUrl: clip.url, cached: clip.cached, chars: clip.chars, mode: clip.mode, model: clip.model };
    } catch (e) {
      log.warn(`ask: speech unavailable (${e.message})`);
      yield { type: 'audio_error', error: e.code || e.kind || 'tts_failed', message: e.message, fallback: 'speechSynthesis' };
    }
    timings.total = Date.now() - t0;
    yield { type: 'done', timings };
  }

  // ---------------------------------------------------------------- http plumbing
  function sendError(res, e) {
    let status = 500;
    let code = 'voice_error';
    let extra = {};
    if (e instanceof HttpError) { status = e.status; code = e.code; }
    else if (e instanceof BudgetError) { status = 429; code = e.code; extra = { fallback: 'speechSynthesis' }; }
    else if (e instanceof ElevenError) {
      code = `elevenlabs_${e.kind}`;
      status = e.kind === 'quota' || e.kind === 'rate' ? 429 : 502;
      extra = { fallback: 'speechSynthesis' };
    }
    if (status >= 500) log.error(`${code}: ${e.message}`);
    else log.warn(`${code}: ${e.message}`);
    if (!res.headersSent) res.status(status).json({ error: code, message: e.message, ...extra });
    else res.end();
  }
  const handle = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { sendError(res, e); }
  };

  /** Browsers only: refuse cross-origin posts (budget burn / CSRF) and non-JSON, non-audio bodies. */
  function guard(req) {
    const origin = req.headers.origin;
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === req.headers.host; } catch { same = false; }
      const allowed = Array.isArray(opt.allowedOrigins) && opt.allowedOrigins.includes(origin);
      if (!same && !allowed) throw new HttpError(403, 'cross_origin', 'Cross-origin requests to the voice API are not allowed');
    }
    if (req.method === 'POST') {
      const ct = String(req.headers['content-type'] ?? '').toLowerCase();
      if (ct && !/^(application\/json|audio\/|video\/webm|video\/mp4|application\/octet-stream)/.test(ct)) {
        throw new HttpError(415, 'unsupported_media_type', 'Send application/json or an audio body');
      }
    }
  }

  function sendClip(res, clip, extra = {}) {
    // Send relative to a root: with a bare absolute path, `dotfiles: 'deny'` also rejects any dot-directory in the path, and the
    // default cache folder is ~/.cache/claura/voice (every clip answered 403/500 before this).
    res.sendFile(
      path.basename(clip.file),
      {
        root: path.dirname(clip.file),
        acceptRanges: true,
        maxAge: '1h',
        immutable: true,
        dotfiles: 'deny',
        headers: {
          'X-Voice-Mode': clip.mode ?? 'live',
          'X-Voice-Cache': clip.cached ? 'hit' : 'miss',
          'X-Voice-Chars': String(clip.chars ?? 0),
          'X-Voice-Model': clip.model ?? '',
          'X-Content-Type-Options': 'nosniff',
          ...extra,
        },
      },
      (err) => {
        if (err && !res.headersSent) sendError(res, err.code === 'ENOENT' ? new HttpError(404, 'not_found', 'Clip not found') : err);
      },
    );
  }

  // ---------------------------------------------------------------- routes
  app.get(`${base}/status`, handle(async (_req, res) => {
    const voice = await ensureDefaultVoice();
    const nem = await nemotron.status();
    let account;
    if (eleven) {
      account = store.readJson('account', 'latest');
      if (!account || Date.now() - Date.parse(account.at) > 60000) {
        try {
          account = { ...(await eleven.subscription()), at: new Date().toISOString() };
          store.writeJson('account', 'latest', account);
        } catch (e) {
          account = { error: e.kind || 'unavailable', at: new Date().toISOString() };
        }
      }
    }
    const u = store.usage();
    res.json({
      ok: true,
      name: 'claura-voice',
      version: VERSION,
      mode: mode(),
      elevenlabs: {
        configured: !!apiKey,
        forcedMock: forceMock,
        voice: { id: voice.id, name: voice.name },
        models: { live: models.live, brief: models.brief, stt: models.stt },
        account: account ? { tier: account.tier, used: account.used, limit: account.limit, error: account.error } : undefined,
      },
      nemotron: { up: nem.up, model: nem.model, present: nem.present },
      usage: { charsUsed: u.charsUsed, budget: u.budget, ttsCalls: u.ttsCalls, sfxCalls: u.sfxCalls, sttCalls: u.sttCalls },
      cache: store.stats(),
      languages: LANG_CODES.map((c) => ({ code: c, name: LANGS[c].name, native: LANGS[c].native })),
      defaults: { stage: defaultStage },
    });
  }));

  app.post(`${base}/tts`, handle(async (req, res) => {
    guard(req);
    const b = await jsonBody(req);
    const clip = await speak({ text: b.text, lang: normLang(b.lang), voiceId: b.voiceId, model: b.model ?? 'live', raw: b.raw === true });
    note({ kind: 'voice.say', summary: `Spoke ${clip.chars} characters`, data: { chars: clip.chars, cached: clip.cached } });
    sendClip(res, clip);
  }));

  const briefHandler = handle(async (req, res) => {
    guard(req);
    const body = req.method === 'POST' ? await jsonBody(req) : {};
    const q = { ...req.query, ...body };
    const lang = normLang(q.lang);
    const stage = resolveStage(q);
    let input = null;
    let from = 'client';
    if (q.brief && typeof q.brief === 'object') input = q.brief;
    else if (typeof q.text === 'string' && q.text.trim()) input = { text: q.text, lang: q.textLang ?? q.briefLang };
    if (!input) ({ input, from } = await getBriefInput({ lang, stage, incidentId: q.incidentId, req }));
    const script = await briefs.build(input, lang);
    if (!script) throw new HttpError(404, 'no_brief', 'No brief is available');
    const clip = await speak({ text: script.text, lang, model: 'brief' });
    note({ kind: 'voice.brief', incidentId: q.incidentId, summary: `Spoke the brief in ${LANGS[lang].name}`, data: { lang, chars: clip.chars, translation: script.translation, from } });
    const accept = String(req.headers.accept ?? '');
    const wantJson = q.format === 'json' || (/application\/json/.test(accept) && !/audio\//.test(accept));
    if (wantJson) {
      return res.json({ lang, text: script.text, sections: script.sections, translation: script.translation, source: from, audioUrl: clip.url, cached: clip.cached, chars: clip.chars, model: clip.model, mode: clip.mode });
    }
    sendClip(res, clip, { 'X-Voice-Translation': script.translation });
  });
  app.get(`${base}/brief`, briefHandler);
  app.post(`${base}/brief`, briefHandler);

  app.post(`${base}/stt`, handle(async (req, res) => {
    guard(req);
    const buf = await rawBody(req);
    const r = await transcribe(buf, String(req.headers['content-type'] ?? ''));
    res.json({ transcript: r.text, lang: normLang(r.languageCode, 'en'), languageCode: r.languageCode, mock: r.mock });
  }));

  app.post(`${base}/ask`, handle(async (req, res) => {
    guard(req);
    const ct = String(req.headers['content-type'] ?? '').toLowerCase();
    const isJson = ct.startsWith('application/json') || (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body));
    let input;
    if (isJson) {
      const b = await jsonBody(req);
      input = { transcript: typeof b.transcript === 'string' ? b.transcript : '', lang: b.lang, stage: resolveStage(b), incidentId: b.incidentId };
    } else {
      const q = req.query;
      input = { audio: await rawBody(req), mime: ct, lang: q.lang, stage: resolveStage(q), incidentId: q.incidentId };
    }
    if (input.lang) input.lang = normLang(input.lang);
    if (!input.transcript && !input.audio?.length) throw new HttpError(400, 'empty_request', 'Send audio, or JSON with a transcript');
    if (input.transcript && input.transcript.length > 600) throw new HttpError(413, 'question_too_long', 'Keep the question under 600 characters');

    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    const pipeline = askPipeline({ ...input, req, signal: ac.signal });

    if (req.query.stream === '1' || /application\/x-ndjson/.test(String(req.headers.accept ?? ''))) {
      res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      res.flushHeaders?.();
      try {
        for await (const evt of pipeline) res.write(JSON.stringify(evt) + '\n');
      } catch (e) {
        const known = e instanceof HttpError || e instanceof ElevenError || e instanceof BudgetError;
        log.warn(`ask failed: ${e.message}`);
        res.write(JSON.stringify({ type: 'error', error: e.code || e.kind || 'ask_failed', message: known ? e.message : 'The request failed', fallback: e.kind ? 'speechSynthesis' : undefined }) + '\n');
      }
      return res.end();
    }

    const out = {};
    for await (const evt of pipeline) {
      const { type, ...rest } = evt;
      if (type === 'audio_error') out.audioError = rest;
      else if (type === 'done') out.timings = rest.timings;
      else Object.assign(out, rest);
    }
    res.json(out);
  }));

  app.get(`${base}/sting`, handle(async (_req, res) => {
    const m = mode();
    const id = sha('sfx', STING_PROMPT, STING_SECONDS, SETTINGS_VERSION);
    if (m === 'live') {
      if (!store.has('sfx', id)) {
        try {
          await store.once(`sfx-${id}`, async () => {
            const ticket = store.reserve(STING_PROMPT.length, 'sfx');
            try {
              const buf = await eleven.sfx({ text: STING_PROMPT, durationSeconds: STING_SECONDS, promptInfluence: 0.6 });
              store.write('sfx', id, buf);
              ticket.commit();
            } catch (e) {
              ticket.release();
              throw e;
            }
          });
        } catch (e) {
          log.warn(`sound effects unavailable (${e.message}); serving the built-in chime`);
        }
      }
      if (store.has('sfx', id)) return sendClip(res, { file: store.file('sfx', id), cached: true, chars: STING_PROMPT.length, mode: 'live', model: 'eleven_text_to_sound_v2' });
    }
    if (!store.has('chime', id, 'wav')) store.write('chime', id, chimeWav(), 'wav');
    sendClip(res, { file: store.file('chime', id, 'wav'), cached: true, chars: 0, mode: m === 'live' ? 'fallback' : 'mock', model: 'built-in chime' });
  }));

  app.get(`${base}/audio/:name`, (req, res) => {
    const m = /^(tts|mock-tts|sfx|chime)-([a-f0-9]{32})\.(mp3|wav)$/.exec(String(req.params.name));
    if (!m) return sendError(res, new HttpError(404, 'not_found', 'Clip not found'));
    const [, kind, id, ext] = m;
    if (!store.has(kind, id, ext)) return sendError(res, new HttpError(404, 'not_found', 'Clip not found'));
    sendClip(res, { file: store.file(kind, id, ext), cached: true, chars: 0, mode: kind.startsWith('mock') ? 'mock' : 'live', model: '' });
  });

  app.get(`${base}/ui.js`, (_req, res) => {
    res.type('text/javascript').sendFile('ui.js', { root: HERE, maxAge: 0, dotfiles: 'deny' });
  });

  // ---------------------------------------------------------------- warm-up (opt-in) and handle
  if (opt.prewarm === true) {
    nemotron.prewarm().then((ok) => {
      if (!ok) return;
      // prime Ollama's prompt cache with the default context so the first spoken answer is quick
      answerQuestion({ question: 'Is the host contained?', context: buildIncidentContext(defaultStage), lang: 'en', nemotron, log }).catch(() => {});
    });
  }
  const whyMock = forceMock ? ' (CLAURA_VOICE_MOCK is set; mock audio)' : ` (no ELEVENLABS_API_KEY in ${envFilePath()}; mock audio)`;
  log.info(`voice ready: ${mode()} mode, base ${base}, characters used ${store.usage().charsUsed}/${store.budget}${eleven ? '' : whyMock}`);

  return {
    name: 'voice',
    base,
    mode,
    store,
    ledger,
    nemotron,
    models,
    api: { speak, transcribe, ask: askPipeline, brief: briefs.build, answer: (question, o = {}) => answerQuestion({ question, context: o.context ?? buildIncidentContext(o.stage ?? defaultStage), lang: o.lang ?? 'en', nemotron, log }) },
    usage: () => store.usage(),
    close() { /* nothing long-lived to stop; the cache and usage ledger live on disk */ },
  };
}

export { loadEnv };
export default mount;
