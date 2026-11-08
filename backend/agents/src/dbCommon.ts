import type { EventRow } from './types.ts';

/** SDK Timestamp | bigint micros | Date | number(ms) -> epoch ms. 0 / missing -> 0. */
export function tsToMs(ts: unknown): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === 'bigint') return Number(ts / 1000n);
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  const o = ts as { toDate?: () => Date; microsSinceUnixEpoch?: bigint; __timestamp_micros_since_unix_epoch__?: bigint };
  if (typeof o.toDate === 'function') return o.toDate().getTime();
  const micros = o.microsSinceUnixEpoch ?? o.__timestamp_micros_since_unix_epoch__;
  return typeof micros === 'bigint' ? Number(micros / 1000n) : 0;
}

/**
 * Events belonging to one incident, oldest first. Signals that arrive before an
 * incident exists are logged with incident_id 0; they are part of every
 * incident's story, so they are included too. Ordered by id, not by time.
 */
export function eventsFor(all: EventRow[], incidentId: bigint): EventRow[] {
  return all
    .filter(e => e.incidentId === incidentId || (e.incidentId === 0n && e.kind === 'signal'))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // ids are monotonic; ctx.timestamp is shared within one reducer call
}
