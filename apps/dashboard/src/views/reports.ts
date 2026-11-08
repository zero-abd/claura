import { INCIDENT, ISOLATE_DUR, PAST_REPORTS, SCRIBE_FILED_U } from "../script";
import { CHANNELS } from "../warroom-data";
import {
  CLASS_LABEL,
  PHASE,
  approverOf,
  data,
  fmtClock,
  fmtDayTime,
  fmtRel,
  incidentCommander,
  plural,
  roster,
  scopeRange,
  type DataSource,
  type Proposal,
} from "../data";
import { sha256Hex } from "../data/live";
import { liveSource, waitedSeconds } from "../live-engine";
import { icon } from "../icons";
import { $, disc, setAttr, setHTML, setText } from "../dom";
import { REPORT_KEY, S, U, info, isLive, setOpen, ttc } from "../engine";
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
          <button type="button" class="btn-chip" id="anchorBtn" data-act="anchor" data-target="anchor-evidence">${icon("seal")}Anchor evidence on Solana devnet</button>
          <span class="doc-live" id="docLive"><i></i><span></span></span>
        </div>
      </header>
      <div class="anchor-out" id="anchorOut" data-s="idle" hidden></div>

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
    const lv = isLive();
    el.hidden = !S.started;
    // the scripted history (INC-0418 ...) is fiction: live shows only the real incident
    for (const p of Array.from(document.querySelectorAll("#repList .past")) as HTMLElement[]) if (p.hidden !== lv) p.hidden = lv;
    renderAnchor();
    if (!S.started) return;
    const d = data();
    const inc = d.incident();
    if (!inc) return;
    const I = info();
    const rep = lv ? liveSource()!.report() : null;
    const v = d.version();
    const me = d.me();
    const people = roster(d);
    const commander = incidentCommander(people) ?? people[0];
    const filed = lv ? !!rep : S.A !== null && U() >= SCRIBE_FILED_U;
    const ap = approverOf(d);

    // ---- card head
    if (lv) setText($("#rep419 .rep-main b"), `${I.id} · ${I.title}`);
    const who = `${ap?.name ?? commander?.name ?? "RK"} · ${ap?.title ?? commander?.title ?? "Incident Commander"}`;
    setText($("#r419sub"), lv ? (filed ? `Filed · approved by ${who}` : inc.status === "contained" ? "Scribe is writing" : "In progress") : S.A === null ? "In progress" : filed ? `Filed · approved by ${who}` : "Scribe is writing");
    const done = lv ? inc.status === "contained" : S.A !== null && U() >= ISOLATE_DUR;
    const took = lv ? (ttc() ?? 0).toFixed(1) : "9.4";
    setHTML($("#r419ttc"), done ? `t${lv ? took : ""}` : "n", () => (done ? `${took} s<small>to contain</small>` : `<small>open</small>`));
    if (lv) {
      const w = waitedSeconds();
      setAttr($("#r419ttc"), "title", done && w >= 0.5 ? `Agent time, first signal to contained. The incident also waited ${w.toFixed(1)} s for a person to approve, which is not counted.` : "");
    }
    const chip = $("#r419chip");
    setAttr(chip, "data-tone", filed ? "done" : "busy");
    setText(chip.querySelector("span"), filed ? "Filed" : "Scribe writing");

    // ---- document header
    const events = d.events();
    const newest = events.reduce((t, e) => Math.max(t, e.at), inc.openedAt);
    setText($("#docTitle"), `${I.id} · ${inc.title}`);
    if (lv) renderSummary(rep);
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
        f("Incident ID", esc(I.id)) +
        f("Severity", `<span class="chip" data-tone="hot"><i></i><span>${esc(inc.severity[0].toUpperCase() + inc.severity.slice(1))}</span></span>`) +
        f("Category", esc(inc.category), "wide") +
        f("Detected", `${fmtClock(inc.openedAt)} CST · Sentry${firstSignal ? ` · ${linkHosts(firstSignal.text)}` : ""}`, "wide") +
        f("Functional impact", esc(inc.functionalImpact), "wide") +
        f("Information impact", esc(inc.informationImpact), "wide") +
        f("Recoverability", esc(inc.recoverability), "wide") +
        f("Incident Commander", `${esc(commander?.name ?? "RK")} · ${esc(commander?.title ?? "Incident Commander")}`) +
        f("Current phase", `<b>${PHASE[inc.nistPhase].label}</b>`) +
        f("Systems", `${linkHosts(inc.host)} (${I.where}) · ${esc(inc.vm)} · ${esc(I.agent)}`, "wide")
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
          const win = /Incident (#\d+ )?contained/.test(e.text);
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
    if (p.status === "blocked") return `<span class="auth blocked">Blocked by policy<small>denied, nothing ran</small></span>`;
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

// ------------------------------------------------------------------ live: Scribe's filed summary
function renderSummary(rep: { summary: string; filedAt: number } | null) {
  let sec = document.getElementById("docSummary");
  if (!sec) {
    sec = document.createElement("section");
    sec.id = "docSummary";
    sec.className = "doc-sec doc-summary";
    document.getElementById("anchorOut")?.after(sec);
  }
  sec.hidden = !rep;
  if (!rep) return;
  setHTML(sec, `s${rep.filedAt}:${rep.summary.length}`, () => `<h3>Scribe's summary</h3><p class="sum-text">${esc(rep.summary)}</p><p class="sum-by">Filed ${fmtClock(rep.filedAt)} CST. Hashed below with the rest of the record.</p>`);
}

// ------------------------------------------------------------------ anchor the evidence on Solana devnet
// The digest is the SHA-256 of one canonical JSON bundle of the record (incident, log, actions, decisions, scope, evidence
// hashes), so anyone holding the same record can recompute it and compare with what the chain holds. The gateway's solana
// feature does the signing: this page only hands it the digest and the incident label, and shows what comes back.
interface AnchorState {
  label: string;
  busy: boolean;
  digest: string;
  sig: string;
  url: string;
  err: string;
  /** the gateway wrote nothing to Solana (its devnet wallet has no SOL): a simulated anchor, never shown as an anchor on chain */
  sim: boolean;
  reason: string;
}
const anchorState: AnchorState = { label: "", busy: false, digest: "", sig: "", url: "", err: "", sim: false, reason: "" };
type AnchorFn = (hash: string, label: string) => unknown;
/** window.claura.anchor, called as a method of window.claura (a feature may rely on `this`). */
const anchorFn = (): AnchorFn | null => {
  const c = window.claura as unknown as { anchor?: unknown } | undefined;
  return typeof c?.anchor === "function" ? (hash, label) => (c.anchor as AnchorFn).call(c, hash, label) : null;
};

/** SHA-256 over a canonical bundle of the record. Works on either data source. */
export async function reportDigest(d: DataSource): Promise<string> {
  const inc = d.incident();
  const bundle = {
    v: 1,
    incident: inc ? { id: info().id, title: inc.title, severity: inc.severity, host: inc.host, vm: inc.vm, openedAt: inc.openedAt, containedAt: inc.containedAt, phase: inc.nistPhase, category: inc.category, functional: inc.functionalImpact, information: inc.informationImpact, recoverability: inc.recoverability } : null,
    events: d.events().map((e) => [e.id, e.at, e.kind, e.actor, e.text]),
    actions: d.proposals().map((p) => [p.id, p.action, p.target, p.status, p.policyMode, p.decidedBy, p.at]),
    decisions: d.decisions().map((x) => [x.id, x.at, x.byName, x.text]),
    scope: d.assets().map((a) => [a.id, a.name, a.status, a.records, a.updatedBy, a.updatedAt]),
    evidence: d.evidence().map((e) => [e.name, e.sha256]),
  };
  return sha256Hex(JSON.stringify(bundle));
}

const short = (h: string) => (h.length > 20 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h);
/** Only an https link is ever put in an href; anything else is rebuilt from the signature. */
const explorerOf = (sig: string, given: unknown) =>
  typeof given === "string" && /^https:\/\//i.test(given) ? given : `https://explorer.solana.com/tx/${encodeURIComponent(sig)}?cluster=devnet`;

export async function anchorEvidence(): Promise<boolean> {
  const f = anchorFn();
  const btn = document.getElementById("anchorBtn");
  if (!f) {
    // same convention as the voice buttons: a quiet tooltip, never an error
    btn?.classList.add("tip-on");
    window.setTimeout(() => btn?.classList.remove("tip-on"), 2200);
    return false;
  }
  if (anchorState.busy || !S.started) return false;
  const d = data();
  const label = info().id;
  anchorState.busy = true;
  anchorState.label = label;
  anchorState.err = "";
  anchorState.sig = "";
  anchorState.url = "";
  anchorState.sim = false;
  anchorState.reason = "";
  try {
    anchorState.digest = await reportDigest(d);
    const r = (await f(anchorState.digest, label)) as unknown;
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const sig = typeof r === "string" ? r : String(o.signature ?? o.sig ?? o.txid ?? o.tx ?? o.txSignature ?? "");
    if (!sig) throw new Error("the anchor module returned no signature");
    anchorState.sig = sig;
    anchorState.sim = o.mock === true || /^mock-/i.test(sig); // mock:true, or a "mock-..." reference: nothing is on the chain
    anchorState.reason = typeof o.reason === "string" ? o.reason : "";
    anchorState.url = anchorState.sim ? "" : explorerOf(sig, o.explorer ?? o.explorerUrl ?? o.url ?? o.link);
    return true;
  } catch (e) {
    anchorState.err = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    anchorState.busy = false;
  }
}

function renderAnchor() {
  const out = document.getElementById("anchorOut");
  const btn = document.getElementById("anchorBtn") as HTMLButtonElement | null;
  if (!out || !btn) return;
  const have = anchorFn() !== null;
  setAttr(btn, "data-tip", have ? "Write this record's SHA-256 to Solana devnet" : "Anchor module not loaded");
  setAttr(btn, "aria-disabled", String(!have));
  const s = anchorState;
  const show = s.busy || !!s.sig || !!s.err;
  out.hidden = !show;
  if (!show) return;
  const state = s.busy ? "busy" : s.sig ? (s.sim ? "sim" : "ok") : "err";
  setAttr(out, "data-s", state);
  setHTML(out, `${state}:${s.sig}:${s.err}:${s.digest}`, () =>
    s.busy
      ? `<span class="a-dot"></span><b>Anchoring ${esc(s.label)}</b><span>SHA-256 of the record, signed by the gateway</span>`
      : s.sig && s.sim
        ? `<span class="a-dot"></span><b>Simulated anchor${s.reason === "unfunded" ? " — devnet wallet not funded yet" : ""}</b><span>${esc(s.label)} · SHA-256 <code title="${esc(s.digest)}">${esc(short(s.digest))}</code> · nothing was written to Solana</span>
           <span class="a-sig">local reference <code title="${esc(s.sig)}">${esc(short(s.sig))}</code> · not a transaction on the chain, so there is no Explorer link and it is left out of the printed PDF</span>`
        : s.sig
        ? `<span class="a-dot"></span><b>Anchored on Solana devnet</b><span>${esc(s.label)} · SHA-256 <code title="${esc(s.digest)}">${esc(short(s.digest))}</code></span>
           <span class="a-sig">signature <code title="${esc(s.sig)}">${esc(short(s.sig))}</code> <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open in Solana Explorer</a></span>`
        : `<span class="a-dot"></span><b>Could not anchor</b><span>${esc(s.err)}</span>`,
  );
}
