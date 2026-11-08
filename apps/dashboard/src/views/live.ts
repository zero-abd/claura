import { APPROVER } from "../script";
import { AGENT_ICON, icon } from "../icons";
import { hostLink } from "../hosts";
import { $, setAttr, setText } from "../dom";
import { live, pendingQuarantine, snapshot, tsMs, type Snapshot } from "../live";

// Live: real rows from SpacetimeDB and real reducer calls. The other views replay INC-0419 from script.ts.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const clock = (ms: number) =>
  ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "";

const STATUS_TONE: Record<string, string> = {
  executed: "done",
  approved: "done",
  contained: "safe",
  blocked: "hot",
  pending_approval: "hot",
  awaiting_approval: "hot",
  open: "busy",
};
const chip = (status: string) =>
  `<span class="chip" data-tone="${STATUS_TONE[status] ?? "idle"}"><i></i><span>${esc(status.replace(/_/g, " "))}</span></span>`;

const CONN_LABEL = { off: "Not connected", connecting: "Connecting", live: "Live", error: "Not connected" } as const;
const CONN_TONE = { off: "idle", connecting: "busy", live: "safe", error: "hot" } as const;

function incidentPanel(s: Snapshot): string {
  const inc = s.incident!;
  const opened = tsMs(inc.openedAt);
  const contained = tsMs(inc.containedAt);
  return `<section class="panel lv-card">
    <div class="lv-head"><h2>${esc(inc.title)}</h2>${chip(inc.status)}</div>
    <dl class="lv-facts">
      <div><dt>Incident</dt><dd>#${inc.id}</dd></div>
      <div><dt>Host</dt><dd>${hostLink(esc(inc.host))}</dd></div>
      <div><dt>Blast score</dt><dd>${inc.blastScore ? inc.blastScore.toFixed(2) : "not scored yet"}</dd></div>
      <div><dt>Opened</dt><dd>${clock(opened)}</dd></div>
      <div><dt>Contained</dt><dd>${contained ? `${clock(contained)}, after ${((contained - opened) / 1000).toFixed(1)} s` : "not yet"}</dd></div>
    </dl>
  </section>`;
}

function askPanel(s: Snapshot): string {
  const p = pendingQuarantine(s);
  if (p)
    return `<section class="panel lv-card lv-ask">
      <h2>Quarantine ${esc(p.target)}?</h2>
      <p>${esc(p.reason)}</p>
      <p class="lv-dim">Proposal #${p.id} from ${esc(p.agent)}. The policy row for quarantine_host says a person must approve it.</p>
      <button type="button" class="btn-primary approve" data-live="approve"${live.busy ? " disabled" : ""}><span>Approve as ${APPROVER.initials}</span><kbd>⌘↵</kbd></button>
      <button type="button" class="btn-chip" data-live="approve-agent"${live.busy ? " disabled" : ""}>Let Warden approve it</button>
    </section>`;
  const done = s.proposals.find((r) => r.action === "quarantine_host" && r.status === "approved");
  if (done)
    return `<section class="panel lv-card lv-ask" data-done="1">
      <span class="sheet-ico ok">${icon("check")}</span>
      <h2>Approved by ${esc(done.decidedBy)}</h2>
      <p>${esc(done.target)} is quarantined. Every step is in the log below.</p>
    </section>`;
  return `<section class="panel lv-card lv-ask">
    <h2>Nothing waiting for you</h2>
    <p>The quarantine appears here when Warden asks for it.</p>
  </section>`;
}

function proposalsPanel(s: Snapshot): string {
  const rows = s.proposals
    .map(
      (p) => `<tr>
        <td class="mono">#${p.id}</td>
        <td>${esc(p.agent)}</td>
        <td class="mono">${esc(p.action)}</td>
        <td class="mono">${esc(p.target)}</td>
        <td>${esc(p.policyMode)}</td>
        <td>${chip(p.status)}</td>
        <td>${esc(p.decidedBy)}</td>
      </tr>`,
    )
    .join("");
  return `<section class="panel lv-card">
    <div class="lv-head">
      <h2>Proposals</h2>
      <button type="button" class="btn-chip" data-live="reimage"${live.busy ? " disabled" : ""}>Ask Warden to reimage the host</button>
    </div>
    <p class="lv-dim">Agents can only propose. The propose_action reducer checks each one against the policy table.</p>
    <div class="lv-table"><table>
      <thead><tr><th>#</th><th>Agent</th><th>Action</th><th>Target</th><th>Policy</th><th>Status</th><th>Decided by</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="lv-dim">No proposals yet.</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

function agentsPanel(s: Snapshot): string {
  const order = ["sentry", "triage", "warden", "scribe"];
  const rows = [...s.agents]
    .sort((a, b) => order.indexOf(a.agent) - order.indexOf(b.agent))
    .map(
      (a) => `<li>
        <span class="a-ico">${icon(AGENT_ICON[a.agent] ?? "cpu")}</span>
        <div><b>${esc(a.agent)}</b><span class="lv-dim">${esc(a.status)}${a.model ? ` · ${esc(a.model)}` : ""}</span><p>${esc(a.thought)}</p></div>
      </li>`,
    )
    .join("");
  return `<section class="panel lv-card"><h2>Agents</h2><ul class="lv-agents">${rows}</ul></section>`;
}

function eventsPanel(s: Snapshot): string {
  const rows = s.events
    .map((e) => `<li><time>${clock(tsMs(e.at))}</time><span class="lv-kind">${esc(e.kind.replace(/_/g, " "))}</span><span>${esc(e.actor)}: ${esc(e.text)}</span></li>`)
    .join("");
  return `<section class="panel lv-card"><h2>Incident log</h2><p class="lv-dim">Newest first. Written by reducers, never by the model directly.</p><ol class="lv-log">${rows}</ol></section>`;
}

function body(): string {
  if (live.status !== "live")
    return `<div class="panel lv-card lv-empty">
      <h2>${live.status === "connecting" ? "Connecting to SpacetimeDB" : "Connect to see a real run"}</h2>
      <p>Start the module and the agents (README §11), then connect. Or open the console with <code>?live=1</code>.</p>
    </div>`;
  const s = snapshot()!;
  if (!s.incident)
    return `<div class="panel lv-card lv-empty">
      <h2>Connected. No incident yet.</h2>
      <p>Run <code>npm run demo</code> in backend/agents. Rows appear here as the agents write them.</p>
    </div>`;
  const report = s.report
    ? `<section class="panel lv-card"><h2>Report filed by Scribe</h2><p class="lv-report">${esc(s.report.summary)}</p></section>`
    : "";
  return `<div class="lv-grid">${incidentPanel(s)}${askPanel(s)}</div>
    ${proposalsPanel(s)}
    <div class="lv-grid">${agentsPanel(s)}${eventsPanel(s)}</div>
    ${report}`;
}

let drawn = -1;

export const liveView = {
  html(): string {
    return `<section class="view" id="v-live" data-view="live">
      <header class="hero-head">
        <h1 class="h-title">Live</h1>
        <p class="h-sub">Rows straight from SpacetimeDB, the database the agents write to. Nothing on this page is scripted.</p>
      </header>
      <form class="panel lv-conn" id="lvForm">
        <span class="chip" id="lvChip" data-tone="idle"><i></i><span>Not connected</span></span>
        <label><span>Server</span><input id="lvUri" spellcheck="false" autocomplete="off" value="${esc(live.uri)}" /></label>
        <label><span>Database</span><input id="lvDb" spellcheck="false" autocomplete="off" value="${esc(live.db)}" /></label>
        <button type="submit" class="btn-chip accent">Connect</button>
        <p class="lv-err" id="lvErr"></p>
      </form>
      <p class="lv-note" id="lvNote" data-tone="" role="status" aria-live="polite"></p>
      <div id="lvBody"></div>
    </section>`;
  },

  render() {
    if (drawn === live.version) return;
    drawn = live.version;
    const c = $("#lvChip");
    setAttr(c, "data-tone", CONN_TONE[live.status]);
    setText(c.querySelector("span"), CONN_LABEL[live.status]);
    setText($("#lvErr"), live.error);
    const note = $("#lvNote");
    setAttr(note, "data-tone", live.notice?.tone ?? "");
    setText(note, live.notice?.text ?? "");
    $("#lvBody").innerHTML = body();
  },
};
