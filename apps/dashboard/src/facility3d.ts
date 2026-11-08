// Optional 3D facility stage.
//
// `#facility3d` (the glass-framed stage, which holds the 2D map as its fallback) is the mount point for a
// separately built module at /bulkhead-3d/facility.js exposing
//   createFacility(container, { look, background: 'transparent', onPick(hostId) }) -> { setState(s), fly(cam) }
// `onPick` is how a click on a host in the 3D scene opens the Host sheet (same hook the 2D map uses).
// If that file is not there, this adapter does nothing and the 2D drawing stays. No errors, no waiting.
//
// Engine phase -> 3D:
//   nominal            -> setState('nominal'),    fly('facility')
//   breach (detect)    -> setState('breach'),     fly('hallB')
//   breach (steps 1-6) -> setState('containing')   (camera stays on hallB)
//   waiting on human   -> setState('approval'),   fly('rack14')
//   quarantining       -> setState('containing')   (camera stays on rack14)
//   contained / report -> setState('contained'),  fly('facility')
import type { Phase } from "./engine";
import { STEPS } from "./script";

export type F3DState = "nominal" | "breach" | "containing" | "approval" | "contained";
export type F3DPose = { preset: "facility" | "hallB" | "rack14" | "orbit"; w?: number; h?: number; az?: number; el?: number; target?: [number, number, number] };
export type F3DCam = "facility" | "hallB" | "rack14" | "orbit" | F3DPose;
const camKey = (c: F3DCam) => (typeof c === "string" ? c : JSON.stringify(c));
interface Facility {
  setState(s: F3DState): void;
  fly(c: F3DCam): void;
  resize?: () => void;
  play?: () => void;
  pause?: () => void;
  ready?: Promise<unknown>;
  /** subscribe to host clicks: cb({ host: 'b14-gpu-07', hall, rack }) */
  onPick?: (cb: (hit: unknown) => void) => unknown;
  /** outline a host in the scene: highlight('b14-gpu-07', 'select'); highlight(null, 'select') clears */
  highlight?: (host: string | null, kind?: string) => void;
}

const MODULE_URL = `${import.meta.env.BASE_URL}bulkhead-3d/facility.js`;
const LOOK = "lumen"; // the module's looks are 'lumen' (default) and 'iso'
// Orbit/zoom off: the module's wheel handler calls preventDefault, which would stop the page scrolling over the
// hero. Camera moves come from the phases (fly). Host picking stays on. Flip to true for a free-look stage.
const CONTROLS = false;

let facility: Facility | null = null;
let mounted = false;
let sentState: F3DState | null = null;
let sentCam: string | null = null;
let manualBase: string | null = null; // a hand-flown camera (flyFacility) holds until the phase's own camera changes
let visible = true; // is a stage slot on screen? (the module keeps rendering until paused)
let want: { state: F3DState; cam: F3DCam } = { state: "nominal", cam: "facility" };
let onPick: ((hostId: string) => void) | null = null;

/** The host picker hook: a click on a host in the 3D scene (module `onPick`) opens the Host sheet. */
export function setPickHandler(fn: (hostId: string) => void) {
  onPick = fn;
}

// The Incident hero is a small window (about 570 x 280 CSS px). The module's labels keep a constant screen size, so the
// stock hallB / rack14 frames put "Hall C", "C05", "C12" and "b14-gpu-07" / "vm-7f3a" on top of each other there.
// These poses keep the stock camera angle but frame the rack at a height where the hall and host labels have faded
// out (the module fades them by view height), leaving the B14 state tag and the failover destinations C05 / C12.
const HERO_BREACH: F3DPose = { preset: "rack14", w: 9, h: 6.9 };
const HERO_APPROVAL: F3DPose = { preset: "rack14", w: 8.4, h: 6.9 };

/** compact = the Incident hero (small). The Overview stage is large and uses the stock presets. */
export function facilityTarget(ph: Phase, r: number, compact = false): { state: F3DState; cam: F3DCam } {
  switch (ph) {
    case "nominal":
      return { state: "nominal", cam: "facility" };
    case "breach":
      return { state: r < STEPS[0].start ? "breach" : "containing", cam: compact ? HERO_BREACH : "hallB" };
    case "approval":
      return { state: "approval", cam: compact ? HERO_APPROVAL : "rack14" };
    case "isolating":
      return { state: "containing", cam: compact ? HERO_APPROVAL : "rack14" };
    default:
      return { state: "contained", cam: "facility" };
  }
}

/** 'mounted' once the 3D module is running, otherwise 'fallback' (the 2D map). */
export const stageMode = () => (mounted ? "mounted" : "fallback");

export async function mountFacility3D(el: HTMLElement): Promise<boolean> {
  try {
    // A missing file in dev/preview falls back to index.html (text/html): treat that as "not present".
    const head = await fetch(MODULE_URL, { method: "HEAD", cache: "no-store" });
    const type = head.headers.get("content-type") ?? "";
    if (!head.ok || !/javascript|ecmascript/i.test(type)) return false;
    // Absolute URL on purpose: in dev Vite appends ?import to root-relative dynamic imports, which public files reject.
    const mod = await import(/* @vite-ignore */ new URL(MODULE_URL, document.baseURI).href);
    const create = mod.createFacility ?? mod.default?.createFacility ?? (typeof mod.default === "function" ? mod.default : null);
    if (typeof create !== "function") return false;
    const inst: Facility = await create(el, { look: LOOK, background: "transparent", controls: CONTROLS, onPick: emitPick });
    if (!inst || typeof inst.setState !== "function") return false;
    await inst.ready; // shaders compiled, first frame drawn
    inst.onPick?.(emitPick);
    facility = inst;
    mounted = true;
    el.classList.add("has-3d");
    el.dataset.mode = "3d";
    sentState = null;
    sentCam = null;
    applyFacility3D();
    applyVisibility();
    return true;
  } catch (err) {
    // The file exists but did not start: keep the 2D map and say why (a missing file stays silent).
    console.warn("[claura] 3D stage did not start, using the 2D map:", err);
    facility = null;
    mounted = false;
    return false;
  }
}

function emitPick(hit: unknown) {
  const h = hit as { host?: string; hostId?: string; id?: string } | string | null;
  const id = typeof h === "string" ? h : (h?.host ?? h?.hostId ?? h?.id);
  if (id) onPick?.(String(id));
}

/** Outline the host the Host sheet is showing (or clear it) in the 3D scene. */
export function setFacilitySelection(hostId: string | null) {
  try {
    facility?.highlight?.(hostId, "select");
  } catch {
    /* ignore */
  }
}

/** Pause the module's render loop while no stage is on screen (Agents, Policy, ...). */
export function setFacilityVisible(v: boolean) {
  visible = v;
  applyVisibility();
}
function applyVisibility() {
  try {
    if (visible) facility?.play?.();
    else facility?.pause?.();
  } catch {
    /* ignore */
  }
}

function applyFacility3D() {
  if (!facility) return;
  try {
    if (sentState !== want.state) {
      facility.setState(want.state);
      sentState = want.state;
    }
    const k = camKey(want.cam);
    if (manualBase !== null && manualBase !== k) manualBase = null; // the phase moved on: back to automatic cameras
    if (manualBase === null && sentCam !== k) {
      facility.fly(want.cam);
      sentCam = k;
    }
    if (!visible) facility.pause?.(); // setState/fly restart the loop; keep it asleep while hidden
  } catch {
    /* a misbehaving module must never break the console */
  }
}

/** Called every frame from the render loop. Cheap: only talks to the module on change. */
export function syncFacility3D(ph: Phase, r: number, compact = false) {
  want = facilityTarget(ph, r, compact);
  applyFacility3D();
}

/** The stage moves between the Overview and the Incident hero; tell the module its size changed. */
export function nudgeFacilityResize() {
  if (!mounted) return;
  try {
    facility?.resize?.();
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("resize"));
}

/** Debug and recording aid: fly the 3D camera by hand (a preset name or a pose). It holds until the phase changes. */
export function flyFacility(cam: F3DCam): boolean {
  if (!facility) return false;
  try {
    facility.fly(cam);
    sentCam = camKey(cam);
    manualBase = camKey(want.cam);
    return true;
  } catch {
    return false;
  }
}
