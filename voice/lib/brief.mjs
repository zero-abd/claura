// The spoken War Room brief.
//
// Accepts whatever the console can give us: a plain string, {text}, or Scribe's structured brief
// ({happened, contained, impact, need, know[], dont[]} - the shape the War Room renders). Output is a spoken script
// (with sections for captions) in the requested language.
//
// Translation, in order of trust:
//   1. the verified phrase table (every string the console ships, es/fr/hi/zh)   -> translation: "table"
//   2. a cached earlier machine translation                                       -> "cache"
//   3. the local Nemotron model, batched, then cached                             -> "nemotron" (machine translation)
//   4. otherwise the English text is spoken as is                                 -> "none"

import { LABELS, LANGS, lookupPhrase } from './phrases.mjs';
import { sha } from './store.mjs';

export function normalizeBrief(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') {
    const t = input.trim();
    return t ? { kind: 'text', text: t } : null;
  }
  if (typeof input !== 'object') return null;
  const str = (k) => (typeof input[k] === 'string' ? input[k].trim() : '');
  const arr = (k) => (Array.isArray(input[k]) ? input[k].map((x) => String(x).trim()).filter(Boolean) : []);
  const structured = ['happened', 'contained', 'impact', 'need', 'know', 'dont', 'weKnow', 'weDontKnowYet'].some((k) => input[k] !== undefined);
  if (!structured && typeof input.text === 'string') return input.text.trim() ? { kind: 'text', text: input.text.trim(), lang: input.lang } : null;
  const brief = {
    happened: str('happened'),
    contained: str('contained'),
    impact: str('impact'),
    need: str('need'),
    know: arr('know').length ? arr('know') : arr('weKnow'),
    dont: arr('dont').length ? arr('dont') : arr('weDontKnowYet'),
  };
  if (!brief.happened && !brief.contained && !brief.impact && !brief.need && !brief.know.length && !brief.dont.length) return null;
  return { kind: 'structured', brief, lang: input.lang };
}

// Languages where the 4B model's translation is usable. Hindi is not: unknown lines stay in English instead.
const MODEL_TRANSLATES = new Set(['es', 'fr', 'zh']);
const KEEP_NAMES = 'Claura, Sentry, Triage, Warden, Scribe, SpacetimeDB, Nemotron, ElevenLabs';
const GLOSSARY = 'Glossary: guest = a virtual machine on a host; host = the physical server; cordon = stop new work landing on the host; quarantine = take the host out of service; failover = restart on a clean host; war room = out-of-band crisis channel; break-glass = emergency sign-in.';

const END = { zh: '。', hi: '।' };
const stop = (t, lang) => (t && !/[.!?。！？।]$/.test(t) ? t + (END[lang] ?? '.') : t);

export function createBriefBuilder({ nemotron, store, log }) {
  /** Translate English strings into `lang`. Returns [{ text, via }] aligned with the input. */
  async function translateStrings(strings, lang) {
    const out = new Array(strings.length);
    const todo = [];
    strings.forEach((s, i) => {
      const hit = lookupPhrase(s, lang);
      if (hit) return void (out[i] = { text: hit, via: 'table' });
      const cached = store?.readJson('tr', sha('tr', lang, nemotron?.model, s));
      if (cached?.out) return void (out[i] = { text: cached.out, via: 'cache' });
      todo.push(i);
    });
    if (!todo.length) return out;
    if (!nemotron || !MODEL_TRANSLATES.has(lang)) {
      todo.forEach((i) => (out[i] = { text: strings[i], via: 'none' }));
      return out;
    }
    const name = LANGS[lang].name;
    const numbered = todo.map((i, n) => `${n + 1}. ${strings[i]}`).join('\n');
    try {
      const r = await nemotron.chat({
        system: 'You are a precise translator for incident-response communications to non-technical executives.',
        user:
          `Translate each numbered line from English into ${name}. Keep ids, names, initials and numbers exactly as written (for example b14-gpu-07, INC-0419, RK, 9.4, 2,048). ` +
          `Do NOT translate these names: ${KEEP_NAMES}. ${GLOSSARY} ` +
          'Use calm, plain, short sentences. Output ONLY the translations as a numbered list with the same numbering, one per line, nothing else.\n\n' +
          numbered,
        temperature: 0.1,
        maxTokens: 120 + todo.length * 90,
        seed: 5,
        timeout: 60000,
      });
      const lines = new Map();
      for (const m of r.text.matchAll(/^\s*(\d+)\s*[.)、:：]\s*(.+?)\s*$/gm)) lines.set(Number(m[1]), m[2].trim());
      todo.forEach((i, n) => {
        const t = lines.get(n + 1);
        if (t) {
          out[i] = { text: t, via: 'nemotron' };
          store?.writeJson('tr', sha('tr', lang, nemotron.model, strings[i]), { lang, src: strings[i], out: t, model: nemotron.model, at: new Date().toISOString() });
        } else out[i] = { text: strings[i], via: 'none' };
      });
    } catch (e) {
      log?.warn?.(`brief translation to ${lang} unavailable (${e.message}); speaking English for the untranslated lines`);
      todo.forEach((i) => (out[i] = { text: strings[i], via: 'none' }));
    }
    return out;
  }

  /**
   * @param {object|string|null} input  anything normalizeBrief accepts
   * @param {string} lang               en | es | hi | zh | fr
   * @returns {Promise<{lang, sections:{key,label,text}[], text:string, translation:'none'|'table'|'mixed'|'nemotron'}>}
   */
  async function build(input, lang = 'en') {
    const n = normalizeBrief(input);
    if (!n) return null;
    const L = LABELS[lang] ?? LABELS.en;
    const sourceLang = n.lang && LANGS[n.lang] ? n.lang : 'en';
    const needsTranslation = lang !== sourceLang && sourceLang === 'en';
    const vias = new Set();

    const tr = async (strings) => {
      if (!needsTranslation) return strings.map((text) => ({ text, via: 'none' }));
      const r = await translateStrings(strings, lang);
      r.forEach((x) => vias.add(x.via));
      return r;
    };

    const sections = [{ key: 'intro', label: '', text: L.intro }];
    if (n.kind === 'text') {
      const [r] = await tr([n.text]);
      sections.push({ key: 'text', label: '', text: stop(r.text, lang) });
    } else {
      const b = n.brief;
      const flat = [];
      const slots = [];
      for (const k of ['happened', 'contained', 'impact', 'need']) if (b[k]) (slots.push({ key: k }), flat.push(b[k]));
      b.know.forEach((x) => (slots.push({ key: 'know' }), flat.push(x)));
      b.dont.forEach((x) => (slots.push({ key: 'dont' }), flat.push(x)));
      const res = await tr(flat);
      const grouped = { know: [], dont: [] };
      slots.forEach((s, i) => {
        const t = stop(res[i].text, lang);
        if (s.key === 'know' || s.key === 'dont') grouped[s.key].push(t);
        else sections.push({ key: s.key, label: L[s.key], text: t });
      });
      if (grouped.know.length) sections.push({ key: 'know', label: L.know, text: grouped.know.join(' ') });
      if (grouped.dont.length) sections.push({ key: 'dont', label: L.dont, text: grouped.dont.join(' ') });
    }

    const text = sections.map((s) => (s.label ? `${s.label} ${s.text}` : s.text)).join(' ');
    let translation = 'none';
    if (vias.has('nemotron')) translation = vias.has('table') || vias.has('cache') ? 'mixed' : 'nemotron';
    else if (vias.has('cache')) translation = 'mixed';
    else if (vias.has('table') && !vias.has('none')) translation = 'table';
    else if (vias.has('table')) translation = 'mixed';
    return { lang, sections, text, translation };
  }

  return { build, translateStrings };
}
