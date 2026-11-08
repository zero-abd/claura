// The Agents trace's tool-call rows.
//
// The console shows, per agent, "what it called and what came back". Four of the tools already leave a row of their own
// (open_incident -> the incident, record_finding -> a finding, propose_action -> a proposal, file_report / set_brief -> the report
// and the brief), and the console reads those. The READ tools and the quiet writes (list_recent_signals, get_host_inventory,
// check_reachability, record_scope, get_policy, list_events, post_handoff) leave nothing, so without this the trace would not
// show Triage looking at inventory and reachability, which is most of what Triage does.
//
// traced() wraps a tool set so every one of those calls is logged through the module's record_tool_call reducer: tool name, a
// short argument summary, a short result summary and which model produced the call ("model", or the fallback / scripted routine
// that called it instead). It is fire-and-forget and can never fail or slow the tool: a logging problem is a debug line.

import type { Env } from './agents/common.ts';
import { FALLBACK_LABEL, MODEL_LABEL, SCRIPTED_LABEL } from './config.ts';
import type { Tool } from './toolLoop.ts';
import type { AgentName } from './types.ts';
import { clip, errMsg } from './util.ts';

/** Tools whose effect is already a row of its own. The console reads that row, so logging the call too would show it twice. */
export const HAS_OWN_ROW: ReadonlySet<string> = new Set(['open_incident', 'record_finding', 'propose_action', 'file_report', 'set_brief']);

const ARGS_MAX = 300;
const RESULT_MAX = 420;

/** `host=b14-gpu-07, status=exfil_suspected`: scalar arguments, each clipped. */
export function summarizeArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => `${k}=${clip(typeof v === 'string' ? v : JSON.stringify(v) ?? String(v), 60)}`);
  return clip(parts.join(', '), ARGS_MAX);
}

const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

const BY_TOOL: Record<string, (r: unknown) => string | null> = {
  list_recent_signals: r => {
    const o = r as { count?: number; distinct_sources?: number; signals_by_host?: Record<string, number> };
    if (typeof o?.count !== 'number') return null;
    const hosts = Object.keys(o.signals_by_host ?? {});
    return `${o.count} signals from ${o.distinct_sources ?? '?'} sources${hosts.length ? `, ${hosts.slice(0, 3).join(', ')}` : ''}`;
  },
  get_policy: r => {
    if (!Array.isArray(r)) return null;
    const by: Record<string, number> = {};
    for (const p of r as Array<{ mode?: string }>) by[p.mode ?? '?'] = (by[p.mode ?? '?'] ?? 0) + 1;
    return `${r.length} actions: ${Object.entries(by).map(([m, n]) => `${n} ${m}`).join(', ')}`;
  },
  list_events: r => {
    const o = r as { count?: number; events?: unknown[] };
    return typeof o?.count === 'number' ? `${o.count} events in the log (${count(o.events)} read)` : null;
  },
};

/** One line for a tool result. Arrays and nested objects become counts: the row is a pointer to the work, not a copy of it. */
export function summarizeResult(tool: string, result: unknown): string {
  const special = BY_TOOL[tool]?.(result);
  if (special) return clip(special, RESULT_MAX);
  if (result === null || result === undefined) return 'ok';
  if (typeof result !== 'object') return clip(String(result), RESULT_MAX);
  if (Array.isArray(result)) return `${result.length} items`;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) parts.push(`${k}: ${v.length}`);
    else if (typeof v === 'object') continue;
    else parts.push(`${k}=${clip(String(v), 70)}`);
  }
  return clip(parts.join(', ') || 'ok', RESULT_MAX);
}

/** How a call was made: by the model through the tool loop (the default), or by a deterministic routine standing in for it. */
export interface RunHow {
  routine?: boolean;
}

export function labelOf(env: Env, how: RunHow | undefined): string {
  return how?.routine ? (env.opts.scripted ? SCRIPTED_LABEL : FALLBACK_LABEL) : MODEL_LABEL;
}

/** Wrap a tool set so each call (that has no row of its own) is logged for the Agents trace. incident 0n = no incident yet. */
export function traced(env: Env, agent: AgentName, incident: bigint | (() => bigint), tools: Tool[]): Tool[] {
  return tools.map(tool => {
    if (HAS_OWN_ROW.has(tool.name)) return tool;
    const wrapped: Tool = {
      ...tool,
      async run(args, how) {
        const log = (outcome: string) => {
          const id = typeof incident === 'function' ? incident() : incident;
          env.db
            .recordToolCall(id, agent, tool.name, summarizeArgs(args), outcome, labelOf(env, how))
            .catch(e => env.log.debug(agent, `tool-call log skipped: ${errMsg(e)}`));
        };
        try {
          const result = await tool.run(args, how);
          log(summarizeResult(tool.name, result));
          return result;
        } catch (e) {
          log(`error: ${clip(errMsg(e), 200)}`);
          throw e;
        }
      },
    };
    return wrapped;
  });
}
