import { chev } from "./icons";
import { isOpen } from "./engine";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

export const setText = (el: Element | null, v: string) => {
  if (el && el.textContent !== v) el.textContent = v;
};
export const setAttr = (el: Element | null, k: string, v: string) => {
  if (el && el.getAttribute(k) !== v) el.setAttribute(k, v);
};
/** innerHTML, but only when the content key changed. */
export const setHTML = (el: HTMLElement | null, key: string, html: () => string) => {
  if (el && el.dataset.k !== key) {
    el.dataset.k = key;
    el.innerHTML = html();
  }
};
export const setVar = (el: HTMLElement | null, k: string, v: string) => {
  if (el && el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
};

// ---------------------------------------------------------------- springs
// A damped spring (Apple's response + damping ratio) sampled into a CSS linear() easing,
// so transitions get real spring curves, including overshoot, with no JS in the frame loop.
export function springEasing(response: number, damping: number, samples = 56): { easing: string; duration: number } {
  const w0 = (2 * Math.PI) / response;
  const x = (t: number) => {
    if (damping >= 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const wd = w0 * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0) / wd) * Math.sin(wd * t));
  };
  let T = response;
  while (T < 4 && Math.abs(x(T) - 1) > 0.002) T += 0.01;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) pts.push(x((i / samples) * T).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""));
  pts[pts.length - 1] = "1";
  return { easing: `linear(${pts.join(", ")})`, duration: T };
}
export function installSprings() {
  const root = document.documentElement.style;
  const soft = springEasing(0.46, 1); // critically damped: disclosures, layout
  const lively = springEasing(0.5, 0.74); // a touch of overshoot: sheets, the seal, nav lens
  root.setProperty("--spring", soft.easing);
  root.setProperty("--spring-dur", `${soft.duration.toFixed(3)}s`);
  root.setProperty("--spring-pop", lively.easing);
  root.setProperty("--spring-pop-dur", `${lively.duration.toFixed(3)}s`);
}

// ---------------------------------------------------------------- disclosure
/** Markup for an animated disclosure. State lives in engine.S.open / S.stepOv, keyed by `key`. */
export function disc(key: string, head: string, body: string, cls = ""): string {
  return `<div class="disc ${cls}" data-key="${key}" data-open="0">
    <button type="button" class="disc-head" data-disc="${key}" aria-expanded="false">${head}${chev()}</button>
    <div class="disc-body" inert><div class="disc-inner">${body}</div></div>
  </div>`;
}

/** Push engine state into every disclosure in the document. Cheap; runs each frame. */
export function syncDisclosures(root: ParentNode = document) {
  for (const el of $$(".disc", root)) {
    const key = el.dataset.key!;
    const o = isOpen(key);
    const v = o ? "1" : "0";
    if (el.dataset.open !== v) {
      el.dataset.open = v;
      for (const h of $$(`[data-disc="${key}"]`, el)) h.setAttribute("aria-expanded", String(o));
      el.querySelector(":scope > .disc-body")?.toggleAttribute("inert", !o);
    }
  }
}
