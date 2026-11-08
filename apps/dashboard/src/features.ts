// Feature loader: optional modules (secure shell, voice, Solana anchoring, ...) served by a local gateway.
//
// Contract (the gateway lives outside this repo):
//   GET  <gateway>/api/health                 -> { features: [{ name, title, track, status: 'live'|'mock'|'down', ui }] }
//   GET  <gateway>/client/claura-features.js  -> ES module, default export async load({ base }) that dynamic-imports each
//                                               feature's ui.js; each one attaches to window.claura WITHOUT overwriting keys:
//                                               openShell(hostId), voice {toggle, playBrief, say, sting},
//                                               integrations[<name>] = { title, track, status, open(container) },
//                                               anchor(hash, label)
// The console loads it at boot with an 800 ms timeout per step and keeps working without it: nothing here is ever awaited
// by the rest of the app, and every failure ends in the Integrations page's empty state, not an error.
export type FeatureStatus = "live" | "mock" | "down";
export interface Feature {
  name: string;
  title: string;
  track: string;
  status: FeatureStatus;
  ui: string;
}
export type GatewayState = "checking" | "up" | "down";

export const DEFAULT_GATEWAY = "http://127.0.0.1:8787";
const STEP_TIMEOUT_MS = 800;
const POLL_MS = 8000;

export const features = {
  gateway: "checking" as GatewayState,
  base: DEFAULT_GATEWAY,
  list: [] as Feature[],
  /** the claura-features.js module was imported and its load() resolved */
  moduleLoaded: false,
  error: "",
  /** bumps on every change, so the view only touches the DOM when something moved */
  version: 0,
};

/** ?gateway= may only point at this machine (the gateway serves code that runs inside the console). */
export function resolveGateway(q: URLSearchParams): string {
  const env = (import.meta.env as Record<string, string | undefined>).VITE_CLAURA_GATEWAY;
  const raw = (q.get("gateway") ?? "").trim();
  if (raw) {
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{2,5})?\/?$/i.test(raw)) return raw.replace(/\/$/, "");
    console.warn("[claura] ignoring ?gateway=: only a loopback address is accepted");
  }
  return (env || DEFAULT_GATEWAY).replace(/\/$/, "");
}

const STATUSES = new Set(["live", "mock", "down"]);
function normalize(raw: unknown): Feature[] {
  const list = (raw as { features?: unknown })?.features;
  if (!Array.isArray(list)) return [];
  const out: Feature[] = [];
  for (const f of list) {
    const o = f as Record<string, unknown>;
    if (typeof o?.name !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(o.name)) continue; // a name ends up in selectors and attributes
    out.push({
      name: o.name,
      title: typeof o.title === "string" && o.title ? o.title : o.name,
      track: typeof o.track === "string" ? o.track : "",
      status: STATUSES.has(String(o.status)) ? (o.status as FeatureStatus) : "down",
      ui: typeof o.ui === "string" ? o.ui : "",
    });
  }
  return out;
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise((res, rej) => {
    const t = window.setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        res(v);
      },
      (e) => {
        window.clearTimeout(t);
        rej(e);
      },
    );
  });

function set(patch: Partial<typeof features>) {
  Object.assign(features, patch);
  features.version++;
}

/** One health check. Updates the list and the gateway state; never throws. */
export async function refreshHealth(): Promise<boolean> {
  try {
    const res = await withTimeout(fetch(`${features.base}/api/health`, { cache: "no-store" }), STEP_TIMEOUT_MS, "gateway health");
    if (!res.ok) throw new Error(`gateway answered ${res.status}`);
    const list = normalize(await res.json());
    const same = JSON.stringify(list) === JSON.stringify(features.list);
    if (!same || features.gateway !== "up") set({ list, gateway: "up", error: "" });
    return true;
  } catch (e) {
    if (features.gateway !== "down" || features.list.length) set({ list: [], gateway: "down", error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Import the gateway's client module once and let it attach its features to window.claura. */
async function loadModule(): Promise<void> {
  if (features.moduleLoaded) return;
  try {
    const url = `${features.base}/client/claura-features.js`;
    const mod = await withTimeout(import(/* @vite-ignore */ url), STEP_TIMEOUT_MS, "feature module");
    const load = (mod as { default?: unknown }).default ?? (mod as { load?: unknown }).load;
    if (typeof load !== "function") throw new Error("claura-features.js has no default export load()");
    await (load as (o: { base: string }) => Promise<unknown>)({ base: features.base });
    set({ moduleLoaded: true });
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Start the loader: health first, then the client module. Resolves as soon as both have answered or timed out (at most
 * about 1.6 s), and keeps polling in the background so a gateway that starts later appears without a reload.
 */
export async function bootFeatures(base: string): Promise<void> {
  set({ base, gateway: "checking" });
  const up = await refreshHealth();
  if (up) await loadModule();
  window.setInterval(async () => {
    if (document.hidden) return;
    const ok = await refreshHealth();
    if (ok && !features.moduleLoaded) await loadModule();
  }, POLL_MS);
}

/** "Check again" on the empty state. */
export async function retryFeatures(): Promise<void> {
  set({ gateway: "checking" });
  if (await refreshHealth()) await loadModule();
}

export interface IntegrationHook {
  title?: string;
  track?: string;
  status?: string;
  open?: (container: HTMLElement) => unknown;
}
/** What a feature attached to window.claura.integrations[name] (undefined until its ui.js has run). */
export function hookOf(name: string): IntegrationHook | undefined {
  const reg = (window as unknown as { claura?: { integrations?: Record<string, IntegrationHook> } }).claura?.integrations;
  return reg?.[name];
}
