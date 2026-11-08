import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./style.css";

import {
  AGENTS,
  AMBIENT_TEMPLATES,
  APPROVAL_AT,
  APPROVER,
  CANON_APPROVE,
  CLOCK_BASE,
  CONTAINED_AT,
  EVIDENCE,
  FACILITY,
  FINAL_STEP,
  INCIDENT,
  ISOLATE_DUR,
  LOGS,
  OPERATORS,
  REPORT,
  RESOLUTION,
  SCRIBE_FILED_U,
  SCRIPT_END_U,
  STEPS,
  TIMEZONE,

} from "./script";
import { FacilityMap } from "./map";
import { chainSVG, updateChain } from "./chain";
import { clamp, fmtT, hash, noise } from "./util";

// The Bulkhead mark: hull section with a sealed door (same path as /logo.svg).
const LOGO_PATH =
  "M24 44H232V116C232 174 188 220 128 232C68 220 24 174 24 116ZM88 108A40 40 0 0 1 168 108V164A40 40 0 0 1 88 164ZM100 108A28 28 0 0 1 156 108V164A28 28 0 0 1 100 164ZM106 130H150V142H106Z";

type Phase = "nominal" | "breach" | "approval" | "isolating" | "contained" | "report";

// ------------------------------------------------------------------ state
const S = {
  started: false,
  running: false,
  r: 0, // script seconds since play()
  A: null as number | null, // script time of approval
  autoApprove: null as number | null,
  report: false,
  amb: 0, // ambient seconds (never touches the wall clock)
  ambFrozen: null as number | null,
  animate: true,
};
const CPS = 66; // typewriter characters per second
const AMB_DT = 0.9;
const AMB_PREFILL = 16;

const U = () => (S.A === null ? -1e9 : S.r - S.A);
function since(e: { t?: number; u?: number }): number {
  if (!S.started) return e.t !== undefined && e.t < 0 ? 1e9 : -1e9;
  if (e.t !== undefined) return S.r - e.t;
  if (S.A === null) return -1e9;
  return S.r - S.A - (e.u ?? 0);
}
const at = (e: { t?: number; u?: number }) => (e.t !== undefined ? e.t : (S.A ?? CANON_APPROVE) + (e.u ?? 0));

function phase(): Phase {
  if (!S.started) return "nominal";
  if (S.A === null) return S.r < APPROVAL_AT ? "breach" : "approval";
  if (U() < ISOLATE_DUR) return "isolating";
  return S.report ? "report" : "contained";
}
function ttc(): number | null {
  if (!S.started) return null;
  if (S.A === null) return Math.min(S.r, CANON_APPROVE);
  const cA = Math.min(S.A, CANON_APPROVE);
  const u = U();
  if (u >= ISOLATE_DUR) return CONTAINED_AT;
  return cA + ((CONTAINED_AT - cA) * Math.max(0, u)) / ISOLATE_DUR;
}

// ------------------------------------------------------------------ dom
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const setText = (el: Element | null, v: string) => {
  if (el && el.textContent !== v) el.textContent = v;
};
const setAttr = (el: Element | null, k: string, v: string) => {
  if (el && el.getAttribute(k) !== v) el.setAttribute(k, v);
};
const CHECK = `<svg viewBox="0 0 16 16" class="ico"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function logoSVG(size: number) {
  return `<svg viewBox="0 0 256 256" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;
}

function build() {
  const app = $("#app");
  app.innerHTML = `
  <header class="top">
    <div class="brand">${logoSVG(26)}<span class="word">Bulkhead</span></div>
    <div class="site">
      <span class="facility">${FACILITY}</span>
      <span class="clock"><span id="clock">02:14:07</span><span class="tz">${TIMEZONE}</span></span>
    </div>
    <div class="tagline">Seal the breach before it spreads.</div>
    <div class="presence">
      <div class="avatars">${OPERATORS.map((o, i) => `<span class="av av${i}" id="av${i}" title="${o.role}">${o.initials}</span>`).join("")}</div>
      <div class="presence-text"><b>3 operators</b><span>synced via SpacetimeDB</span></div>
    </div>
    <div class="status" id="status" data-tone="nominal"><i></i><span id="statusText">NOMINAL</span></div>
  </header>

  <main class="grid">
    <section class="col col-left">
      <div class="panel map-panel">
        <div class="ph"><h2>Facility</h2><span class="meta">4 halls · 128 racks</span></div>
        <canvas id="map"></canvas>
      </div>
      <div class="panel kpis">
        <div class="kpi-list">
          <div class="kpi"><span class="k-label">Hosts</span><span class="k-sub">16 per rack</span><span class="k-val">2,048</span></div>
          <div class="kpi"><span class="k-label">Guest VMs</span><span class="k-sub">9 per host</span><span class="k-val">18,432</span></div>
          <div class="kpi"><span class="k-label">Sandboxed agents</span><span class="k-sub">in guest VMs</span><span class="k-val">61,207</span></div>
        </div>
        <div class="ttc" id="ttc" data-s="idle">
          <div class="ttc-head"><span class="k-label" id="ttcLabel">Mean time to contain</span><span class="ttc-sub" id="ttcSub">30 days · 23 incidents</span></div>
          <div class="ttc-val"><span id="ttcNum">11.8</span><span class="unit">s</span></div>
          <div class="ruler" id="ruler">
            <div class="ruler-track"><div class="ruler-fill" id="rulerFill"></div><div id="rulerMarks"></div></div>
            <div class="ruler-ticks">${[0, 2, 4, 6, 8, 10, 12].map((n) => `<span style="left:${(n / 12) * 100}%">${n}</span>`).join("")}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="col col-center">
      <div class="ihead" id="ihead" data-s="nominal">
        <div class="ih-main">
          <div class="ih-kicker" id="ihKicker"></div>
          <h1 id="ihTitle">No open incidents</h1>
          <div class="ih-line" id="ihLine"></div>
        </div>
        <button class="btn-ghost" id="openReport" type="button">Open report</button>
      </div>
      <div class="panel chain-panel">
        <div class="ph"><h2>Attack path</h2><span class="meta" id="chainMeta">All boundaries intact</span></div>
        <div class="chain" id="chain">${chainSVG()}</div>
      </div>
      <div class="lower">
        <div class="panel stream">
          <div class="ph"><h2>Signal stream</h2><span class="meta"><i class="live"></i>SpacetimeDB · incident_events · <b id="rows">0 rows</b></span></div>
          <div class="lines" id="lines"></div>
        </div>
        <div class="panel plan">
          <div class="ph"><h2>Containment plan</h2><span class="meta" id="planMeta">playbook guest-escape v3</span></div>
          <ol class="steps" id="steps">
            ${STEPS.map(
              (s, i) => `<li class="step" id="st${i}" data-s="idle"><span class="sn">${i + 1}</span><span class="sl"><b>${s.label}</b><em>${s.detail}</em></span><span class="sr" id="sr${i}"></span><span class="sbar"><i id="sb${i}"></i></span></li>`,
            ).join("")}
          </ol>
          <div class="final" id="final" data-s="idle">
            <div class="final-row"><span class="sn">7</span><span class="sl"><b>${FINAL_STEP.label}</b><em id="finalSub">needs human approval</em></span><span class="sr" id="finalState"></span></div>
            <div class="final-body"><div class="final-inner">
              <p class="reason"><span>Warden</span>${FINAL_STEP.reason}</p>
              <dl class="facts">
                <dt>Evidence</dt><dd>${FINAL_STEP.evidence}</dd>
                <dt>Scope</dt><dd>${FINAL_STEP.scope}</dd>
                <dt>Rollback</dt><dd>${FINAL_STEP.rollback}</dd>
              </dl>
              <div class="approve-row" id="approveRow">
                <button class="btn-approve" id="approveBtn" type="button"><span>${FINAL_STEP.button}</span><kbd>⌘↵</kbd></button>
                <span class="approve-note" id="approveNote">Warden cannot quarantine a host on its own.</span>
              </div>
              <div class="sbar final-bar"><i id="finalBar"></i></div>
            </div></div>
          </div>
          <p class="caption">policy, not the model, controls execution</p>
        </div>
      </div>
    </section>

    <section class="col col-right">
      <div class="ph"><h2>Defender agents</h2><span class="meta">NVIDIA Nemotron · on-prem</span></div>
      <div class="agents">
        ${AGENTS.map(
          (a) => `<article class="agent" id="ag-${a.id}" data-tone="idle">
            <div class="ag-top">
              <div class="ag-id"><h3>${a.name}</h3><span class="ag-role">${a.role}</span></div>
              <span class="chip" id="chip-${a.id}" data-tone="idle"><i></i><span></span></span>
            </div>
            <div class="ag-tags"><span class="tag">nemotron-on-prem</span>${a.id === "warden" ? `<span class="tag tag-policy">policy-bounded</span>` : ""}</div>
            <p class="thought" id="th-${a.id}"><span class="tx"></span><span class="caret"></span></p>
            ${a.id === "warden" ? `<p class="policy">policy: actions limited to playbook scope</p>` : ""}
            <div class="ag-foot"><span class="stamp" id="ts-${a.id}">—</span><span class="bars" id="bars-${a.id}">${Array.from({ length: 22 }, () => "<i></i>").join("")}</span></div>
          </article>`,
        ).join("")}
      </div>
    </section>
  </main>

  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer" aria-label="Incident report">
    <div class="dr-head">
      <div><span class="dr-kicker">Incident report · written by Scribe</span><h2>${INCIDENT.id}</h2></div>
      <button class="btn-ghost" id="closeReport" type="button">Close <kbd>Esc</kbd></button>
    </div>
    <div class="dr-body">
      <p class="dr-title">${INCIDENT.title}</p>
      <p class="dr-res" id="drRes">${RESOLUTION}</p>
      <dl class="dr-facts">
        <div><dt>Guest VM</dt><dd>${INCIDENT.vm}</dd></div>
        <div><dt>Agent</dt><dd>${INCIDENT.agent}</dd></div>
        <div><dt>Host</dt><dd>${INCIDENT.host}</dd></div>
        <div><dt>Location</dt><dd>${INCIDENT.where}</dd></div>
        <div><dt>Opened</dt><dd>02:14:07 ${TIMEZONE}</dd></div>
        <div><dt>Approved by</dt><dd>${APPROVER.initials} · ${APPROVER.role}</dd></div>
      </dl>
      <h3 class="dr-h">Timeline</h3>
      <table class="dr-table"><thead><tr><th>T+</th><th>Actor</th><th>Action</th><th>Authorized by</th></tr></thead><tbody id="drRows"></tbody></table>
      <h3 class="dr-h">Evidence</h3>
      <ul class="dr-ev">${EVIDENCE.map((e) => `<li><span>${e.name}</span><em>${e.meta}</em></li>`).join("")}</ul>
      <p class="dr-foot">Every row above is in SpacetimeDB and synced live to 3 operators. Agents reasoned with NVIDIA Nemotron on-prem; the playbook policy bounded every action.</p>
    </div>
  </aside>`;
}

// ------------------------------------------------------------------ renderers
let map: FacilityMap;

function renderTop(ph: Phase) {
  const sec = S.started ? Math.floor(S.r) : 0;
  const total = CLOCK_BASE.h * 3600 + CLOCK_BASE.m * 60 + CLOCK_BASE.s + sec;
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, "0");
  const mm = String(Math.floor(total / 60) % 60).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  setText($("#clock"), `${hh}:${mm}:${ss}`);

  const st = $("#status");
  const tone = ph === "nominal" ? "nominal" : ph === "contained" || ph === "report" ? "contained" : "breach";
  setAttr(st, "data-tone", tone);
  setText($("#statusText"), tone === "nominal" ? "NOMINAL" : tone === "breach" ? "BREACH" : "CONTAINED");
  const av = $("#av0");
  setAttr(av, "data-s", ph === "approval" ? "looking" : ph === "isolating" ? "approved" : "");
}

function renderHead(ph: Phase) {
  const head = $("#ihead");
  const s = ph === "nominal" ? "nominal" : ph === "contained" || ph === "report" ? "contained" : "open";
  if (head.dataset.s !== s || !head.dataset.built) {
    head.dataset.s = s;
    head.dataset.built = "1";
    if (s === "nominal") {
      $("#ihKicker").innerHTML = `<span class="ih-quiet">Incident queue</span>`;
      setText($("#ihTitle"), "No open incidents");
      $("#ihLine").innerHTML = `<span class="ih-note">Last incident INC-0418 was contained in 8.1 s, 6 days ago.</span>`;
    } else {
      setText($("#ihTitle"), INCIDENT.title);
      $("#ihKicker").innerHTML =
        s === "open"
          ? `<span class="inc-chip">${INCIDENT.id}</span><span>critical</span><span class="sep"></span><span>opened 02:14:07 ${TIMEZONE}</span>`
          : `<span class="inc-chip safe">${INCIDENT.id}</span><span>contained</span><span class="sep"></span><span>02:14:16 ${TIMEZONE}</span>`;
      $("#ihLine").innerHTML =
        s === "open"
          ? [
              ["Guest VM", INCIDENT.vm],
              ["Agent", INCIDENT.agent],
              ["Host", INCIDENT.host],
              ["Location", INCIDENT.where],
            ]
              .map(([k, v]) => `<span class="fact"><span>${k}</span><b>${v}</b></span>`)
              .join("")
          : `<span class="resolution">${CHECK}${RESOLUTION}</span>`;
    }
  }
}

function renderTTC(ph: Phase) {
  const v = ttc();
  const el = $("#ttc");
  const s = v === null ? "idle" : ph === "contained" || ph === "report" ? "safe" : "live";
  setAttr(el, "data-s", s);
  if (v === null) {
    setText($("#ttcLabel"), "Mean time to contain");
    setText($("#ttcSub"), "last 30 days");
    setText($("#ttcNum"), "11.8");
  } else {
    setText($("#ttcLabel"), "Time to contain");
    const sub =
      ph === "breach" ? "agents working" : ph === "approval" ? (v >= CANON_APPROVE ? "holding for approval" : "waiting on approval") : ph === "isolating" ? "quarantining host" : "contained";
    setText($("#ttcSub"), sub);
    setText($("#ttcNum"), v.toFixed(1));
  }
  const fill = $("#rulerFill");
  const w = v === null ? 0 : clamp(v / 12) * 100;
  fill.style.width = `${w}%`;
  // markers for finished steps
  const marks: number[] = [];
  if (v !== null) {
    if (S.r >= 1.0) marks.push(1.0);
    for (const st of STEPS) if (S.r >= st.end) marks.push(st.end);
    if (S.A !== null && U() >= ISOLATE_DUR) marks.push(CONTAINED_AT);
  }
  const key = marks.join(",");
  const mk = $("#rulerMarks");
  if (mk.dataset.k !== key) {
    mk.dataset.k = key;
    mk.innerHTML = marks.map((m) => `<i style="left:${(m / 12) * 100}%"></i>`).join("");
  }
}

// --- signal stream
const rowEls = new Map<string, HTMLElement>();
let ambientCountRendered = -1;
function ambientLine(k: number) {
  const host = `${"abcd"[k % 4]}${String(1 + Math.floor(hash(k, 3) * 32)).padStart(2, "0")}-gpu-${String(1 + Math.floor(hash(k, 5) * 16)).padStart(2, "0")}`;
  const tpl = AMBIENT_TEMPLATES[Math.floor(hash(k, 1) * AMBIENT_TEMPLATES.length)];
  return { src: "fleet", msg: tpl(host, k + 3) };
}
function renderStream() {
  const lines = $("#lines");
  const ambCount = S.ambFrozen ?? AMB_PREFILL + Math.floor(S.amb / AMB_DT);
  const want: { key: string; build: () => HTMLElement }[] = [];
  const firstAmb = Math.max(0, ambCount - 22);
  for (let k = firstAmb; k < ambCount; k++) {
    want.push({
      key: "a" + k,
      build: () => {
        const l = ambientLine(k);
        return row("–", l.src, l.msg, "dim");
      },
    });
  }
  let n = 0;
  LOGS.forEach((L, i) => {
    if (since(L) >= 0) {
      n++;
      want.push({ key: "e" + i, build: () => row(at(L).toFixed(2), L.src, L.msg, L.tone) });
    }
  });
  setText($("#rows"), n === 1 ? "1 row" : `${n} rows`);
  // diff: remove stale
  const keys = new Set(want.map((w) => w.key));
  for (const [k, el] of rowEls) {
    if (!keys.has(k)) {
      el.remove();
      rowEls.delete(k);
    }
  }
  for (const w of want) {
    if (!rowEls.has(w.key)) {
      const el = w.build();
      if (S.animate && ambientCountRendered >= 0) el.classList.add("fresh");
      lines.appendChild(el);
      rowEls.set(w.key, el);
    }
  }
  ambientCountRendered = ambCount;
  // incident lines turn ambient into history
  lines.classList.toggle("has-incident", n > 0);
}
function row(t: string, src: string, msg: string, tone: string) {
  const el = document.createElement("div");
  el.className = `ln t-${tone}`;
  el.innerHTML = `<span class="lt">${t}</span><span class="ls">${src}</span><span class="lm"></span>`;
  (el.querySelector(".lm") as HTMLElement).textContent = msg;
  return el;
}

// --- plan
function renderPlan(ph: Phase) {
  let done = 0;
  STEPS.forEach((st, i) => {
    const li = $(`#st${i}`);
    let s = "idle";
    let right = "";
    if (S.started) {
      if (S.r < st.start) {
        s = "pending";
        right = "queued";
      } else if (S.r < st.end) {
        s = "running";
        right = "running";
      } else {
        s = "done";
        right = fmtT(st.end);
        done++;
      }
    }
    setAttr(li, "data-s", s);
    const sr = $(`#sr${i}`);
    if (s === "done") {
      if (sr.dataset.k !== right) {
        sr.dataset.k = right;
        sr.innerHTML = `${CHECK}<span>${right}</span>`;
      }
    } else {
      sr.dataset.k = "";
      setText(sr, right);
    }
    const p = s === "running" ? (S.r - st.start) / (st.end - st.start) : s === "done" ? 1 : 0;
    $(`#sb${i}`).style.transform = `scaleX(${p.toFixed(4)})`;
  });

  const fin = $("#final");
  let fs = "idle";
  if (S.started) {
    if (S.r < APPROVAL_AT) fs = "pending";
    else if (S.A === null) fs = "request";
    else if (U() < ISOLATE_DUR) fs = "approved";
    else fs = "done";
  }
  setAttr(fin, "data-s", fs);
  $(".plan").classList.toggle("compact", fs === "request" || fs === "approved" || fs === "done");
  const fstate = $("#finalState");
  const key = fs + (S.A ?? "");
  if (fstate.dataset.k !== key) {
    fstate.dataset.k = key;
    if (fs === "pending") fstate.textContent = "queued";
    else if (fs === "request") fstate.innerHTML = `<span class="need">Needs approval</span>`;
    else if (fs === "approved") fstate.textContent = "running";
    else if (fs === "done") fstate.innerHTML = `${CHECK}<span>${fmtT((S.A ?? CANON_APPROVE) + ISOLATE_DUR)}</span>`;
    else fstate.textContent = "";
    const note = $("#approveNote");
    if (fs === "approved" || fs === "done") {
      note.innerHTML = `Approved by <b>${APPROVER.initials}</b> · ${APPROVER.role} · ${fmtT(S.A ?? CANON_APPROVE)} · ⌘↵`;
    } else {
      note.textContent = "Warden cannot quarantine a host on its own.";
    }
  }
  if (fs === "done") done++;
  setText($("#finalSub"), fs === "done" ? "quarantined · rollback: un-quarantine" : "needs human approval");
  const fp = fs === "approved" ? clamp(U() / ISOLATE_DUR) : fs === "done" ? 1 : 0;
  $("#finalBar").style.transform = `scaleX(${fp.toFixed(4)})`;
  (fin.querySelector(".btn-approve") as HTMLButtonElement).disabled = fs !== "request";

  setText(
    $("#planMeta"),
    ph === "nominal" ? "playbook guest-escape v3" : `${done} of 7 done${fs === "request" ? " · waiting on you" : ""}`,
  );
}

// --- agents
function renderAgents() {
  for (const a of AGENTS) {
    let cur = a.thoughts[0];
    let el = 1e9;
    for (const th of a.thoughts) {
      const s = since(th);
      if (s >= 0) {
        cur = th;
        el = s;
      }
    }
    const card = $(`#ag-${a.id}`);
    const full = cur.text;
    const n = cur.quiet || !S.animate ? full.length : Math.min(full.length, Math.floor(el * CPS));
    const typing = n < full.length;
    const th = $(`#th-${a.id}`);
    setText(th.querySelector(".tx"), full.slice(0, n));
    th.classList.toggle("typing", typing);
    th.classList.toggle("active", cur.tone === "busy" || cur.tone === "hot");
    setAttr(card, "data-tone", cur.tone);
    const chip = $(`#chip-${a.id}`);
    setAttr(chip, "data-tone", cur.tone);
    setText(chip.querySelector("span"), cur.status);
    // timestamp: the moment this thought started
    const stamp = !S.started || (cur.t !== undefined && cur.t < 0) ? "idle" : fmtT(cur.quiet ? at(a.thoughts[a.thoughts.indexOf(cur) - 1] ?? cur) : at(cur));
    setText($(`#ts-${a.id}`), stamp);
    // activity bars (seeded noise)
    const bars = $(`#bars-${a.id}`).children;
    const busy = cur.tone === "busy" || (cur.tone === "hot" && typing);
    const seed = a.id.length * 31 + a.id.charCodeAt(0);
    for (let i = 0; i < bars.length; i++) {
      const h = busy ? 0.18 + 0.82 * noise(seed + i, S.amb * 7 + i * 0.37) : 0.12 + 0.1 * hash(seed, i);
      (bars[i] as HTMLElement).style.transform = `scaleY(${h.toFixed(3)})`;
    }
  }
}

// --- report drawer
function renderDrawer() {
  document.body.classList.toggle("report-open", S.report);
  const tb = $("#drRows");
  const rows = REPORT.filter((r) => since(r) >= 0 || (S.A !== null && r.u !== undefined && U() >= r.u));
  const key = rows.length + ":" + (S.A ?? "");
  if (tb.dataset.k === key) return;
  tb.dataset.k = key;
  tb.innerHTML = rows
    .map((r) => {
      const human = r.actor === APPROVER.initials;
      return `<tr class="${human ? "human" : ""}${r.u === ISOLATE_DUR ? " win" : ""}"><td class="mono">${at(r).toFixed(1)}</td><td>${r.actor}</td><td>${r.action}</td><td class="by">${r.by}</td></tr>`;
    })
    .join("");
}

let lastPhase: Phase | null = null;
function render() {
  const ph = phase();
  document.body.dataset.phase = ph;
  renderTop(ph);
  renderHead(ph);
  renderTTC(ph);
  renderStream();
  renderPlan(ph);
  renderAgents();
  renderDrawer();
  const meta = updateChain($("#chain"), { started: S.started, r: S.r, u: U() }, S.amb);
  setText($("#chainMeta"), meta);
  map.draw({ amb: S.amb, started: S.started, r: S.started ? S.r : -1e9, u: U() });
  if (ph !== lastPhase) {
    lastPhase = ph;
    window.dispatchEvent(new CustomEvent("bulkhead:phase", { detail: ph }));
  }
}

// ------------------------------------------------------------------ engine
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
  for (const el of rowEls.values()) el.remove();
  rowEls.clear();
  ambientCountRendered = -1;
}

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

const api = {
  reset() {
    settle(() => {
      S.started = false;
      S.running = false;
      S.r = 0;
      S.A = null;
      S.autoApprove = null;
      S.report = false;
      S.ambFrozen = null;
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
    S.report = false;
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
  openReport() {
    S.report = true;
    render();
  },
  closeReport() {
    S.report = false;
    render();
  },
  /** Jump to script time t (seconds) and hold. approveAt defaults to 7.4. */
  seek(t: number, opts: { approveAt?: number | null; run?: boolean; report?: boolean } = {}) {
    settle(() => {
      S.report = !!opts.report;
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
    });
  },
  get state(): Phase {
    return phase();
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
};
declare global {
  interface Window {
    bulkhead: typeof api;
  }
}

// ------------------------------------------------------------------ boot
build();
map = new FacilityMap($("#map") as unknown as HTMLCanvasElement);
window.bulkhead = api;

$("#approveBtn").addEventListener("click", () => api.approve());
$("#openReport").addEventListener("click", () => api.openReport());
$("#closeReport").addEventListener("click", () => api.closeReport());
$("#scrim").addEventListener("click", () => api.closeReport());
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    api.approve();
  } else if (e.key === "Escape") api.closeReport();
});

const params = new URLSearchParams(location.search);
const want = params.get("phase");
const tParam = params.get("t");
S.amb = 6.0; // fixed ambient start so first frames are identical every load
if (tParam !== null) api.seek(parseFloat(tParam));
else if (want === "breach") api.seek(4.4, { approveAt: null });
else if (want === "approval") api.seek(6.8, { approveAt: null });
else if (want === "contained") api.seek(CANON_APPROVE + SCRIPT_END_U);
else if (want === "report") api.seek(CANON_APPROVE + SCRIPT_END_U, { report: true });
else api.reset();
if (params.get("play") === "1") api.play({ approveAt: params.get("approveAt") ? parseFloat(params.get("approveAt")!) : undefined });

document.fonts.ready.then(() => {
  map.resize();
  render();
});
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});
