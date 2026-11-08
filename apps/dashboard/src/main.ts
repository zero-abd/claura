import "./style.css";

import {
  APPROVAL_AT,
  CANON_APPROVE,
  CONTAINED_AT,
  ISOLATE_DUR,
  SCRIBE_FILED_U,
  SCRIPT_END_U,
  STEPS,
} from "./script";
import {
  AMB_PREFILL,
  AMB_DT,
  REPORT_KEY,
  S,
  U,
  VIEWS,
  phase,
  setOpen,
  isOpen,
  type Phase,
  type View,
} from "./engine";
import { $, $$, installSprings, setAttr, syncDisclosures } from "./dom";
import { FacilityMap } from "./map";
import { mountFacility3D, nudgeFacilityResize, setFacilitySelection, setFacilityVisible, setPickHandler, stageMode, syncFacility3D } from "./facility3d";
import { renderSheet, renderShell, shellHTML, sheetWanted } from "./shell";
import { parseHost } from "./hosts";
import { overview } from "./views/overview";
import { incident } from "./views/incident";
import { agents } from "./views/agents";
import { policy } from "./views/policy";
import { reports } from "./views/reports";
import { selectChannel, warroom } from "./views/warroom";
import { shells } from "./views/shells";

const VIEW_MODULES = { overview, incident, warroom, shells, agents, policy, reports } as const;

// ------------------------------------------------------------------ boot DOM
let map!: FacilityMap;
let stageEl!: HTMLElement;

function build() {
  $("#app").innerHTML = shellHTML(VIEWS.map((v) => VIEW_MODULES[v].html()).join(""));
  // The one stage element. It lives in the Overview, or in the Incident hero, whichever is on screen.
  stageEl = document.createElement("div");
  stageEl.id = "facility3d";
  stageEl.setAttribute("role", "img");
  stageEl.setAttribute("aria-label", "Facility map, DFW-2");
  stageEl.dataset.mode = "2d";
  stageEl.innerHTML = `<canvas class="f3d-fallback"></canvas>`;
  $('.stage-slot[data-slot="overview"]').appendChild(stageEl);
  map = new FacilityMap(stageEl.querySelector("canvas") as HTMLCanvasElement);
  wireStage();
}

/** The 2D facility map is a host picker: click a rack to inspect it, click a host to open its Host sheet. */
function wireStage() {
  const canvas = stageEl.querySelector("canvas") as HTMLCanvasElement;
  const at = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return map.hit(e.clientX - r.left, e.clientY - r.top);
  };
  stageEl.addEventListener("pointermove", (e) => {
    if (stageMode() === "mounted") return;
    map.hover = at(e);
    canvas.style.cursor = map.hover ? "pointer" : "default";
  });
  stageEl.addEventListener("pointerleave", () => {
    map.hover = null;
  });
  stageEl.addEventListener("click", (e) => {
    if (stageMode() === "mounted") return; // the 3D module reports picks through the same hook (onPick)
    const h = at(e);
    if (!h) return;
    if (h.kind === "rack") {
      map.sel = { hall: h.hall, rack: h.rack };
      setOpen("map", true);
      syncDisclosures();
    } else api.openHost(h.id);
  });
}

function setView(v: View, animate: boolean) {
  S.view = v;
  for (const el of $$(".view")) el.dataset.active = el.dataset.view === v ? "1" : "0";
  const slot = document.querySelector(`.stage-slot[data-slot="${v}"]`);
  setFacilityVisible(!!slot);
  if (slot) {
    if (stageEl.parentElement !== slot) slot.appendChild(stageEl);
    map.mode = v === "incident" ? "ambient" : "stage";
    map.resize();
    nudgeFacilityResize();
  }
  const el = $(`#v-${v}`);
  if (animate) {
    el.classList.remove("enter");
    void el.offsetWidth;
    el.classList.add("enter");
  } else el.classList.remove("enter");
  $("#scroll").scrollTop = 0;
  window.dispatchEvent(new CustomEvent("bulkhead:view", { detail: v }));
}

// ------------------------------------------------------------------ render
let lastPhase: Phase | null = null;
function refreshTips() {
  const v = window.claura?.voice;
  const hasToggle = typeof v?.toggle === "function";
  const hasPlay = typeof v?.playBrief === "function";
  setAttr($("#micBtn"), "data-tip", hasToggle ? "Ask Claura" : "Ask Claura · voice module not loaded");
  setAttr($("#micBtn"), "aria-pressed", String(S.micOn && hasToggle));
  const play = document.querySelector('[data-act="play-brief"]');
  if (play) setAttr(play, "data-tip", hasPlay ? "Play brief" : "Play brief · voice module not loaded");
}

let lastHost: string | null = null;
function render() {
  const ph = phase();
  document.body.dataset.phase = ph;
  renderShell(ph);
  refreshTips();
  VIEW_MODULES[S.view].render(ph);
  syncDisclosures();
  renderSheet(ph);
  if (S.view === "overview" || S.view === "incident") map.draw({ amb: S.amb, started: S.started, r: S.started ? S.r : -1e9, u: U() });
  syncFacility3D(ph, S.r);
  if (S.hostSheet !== lastHost) {
    lastHost = S.hostSheet;
    setFacilitySelection(lastHost); // outline the host in the 3D scene while its sheet is open
  }
  if (ph !== lastPhase) {
    lastPhase = ph;
    window.dispatchEvent(new CustomEvent("bulkhead:phase", { detail: ph }));
  }
}

// ------------------------------------------------------------------ engine loop
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  S.amb += dt;
  if (S.running) {
    S.r += dt;
    if (S.A === null && S.autoApprove !== null) {
      const when = Math.max(S.autoApprove, APPROVAL_AT);
      if (S.r >= when) S.A = when;
    }
  }
  render();
  requestAnimationFrame(frame);
}

function clearStream() {
  for (const el of incident.rowEls.values()) el.remove();
  incident.rowEls.clear();
  incident.ambRendered = -1;
}

/** Run fn with every transition and typewriter effect off for two frames (jumps, URL params). */
function settle(fn: () => void) {
  S.animate = false;
  document.body.classList.add("no-anim");
  fn();
  render();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.body.classList.remove("no-anim");
      S.animate = true;
    }),
  );
}

// ------------------------------------------------------------------ API
function ownerView(key: string): View | null {
  const el = document.querySelector(`.disc[data-key="${key}"]`);
  const v = el?.closest(".view") as HTMLElement | null;
  return v ? (v.dataset.view as View) : null;
}
/** Scroll an expanded card into view if it is not fully visible. Smooth for API calls, instant for URL params. */
function reveal(key: string, smooth: boolean) {
  const el = document.querySelector(`.disc[data-key="${key}"]`) as HTMLElement | null;
  if (!el) return;
  const target = (el.closest(".agent-card, .rep") as HTMLElement | null) ?? el;
  const sc = $("#scroll");
  const run = () => {
    const sr = sc.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (r.top >= sr.top + 90 && r.bottom <= sr.bottom - 12) return;
    sc.scrollTo({ top: Math.max(0, sc.scrollTop + (r.top - sr.top) - 100), behavior: smooth ? "smooth" : "auto" });
  };
  if (smooth) window.setTimeout(run, 280);
  else run();
}
function knownKey(key: string) {
  return !!document.querySelector(`.disc[data-key="${key}"]`);
}

const api = {
  reset() {
    settle(() => {
      S.started = false;
      S.running = false;
      S.r = 0;
      S.A = null;
      S.autoApprove = null;
      S.ambFrozen = null;
      S.stepOv.clear();
      S.sheetDismissed = false;
      clearStream();
    });
  },
  /** Run the incident from T+0. Optional { approveAt } auto-approves at that script time (canonical 7.4). */
  play(opts: { approveAt?: number } = {}) {
    if (S.started) api.reset();
    S.ambFrozen = AMB_PREFILL + Math.floor(S.amb / AMB_DT);
    S.started = true;
    S.running = true;
    S.r = 0;
    S.A = null;
    S.stepOv.clear();
    S.sheetDismissed = false;
    S.autoApprove = opts.approveAt ?? null;
    render();
  },
  /** Approve the quarantine step (same as the button or ⌘↵). */
  approve() {
    if (!S.started || S.A !== null) return false;
    if (S.r < APPROVAL_AT) {
      S.autoApprove = APPROVAL_AT; // queue: approve the moment the gate opens
      return true;
    }
    S.A = S.r;
    S.running = true;
    render();
    return true;
  },
  /** Reports view with INC-0419 expanded. closeReport() goes back to where you were. */
  openReport() {
    api.go("reports");
    setOpen(REPORT_KEY, true);
    syncDisclosures();
  },
  closeReport() {
    setOpen(REPORT_KEY, false);
    if (S.view === "reports") api.go(S.prevView && S.prevView !== "reports" ? S.prevView : "incident");
    else syncDisclosures();
  },
  /** Jump to script time t (seconds) and hold. approveAt defaults to 7.4. */
  seek(t: number, opts: { approveAt?: number | null; run?: boolean; report?: boolean } = {}) {
    settle(() => {
      const ap = opts.approveAt === undefined ? CANON_APPROVE : opts.approveAt;
      if (!S.started) S.ambFrozen = AMB_PREFILL;
      clearStream();
      S.started = true;
      S.running = !!opts.run;
      S.r = t;
      S.autoApprove = ap;
      const when = ap === null ? null : Math.max(ap, APPROVAL_AT);
      S.A = when !== null && t >= when ? when : null;
      if (ap === null) S.autoApprove = null;
      S.stepOv.clear();
      S.sheetDismissed = false;
      if (opts.report) {
        S.open.set(REPORT_KEY, true);
        if (S.view !== "reports") {
          S.prevView = S.view;
          setView("reports", false);
        }
      }
    });
  },

  // ---- navigation + disclosures (new)
  /** 'overview' | 'incident' | 'agents' | 'policy' | 'reports' */
  go(view: View) {
    if (!VIEWS.includes(view)) return false;
    if (view === S.view) return true;
    S.prevView = S.view;
    setView(view, S.animate);
    render();
    return true;
  },
  /** Open a disclosure by key: 'signals' | 'evidence' | 'blast' | 'details' | 'map' | 'step:1'..'step:7' |
   *  'agent:sentry|triage|warden|scribe' | 'report:INC-0419' (+ older ids) | 'authorized' | 'files'. */
  expand(key: string, opts: { scroll?: boolean } = {}) {
    if (!knownKey(key)) return false;
    const owner = ownerView(key);
    if (owner && owner !== S.view && document.body.dataset.sheet !== "1") api.go(owner);
    setOpen(key, true);
    syncDisclosures();
    if (opts.scroll) reveal(key, true); // optional: bring a tall card into view
    return true;
  },
  collapse(key: string) {
    if (!knownKey(key)) return false;
    setOpen(key, false);
    syncDisclosures();
    return true;
  },
  toggle(key: string) {
    return isOpen(key) ? api.collapse(key) : api.expand(key);
  },
  isOpen(key: string) {
    return isOpen(key);
  },
  keys() {
    return Array.from(new Set($$(".disc[data-key]").map((e) => e.dataset.key!)));
  },
  /** Select a War Room channel: '#command' | '#legal' | '#exec' | '#comms-pr' | '#vendors' (the # is optional). Opens the War Room. */
  selectChannel(channel: string) {
    if (!selectChannel(channel)) return false;
    if (S.view !== "warroom") api.go("warroom");
    render();
    return true;
  },
  /** Open the Host sheet for a host id such as 'b14-gpu-07'. Every host name and the facility map call this;
   *  a 3D map can call it through the same `onPick` hook. Returns false for an unknown id or while the approval is up. */
  openHost(id: string) {
    if (!parseHost(id)) return false;
    if (sheetWanted(phase())) return false;
    S.hostSheet = id;
    S.shellNote = false;
    const p = parseHost(id)!;
    map.sel = { hall: p.hall, rack: p.rack }; // the 2D map follows, so its elevation shows this host's rack
    render();
    return true;
  },
  closeHost() {
    if (S.hostSheet === null) return false;
    S.hostSheet = null;
    render();
    return true;
  },
  /** Show the approval sheet again after "Not now". Only works while approval is pending. */
  openApproval() {
    if (phase() !== "approval") return false;
    S.sheetDismissed = false;
    render();
    return true;
  },
  closeApproval() {
    if (phase() !== "approval") return false;
    S.sheetDismissed = true;
    render();
    return true;
  },
  /** Click targets in CSS px (centre + size) for driving a real cursor. visible=false when off-screen or hidden. */
  targets() {
    const out: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }> = {};
    const add = (name: string, el: Element | null) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inert = !!el.closest("[inert]");
      const entry = {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !inert,
      };
      const prev = out[name];
      if (prev?.visible && !entry.visible) return; // a key can exist twice (sheet + page): keep the one you can click
      out[name] = entry;
    };
    for (const el of $$("[data-target]")) add(el.dataset.target!, el);
    for (const el of $$("[data-disc]")) add(`disc:${el.dataset.disc}`, el);
    for (const el of $$(".arow[data-agent]")) add(`agent-row:${el.dataset.agent}`, el);
    for (const el of $$("#wrInput")) add("composer", el);
    const seen = new Set<string>();
    for (const el of $$(".host[data-host]")) {
      const k = `host:${el.dataset.host}`;
      const r = el.getBoundingClientRect();
      if (seen.has(k) || r.width === 0 || r.top >= innerHeight || r.bottom <= 0) continue;
      seen.add(k);
      add(k, el);
    }
    return out;
  },
  get state(): Phase {
    return phase();
  },
  get view(): View {
    return S.view;
  },
  /** 'mounted' when the optional 3D facility module is running, else 'fallback' (2D map). */
  get stage() {
    return stageMode();
  },
  get time() {
    return S.r;
  },
  timings: {
    alert: 0,
    sentry: [0.2, 1.0],
    triage: [1.0, 2.0],
    steps: STEPS.map((s, i) => ({ step: i + 1, label: s.label, start: s.start, end: s.end })),
    approvalRequested: APPROVAL_AT,
    canonicalApprove: CANON_APPROVE,
    isolateDuration: ISOLATE_DUR,
    contained: CONTAINED_AT,
    reportFiled: CANON_APPROVE + SCRIBE_FILED_U,
    end: CANON_APPROVE + SCRIPT_END_U,
  },
  views: VIEWS,
};
// Hooks other modules attach to window.claura. All optional: the console works without them.
type ClauraHooks = {
  openShell?: (hostId: string) => unknown;
  voice?: { toggle?: () => unknown; playBrief?: () => unknown };
};
declare global {
  interface Window {
    bulkhead: typeof api;
    claura: typeof api & ClauraHooks;
  }
}

/** window.bulkhead and window.claura are one object. If a module already created window.claura, merge into it
 *  without overwriting anything it set (its openShell / voice stay untouched). */
function exposeApi() {
  const existing = (window as unknown as { claura?: object }).claura;
  if (existing && existing !== api) {
    const props = Object.getOwnPropertyDescriptors(api);
    for (const k of Object.keys(props)) if (!(k in existing)) Object.defineProperty(existing, k, props[k]);
    window.claura = existing as Window["claura"];
    window.bulkhead = existing as Window["bulkhead"];
  } else {
    window.claura = api as Window["claura"];
    window.bulkhead = api;
  }
}

/** Host sheet -> Open secure shell. Calls window.claura?.openShell?.(hostId); if the module is absent, say so. */
function openShellFor(id: string) {
  const c = window.claura;
  if (typeof c?.openShell !== "function") {
    S.shellNote = true;
    render();
    return false;
  }
  S.hostSheet = null;
  api.go("shells"); // the slot must be on screen before the terminal mounts into it
  try {
    const r = c.openShell(id);
    if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => {});
  } catch {
    /* a misbehaving module must never break the console */
  }
  render();
  return true;
}

function voiceCall(fn: "toggle" | "playBrief", btn: HTMLElement) {
  const v = window.claura?.voice;
  const f = v?.[fn];
  if (typeof f !== "function") {
    btn.classList.add("tip-on"); // module absent: a no-op with a quiet tooltip
    window.setTimeout(() => btn.classList.remove("tip-on"), 1800);
    return false;
  }
  try {
    const r = f.call(v);
    if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => {});
  } catch {
    /* ignore */
  }
  if (fn === "toggle") S.micOn = !S.micOn;
  return true;
}

// ------------------------------------------------------------------ input
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;

  const hostEl = t.closest("[data-host]") as HTMLElement | null;
  if (hostEl) return void api.openHost(hostEl.dataset.host!);

  const d = t.closest("[data-disc]") as HTMLElement | null;
  if (d) return void api.toggle(d.dataset.disc!);

  const nav = t.closest(".nav-item[data-view]") as HTMLElement | null;
  if (nav) return void api.go(nav.dataset.view as View);

  const act = t.closest("[data-act]") as HTMLElement | null;
  if (act) {
    const a = act.dataset.act;
    if (a === "review") api.openApproval();
    else if (a === "voice") voiceCall("toggle", act);
    else if (a === "play-brief") voiceCall("playBrief", act);
    else if (a === "sim") {
      api.go("incident");
      api.play();
    } else if (a === "reset") api.reset();
    return;
  }

  if (t.closest("#shellBtn")) return void (S.hostSheet && openShellFor(S.hostSheet));
  if (t.closest("#hostClose")) return void api.closeHost();
  if (t.closest("#approveBtn")) return void api.approve();
  if (t.closest("#notNow")) return void api.closeApproval();

  const chBtn = t.closest(".ch[data-ch]") as HTMLElement | null;
  if (chBtn) return void api.selectChannel(chBtn.dataset.ch!);

  const row = t.closest(".arow[data-agent]") as HTMLElement | null;
  if (row) {
    api.go("agents");
    api.expand(`agent:${row.dataset.agent}`);
    return;
  }

  const sw = t.closest(".switch[data-pol]") as HTMLElement | null;
  if (sw) {
    if (sw.dataset.locked !== "1") policy.toggle(sw.dataset.pol!);
    return;
  }
  const pre = t.closest("[data-preset]") as HTMLElement | null;
  if (pre) return void policy.setPreset(pre.dataset.preset!);

  const go = t.closest("[data-go]") as HTMLElement | null;
  if (go) {
    const v = go.dataset.go as View;
    api.go(v);
    if (go.id === "lastRow" && v === "reports") api.expand(S.started ? REPORT_KEY : "report:INC-0418");
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target as HTMLElement;
  if (f.id !== "wrForm") return;
  e.preventDefault();
  const input = $("#wrInput") as HTMLInputElement;
  if (warroom.send(input.value)) input.value = "";
  render();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    api.approve();
  } else if (e.key === "Escape") {
    if (!api.closeHost()) api.closeApproval();
  } else if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).classList?.contains("switch")) {
    e.preventDefault();
    (e.target as HTMLElement).click();
  }
});

// ------------------------------------------------------------------ boot
installSprings();
build();
exposeApi();
setPickHandler((id) => void api.openHost(id));
void mountFacility3D(stageEl);

const params = new URLSearchParams(location.search);
S.demo = params.get("demo") === "1";
S.amb = 6.0; // fixed ambient start so first frames are identical every load

const want = params.get("phase");
const tParam = params.get("t");
const viewParam = params.get("view") as View | null;
settle(() => {
  const v: View =
    viewParam && VIEWS.includes(viewParam) ? viewParam : want === "report" ? "reports" : want || tParam !== null ? "incident" : "overview";
  setView(v, false);
});
if (tParam !== null) api.seek(parseFloat(tParam));
else if (want === "breach") api.seek(4.4, { approveAt: null });
else if (want === "approval") api.seek(6.8, { approveAt: null });
else if (want === "contained") api.seek(CANON_APPROVE + SCRIPT_END_U);
else if (want === "report") api.seek(CANON_APPROVE + SCRIPT_END_U, { report: true });
else api.reset();
const expand = params.get("expand");
if (expand)
  settle(() => {
    const keys = expand.split(",").filter(Boolean);
    for (const k of keys) setOpen(k, true);
    syncDisclosures();
    if (keys[0]) reveal(keys[0], false);
  });
const channelParam = params.get("channel"); // ?channel=exec (or %23exec)
if (channelParam) selectChannel(channelParam);
const hostParam = params.get("host"); // ?host=b14-gpu-07 opens its Host sheet
if (hostParam) settle(() => void api.openHost(hostParam));
if (params.get("play") === "1") api.play({ approveAt: params.get("approveAt") ? parseFloat(params.get("approveAt")!) : undefined });

document.fonts.ready.then(() => {
  map.resize();
  render();
});
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});
