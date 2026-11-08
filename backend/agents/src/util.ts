export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class TimeoutError extends Error {}

/**
 * Poll `fn` until it returns a non-undefined/non-false value, or time out.
 * Reducer promises already resolve after the local cache is updated, so this is
 * mostly used for human-driven changes (approval from the dashboard).
 */
export async function waitFor<T>(
  fn: () => T | undefined | false | null,
  opts: { timeoutMs: number; intervalMs?: number; label: string },
): Promise<T> {
  const interval = opts.intervalMs ?? 50;
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v !== undefined && v !== false && v !== null) return v as T;
    if (opts.timeoutMs > 0 && Date.now() - t0 > opts.timeoutMs) {
      throw new TimeoutError(`timed out after ${opts.timeoutMs} ms waiting for ${opts.label}`);
    }
    await sleep(interval);
  }
}

export function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : one.slice(0, Math.max(0, n - 1)) + '…';
}

/** Truncate but keep line breaks (clip() flattens them). */
export function cut(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, Math.max(0, n - 1)) + '…';
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  return String(e);
}

/** JSON.stringify that survives bigint. */
export function j(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
}

export function fmtS(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}
