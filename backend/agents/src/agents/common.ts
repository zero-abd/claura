import { FALLBACK_LABEL, MODEL_LABEL, SCRIPTED_LABEL, type RunOptions } from '../config.ts';
import type { Logger } from '../log.ts';
import type { LlmClient } from '../ollama.ts';
import type { Marks } from '../timeline.ts';
import { runToolLoop, type Tool, type LoopResult } from '../toolLoop.ts';
import type { AgentName, ClauraDb } from '../types.ts';
import { clip, errMsg, sleep } from '../util.ts';

export interface Env {
  db: ClauraDb;
  log: Logger;
  opts: RunOptions;
  marks: Marks;
  /** null when running --scripted or when Ollama/the model is unavailable. */
  llm: LlmClient | null;
  /** Why llm is null (when it is not --scripted). */
  modelUnavailable?: string;
}

/** How an agent actually got its work done, reported in the final summary. */
export type Mode = 'model' | 'model+fallback' | 'fallback' | 'scripted';

export interface AgentOutcome {
  agent: AgentName;
  mode: Mode;
  steps: number;
  toolCalls: number;
  malformed: number;
  llmMs: number;
  evalTokens: number;
  note: string;
}

export interface AgentSpec {
  name: AgentName;
  system: string;
  user: string;
  tools: Tool[];
  maxSteps: number;
  maxToolCalls: number;
  deadlineMs: number;
  /** Objective completion check against backend state. */
  isDone: () => boolean;
  nudge: string;
  /** See LoopConfig.allowFinalTurn. */
  allowFinalTurn?: boolean;
  startStatus: string;
  startThought: string;
  /**
   * Deterministic, IDEMPOTENT completion of whatever is still missing. Used by
   * --scripted (everything missing), and as the fallback after a model failure
   * (only the remainder). `pace` is true in --scripted so a dashboard is watchable.
   */
  deterministic: (pace: () => Promise<void>) => Promise<void>;
}

export type ModelLabelKind = 'model' | 'scripted' | 'fallback';
export const labelFor = (k: ModelLabelKind) =>
  k === 'model' ? MODEL_LABEL : k === 'scripted' ? SCRIPTED_LABEL : FALLBACK_LABEL;

/** Update agent_state (the dashboard's live thought). Never throws. */
export async function setState(
  env: Env,
  agent: AgentName,
  status: string,
  thought: string,
  label: ModelLabelKind,
): Promise<void> {
  try {
    await env.db.setAgentState(agent, status, clip(thought, 400), labelFor(label));
    env.log.info(agent, `[${status}] ${clip(thought, 220)}`);
  } catch (e) {
    env.log.warn(agent, `set_agent_state failed: ${errMsg(e)}`);
  }
}

/**
 * Run one agent: Nemotron loop first, deterministic fallback if the loop does
 * not complete, canned script when --scripted. Always leaves isDone() true or throws.
 */
export async function runAgent(env: Env, spec: AgentSpec): Promise<AgentOutcome> {
  const { name, log } = { name: spec.name, log: env.log };
  const base = { agent: name, steps: 0, toolCalls: 0, malformed: 0, llmMs: 0, evalTokens: 0 };
  const pace = async () => { if (env.opts.scripted && env.opts.paceMs > 0) await sleep(env.opts.paceMs); };

  // ---- scripted: no model at all -----------------------------------------
  if (env.opts.scripted) {
    await setState(env, name, spec.startStatus, spec.startThought, 'scripted');
    await spec.deterministic(pace);
    mustBeDone(spec);
    return { ...base, mode: 'scripted', note: 'canned text, no model' };
  }

  // ---- model unavailable: whole agent is fallback ------------------------
  if (!env.llm) {
    log.warn(name, `FALLBACK: model unavailable (${env.modelUnavailable ?? 'unknown'}); using deterministic routine`);
    await setState(env, name, spec.startStatus, spec.startThought, 'fallback');
    await spec.deterministic(async () => {});
    mustBeDone(spec);
    return { ...base, mode: 'fallback', note: `model unavailable: ${env.modelUnavailable}` };
  }

  // ---- Nemotron drives the tools ----------------------------------------
  await setState(env, name, spec.startStatus, spec.startThought, 'model');
  let loop: LoopResult;
  try {
    loop = await runToolLoop({
      llm: env.llm,
      system: spec.system,
      user: spec.user,
      tools: spec.tools,
      maxSteps: spec.maxSteps,
      maxToolCalls: spec.maxToolCalls,
      isDone: spec.isDone,
      nudge: spec.nudge,
      allowFinalTurn: spec.allowFinalTurn,
      deadlineMs: spec.deadlineMs,
      llmTimeoutMs: env.opts.llmTimeoutMs,
      log: { debug: t => log.debug(name, t), warn: t => log.warn(name, t) },
      hooks: {
        onModelTurn: async ({ content }) => {
          // Nemotron with think:false often emits tool calls with empty text; only real prose counts as a thought.
          if (content.length > 12) await setState(env, name, spec.startStatus, content, 'model');
        },
        onToolStart: async (tool, args) => {
          if (tool.thought) await setState(env, name, spec.startStatus, tool.thought(args), 'model');
        },
      },
    });
  } catch (e) {
    // The loop itself should never throw; treat it as a failed run if it does.
    loop = {
      completed: false, reason: 'llm_error', detail: errMsg(e), steps: 0, calls: [],
      finalText: '', llmMs: 0, promptTokens: 0, evalTokens: 0, malformed: 0,
    };
  }

  const executed = loop.calls.filter(c => c.ok && !c.duplicate).length;
  const stats = {
    ...base, steps: loop.steps, toolCalls: loop.calls.length, malformed: loop.malformed,
    llmMs: loop.llmMs, evalTokens: loop.evalTokens,
  };
  if (loop.completed && spec.isDone()) {
    log.ok(name, `model completed in ${loop.steps} turn(s), ${loop.calls.length} tool call(s), ${Math.round(loop.llmMs)} ms model time`);
    return { ...stats, mode: 'model', note: `${loop.steps} turns, ${loop.evalTokens} tokens generated` };
  }

  log.warn(name, `FALLBACK: model loop ended with "${loop.reason}" (${loop.detail}); deterministic routine completes the rest`);
  await setState(env, name, spec.startStatus, 'Model run incomplete; completing with the deterministic routine.', 'fallback');
  await spec.deterministic(async () => {});
  mustBeDone(spec);
  return {
    ...stats,
    mode: executed > 0 ? 'model+fallback' : 'fallback',
    note: `fallback after "${loop.reason}": ${loop.detail}`,
  };
}

function mustBeDone(spec: AgentSpec) {
  if (!spec.isDone()) throw new Error(`${spec.name}: backend state still incomplete after the deterministic routine`);
}
