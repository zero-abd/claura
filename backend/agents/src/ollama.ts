// Minimal Ollama /api/chat client with tool calling. No SDK: one fetch.
//
// Settings that matter for NVIDIA Nemotron 3 Nano 4B (verified against the
// local model): "think": false (otherwise it spends the token budget on a
// reasoning trace), temperature 0 for repeatable tool choices, and a long
// keep_alive so the demo never pays a cold-load penalty mid-incident.

import { MODEL, OLLAMA_URL } from './config.ts';
import type { ObjectSchema } from './schema.ts';

export interface ToolCall {
  id?: string;
  function: { name: string; arguments: unknown };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  /** For role "tool": which tool produced this result. */
  tool_name?: string;
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: ObjectSchema };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  timeoutMs?: number;
}

export interface ChatResult {
  message: ChatMessage;
  durationMs: number;
  promptTokens: number;
  evalTokens: number;
  doneReason: string;
}

/** Anything that can answer a chat turn. Tests substitute a scripted fake. */
export interface LlmClient {
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class OllamaError extends Error {
  constructor(msg: string, readonly retryable: boolean) {
    super(msg);
  }
}

export class OllamaClient implements LlmClient {
  constructor(
    readonly model: string = MODEL,
    private readonly baseUrl: string = OLLAMA_URL,
    private readonly defaults: { numCtx: number; numPredict: number; keepAlive: string } = {
      numCtx: 8192,
      numPredict: 900,
      keepAlive: '30m',
    },
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: req.messages,
      stream: false,
      think: false,
      keep_alive: this.defaults.keepAlive,
      options: { temperature: 0, seed: 7, num_ctx: this.defaults.numCtx, num_predict: this.defaults.numPredict },
    };
    if (req.tools && req.tools.length) body.tools = req.tools;

    const t0 = performance.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
      });
    } catch (e) {
      const err = e as Error;
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      throw new OllamaError(
        timedOut ? `Ollama request timed out after ${req.timeoutMs ?? 60_000} ms` : `Ollama unreachable at ${this.baseUrl}: ${err.message}`,
        true,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      throw new OllamaError(`Ollama HTTP ${res.status}: ${text.slice(0, 300)}`, res.status >= 500);
    }
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new OllamaError(`Ollama returned non-JSON: ${text.slice(0, 200)}`, true);
    }
    const m = json.message ?? {};
    const message: ChatMessage = {
      role: 'assistant',
      content: typeof m.content === 'string' ? m.content : '',
      ...(Array.isArray(m.tool_calls) && m.tool_calls.length ? { tool_calls: m.tool_calls as ToolCall[] } : {}),
    };
    return {
      message,
      durationMs: performance.now() - t0,
      promptTokens: Number(json.prompt_eval_count ?? 0),
      evalTokens: Number(json.eval_count ?? 0),
      doneReason: String(json.done_reason ?? ''),
    };
  }
}

/** Is Ollama up and does it have the model? Loads it into memory as a side effect. */
export async function preflight(
  client: LlmClient,
  baseUrl: string = OLLAMA_URL,
): Promise<{ ok: true; warmMs: number } | { ok: false; reason: string }> {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ok: false, reason: `Ollama /api/tags returned HTTP ${r.status}` };
    const tags = (await r.json()) as { models?: Array<{ name: string }> };
    if (!tags.models?.some(m => m.name === client.model)) {
      return { ok: false, reason: `model ${client.model} is not installed in Ollama` };
    }
  } catch (e) {
    return { ok: false, reason: `Ollama not reachable at ${baseUrl}: ${(e as Error).message}` };
  }
  try {
    const t0 = performance.now();
    await client.chat({ messages: [{ role: 'user', content: 'ok' }], timeoutMs: 120_000 });
    return { ok: true, warmMs: performance.now() - t0 };
  } catch (e) {
    return { ok: false, reason: `model warm-up failed: ${(e as Error).message}` };
  }
}
