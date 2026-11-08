import { APPROVER, CANON_APPROVE, EVIDENCE, FACILITY, FINAL_STEP, INCIDENT, ISOLATE_DUR, OPERATORS } from "./script";
import { icon } from "./icons";
import { logoSVG } from "./logo";
import { $, $$, disc, setAttr, setHTML, setText } from "./dom";
import { S, U, VIEWS, tone, type Phase, type View } from "./engine";
import { hostInfo } from "./hosts";
import { fmtT } from "./util";

const NAV: Record<View, { label: string; icon: string }> = {
  overview: { label: "Overview", icon: "overview" },
  incident: { label: "Incident", icon: "incident" },
  warroom: { label: "War Room", icon: "warroom" },
  shells: { label: "Shells", icon: "terminal" },
  agents: { label: "Agents", icon: "agents" },
  policy: { label: "Policy", icon: "policy" },
  reports: { label: "Reports", icon: "reports" },
};

const [FAC_ID, FAC_NAME] = FACILITY.split(" · ");

export function shellHTML(views: string): string {
  return `
  <div class="wallpaper" aria-hidden="true">
    <i class="wp b1"></i><i class="wp b2"></i><i class="wp b3"></i><i class="wp b4"></i>
    <i class="wp ember"></i><i class="wp green"></i>
    <i class="vignette"></i><i class="grain"></i>
  </div>

  <div class="app" id="appRoot">
    <aside class="sidebar" aria-label="Claura">
      <div class="brand">${logoSVG(32)}<span class="word">Claura</span></div>
      <div class="fac">${icon("building")}<div><b>${FAC_ID}</b><span>${FAC_NAME}</span></div></div>
      <nav class="nav" id="nav" style="--i:0">
        <i class="nav-lens"></i>
        ${VIEWS.map(
          (v) => `<button type="button" class="nav-item" data-view="${v}" data-target="nav:${v}">
            ${icon(NAV[v].icon)}<span>${NAV[v].label}</span>${v === "incident" ? `<i class="nav-dot"></i>` : ""}
          </button>`,
        ).join("")}
      </nav>
      <div class="side-foot">
        <p class="tagline">Seal the breach before it spreads.</p>
        <div class="stack"><span class="tag">NVIDIA Nemotron · on-prem</span><span class="tag">SpacetimeDB · live sync</span></div>
      </div>
    </aside>

    <div class="main">
      <header class="toolbar">
        <span class="tb-ico" id="tbIco"></span>
        <span class="tb-title" id="tbTitle">Overview</span>
        <span class="tb-sub" id="tbSub"></span>
        <span class="tb-grow"></span>
        <button type="button" class="tb-btn" id="micBtn" data-act="voice" data-tip="Ask Claura" aria-label="Ask Claura" aria-pressed="false" data-target="mic">${icon("mic")}</button>
        <div class="presence">
          <div class="avatars">${OPERATORS.map((o, i) => `<span class="av av${i}" id="av${i}" title="${o.initials} · ${o.role}">${o.initials}</span>`).join("")}</div>
          <span class="sync"><i></i><span><b>synced</b> · SpacetimeDB</span></span>
        </div>
      </header>
      <div class="scroll" id="scroll">
        <div class="page" id="page">${views}</div>
      </div>
      <div class="edge-top"></div>
    </div>
  </div>

  <div class="scrim" id="scrim" data-open="0"></div>
  <section class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" data-open="0" data-s="request">
    <div class="sheet-pane sheet-req">
      <span class="sheet-ico">${icon("shieldLock")}</span>
      <h2 id="sheetTitle">Quarantine ${INCIDENT.host}?</h2>
      <p class="sheet-sum">${FINAL_STEP.reason}</p>
      <dl class="sheet-facts">
        <div><dt>Scope</dt><dd>${FINAL_STEP.scope}</dd></div>
        <div><dt>Rollback</dt><dd>${FINAL_STEP.rollback}</dd></div>
      </dl>
      ${disc(
        "evidence",
        `<span class="r-title" style="font-size:16px;font-weight:550">Show evidence</span>`,
        `<div class="row-body"><p class="ev-note">${FINAL_STEP.evidence}</p>${EVIDENCE.map((e) => `<div class="file">${icon("file")}<b>${e.name}</b><em>${e.meta}</em></div>`).join("")}</div>`,
        "",
      )}
      <div class="sheet-actions">
        <button type="button" class="btn-primary" id="approveBtn" data-target="approve"><span>${FINAL_STEP.button}</span><kbd>⌘↵</kbd></button>
        <button type="button" class="btn-text" id="notNow" data-target="not-now">Not now</button>
      </div>
      <p class="sheet-note">Warden cannot quarantine a host on its own.</p>
    </div>
    <div class="sheet-pane sheet-done">
      <span class="sheet-ico ok">${icon("check")}</span>
      <h2 id="doneTitle">Approved by ${APPROVER.initials} · ${APPROVER.role}</h2>
      <p class="sheet-sum" id="doneSum"></p>
      <div class="s-bar"><i id="doneBar"></i></div>
      <p class="sheet-note" id="doneNote" style="margin-top:18px"></p>
    </div>
  </section>

  <section class="sheet host-sheet" id="hostSheet" role="dialog" aria-modal="true" aria-labelledby="hostTitle" data-open="0" inert>
    <div class="sheet-pane">
      <div class="hs-top">
        <span class="sheet-ico host">${icon("server")}</span>
        <div><h2 id="hostTitle"></h2><p id="hostWhere"></p></div>
        <span class="chip" id="hostChip" data-tone="safe"><i></i><span></span></span>
      </div>
      <p class="sheet-sum" id="hostNote"></p>
      <div class="host-tiles">
        <div class="tile"><b id="hGuests">–</b><span>guests</span></div>
        <div class="tile"><b id="hLoad">–</b><span>GPU load</span></div>
        <div class="tile"><b id="hTemp">–</b><span>inlet °C</span></div>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn-primary" id="shellBtn" data-target="open-shell">${icon("terminal")}<span>Open secure shell</span></button>
        <button type="button" class="btn-text" id="hostClose" data-target="host-close">Close</button>
      </div>
      <p class="host-warn" id="shellNote" data-on="0">${icon("lock")}Secure shell module not loaded</p>
    </div>
  </section>

  <div class="devdock" id="devdock">
    <button type="button" class="btn-chip" data-act="sim">${icon("bolt")}Simulate breach</button>
    <button type="button" class="btn-chip" data-act="reset">${icon("reset")}Reset</button>
  </div>`;
}

// ------------------------------------------------------------------ render
const SUB: Record<View, (ph: Phase) => string> = {
  overview: (ph) => (ph === "nominal" ? "All clear" : ph === "contained" || ph === "report" ? "Contained" : "Breach in progress"),
  incident: (ph) => (ph === "nominal" ? "No open incident" : INCIDENT.id),
  warroom: () => "Out-of-band · SpacetimeDB cloud",
  agents: () => "Sentry, Triage, Warden, Scribe",
  policy: () => "Playbook guest-escape v3",
  reports: () => "Filed by Scribe",
};

export function renderShell(ph: Phase) {
  const t = tone(ph);
  setAttr(document.body, "data-tone", t);
  document.documentElement.dataset.demo = S.demo ? "1" : "0";

  setHTML($("#tbIco"), S.view, () => icon(NAV[S.view].icon));
  setText($("#tbTitle"), NAV[S.view].label);
  setText($("#tbSub"), SUB[S.view](ph));

  setAttr($("#av0"), "data-s", ph === "approval" ? "looking" : ph === "isolating" ? "approved" : "");

  // nav lens follows the selected item
  const nav = $("#nav");
  const idx = VIEWS.indexOf(S.view);
  if (nav.style.getPropertyValue("--i") !== String(idx)) nav.style.setProperty("--i", String(idx));
  for (const b of $$(".nav-item", nav)) {
    const on = b.dataset.view === S.view;
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
}

// ------------------------------------------------------------------ approval sheet
function renderHostSheet(open: boolean) {
  const sheet = $("#hostSheet");
  const v = open ? "1" : "0";
  if (sheet.dataset.open !== v) {
    sheet.dataset.open = v;
    sheet.setAttribute("aria-hidden", String(!open));
    sheet.toggleAttribute("inert", !open);
  }
  const info = open ? hostInfo(S.hostSheet!) : null;
  if (info) {
    setText($("#hostTitle"), info.id);
    setText($("#hostWhere"), info.where);
    setText($("#hostNote"), info.note);
    setText($("#hGuests"), String(info.guests));
    setText($("#hLoad"), `${info.load}%`);
    setText($("#hTemp"), String(info.temp));
    const chip = $("#hostChip");
    setAttr(chip, "data-tone", info.tone);
    setText(chip.querySelector("span"), info.status);
  }
  setAttr($("#shellNote"), "data-on", S.shellNote ? "1" : "0");
}

export function sheetWanted(ph: Phase): boolean {
  if (ph === "approval") return !S.sheetDismissed;
  const u = U();
  return S.A !== null && u >= 0 && u < ISOLATE_DUR + 0.9;
}

export function renderSheet(ph: Phase) {
  const open = sheetWanted(ph);
  if (open && S.hostSheet) S.hostSheet = null; // the approval always comes first
  const host = S.hostSheet !== null && hostInfo(S.hostSheet) !== null;
  const sheet = $("#sheet");
  const scrim = $("#scrim");
  const v = open ? "1" : "0";
  if (sheet.dataset.open !== v) {
    sheet.dataset.open = v;
    sheet.setAttribute("aria-hidden", String(!open));
    sheet.toggleAttribute("inert", !open);
  }
  renderHostSheet(host);
  const any = open || host ? "1" : "0";
  if (scrim.dataset.open !== any) {
    scrim.dataset.open = any;
    document.body.dataset.sheet = any;
    $("#appRoot").toggleAttribute("inert", any === "1");
  }
  const approved = S.A !== null;
  setAttr(sheet, "data-s", approved ? "approved" : "request");
  if (approved) {
    const u = U();
    setText($("#doneSum"), u >= ISOLATE_DUR ? "Host quarantined. The escape stopped at the hypervisor boundary." : `Taking ${INCIDENT.host} off the fabric and pruning its BMC VLAN.`);
    setText($("#doneNote"), `${fmtT(S.A ?? CANON_APPROVE)} · ⌘↵`);
    $("#doneBar").style.transform = `scaleX(${Math.min(1, Math.max(0, u / ISOLATE_DUR)).toFixed(4)})`;
  }
}

