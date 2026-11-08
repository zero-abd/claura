import { FLEET, INCIDENT, LAST_INCIDENT, RESOLUTION, FACILITY } from "../script";
import { icon, chev } from "../icons";
import { $, setAttr, setHTML, setText } from "../dom";
import { hostLink } from "../hosts";
import { S, ttc, type Phase } from "../engine";

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
          <span><i style="background:rgba(196,210,255,.7)"></i>Load</span>
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
    </section>`;
  },
  render(ph: Phase) {
    const badge = $("#oBadge");
    const inc = ph === "breach" || ph === "approval" || ph === "isolating";
    const title =
      ph === "nominal" ? "All clear" : ph === "breach" ? "Breach in progress" : ph === "approval" ? "Waiting on you" : ph === "isolating" ? "Quarantining" : "Contained";
    setText($("#oTitle"), title);
    setHTML(badge, inc ? "inc" : "ok", () => icon(inc ? "incident" : "check"));
    const line = $("#oLine");
    if (ph === "nominal") {
      setHTML(line, "fleet", () => `<b>${FLEET.hosts}</b> hosts<span class="sep">·</span><b>${FLEET.vms}</b> VMs<span class="sep">·</span><b>${FLEET.agents}</b> sandboxed agents`);
    } else if (ph === "breach") {
      setHTML(line, "b", () => `Suspected escape on <b>${hostLink(INCIDENT.host)}</b>. Agents are containing it.`);
    } else if (ph === "approval") {
      setHTML(line, "a", () => `Warden needs your approval to quarantine <b>${hostLink(INCIDENT.host)}</b>.`);
    } else if (ph === "isolating") {
      setHTML(line, "i", () => `Taking <b>${hostLink(INCIDENT.host)}</b> off the fabric.`);
    } else {
      setHTML(line, "c", () => RESOLUTION.replace(" · memory captured", ""));
    }
    const act = $("#oActions");
    setHTML(act, inc ? "open" : "none", () =>
      inc ? `<button type="button" class="btn-chip accent" data-go="incident" data-target="open-incident">Open incident</button>` : "",
    );

    // last incident row: live incident replaces the history line
    const row = $("#lastRow");
    if (!S.started) {
      setAttr(row, "data-go", "reports");
      setText($("#lastTitle"), LAST_INCIDENT.id);
      setText($("#lastSub"), `${LAST_INCIDENT.title}. Contained in ${LAST_INCIDENT.ttc.toFixed(1)} s`);
      setText($("#lastWhen"), LAST_INCIDENT.when);
    } else {
      const v = ttc() ?? 0;
      const done = ph === "contained" || ph === "report";
      setAttr(row, "data-go", done ? "reports" : "incident");
      setText($("#lastTitle"), INCIDENT.id);
      setText($("#lastSub"), done ? `${INCIDENT.title}. Contained in ${v.toFixed(1)} s` : INCIDENT.title);
      setText($("#lastWhen"), done ? "just now" : "live");
    }
    setAttr($("#lastRow"), "data-tone", inc ? "live" : "ok");
  },
};
