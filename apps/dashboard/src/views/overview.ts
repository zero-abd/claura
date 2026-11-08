import { FLEET, LAST_INCIDENT, FACILITY } from "../script";
import { icon, chev } from "../icons";
import { $, setAttr, setHTML, setText } from "../dom";
import { hostLink } from "../hosts";
import { S, info, isLive, ttc, type Phase } from "../engine";
import { data, roster, summarize } from "../data";
import { scopeSummaryText } from "./scope";

// Overview: calm state. One status, fleet health in one line, the facility stage, the last incident.
export const overview = {
  html(): string {
    return `<section class="view" id="v-overview" data-view="overview">
      <header class="o-hero">
        <div>
          <div class="o-status" id="oStatus">
            <span class="o-badge" id="oBadge"></span>
            <h1 class="o-title" id="oTitle">All clear</h1>
          </div>
          <p class="o-line" id="oLine"></p>
        </div>
        <div class="o-actions" id="oActions"></div>
      </header>

      <div class="glass stage-frame o-stage disc" data-key="map" data-open="0" id="mapStage">
        <div class="stage-slot" data-slot="overview"></div>
        <div class="stage-top">
          <div class="stage-title"><b>${FACILITY.split(" · ")[0]}</b><span>${FACILITY.split(" · ")[1]}</span></div>
          <button type="button" class="icon-btn" data-disc="map" aria-label="Expand facility map" aria-expanded="false">
            ${icon("expand", "ico ico-expand")}${icon("collapse", "ico ico-collapse")}
          </button>
        </div>
        <div class="stage-foot">
          <span><i style="background:rgba(211,211,211,.7)"></i>Load</span>
          <span id="legendHot"><i style="background:var(--accent)"></i>Breach</span>
          <span id="legendSafe"><i style="background:var(--safe)"></i>Contained</span>
        </div>
      </div>

      <button type="button" class="glass last" id="lastRow" data-go="reports" data-target="last-incident">
        <span class="r-ico" id="lastIco">${icon("shieldCheck")}</span>
        <span class="last-main"><b id="lastTitle"></b><span id="lastSub"></span></span>
        <span class="when" id="lastWhen"></span>
        ${chev()}
      </button>

      <div class="ready" id="ready">
        <button type="button" class="glass ready-tile" data-act="isolation" data-target="ready-isolation">
          <span class="r-ico">${icon("shieldLock")}</span>
          <span class="ready-main"><b>Isolated · out-of-band</b><span>No corporate email, phones or SSO</span></span>
        </button>
        <button type="button" class="glass ready-tile" data-go="access" data-target="ready-people" id="readyPeople">
          <span class="r-ico">${icon("users")}</span>
          <span class="ready-main"><b id="rdPeople"></b><span>Break-glass codes, issued in person</span></span>
        </button>
        <button type="button" class="glass ready-tile" data-go="scope" data-target="ready-scope">
          <span class="r-ico">${icon("database")}</span>
          <span class="ready-main"><b id="rdScope"></b><span id="rdScopeSub"></span></span>
        </button>
      </div>
    </section>`;
  },
  render(ph: Phase) {
    const badge = $("#oBadge");
    const live = isLive();
    const I = info();
    const k = (x: string) => (live ? `${x}:${I.host}:${I.resolution.overview}` : x);
    const inc = ph === "breach" || ph === "approval" || ph === "isolating";
    const title =
      ph === "nominal" ? "All clear" : ph === "breach" ? "Breach in progress" : ph === "approval" ? "Waiting on you" : ph === "isolating" ? "Quarantining" : "Contained";
    setText($("#oTitle"), title);
    setHTML(badge, inc ? "inc" : "ok", () => icon(inc ? "incident" : "check"));
    const line = $("#oLine");
    if (ph === "nominal") {
      setHTML(line, "fleet", () => `<b>${FLEET.hosts}</b> hosts<span class="sep">·</span><b>${FLEET.vms}</b> VMs<span class="sep">·</span><b>${FLEET.agents}</b> sandboxed agents`);
    } else if (ph === "breach") {
      setHTML(line, k("b"), () => `Suspected escape on <b>${hostLink(I.host)}</b>. Agents are containing it.`);
    } else if (ph === "approval") {
      setHTML(line, k("a"), () => `Warden needs your approval to quarantine <b>${hostLink(I.host)}</b>.`);
    } else if (ph === "isolating") {
      setHTML(line, k("i"), () => `Taking <b>${hostLink(I.host)}</b> off the fabric.`);
    } else {
      setHTML(line, k("c"), () => I.resolution.overview);
    }
    const act = $("#oActions");
    setHTML(act, inc ? "open" : "none", () =>
      inc ? `<button type="button" class="btn-chip accent" data-go="incident" data-target="open-incident">Open incident</button>` : "",
    );

    // last incident row: live incident replaces the history line
    const row = $("#lastRow");
    if (live) row.hidden = !S.started; // the scripted history (INC-0418 ...) is fiction: live shows only the real incident
    if (!S.started) {
      setAttr(row, "data-go", "reports");
      setText($("#lastTitle"), LAST_INCIDENT.id);
      setText($("#lastSub"), `${LAST_INCIDENT.title}. Contained in ${LAST_INCIDENT.ttc.toFixed(1)} s`);
      setText($("#lastWhen"), LAST_INCIDENT.when);
    } else {
      const v = ttc() ?? 0;
      const done = ph === "contained" || ph === "report";
      setAttr(row, "data-go", done ? "reports" : "incident");
      setText($("#lastTitle"), I.id);
      setText($("#lastSub"), done ? `${I.title}. Contained in ${v.toFixed(1)} s` : I.title);
      setText($("#lastWhen"), done ? "just now" : "live");
    }
    setAttr($("#lastRow"), "data-tone", inc ? "live" : "ok");

    // readiness: the three Winstead questions at a glance (isolated? who has access? what is in scope?)
    const d = data();
    const ppl = roster(d);
    const sum = summarize(ppl);
    ($("#readyPeople") as HTMLElement).hidden = d.me().role !== "admin";
    setText($("#rdPeople"), `${sum.verified} of ${sum.people} people verified`);
    const assets = d.assets();
    setText($("#rdScope"), assets.length ? scopeSummaryText(assets, 2) : "Nothing in scope");
    setText($("#rdScopeSub"), assets.length ? `${assets.length} assets tracked · open the data scope` : "Fills in when an incident opens");
  },
};
