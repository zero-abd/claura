import { NIST_PHASES, PHASE, data, fmtClock, phaseFromLabel, type NistPhase, type Ts } from "../data";
import { icon } from "../icons";

// The NIST SP 800-61 phase tracker, shared by the Incident hero (compact rail) and the report (full stepper).
// Entry times come from incident_event rows of kind "state" ("Phase set to Containment"), so it is live data.

export interface PhaseStep {
  phase: NistPhase;
  state: "done" | "current" | "next";
  enteredAt: Ts | null;
  endedAt: Ts | null;
  by: string;
}

export function phaseSteps(): PhaseStep[] {
  const d = data();
  const inc = d.incident();
  const entered = new Map<NistPhase, { at: Ts; by: string }>();
  for (const e of d.events()) {
    if (e.kind !== "state") continue;
    const m = /^Phase set to (.+)$/.exec(e.text);
    const p = m ? phaseFromLabel(m[1]) : null;
    if (p) entered.set(p, { at: e.at, by: e.actor });
  }
  const cur = inc ? NIST_PHASES.indexOf(inc.nistPhase) : -1;
  return NIST_PHASES.map((p, i) => {
    const here = entered.get(p);
    const next = entered.get(NIST_PHASES[i + 1]);
    return {
      phase: p,
      state: i < cur ? "done" : i === cur ? "current" : "next",
      enteredAt: here?.at ?? null,
      endedAt: i < cur ? (next?.at ?? null) : null,
      by: here?.by ?? "",
    };
  });
}

/** Compact rail for the hero: five labelled stops, the live one lit. */
export function phaseRailHTML(steps: PhaseStep[], active: boolean): string {
  return `<ol class="phase-rail${active ? "" : " idle"}" aria-label="NIST SP 800-61 phase">${steps
    .map(
      (s, i) => `<li class="ph" data-s="${active ? s.state : "next"}"><i>${s.state === "done" && active ? icon("check") : String(i + 1)}</i><span class="ph-t">${PHASE[s.phase].label}</span><em>${
        active && s.enteredAt ? fmtClock(s.enteredAt) : ""
      }</em></li>`,
    )
    .join("")}</ol>`;
}

/** Full stepper for the report: label, what the phase is for, when it was entered and by whom. */
export function phaseStepperHTML(steps: PhaseStep[]): string {
  return `<ol class="phase-full">${steps
    .map((s, i) => {
      const when =
        s.state === "next"
          ? "Not started"
          : s.state === "current"
            ? `Current · since ${s.enteredAt ? fmtClock(s.enteredAt) : "now"}`
            : `Done · ${s.enteredAt ? fmtClock(s.enteredAt) : ""}${s.endedAt ? ` to ${fmtClock(s.endedAt)}` : ""}`;
      return `<li data-s="${s.state}"><span class="pf-i">${s.state === "done" ? icon("check") : String(i + 1)}</span>
        <b>${PHASE[s.phase].label}</b><p>${PHASE[s.phase].gloss}</p><em>${when}</em>${s.by && s.state !== "next" ? `<small>Set by ${s.by}</small>` : ""}</li>`;
    })
    .join("")}</ol>`;
}
