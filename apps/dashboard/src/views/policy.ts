import { POLICY_AUTO, POLICY_HUMAN, POLICY_PRESETS, type PolicyAction } from "../script";
import { icon } from "../icons";
import { $, $$, setAttr, setVar } from "../dom";

// Policy: what Warden may do alone, and what needs a human. Interactive in-memory toggles.
export const policyState = {
  on: new Set<string>(POLICY_PRESETS.Standard),
};

const prow = (a: PolicyAction, locked: boolean) => `<div class="prow">
  <span class="r-ico">${icon(a.icon)}</span>
  <span class="r-main"><b>${a.name}</b><em>${a.note}</em></span>
  <span class="switch" role="switch" tabindex="${locked ? -1 : 0}" aria-label="${a.name}" aria-checked="false" data-pol="${a.id}" data-target="pol:${a.id}"${locked ? ' data-locked="1" aria-disabled="true"' : ""}><i></i></span>
</div>`;

export const policy = {
  html(): string {
    return `<section class="view" id="v-policy" data-view="policy">
      <header class="hero-head" style="margin-bottom:0">
        <h1 class="h-title" style="font-size:44px;max-width:900px">Policy, not the model, controls execution.</h1>
        <p class="h-sub">Agents propose. The playbook decides what runs on its own, and a person decides the rest.</p>
        <div class="p-flow">
          <span class="step-chip">${icon("cpu")}Agent proposes</span><span class="arr">${icon("chevron")}</span>
          <span class="step-chip on">${icon("shieldCheck")}Policy checks</span><span class="arr">${icon("chevron")}</span>
          <span class="step-chip">${icon("bolt")}Action runs</span><span class="arr">${icon("chevron")}</span>
          <span class="step-chip">${icon("scribe")}Scribe records</span>
        </div>
      </header>

      <div class="p-bar">
        <span>Playbook guest-escape v3</span>
        <div class="seg" id="presetSeg" role="tablist" aria-label="Autonomy">
          <i class="seg-lens"></i>
          ${Object.keys(POLICY_PRESETS)
            .map((p) => `<button type="button" role="tab" data-preset="${p}" data-target="preset:${p}" aria-selected="false">${p}</button>`)
            .join("")}
        </div>
      </div>

      <div class="p-cols">
        <section class="panel pgroup">
          <h2>Warden acts on its own</h2>
          <p>Each of these can be undone, or only reads.</p>
          ${POLICY_AUTO.map((a) => prow(a, false)).join("")}
        </section>
        <section class="panel pgroup">
          <h2>Needs a human</h2>
          <p>Locked by policy. Warden asks, a person approves.</p>
          ${POLICY_HUMAN.map((a) => prow(a, true)).join("")}
          <div class="lock-note">${icon("lock")}High-impact steps never run unattended.</div>
        </section>
      </div>
    </section>`;
  },

  setPreset(name: string) {
    policyState.on = new Set(POLICY_PRESETS[name] ?? []);
  },
  toggle(id: string) {
    if (policyState.on.has(id)) policyState.on.delete(id);
    else policyState.on.add(id);
  },
  currentPreset(): string | null {
    for (const [name, ids] of Object.entries(POLICY_PRESETS))
      if (ids.length === policyState.on.size && ids.every((i) => policyState.on.has(i))) return name;
    return null;
  },

  render() {
    for (const sw of $$(".switch", $("#v-policy"))) {
      const locked = sw.dataset.locked === "1";
      setAttr(sw, "aria-checked", String(!locked && policyState.on.has(sw.dataset.pol!)));
    }
    const seg = $("#presetSeg");
    const cur = policy.currentPreset();
    setAttr(seg, "data-custom", cur ? "0" : "1");
    for (const b of $$("button", seg)) setAttr(b, "aria-selected", String(b.dataset.preset === cur));
    const sel = cur ? ($(`button[data-preset="${cur}"]`, seg) as HTMLElement) : null;
    if (sel && sel.offsetWidth) {
      setVar(seg, "--x", `${sel.offsetLeft - 4}px`);
      setVar(seg, "--w", `${sel.offsetWidth}px`);
    }
  },
};
