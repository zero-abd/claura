// The multi-step, tool-using agent loop that Nemotron drives.
//
// Guardrails (all enforced here, none of them rely on the model behaving):
//  - maxSteps (model turns) and maxToolCalls (executed calls) per agent
//  - an overall wall-clock deadline and a per-call model timeout
//  - every tool call is parsed + validated against the tool's JSON schema;
//    a malformed call is fed back as an error and the model gets ONE retry,
//    a second consecutive malformed turn aborts the loop (caller falls back)
//  - identical repeated calls are not re-executed (stall detection)
//  - completion is judged by `isDone()` (backend state), never by what the
//    model says about itself
//
// The loop never throws for model/tool problems; it returns a LoopResult whose
// `completed` flag tells the caller whether to run its deterministic fallback.

import type { ChatMessage, LlmClient, ToolCall, ToolSpec } from './ollama.ts';
import { OllamaError } from './ollama.ts';
import { validateArgs, type ObjectSchema } from './schema.ts';
import { clip, errMsg, j } from './util.ts';

export interface Tool {
  name: string;
  description: string;
  parameters: ObjectSchema;
  /** One line used as the agent's live "thought" when the model picks this tool. */
  thought?: (args: Record<string, unknown>) => string;
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface LoopLog {
  debug(text: string): void;
  warn(text: string): void;
}

export interface LoopHooks {
  onModelTurn?(info: { step: number; content: string; toolNames: string[]; ms: number }): void | Promise<void>;
  onToolStart?(tool: Tool, args: Record<string, unknown>): void | Promise<void>;
  onToolEnd?(tool: Tool, args: Record<string, unknown>, outcome: { ok: boolean; result?: unknown; error?: string }): void | Promise<void>;
}

export interface LoopConfig {
  llm: LlmClient;
  system: string;
  user: string;
  tools: Tool[];
  maxSteps: number;
  maxToolCalls: number;
  /** Objective completion check against backend state. */
  isDone: () => boolean;
  /** Sent as a user message when the model stops talking without being done. */
  nudge: string;
  /**
   * When isDone() becomes true after a tool batch, give the model ONE more
   * neutral turn (no nudge) instead of stopping at once. Lets the model say it
   * is finished, and gives it a fair chance to propose anything else on its own.
   */
  allowFinalTurn?: boolean;
  deadlineMs?: number;
  llmTimeoutMs?: number;
  hooks?: LoopHooks;
  log?: LoopLog;
}

export type LoopReason =
  | 'done' | 'max_steps' | 'max_tool_calls' | 'no_tool_calls'
  | 'malformed' | 'llm_error' | 'deadline' | 'stalled';

export interface CallRecord {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
  duplicate?: boolean;
}

export interface LoopResult {
  completed: boolean;
  reason: LoopReason;
  detail: string;
  steps: number;
  calls: CallRecord[];
  finalText: string;
  llmMs: number;
  promptTokens: number;
  evalTokens: number;
  malformed: number;
}

const MAX_CALLS_PER_TURN = 8;
const MAX_RESULT_CHARS = 6000;

export function toolSpecs(tools: Tool[]): ToolSpec[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function runToolLoop(cfg: LoopConfig): Promise<LoopResult> {
  const log: LoopLog = cfg.log ?? { debug() {}, warn() {} };
  const specs = toolSpecs(cfg.tools);
  const byName = new Map(cfg.tools.map(t => [t.name, t]));
  const messages: ChatMessage[] = [
    { role: 'system', content: cfg.system },
    { role: 'user', content: cfg.user },
  ];
  const started = Date.now();
  const res: LoopResult = {
    completed: false, reason: 'max_steps', detail: '', steps: 0, calls: [], finalText: '',
    llmMs: 0, promptTokens: 0, evalTokens: 0, malformed: 0,
  };
  const seen = new Map<string, unknown>();
  let malformedStreak = 0;
  let stalls = 0;
  let nudges = 0;
  let executed = 0;
  let finalTurnTaken = false;

  const finish = (reason: LoopReason, detail: string): LoopResult => {
    res.reason = reason;
    res.detail = detail;
    res.completed = reason === 'done';
    return res;
  };

  for (let step = 1; step <= cfg.maxSteps; step++) {
    const remaining = cfg.deadlineMs ? cfg.deadlineMs - (Date.now() - started) : Infinity;
    if (remaining <= 0) return finish('deadline', `agent deadline of ${cfg.deadlineMs} ms exceeded`);
    res.steps = step;

    // ---- model turn (one retry on a transient error) -----------------------
    let turn;
    for (let attempt = 1; ; attempt++) {
      try {
        turn = await cfg.llm.chat({
          messages,
          tools: specs,
          timeoutMs: Math.min(cfg.llmTimeoutMs ?? 60_000, Math.max(1000, remaining)),
        });
        break;
      } catch (e) {
        const retryable = e instanceof OllamaError ? e.retryable : true;
        log.warn(`model call failed (attempt ${attempt}): ${errMsg(e)}`);
        if (attempt >= 2 || !retryable) return finish('llm_error', errMsg(e));
        await new Promise(r => setTimeout(r, 400));
      }
    }
    res.llmMs += turn.durationMs;
    res.promptTokens += turn.promptTokens;
    res.evalTokens += turn.evalTokens;

    const msg = turn.message;
    messages.push(msg);
    const content = (msg.content ?? '').trim();
    const calls: ToolCall[] = (msg.tool_calls ?? []).slice(0, MAX_CALLS_PER_TURN);
    if (content) res.finalText = content;
    log.debug(`turn ${step} (${Math.round(turn.durationMs)} ms, ${turn.evalTokens} tok): ${content ? clip(content, 200) : '(no text)'} | calls: ${calls.map(c => c.function.name).join(', ') || 'none'}`);
    await cfg.hooks?.onModelTurn?.({ step, content, toolNames: calls.map(c => c.function.name), ms: turn.durationMs });

    // ---- no tool calls: either finished or needs a nudge -------------------
    if (calls.length === 0) {
      if (cfg.isDone()) return finish('done', 'model finished and backend state is complete');
      if (nudges < 2) {
        nudges++;
        messages.push({ role: 'user', content: cfg.nudge });
        continue;
      }
      return finish('no_tool_calls', 'model stopped calling tools before the task was complete');
    }

    // ---- execute the batch -------------------------------------------------
    let good = 0;
    let bad = 0;
    for (const call of calls) {
      const name = call.function?.name ?? '';
      const tool = byName.get(name);
      const pushTool = (payload: unknown) =>
        messages.push({ role: 'tool', tool_name: name, content: clip2(j(payload)) });

      if (!tool) {
        bad++; res.malformed++;
        const error = `unknown tool "${name}". Available tools: ${cfg.tools.map(t => t.name).join(', ')}`;
        res.calls.push({ tool: name, args: {}, ok: false, error });
        pushTool({ error });
        log.warn(error);
        continue;
      }
      const v = validateArgs(tool.parameters, call.function.arguments);
      if (!v.ok) {
        bad++; res.malformed++;
        const error = `invalid arguments for ${name}: ${v.error}. Fix the arguments and call ${name} again.`;
        res.calls.push({ tool: name, args: asObj(call.function.arguments), ok: false, error });
        pushTool({ error });
        log.warn(error);
        continue;
      }
      const args = v.value;
      const key = `${name}:${j(args)}`;
      if (seen.has(key)) {
        stalls++;
        res.calls.push({ tool: name, args, ok: true, duplicate: true, result: seen.get(key) });
        pushTool({
          duplicate: true,
          note: 'You already made this exact call and its result is above. Do not repeat it. Do the next step, or finish.',
        });
        continue;
      }
      if (executed >= cfg.maxToolCalls) return finish('max_tool_calls', `reached ${cfg.maxToolCalls} tool calls`);
      executed++;
      good++;
      await cfg.hooks?.onToolStart?.(tool, args);
      try {
        const result = await tool.run(args);
        seen.set(key, result);
        res.calls.push({ tool: name, args, ok: true, result });
        pushTool(result);
        log.debug(`tool ${name}(${clip(j(args), 160)}) -> ${clip(j(result), 240)}`);
        await cfg.hooks?.onToolEnd?.(tool, args, { ok: true, result });
      } catch (e) {
        const error = errMsg(e);
        seen.set(key, { error });
        res.calls.push({ tool: name, args, ok: false, error });
        pushTool({ error });
        log.warn(`tool ${name} failed: ${error}`);
        await cfg.hooks?.onToolEnd?.(tool, args, { ok: false, error });
      }
    }

    if (good === 0 && bad > 0) malformedStreak++;
    else if (good > 0) malformedStreak = 0;
    if (cfg.isDone()) {
      if (!cfg.allowFinalTurn || finalTurnTaken) return finish('done', 'backend state complete');
      finalTurnTaken = true; // one more neutral turn, then stop
    }
    // Original attempt + one retry both malformed => give up and let the caller fall back.
    if (malformedStreak >= 2) return finish('malformed', 'model produced malformed tool calls twice in a row');
    if (res.malformed >= 4) return finish('malformed', `${res.malformed} malformed tool calls in total`);
    if (stalls >= 3) return finish('stalled', 'model kept repeating identical tool calls');
  }
  return finish('max_steps', `reached ${cfg.maxSteps} model turns without completing`);
}

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return { raw: typeof v === 'string' ? v : j(v) };
}

function clip2(s: string): string {
  return s.length <= MAX_RESULT_CHARS ? s : s.slice(0, MAX_RESULT_CHARS) + '…(truncated)';
}
