import { BOUNDS } from "../script";
import {
  ENROLLABLE_ROLES,
  ROLE_CAN,
  agentIdentities,
  ago,
  avatarStyle,
  data,
  fmtDayTime,
  roleLabel,
  roster,
  shortId,
  summarize,
  until,
  type OperatorRole,
  type Person,
} from "../data";
import { CODE_TTL_HOURS } from "../data/scripted-content";
import { codeFromSeed, enrollLink, generateCode, maskCode } from "../data/codes";
import { qrMatrix, qrSVG } from "../data/qr";
import { scriptedSource } from "../data";
import { AGENT_ICON, icon } from "../icons";
import { $, disc, setAttr, setHTML, setText } from "../dom";
import { esc } from "../hosts";
import { S } from "../engine";
import { hash } from "../util";

// People & Access (admin): who can sign in, what each role may do, and the break-glass codes that add people
// without email or phones. The Add person sheet issues a single-use code and shows it as text and as a QR.

export const ac = {
  sheet: null as null | { stage: "form" | "code"; name: string; role: OperatorRole; code: string; issued: boolean },
  confirm: null as null | { key: string; at: number },
  err: "",
  copied: 0,
  focusPending: false,
};

const isAdmin = () => data().me().role === "admin";
/** An opaque handle for a pending code, so the secret itself never sits in a DOM attribute or a click-target name. */
const refOf = (code: string) => hash(...Array.from(code, (c) => c.charCodeAt(0))).toString(36).slice(2, 8);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ------------------------------------------------------------------ the page
const tile = (id: string, label: string, sub = "") => `<div class="tile"><b id="${id}">–</b><span>${label}</span>${sub ? `<em id="${id}s">${sub}</em>` : ""}</div>`;

export const access = {
  html(): string {
    return `<section class="view" id="v-access" data-view="access">
      <header class="hero-head ac-head">
        <div>
          <h1 class="h-title">People &amp; Access</h1>
          <p class="h-sub">Who can sign in, and what each role can do. New people join with a single-use break-glass code, in person: no email, no phones.</p>
        </div>
        <button type="button" class="btn-chip accent ac-add" data-act="add-person" data-target="add-person">${icon("userPlus")}Add person</button>
      </header>
      <div id="acBody">
        <div class="ac-locked glass" id="acLocked" hidden>
          <span class="sheet-ico host">${icon("lock")}</span>
          <h2>Admins only</h2>
          <p id="acLockedP"></p>
        </div>
        <div id="acAdmin">
          <div class="tiles ac-tiles">
            ${tile("acN", "people with access")}
            ${tile("acOn", "online now")}
            ${tile("acVer", "verified out-of-band")}
            ${tile("acAdm", "admin", "")}
          </div>
          <div class="glass group ac-list" id="acList"></div>
          <div class="glass group ac-more">
            ${disc(
              "identities",
              `<span class="r-ico">${icon("agents")}</span><span class="r-title">Service identities</span><span class="r-val">4 agents, least privilege</span>`,
              `<div class="row-body" id="acAgents"></div>`,
              "row",
            )}
            ${disc(
              "enroll-how",
              `<span class="r-ico">${icon("key")}</span><span class="r-title">How break-glass enrollment works</span><span class="r-val">no email, no phones</span>`,
              `<div class="row-body"><ol class="ac-steps">
                <li><b>An admin issues a code.</b> Single use, 12 characters, made in the admin's browser. It is never emailed or texted.</li>
                <li><b>It is handed over in person.</b> Read it aloud, give a printed card, or let the person scan the QR from their own device.</li>
                <li><b>They enroll with a passkey.</b> They pick a passkey or hardware key on their device and enter the code. The code is consumed and the person is verified out-of-band.</li>
                <li><b>Access can be revoked at once.</b> One click removes the identity. Everything they posted stays in the record.</li>
              </ol></div>`,
              "row",
            )}
          </div>
        </div>
      </div>
    </section>`;
  },

  render() {
    const d = data();
    const me = d.me();
    const admin = isAdmin();
    ($("#acLocked") as HTMLElement).hidden = admin;
    ($("#acAdmin") as HTMLElement).hidden = !admin;
    ($(".ac-add") as HTMLElement).hidden = !admin;
    if (!admin) {
      setText($("#acLockedP"), `You are signed in as ${me.name} (${me.title}). Ask an admin to add or revoke people.`);
      return;
    }
    const people = roster(d);
    const sum = summarize(people);
    setText($("#acN"), String(sum.people));
    setText($("#acOn"), String(sum.online));
    setText($("#acVer"), `${sum.verified}/${sum.people}`);
    const admins = people.filter((p) => p.admin && p.active && p.kind === "operator");
    setText($("#acAdm"), String(sum.admins));
    setHTML($("#acAdm")?.nextElementSibling as HTMLElement, `a:${admins.map((a) => a.name).join()}`, () => (admins.length ? `${admins.map((a) => esc(a.name)).join(", ")} · can add and revoke` : "admin"));

    // expire the two-step revoke confirmation
    if (ac.confirm && Date.now() - ac.confirm.at > 3500) ac.confirm = null;
    const now = d.now();
    const key = `${d.version()}:${ac.confirm?.key ?? ""}:${admins.length}`;
    setHTML($("#acList"), key, () => {
      const rows = people.map((p) => personRow(p, now));
      return `<div class="ac-lh"><span class="c-main">Person</span><span class="c-role">Access</span><span class="c-ver">Identity</span><span class="c-seen">Presence</span></div>${rows.join("")}`;
    });

    const ag = agentIdentities(d);
    setHTML($("#acAgents"), `g:${ag.length}`, () =>
      ag
        .map((a) => {
          const b = BOUNDS[a.name.toLowerCase() as keyof typeof BOUNDS];
          return `<div class="ag-row"><span class="a-ico">${icon(AGENT_ICON[a.name.toLowerCase()] ?? "cpu")}</span>
            <div><b>${esc(a.name)}</b><span>${b ? `${esc(b.mode)} · can ${esc(b.can.toLowerCase())}` : "service identity"}</span></div>
            <span class="chip" data-tone="idle"><i></i><span>agent</span></span></div>`;
        })
        .join(""),
    );
  },
};

function personRow(p: Person, now: number): string {
  const sub = p.title !== p.name ? p.title : p.role ? roleLabel(p.role) : "";
  const rolechip = p.role ? `<span class="role-chip" data-role="${p.role}">${roleLabel(p.role)}</span>` : `<span class="role-chip" data-role="none">Not enrolled</span>`;
  const ver = !p.active
    ? `<span class="v-badge off">${icon("x")}Revoked</span>`
    : p.kind === "pending"
      ? `<span class="v-badge wait">${icon("clock")}Waiting to enroll</span>`
      : p.verified
        ? `<span class="v-badge">${icon("seal")}Verified out-of-band</span>`
        : `<span class="v-badge warn">${icon("info")}Not verified</span>`;
  const seen =
    p.kind === "pending"
      ? `<span class="seen">code expires in ${until(now, (p.createdAt ?? now) + CODE_TTL_HOURS * 3600_000)}</span>`
      : !p.active
        ? `<span class="seen">access removed</span>`
        : p.online
          ? `<span class="seen on"><i></i>Online now</span>`
          : `<span class="seen">${p.lastSeen ? `Last seen ${ago(now, p.lastSeen)}` : "Never signed in"}</span>`;
  const id = p.kind === "pending" ? `p-${refOf(p.code)}` : p.identity ? p.identity.slice(0, 8) : `d-${p.name}`;
  const confirming = ac.confirm?.key === p.key;
  const lastAdmin = p.admin && p.kind === "operator" && roster(data()).filter((x) => x.admin && x.active && x.kind === "operator").length <= 1;
  let actions = "";
  if (p.kind === "pending") {
    actions = `<button type="button" class="row-act" data-act="show-code" data-ref="${refOf(p.code)}" data-target="show-code:${slug(p.name)}">Show code</button>${
      data().can.cancelEnrollment ? `<button type="button" class="row-act danger" data-act="cancel-code" data-ref="${refOf(p.code)}" data-target="cancel-code:${slug(p.name)}">Cancel</button>` : ""
    }`;
  } else if (p.kind === "operator" && p.active && !p.self && !lastAdmin) {
    actions = `<button type="button" class="row-act danger${confirming ? " armed" : ""}" data-act="revoke" data-key="${p.key}" data-target="revoke:${p.name}">${confirming ? "Confirm revoke" : "Revoke"}</button>`;
  } else if (p.self) actions = `<span class="you">You</span>`;

  const body = `<div class="ac-body">
    <dl class="ac-facts">
      <div><dt>Can</dt><dd>${p.role ? esc(ROLE_CAN[p.role]) : "Nothing yet. Issue a break-glass code to enroll this person."}</dd></div>
      ${p.kind === "operator" ? `<div><dt>Identity</dt><dd><code>${esc(shortId(p.identity))}</code> · one passkey or hardware key</dd></div>` : ""}
      ${p.kind === "pending" ? `<div><dt>Code</dt><dd><code>${esc(maskCode(p.code))}</code> · single use, shown only to admins</dd></div>` : ""}
      ${p.addedBy ? `<div><dt>${p.kind === "pending" ? "Issued by" : "Added by"}</dt><dd>${esc(p.addedBy)}${p.addedAt ? ` · ${esc(fmtDayTime(p.addedAt))}` : ""}</dd></div>` : ""}
      <div><dt>Sign-in</dt><dd>Passkey or hardware key. No password, no corporate SSO.</dd></div>
    </dl>
  </div>`;

  return disc(
    `person:${id}`,
    `<span class="m-av${p.initials.length > 2 ? " long" : ""}${p.kind === "pending" ? " dashed" : ""}" style="${p.kind === "pending" ? "" : avatarStyle(p.initials)}">${esc(p.initials)}</span>
     <span class="pr-main"><b>${esc(p.name)}</b><span>${esc(sub)}</span></span>
     <span class="cell c-role">${rolechip}</span><span class="cell c-ver">${ver}</span><span class="cell c-seen">${seen}</span>
     <span class="pr-gap"></span>`,
    body,
    `row person-row${p.active ? "" : " revoked"}${p.kind === "pending" ? " pending" : ""}`,
    actions,
  );
}

// ------------------------------------------------------------------ the Add person sheet
export function personSheetHTML(): string {
  return `<section class="sheet person-sheet" id="personSheet" role="dialog" aria-modal="true" aria-labelledby="personTitle" data-open="0" data-s="form" inert>
    <div class="sheet-pane ps-form">
      <span class="sheet-ico">${icon("userPlus")}</span>
      <h2 id="personTitle">Add a person</h2>
      <p class="sheet-sum">They get a single-use break-glass code. No email, no phone, no corporate sign-in involved.</p>
      <label class="field"><span>Name</span><input id="pName" type="text" placeholder="Name or role, for example Forensics lead" autocomplete="off" maxlength="40" spellcheck="false" data-target="person-name" /></label>
      <div class="field"><span>Role</span><div class="role-chips" id="pRoles" role="radiogroup" aria-label="Role"></div><p class="role-can" id="pCan"></p></div>
      <div class="sheet-actions">
        <button type="button" class="btn-primary" id="issueBtn" data-target="issue-code"><span>Issue break-glass code</span></button>
        <button type="button" class="btn-text" id="personCancel" data-target="person-cancel">Cancel</button>
      </div>
      <p class="sheet-note ps-err" id="pErr"></p>
    </div>
    <div class="sheet-pane ps-code">
      <div class="pc-head">
        <span class="sheet-ico ok">${icon("check")}</span>
        <div><h2 id="pcTitle">Code ready</h2><p id="pcSub"></p></div>
      </div>
      <div class="pc-ticket">
        <div class="pc-ticket-top"><span class="pc-l">Break-glass code · single use</span><div class="pc-btns"><button type="button" class="btn-chip" id="copyBtn" data-target="copy-code">${icon("copy")}<span>Copy</span></button><button type="button" class="btn-chip" id="printBtn" data-target="print-card">${icon("print")}<span>Print card</span></button></div></div>
        <div class="code-big" id="pcCode" data-target="issued-code"></div>
      </div>
      <div class="pc-body">
        <div class="pc-qr"><div id="pcQr"></div><span>Scan on their device</span></div>
        <ul class="pc-notes">
          <li>${icon("shieldCheck")}<span><b>Works without email or phones.</b> Read it aloud, hand over the printed card, or let them scan the QR. Nothing crosses the corporate network.</span></li>
          <li>${icon("clock")}<span><b>Single use.</b> Expires in ${CODE_TTL_HOURS} hours, or the moment it is used.</span></li>
          <li>${icon("key")}<span><b>Passkey, not a password.</b> They pick a passkey or hardware key on their own device, then enter the code.</span></li>
        </ul>
      </div>
      <div class="sheet-actions"><button type="button" class="btn-primary" id="codeDone" data-target="code-done"><span>Done</span></button></div>
    </div>
    <div class="print-card" id="printCard" aria-hidden="true">
      <div class="pcard-brand"><b>Claura</b><span>Break-glass enrollment card</span></div>
      <div class="pcard-code" id="pcardCode"></div>
      <div class="pcard-grid"><div id="pcardQr"></div>
        <div><p id="pcardWho"></p><p>Single use. Expires 24 hours after it was issued, or when used.</p><p>Open Claura on your own device, choose a passkey or hardware key, then enter this code or scan the square.</p><p class="small">Never send this code by email, chat or text. If you did not expect this card, give it back to the admin.</p></div></div>
    </div>
  </section>`;
}

export const personSheetOpen = () => ac.sheet !== null;

export function openPerson(opts: { name?: string; role?: OperatorRole; issue?: boolean } = {}): boolean {
  if (!isAdmin()) return false;
  ac.sheet = { stage: "form", name: opts.name ?? "", role: opts.role ?? "responder", code: "", issued: false };
  ac.err = "";
  ac.focusPending = true;
  const input = document.querySelector("#pName") as HTMLInputElement | null;
  if (input) input.value = ac.sheet.name;
  if (opts.issue) return issueCode();
  return true;
}
export function closePerson(): boolean {
  if (!ac.sheet) return false;
  ac.sheet = null;
  ac.err = "";
  return true;
}
export function pickRole(role: string) {
  if (ac.sheet && (ENROLLABLE_ROLES as string[]).includes(role)) ac.sheet.role = role as OperatorRole;
}
export function issueCode(): boolean {
  const s = ac.sheet;
  if (!s) return false;
  const input = document.querySelector("#pName") as HTMLInputElement | null;
  s.name = (input?.value ?? s.name).trim();
  if (!s.name) {
    ac.err = "Give the person a name or a role first.";
    input?.focus();
    return false;
  }
  const code = S.demo ? codeFromSeed(scriptedSource.nextDemoSeed()) : generateCode();
  const r = data().issueEnrollment(code, s.role, s.name);
  if (!r.ok) {
    ac.err = r.error;
    return false;
  }
  s.code = code;
  s.stage = "code";
  s.issued = true;
  ac.err = "";
  return true;
}
/** Show an existing pending code again (from its row). `ref` is the row's opaque handle, not the code. */
export function showCode(ref: string): boolean {
  const e = data().enrollments().find((x) => !x.usedBy && refOf(x.code) === ref);
  if (!e || !isAdmin()) return false;
  ac.sheet = { stage: "code", name: e.nameHint, role: e.role, code: e.code, issued: false };
  return true;
}
export function cancelCode(ref: string): boolean {
  const e = data().enrollments().find((x) => !x.usedBy && refOf(x.code) === ref);
  return e ? (data().cancelEnrollment?.(e.code).ok ?? false) : false;
}
export async function copyCode(): Promise<boolean> {
  const code = ac.sheet?.code;
  if (!code) return false;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    /* the clipboard can be blocked on an isolated laptop: the code is on screen anyway */
  }
  ac.copied = Date.now();
  return true;
}
/** Two-step revoke: the first click arms the button, the second (within 3.5 s) revokes. */
export function revoke(key: string): boolean {
  if (ac.confirm?.key !== key) {
    ac.confirm = { key, at: Date.now() };
    return true;
  }
  ac.confirm = null;
  return data().revokeOperator(key).ok;
}

let lastCodeShown = "";
export function renderPersonSheet() {
  const s = ac.sheet;
  const el = $("#personSheet");
  const open = s !== null;
  const v = open ? "1" : "0";
  if (el.dataset.open !== v) {
    el.dataset.open = v;
    el.setAttribute("aria-hidden", String(!open));
    el.toggleAttribute("inert", !open);
  }
  if (!s) return;
  setAttr(el, "data-s", s.stage);
  const roles = $("#pRoles");
  setHTML(roles, `r:${s.role}`, () =>
    ENROLLABLE_ROLES.map(
      (r) => `<button type="button" class="role-opt" role="radio" aria-checked="${r === s.role}" data-role-pick="${r}" data-target="role:${r}" data-role="${r}">${roleLabel(r)}</button>`,
    ).join(""),
  );
  setText($("#pCan"), `Can: ${ROLE_CAN[s.role]}.`);
  setText($("#pErr"), ac.err);
  if (s.stage === "code") {
    setText($("#pcTitle"), `Code ready for ${s.name}`);
    setText($("#pcSub"), `${roleLabel(s.role)} · expires in ${CODE_TTL_HOURS} h`);
    if (lastCodeShown !== s.code) {
      lastCodeShown = s.code;
      $("#pcCode").textContent = s.code;
      const qr = qrSVG(qrMatrix(enrollLink(s.code)), { quiet: 2, label: `QR code for the break-glass code ${s.code}` });
      $("#pcQr").innerHTML = qr;
      $("#pcardQr").innerHTML = qr;
      $("#pcardCode").textContent = s.code;
      $("#pcardWho").textContent = `For ${s.name} · ${roleLabel(s.role)}`;
    }
    setText($("#copyBtn span"), Date.now() - ac.copied < 1800 ? "Copied" : "Copy");
  }
  if (ac.focusPending && s.stage === "form") {
    ac.focusPending = false;
    window.setTimeout(() => ($("#pName") as HTMLInputElement | null)?.focus(), 60);
  }
}
