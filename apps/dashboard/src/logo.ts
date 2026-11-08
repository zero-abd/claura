// The product mark ("Cradle"). Single source: public/logo.svg, inlined at build time.
// To swap the mark, replace that file. Nothing else needs to change.
//
// Every `id="x"` inside the file becomes `data-part="x"` (+ a unique id per copy), so the UI can tint a part
// without duplicate ids. Brand rule: the C (`ring`) is light grey; only the orb (`seal`) changes, red while a
// breach is live and green once contained. CSS does that through `[data-part="seal"]` (see style.css, .mark).
import raw from "../public/logo.svg?raw";

const box = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? "0 0 256 256";
const inner = raw
  .replace(/<\?xml[\s\S]*?\?>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<title>[\s\S]*?<\/title>/g, "")
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

/** The favicon with the orb tinted for the current state (a data: URL, so the tab icon follows the incident). */
export function faviconURL(orb: string): string {
  const svg = raw
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<path id="seal"[^>]*?)fill="[^"]*"/, `$1fill="${orb}"`)
    .replace(/\s+id="[^"]+"/g, "")
    .replace(/ width="256" height="256"/, ' width="64" height="64"');
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}
