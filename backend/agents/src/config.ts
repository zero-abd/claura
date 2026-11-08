// Central configuration + CLI parsing. No third-party arg parser needed.
//
// Backend selection and credentials come from CLAURA_* variables. They are read from the process
// environment first and then from an env file (default ~/.config/claura/.env, mode 0600). Only keys that
// start with CLAURA_ are taken from the file, and values are never printed.
//
//   CLAURA_STDB_URI       wss://maincloud.spacetimedb.com   (default ws://127.0.0.1:3000)
//   CLAURA_STDB_DB        claura                            (default claura)
//   CLAURA_AGENT_CODE     one-time enrollment code for the runner (role agent), used on first connect
//   CLAURA_APPROVER_CODE  one-time code for the labelled test-harness approver (role commander), only for --auto-approve-after
//   CLAURA_TOKEN_FILE     where identity tokens are kept (default ~/.config/claura/agent-token)
//   CLAURA_ENV_FILE       which env file to read (default ~/.config/claura/.env; --local reads local.env)

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MODEL = process.env.OLLAMA_MODEL ?? 'nemotron-3-nano:4b';
/** Written into agent_state.model so the dashboard can say where the model runs. */
export const MODEL_LABEL = 'nemotron-3-nano:4b (local, on-prem)';
export const SCRIPTED_LABEL = 'scripted (no model)';
export const FALLBACK_LABEL = 'deterministic fallback (no model output used)';
/** Interim briefs are filled from a template while the model is idle or busy elsewhere. */
export const TEMPLATE_LABEL = 'template text (no model)';
export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export const CONFIG_DIR = join(homedir(), '.config', 'claura');
export const DEFAULT_ENV_FILE = join(CONFIG_DIR, '.env');
export const LOCAL_ENV_FILE = join(CONFIG_DIR, 'local.env');
export const DEFAULT_TOKEN_FILE = join(CONFIG_DIR, 'agent-token');
export const LOCAL_URI = 'ws://127.0.0.1:3000';

/** Name the runner asks for when it enrolls. The admin's name_hint on the code wins over it. */
export const AGENT_NAME = 'Claura agent runner';
/** Name of the second, clearly labelled identity used ONLY for --auto-approve-after. */
export const APPROVER_NAME = 'TEST HARNESS (auto-approve)';

/**
 * Copy CLAURA_* assignments from an env file into process.env without overriding anything already set.
 * Returns the NAMES it set (never values). A missing file is not an error.
 */
export function loadClauraEnv(file: string): string[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const set: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?(CLAURA_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2]!;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]!] === undefined) {
      process.env[m[1]!] = v;
      set.push(m[1]!);
    }
  }
  return set;
}

export interface RunOptions {
  /** No model at all: canned text, same reducer sequence. */
  scripted: boolean;
  /** Use the in-process contract mirror instead of SpacetimeDB (dev/test). */
  mem: boolean;
  uri: string;
  db: string;
  /** Approve quarantine_host through the labelled test-harness identity after N seconds. undefined = wait for a human. */
  autoApproveAfterS?: number;
  /** Give up waiting for approval after N seconds (0 = wait forever). */
  approvalTimeoutS: number;
  /** Red-team step: auto = only if the model did not try a denied action itself. */
  redTeam: 'auto' | 'off';
  /** Scales the telemetry replay schedule (2 = twice as slow). */
  telemetrySpeed: number;
  /** Pause between steps in --scripted so a dashboard can be watched live. */
  paceMs: number;
  /** Print model messages and tool args/results. */
  verbose: boolean;
  /** Per-agent model-call timeout. */
  llmTimeoutMs: number;
  /** Call reset_demo first. Needs an admin identity; the runner is role agent, so this is off by default. */
  reset: boolean;
  /** Where identity tokens are persisted. */
  tokenFile: string;
  /** Env file that was read (informational). */
  envFile: string;
}

export function defaultOptions(): RunOptions {
  return {
    scripted: false,
    mem: false,
    uri: process.env.CLAURA_STDB_URI ?? process.env.STDB_URI ?? LOCAL_URI,
    db: process.env.CLAURA_STDB_DB ?? process.env.STDB_DB ?? 'claura',
    autoApproveAfterS: undefined,
    approvalTimeoutS: 0,
    redTeam: 'auto',
    telemetrySpeed: 1,
    paceMs: 450,
    verbose: false,
    llmTimeoutMs: 60_000,
    reset: false,
    tokenFile: process.env.CLAURA_TOKEN_FILE ?? DEFAULT_TOKEN_FILE,
    envFile: '',
  };
}

export function parseArgs(argv: string[]): RunOptions {
  // `npm run demo -- --scripted` passes args through; tolerate a stray "--".
  const args = argv.filter(a => a !== '--');

  // Pick the profile first: it decides which env file supplies the backend and the codes.
  const local = args.includes('--local');
  let envFile = process.env.CLAURA_ENV_FILE ?? DEFAULT_ENV_FILE;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--env-file' && args[i + 1]) envFile = args[i + 1]!;
    else if (a.startsWith('--env-file=')) envFile = a.slice('--env-file='.length);
  }
  if (local) {
    // The local appliance profile is authoritative: a stray Maincloud setting in the shell must not leak into it.
    if (!args.some(a => a === '--env-file' || a.startsWith('--env-file='))) envFile = LOCAL_ENV_FILE;
    for (const k of ['CLAURA_STDB_URI', 'CLAURA_STDB_DB', 'CLAURA_AGENT_CODE', 'CLAURA_APPROVER_CODE', 'CLAURA_CONSOLE_CODE']) delete process.env[k];
  }
  loadClauraEnv(envFile);

  const o = defaultOptions();
  o.envFile = envFile;
  if (local) {
    o.uri = process.env.CLAURA_STDB_URI ?? LOCAL_URI;
    o.db = process.env.CLAURA_STDB_DB ?? 'claura';
  }
  const takeValue = (i: number, name: string): [string, number] => {
    const a = args[i]!;
    const eq = a.indexOf('=');
    if (eq >= 0) return [a.slice(eq + 1), i];
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
    return [v, i + 1];
  };
  const num = (s: string, name: string): number => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${s}"`);
    return n;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const name = a.split('=')[0]!;
    switch (name) {
      case '--scripted': o.scripted = true; break;
      case '--mem': o.mem = true; break;
      case '--verbose': case '-v': o.verbose = true; break;
      case '--reset': o.reset = true; break;
      case '--no-reset': o.reset = false; break; // accepted for old scripts; this is already the default
      case '--local': break; // handled in the pre-scan above
      case '--env-file': { const [, j] = takeValue(i, name); i = j; break; } // consumed in the pre-scan above
      case '--auto-approve-after': { const [v, j] = takeValue(i, name); o.autoApproveAfterS = num(v, name); i = j; break; }
      case '--approval-timeout': { const [v, j] = takeValue(i, name); o.approvalTimeoutS = num(v, name); i = j; break; }
      case '--telemetry-speed': { const [v, j] = takeValue(i, name); o.telemetrySpeed = num(v, name) || 1; i = j; break; }
      case '--pace-ms': { const [v, j] = takeValue(i, name); o.paceMs = num(v, name); i = j; break; }
      case '--llm-timeout': { const [v, j] = takeValue(i, name); o.llmTimeoutMs = num(v, name) * 1000; i = j; break; }
      case '--uri': { const [v, j] = takeValue(i, name); o.uri = v; i = j; break; }
      case '--db': { const [v, j] = takeValue(i, name); o.db = v; i = j; break; }
      case '--red-team': {
        const [v, j] = takeValue(i, name);
        if (v !== 'auto' && v !== 'off') throw new Error('--red-team must be auto|off');
        o.redTeam = v; i = j; break;
      }
      case '--help': case '-h': throw new HelpRequested();
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  return o;
}

export class HelpRequested extends Error {}

export const HELP = `Claura agent runner

  npm run demo [-- options]

The runner signs in to SpacetimeDB as an enrolled operator with role "agent" (one-time code on first
connect, token kept in ~/.config/claura/agent-token). It cannot reset the database or approve anything.
Reset first as the database owner:   spacetime call --server <maincloud|local> <db> reset_demo

  --scripted                 no model: canned text, same reducer sequence (live-demo backup)
  --auto-approve-after N     approve quarantine_host after N seconds through a SECOND identity, labelled
                             "${APPROVER_NAME}" (role commander, needs CLAURA_APPROVER_CODE). For tests only
  --approval-timeout S       stop waiting for a human after S seconds (default: wait forever)
  --red-team auto|off        labelled red-team probe of a denied action (default auto:
                             only when the model did not try one itself)
  --local                    use the local appliance profile (~/.config/claura/local.env, ws://127.0.0.1:3000)
  --env-file PATH            read CLAURA_* settings from PATH (default ~/.config/claura/.env)
  --uri wss://host           SpacetimeDB URI   (default env CLAURA_STDB_URI, else ${LOCAL_URI})
  --db NAME                  database name     (default env CLAURA_STDB_DB, else claura)
  --reset                    call reset_demo first (only works if this identity is an admin)
  --mem                      in-process mirror of the contract instead of SpacetimeDB (dev/test)
  --telemetry-speed X        slow the telemetry replay by X
  --pace-ms N                pause between steps in --scripted (default 450)
  --llm-timeout S            per model call timeout in seconds (default 60)
  -v, --verbose              print model messages and tool args/results
`;
