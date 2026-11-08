import "./styles/base.css";
import "./styles/glass.css";
import "./styles/sections.css";

import { initDiagram, buildBlast } from "./diagram";
import { initScroll, initAnchors } from "./scroll";
import { initMoment } from "./moment";
import { initMark } from "./mark";
import { initVideo, initApprove } from "./media";
import { initGlass } from "./glass";

/* ───────────────────────── Edit these when assets change ─────────────────────────
   Everything in public/ is served relative to the page.
   - PROTOTYPE_URL: where "Open the prototype" points.
   - SHOTS: product screenshots in public/shots/ (WebP, 2400 x 1500, from the mono console).
   - VIDEO_SRC: the demo video. If the file is missing, the page shows a "coming soon" state.
   - The logo is one file: public/brand/logo.svg (favicon: public/brand/favicon.svg).
─────────────────────────────────────────────────────────────────────────────────── */
const PROTOTYPE_URL = "https://claura-app.almahmud-zero.workers.dev/?demo=1&play=1";
const SHOTS = {
  hero: "shots/console-breach.webp", // large frame under the hero: a breach in progress
  poster: "media/claura-poster.png", // video poster: the console once the incident is contained (9.4 s)
  // more console views, ready to use (not placed on the page yet)
  contained: "shots/console-contained.webp",
  approval: "shots/console-approval.webp",
  warroom: "shots/console-warroom.webp",
  scope: "shots/console-scope.webp",
} as const;
const VIDEO_SRC = "media/claura-demo.mp4";
/* ─────────────────────────────────────────────────────────────────────────────── */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll<HTMLAnchorElement>("a[data-prototype]").forEach((a) => {
  a.href = PROTOTYPE_URL;
});

document.querySelectorAll<HTMLImageElement>("img[data-shot]").forEach((img) => {
  const key = img.dataset.shot as keyof typeof SHOTS;
  if (SHOTS[key]) img.src = SHOTS[key];
});

buildBlast();
initDiagram();
initScroll(reduced);
initAnchors(reduced);
initMoment(reduced);
initMark(reduced);
initVideo(VIDEO_SRC, SHOTS.poster);
initApprove();
initGlass();
