import { icon } from "../icons";
import { $, setAttr, setText } from "../dom";
import { esc } from "../hosts";
import { features, hookOf, retryFeatures, type Feature } from "../features";

// Integrations: the optional modules the console loads from its gateway (secure shell, voice, Solana anchoring, ...).
// One card per feature: title, hackathon track, a status badge (live, mock or down) and an Open button. A feature's own UI
// mounts into the card's panel (window.claura.integrations[name].open(container)). The gateway being down is a normal state
// with its own empty page: the console works without any of this.

const STATUS_LABEL = { live: "Live", mock: "Mock", down: "Down" } as const;
const ui = { open: new Set<string>(), mounted: new Set<string>() };

/** Features not in the health list but present on window.claura.integrations (a module attached itself) are shown too. */
function merged(): Feature[] {
  const out = features.list.map((f) => {
    const h = hookOf(f.name);
    return { ...f, title: f.title || h?.title || f.name, track: f.track || h?.track || "" };
  });
  const reg = (window as unknown as { claura?: { integrations?: Record<string, { title?: string; track?: string; status?: string }> } }).claura?.integrations ?? {};
  for (const [name, h] of Object.entries(reg)) {
    if (out.some((f) => f.name === name) || !h) continue;
    const status = h.status === "live" || h.status === "mock" ? h.status : "down";
    out.push({ name, title: h.title ?? name, track: h.track ?? "", status, ui: "" });
  }
  return out;
}

const ICON_OF: Record<string, string> = { ssh: "terminal", voice: "mic", solana: "seal" };

export const integrations = {
  html(): string {
    return `<section class="view" id="v-integrations" data-view="integrations">
      <header class="hero-head">
        <h1 class="h-title">Integrations</h1>
        <p class="h-sub">Optional modules the console loads from its local gateway. Each says whether it is live, running on a mock, or down. The console works without any of them.</p>
      </header>
      <div id="intBody"></div>
    </section>`;
  },

  render() {
    const list = merged();
    const body = $("#intBody");
    // a gateway that is down is the empty state, even if a module attached something to window.claura earlier
    const state = features.gateway === "checking" ? "checking" : features.gateway === "down" ? "down" : list.length ? "list" : "none";

    if (state !== "list") {
      if (body.dataset.state !== state) {
        body.dataset.state = state;
        body.innerHTML = emptyHTML(state);
      }
      return;
    }
    if (body.dataset.state !== "list") {
      body.dataset.state = "list";
      body.innerHTML = `<div class="int-grid" id="intGrid"></div>`;
    }
    const grid = $("#intGrid");
    // keep one card per feature and update it in place: a feature's own UI lives inside the card and must never be wiped
    const want = new Set(list.map((f) => f.name));
    for (const el of Array.from(grid.children) as HTMLElement[]) if (!want.has(el.dataset.feature ?? "")) el.remove();
    for (const f of list) {
      let card = grid.querySelector(`[data-feature="${CSS.escape(f.name)}"]`) as HTMLElement | null;
      if (!card) {
        card = document.createElement("article");
        card.className = "glass int-card";
        card.dataset.feature = f.name;
        card.innerHTML = `<div class="int-top">
            <span class="a-ico">${icon(ICON_OF[f.name] ?? "link")}</span>
            <div class="int-id"><h3></h3><span class="int-track"></span></div>
            <span class="chip int-badge" data-tone="idle"><i></i><span></span></span>
          </div>
          <p class="int-meta"><code></code></p>
          <div class="int-actions"><button type="button" class="btn-chip accent int-open" data-act="int-open" data-target="int-open:${esc(f.name)}">Open</button></div>
          <div class="int-mount" hidden></div>`;
        grid.appendChild(card);
      }
      const hook = hookOf(f.name);
      const canOpen = f.status !== "down" && (typeof hook?.open === "function" || f.name === "ssh");
      setText(card.querySelector("h3"), f.title);
      setText(card.querySelector(".int-track"), f.track ? `${f.track} track` : "");
      const badge = card.querySelector(".int-badge") as HTMLElement;
      setAttr(badge, "data-tone", f.status === "live" ? "safe" : f.status === "mock" ? "busy" : "hot");
      setText(badge.querySelector("span"), STATUS_LABEL[f.status]);
      setText(card.querySelector(".int-meta code"), f.ui || f.name);
      const btn = card.querySelector(".int-open") as HTMLButtonElement;
      const opened = ui.open.has(f.name);
      setText(btn, opened ? "Close" : "Open");
      if (btn.disabled !== !canOpen) btn.disabled = !canOpen;
      setAttr(btn, "title", canOpen ? "" : f.status === "down" ? "This module is down" : "This module has no panel to open");
      const mount = card.querySelector(".int-mount") as HTMLElement;
      if (mount.hidden === opened) mount.hidden = !opened;
    }
  },
};

function emptyHTML(state: string): string {
  if (state === "checking")
    return `<div class="glass int-empty"><span class="sheet-ico host">${icon("link")}</span><h2>Checking the gateway</h2><p>Looking for the feature gateway on this machine.</p></div>`;
  if (state === "none")
    return `<div class="glass int-empty"><span class="sheet-ico host">${icon("link")}</span><h2>No integrations registered</h2>
      <p>The gateway is running but lists no features yet.</p><button type="button" class="btn-chip" data-act="int-retry" data-target="int-retry">${icon("reset")}Check again</button></div>`;
  return `<div class="glass int-empty"><span class="sheet-ico host">${icon("link")}</span><h2>Gateway not reachable</h2>
    <p>Secure shell, voice and Solana anchoring load from a small local gateway at <code>${esc(features.base.replace(/^https?:\/\//, ""))}</code>. It is not running, so none of them are loaded. The console works without them.</p>
    <button type="button" class="btn-chip" data-act="int-retry" data-target="int-retry">${icon("reset")}Check again</button></div>`;
}

/** The Open / Close button on a card. Calls the feature's own open(container) the first time and after each re-open. */
export async function toggleFeature(name: string): Promise<void> {
  const card = document.querySelector(`.int-card[data-feature="${CSS.escape(name)}"]`) as HTMLElement | null;
  if (!card) return;
  if (ui.open.has(name)) {
    ui.open.delete(name);
    return;
  }
  const hook = hookOf(name);
  if (typeof hook?.open !== "function") {
    // the shell feature has its own page in the console
    if (name === "ssh") (window.claura as unknown as { go(v: string): unknown }).go("shells");
    return;
  }
  ui.open.add(name);
  const mount = card.querySelector(".int-mount") as HTMLElement;
  mount.hidden = false;
  try {
    await hook.open(mount);
    ui.mounted.add(name);
  } catch (e) {
    mount.innerHTML = `<p class="int-err">This module could not open: ${esc(e instanceof Error ? e.message : String(e))}</p>`;
  }
}

export const retryIntegrations = () => void retryFeatures();
