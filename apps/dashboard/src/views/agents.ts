import { AGENTS, BOUNDS, TOOLS, type AgentDef } from "../script";
import { AGENT_ICON, icon } from "../icons";
import { $, disc, setAttr, setHTML, setLinked, setText } from "../dom";
import { linkHosts } from "../hosts";
import { agentNow, at, since, S } from "../engine";
import { fmtT } from "../util";

// Agents: four glass cards. Collapsed = status + current line. Expanded = reasoning,
// tool calls (nemotron-on-prem) and policy bounds.

function trace(a: AgentDef) {
  const rows: { t: number; text: string }[] = [];
  a.thoughts.forEach((th, i) => {
    if (since(th) < 0) return;
    if (th.quiet && i > 0 && a.thoughts[i - 1].text === th.text) return; // same thought, restated
    if (th.t !== undefined && th.t < 0 && S.started) return; // idle placeholder once running
    rows.push({ t: at(th), text: th.text });
  });
  return rows;
}
function tools(a: AgentDef) {
  return TOOLS[a.id].filter((c) => since(c) >= 0);
}

export const agents = {
  html(): string {
    const cards = AGENTS.map((a) => {
      const b = BOUNDS[a.id];
      const body = `<div class="row-body" style="padding:0">
        <div class="sec"><h4>Reasoning</h4><ol class="trace" id="tr-${a.id}"></ol></div>
        <div class="sec"><h4>Tool calls<span class="tag">nemotron-on-prem</span></h4><div id="tl-${a.id}"></div></div>
        <div class="sec"><h4>Policy bounds<span class="tag${a.id === "warden" ? " warm" : ""}">${b.mode}</span></h4>
          <dl class="bounds"><dt>Can</dt><dd>${b.can}</dd><dt>Cannot</dt><dd>${b.cannot}</dd></dl>
        </div>
      </div>`;
      return `<article class="glass agent-card" id="ag-${a.id}" data-agent="${a.id}" data-tone="idle">
        <div class="ac-top">
          <span class="a-ico">${icon(AGENT_ICON[a.id])}</span>
          <div class="ac-id"><h3>${a.name}</h3><span>${a.role}</span></div>
          <span class="chip" id="gc-${a.id}" data-tone="idle"><i></i><span></span></span>
        </div>
        <p class="ac-line" id="gl-${a.id}"><span class="tx"></span><span class="caret"></span><span class="stamp" id="gs-${a.id}"></span></p>
        ${disc(
          `agent:${a.id}`,
          `<span class="r-title" style="font-size:16px;font-weight:550">Show reasoning</span><span class="r-val" id="gv-${a.id}"></span>`,
          body,
          "",
        )}
      </article>`;
    }).join("");
    return `<section class="view" id="v-agents" data-view="agents">
      <header class="hero-head">
        <h1 class="h-title">Agents</h1>
        <p class="h-sub">Four defenders reason on-prem with NVIDIA Nemotron. Every action stays inside policy.</p>
      </header>
      <div class="agent-grid">${cards}</div>
    </section>`;
  },

  render() {
    for (const a of AGENTS) {
      const n = agentNow(a);
      setAttr($(`#ag-${a.id}`), "data-tone", n.tone);
      const chip = $(`#gc-${a.id}`);
      setAttr(chip, "data-tone", n.tone);
      setText(chip.querySelector("span"), n.status);
      const line = $(`#gl-${a.id}`);
      setLinked(line.querySelector(".tx"), n.text);
      line.classList.toggle("typing", n.typing);
      setText($(`#gs-${a.id}`), n.stamp);

      const tr = trace(a);
      const tc = tools(a);
      setText($(`#gv-${a.id}`), `${tr.length} thought${tr.length === 1 ? "" : "s"} · ${tc.length} tool call${tc.length === 1 ? "" : "s"}`);
      setHTML($(`#tr-${a.id}`), `t${tr.length}:${S.A ?? ""}:${S.started}`, () =>
        tr.map((r) => `<li><time>${fmtT(r.t)}</time><span>${linkHosts(r.text)}</span></li>`).join("") || `<li><time></time><span>No activity yet.</span></li>`,
      );
      setHTML($(`#tl-${a.id}`), `c${tc.length}:${S.A ?? ""}`, () =>
        tc
          .map((c) => `<div class="tool"><time>${fmtT(at(c))}</time><code>${linkHosts(c.call)}<span>→ ${linkHosts(c.result)}</span></code></div>`)
          .join("") || `<div class="tool"><time></time><code><span>No calls yet.</span></code></div>`,
      );
    }
  },
};
