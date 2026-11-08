import type { Logger } from './log.ts';

export type MarkName =
  | 'first_signal' | 'incident_open' | 'triage_done' | 'pending_approval'
  | 'approved' | 'contained' | 'report_filed' | 'brief_filed' | 'handoff_posted';

/** Wall-clock marks on the run's monotonic clock (ms since runner start). */
export class Marks {
  private m = new Map<MarkName, number>();
  constructor(private readonly log: Logger) {}
  markOnce(name: MarkName): number {
    const have = this.m.get(name);
    if (have !== undefined) return have;
    const t = this.log.now();
    this.m.set(name, t);
    return t;
  }
  get(name: MarkName): number | undefined {
    return this.m.get(name);
  }
  between(a: MarkName, b: MarkName): number | undefined {
    const x = this.m.get(a);
    const y = this.m.get(b);
    return x === undefined || y === undefined ? undefined : y - x;
  }
}
