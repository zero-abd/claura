import { INCIDENT, ISOLATE_DUR, PAST_REPORTS, SCRIBE_FILED_U } from "../script";
import { CHANNELS } from "../warroom-data";
import {
  CLASS_LABEL,
  PHASE,
  data,
  fmtClock,
  fmtDayTime,
  fmtRel,
  plural,
  roster,
  scopeRange,
  type Proposal,
} from "../data";
import { icon } from "../icons";
import { $, disc, setAttr, setHTML, setText } from "../dom";
import { REPORT_KEY, S, U, setOpen } from "../engine";
import { esc, linkHosts } from "../hosts";
import { phaseStepperHTML, phaseSteps } from "./phases";
import { scopeSummaryText, statusPill } from "./scope";

// Reports: incident documentation in NIST SP 800-61 structure. INC-0419 is written live by Scribe:
//   1 Identification   2 Response phases   3 Timeline   4 Actions and authorization
//   5 Scope of compromised data   6 Evidence and chain of custody   7 Communications and decisions   8 Lessons learned
// "Export PDF" prints it with a clean print stylesheet (window.print), so the same page is the record.

const head = (ico: string, id: string, sub: string, ttcId: string, ttcLabel: string, chip: string) =>
  `<span class="r-ico">${icon(ico)}</span>
   <span class="rep-main"><b>${id}</b><span id="${sub}"></span></span>
   <span class="rep-ttc" id="${ttcId}">${ttcLabel}</span>${chip}`;

const secRow = (key: string, n: number, title: string, valId: string, body: string) =>
  disc(
    key,
    `<span class="sec-n">${n}</span><span class="r-title">${title}</span><span class="r-val" id="${valId}"></span>`,
    `<div class="row-body doc-pad">${body}</div>`,
    "row doc-row",
  );

const actionLabel = (a: string) => {
  const s = a.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const reports = {
  html(): string {
    const past = PAST_REPORTS.map((p) => {
      const rows = p.rows
        .map((r) => `<li class="${r.actor.length === 2 ? "human" : ""}"><span class="t">${r.t.toFixed(1)}</span><i class="dot"></i><span class="who">${r.actor}</span><span class="what">${linkHosts(r.action)}</span></li>`)
        .join("");
      return `<div class="glass rep past">${disc(
        `report:${p.id}`,
        `<span class="r-ico">${icon("shieldCheck")}</span>
         <span class="rep-main"><b>${p.id} · ${p.title}</b><span>${p.when} · approved by ${p.approver}</span></span>
         <span class="rep-ttc">${p.ttc.toFixed(1)} s<small>to contain</small></span>`,
        `<div class="rep-body single"><ul class="tl">${rows}</ul></div>`,
        "",
      )}</div>`;
    }).join("");

    const doc = `<article class="doc" id="doc">
      <div class="print-only doc-letterhead"><b>Claura</b><span>Incident response record · NIST SP 800-61 format · Confidential</span><span id="docPrintStamp"></span></div>
      <header class="doc-head">
        <div>
          <p class="doc-kicker">Incident report · NIST SP 800-61</p>
          <h2 id="docTitle"></h2>
          <p class="doc-meta" id="docMeta"></p>
        </div>
        <div class="doc-tools">
          <button type="button" class="btn-chip" data-act="export" data-target="export-report">${icon("download")}Export PDF</button>
          <span class="doc-live" id="docLive"><i></i><span></span></span>
        </div>
      </header>

      <section class="doc-sec">
        <h3><span class="sec-n">1</span>Identification</h3>
        <dl class="id-grid" id="docIdent"></dl>
      </section>
      <section class="doc-sec">
        <h3><span class="sec-n">2</span>Response phases</h3>
        <div id="docPhases"></div>
      </section>

      <div class="group doc-rows">
        ${secRow("rs:timeline", 3, "Timeline", "rsTlVal", `<ul class="tl doc-tl" id="tlRows"></ul>`)}
        ${secRow("rs:actions", 4, "Actions and authorization", "rsAcVal", `<div id="docActions"></div>`)}
        ${secRow("rs:scope", 5, "Scope of compromised data", "rsScVal", `<div id="docScope"></div>`)}
        ${secRow("rs:evidence", 6, "Evidence and chain of custody", "rsEvVal", `<div id="docEvidence"></div>`)}
        ${secRow("rs:comms", 7, "Communications and decisions", "rsCmVal", `<div id="docComms"></div>`)}
        ${secRow(
          "rs:lessons",
          8,
          "Lessons learned",
          "rsLlVal",
          `<div class="lessons" id="docLessons"></div>`,
        )}
      </div>
      <p class="doc-foot">Written by Scribe. Entries are appended and attributed, never edited. Evidence hashes are SHA-256.</p>
    </article>`;

    return `<section class="view" id="v-reports" data-view="reports">
      <header class="hero-head">
        <h1 class="h-title">Reports</h1>
        <p class="h-sub">Incident documentation in NIST SP 800-61 structure, written by Scribe as it happens.</p>
      </header>
      <div id="repList">
        <div class="glass rep" id="rep419" hidden>${disc(
          REPORT_KEY,
          head("incident", `${INCIDENT.id} · ${INCIDENT.title}`, "r419sub", "r419ttc", "", `<span class="chip" id="r419chip" data-tone="busy"><i></i><span>Scribe writing</span></span>`),
          doc,
          "",
        )}</div>
        ${past}
      </div>
    </section>`;
  },

  render() {
    const el = $("#rep419") as HTMLElement;
    el.hidden = !S.started;
    if (!S.started) return;
    const d = data();
    const inc = d.incident();
    if (!inc) return;
    const v = d.version();
    const me = d.me();
    const people = roster(d);
    const commander = people.find((p) => p.role === "admin" && p.kind === "operator") ?? people[0];
    const filed = S.A !== null && U() >= SCRIBE_FILED_U;

    // ---- card head
    setText($("#r419sub"), S.A === null ? "In progress" : filed ? `Filed · approved by ${commander?.name ?? "RK"} · ${commander?.title ?? "Incident Commander"}` : "Scribe is writing");
    const done = S.A !== null && U() >= ISOLATE_DUR;
    setHTML($("#r419ttc"), done ? "t" : "n", () => (done ? `9.4 s<small>to contain</small>` : `<small>open</small>`));
    const chip = $("#r419chip");
    setAttr(chip, "data-tone", filed ? "done" : "busy");
    setText(chip.querySelector("span"), filed ? "Filed" : "Scribe writing");

    // ---- document header
    const events = d.events();
    const newest = events.reduce((t, e) => Math.max(t, e.at), inc.openedAt);
    setText($("#docTitle"), `${INCIDENT.id} · ${inc.title}`);
    setText($("#docMeta"), `Opened ${fmtDayTime(inc.openedAt)} CST · Incident Commander ${commander?.name ?? "RK"} · Phase: ${PHASE[inc.nistPhase].label}`);
    setText($("#docPrintStamp"), `Generated ${fmtDayTime(newest)} CST by ${me.name}`);
    const live = $("#docLive");
    setAttr(live, "data-s", filed ? "filed" : "live");
    setText(live.querySelector("span"), filed ? `Filed · updated ${fmtClock(newest)}` : `Live · updated ${fmtClock(newest)}`);

    // ---- 1 identification
    const firstSignal = events[0];
    setHTML($("#docIdent"), `i${v}`, () => {
      const f = (k: string, val: string, cls = "") => `<div class="${cls}"><dt>${k}</dt><dd>${val}</dd></div>`;
      return (
        f("Incident ID", esc(INCIDENT.id)) +
        f("Severity", `<span class="chip" data-tone="hot"><i></i><span>${esc(inc.severity[0].toUpperCase() + inc.severity.slice(1))}</span></span>`) +
        f("Category", esc(inc.category), "wide") +
        f("Detected", `${fmtClock(inc.openedAt)} CST · Sentry${firstSignal ? ` · ${linkHosts(firstSignal.text)}` : ""}`, "wide") +
        f("Functional impact", esc(inc.functionalImpact), "wide") +
        f("Information impact", esc(inc.informationImpact), "wide") +
        f("Recoverability", esc(inc.recoverability), "wide") +
        f("Incident Commander", `${esc(commander?.name ?? "RK")} · ${esc(commander?.title ?? "Incident Commander")}`) +
        f("Current phase", `<b>${PHASE[inc.nistPhase].label}</b>`) +
        f("Systems", `${linkHosts(inc.host)} (${INCIDENT.where}) · ${esc(inc.vm)} · ${esc(INCIDENT.agent)}`, "wide")
      );
    });

    // ---- 2 phases
    setHTML($("#docPhases"), `p${v}`, () => phaseStepperHTML(phaseSteps()));

    // ---- 3 timeline
    setText($("#rsTlVal"), plural(events.length, "entry", "entries"));
    setHTML($("#tlRows"), `t${v}`, () =>
      events
        .map((e) => {
          const human = roster(d).some((p) => p.kind === "operator" && p.name === e.actor);
          const win = /Incident contained/.test(e.text);
          return `<li class="${human ? "human" : ""}${win ? " win" : ""}${e.kind === "state" ? " state" : ""}"><span class="t">${fmtClock(e.at)}<small>${fmtRel(e.at, inc.openedAt)}</small></span><i class="dot"></i><span class="who">${esc(e.actor)}</span><span class="what">${linkHosts(e.text)}</span></li>`;
        })
        .join(""),
    );

    // ---- 4 actions and authorization
    const props = d.proposals();
    const humanN = props.filter((p) => p.policyMode === "approval" && p.decidedBy).length;
    setText($("#rsAcVal"), props.length ? `${plural(props.length, "action")} · ${humanN ? plural(humanN, "human approval") : "no human approval yet"}` : "none yet");
    setHTML($("#docActions"), `a${v}`, () => actionsTable(props, d.me(), commander?.title ?? "Incident Commander"));

    // ---- 5 scope of compromised data
    const assets = d.assets().slice().sort((a, b) => scopeRank(b.status) - scopeRank(a.status) || a.name.localeCompare(b.name));
    setText($("#rsScVal"), assets.length ? scopeSummaryText(assets, 3) : "none classified");
    setHTML($("#docScope"), `s${v}`, () =>
      assets.length
        ? `<table class="doc-table"><thead><tr><th>Asset</th><th>System</th><th>Class</th><th>Records at risk</th><th>Status</th></tr></thead><tbody>${assets
            .map((a) => {
              const r = scopeRange(a.status, a.records);
              return `<tr><td><b>${linkHosts(a.name)}</b><small>${linkHosts(a.note)}</small></td><td>${esc(a.system)}</td><td>${CLASS_LABEL[a.classification]}</td><td class="num">${r.text}${r.exact ? "" : "<small>not known yet</small>"}</td><td>${statusPill(a.status)}<small>${esc(a.updatedBy)} · ${fmtClock(a.updatedAt)}</small></td></tr>`;
            })
            .join("")}</tbody></table>`
        : `<p class="doc-none">Nothing classified yet.</p>`,
    );

    // ---- 6 evidence and chain of custody
    const ev = d.evidence();
    setText($("#rsEvVal"), ev.length ? `${plural(ev.length, "file")} · hashes verified` : "none yet");
    setHTML($("#docEvidence"), `e${v}`, () =>
      ev.length
        ? ev
            .map(
              (e) => `<article class="ev-card">
        <header><span class="r-ico">${icon("file")}</span><div><b>${esc(e.name)}</b><span>${esc(e.size)} · ${esc(e.collectedBy)} · ${fmtClock(e.collectedAt)}</span></div><span class="v-badge">${icon("hash")}Hash verified</span></header>
        <dl class="ev-facts"><div><dt>SHA-256</dt><dd class="hash">${e.sha256}</dd></div><div><dt>Source</dt><dd>${esc(e.source)}</dd></div></dl>
        <ol class="custody">${e.custody.map((c) => `<li><time>${fmtClock(c.at)}</time><b>${esc(c.action)}</b><span>${esc(c.who)}</span></li>`).join("")}</ol>
      </article>`,
            )
            .join("")
        : `<p class="doc-none">Scribe has not captured anything yet.</p>`,
    );

    // ---- 7 communications and decisions
    const decs = d.decisions();
    setText($("#rsCmVal"), `${plural(decs.length, "decision")} · ${plural(CHANNELS.length, "channel")}`);
    setHTML($("#docComms"), `c${v}`, () => {
      const counts = CHANNELS.map((c) => `<span class="ch-count"><b>${c.id}</b>${plural(d.messages(c.id).filter((m) => m.kind !== "system").length, "message")}</span>`).join("");
      const dec = decs.map((x) => `<li><time>${fmtClock(x.at)}</time><span>${linkHosts(x.text)}</span><em>${esc(x.byName)}</em></li>`).join("");
      return `<ul class="dec-list">${dec || `<li><span>No decisions yet.</span></li>`}</ul>
        <div class="ch-counts">${counts}</div>
        <p class="doc-note">Notification clocks have not started. They start only when counsel decides materiality (example obligations: SEC 8-K Item 1.05 within 4 business days; GDPR within 72 hours).</p>`;
    });

    // ---- 8 lessons learned (a placeholder until the post-incident review)
    setText($("#rsLlVal"), inc.nistPhase === "post_incident" ? "Review under way" : "Not started");
    setHTML($("#docLessons"), `l${inc.nistPhase}`, () => {
      const q = [
        "What detected it, and how fast? Did the signal come from the right place?",
        "What slowed containment, and what would have sped it up?",
        "Which playbook step, policy or control should change?",
        "Who needed to know sooner, and how did they find out?",
        "Which of the open questions in the brief were answered, and how?",
      ];
      return `<p class="doc-note">Completed at the post-incident review, within 14 days of recovery. Owner: ${esc(commander?.name ?? "RK")}.</p>
        <ul class="prompts">${q.map((x) => `<li><i></i><span>${x}</span></li>`).join("")}</ul>
        <div class="blank-lines" aria-hidden="true"><i></i><i></i><i></i></div>`;
    });
  },
};

const scopeRank = (s: string) => ({ exfil_confirmed: 7, locked_ransomware: 6, exfil_suspected: 5, accessed: 4, evidence_preserved: 3, restored: 2, intact: 1 })[s] ?? 0;

function actionsTable(props: Proposal[], me: { name: string }, title: string): string {
  if (!props.length) return `<p class="doc-none">No actions taken yet.</p>`;
  const who = (p: Proposal) => {
    if (p.decidedBy === "policy") return `<span class="auth auto">Playbook guest-escape v3<small>automatic, policy-bounded</small></span>`;
    if (!p.decidedBy) return `<span class="auth wait">Waiting for the Incident Commander<small>needs a human</small></span>`;
    return `<span class="auth human">${icon("shieldCheck")}<span>${esc(p.decidedBy)} · ${esc(title)}<small>human approval${p.decidedBy === me.name ? " (you)" : ""}</small></span></span>`;
  };
  return `<table class="doc-table"><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Taken by</th><th>Authorized by</th><th>Reversible</th></tr></thead><tbody>${props
    .map(
      (p) =>
        `<tr class="${p.policyMode === "approval" ? "gate" : ""}"><td class="num">${fmtClock(p.at)}</td><td><b>${esc(actionLabel(p.action))}</b><small>${esc(p.reason)}</small></td><td>${linkHosts(p.target)}</td><td>${esc(p.agent)}</td><td>${who(p)}</td><td>${p.reversible ? "Yes" : "No"}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

/** Export PDF: opens INC-0419 and hands the page to the browser's print dialog with the print stylesheet on. */
export function exportReport(): boolean {
  if (!S.started) return false;
  setOpen(REPORT_KEY, true);
  document.body.dataset.print = "report";
  const off = () => {
    delete document.body.dataset.print;
    window.removeEventListener("afterprint", off);
  };
  window.addEventListener("afterprint", off);
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  return true;
}
