import { clip } from './util.ts';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);

const AGENT_COLOR: Record<string, string> = {
  sentry: '36', triage: '35', warden: '33', scribe: '34',
  runner: '90', human: '32', policy: '31', telemetry: '90',
};

export interface TimelineEntry {
  tMs: number;
  who: string;
  text: string;
  level: 'info' | 'warn' | 'error' | 'ok';
}

/** Console logger that also records a timeline for the end-of-run summary. */
export class Logger {
  readonly t0 = performance.now();
  readonly entries: TimelineEntry[] = [];
  constructor(public verbose = false, private readonly quiet = false) {}

  get isQuiet(): boolean {
    return this.quiet;
  }

  now(): number {
    return performance.now() - this.t0;
  }

  private emit(level: TimelineEntry['level'], who: string, text: string, record = true) {
    const t = this.now();
    if (record) this.entries.push({ tMs: t, who, text, level });
    if (this.quiet) return;
    const stamp = c('90', `+${(t / 1000).toFixed(2).padStart(6)}s`);
    const name = c(AGENT_COLOR[who] ?? '37', who.toUpperCase().padEnd(9));
    const body = level === 'warn' ? c('33', text) : level === 'error' ? c('31', text) : level === 'ok' ? c('32', text) : text;
    console.log(`${stamp} ${name} ${body}`);
  }

  info(who: string, text: string) { this.emit('info', who, text); }
  ok(who: string, text: string) { this.emit('ok', who, text); }
  warn(who: string, text: string) { this.emit('warn', who, text); }
  error(who: string, text: string) { this.emit('error', who, text); }
  /** Verbose-only detail line (not recorded in the timeline). */
  debug(who: string, text: string) {
    if (this.verbose) this.emit('info', who, c('90', clip(text, 600)), false);
  }
}
