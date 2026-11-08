import "./styles/site.css";

import { initDiagram, buildBlast } from "./diagram";
import { initAnchors } from "./scroll";
import { initVideo, initApprove } from "./media";
import { initHero } from "./hero";
import { initStamps } from "./stamps";
import { EVENTS, END, fmt, type Event } from "./incident";

/* ───────────────────────── Edit these when assets change ─────────────────────────
   - PROTOTYPE_URL: where "Open the console" points.
   - POSTER: video poster in public/media/.
   - VIDEO_SRC: the demo video. If the file is missing, the page shows a "being cut" state.
─────────────────────────────────────────────────────────────────────────────────── */
const PROTOTYPE_URL = "http://localhost:4317/?demo=1";
const POSTER = "media/claura-poster.png";
const VIDEO_SRC = "media/claura-demo.mp4";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll<HTMLAnchorElement>("a[data-prototype]").forEach((a) => {
  a.href = PROTOTYPE_URL;
});

/* Timeline: consecutive events by the same agent sit under one heading, like a career history. */
const WHO_ICON: Record<Event["who"], string> = {
  Sentry: `<path d="M2.9 12S6.1 5.9 12 5.9 21.1 12 21.1 12 17.9 18.1 12 18.1 2.9 12 2.9 12z"/><circle cx="12" cy="12" r="2.8"/>`,
  Triage: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.3"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3"/>`,
  Warden: `<path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6z"/><rect x="9" y="10.8" width="6" height="4.6" rx="1.4"/><path d="M10.3 10.8V9.9a1.7 1.7 0 0 1 3.4 0v.9"/>`,
  Scribe: `<path d="M5 6.4h8M5 10.8h5M5 15.2h4"/><path d="m14.6 18.8 5-5a1.6 1.6 0 0 0-2.3-2.3l-5 5-.7 3.3z"/>`,
  You: `<circle cx="12" cy="8.4" r="3.6"/><path d="M5 19.6c.9-3.4 3.5-5.2 7-5.2s6.1 1.8 7 5.2"/>`,
};
const ROLE: Record<Event["who"], string> = {
  Sentry: "detects",
  Triage: "scores the blast radius",
  Warden: "contains",
  Scribe: "records",
  You: "the operator",
};

function renderLog(): void {
  const host = document.querySelector<HTMLElement>("[data-log]");
  if (!host) return;
  const groups: Event[][] = [];
  for (const e of EVENTS) {
    const last = groups[groups.length - 1];
    if (last && last[0].who === e.who) last.push(e);
    else groups.push([e]);
  }
  host.innerHTML = groups
    .map((g) => {
      const items = g
        .map(
          (e) => `<li class="${e.t === END ? "final" : e.who === "You" ? "human" : ""}">
            <span class="dot" aria-hidden="true"></span>
            <div class="log-line"><h3>${e.what}</h3><time>${fmt(e.t)}</time></div>
            ${e.detail ? `<p>${e.detail}</p>` : ""}
          </li>`,
        )
        .join("");
      return `<li class="log-group">
        <p class="log-who"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${WHO_ICON[g[0].who]}</svg><b>${g[0].who}</b><span>${ROLE[g[0].who]}</span></p>
        <ol>${items}</ol>
      </li>`;
    })
    .join("");
}

/* Theme: follows the system until someone picks one, then remembers it. */
function initTheme(): void {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-set]")];
  const sync = () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.themeSet === "dark") === dark)));
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      root.dataset.theme = b.dataset.themeSet;
      try {
        localStorage.setItem("claura-theme", b.dataset.themeSet ?? "");
      } catch {
        // storage blocked: the choice lasts for this visit
      }
      sync();
    }),
  );
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
  sync();
}

/* Sticky header: a hairline once the page scrolls, and the nav marks the section being read. */
function initNav(): void {
  const top = document.querySelector<HTMLElement>("[data-top]");
  const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-nav] a")];
  if (!top) return;

  const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const sections = links
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter((s): s is HTMLElement => s !== null);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.setAttribute("aria-current", String(a.hash === `#${e.target.id}`)));
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  sections.forEach((s) => io.observe(s));
}

initTheme();
initNav();
initStamps();
renderLog();
buildBlast();
initDiagram();
initHero(reduced);
initAnchors(reduced);
initApprove();
initVideo(VIDEO_SRC, POSTER);
