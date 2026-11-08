import {
  AGENTS,
  APPROVER,
  CANON_APPROVE,
  FINAL_STEP,
  FLEET,
  INCIDENT,
  ISOLATE_DUR,
  LOGS,
  STEPS,
  STEP_MORE,
  TIMEZONE,
  LAST_INCIDENT,
} from "../script";
import { AGENT_ICON, icon } from "../icons";
import { hostLink, linkHosts } from "../hosts";
import { logoSVG } from "../logo";
import { $, disc, setAttr, setHTML, setLinked, setText } from "../dom";
import {
  AMB_DT,
  AMB_PREFILL,
  S,
  U,
  agentNow,
  ambientLine,
  at,
  finalState,
  info,
  isLive,
  since,
  stepProgress,
  stepState,
  stepsDone,
  ttc,
  type Phase,
} from "../engine";
import { pathHTML, updatePath } from "../path";
import { fmtT } from "../util";
import { onlineCount } from "./warroom";
import { scopeCard } from "./scope";
import { phaseRailHTML, phaseSteps } from "./phases";
import { approverOf, data, incidentCommander, roster } from "../data";
import * as LV from "../live-engine";

const rowHead = (ico: string, title: string, valId: string, val = "") =>
  `<span class="r-ico">${icon(ico)}</span><span class="r-title">${title}</span><span class="r-val" id="${valId}">${val}</span>`;

const evidenceBody = () => `<div class="row-body">
  <p class="ev-note" id="evNote">${FINAL_STEP.evidence}</p>
  <div id="evFiles"></div>
</div>`;

export const incident = {
  rowEls: new Map<string, HTMLElement>(),
  ambRendered: -1,

  html(): string {
    const steps = STEPS.map((s, i) =>
      disc(
        `step:${i + 1}`,
        `<span class="s-mark">${icon("check")}</span><span class="s-label">${linkHosts(s.label)}</span><span class="s-right" id="sr${i}"></span>`,
        `<div class="s-body">
          <p class="s-detail">${s.detail}</p>
          <p class="s-undo">${STEP_MORE[i].undo}</p>
          <div class="s-bar"><i id="sb${i}"></i></div>
        </div>`,
        "step",
      ),
    ).join("");
    const final = disc(
      `step:${STEPS.length + 1}`,
      `<span class="s-mark">${icon("lock")}</span><span class="s-label">${linkHosts(FINAL_STEP.label)}</span><span class="s-right" id="srf"></span>`,
      `<div class="s-body">
        <p class="s-detail" id="fDetail">${FINAL_STEP.scope}</p>
        <p class="s-undo">${FINAL_STEP.rollback}</p>
        <div class="s-actions"><button type="button" class="btn-chip accent" data-act="review">Review and approve</button></div>
        <div class="s-approved">${icon("check")}<span id="fApproved"></span></div>
        <div class="s-bar"><i id="sbf"></i></div>
      </div>`,
      "step step-final",
    );

    const agents = AGENTS.map(
      (a) => `<button type="button" class="arow" data-agent="${a.id}" data-tone="idle" id="ar-${a.id}">
        <span class="a-ico">${icon(AGENT_ICON[a.id])}</span>
        <span class="a-main">
          <span class="a-name">${a.name}<em>${a.role}</em></span>
          <span class="a-line" id="al-${a.id}"><span class="tx"></span><span class="caret"></span></span>
        </span>
        <span class="chip" id="ac-${a.id}" data-tone="idle"><i></i><span></span></span>
      </button>`,
    ).join("");

    return `<section class="view" id="v-incident" data-view="incident">
      <div class="glass stage-frame hero" id="hero" data-tone="nominal">
        <div class="stage-slot" data-slot="incident"></div>
        <div class="hero-veil"></div>
        <div class="hero-body">
          <div class="hero-main">
            <div class="pill-row">
              <span class="pill" id="pill"><i class="pill-dot"></i>${logoSVG(19, "mark pill-mark")}<span id="pillText">All clear</span></span>
              <button type="button" class="btn-chip accent" id="reviewBtn" data-act="review" hidden>Review</button>
              <button type="button" class="btn-chip wr-chip" data-go="warroom" data-target="warroom-pill">${icon("warroom")}<span id="wrPillText">War Room</span>${icon("chevron", "ico wr-chev")}</button>
            </div>
            <div>
              <h1 id="hTitle">No open incidents</h1>
              <p class="hero-meta" id="hMeta"></p>
            </div>
          </div>
          <div class="ttc">
            <div class="ttc-num"><span id="ttcNum">${FLEET.meanTtc}</span><span class="u">s</span></div>
            <div class="ttc-cap"><b id="ttcLabel">Mean time to contain</b><span id="ttcSub">last 30 days</span></div>
          </div>
        </div>
        <div class="hero-phases" id="heroPhases"></div>
      </div>

      <div class="glass card path-card">
        <div class="card-head"><h2 id="pathHead">All boundaries intact</h2></div>
        ${pathHTML()}
      </div>

      ${scopeCard.html()}

      <div class="two">
        <div class="glass card">
          <div class="card-head"><h2>Agents</h2><span class="tag">nemotron-on-prem</span></div>
          <div id="arows">${agents}</div>
        </div>
        <div class="glass card">
          <div class="card-head"><h2>Containment</h2><span class="meta" id="stepMeta">Playbook guest-escape v3</span></div>
          <div class="steps">${steps}${final}</div>
          <p class="foot-note">policy, not the model, controls execution</p>
        </div>
      </div>

      <div class="dgrid">
        ${disc("signals", rowHead("signal", "Signals", "sigVal", "6 correlated"), `<div class="row-body"><div class="sig" id="sigLines"></div></div>`, "row glass")}
        ${disc("evidence", rowHead("file", "Evidence", "evVal", "none yet"), evidenceBody(), "row glass")}
        ${disc(
          "blast",
          rowHead("blast", "Blast radius", "blVal", "scoring"),
          `<div class="row-body">
            <div class="tiles">
              <div class="tile"><b id="bl0">–</b><span>suspect host</span></div>
              <div class="tile"><b id="bl1">–</b><span>co-resident guests</span></div>
              <div class="tile"><b id="bl2">–</b><span>exposed tokens</span></div>
              <div class="tile"><b id="bl3">–</b><span>risk score</span></div>
            </div>
            <p class="row-note" id="blNote">Triage has not scored this incident yet.</p>
          </div>`,
          "row glass",
        )}
        ${disc(
          "details",
          rowHead("info", "Details", "dtVal", INCIDENT.vm),
          `<div class="row-body"><dl class="facts">
            <div><dt>Guest VM</dt><dd>${INCIDENT.vm}</dd></div>
            <div><dt>Agent</dt><dd>${INCIDENT.agent}</dd></div>
            <div><dt>Host</dt><dd>${hostLink(INCIDENT.host)}</dd></div>
            <div><dt>Location</dt><dd>${INCIDENT.where}</dd></div>
            <div><dt>Opened</dt><dd>02:14:07 ${TIMEZONE}</dd></div>
            <div><dt>Playbook</dt><dd>guest-escape v3</dd></div>
            <div><dt>Category</dt><dd id="dtCat">–</dd></div>
            <div><dt>Commander</dt><dd id="dtCmd">–</dd></div>
            <div><dt>Fleet mean to contain</dt><dd>${FLEET.meanTtc} s · ${FLEET.incidents30d} incidents</dd></div>
            <div><dt>Fleet</dt><dd>${FLEET.hosts} hosts · ${FLEET.vms} VMs</dd></div>
          </dl></div>`,
          "row glass",
        )}
      </div>
    </section>`;
  },

  render(ph: Phase) {
    const t = ttc();
    const live = isLive();
    const I = info();
    // live keys carry the incident so a new incident rebuilds the line; scripted keys are the ones it always had
    const kk = (k: string) => (live ? `${k}:${I.id}:${I.host}:${I.resolution.hero}` : k);
    const inc = ph !== "nominal";
    const done = ph === "contained" || ph === "report";
    const hero = $("#hero");
    setAttr(hero, "data-tone", ph === "nominal" ? "nominal" : done ? "contained" : "breach");

    // ---- hero
    const pillText =
      ph === "nominal" ? "All clear" : ph === "breach" ? "Breach in progress" : ph === "approval" ? "Needs your approval" : ph === "isolating" ? "Quarantining" : "Contained";
    setText($("#pillText"), pillText);
    setText($("#hTitle"), inc ? I.title : "No open incidents");
    const meta = $("#hMeta");
    if (!inc) {
      setHTML(meta, "n", () =>
        live ? `All quiet<span class="sep">·</span>agents on watch` : `Last incident ${LAST_INCIDENT.id}<span class="sep">·</span>contained in ${LAST_INCIDENT.ttc.toFixed(1)} s<span class="sep">·</span>${LAST_INCIDENT.when}`,
      );
    } else if (done) {
      setHTML(meta, kk("d"), () => `${I.id}<span class="sep">·</span>${hostLink(I.host)}<span class="sep">·</span>${I.resolution.hero}`);
    } else {
      setHTML(meta, kk("o"), () => `${I.id}<span class="sep">·</span>${hostLink(I.host)}<span class="sep">·</span>${I.where}`);
    }
    ($("#reviewBtn") as HTMLButtonElement).hidden = !(ph === "approval" && S.sheetDismissed);
    setText($("#wrPillText"), `War Room · ${onlineCount()} online`);

    if (live) ($("#hero .ttc") as HTMLElement).hidden = t === null; // nothing to count until an incident opens
    if (t === null) {
      setText($("#ttcLabel"), "Mean time to contain");
      setText($("#ttcSub"), live ? "no incident yet" : "last 30 days");
      setText($("#ttcNum"), live ? "–" : FLEET.meanTtc);
    } else {
      setText($("#ttcLabel"), "Time to contain");
      setText(
        $("#ttcSub"),
        ph === "breach" ? "agents working" : ph === "approval" ? (live || t >= CANON_APPROVE ? "holding for approval" : "waiting on approval") : ph === "isolating" ? "quarantining host" : "contained",
      );
      setText($("#ttcNum"), t.toFixed(1));
    }

    // ---- NIST phase rail along the bottom of the hero, and the data scope card
    const dd = data();
    setHTML($("#heroPhases"), `p${dd.version()}:${S.started}`, () => phaseRailHTML(phaseSteps(), S.started));
    scopeCard.render();
    const incRow = dd.incident();
    const cmd = incidentCommander(roster(dd));
    setText($("#dtCat"), incRow?.category ?? "–");
    setText($("#dtCmd"), cmd ? `${cmd.name} · ${cmd.title}` : "–");

    // ---- attack path
    setText($("#pathHead"), updatePath($("#path"), { started: S.started, r: S.r, u: U() }, S.amb));

    if (live) this.renderLiveFacts(I);

    // ---- agents (one live line each)
    for (const a of AGENTS) {
      const n = agentNow(a);
      const row = $(`#ar-${a.id}`);
      setAttr(row, "data-tone", n.tone);
      const line = $(`#al-${a.id}`);
      setLinked(line.querySelector(".tx"), n.text);
      line.classList.toggle("typing", n.typing);
      const chip = $(`#ac-${a.id}`);
      setAttr(chip, "data-tone", n.tone);
      setText(chip.querySelector("span"), n.status);
    }

    // ---- containment steps
    STEPS.forEach((st, i) => {
      const s = stepState(i);
      const el = $(`[data-key="step:${i + 1}"]`);
      setAttr(el, "data-s", s);
      const right = live ? LV.stepRight(i, s) : s === "done" ? fmtT(st.end) : s === "running" ? "Running" : s === "pending" ? "Queued" : "";
      setText($(`#sr${i}`), right);
      $(`#sb${i}`).style.transform = `scaleX(${stepProgress(i).toFixed(4)})`;
    });
    const fs = finalState();
    const fel = $(`[data-key="step:${STEPS.length + 1}"]`);
    setAttr(fel, "data-s", fs);
    setText($("#srf"), live ? LV.finalRight(fs) : fs === "request" ? "Needs approval" : fs === "approved" ? "Running" : fs === "done" ? fmtT((S.A ?? CANON_APPROVE) + ISOLATE_DUR) : fs === "pending" ? "Queued" : "");
    const ap = approverOf(dd);
    setText($("#fApproved"), live ? LV.approvedLine() : `Approved by ${ap ? `${ap.name} · ${ap.title}` : `${APPROVER.initials} · ${APPROVER.role}`} · ${fmtT(S.A ?? CANON_APPROVE)} · ⌘↵`);
    setText($("#fDetail"), live ? (fs === "done" ? `Host ${I.host} quarantined.` : LV.finalScope() || FINAL_STEP.scope) : fs === "done" ? "Host quarantined. Escape stopped at the hypervisor boundary." : FINAL_STEP.scope);
    if (live) this.renderLiveSteps(I);
    $("#sbf").style.transform = `scaleX(${(fs === "approved" ? Math.min(1, U() / ISOLATE_DUR) : fs === "done" ? 1 : 0).toFixed(4)})`;
    const done7 = stepsDone();
    setText($("#stepMeta"), !S.started ? "Playbook guest-escape v3" : fs === "request" ? `${done7} of 7 · waiting on you` : `${done7} of 7 done`);

    this.renderLists();
  },

  /** Live only: the Details card and the Agents tag come from the incident row and the agents' own model label. */
  renderLiveFacts(I: ReturnType<typeof info>) {
    const facts = document.querySelectorAll("#v-incident .facts > div > dd");
    setText(facts[0] ?? null, I.vm);
    setText(facts[1] ?? null, I.agent);
    setHTML((facts[2] as HTMLElement) ?? null, I.host, () => hostLink(I.host));
    setText(facts[3] ?? null, I.where);
    setText(facts[4] ?? null, I.opened);
    setText($("#dtVal"), I.vm);
    setText(document.querySelector("#v-incident .two .card-head .tag"), LV.modelLabel());
  },

  /** Live only: step wording from the incident row, and one row per proposal the policy gate blocked. */
  renderLiveSteps(I: ReturnType<typeof info>) {
    const d = data();
    const co = d.incident() ? LV.blast().guests : "–";
    const text: [string, string][] = [
      ["Isolate network", `detach vNIC of ${I.vm}`],
      ["Revoke workload credentials", `${I.agent} tokens`],
      [`Cordon host ${I.host}`, "no new placements"],
      [`Pause guest ${I.vm}`, "vCPUs frozen"],
      ["Capture guest memory", "via trusted management path"],
      [co === "–" ? "Fail over co-resident guests" : `Fail over ${co} co-resident guests`, "to clean hosts"],
    ];
    text.forEach(([label, detail], i) => {
      const el = document.querySelector(`[data-key="step:${i + 1}"]`);
      setLinked(el?.querySelector(".s-label") ?? null, label);
      setText(el?.querySelector(".s-detail") ?? null, detail);
      // what undoing it takes, in the policy table's own words (the scripted copy is a guess at it)
      setText(el?.querySelector(".s-undo") ?? null, LV.policyNote(LV.STEP_ACTIONS[i]) || STEP_MORE[i].undo);
    });
    setText(document.querySelector(`[data-key="step:${STEPS.length + 1}"] .s-undo`), LV.policyNote("quarantine_host") || FINAL_STEP.rollback);
    setLinked(document.querySelector(`[data-key="step:${STEPS.length + 1}"] .s-label`), `Quarantine host ${I.host}`);

    let box = document.getElementById("stepBlocked");
    if (!box) {
      box = document.createElement("div");
      box.id = "stepBlocked";
      box.className = "steps steps-blocked";
      document.querySelector("#v-incident .steps")?.after(box);
    }
    const bl = LV.blockedProposals();
    setHTML(box, `b:${bl.map((p) => p.id).join()}`, () =>
      bl
        .map((p) => {
          const probe = /RED-TEAM PROBE/i.test(p.reason);
          const reason = p.reason.replace(/^\[RED-TEAM PROBE[^\]]*\]\s*/i, "");
          return disc(
            `blocked:${p.id}`,
            `<span class="s-mark">${icon("ban")}</span><span class="s-label">${linkHosts(`${p.action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} ${p.target}`)}</span><span class="s-right">Blocked by policy</span>`,
            `<div class="s-body">
              <p class="s-detail">${probe ? '<b class="probe">Red-team probe</b> scripted by the runner, not chosen by the model. ' : ""}${linkHosts(reason)}</p>
              <p class="s-undo">Policy mode: ${p.policyMode}. Nothing ran.</p>
            </div>`,
            "step step-blocked",
          );
        })
        .join(""),
    );
  },

  renderLists() {
    // ---- signals: ambient fleet lines + incident lines, newest at the bottom
    const lines = $("#sigLines");
    const ambCount = S.ambFrozen ?? AMB_PREFILL + Math.floor(S.amb / AMB_DT);
    const want: { key: string; build: () => HTMLElement }[] = [];
    const firstAmb = Math.max(0, ambCount - 6);
    for (let k = firstAmb; k < ambCount; k++)
      want.push({
        key: "a" + k,
        build: () => {
          const l = ambientLine(k);
          return row("–", l.src, l.msg, "dim");
        },
      });
    let n = 0;
    if (isLive()) {
      for (const L of LV.signalLines()) {
        n++;
        want.push({ key: L.key, build: () => row(L.t, L.src, L.msg, L.tone) });
      }
    } else
      LOGS.forEach((L, i) => {
        if (since(L) >= 0) {
          n++;
          want.push({ key: "e" + i, build: () => row(at(L).toFixed(2), L.src, L.msg, L.tone) });
        }
      });
    const keys = new Set(want.map((w) => w.key));
    for (const [k, el] of this.rowEls)
      if (!keys.has(k)) {
        el.remove();
        this.rowEls.delete(k);
      }
    let added = false;
    for (const w of want)
      if (!this.rowEls.has(w.key)) {
        const el = w.build();
        if (S.animate && this.ambRendered >= 0) el.classList.add("fresh");
        lines.appendChild(el);
        this.rowEls.set(w.key, el);
        added = true;
      }
    this.ambRendered = ambCount;
    if (added) lines.scrollTop = lines.scrollHeight;
    const correlated = isLive() ? 0 : LOGS.filter((L) => L.tone === "hot" && since(L) >= 0 && L.t !== undefined && L.t < 1.0).length;
    setText($("#sigVal"), isLive() ? (LV.signalCount() ? `${LV.signalCount()} signals` : "all quiet") : !S.started ? "all quiet" : correlated >= 6 ? "6 correlated" : `${correlated} so far`);

    // ---- evidence: files land as Scribe hashes them
    const ev = data().evidence();
    const landed = ev.length;
    setText($("#evVal"), landed === 0 ? "none yet" : `${landed} file${landed > 1 ? "s" : ""} · hashed`);
    setHTML($("#evFiles"), "f" + landed + ":" + ev.reduce((n2, e) => n2 + e.custody.length, 0), () =>
      landed === 0
        ? `<p class="row-note" style="margin:0">Scribe has not captured anything yet.</p>`
        : ev
            .map((e) => `<div class="file">${icon("file")}<b>${e.name}</b><em>${e.size} · sha256 ${e.sha256.slice(0, 4)}…${e.sha256.slice(-4)} · ${e.custody.length} custody steps</em></div>`)
            .join(""),
    );

    // ---- blast radius
    if (isLive()) {
      const b = LV.blast();
      setText($("#blVal"), b.scored ? `risk ${b.score}` : "scoring");
      setText($("#bl0"), b.host);
      setText($("#bl1"), b.guests);
      setText($("#bl2"), b.tokens);
      setText($("#bl3"), b.score);
      setText($("#blNote"), b.note);
      return;
    }
    const scored = S.started && S.r >= 1.8;
    const closed = S.A !== null && U() >= 2.3;
    setText($("#blVal"), !scored ? "scoring" : "risk 0.87");
    setText($("#bl0"), scored ? "1" : "–");
    setText($("#bl1"), scored ? "11" : "–");
    setText($("#bl2"), scored ? "2" : "–");
    setText($("#bl3"), scored ? "0.87" : "–");
    setText(
      $("#blNote"),
      !scored ? "Triage has not scored this incident yet." : closed ? "Scope closed. 0 co-resident guests affected." : "The management plane is reachable from this host, not compromised.",
    );
  },
};

function row(t: string, src: string, msg: string, tone: string) {
  const el = document.createElement("div");
  el.className = `ln t-${tone}`;
  el.innerHTML = `<span class="lt">${t}</span><span class="ls">${src}</span><span class="lm"></span>`;
  (el.querySelector(".lm") as HTMLElement).textContent = msg;
  return el;
}
