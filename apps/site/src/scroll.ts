/* Scroll behaviour: IntersectionObserver reveals, plus a few scroll-linked values.
   Everything here only touches transform / opacity / CSS variables. */

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function initScroll(reduced: boolean): void {
  const stages = [...document.querySelectorAll<HTMLElement>(".stage")];
  const revealables = document.querySelectorAll<HTMLElement>("[data-reveal], [data-diagram]");

  // ── reveal once, and mark anything already scrolled past (anchor jumps, reloads mid-page)
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const above = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        if (!e.isIntersecting && !above) continue;
        el.classList.add("in");
        if (el.classList.contains("stage")) {
          // the spine reads as a sequence: earlier stages are always lit
          const i = stages.indexOf(el);
          stages.slice(0, i).forEach((s) => s.classList.add("in"));
        }
        io.unobserve(el);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
  );
  revealables.forEach((el) => io.observe(el));

  const frame = document.querySelector<HTMLElement>("[data-frame]");
  const crew = document.querySelector<HTMLElement>("[data-crew]");
  const beats = [...document.querySelectorAll<HTMLElement>("[data-beat]")];

  if (reduced) {
    beats.forEach((b) => {
      b.style.setProperty("--o", "1");
      b.classList.add("on");
    });
    return;
  }

  let queued = false;
  const update = () => {
    queued = false;
    const vh = window.innerHeight;
    const narrow = window.innerWidth < 720;

    // hero frame settles as you scroll: tilts flat, grows to full size
    if (frame) {
      const p = clamp(window.scrollY / (vh * 0.5));
      const e = 1 - Math.pow(1 - p, 3);
      const tilt = narrow ? 0 : (1 - e) * 7;
      const scale = 0.94 + 0.06 * e;
      frame.style.transform = `rotateX(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    }

    // the problem beats light up as they pass through the middle of the screen
    for (const b of beats) {
      const h = b.querySelector("h2");
      if (!h) continue;
      const r = h.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - vh * 0.5) / vh;
      const o = 0.26 + 0.74 * clamp(1 - (d - 0.14) / 0.3);
      b.style.setProperty("--o", o.toFixed(3));
      if (o > 0.82) b.classList.add("on");
    }

    // the crew spine fills down to the reading line
    if (crew) {
      const r = crew.getBoundingClientRect();
      const p = clamp((vh * 0.62 - r.top - 70) / (r.height - 140));
      crew.style.setProperty("--p", p.toFixed(4));
    }
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
}

/* In-page links glide, unless the person prefers reduced motion. (Done in JS, not CSS, so a page
   opened on a #hash lands instantly instead of animating from the top.) */
export function initAnchors(reduced: boolean): void {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const id = decodeURIComponent(a.hash.slice(1));
    const target = id ? document.getElementById(id) : document.body;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", a.hash || location.pathname);
  });
}
