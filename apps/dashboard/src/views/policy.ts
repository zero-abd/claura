import { POLICY_AUTO, POLICY_HUMAN, POLICY_PRESETS, type PolicyAction } from "../script";
import { icon } from "../icons";
import { $, $$, setAttr, setVar } from "../dom";
import { isLive } from "../engine";
import { liveSource } from "../live-engine";

// Policy: what Warden may do alone, and what needs a human. Interactive in-memory toggles.
export const policyState = {
  on: new Set<string>(POLICY_PRESETS.Standard),
};
// live: the switches mirror the module's policy table (auto = on). They are read-only here: changing policy is the
// set_policy reducer (admin or commander), and a half-wired toggle that did nothing to the database would be a lie.
const ACTION_OF: Record<string, string> = {
  isolate: "isolate_network",
  revoke: "revoke_credentials",
  cordon: "cordon_host",
  pause: "pause_guest",
  capture: "capture_memory",
  failover: "failover_guests",
  quarantine: "quarantine_host",
  reimage: "reimage_host",
  terminate: "delete_vm",
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
        <h1 class="h-title" style="font-size:56px;max-width:900px">Policy, not the model, controls execution.</h1>
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
        <section class="glass pgroup">
          <h2>Warden acts on its own</h2>
          <p>Each of these can be undone, or only reads.</p>
          ${POLICY_AUTO.map((a) => prow(a, false)).join("")}
        </section>
        <section class="glass pgroup">
          <h2>Needs a human</h2>
          <p>Locked by policy. Warden asks, a person approves.</p>
          ${POLICY_HUMAN.map((a) => prow(a, true)).join("")}
          <div class="lock-note">${icon("lock")}High-impact steps never run unattended.</div>
        </section>
      </div>
    </section>`;
  },

  setPreset(name: string) {
    if (isLive()) return;
    policyState.on = new Set(POLICY_PRESETS[name] ?? []);
  },
  toggle(id: string) {
    if (isLive()) return;
    if (policyState.on.has(id)) policyState.on.delete(id);
    else policyState.on.add(id);
  },
  currentPreset(): string | null {
    for (const [name, ids] of Object.entries(POLICY_PRESETS))
      if (ids.length === policyState.on.size && ids.every((i) => policyState.on.has(i))) return name;
    return null;
  },

  render() {
    const live = isLive();
    if (live) {
      const pols = liveSource()?.policies() ?? [];
      policyState.on = new Set(POLICY_AUTO.filter((a) => pols.find((p) => p.action === ACTION_OF[a.id])?.mode === "auto").map((a) => a.id));
      let note = document.getElementById("polLiveNote");
      if (!note) {
        note = document.createElement("p");
        note.id = "polLiveNote";
        note.className = "pol-live-note";
        note.textContent = "Live: this page mirrors the module's policy table, so it is read-only here. An admin or commander changes it with set_policy.";
        $("#v-policy .p-bar").after(note);
      }
    }
    for (const sw of $$(".switch", $("#v-policy"))) {
      if (live) {
        setAttr(sw, "data-locked", "1");
        setAttr(sw, "aria-disabled", "true");
        setAttr(sw, "tabindex", "-1");
      }
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
