/* Demo video with a "coming soon" state, and the interactive approval card. */

export function initVideo(src: string, poster: string): void {
  const video = document.querySelector<HTMLVideoElement>("[data-video]");
  const frame = document.querySelector<HTMLElement>("[data-video-frame]");
  const soon = document.querySelector<HTMLElement>("[data-soon]");
  if (!video || !frame || !soon) return;

  const missing = () => {
    frame.classList.add("missing");
    soon.hidden = false;
    video.controls = false;
  };
  const ready = () => {
    frame.classList.remove("missing");
    soon.hidden = true;
    video.controls = true;
  };

  video.addEventListener("error", missing);
  video.addEventListener("loadedmetadata", ready);
  video.poster = poster;
  video.src = src;
}

/* The approval card: ⌘↵ (or Ctrl+Enter) or a click approves; Undo puts it back. */
export function initApprove(): void {
  const card = document.querySelector<HTMLElement>("[data-approve]");
  const btn = card?.querySelector<HTMLButtonElement>("[data-approve-btn]");
  const label = card?.querySelector<HTMLElement>("[data-approve-label]");
  const state = card?.querySelector<HTMLElement>("[data-approve-state]");
  const badge = card?.querySelector<HTMLElement>("[data-approve-badge]");
  const note = card?.querySelector<HTMLElement>("[data-approve-note]");
  const key = btn?.querySelector<HTMLElement>("kbd");
  if (!card || !btn || !label || !state || !badge || !note || !key) return;

  const idleNote = note.textContent ?? "";
  let done = false;

  const set = (value: boolean) => {
    done = value;
    card.classList.toggle("done", value);
    btn.setAttribute("aria-pressed", String(value));
    label.textContent = value ? "Approved" : "Approve quarantine";
    badge.textContent = value ? "Approved" : "Needs approval";
    state.textContent = value ? "Approved by you · rollback: un-quarantine" : "Proposed by Warden · policy-bounded";
    key.hidden = value;
    if (value) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "undo";
      undo.textContent = "Undo";
      undo.addEventListener("click", () => set(false));
      note.replaceChildren("Warden proceeds with the quarantine. ", undo);
    } else {
      note.textContent = idleNote;
    }
  };

  btn.addEventListener("click", () => {
    if (!done) set(true);
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter" || done) return;
    const r = card.getBoundingClientRect();
    const visible = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (visible < r.height * 0.5) return;
    e.preventDefault();
    set(true);
  });

  set(false);
}
