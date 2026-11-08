// The product mark. Single source: /logo.svg at the repo root, inlined at build time.
// To swap the mark, replace that file. Nothing else needs to change.
//
// Every `id="x"` inside the file becomes `data-part="x"` (+ a unique id per copy),
// so the UI can tint a part without duplicate ids. CSS tints `[data-part="seal"]`
// green in the contained state; if the file has no `seal` part, nothing is tinted.
import raw from "../logo.svg?raw";

const box = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? "0 0 256 256";
const inner = raw
  .replace(/<\?xml[\s\S]*?\?>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .trim();

let copies = 0;
export function logoSVG(size: number, cls = "mark"): string {
  const n = ++copies;
  const body = inner
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${id}-${n}" data-part="${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${id}-${n})`)
    .replace(/href="#([^"]+)"/g, (_m, id: string) => `href="#${id}-${n}"`);
  return `<svg class="${cls}" viewBox="${box}" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
