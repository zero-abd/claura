import {
  ASSET_STATUSES,
  CLASS_LABEL,
  STATUS,
  data,
  fmtClock,
  isAlertStatus,
  isHardAlert,
  plural,
  scopeRange,
  type AssetStatus,
  type DataAsset,
} from "../data";
import { icon } from "../icons";
import { $, disc, setAttr, setHTML, setText } from "../dom";
import { esc, linkHosts } from "../hosts";
import { type Phase } from "../engine";

// Data scope: every data asset the incident could have touched, with its system, classification, the range of
// records at risk and a status pill (locked for ransomware, exfiltrated, ...). Responders update the status live.

export const statusPill = (s: AssetStatus, cls = "") =>
  `<span class="st-pill ${cls}" data-st="${s}">${icon(STATUS[s].icon)}<span>${STATUS[s].label}</span></span>`;

const byWorst = (a: DataAsset, b: DataAsset) => STATUS[b.status].rank - STATUS[a.status].rank || a.name.localeCompare(b.name);

/** counts per status, worst first, zeros left out */
export function countByStatus(assets: DataAsset[]): { status: AssetStatus; n: number }[] {
  return ASSET_STATUSES.map((s) => ({ status: s, n: assets.filter((a) => a.status === s).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank);
}
/** "1 locked · 1 exfil suspected · 1 accessed · 2 intact" (max parts, when given, truncates the tail) */
export function scopeSummaryText(assets: DataAsset[], max = 99): string {
  return countByStatus(assets)
    .slice(0, max)
    .map((c) => `${c.n} ${STATUS[c.status].short}`)
    .join(" · ");
}
export const scopeSummaryHTML = (assets: DataAsset[]) =>
  countByStatus(assets)
    .map((c) => `<span class="sc-seg" data-st="${c.status}"><i></i><b>${c.n}</b> ${STATUS[c.status].short}</span>`)
    .join("");
export const scopeBar = (assets: DataAsset[]) =>
  countByStatus(assets)
    .map((c) => `<i data-st="${c.status}" style="flex:${c.n}" title="${plural(c.n, "asset")} ${STATUS[c.status].short}"></i>`)
    .join("");
/** assets that need a person right now: shown on the sidebar badge and the Incident card */
export const attention = (assets: DataAsset[]) => assets.filter((a) => isAlertStatus(a.status)).sort(byWorst);
export const hardAlerts = (assets: DataAsset[]) => assets.filter((a) => isHardAlert(a.status));

const unitOf = (a: DataAsset) => (a.records < 100 ? "items" : "records");
const updated = (a: DataAsset) => `${esc(a.updatedBy)} · ${fmtClock(a.updatedAt)}`;

const DOMAIN: Record<string, { title: string; sub: string }> = {
  "DFW-2": { title: "DFW-2 data center", sub: "The vGPU escape, INC-0419" },
  "Corp IT": { title: "Corporate IT", sub: "Parallel ransomware event on a separate network" },
};
const domainOf = (a: DataAsset) => a.system.split(" · ")[0];

export const sc = {
  filter: "all" as AssetStatus | "all",
  prev: new Map<number, string>(),
  lastKey: "",
};
export function setScopeFilter(f: string) {
  sc.filter = (ASSET_STATUSES as string[]).includes(f) ? (f as AssetStatus) : "all";
  sc.lastKey = "";
}

function assetRow(a: DataAsset, flash: boolean): string {
  const r = scopeRange(a.status, a.records);
  const m = STATUS[a.status];
  const chips = ASSET_STATUSES.map(
    (s) =>
      `<button type="button" class="st-pill btn" data-st="${s}" data-set-status="${s}" data-asset="${a.id}" data-target="asset:${a.id}:${s}" aria-pressed="${s === a.status}">${icon(STATUS[s].icon)}<span>${STATUS[s].label}</span></button>`,
  ).join("");
  return disc(
    `asset:${a.id}`,
    `<span class="as-ico" data-st="${a.status}">${icon(m.icon)}</span>
     <span class="as-main"><b>${linkHosts(a.name)}</b><span>${esc(a.system)}</span></span>
     <span class="as-class" data-c="${a.classification}">${CLASS_LABEL[a.classification]}</span>
     <span class="as-range"><b>${r.text}</b><em>${unitOf(a)}${r.exact ? "" : " · not known yet"}</em></span>
     ${statusPill(a.status)}`,
    `<div class="as-body">
       <p class="as-note">${linkHosts(a.note)}</p>
       <dl class="as-facts">
         <div><dt>Records in the asset</dt><dd>${a.records.toLocaleString("en-US")} ${unitOf(a)}</dd></div>
         <div><dt>Classification</dt><dd>${CLASS_LABEL[a.classification]}</dd></div>
         <div><dt>Last updated by</dt><dd>${updated(a)}</dd></div>
         <div><dt>Status means</dt><dd>${esc(m.gloss)}</dd></div>
       </dl>
       <div class="as-set">
         <span class="as-set-l">Set status</span>
         <div class="as-set-chips">${chips}</div>
         <input class="as-note-in" type="text" maxlength="160" placeholder="Add a note (optional)" aria-label="Note for ${esc(a.name)}" data-asset-note="${a.id}" />
       </div>
     </div>`,
    `row asset${flash ? " flash" : ""}`,
  );
}

export const scope = {
  html(): string {
    return `<section class="view" id="v-scope" data-view="scope">
      <header class="hero-head">
        <h1 class="h-title">Data scope</h1>
        <p class="h-sub">What the attacker could reach, and what state it is in. Agents and responders update this live.</p>
      </header>
      <div class="glass sc-summary" id="scSummary">
        <div class="sc-top">
          <div class="sc-count"><b id="scN">0</b><span id="scNl">assets in scope</span></div>
          <div class="sc-line" id="scLine"></div>
          <span class="sc-live" id="scLive"><i></i><span id="scAt"></span></span>
        </div>
        <div class="sc-bar" id="scBar"></div>
        <div class="sc-filters" id="scFilters" role="tablist" aria-label="Filter by status"></div>
      </div>
      <div id="scGroups"></div>
    </section>`;
  },

  render(_ph: Phase) {
    const d = data();
    const assets = d.assets();
    const inc = d.incident();
    setText($("#scN"), String(assets.length));
    setText($("#scNl"), assets.length === 1 ? "asset in scope" : "assets in scope");
    setHTML($("#scLine"), `l:${scopeSummaryText(assets)}`, () => scopeSummaryHTML(assets) || `<span class="sc-none">${inc ? "Nothing classified yet" : "No open incident"}</span>`);
    setHTML($("#scBar"), `b:${scopeSummaryText(assets)}`, () => scopeBar(assets));
    const newest = assets.reduce((t, a) => Math.max(t, a.updatedAt), 0);
    setText($("#scAt"), assets.length ? `Live · updated ${fmtClock(newest)}` : "Live");

    // filters double as the legend: one chip per status that exists, with its count
    const counts = countByStatus(assets);
    if (sc.filter !== "all" && !counts.some((c) => c.status === sc.filter)) sc.filter = "all";
    setHTML($("#scFilters"), `f:${sc.filter}:${counts.map((c) => c.status + c.n).join()}`, () =>
      assets.length
        ? `<button type="button" class="f-chip" role="tab" data-sc-filter="all" data-target="scope-filter:all" aria-selected="${sc.filter === "all"}">All <b>${assets.length}</b></button>` +
          counts
            .map(
              (c) =>
                `<button type="button" class="f-chip" role="tab" data-st="${c.status}" data-sc-filter="${c.status}" data-target="scope-filter:${c.status}" aria-selected="${sc.filter === c.status}"><i></i>${STATUS[c.status].label} <b>${c.n}</b></button>`,
            )
            .join("")
        : "",
    );

    // the list, grouped by domain, worst first. Rebuilt only when a row actually changed.
    const shown = (sc.filter === "all" ? assets : assets.filter((a) => a.status === sc.filter)).slice().sort(byWorst);
    const key = `${sc.filter}|${shown.map((a) => `${a.id}:${a.status}:${a.updatedAt}:${a.note.length}`).join(",")}`;
    const box = $("#scGroups");
    if (key !== sc.lastKey) {
      sc.lastKey = key;
      const flashIds = new Set<number>();
      for (const a of shown) {
        const sig = `${a.status}:${a.updatedAt}`;
        const was = sc.prev.get(a.id);
        if (was !== undefined && was !== sig) flashIds.add(a.id);
        sc.prev.set(a.id, sig);
      }
      const groups = new Map<string, DataAsset[]>();
      for (const a of shown) groups.set(domainOf(a), [...(groups.get(domainOf(a)) ?? []), a]);
      const order = [...groups.entries()].sort((a, b) => STATUS[b[1][0].status].rank - STATUS[a[1][0].status].rank);
      box.innerHTML = order.length
        ? order
            .map(([dom, rows]) => {
              const info = DOMAIN[dom] ?? { title: dom, sub: "" };
              return `<section class="sc-group">
                <header class="sc-gh"><div><h2>${esc(info.title)}</h2><span>${esc(info.sub)}</span></div><div class="sc-gsum">${scopeSummaryHTML(rows)}</div></header>
                <div class="glass group">${rows.map((a) => assetRow(a, flashIds.has(a.id))).join("")}</div>
              </section>`;
            })
            .join("")
        : `<div class="glass sc-empty"><span class="sheet-ico host">${icon("database")}</span><h2>${inc ? "Nothing classified yet" : "No open incident"}</h2>
            <p>${inc ? "Agents classify what the attacker could reach as they learn it. Rows appear here the moment they do." : "When an incident opens, every system and data set it could touch is listed here with its status."}</p></div>`;
    }
  },
};

/** The card on the Incident page: the summary line, the bar and the assets that need attention. */
export const scopeCard = {
  html(): string {
    return `<div class="glass card scope-card" id="scopeCard" data-go="scope" role="link" tabindex="0" data-target="scope-card" aria-label="Open data scope">
      <div class="card-head"><h2>Data scope</h2><span class="meta" id="scCardMeta"></span><span class="open-link">Open${icon("chevron", "chev")}</span></div>
      <div class="sc-line" id="scCardLine"></div>
      <div class="sc-bar" id="scCardBar"></div>
      <div class="sc-attn" id="scCardAttn"></div>
    </div>`;
  },
  render() {
    const d = data();
    const assets = d.assets();
    const inc = d.incident();
    const sig = scopeSummaryText(assets);
    setAttr($("#scopeCard"), "data-empty", assets.length ? "0" : "1");
    setText($("#scCardMeta"), assets.length ? `${plural(assets.length, "asset")} in scope` : inc ? "Classifying" : "No open incident");
    setHTML($("#scCardLine"), `l:${sig}`, () => scopeSummaryHTML(assets) || `<span class="sc-none">${inc ? "Agents are still classifying what was reachable" : "Fills in when an incident opens"}</span>`);
    setHTML($("#scCardBar"), `b:${sig}`, () => scopeBar(assets));
    const att = attention(assets).slice(0, 3);
    setHTML($("#scCardAttn"), `a:${att.map((a) => a.id + a.status).join()}`, () =>
      att
        .map((a) => {
          const r = scopeRange(a.status, a.records);
          return `<div class="attn" data-st="${a.status}"><span class="as-ico" data-st="${a.status}">${icon(STATUS[a.status].icon)}</span>
            <div><b>${linkHosts(a.name)}</b><span>${statusPill(a.status)}<em>${r.text} ${unitOf(a)}</em></span></div></div>`;
        })
        .join(""),
    );
  },
};

/** Sidebar badge: how many assets need attention, and whether any is a hard alert (locked / exfil). */
export function scopeBadge(): { n: number; hard: boolean } {
  const att = attention(data().assets());
  return { n: att.length, hard: att.some((a) => isHardAlert(a.status)) };
}

/** Called from the click handler: set a status from the expanded row, with the optional note. */
export function applyAssetStatus(id: number, status: AssetStatus, noteEl: HTMLInputElement | null): boolean {
  const note = noteEl?.value ?? "";
  const r = data().setAssetStatus(id, status, note);
  if (r.ok && noteEl) noteEl.value = "";
  sc.lastKey = "";
  return r.ok;
}
