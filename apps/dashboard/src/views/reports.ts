import { APPROVER, EVIDENCE, INCIDENT, PAST_REPORTS, REPORT, RESOLUTION, SCRIBE_FILED_U, ISOLATE_DUR, CANON_APPROVE } from "../script";
import { icon } from "../icons";
import { $, disc, setAttr, setHTML, setText } from "../dom";
import { S, U, at, since } from "../engine";

// Reports: a list. INC-0419 opens into a timeline; "Authorized by" and evidence files sit behind expanders.

const head = (ico: string, id: string, sub: string, ttcId: string, ttcLabel: string, chip: string) =>
  `<span class="r-ico">${icon(ico)}</span>
   <span class="rep-main"><b>${id}</b><span id="${sub}"></span></span>
   <span class="rep-ttc" id="${ttcId}">${ttcLabel}</span>${chip}`;

export const reports = {
  html(): string {
    const past = PAST_REPORTS.map((p) => {
      const rows = p.rows
        .map((r) => `<li class="${r.actor.length === 2 ? "human" : ""}"><span class="t">${r.t.toFixed(1)}</span><i class="dot"></i><span class="who">${r.actor}</span><span class="what">${r.action}</span></li>`)
        .join("");
      return `<div class="glass rep">${disc(
        `report:${p.id}`,
        `<span class="r-ico">${icon("shieldCheck")}</span>
         <span class="rep-main"><b>${p.id} · ${p.title}</b><span>${p.when} · approved by ${p.approver}</span></span>
         <span class="rep-ttc">${p.ttc.toFixed(1)} s<small>to contain</small></span>`,
        `<div class="rep-body single"><ul class="tl">${rows}</ul></div>`,
        "",
      )}</div>`;
    }).join("");

    const files = EVIDENCE.map((e) => `<div class="file">${icon("file")}<b>${e.name}</b><em>${e.meta}</em></div>`).join("");
    const authBody = `<div class="row-body" id="authBody"></div>`;
    const side = `<div class="rep-side">
      <p class="sum">${RESOLUTION.split(" · ")[0]}</p>
      <p class="sub">${INCIDENT.title}. Written by Scribe and synced to every operator.</p>
      <div class="group">
        ${disc("authorized", `<span class="r-ico">${icon("shieldCheck")}</span><span class="r-title">Authorized by</span><span class="r-val" id="authVal">${APPROVER.initials} · ${APPROVER.role}</span>`, authBody, "row")}
        ${disc("files", `<span class="r-ico">${icon("file")}</span><span class="r-title">Evidence files</span><span class="r-val">${EVIDENCE.length} files</span>`, `<div class="row-body">${files}</div>`, "row")}
      </div>
    </div>`;

    return `<section class="view" id="v-reports" data-view="reports">
      <header class="hero-head">
        <h1 class="h-title">Reports</h1>
        <p class="h-sub">Every alert, action and approval, written by Scribe.</p>
      </header>
      <div id="repList">
        <div class="glass rep" id="rep419" hidden>${disc(
          "report:INC-0419",
          head("incident", `${INCIDENT.id} · ${INCIDENT.title}`, "r419sub", "r419ttc", "", `<span class="chip" id="r419chip" data-tone="busy"><i></i><span>Scribe writing</span></span>`),
          `<div class="rep-body"><ul class="tl" id="tlRows"></ul>${side}</div>`,
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
    const filed = S.A !== null && U() >= SCRIBE_FILED_U;
    setText($("#r419sub"), S.A === null ? "In progress" : filed ? `Filed · approved by ${APPROVER.initials} · ${APPROVER.role}` : "Scribe is writing");
    const done = S.A !== null && U() >= ISOLATE_DUR;
    setHTML($("#r419ttc"), done ? "t" : "n", () => (done ? `9.4 s<small>to contain</small>` : `<small>open</small>`));
    const chip = $("#r419chip");
    setAttr(chip, "data-tone", filed ? "done" : "busy");
    setText(chip.querySelector("span"), filed ? "Filed" : "Scribe writing");

    const rows = REPORT.filter((r) => since(r) >= 0 || (S.A !== null && r.u !== undefined && U() >= r.u));
    setHTML($("#tlRows"), `${rows.length}:${S.A ?? ""}`, () =>
      rows
        .map((r) => {
          const human = r.actor === APPROVER.initials;
          const win = r.u === ISOLATE_DUR;
          return `<li class="${human ? "human" : ""}${win ? " win" : ""}"><span class="t">${at(r).toFixed(1)}</span><i class="dot"></i><span class="who">${r.actor}</span><span class="what">${r.action}</span></li>`;
        })
        .join(""),
    );
    const policyN = rows.filter((r) => r.by === "playbook policy").length;
    setHTML($("#authBody"), `${policyN}:${S.A ?? ""}`, () => {
      const a = (l: string, v: string) => `<div class="auth-line"><span>${l}</span><b>${v}</b></div>`;
      return (
        (S.A !== null ? a(`${APPROVER.initials} · ${APPROVER.role}`, `quarantine · T+${(S.A ?? CANON_APPROVE).toFixed(1)}`) : a("Waiting on a person", "quarantine")) +
        a("Playbook policy", `${policyN} actions`) +
        a("Detector and model", "read-only")
      );
    });
  },
};
