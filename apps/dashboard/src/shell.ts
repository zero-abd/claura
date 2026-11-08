import { APPROVER, CANON_APPROVE, EVIDENCE, FACILITY, FINAL_STEP, INCIDENT, ISOLATE_DUR } from "./script";
import { icon } from "./icons";
import { faviconURL, logoSVG } from "./logo";
import { $, $$, disc, setAttr, setHTML, setText } from "./dom";
import { S, U, VIEWS, info, isLive, tone, type Phase, type View } from "./engine";
import { esc, hostInfo } from "./hosts";
import { fmtT } from "./util";
import { approverOf, avatarStyle, canApprove, data, roleLabel, roster, summarize } from "./data";
import { closePerson, personSheetHTML, personSheetOpen, renderPersonSheet } from "./views/access";
import { joinOpen, joinSheetHTML, renderJoin } from "./views/join";
import { liveSource, readsResponse, sheetInfo } from "./live-engine";
import { scopeBadge } from "./views/scope";

const NAV: Record<View, { label: string; icon: string }> = {
  overview: { label: "Overview", icon: "overview" },
  incident: { label: "Incident", icon: "incident" },
  warroom: { label: "War Room", icon: "warroom" },
  scope: { label: "Data scope", icon: "database" },
  shells: { label: "Shells", icon: "terminal" },
  agents: { label: "Agents", icon: "agents" },
  policy: { label: "Policy", icon: "policy" },
  reports: { label: "Reports", icon: "reports" },
  integrations: { label: "Integrations", icon: "link" },
  access: { label: "People & Access", icon: "users" },
};

const [FAC_ID, FAC_NAME] = FACILITY.split(" · ");

/** The "Isolated · out-of-band" popover: how Claura stays usable when the attacker owns the corporate network. */
function isolationHTML(): string {
  const no = ["Corporate email", "Phones and SMS", "Corporate SSO", "Corporate DNS and VPN"];
  return `<section class="iso-pop glass" id="isoPop" role="dialog" aria-label="Isolation and deployment" data-open="0" inert>
    <header>
      <span class="sheet-ico ok">${icon("shieldLock")}</span>
      <div><h3>Isolated by design</h3><p>Assume the attacker already owns the corporate network. Email, chat, phones and SSO are untrusted. Claura runs on its own trust root.</p></div>
    </header>
    <div class="iso-modes">
      <div class="mode" data-active="0">
        <span class="mode-ico">${icon("laptop")}</span>
        <b>Sealed appliance</b>
        <p>Runs on an isolated laptop network. No uplink, no corporate DNS, nothing to phish.</p>
        <span class="tag">Air-gapped</span>
      </div>
      <div class="mode" data-active="1">
        <span class="mode-ico">${icon("cloud")}</span>
        <b>Out-of-band cloud</b>
        <p>A dedicated SpacetimeDB database, reached from any clean device on its own TLS endpoint.</p>
        <span class="tag on">This session</span>
      </div>
    </div>
    <div class="iso-no"><span class="iso-l">Does not depend on</span><div>${no.map((t) => `<span class="no-chip">${icon("x")}${t}</span>`).join("")}</div></div>
    <div class="iso-row">${icon("key")}<div><b>Passkey or hardware-key sign-in</b><p>No passwords to steal. New people join with a single-use break-glass code, issued in person.</p></div></div>
    <div class="iso-row">${icon("seal")}<div><b>Every action is on the record</b><p>Messages, approvals and status changes are appended and attributed. Nobody edits the past.</p></div></div>
    <div class="src-row" id="srcRow" data-src="replay"><i></i><b id="srcLabel">Replay</b><span id="srcSub">Scripted data. Nothing is read from or written to a server.</span></div>
    <button type="button" class="iso-replay" id="isoReplay" data-act="replay" data-target="replay-incident" title="Play the scripted incident from the first signal (key P)">${icon("play")}<span>Replay the incident</span><kbd>P</kbd></button>
    <footer><i></i>SpacetimeDB · live sync<span id="isoWho"></span></footer>
  </section>`;
}

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
            ${icon(NAV[v].icon)}<span>${esc(NAV[v].label)}</span>${v === "incident" ? `<i class="nav-dot"></i>` : ""}${v === "scope" ? `<i class="nav-badge" id="navScope" data-n="0"></i>` : ""}${v === "access" ? `<i class="nav-tag" title="Admins only">${icon("key")}</i>` : ""}
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
          <div class="avatars" id="avatars"></div>
          <button type="button" class="iso" id="isoBtn" data-act="isolation" aria-haspopup="dialog" aria-expanded="false" data-target="isolation"><i class="iso-dot"></i>${icon("lock")}<span>Isolated · out-of-band</span></button>
        </div>
      </header>
      ${isolationHTML()}
      <div class="scroll" id="scroll">
        <div class="page" id="page">${views}</div>
      </div>
      <div class="edge-top"></div>
    </div>
  </div>

  <div class="scrim" id="scrim" data-open="0"></div>
  <section class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" data-open="0" data-s="request" inert>
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
      <p class="sheet-note" id="approveNote">Warden cannot quarantine a host on its own.</p>
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

  ${personSheetHTML()}
  ${joinSheetHTML()}

  <div class="devdock" id="devdock">
    <button type="button" class="btn-chip" data-act="sim">${icon("bolt")}Simulate breach</button>
    <button type="button" class="btn-chip" data-act="reset">${icon("reset")}Reset</button>
    <button type="button" class="btn-chip" data-act="sim-enroll">${icon("userPlus")}Simulate enrollment</button>
  </div>`;
}

// ------------------------------------------------------------------ render
const SUB: Record<View, (ph: Phase) => string> = {
  overview: (ph) => (ph === "nominal" ? "All clear" : ph === "contained" || ph === "report" ? "Contained" : "Breach in progress"),
  incident: (ph) => (ph === "nominal" ? "No open incident" : info().id),
  warroom: () => "Out-of-band · SpacetimeDB cloud",
  scope: (ph) => (ph === "nominal" ? "No open incident" : "What was reachable, and its state"),
  shells: () => "Secure shells",
  agents: () => "Sentry, Triage, Warden, Scribe",
  policy: () => "Playbook guest-escape v3",
  reports: () => "NIST SP 800-61 · filed by Scribe",
  integrations: () => "Optional modules · local gateway",
  access: () => "Admin · break-glass enrollment",
};

let lastOrb = "";
export function renderShell(ph: Phase) {
  const t = tone(ph);
  setAttr(document.body, "data-tone", t);
  document.documentElement.dataset.demo = S.demo ? "1" : "0";

  setHTML($("#tbIco"), S.view, () => icon(NAV[S.view].icon));
  setText($("#tbTitle"), NAV[S.view].label);
  setText($("#tbSub"), SUB[S.view](ph));

  // the tab icon and title follow the incident, so a stakeholder switching tabs sees the state
  const orb = t === "contained" ? "#2FBF71" : "#FF5A1F";
  if (lastOrb !== orb) {
    lastOrb = orb;
    (document.getElementById("favicon") as HTMLLinkElement | null)?.setAttribute("href", faviconURL(orb));
  }
  const title = ph === "nominal" ? "Claura" : ph === "contained" || ph === "report" ? "Contained · Claura" : ph === "approval" ? "Needs approval · Claura" : "Breach in progress · Claura";
  if (document.title !== title) document.title = title;

  // who is here: the first three people online (admin first), then a count
  const d = data();
  const people = roster(d).filter((p) => p.kind !== "pending" && p.active);
  const online = people.filter((p) => p.online);
  const shown = online.slice(0, 3);
  setHTML($("#avatars"), `av:${d.version()}`, () =>
    shown.map((p, i) => `<span class="av${p.initials.length > 2 ? " long" : ""}" id="av${i}" style="${avatarStyle(p.initials)}" title="${esc(p.name)} · ${esc(p.title)}${p.admin ? " · admin" : ""}">${esc(p.initials)}</span>`).join("") +
    (online.length > 3 ? `<span class="av more" title="${online.length - 3} more online">+${online.length - 3}</span>` : ""),
  );
  setAttr(document.getElementById("av0"), "data-s", ph === "approval" ? "looking" : ph === "isolating" ? "approved" : "");

  // Data scope badge: how many assets need a person (red when any is locked or exfiltrated)
  const sb = scopeBadge();
  const badge = $("#navScope");
  setText(badge, sb.n ? String(sb.n) : "");
  setAttr(badge, "data-n", String(sb.n));
  setAttr(badge, "data-hard", sb.hard ? "1" : "0");

  // People & Access is for admins: everyone else does not see it
  const me = d.me();
  const accessBtn = $('.nav-item[data-view="access"]');
  accessBtn.hidden = me.role !== "admin";
  $("#nav").dataset.lens = accessBtn.hidden && S.view === "access" ? "off" : "on"; // no highlight on a hidden item

  // the isolation popover
  const popOpen = S.popover === "isolation";
  const pop = $("#isoPop");
  if (pop.dataset.open !== (popOpen ? "1" : "0")) {
    pop.dataset.open = popOpen ? "1" : "0";
    pop.toggleAttribute("inert", !popOpen);
    pop.setAttribute("aria-hidden", String(!popOpen));
    setAttr($("#isoBtn"), "aria-expanded", String(popOpen));
  }
  setText($("#isoWho"), ` · you are ${me.name}, ${roleLabel(me.role).toLowerCase()} · ${summarize(roster(d)).online} online`);
  renderSource();

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
  // live: the approval sheets are filled from the proposal rows. A role that cannot read them (legal, exec, comms) has nothing true
  // to put on them, and a modal over the War Room is the last thing counsel wants: it sees the phase, not the card.
  if (isLive() && !readsResponse()) return false;
  if (ph === "approval") return !S.sheetDismissed;
  const u = U();
  return S.A !== null && u >= 0 && u < ISOLATE_DUR + 0.9;
}

/** When the approval sheet last opened (performance.now), 0 while it is shut. main.ts ignores a click on its buttons for a
 *  moment after that, so a click aimed at the 3D stage cannot approve a quarantine nobody has read. */
export const sheetOpened = { at: 0 };

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
    sheetOpened.at = open ? performance.now() : 0;
  }
  renderHostSheet(host);
  if (open && personSheetOpen()) closePersonQuiet(); // the approval always comes first
  renderPersonSheet();
  if (isLive()) renderJoin();
  const any = open || host || personSheetOpen() || joinOpen() ? "1" : "0";
  if (scrim.dataset.open !== any) {
    scrim.dataset.open = any;
    document.body.dataset.sheet = any;
    $("#appRoot").toggleAttribute("inert", any === "1");
  }
  // only an admin or the Incident Commander can approve: everyone else sees why the button is off
  const me = data().me();
  const may = canApprove(me.role);
  const btn = $("#approveBtn") as HTMLButtonElement;
  const si = isLive() ? sheetInfo() : null;
  if (si) renderLiveApproval(si);
  const off = !may || !!si?.busy;
  if (btn.disabled !== off) btn.disabled = off;
  setText($("#approveNote"), may ? "Warden cannot quarantine a host on its own." : `${me.name} (${me.title}) cannot approve. Only the Incident Commander or an admin can.`);
  const approved = S.A !== null;
  setAttr(sheet, "data-s", approved ? "approved" : "request");
  if (approved) {
    const ap = approverOf(data());
    setText($("#doneTitle"), `Approved by ${ap ? `${ap.name} · ${ap.title}` : `${APPROVER.initials} · ${APPROVER.role}`}`);
    const u = U();
    setText($("#doneSum"), u >= ISOLATE_DUR ? "Host quarantined. The escape stopped at the hypervisor boundary." : `Taking ${info().host} off the fabric and pruning its BMC VLAN.`);
    setText($("#doneNote"), isLive() ? "Recorded in the incident log" : `${fmtT(S.A ?? CANON_APPROVE)} · ⌘↵`);
    $("#doneBar").style.transform = `scaleX(${Math.min(1, Math.max(0, u / ISOLATE_DUR)).toFixed(4)})`;
  }
}


const closePersonQuiet = () => void closePerson();

// ------------------------------------------------------------------ live: the source indicator and the approval content
/** The "Live · SpacetimeDB Maincloud" / "Replay" line in the isolation popover, and the link dot on the Isolated button. */
function renderSource() {
  const row = document.getElementById("srcRow");
  if (!row) return;
  const live = liveSource();
  if (!live) {
    delete document.body.dataset.source;
    return; // scripted: the row keeps the markup it was built with ("Replay")
  }
  document.body.dataset.source = "live";
  const link = live.linkState();
  const name = live.server.label;
  setAttr(row, "data-src", link === "ready" ? "live" : link === "offline" ? "off" : "wait");
  setText($("#srcLabel"), link === "ready" ? `Live · ${name}` : link === "offline" ? `Offline · ${name}` : link === "reconnecting" ? `Reconnecting · ${name}` : `Connecting · ${name}`);
  setText($("#srcSub"), link === "ready" ? `Rows arrive the moment they change. Database ${live.server.db}.` : live.linkError() || "Waiting for the server.");
  setAttr($("#isoBtn"), "data-link", link === "ready" ? "live" : link === "offline" ? "off" : "wait");
}

/** Fill the approval sheet from the quarantine proposal instead of the scripted copy. */
function renderLiveApproval(si: NonNullable<ReturnType<typeof sheetInfo>>) {
  const sheet = $("#sheet");
  setText($("#sheetTitle"), `Quarantine ${si.host}?`);
  setText(sheet.querySelector(".sheet-req .sheet-sum"), si.reason);
  const dd = sheet.querySelectorAll(".sheet-facts dd");
  setText(dd[0] ?? null, si.scope);
  setText(dd[1] ?? null, si.rollback);
  setText(sheet.querySelector(".ev-note"), si.evidence);
  let box = document.getElementById("sheetFiles");
  if (!box) {
    sheet.querySelectorAll(".file").forEach((f) => f.remove()); // the scripted file list
    box = document.createElement("div");
    box.id = "sheetFiles";
    sheet.querySelector(".ev-note")?.after(box);
  }
  setHTML(box, si.files.map((f) => f.name + f.meta).join("|"), () =>
    si.files.map((f) => `<div class="file">${icon("file")}<b>${esc(f.name)}</b><em>${esc(f.meta)}</em></div>`).join(""),
  );
  setText($("#approveBtn span"), si.busy ? "Approving…" : FINAL_STEP.button);
}
