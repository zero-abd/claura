import { BANNER, CHANNELS, OBLIGATIONS, OBLIGATIONS_LABEL } from "../warroom-data";
import {
  TASK_LABEL,
  TASK_TONE,
  avatarStyle,
  data,
  isAlertStatus,
  fmtClock,
  initialsOf,
  nextTaskStatus,
  roleLabel,
  roster,
  summarize,
  type ChannelId,
  type Message,
  type Task,
} from "../data";
import { AGENT_ICON, icon } from "../icons";
import { $, disc, setAttr, setHTML, setText } from "../dom";
import { type Phase } from "../engine";
import { esc, linkHosts } from "../hosts";


// War Room: the out-of-band coordination channel. A plain-language brief, channels and people, the live thread,
// and (collapsed) tasks, decisions and notification clocks. Everything is read through the data layer.

export const wr = {
  selected: "#command" as ChannelId,
  seen: {} as Record<string, number>,
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

export const onlineCount = () => summarize(roster(data())).online;

const agentIcon = (name: string) => AGENT_ICON[name.toLowerCase()];
const isAgentMsg = (m: Message) => m.kind === "agent";

const avatarHTML = (m: Message) => {
  if (isAgentMsg(m)) return `<span class="m-av agent" data-who="${esc(m.authorName)}">${icon(agentIcon(m.authorName) ?? "cpu")}</span>`;
  const ini = initialsOf(m.authorName);
  return `<span class="m-av${ini.length > 2 ? " long" : ""}" style="${avatarStyle(ini)}">${esc(ini)}</span>`;
};

/** "Label: value" lines -> pairs. Anything that is not in that shape becomes one "Summary" line. */
export function parseBrief(text: string): [string, string][] {
  const rows: [string, string][] = [];
  for (const line of text.split("\n")) {
    const m = /^([^:]{3,40}):\s+(.+)$/.exec(line.trim());
    if (m) rows.push([m[1], m[2]]);
    else if (line.trim()) rows.push(["Summary", line.trim()]);
  }
  return rows;
}
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export const warroom = {
  html(): string {
    const channels = CHANNELS.map(
      (c) => `<button type="button" class="ch" data-ch="${c.id}" data-target="ch:${c.id}" aria-selected="false">
        <span class="ch-name">${c.id}</span><span class="ch-n" id="chn-${c.id.slice(1)}"></span>
      </button>`,
    ).join("");

    const rail = `<aside class="wr-rail glass group">
      <button type="button" class="row-link" data-go="scope" data-target="wr-scope">
        <span class="r-ico">${icon("database")}</span><span class="r-title">Data scope</span><span class="r-val" id="scVal"></span>${icon("chevron", "chev")}
      </button>
      ${disc("tasks", `<span class="r-ico">${icon("tasks")}</span><span class="r-title">Tasks</span><span class="r-val" id="tkVal"></span>`, `<div class="row-body wr-pad"><div id="tkList"></div></div>`, "row")}
      ${disc("decisions", `<span class="r-ico">${icon("seal")}</span><span class="r-title">Decision log</span><span class="r-val" id="dcVal"></span>`, `<div class="row-body wr-pad"><div id="dcList"></div></div>`, "row")}
      ${disc(
        "clock",
        `<span class="r-ico">${icon("clock")}</span><span class="r-title">Notification clock</span><span class="r-val"></span>`,
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
          <div class="side-sec"><h3>People<span id="wrOnline"></span></h3><div class="people" id="wrPeople"></div></div>
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

  /** Post to the selected channel as the signed-in person. Returns the error text, or null when it went through. */
  send(text: string): string | null {
    const t = text.trim();
    if (!t) return "Nothing to send";
    const r = data().postMessage(wr.selected, t);
    wr.threadKey = "";
    return r.ok ? null : r.error;
  },

  render(_ph: Phase) {
    const d = data();
    const v = d.version();
    const inc = d.incident();

    // ---- brief
    const b = d.brief();
    if (b) {
      setText($("#wrStamp"), `${b.author} · updated ${fmtClock(b.updatedAt)}`);
      setHTML($("#wrLines"), `b${v}`, () =>
        parseBrief(b.text)
          .map(([k, val]) => `<div class="bl"><dt>${esc(k)}</dt><dd>${linkHosts(val)}</dd></div>`)
          .join(""),
      );
      setHTML($("#wrPair"), `p${v}`, () => {
        const list = (items: string[], ico: string) => items.map((i) => `<li>${icon(ico)}<span>${linkHosts(i)}</span></li>`).join("");
        return `<div><h3>What we know</h3><ul class="know">${list(lines(b.known), "check")}</ul></div>
        <div><h3>What we don't know yet</h3><ul class="dont">${list(lines(b.unknown), "info")}</ul></div>`;
      });
    }

    // ---- channels + unread
    const sel = wr.selected;
    for (const c of CHANNELS) {
      const n = d.messages(c.id).length;
      if (c.id === sel || wr.seen[c.id] === undefined || wr.seen[c.id] > n) wr.seen[c.id] = n;
      const unread = c.id === sel ? 0 : n - wr.seen[c.id];
      setAttr($(`.ch[data-ch="${c.id}"]`), "aria-selected", String(c.id === sel));
      const badge = $(`#chn-${c.id.slice(1)}`);
      setText(badge, unread > 0 ? String(unread) : "");
      badge.dataset.on = unread > 0 ? "1" : "0";
    }

    // ---- people (the roster: identities, pending codes and directory rows merged; revoked people stay listed, struck)
    const people = roster(d).filter((p) => p.kind !== "pending");
    setText($("#wrOnline"), `${summarize(roster(d)).online} online`);
    setHTML($("#wrPeople"), `pp${v}`, () =>
      people
        .map((p) => {
          const sub = !p.active
            ? `<span class="ver off">${icon("x")}access revoked</span>`
            : p.verified
              ? `<span class="ver">${icon("seal")}verified out-of-band</span>`
              : `<span class="ver off">${icon("info")}not verified</span>`;
          return `<div class="person" data-online="${p.online ? "1" : "0"}" data-active="${p.active ? "1" : "0"}">
          <span class="m-av${p.initials.length > 2 ? " long" : ""}" style="${avatarStyle(p.initials)}">${esc(p.initials)}</span>
          <div><b>${esc(p.title)}</b>${sub}</div>
          <i class="pdot"></i>
        </div>`;
        })
        .join(""),
    );

    // ---- thread
    const ch = CHANNELS.find((c) => c.id === sel)!;
    setText($("#thName"), ch.id);
    setText($("#thBlurb"), ch.blurb);
    const input = $("#wrInput") as HTMLInputElement;
    if (input.placeholder !== `Message ${ch.id}` && !input.dataset.err) input.placeholder = `Message ${ch.id}`;
    const msgs = d.messages(sel);
    const pending = inc?.status === "awaiting_approval";
    const key = `${sel}:${v}:${pending}`;
    if (wr.threadKey !== key) {
      const prev = wr.lastCount[sel] ?? msgs.length;
      const sameChannel = wr.threadKey.startsWith(sel + ":");
      wr.threadKey = key;
      const box = $("#thMsgs");
      box.innerHTML = msgs
        .map((m) => {
          if (m.kind === "system") return `<div class="msg system"><span>${linkHosts(m.text)}</span></div>`;
          const agent = isAgentMsg(m);
          const person = people.find((p) => p.name === m.authorName);
          const role = agent ? "" : person && person.title !== m.authorName ? person.title : m.authorRole === "responder" ? "" : roleLabel(m.authorRole);
          return `<div class="msg ${agent ? "is-agent" : "is-human"}">
            ${avatarHTML(m)}
            <div class="m-main">
              <div class="m-head"><b>${esc(m.authorName)}</b>${agent ? `<span class="m-tag">agent</span>` : role ? `<span class="m-role">${esc(role)}</span>` : ""}<time>${fmtClock(m.at)}</time></div>
              <p>${linkHosts(m.text)}</p>
              ${m.action === "review" && pending ? `<button type="button" class="btn-chip accent" data-act="review">Review and approve</button>` : ""}
            </div>
          </div>`;
        })
        .join("");
      if (sameChannel && msgs.length > prev) {
        const kids = Array.from(box.children).slice(prev);
        kids.forEach((k) => k.classList.add("fresh"));
      }
      wr.lastCount[sel] = msgs.length;
      box.scrollTop = box.scrollHeight;
    }

    // ---- data scope link
    const assets = d.assets();
    const flagged = assets.filter((a) => isAlertStatus(a.status)).length;
    setText($("#scVal"), assets.length ? `${flagged} flagged` : "none open");

    // ---- tasks
    const tasks = d.tasks();
    const open = tasks.filter((t) => t.status !== "done").length;
    setText($("#tkVal"), tasks.length ? `${open} open` : "none");
    setHTML($("#tkList"), `t${v}`, () =>
      tasks.length
        ? tasks.map(taskRow).join("")
        : `<p class="ob-note" style="margin:0">No open tasks.</p>`,
    );

    // ---- decisions
    const decs = d.decisions();
    setText($("#dcVal"), `${decs.length} logged`);
    setHTML($("#dcList"), `d${v}:${pending}`, () => {
      const rows = decs.map(
        (x) => `<div class="dec"><time>${fmtClock(x.at)}</time><div><b>${linkHosts(x.text)}</b><span>${esc(x.byName)}</span></div></div>`,
      );
      if (pending) rows.push(`<div class="dec wait"><time>now</time><div><b>${linkHosts(`Quarantine of ${inc!.host} is waiting for the Incident Commander`)}</b><span>waiting</span></div></div>`);
      return rows.join("") || `<p class="ob-note" style="margin:0">No decisions yet.</p>`;
    });
    setText($("#obNote"), inc ? "Clocks start only when counsel makes the call. Counsel has not made it yet." : "Clocks start only when counsel makes the call.");
  },
};

function taskRow(t: Task): string {
  return `<div class="task"><div><b>${linkHosts(t.title)}</b><span>${esc(roleLabel(t.ownerRole))}</span></div>
    <button type="button" class="chip task-st" data-task="${t.id}" data-tone="${TASK_TONE[t.status]}" data-target="task:${t.id}" title="Click to move to ${TASK_LABEL[nextTaskStatus(t.status)]}"><i></i><span>${TASK_LABEL[t.status]}</span></button></div>`;
}

/** Click on a task chip: advance it open -> in progress -> done -> open. */
export function cycleTask(id: number): boolean {
  const d = data();
  const t = d.tasks().find((x) => x.id === id);
  if (!t) return false;
  return d.setTaskStatus(id, nextTaskStatus(t.status)).ok;
}
