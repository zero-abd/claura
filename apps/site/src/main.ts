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
   - SHOTS: product screenshots in public/shots/ (the dashboard agent refreshes these).
   - VIDEO_SRC: the demo video. If the file is missing, the page shows a "coming soon" state.
   - The logo is one file: public/brand/logo.svg (favicon: public/brand/favicon.svg).
─────────────────────────────────────────────────────────────────────────────────── */
const PROTOTYPE_URL = "http://localhost:4317/?demo=1";
const SHOTS = {
  hero: "shots/approval.png", // large frame under the hero
  poster: "shots/contained.png", // video poster
} as const;
const VIDEO_SRC = "media/bulkhead-demo.mp4";
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
