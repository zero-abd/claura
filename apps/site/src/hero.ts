/* The hero: DFW-2's four halls as an ordered-dither picture, and a scrubber that plays INC-0419.
   The breach spreads out of b14-gpu-07 in orange, Warden draws the Cradle around it, 11 guests
   leave for clean hosts, and the orb turns green at 9.4 s. The grid is always 192 cells tall and
   as wide as the stage's shape needs, so the picture fills a phone or a widescreen without
   stretching. Every cell is thresholded against an 8x8 Bayer matrix, so the edges dissolve. */

import { APPROVAL, END, EVENTS, HOST, eventAt, fmt } from "./incident";

const H = 192;
const HALL_NAMES = ["Hall A", "Hall B", "Hall C", "Hall D"];

const BAYER = (() => {
  const m = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return Float32Array.from(m, (v) => (v + 0.5) / 64);
})();
const th = (x: number, y: number) => BAYER[(y & 7) * 8 + (x & 7)];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (p: number) => 1 - Math.pow(1 - clamp(p), 3);
const easeInOut = (p: number) => {
  p = clamp(p);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/* Vertical geometry is fixed; horizontal geometry is solved per width. */
const HALL_Y = 22;
const HALL_H = 148;
const RACK_H = 32;
const RACK_GAP_Y = 4;
const PAD = 4;
const ORB = 6.4; // orb radius in cells; the Cradle is scaled from the brand geometry around it
const K = ORB / 48;
const SOCKET = 78 * K;
const OUTER = { dx: -21 * K, r: 111 * K };

type Point = { x: number; y: number };
type Layout = {
  W: number;
  base: Float32Array;
  mask: Float32Array;
  src: Point;
  landings: Point[];
  halls: { x: number; w: number }[];
};

function layout(W: number): Layout {
  const gap = Math.max(6, Math.round(W * 0.022));
  const room = W - 2 * Math.max(10, Math.round(W * 0.045)) - 3 * gap;
  let hallW = Math.floor(room / 4);
  const gapX = hallW > 90 ? 3 : 2;
  const rackW = Math.max(3, Math.floor((hallW - 2 * PAD - 7 * gapX) / 8));
  hallW = 8 * rackW + 7 * gapX + 2 * PAD;
  const x0 = Math.floor((W - (4 * hallW + 3 * gap)) / 2);

  const hallX = (i: number) => x0 + i * (hallW + gap);
  const rackX = (h: number, c: number) => hallX(h) + PAD + c * (rackW + gapX);
  const rackY = (r: number) => HALL_Y + PAD + r * (RACK_H + RACK_GAP_Y);
  const centre = (h: number, c: number, r: number) => ({ x: rackX(h, c) + rackW / 2, y: rackY(r) + RACK_H / 2 });

  const base = new Float32Array(W * H);
  for (let h = 0; h < 4; h++) {
    const hx = hallX(h);
    for (let y = HALL_Y; y < HALL_Y + HALL_H; y++) {
      for (let x = hx; x < hx + hallW; x++) {
        const edge = x === hx || x === hx + hallW - 1 || y === HALL_Y || y === HALL_Y + HALL_H - 1;
        base[y * W + x] = edge ? 0.34 : 0.035;
      }
    }
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        const load = 0.2 + 0.7 * hash(h * 97 + r * 31 + c * 7);
        const rx = rackX(h, c);
        const ry = rackY(r);
        for (let y = ry; y < ry + RACK_H; y++) {
          for (let x = rx; x < rx + rackW; x++) {
            const frame = x === rx || x === rx + rackW - 1 || y === ry || y === ry + RACK_H - 1;
            // server units: a solid line every third row, darker on busier racks
            const unit = (y - ry) % 3 === 1;
            base[y * W + x] = frame ? 0.55 : unit ? 0.32 + load * 0.6 : 0.025;
          }
        }
      }
    }
  }

  // edge dissolve: 1 inside, falling to 0 towards the stage edges
  const mask = new Float32Array(W * H);
  const fx = Math.max(18, Math.round(W * 0.05));
  const fy = 18;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.max(0, fx - x, x - (W - 1 - fx)) / fx;
      const dy = Math.max(0, fy - y, y - (H - 1 - fy)) / fy;
      mask[y * W + x] = clamp(1 - Math.hypot(dx, dy));
    }
  }

  return {
    W,
    base,
    mask,
    src: centre(1, 5, 1), // b14-gpu-07: Hall B, rack 14
    landings: Array.from({ length: 11 }, (_, k) => centre([0, 2, 3][k % 3], (k * 5 + 2) % 8, (k * 3 + 1) % 4)),
    halls: [0, 1, 2, 3].map((i) => ({ x: hallX(i), w: hallW })),
  };
}

/* ── one frame at incident time t ── */
const NONE = 0;
const INK = 1;
const SIGNAL = 2;
const SEALED = 3;

function frame(L: Layout, t: number, out: Uint8Array): void {
  const { W, base, mask, src } = L;
  // breach field radius: grows until Warden acts, is pushed back into the socket, then dies out
  const spread = t < 0.6 ? 0 : t < 2.4 ? ease((t - 0.6) / 1.8) * 62 : 62 + (SOCKET - 1 - 62) * easeInOut((t - 2.4) / 2.9);
  const radius = t > APPROVAL ? spread * (1 - easeInOut((t - APPROVAL) / (END - APPROVAL))) : spread;
  const ring = easeInOut((t - 2.4) / 2.9); // the C closes from the back towards its tips
  const orb = t < 0.6 ? 0 : ORB * ease((t - 0.6) / 0.5);
  const green = clamp((t - (END - 0.6)) / 0.6); // dither cross-fade to sealed

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const tt = th(x, y);
      if (mask[i] <= th(x + 3, y + 5)) {
        out[i] = NONE;
        continue;
      }
      const dx = x + 0.5 - src.x;
      const dy = y + 0.5 - src.y;
      const d = Math.hypot(dx, dy);

      if (d < orb) {
        out[i] = green > tt ? SEALED : SIGNAL;
        continue;
      }
      if (ring > 0 && d > SOCKET && Math.hypot(dx - OUTER.dx, dy) < OUTER.r) {
        const fromBack = 180 - Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
        if (fromBack <= 144 * ring) {
          out[i] = SIGNAL;
          continue;
        }
      }
      if (radius > 0 && d < radius) {
        const o = Math.pow(1 - d / radius, 1.1) * 0.9 + 0.1 * Math.sin(d * 0.6 - t * 7);
        if (o > tt) {
          out[i] = SIGNAL;
          continue;
        }
      }
      out[i] = base[i] > tt ? INK : NONE;
    }
  }

  // guests: hidden in the orb, then they leave for clean hosts between 4.6 and 5.3 s
  if (t > 4.6) {
    L.landings.forEach((p, k) => {
      const q = easeInOut((t - 4.6 - k * 0.03) / 0.7);
      if (q <= 0) return;
      const gx = Math.round(src.x + (p.x - src.x) * q - 1);
      const gy = Math.round(src.y + (p.y - src.y) * q - 1);
      for (let yy = gy; yy < gy + 3; yy++) {
        for (let xx = gx; xx < gx + 3; xx++) {
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx] > 0.5) out[yy * W + xx] = INK;
        }
      }
    });
  }
}

/* ── wiring ── */
const PLAY = `<path d="M8.2 5.6v12.8l10-6.4z"/>`;
const PAUSE = `<rect x="7" y="5.6" width="3.6" height="12.8" rx="1"/><rect x="13.4" y="5.6" width="3.6" height="12.8" rx="1"/>`;

export function initHero(reduced: boolean): void {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-plan]");
  const labels = document.querySelector<HTMLElement>("[data-labels]");
  const range = document.querySelector<HTMLInputElement>("[data-scrub]");
  const who = document.querySelector<HTMLElement>("[data-cap-who]");
  const what = document.querySelector<HTMLElement>("[data-cap-what]");
  const when = document.querySelector<HTMLElement>("[data-cap-when]");
  const toggle = document.querySelector<HTMLButtonElement>("[data-play]");
  const ticks = document.querySelector<HTMLElement>("[data-ticks]");
  const termTag = document.querySelector<HTMLElement>("[data-term-tag]");
  if (!canvas || !labels || !range || !who || !what || !when || !toggle || !ticks) return;

  const ctx = canvas.getContext("2d")!;
  const icon = toggle.querySelector("svg")!;
  let L = layout(336);
  let cells = new Uint8Array(L.W * H);
  let colours: string[] = [];
  let t = 0;
  let raf = 0;
  let playing = false;

  const readColours = () => {
    const s = getComputedStyle(document.documentElement);
    colours = ["", s.getPropertyValue("--dither").trim(), s.getPropertyValue("--accent").trim(), s.getPropertyValue("--safe").trim()];
  };

  const placeLabels = () => {
    const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
    labels.innerHTML =
      L.halls
        .map((h, i) => `<span class="hall" style="left:${pct(h.x, L.W)};top:${pct(HALL_Y + HALL_H + 4, H)}">${HALL_NAMES[i]}</span>`)
        .join("") +
      `<span class="pin" style="left:${pct(L.src.x - OUTER.r - 3, L.W)};top:${pct(L.src.y, H)}"><i></i>${HOST}</span>`;
  };

  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const W = Math.round(clamp((H * r.width) / r.height, 220, 640));
    if (W !== L.W) {
      L = layout(W);
      cells = new Uint8Array(W * H);
      placeLabels();
    }
  };

  const draw = () => {
    const W = L.W;
    frame(L, t, cells);
    const cw = canvas.width / W;
    const ch = canvas.height / H;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < H; y++) {
      const y0 = Math.round(y * ch);
      const y1 = Math.round((y + 1) * ch);
      let x = 0;
      while (x < W) {
        const c = cells[y * W + x];
        let run = x + 1;
        while (run < W && cells[y * W + run] === c) run++;
        if (c !== NONE) {
          ctx.fillStyle = colours[c];
          const x0 = Math.round(x * cw);
          ctx.fillRect(x0, y0, Math.round(run * cw) - x0, y1 - y0);
        }
        x = run;
      }
    }
  };

  const caption = () => {
    const e = eventAt(t);
    who.textContent = e ? e.who : "Sentry";
    what.textContent = e ? e.what : `Watching 2,048 hosts. ${HOST} looks normal.`;
    when.textContent = fmt(t);
    const sealed = t >= END - 1e-6;
    document.documentElement.dataset.incident = sealed ? "sealed" : t >= 0.6 ? "breach" : "quiet";
    if (termTag) termTag.textContent = sealed ? "sealed in 9.4 s" : t >= 0.6 ? `breach ${fmt(t)}` : HOST;
    ticks.querySelectorAll<HTMLElement>("button").forEach((b) => b.classList.toggle("on", t >= Number(b.dataset.t) - 1e-6));
  };

  const set = (v: number) => {
    t = clamp(v, 0, END);
    range.value = String(Math.round(t * 100));
    range.style.setProperty("--p", String(t / END));
    caption();
    draw();
  };

  const setPlaying = (on: boolean) => {
    playing = on;
    icon.innerHTML = on ? PAUSE : PLAY;
    toggle.setAttribute("aria-label", on ? "Pause the incident" : t >= END - 0.01 ? "Replay the incident" : "Play the incident");
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    setPlaying(false);
  };

  const play = () => {
    cancelAnimationFrame(raf);
    if (reduced) {
      set(END);
      return setPlaying(false);
    }
    const from = t >= END - 0.01 ? 0 : t;
    const ms = (END - from) * 760;
    const t0 = performance.now();
    setPlaying(true);
    const step = (now: number) => {
      set(from + (END - from) * clamp((now - t0) / ms));
      if (t < END) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
  };

  ticks.innerHTML = EVENTS.map(
    (e) =>
      `<button type="button" data-t="${e.t}" class="${e.who === "You" ? "you" : ""}" style="--at:${(e.t / END).toFixed(4)}" aria-label="Jump to ${fmt(e.t)}, ${e.who}: ${e.what}" title="${fmt(e.t)}  ${e.who}: ${e.what}"></button>`,
  ).join("");
  ticks.addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>("button[data-t]");
    if (!b) return;
    stop();
    set(Number(b.dataset.t));
  });
  range.max = String(Math.round(END * 100));
  range.addEventListener("input", () => {
    stop();
    set(Number(range.value) / 100);
  });
  toggle.addEventListener("click", () => (playing ? stop() : play()));

  readColours();
  size();
  placeLabels();
  set(reduced ? END : 0);
  setPlaying(false);

  new ResizeObserver(() => {
    size();
    draw();
  }).observe(canvas);
  const recolour = () => {
    readColours();
    draw();
  };
  new MutationObserver(recolour).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", recolour);

  if (!reduced) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setTimeout(() => {
          if (t === 0) play();
        }, 600);
      },
      { threshold: 0.35 },
    );
    io.observe(canvas);
  }
}
