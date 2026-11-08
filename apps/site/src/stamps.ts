/* Section markers drawn as perforated postage stamps. Each one is a small SVG: a perforated paper
   edge, a coloured face with a fine halftone, and one emblem. Put <span data-stamp="name"> in the
   page and this fills it in. */

const RING = "M231.95 73.95A111 111 0 1 0 231.95 182.05A7.64 7.64 0 0 0 219.1 173.85A78 78 0 1 1 219.1 82.15A7.64 7.64 0 0 0 231.95 73.95Z";
const ORB = "M108 128a48 48 0 1 0 96 0a48 48 0 1 0-96 0z";

const INK = "#17181c";
const SIGNAL = "#ff5a1f";
const SEALED = "#2fbf71";
const WHITE = "#fff8f2";

type Stamp = { face: string; art: string; label?: string };

const cradle = (x: number, y: number, s: number, orb: string) =>
  `<g transform="translate(${x} ${y}) scale(${s / 256})"><path d="${RING}" fill="${SIGNAL}"/><path d="${ORB}" fill="${orb}"/></g>`;

const STAMPS: Record<string, Stamp> = {
  // a grid of sandboxes, one of which has slipped its cell
  problem: {
    face: INK,
    art:
      [0, 1, 2]
        .flatMap((r) => [0, 1, 2].map((c) => (r === 0 && c === 2 ? "" : `<rect x="${18 + c * 9}" y="${24 + r * 9}" width="6" height="6" rx="1" fill="${WHITE}" opacity=".85"/>`)))
        .join("") + `<rect x="40" y="16" width="6" height="6" rx="1" fill="${SIGNAL}"/>`,
  },
  // four agents around the incident
  crew: {
    face: SIGNAL,
    art:
      `<circle cx="30" cy="34" r="11" fill="none" stroke="${WHITE}" stroke-width="1.4" stroke-dasharray="2 2.4"/>` +
      [0, 90, 180, 270]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return `<circle cx="${(30 + 11 * Math.cos(r)).toFixed(2)}" cy="${(34 + 11 * Math.sin(r)).toFixed(2)}" r="3.4" fill="${WHITE}"/>`;
        })
        .join("") +
      `<circle cx="30" cy="34" r="3.6" fill="${INK}"/>`,
  },
  // the one key press
  call: {
    face: INK,
    art: `<rect x="16" y="20" width="28" height="28" rx="6" fill="none" stroke="${WHITE}" stroke-width="1.5"/>
      <text x="30" y="40.5" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif" font-size="17" fill="${SIGNAL}">⌘</text>`,
  },
  // the logo itself, sealed
  timeline: { face: INK, art: cradle(13, 17, 34, SEALED), label: "9.4 s" },
  // agents propose, the gate decides
  built: {
    face: SIGNAL,
    art:
      [0, 1, 2].map((i) => `<rect x="15" y="${23 + i * 8}" width="12" height="4" rx="2" fill="${WHITE}"/>`).join("") +
      `<rect x="29" y="19" width="3" height="31" rx="1.5" fill="${INK}"/>` +
      `<rect x="34" y="31" width="12" height="4" rx="2" fill="${WHITE}"/>`,
  },
  // the demo film
  demo: {
    face: INK,
    art: `<circle cx="30" cy="34" r="12" fill="none" stroke="${WHITE}" stroke-width="1.5"/><path d="M27 28.5v11l9-5.5z" fill="${SIGNAL}"/>`,
  },
  mark: { face: INK, art: cradle(12, 15, 36, SIGNAL) },
  event: {
    face: SIGNAL,
    art: `<text x="30" y="33" text-anchor="middle" font-family="Geist, sans-serif" font-weight="600" font-size="11" fill="${WHITE}">UTD</text>
      <text x="30" y="45" text-anchor="middle" font-family="Geist, sans-serif" font-weight="600" font-size="11" fill="${INK}">2026</text>`,
  },
};

let uid = 0;

function svg(s: Stamp): string {
  const id = `perf${uid++}`;
  const holes: string[] = [];
  for (let x = 3; x <= 57; x += 6) holes.push(`<circle cx="${x}" cy="0" r="2.1"/><circle cx="${x}" cy="72" r="2.1"/>`);
  for (let y = 3; y <= 69; y += 6) holes.push(`<circle cx="0" cy="${y}" r="2.1"/><circle cx="60" cy="${y}" r="2.1"/>`);
  return `<svg viewBox="0 0 60 72" aria-hidden="true" focusable="false">
    <defs>
      <mask id="${id}"><rect width="60" height="72" fill="#fff"/><g fill="#000">${holes.join("")}</g></mask>
      <pattern id="${id}h" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".45" fill="#fff" opacity=".13"/></pattern>
    </defs>
    <g mask="url(#${id})">
      <rect width="60" height="72" fill="#fffdfa"/>
      <rect x="5" y="5" width="50" height="62" rx="1.5" fill="${s.face}"/>
      <rect x="5" y="5" width="50" height="62" rx="1.5" fill="url(#${id}h)"/>
      ${s.art}
      ${s.label ? `<text x="49" y="61" text-anchor="end" font-family="Geist Mono, monospace" font-size="6" fill="${WHITE}" opacity=".8">${s.label}</text>` : ""}
    </g>
  </svg>`;
}

export function initStamps(): void {
  document.querySelectorAll<HTMLElement>("[data-stamp]").forEach((el) => {
    const s = STAMPS[el.dataset.stamp ?? ""];
    if (s) el.innerHTML = svg(s);
  });
}
