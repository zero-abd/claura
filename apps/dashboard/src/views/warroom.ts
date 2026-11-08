import {
  BANNER,
  BRIEFS,
  CHANNELS,
  DECISIONS,
  MESSAGES,
  OBLIGATIONS,
  OBLIGATIONS_LABEL,
  PEOPLE,
  TASKS,
  type AgentSpeaker,
  type BriefStage,
  type ChannelId,
  type Message,
  type PersonId,
  type Speaker,
} from "../warroom-data";
import { AGENTS, CLOCK_BASE, STEPS } from "../script";
import { AGENT_ICON, icon } from "../icons";
import { $, $$, disc, setAttr, setHTML, setText } from "../dom";
import { S, at, finalState, since, type Phase } from "../engine";
import { fmtT } from "../util";
import { linkHosts } from "../hosts";

// War Room: the out-of-band coordination channel. A plain-language brief, channels and people,
// the live thread, and (collapsed) tasks, decisions and notification clocks.

interface LocalMsg {
  text: string;
  clock: string;
}
export const wr = {
  selected: "#command" as ChannelId,
  seen: {} as Record<string, number>,
  local: {} as Record<string, LocalMsg[]>,
  threadKey: "",
  lastCount: {} as Record<string, number>,
};

export const normalizeChannel = (c: string): ChannelId | null => {
  const id = (c.startsWith("#") ? c : `#${c}`) as ChannelId;
  return CHANNELS.some((x) => x.id === id) ? id : null;
};
export function selectChannel(c: string): boolean {
  const id = normalizeChannel(c);
  if (!id) return false;
  wr.selected = id;
  return true;
}

export function onlineCount(): number {
  return PEOPLE.filter((p) => p.joinT === null || (S.started && S.r >= p.joinT)).length;
}
const isOnline = (joinT: number | null) => joinT === null || (S.started && S.r >= joinT);

const clockAt = (sec: number) => {
  const total = CLOCK_BASE.h * 3600 + CLOCK_BASE.m * 60 + CLOCK_BASE.s + Math.floor(Math.max(0, sec));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 3600) % 24)}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}`;
};

function stage(ph: Phase): BriefStage {
  if (ph === "nominal") return "quiet";
  if (ph === "breach") return S.r < STEPS[0].start ? "detect" : "contain";
  if (ph === "approval") return "approval";
  if (ph === "isolating") return "quarantine";
  return "contained";
}

const personOf = (id: string) => PEOPLE.find((p) => p.id === id);
const avatar = (who: Speaker) => {
  if (who in AGENT_ICON) return `<span class="m-av agent" data-who="${who}">${icon(AGENT_ICON[who])}</span>`;
  const p = personOf(who)!;
  return `<span class="m-av h-${p.id}${p.initials.length > 2 ? " long" : ""}">${p.initials}</span>`;
};
const nameOf = (who: Speaker) => {
  if (who in AGENT_ICON) return { name: AGENTS.find((a) => a.id === (who as AgentSpeaker))!.name, role: "", agent: true };
  const p = personOf(who as PersonId)!;
  return { name: p.initials, role: p.role === p.initials ? "" : p.role, agent: false };
};

function visibleMessages(ch: ChannelId): Message[] {
  return MESSAGES.filter((m) => m.ch === ch && since(m) >= 0);
}

export const warroom = {
  html(): string {
    const channels = CHANNELS.map(
      (c) => `<button type="button" class="ch" data-ch="${c.id}" data-target="ch:${c.id}" aria-selected="false">
        <span class="ch-name">${c.id}</span><span class="ch-n" id="chn-${c.id.slice(1)}"></span>
      </button>`,
    ).join("");
    const people = PEOPLE.map(
      (p) => `<div class="person" id="pp-${p.id}" data-online="0">
        <span class="m-av h-${p.id}${p.initials.length > 2 ? " long" : ""}">${p.initials}</span>
        <div><b>${p.role}</b><span class="ver">${icon("seal")}verified out-of-band</span></div>
        <i class="pdot"></i>
      </div>`,
    ).join("");

    const rail = `<aside class="wr-rail glass group">
      ${disc("tasks", `<span class="r-ico">${icon("tasks")}</span><span class="r-title">Tasks</span><span class="r-val" id="tkVal"></span>`, `<div class="row-body wr-pad"><div id="tkList"></div></div>`, "row")}
      ${disc("decisions", `<span class="r-ico">${icon("seal")}</span><span class="r-title">Decision log</span><span class="r-val" id="dcVal"></span>`, `<div class="row-body wr-pad"><div id="dcList"></div></div>`, "row")}
      ${disc(
        "clock",
        `<span class="r-ico">${icon("clock")}</span><span class="r-title">Notification clock</span>`,
        `<div class="row-body wr-pad">
          <span class="tag warm">${OBLIGATIONS_LABEL}</span>
          ${OBLIGATIONS.map(
            (o) => `<div class="ob"><div class="ob-big"><b>${o.big}</b><span>${o.unit}</span></div><div><b>${o.name}</b><p>${o.rule}</p></div></div>`,
          ).join("")}
          <p class="ob-note" id="obNote">Clocks start only when counsel makes the call.</p>
        </div>`,
        "row",
      )}
    </aside>`;

    return `<section class="view" id="v-warroom" data-view="warroom">
      <div class="glass wr-banner"><span class="wr-ico">${icon("radio")}</span><span>${BANNER}</span><span class="tag">SpacetimeDB cloud</span></div>

      <div class="glass wr-brief">
        <div class="wr-brief-main">
          <div class="card-head"><h2>Brief for stakeholders</h2><div class="head-r"><span class="meta" id="wrStamp"></span><button type="button" class="btn-chip play" data-act="play-brief" data-tip="Play brief" aria-label="Play brief" data-target="play-brief">${icon("speaker")}<span>Play brief</span></button></div></div>
          <dl class="brief-lines" id="wrLines"></dl>
        </div>
        <div class="wr-pair" id="wrPair"></div>
      </div>

      <div class="wr-body">
        <aside class="glass wr-side">
          <div class="side-sec"><h3>Channels</h3><div class="chs">${channels}</div></div>
          <div class="side-sec"><h3>People<span id="wrOnline"></span></h3><div class="people">${people}</div></div>
        </aside>

        <section class="glass wr-thread">
          <header class="th-head">
            <div><h2 id="thName">#command</h2><span id="thBlurb"></span></div>
            <span class="tag">out-of-band</span>
          </header>
          <div class="th-msgs" id="thMsgs"></div>
          <form class="composer" id="wrForm" autocomplete="off">
            <input id="wrInput" type="text" placeholder="Message #command" aria-label="Message" />
            <button type="submit" class="send" aria-label="Send" data-target="send">${icon("send")}</button>
          </form>
        </section>

        ${rail}
      </div>
    </section>`;
  },

  send(text: string) {
    const t = text.trim();
    if (!t) return false;
    (wr.local[wr.selected] ??= []).push({ text: t, clock: clockAt(S.started ? S.r : 0) });
    wr.threadKey = "";
    return true;
  },

  render(ph: Phase) {
    const st = stage(ph);
    const b = BRIEFS[st];
    setText($("#wrStamp"), b.stamp);
    setHTML($("#wrLines"), st, () =>
      [
        ["What happened", b.happened],
        ["What is contained", b.contained],
        ["Impact", b.impact],
        ["What we need from you", b.need],
      ]
        .map(([k, v]) => `<div class="bl"><dt>${k}</dt><dd>${linkHosts(v)}</dd></div>`)
        .join(""),
    );
    setHTML($("#wrPair"), st, () => {
      const list = (items: string[], ico: string) => items.map((i) => `<li>${icon(ico)}<span>${linkHosts(i)}</span></li>`).join("");
      return `<div><h3>What we know</h3><ul class="know">${list(b.know, "check")}</ul></div>
        <div><h3>What we don't know yet</h3><ul class="dont">${list(b.dont, "info")}</ul></div>`;
    });

    // ---- channels + unread
    const sel = wr.selected;
    for (const c of CHANNELS) {
      const n = visibleMessages(c.id).length + (wr.local[c.id]?.length ?? 0);
      if (c.id === sel || wr.seen[c.id] === undefined || wr.seen[c.id] > n) wr.seen[c.id] = n;
      const unread = c.id === sel ? 0 : n - wr.seen[c.id];
      const btn = $(`.ch[data-ch="${c.id}"]`);
      setAttr(btn, "aria-selected", String(c.id === sel));
      const badge = $(`#chn-${c.id.slice(1)}`);
      setText(badge, unread > 0 ? String(unread) : "");
      badge.dataset.on = unread > 0 ? "1" : "0";
    }

    // ---- people
    for (const p of PEOPLE) setAttr($(`#pp-${p.id}`), "data-online", isOnline(p.joinT) ? "1" : "0");
    setText($("#wrOnline"), `${onlineCount()} online`);

    // ---- thread
    const ch = CHANNELS.find((c) => c.id === sel)!;
    setText($("#thName"), ch.id);
    setText($("#thBlurb"), ch.blurb);
    const input = $("#wrInput") as HTMLInputElement;
    if (input.placeholder !== `Message ${ch.id}`) input.placeholder = `Message ${ch.id}`;
    const msgs = visibleMessages(sel);
    const loc = wr.local[sel] ?? [];
    const pending = finalState() === "request";
    const key = `${sel}:${msgs.length}:${loc.length}:${pending}:${S.A ?? ""}`;
    if (wr.threadKey !== key) {
      const prev = wr.lastCount[sel] ?? msgs.length + loc.length;
      const sameChannel = wr.threadKey.startsWith(sel + ":");
      wr.threadKey = key;
      const total = msgs.length + loc.length;
      const box = $("#thMsgs");
      const rows = [
        ...msgs.map((m) => {
          const who = nameOf(m.who);
          const clock = clockAt(at(m) < 0 ? 0 : at(m));
          if (m.system) return `<div class="msg system"><span>${m.text}</span></div>`;
          return `<div class="msg ${who.agent ? "is-agent" : "is-human"}">
            ${avatar(m.who)}
            <div class="m-main">
              <div class="m-head"><b>${who.name}</b>${who.agent ? `<span class="m-tag">agent</span>` : who.role ? `<span class="m-role">${who.role}</span>` : ""}<time>${clock}</time></div>
              <p>${linkHosts(m.text)}</p>
              ${m.action === "review" && pending ? `<button type="button" class="btn-chip accent" data-act="review">Review and approve</button>` : ""}
            </div>
          </div>`;
        }),
        ...loc.map(
          (m) => `<div class="msg is-human">
            ${avatar("RK")}
            <div class="m-main"><div class="m-head"><b>RK</b><span class="m-role">Incident Commander</span><time>${m.clock}</time></div><p></p></div>
          </div>`,
        ),
      ];
      box.innerHTML = rows.join("");
      // local messages carry user text: set it as text, never as markup
      $$(".msg.is-human", box)
        .slice(msgs.filter((m) => !m.system && !personIsAgent(m.who)).length)
        .forEach((el, i) => {
          const p = el.querySelector("p");
          if (p) p.textContent = loc[i]?.text ?? "";
        });
      if (S.animate && sameChannel && total > prev) {
        const kids = Array.from(box.children).slice(prev);
        kids.forEach((k) => k.classList.add("fresh"));
      }
      wr.lastCount[sel] = total;
      box.scrollTop = box.scrollHeight;
    }

    // ---- tasks
    const tasks = TASKS.map((t) => {
      const shown = t.steps.filter((s) => since(s) >= 0);
      return { t, now: shown[shown.length - 1] ?? null, born: t.steps[0] };
    }).filter((x) => x.now);
    const open = tasks.filter((x) => x.now!.tone !== "done").length;
    setText($("#tkVal"), !S.started ? "none" : `${open} open`);
    setHTML($("#tkList"), tasks.map((x) => x.t.id + x.now!.status).join("|") || "none", () =>
      tasks.length
        ? tasks
            .map((x) => {
              const o = personOf(x.t.owner)!;
              return `<div class="task"><div><b>${x.t.title}</b><span>${o.role}</span></div><span class="chip" data-tone="${x.now!.tone === "idle" ? "idle" : x.now!.tone}"><i></i><span>${x.now!.status}</span></span></div>`;
            })
            .join("")
        : `<p class="ob-note" style="margin:0">No open tasks.</p>`,
    );

    // ---- decisions
    const items = DECISIONS.map((d) => {
      const done = since(d) >= 0;
      const pending = !done && d.pendingText !== undefined && finalState() === "request";
      return { d, done, pending };
    }).filter((x) => x.done || x.pending);
    setText($("#dcVal"), `${items.filter((x) => x.done).length} logged`);
    setHTML($("#dcList"), items.map((x) => `${x.d.what}${x.pending}${S.A ?? ""}`).join("|") || "none", () =>
      items.length
        ? items
            .map((x) =>
              x.done
                ? `<div class="dec"><time>${fmtT(at(x.d))}</time><div><b>${linkHosts(x.d.what)}</b><span>${x.d.by}</span></div></div>`
                : `<div class="dec wait"><time>now</time><div><b>${linkHosts(x.d.pendingText ?? "")}</b><span>waiting</span></div></div>`,
            )
            .join("")
        : `<p class="ob-note" style="margin:0">No decisions yet.</p>`,
    );
    setText($("#obNote"), S.started ? "Clocks start only when counsel makes the call. Counsel has not made it yet." : "Clocks start only when counsel makes the call.");
  },
};

const personIsAgent = (who: Speaker) => who in AGENT_ICON;
