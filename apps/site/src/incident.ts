/* INC-0419, the scripted demo incident. The hero scrubber, the intro and the timeline all read
   from this list, so the times only live here. Demo data from the prototype. */

export type Event = {
  t: number;
  who: "Sentry" | "Triage" | "Warden" | "Scribe" | "You";
  what: string;
  detail?: string;
};

export const HOST = "b14-gpu-07";
export const END = 9.4;
export const APPROVAL = 7.4;

export const EVENTS: Event[] = [
  { t: 0.6, who: "Sentry", what: "Escape suspected on the vGPU path", detail: "qemu on b14-gpu-07 spawned a shell right after a DMA fault." },
  { t: 1.5, who: "Triage", what: "Blast radius scored", detail: "1 host, 11 co-resident guests, management plane reachable." },
  { t: 2.4, who: "Warden", what: "Network isolated" },
  { t: 2.9, who: "Warden", what: "Credentials revoked" },
  { t: 3.3, who: "Warden", what: "Host cordoned" },
  { t: 3.8, who: "Warden", what: "Guest paused" },
  { t: 4.6, who: "Warden", what: "Memory captured and hashed", detail: "Evidence is stored off the network before anything is torn down." },
  { t: 5.3, who: "Warden", what: "11 guests failed over to clean hosts" },
  { t: APPROVAL, who: "You", what: "Quarantine approved with ⌘↵", detail: "The one step Warden is not allowed to take alone." },
  { t: END, who: "Warden", what: "Host quarantined, incident contained", detail: "0 co-resident guests affected. Scribe files the report." },
];

/** The last event at or before t, or null before the first signal. */
export function eventAt(t: number): Event | null {
  let hit: Event | null = null;
  for (const e of EVENTS) if (t >= e.t - 1e-6) hit = e;
  return hit;
}

export const fmt = (t: number) => `T+${t.toFixed(1)} s`;
