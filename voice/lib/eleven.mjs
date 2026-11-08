// Minimal ElevenLabs REST client: text to speech, speech to text (Scribe), sound effects, and the free account reads.
// The API key is only ever placed in the xi-api-key request header. It is never logged and never sent to a browser.

const BASE = 'https://api.elevenlabs.io';

export const MODELS = {
  live: 'eleven_flash_v2_5', // low latency: spoken answers
  brief: 'eleven_multilingual_v2', // quality + multilingual: the War Room brief
  stt: 'scribe_v1',
};
const ALIASES = { flash: MODELS.live, turbo: 'eleven_turbo_v2_5', multilingual: MODELS.brief, live: MODELS.live, brief: MODELS.brief };
const LANGUAGE_CODE_MODELS = new Set(['eleven_flash_v2_5', 'eleven_turbo_v2_5']); // models that accept language_code
export const resolveModel = (m, fallback = MODELS.live) => ALIASES[m] ?? (typeof m === 'string' && /^eleven_[a-z0-9_]+$/.test(m) ? m : fallback);

export const DEFAULT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };

// Voices to prefer (premade, available on every account). First match on the account wins.
export const VOICE_PREFERENCE = ['Sarah', 'Alice', 'Matilda', 'Daniel', 'George', 'Eric'];
export const FALLBACK_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah, premade

export class ElevenError extends Error {
  constructor(status, code, message, kind) {
    super(message);
    this.name = 'ElevenError';
    this.status = status;
    this.code = code;
    this.kind = kind; // auth | permission | quota | rate | not_found | bad_request | server | network | timeout
  }
}

function toError(status, text) {
  let code = '';
  let message = '';
  try {
    const j = JSON.parse(text);
    const d = j.detail ?? j;
    if (typeof d === 'string') message = d;
    else if (Array.isArray(d)) message = d.map((x) => x.msg || JSON.stringify(x)).join('; ');
    else {
      code = d.status || d.code || '';
      message = d.message || '';
    }
  } catch {
    message = String(text).slice(0, 200);
  }
  const hay = `${code} ${message}`.toLowerCase();
  let kind = 'bad_request';
  if (status === 401 && /missing_permissions|permission/.test(hay)) kind = 'permission';
  else if (status === 401) kind = 'auth';
  else if (status === 403) kind = 'permission';
  else if (status === 402 || /quota|credits|character_limit/.test(hay)) kind = 'quota';
  else if (status === 429) kind = 'rate';
  else if (status === 404) kind = 'not_found';
  else if (status >= 500) kind = 'server';
  return new ElevenError(status, code, message || `ElevenLabs HTTP ${status}`, kind);
}

const EXT = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'video/mp4': 'mp4' };
export const extFor = (mime) => EXT[String(mime).split(';')[0].trim().toLowerCase()] ?? 'bin';

export function createEleven({ apiKey, log, baseUrl = BASE, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is missing');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function call(path, { method = 'GET', json, form, timeout = 30000, accept = 'application/json', retries = 1 } = {}) {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeout);
      try {
        const headers = { 'xi-api-key': apiKey, accept };
        let body;
        if (json !== undefined) {
          headers['content-type'] = 'application/json';
          body = JSON.stringify(json);
        } else if (form) body = form;
        const res = await fetchImpl(baseUrl + path, { method, headers, body, signal: ac.signal });
        if (!res.ok) throw toError(res.status, await res.text().catch(() => ''));
        return res;
      } catch (e) {
        if (e instanceof ElevenError) last = e;
        else if (e?.name === 'AbortError') last = new ElevenError(0, 'timeout', `ElevenLabs request timed out after ${timeout} ms`, 'timeout');
        else last = new ElevenError(0, 'network', `ElevenLabs unreachable: ${e?.cause?.code || e?.message || 'network error'}`, 'network');
        const retryable = ['server', 'rate', 'network', 'timeout'].includes(last.kind);
        if (!retryable || attempt === retries) break;
        log?.warn?.(`elevenlabs ${path.split('?')[0]} failed (${last.kind}), retrying`);
        await sleep(last.kind === 'rate' ? 1200 : 500);
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  }

  return {
    /** Text to speech. Returns the MP3 bytes. */
    async tts({ text, voiceId, modelId = MODELS.live, languageCode, outputFormat = 'mp3_44100_128', voiceSettings, timeout = 40000 }) {
      const body = { text, model_id: modelId, voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...voiceSettings } };
      if (languageCode && LANGUAGE_CODE_MODELS.has(modelId)) body.language_code = languageCode;
      const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`, { method: 'POST', json: body, accept: 'audio/mpeg', timeout });
      return Buffer.from(await res.arrayBuffer());
    },

    /** Speech to text with Scribe. */
    async stt({ buffer, mime = 'audio/webm', modelId = MODELS.stt, languageCode, timeout = 60000 }) {
      const form = new FormData();
      form.append('model_id', modelId);
      form.append('tag_audio_events', 'false');
      form.append('diarize', 'false');
      if (languageCode) form.append('language_code', languageCode);
      const type = String(mime).split(';')[0].trim() || 'application/octet-stream';
      form.append('file', new Blob([buffer], { type }), `speech.${extFor(type)}`);
      const res = await call('/v1/speech-to-text', { method: 'POST', form, timeout, retries: 0 });
      const j = await res.json();
      return { text: String(j.text ?? '').trim(), languageCode: j.language_code ?? null, languageProbability: j.language_probability ?? null };
    },

    /** Sound effects (the alert sting). */
    async sfx({ text, durationSeconds = 1.6, promptInfluence = 0.6, outputFormat = 'mp3_44100_128', timeout = 45000 }) {
      const res = await call(`/v1/sound-generation?output_format=${outputFormat}`, {
        method: 'POST',
        json: { text, duration_seconds: durationSeconds, prompt_influence: promptInfluence },
        accept: 'audio/mpeg',
        timeout,
      });
      return Buffer.from(await res.arrayBuffer());
    },

    // Free reads (no characters spent).
    async voices() {
      const j = await (await call('/v1/voices', { timeout: 15000 })).json();
      return (j.voices ?? []).map((v) => ({ id: v.voice_id, name: String(v.name ?? '').split(' - ')[0], label: v.name, category: v.category }));
    },
    async models() {
      const j = await (await call('/v1/models', { timeout: 15000 })).json();
      return (Array.isArray(j) ? j : []).map((m) => ({ id: m.model_id, tts: !!m.can_do_text_to_speech }));
    },
    async subscription() {
      const j = await (await call('/v1/user/subscription', { timeout: 15000 })).json();
      return { tier: j.tier, used: j.character_count, limit: j.character_limit };
    },
  };
}

/** Pick the default voice: explicit id, else the first preferred premade name on the account, else Sarah's id. */
export function pickVoice(voices, preferred = VOICE_PREFERENCE) {
  for (const name of preferred) {
    const v = voices.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (v) return v;
  }
  return voices[0] ?? { id: FALLBACK_VOICE_ID, name: 'Sarah' };
}
