import { icon } from "../icons";

// Shells: a full-height glass panel. A separate terminal module mounts into #claura-shell-slot
// (see window.claura.openShell(hostId)). Until it does, the slot shows a calm empty state, which
// hides itself as soon as the module adds anything to the slot.
export const shells = {
  html(): string {
    return `<section class="view" id="v-shells" data-view="shells">
      <div class="glass shell-panel" id="claura-shell-slot" role="region" aria-label="Secure shells">
        <div class="slot-empty">
          <span class="sheet-ico host">${icon("terminal")}</span>
          <h2>No shell open</h2>
          <p>Pick a host on the facility map, or click any host name, then choose Open secure shell.</p>
          <button type="button" class="btn-chip" data-go="overview" data-target="shells-pick">Open the facility map</button>
        </div>
      </div>
    </section>`;
  },
  render() {},
};
