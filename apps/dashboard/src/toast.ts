// A small glass toast for things that fail after the console has already answered (a reducer the module refused, a lost
// connection). It never blocks: it appears at the bottom of the window, speaks politely to screen readers, and leaves.
export type ToastKind = "error" | "info" | "ok";

let box: HTMLElement | null = null;
const recent = new Map<string, number>();

export function toast(text: string, kind: ToastKind = "info", ms = 5600) {
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    box.setAttribute("aria-live", "polite");
    box.setAttribute("role", "status");
    document.body.appendChild(box);
  }
  // the same message twice within a second is one toast
  const now = Date.now();
  if ((recent.get(text) ?? 0) > now - 1000) return;
  recent.set(text, now);
  const el = document.createElement("div");
  el.className = "toast";
  el.dataset.kind = kind;
  el.textContent = text;
  box.appendChild(el);
  requestAnimationFrame(() => (el.dataset.in = "1"));
  window.setTimeout(() => {
    el.dataset.in = "0";
    window.setTimeout(() => el.remove(), 500);
  }, ms);
}
