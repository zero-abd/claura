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
export type F3DCam = "facility" | "hallB" | "rack14" | "orbit";
interface Facility {
  setState(s: F3DState): void;
  fly(c: F3DCam): void;
  resize?: () => void;
}

const MODULE_URL = `${import.meta.env.BASE_URL}bulkhead-3d/facility.js`;
const LOOK = "glass"; // passed through as `look`; change here if the module names it differently

let facility: Facility | null = null;
let mounted = false;
let sentState: F3DState | null = null;
let sentCam: F3DCam | null = null;
let want: { state: F3DState; cam: F3DCam } = { state: "nominal", cam: "facility" };
let onPick: ((hostId: string) => void) | null = null;

/** The host picker hook: the 3D module calls it (as `onPick`) when a host is clicked; it opens the Host sheet. */
export function setPickHandler(fn: (hostId: string) => void) {
  onPick = fn;
}

export function facilityTarget(ph: Phase, r: number): { state: F3DState; cam: F3DCam } {
  switch (ph) {
    case "nominal":
      return { state: "nominal", cam: "facility" };
    case "breach":
      return { state: r < STEPS[0].start ? "breach" : "containing", cam: "hallB" };
    case "approval":
      return { state: "approval", cam: "rack14" };
    case "isolating":
      return { state: "containing", cam: "rack14" };
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
    const mod = await import(/* @vite-ignore */ MODULE_URL);
    const create = mod.createFacility ?? mod.default?.createFacility ?? (typeof mod.default === "function" ? mod.default : null);
    if (typeof create !== "function") return false;
    const inst: Facility = await create(el, {
      look: LOOK,
      background: "transparent",
      onPick: (pick: unknown) => {
        const id = typeof pick === "string" ? pick : ((pick as { hostId?: string; id?: string } | null)?.hostId ?? (pick as { id?: string } | null)?.id);
        if (id) onPick?.(String(id));
      },
    });
    if (!inst || typeof inst.setState !== "function") return false;
    facility = inst;
    mounted = true;
    el.classList.add("has-3d");
    el.dataset.mode = "3d";
    sentState = null;
    sentCam = null;
    applyFacility3D();
    return true;
  } catch {
    facility = null;
    mounted = false;
    return false;
  }
}

function applyFacility3D() {
  if (!facility) return;
  try {
    if (sentState !== want.state) {
      facility.setState(want.state);
      sentState = want.state;
    }
    if (sentCam !== want.cam) {
      facility.fly(want.cam);
      sentCam = want.cam;
    }
  } catch {
    /* a misbehaving module must never break the console */
  }
}

/** Called every frame from the render loop. Cheap: only talks to the module on change. */
export function syncFacility3D(ph: Phase, r: number) {
  want = facilityTarget(ph, r);
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
