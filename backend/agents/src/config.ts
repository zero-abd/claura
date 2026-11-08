// Central configuration + CLI parsing. No third-party arg parser needed.

export const MODEL = process.env.OLLAMA_MODEL ?? 'nemotron-3-nano:4b';
/** Written into agent_state.model so the dashboard can say where the model runs. */
export const MODEL_LABEL = 'nemotron-3-nano:4b (local, on-prem)';
export const SCRIPTED_LABEL = 'scripted (no model)';
export const FALLBACK_LABEL = 'deterministic fallback (no model output used)';
export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const STDB_URI = process.env.STDB_URI ?? 'ws://127.0.0.1:3000';
export const STDB_DB = process.env.STDB_DB ?? 'claura';

export interface RunOptions {
  /** No model at all: canned text, same reducer sequence. */
  scripted: boolean;
  /** Use the in-process contract mirror instead of SpacetimeDB (dev/test). */
  mem: boolean;
  uri: string;
  db: string;
  /** Approve quarantine_host as operator "RK" after N seconds. undefined = wait for a human. */
  autoApproveAfterS?: number;
  /** Give up waiting for approval after N seconds (0 = wait forever). */
  approvalTimeoutS: number;
  /** Red-team step: auto = only if the model did not try a denied action itself. */
  redTeam: 'auto' | 'off' | 'force';
  /** Scales the telemetry replay schedule (2 = twice as slow). */
  telemetrySpeed: number;
  /** Pause between steps in --scripted so a dashboard can be watched live. */
  paceMs: number;
  /** Print model messages and tool args/results. */
  verbose: boolean;
  /** Per-agent model-call timeout. */
  llmTimeoutMs: number;
  /** Do not reset_demo first (join an existing state). Rarely useful. */
  noReset: boolean;
}

export function defaultOptions(): RunOptions {
  return {
    scripted: false,
    mem: false,
    uri: STDB_URI,
    db: STDB_DB,
    autoApproveAfterS: undefined,
    approvalTimeoutS: 0,
    redTeam: 'auto',
    telemetrySpeed: 1,
    paceMs: 450,
    verbose: false,
    llmTimeoutMs: 60_000,
    noReset: false,
  };
}

export function parseArgs(argv: string[]): RunOptions {
  const o = defaultOptions();
  // `npm run demo -- --scripted` passes args through; tolerate a stray "--".
  const args = argv.filter(a => a !== '--');
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
      case '--no-reset': o.noReset = true; break;
      case '--auto-approve-after': { const [v, j] = takeValue(i, name); o.autoApproveAfterS = num(v, name); i = j; break; }
      case '--approval-timeout': { const [v, j] = takeValue(i, name); o.approvalTimeoutS = num(v, name); i = j; break; }
      case '--telemetry-speed': { const [v, j] = takeValue(i, name); o.telemetrySpeed = num(v, name) || 1; i = j; break; }
      case '--pace-ms': { const [v, j] = takeValue(i, name); o.paceMs = num(v, name); i = j; break; }
      case '--llm-timeout': { const [v, j] = takeValue(i, name); o.llmTimeoutMs = num(v, name) * 1000; i = j; break; }
      case '--uri': { const [v, j] = takeValue(i, name); o.uri = v; i = j; break; }
      case '--db': { const [v, j] = takeValue(i, name); o.db = v; i = j; break; }
      case '--red-team': {
        const [v, j] = takeValue(i, name);
        if (v !== 'auto' && v !== 'off' && v !== 'force') throw new Error('--red-team must be auto|off|force');
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

  --scripted                 no model: canned text, same reducer sequence (live-demo backup)
  --auto-approve-after N     approve quarantine_host as operator "RK" after N seconds
  --approval-timeout S       stop waiting for a human after S seconds (default: wait forever)
  --red-team auto|off|force  labelled red-team probe of a denied action (default auto:
                             only when the model did not try one itself)
  --mem                      in-process mirror of the contract instead of SpacetimeDB (dev/test)
  --uri ws://host:port       SpacetimeDB URI   (default ${STDB_URI}, env STDB_URI)
  --db NAME                  database name     (default ${STDB_DB}, env STDB_DB)
  --telemetry-speed X        slow the telemetry replay by X
  --pace-ms N                pause between steps in --scripted (default 450)
  --llm-timeout S            per model call timeout in seconds (default 60)
  --no-reset                 do not call reset_demo first
  -v, --verbose              print model messages and tool args/results
`;
