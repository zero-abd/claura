import { clamp, easeInOut, easeOut, hash, lerp } from "./util";
import { ISOLATE_DUR } from "./script";
import { HALL_LETTERS, guestsFor, hostId } from "./hosts";

// 2D facility drawing. It is the fallback inside #facility3d: it draws until (and unless)
// the optional 3D module mounts. Paper look: light rack cells, load in ink greys, one orange rack.

const TONE = [255, 90, 31]; // --accent
const SAFE = [47, 191, 113]; // --safe
const PAPER_INK = [11, 12, 14]; // --ink
const LOAD_LO = [212, 212, 216]; // --dot
const LOAD_HI = [113, 113, 122]; // --ink-3
const RACK = [244, 244, 245]; // --sunk
const HAIR = [228, 228, 231]; // --hair
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const loadColor = (a: number) => {
  const t = clamp((a - 0.1) / 0.7);
  return LOAD_LO.map((v, i) => Math.round(v + (LOAD_HI[i] - v) * t));
};
const FONT = `Geist, ui-sans-serif, system-ui, sans-serif`;

export interface MapState {
  amb: number;
  started: boolean;
  r: number; // seconds since play (or -Infinity)
  u: number; // seconds since approval (or -Infinity)
}
export type MapMode = "stage" | "ambient";
/** What the pointer is over: a rack in a hall, or a host in the elevation below. */
export type MapHit = { kind: "rack"; hall: number; rack: number } | { kind: "host"; id: string };

const HALLS = ["A", "B", "C", "D"];
const COLS = 8;
const ROWS = 4;
const HOT_HALL = 1; // B
const HOT_RACK = 13; // rack 14
const HOT_HOST = 6; // b14-gpu-07
const DESTS = [
  { hall: 2, rack: 4, n: 6 }, // C05
  { hall: 2, rack: 11, n: 5 }, // C12
];

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export class FacilityMap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mode: MapMode = "stage";
  /** The rack whose 16 hosts are shown in the elevation (default: the incident rack, B14). */
  sel = { hall: HOT_HALL, rack: HOT_RACK };
  hover: MapHit | null = null;
  w = 0;
  h = 0;
  dpr = 1;
  last: MapState | null = null;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (w === this.w && h === this.h && this.canvas.width === Math.round(w * this.dpr)) return;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (this.last) this.draw(this.last); // no blank frame while the stage animates its size
  }

  private geom() {
    const stage = this.mode === "stage";
    const padX = stage ? 32 : 28;
    const top = stage ? 76 : 30;
    const bottom = stage ? 64 : 30;
    const gapX = stage ? 30 : 26;
    const showInset = stage && this.h >= 500;
    const insetH = showInset ? 196 : 0;
    const label = stage ? 28 : 0;
    const hallW = (this.w - padX * 2 - gapX * 3) / 4;
    const rg = stage ? 5 : 4;
    const rgY = stage ? 6 : 4;
    const cw = (hallW - (COLS - 1) * rg) / COLS;
    const avail = this.h - top - bottom - insetH - label;
    const ch = clamp((avail - (ROWS - 1) * rgY) / ROWS, 14, stage ? 62 : 70);
    const hallH = label + ROWS * ch + (ROWS - 1) * rgY;
    const y0 = top + Math.max(0, (avail + label - hallH) / 2);
    return { stage, padX, y0, gapX, hallW, rg, rgY, cw, ch, label, hallH, showInset, insetTop: y0 + hallH + 34, insetH };
  }
  private rackRect(g: ReturnType<FacilityMap["geom"]>, hall: number, rack: number) {
    const hx = g.padX + hall * (g.hallW + g.gapX);
    const col = rack % COLS;
    const row = Math.floor(rack / COLS);
    return { x: hx + col * (g.cw + g.rg), y: g.y0 + g.label + row * (g.ch + g.rgY), w: g.cw, h: g.ch };
  }

  /** Host box geometry in the elevation (stage mode, expanded). */
  private hostBox(g: ReturnType<FacilityMap["geom"]>, i: number) {
    const W = this.w - g.padX * 2;
    const hg = 5;
    const hw = (W - hg * 15) / 16;
    const hy = g.insetTop + 28;
    const hh = Math.min(96, this.h - hy - 40);
    return { x: g.padX + i * (hw + hg), y: hy, w: hw, h: hh };
  }

  /** Hit-test a point in canvas CSS px. Used by the pointer handlers: the map is a host picker. */
  hit(px: number, py: number): MapHit | null {
    if (this.w === 0 || this.mode !== "stage") return null;
    const g = this.geom();
    if (g.showInset)
      for (let i = 0; i < 16; i++) {
        const b = this.hostBox(g, i);
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return { kind: "host", id: hostId(this.sel.hall, this.sel.rack, i + 1) };
      }
    for (let h = 0; h < 4; h++)
      for (let rk = 0; rk < 32; rk++) {
        const r = this.rackRect(g, h, rk);
        if (px >= r.x - 2 && px <= r.x + r.w + 2 && py >= r.y - 2 && py <= r.y + r.h + 2) return { kind: "rack", hall: h, rack: rk };
      }
    return null;
  }

  draw(s: MapState) {
    this.last = s;
    if (this.w === 0) return;
    const { ctx, dpr } = this;
    const g = this.geom();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.textBaseline = "alphabetic";

    const inc = s.started && s.r >= 0;
    const contained = s.u >= ISOLATE_DUR;
    const quarantining = s.u >= 0;
    const tone = contained ? SAFE : TONE;
    const amb = g.stage ? 1 : 0.5;

    // failover particles timing (same script as before: starts at T+4.6)
    const foStart = 4.6;
    const parts: { k: number; t0: number; dest: (typeof DESTS)[number] }[] = [];
    let k = 0;
    for (const d of DESTS)
      for (let i = 0; i < d.n; i++) {
        parts.push({ k, t0: foStart + k * 0.055, dest: d });
        k++;
      }
    const PART_DUR = 0.42;
    const arrived = (d: (typeof DESTS)[number]) =>
      parts.filter((p) => p.dest === d && s.r >= p.t0 + PART_DUR).map((p) => s.r - (p.t0 + PART_DUR));

    // ---- halls
    for (let h = 0; h < 4; h++) {
      const hx = g.padX + h * (g.hallW + g.gapX);
      const hot = inc && h === HOT_HALL && !contained;
      if (g.stage) {
        ctx.font = `600 13px ${FONT}`;
        ctx.fillStyle = hot ? rgba(TONE, 1) : "#71717a";
        ctx.fillText(`Hall ${HALLS[h]}`, hx, g.y0 + 14);
        ctx.font = `400 12px ${FONT}`;
        ctx.fillStyle = "#a1a1aa";
        ctx.textAlign = "right";
        ctx.fillText("512 hosts", hx + g.hallW, g.y0 + 14);
        ctx.textAlign = "left";
      }
      for (let rk = 0; rk < 32; rk++) {
        const r = this.rackRect(g, h, rk);
        const isHot = h === HOT_HALL && rk === HOT_RACK;
        rr(ctx, r.x, r.y, r.w, r.h, g.stage ? 5 : 4);
        ctx.fillStyle = rgba(RACK, amb);
        ctx.fill();
        ctx.strokeStyle = rgba(HAIR, amb);
        ctx.lineWidth = 1;
        ctx.stroke();

        let destGlow = 0;
        for (const d of DESTS)
          if (d.hall === h && d.rack === rk) {
            for (const a of arrived(d)) destGlow = Math.max(destGlow, 1 - clamp(a / 0.9));
            if (arrived(d).length) destGlow = Math.max(destGlow, 0.22);
          }

        const pad = 3;
        const sg = 2;
        const NS = r.h >= 40 ? 8 : r.h >= 26 ? 5 : 3;
        const sh = (r.h - pad * 2 - sg * (NS - 1)) / NS;
        for (let sl = 0; sl < NS; sl++) {
          const sy = r.y + pad + sl * (sh + sg);
          const load = 0.16 + hash(h, rk, sl % 8) * 0.4;
          const ph = hash(h, rk, sl, 9) * 10;
          const win = Math.floor(s.amb * 0.9 + ph);
          const fr = s.amb * 0.9 + ph - win;
          let glint = 0;
          if (hash(h, rk, sl, win) < 0.011) glint = Math.sin(fr * Math.PI);
          let a = load + glint * 0.6;
          if (destGlow > 0) a = Math.max(a, 0.35 + destGlow * 0.6);
          let col = loadColor(a);
          if (isHot && inc) {
            if (sl === Math.min(NS - 1, Math.floor((HOT_HOST / 8) * NS))) col = contained ? SAFE : TONE;
            else col = loadColor(contained ? load : load * 0.75);
          }
          ctx.fillStyle = rgba(col, amb);
          rr(ctx, r.x + pad, sy, r.w - pad * 2, sh, 1.2);
          ctx.fill();
        }

        if (isHot && inc) {
          const flash = 1 - clamp(s.r / 0.6);
          const pulse = 0.5 + 0.5 * Math.sin(s.amb * Math.PI * 1.6);
          rr(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 6);
          ctx.fillStyle = rgba(tone, contained ? 0.1 : 0.1 + flash * 0.5 + pulse * 0.06);
          ctx.fill();
          ctx.strokeStyle = rgba(tone, 1);
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
    }

    const hotR = this.rackRect(g, HOT_HALL, HOT_RACK);
    const hcx = hotR.x + hotR.w / 2;
    const hcy = hotR.y + hotR.h / 2;

    if (inc) {
      if (!contained) {
        for (let i = 0; i < 2; i++) {
          const period = 1.6;
          const tt = s.r - i * 0.8;
          if (tt < 0) continue;
          const p = (tt % period) / period;
          const rad = lerp(10, g.stage ? 64 : 52, easeOut(p));
          ctx.strokeStyle = rgba(TONE, (1 - p) * 0.5);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(hcx, hcy, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (g.stage) {
        ctx.font = `600 11px ${FONT}`;
        const tag = "B14";
        const tw = ctx.measureText(tag).width + 14;
        const tx = hotR.x + hotR.w / 2 - tw / 2;
        const ty = hotR.y - 22;
        rr(ctx, tx, ty, tw, 17, 8.5);
        ctx.fillStyle = rgba(tone, 1);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(tag, tx + 7, ty + 12.5);
      }
    }

    // failover particles B14 -> hall C racks
    for (const p of parts) {
      const pt = (s.r - p.t0) / PART_DUR;
      if (pt <= 0 || pt >= 1) continue;
      const d = this.rackRect(g, p.dest.hall, p.dest.rack);
      const tx = d.x + d.w / 2;
      const ty = d.y + d.h / 2;
      const e = easeInOut(pt);
      const cx = (hcx + tx) / 2 + 40;
      const cy = Math.min(hcy, ty) + (ty - hcy) * 0.5 - 30;
      const x = (1 - e) * (1 - e) * hcx + 2 * (1 - e) * e * cx + e * e * tx;
      const y = (1 - e) * (1 - e) * hcy + 2 * (1 - e) * e * cy + e * e * ty;
      ctx.strokeStyle = rgba(PAPER_INK, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hcx, hcy);
      ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.stroke();
      ctx.fillStyle = rgba(PAPER_INK, 1);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (g.stage) this.drawPick(g);
    if (g.showInset) this.drawInset(s, g, parts, tone, inc, contained, quarantining);
  }

  /** Selection ring and hover label: the map is a host picker. */
  private drawPick(g: ReturnType<FacilityMap["geom"]>) {
    const { ctx } = this;
    const ring = (hall: number, rack: number, a: number, w: number) => {
      const r = this.rackRect(g, hall, rack);
      ctx.save();
      rr(ctx, r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5, 7);
      ctx.strokeStyle = rgba(PAPER_INK, a);
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.restore();
    };
    ring(this.sel.hall, this.sel.rack, 0.35, 1.3);
    const hv = this.hover;
    if (hv && hv.kind === "rack") {
      ring(hv.hall, hv.rack, 0.95, 1.6);
      const r = this.rackRect(g, hv.hall, hv.rack);
      this.chipLabel(`Rack ${HALL_LETTERS[hv.hall].toUpperCase()}${hv.rack + 1}`, r.x + r.w / 2, r.y - 8);
    }
  }
  private chipLabel(text: string, cx: number, bottom: number) {
    const { ctx } = this;
    ctx.font = `600 12px ${FONT}`;
    const tw = ctx.measureText(text).width + 18;
    const tx = Math.min(Math.max(cx - tw / 2, 6), this.w - tw - 6);
    const ty = bottom - 22;
    rr(ctx, tx, ty, tw, 22, 8);
    ctx.fillStyle = rgba(PAPER_INK, 1);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, tx + 9, ty + 15);
  }

  /** Elevation of the selected rack: 16 hosts with guest dots. Shown when the stage is expanded. Hosts are clickable. */
  private drawInset(
    s: MapState,
    g: ReturnType<FacilityMap["geom"]>,
    parts: { t0: number }[],
    tone: number[],
    inc: boolean,
    contained: boolean,
    quarantining: boolean,
  ) {
    const { ctx } = this;
    const { hall, rack } = this.sel;
    const live = inc && hall === HOT_HALL && rack === HOT_RACK; // the incident story plays only on B14
    const selR = this.rackRect(g, hall, rack);
    const x0 = g.padX;
    const W = this.w - g.padX * 2;
    const top = g.insetTop;
    const keyIdx = live ? HOT_HOST : 7;
    const kb = this.hostBox(g, keyIdx);

    ctx.strokeStyle = live ? rgba(tone, 0.55) : "#d4d4d8";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(selR.x + selR.w / 2, selR.y + selR.h + 3);
    const midY = top - 8;
    ctx.lineTo(selR.x + selR.w / 2, midY);
    ctx.lineTo(kb.x + kb.w / 2, midY);
    ctx.lineTo(kb.x + kb.w / 2, kb.y - 3);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = "#0b0c0e";
    ctx.fillText(`Rack ${HALL_LETTERS[hall].toUpperCase()}${rack + 1}`, x0, top + 14);
    const departed = parts.filter((p) => s.r >= p.t0).length;
    let status = "16 hosts · click one to inspect";
    if (live) {
      status = "b14-gpu-07 · 12 guests";
      if (s.r >= 3.3) status = "b14-gpu-07 · cordoned";
      if (s.r >= 4.6) status = `failing over ${Math.min(11, departed)}/11 guests`;
      if (s.r >= 5.3) status = "b14-gpu-07 · 1 guest, paused";
      if (quarantining) status = "b14-gpu-07 · quarantining";
      if (contained) status = "b14-gpu-07 · quarantined";
    }
    ctx.textAlign = "right";
    ctx.font = `500 13px ${FONT}`;
    ctx.fillStyle = live ? rgba(tone, 1) : "#71717a";
    ctx.fillText(status, x0 + W, top + 14);
    ctx.textAlign = "left";

    for (let i = 0; i < 16; i++) {
      const { x, y: hy, w: hw, h: hh } = this.hostBox(g, i);
      const isHot = live && i === HOT_HOST;
      const hovered = this.hover?.kind === "host" && this.hover.id === hostId(hall, rack, i + 1);
      rr(ctx, x, hy, hw, hh, 8);
      ctx.fillStyle = hovered ? rgba(HAIR, 1) : rgba(RACK, 1);
      ctx.fill();
      ctx.strokeStyle = isHot ? rgba(tone, 1) : hovered ? rgba(PAPER_INK, 0.85) : rgba(HAIR, 1);
      ctx.lineWidth = isHot || hovered ? 1.6 : 1;
      ctx.stroke();
      if (isHot && s.r >= 3.3) {
        ctx.save();
        rr(ctx, x + 1, hy + 1, hw - 2, hh - 2, 7);
        ctx.clip();
        ctx.strokeStyle = rgba(tone, 0.22);
        ctx.lineWidth = 1;
        for (let d = -hh; d < hw + hh; d += 6) {
          ctx.beginPath();
          ctx.moveTo(x + d, hy);
          ctx.lineTo(x + d + hh, hy + hh);
          ctx.stroke();
        }
        ctx.restore();
      }

      const n = guestsFor(hall, rack, i + 1);
      const ds = 4.5;
      const dgx = 3.5;
      const dgy = 4.5;
      const gw = ds * 2 + dgx;
      const gh = ds * 6 + dgy * 5;
      const ox = x + (hw - gw) / 2;
      const oy = hy + (hh - gh) / 2;
      for (let j = 0; j < n; j++) {
        const cx = ox + (j % 2) * (ds + dgx);
        const cy = oy + Math.floor(j / 2) * (ds + dgy);
        let col = LOAD_HI;
        if (isHot) {
          if (j === 0) {
            col = contained ? SAFE : TONE;
            if (s.r >= 3.8) {
              ctx.strokeStyle = rgba(col, 1);
              ctx.lineWidth = 1.1;
              rr(ctx, cx + 0.5, cy + 0.5, ds - 1, ds - 1, 1.2);
              ctx.stroke();
              continue;
            }
          } else {
            const p = parts[j - 1];
            if (p && s.r >= p.t0) continue;
          }
        }
        ctx.fillStyle = rgba(col, 1);
        rr(ctx, cx, cy, ds, ds, 1.2);
        ctx.fill();
      }
      ctx.font = `500 11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillStyle = isHot ? rgba(tone, 1) : hovered ? "#0b0c0e" : "#a1a1aa";
      if (isHot || hovered || i % 3 === 0 || i === 15) ctx.fillText(String(i + 1).padStart(2, "0"), x + hw / 2, hy + hh + 17);
      ctx.textAlign = "left";
      if (hovered) this.chipLabel(hostId(hall, rack, i + 1), x + hw / 2, hy - 6);
    }
  }
}
