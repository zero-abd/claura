import { icon } from "../icons";
import { $, setAttr, setText } from "../dom";
import { liveSource } from "../live-engine";

// The break-glass sheet (live mode). A browser that is not an enrolled operator connects fine and sees nothing: the module
// gates every row by role. This sheet is how it joins: an admin hands over a single-use code in person (no email, no phone,
// no corporate sign-in), the person types it here, and the module's enroll reducer turns this browser's identity into an
// operator. It also covers the other way a live console can be stuck: the server is not reachable.
//
// Not dismissible on purpose (no scrim click, no Escape): without a code there is nothing behind it to look at.

export const join = { busy: false, err: "", copied: 0 };

export function joinSheetHTML(): string {
  return `<section class="sheet join-sheet" id="joinSheet" role="dialog" aria-modal="true" aria-labelledby="joinTitle" data-open="0" data-s="code" inert>
    <div class="sheet-pane js-code">
      <span class="sheet-ico">${icon("key")}</span>
      <h2 id="joinTitle">Enter break-glass code</h2>
      <p class="sheet-sum"><span id="joinLead"></span> This device is not enrolled on <b id="joinServer"></b> yet. An admin hands you a single-use code in person. No email, no phone, no corporate sign-in.</p>
      <label class="field"><span>Break-glass code</span><input id="joinCode" class="code-in" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="64" placeholder="Paste or type the code" data-target="join-code" /></label>
      <label class="field"><span>Your name <em>(only if your code does not carry one)</em></span><input id="joinName" type="text" autocomplete="off" spellcheck="false" maxlength="40" placeholder="For example Riya Kapoor" data-target="join-name" /></label>
      <div class="sheet-actions">
        <button type="button" class="btn-primary" id="joinBtn" data-target="join-submit"><span>Join the response</span></button>
      </div>
      <p class="sheet-note ps-err" id="joinErr" role="alert"></p>
      <div class="join-id"><span>This device</span><code id="joinId" data-target="join-identity"></code><button type="button" class="btn-chip" id="joinCopy" data-target="join-copy">${icon("copy")}<span>Copy</span></button></div>
      <p class="join-foot"><span id="joinLink"></span><button type="button" class="btn-text" id="joinReplay" data-target="join-replay">Use the replay instead</button></p>
    </div>
    <div class="sheet-pane js-offline">
      <span class="sheet-ico">${icon("alert")}</span>
      <h2 id="offTitle">Cannot reach the server</h2>
      <p class="sheet-sum" id="offSum"></p>
      <div class="sheet-actions">
        <button type="button" class="btn-primary" id="offRetry" data-target="join-retry"><span>Try again now</span></button>
        <button type="button" class="btn-text" id="offReplay" data-target="join-offline-replay">Use the replay instead</button>
      </div>
      <p class="sheet-note" id="offErr"></p>
      <p class="join-foot"><button type="button" class="btn-text" id="offForget" data-target="join-forget" hidden>Forget this device's identity</button></p>
    </div>
  </section>`;
}

/** Is the sheet showing? (the scrim and the inert app root follow it) */
export function joinOpen(): boolean {
  const s = liveSource();
  if (!s) return false;
  return s.access() === "needs-code" || (!s.isApplied() && s.linkState() === "offline");
}

export function renderJoin() {
  const el = $("#joinSheet");
  const s = liveSource();
  const open = joinOpen();
  const v = open ? "1" : "0";
  if (el.dataset.open !== v) {
    el.dataset.open = v;
    el.setAttribute("aria-hidden", String(!open));
    el.toggleAttribute("inert", !open);
    if (open && s?.access() === "needs-code")
      window.setTimeout(() => (document.getElementById("joinCode") as HTMLInputElement | null)?.focus(), 80);
  }
  if (!open || !s) return;
  const mode = s.access() === "needs-code" ? "code" : "offline";
  setAttr(el, "data-s", mode);
  if (mode === "code") {
    setText($("#joinServer"), `${s.server.label} (${s.server.db})`);
    setText($("#joinTitle"), s.wasRevoked() ? "Access removed" : "Enter break-glass code");
    setText($("#joinLead"), s.wasRevoked() ? "An admin revoked this device's access, so the room went empty. Enter a new single-use code to join again." : "");
    const id = s.identityHex();
    setText($("#joinId"), id ? `${id.slice(0, 16)}…${id.slice(-8)}` : "connecting…");
    setAttr($("#joinId"), "title", id);
    setText($("#joinErr"), join.err);
    setText($("#joinBtn span"), join.busy ? "Joining…" : "Join the response");
    ($("#joinBtn") as HTMLButtonElement).disabled = join.busy;
    setText($("#joinCopy span"), Date.now() - join.copied < 1600 ? "Copied" : "Copy");
    setText($("#joinLink"), s.linkState() === "ready" ? (s.canPersist ? `Connected to ${s.server.label}` : "Storage is blocked here: this device will ask for a code again after a reload") : "Reconnecting…");
  } else {
    setText($("#offSum"), `${s.server.label} is not answering. The console keeps retrying by itself; you can also look at the scripted replay in the meantime.`);
    setText($("#offErr"), s.linkError());
    const forget = $("#offForget") as HTMLElement;
    forget.hidden = s.attempts() < 3;
  }
}

const friendly = (m: string): string => {
  if (/invalid or already used/i.test(m)) return "That code is not valid, or it was already used. Ask the admin for a new one.";
  if (/at least 2 characters/i.test(m)) return "This code does not carry a name. Add yours above.";
  return m;
};

export function submitJoin() {
  const s = liveSource();
  if (!s || join.busy) return;
  const code = ($("#joinCode") as HTMLInputElement).value;
  const name = ($("#joinName") as HTMLInputElement).value;
  if (!code.trim()) {
    join.err = "Enter the code your admin gave you.";
    ($("#joinCode") as HTMLInputElement).focus();
    return;
  }
  join.busy = true;
  join.err = "";
  void s.enroll(code, name).then((r) => {
    join.busy = false;
    if (!r.ok) join.err = friendly(r.error);
    else {
      ($("#joinCode") as HTMLInputElement).value = "";
      join.err = "";
    }
  });
}

export async function copyIdentity() {
  const id = liveSource()?.identityHex();
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
  } catch {
    /* the clipboard can be blocked: the short form is on screen and the tooltip carries the full identity */
  }
  join.copied = Date.now();
}

/** "Use the replay instead": the same page without ?live (and without ?stdb). */
export function leaveToReplay() {
  const u = new URL(location.href);
  u.searchParams.delete("live");
  u.searchParams.delete("stdb");
  u.searchParams.delete("db");
  location.href = u.toString();
}
