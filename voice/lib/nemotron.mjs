// Local NVIDIA Nemotron (nemotron-3-nano:4b) through Ollama. Runs on this machine: nothing leaves the building.
// "think": false keeps replies fast and free of reasoning text; temperature 0.2 and a fixed seed keep them stable.

export const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'nemotron-3-nano:4b';

export class NemotronError extends Error {
  constructor(message, kind = 'unavailable') {
    super(message);
    this.name = 'NemotronError';
    this.kind = kind;
  }
}

export function createNemotron({ host = DEFAULT_OLLAMA, model = DEFAULT_MODEL, log, defaultTimeout = 40000 } = {}) {
  const base = String(host).replace(/\/+$/, '');

  async function http(path, { method = 'GET', json, timeout = defaultTimeout, signal } = {}) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    if (signal) signal.addEventListener('abort', () => ac.abort(), { once: true });
    try {
      const res = await fetch(base + path, {
        method,
        headers: json ? { 'content-type': 'application/json' } : undefined,
        body: json ? JSON.stringify(json) : undefined,
        signal: ac.signal,
      });
      if (!res.ok) throw new NemotronError(`Ollama HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`, 'http');
      return res;
    } catch (e) {
      if (e instanceof NemotronError) throw e;
      if (e?.name === 'AbortError') throw new NemotronError(`Ollama timed out after ${timeout} ms`, 'timeout');
      throw new NemotronError(`Ollama unreachable at ${base}: ${e?.cause?.code || e?.message}`, 'unreachable');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    model,
    host: base,

    async status() {
      try {
        const j = await (await http('/api/tags', { timeout: 2500 })).json();
        const names = (j.models ?? []).map((m) => m.name || m.model);
        return { up: true, host: base, model, present: names.includes(model) };
      } catch (e) {
        return { up: false, host: base, model, present: false, error: e.message };
      }
    },

    /** One chat completion. Returns { text, ms }. */
    async chat({ system, user, messages, temperature = 0.2, maxTokens = 160, seed = 7, format, timeout, signal }) {
      const started = Date.now();
      const body = {
        model,
        stream: false,
        think: false,
        keep_alive: '30m',
        messages: messages ?? [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        options: { temperature, num_predict: maxTokens, seed },
      };
      if (format) body.format = format;
      const j = await (await http('/api/chat', { method: 'POST', json: body, timeout, signal })).json();
      return { text: String(j.message?.content ?? '').trim(), ms: Date.now() - started, promptTokens: j.prompt_eval_count ?? null, evalTokens: j.eval_count ?? null };
    },

    /** Load the model into memory so the first spoken answer is fast. Never throws. */
    async prewarm() {
      try {
        const t0 = Date.now();
        await http('/api/chat', {
          method: 'POST',
          json: { model, stream: false, think: false, keep_alive: '30m', messages: [{ role: 'user', content: 'ok' }], options: { num_predict: 1, temperature: 0 } },
          timeout: 120000,
        });
        log?.info?.(`nemotron warm (${Date.now() - t0} ms)`);
        return true;
      } catch (e) {
        log?.warn?.(`nemotron prewarm skipped: ${e.message}`);
        return false;
      }
    },
  };
}
