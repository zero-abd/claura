import type { ChatMessage, ChatRequest, ChatResult, LlmClient, ToolCall } from '../src/ollama.ts';
import { OllamaError } from '../src/ollama.ts';

export const call = (name: string, args: unknown): ToolCall => ({ function: { name, arguments: args } });

export type FakeTurn =
  | { content?: string; calls?: ToolCall[] }
  | { error: string; retryable?: boolean };

/** Plays back a fixed list of assistant turns; records every request it receives. */
export class ScriptedLlm implements LlmClient {
  readonly model = 'fake';
  readonly requests: ChatRequest[] = [];
  private i = 0;
  constructor(private readonly turns: FakeTurn[], private readonly onExhausted: FakeTurn = { content: 'done' }) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.requests.push({ ...req, messages: [...req.messages] });
    const t = this.turns[this.i++] ?? this.onExhausted;
    if ('error' in t) throw new OllamaError(t.error, t.retryable ?? true);
    const message: ChatMessage = {
      role: 'assistant',
      content: t.content ?? '',
      ...(t.calls?.length ? { tool_calls: t.calls } : {}),
    };
    return { message, durationMs: 1, promptTokens: 10, evalTokens: 5, doneReason: 'stop' };
  }
  get turnsUsed() { return this.i; }
}

/** Dispatches by which agent's system prompt it sees, so one fake can drive the whole demo. */
export class AgentFakeLlm implements LlmClient {
  readonly model = 'fake-agents';
  constructor(private readonly handlers: Partial<Record<'sentry' | 'triage' | 'warden' | 'scribe', (req: ChatRequest) => FakeTurn>>) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    const sys = req.messages[0]?.content ?? '';
    const who = (['sentry', 'triage', 'warden', 'scribe'] as const).find(a => sys.startsWith(`You are ${a[0]!.toUpperCase()}${a.slice(1)},`));
    const h = who && this.handlers[who];
    const t: FakeTurn = h ? h(req) : { content: 'I have nothing to do.' };
    if ('error' in t) throw new OllamaError(t.error, t.retryable ?? true);
    const message: ChatMessage = { role: 'assistant', content: t.content ?? '', ...(t.calls?.length ? { tool_calls: t.calls } : {}) };
    return { message, durationMs: 1, promptTokens: 10, evalTokens: 5, doneReason: 'stop' };
  }
}

export const toolMsgs = (req: ChatRequest) => req.messages.filter(m => m.role === 'tool');
