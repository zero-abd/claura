// Geometry helpers for the Claura marks. 256x256 box, centre (128,128).
// Angles are degrees, 0 = east, increasing clockwise (SVG screen space).
import paper from 'paper-jsdom';
paper.setup(new paper.Size(256, 256));

export const COLORS = { O: '#FF5A1F', G: '#2FBF71', INK: '#0B0C0E', W: '#FFFFFF' };
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const pt = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
const f = (n) => +n.toFixed(3);

/** Annular band centred on radius r, width w, from angle a0 to a1 (clockwise). caps: 'butt' | 'round'. */
export function bandD(cx, cy, r, w, a0, a1, caps = {}) {
  const { start = 'butt', end = 'butt' } = caps;
  const ro = r + w / 2, ri = r - w / 2;
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0o, y0o] = pt(cx, cy, ro, a0), [x1o, y1o] = pt(cx, cy, ro, a1);
  const [x1i, y1i] = pt(cx, cy, ri, a1), [x0i, y0i] = pt(cx, cy, ri, a0);
  let d = `M${f(x0o)} ${f(y0o)}A${f(ro)} ${f(ro)} 0 ${large} 1 ${f(x1o)} ${f(y1o)}`;
  d += end === 'round' ? `A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x1i)} ${f(y1i)}` : `L${f(x1i)} ${f(y1i)}`;
  d += `A${f(ri)} ${f(ri)} 0 ${large} 0 ${f(x0i)} ${f(y0i)}`;
  if (start === 'round') d += `A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x0o)} ${f(y0o)}`;
  return d + 'Z';
}

/**
 * A "C" ring: full ring with a visible opening of `gap` degrees centred on `gc`.
 * With round caps the opening is measured between the cap tips.
 */
export function cRingD(cx, cy, r, w, gc, gap, round = true) {
  const capDeg = round ? deg(w / 2 / r) : 0;
  const a0 = gc + gap / 2 + capDeg;
  const a1 = gc + 360 - gap / 2 - capDeg;
  const c = round ? 'round' : 'butt';
  return bandD(cx, cy, r, w, a0, a1, { start: c, end: c });
}

export const P = (d) => new paper.CompoundPath(d);
export const circle = (cx, cy, r) => new paper.Path.Circle({ center: [cx, cy], radius: r });
export const ellipse = (cx, cy, rx, ry, rot = 0) => {
  const e = new paper.Path.Ellipse({ center: [cx, cy], radius: [rx, ry] });
  e.rotate(rot, [cx, cy]);
  return e;
};
export const rrect = (x, y, w, h, r) =>
  new paper.Path.Rectangle({ rectangle: new paper.Rectangle(x, y, w, h), radius: r });
export const rect = (x, y, w, h) => new paper.Path.Rectangle(new paper.Rectangle(x, y, w, h));
export const poly = (pts) => new paper.Path({ segments: pts, closed: true });
export const U = (a, b) => a.unite(b, { insert: false });
export const S = (a, b) => a.subtract(b, { insert: false });
export const I = (a, b) => a.intersect(b, { insert: false });
export const rot = (item, a, cx = 128, cy = 128) => { const c = item.clone({ insert: false }); c.rotate(a, [cx, cy]); return c; };

/** Export a paper item as compact SVG path data. */
export function D(item, precision = 1) {
  const el = item.exportSVG({ precision });
  const g = el.tagName === 'g' ? [...el.children] : [el];
  return g.map((e) => e.getAttribute('d')).join('');
}

/** Variable-radius spiral band as a polygon-ish smooth path (filled). */
export function spiralD({ cx = 128, cy = 128, r0, r1, a0, a1, w, step = 4 }) {
  const n = Math.ceil(Math.abs(a1 - a0) / step);
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, r = r0 + (r1 - r0) * t;
    out.push(pt(cx, cy, r + w / 2, a));
    inn.push(pt(cx, cy, r - w / 2, a));
  }
  return { out, inn };
}

/** Ring of varying width (thick in the middle, thin at the tips) with round tips. */
export function taperedRing({ cx = 128, cy = 128, r, wMax, wMin, a0, a1, p = 1, peak = 0.5 }) {
  const n = 120, out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    // asymmetric bump: peak position controls where it is thickest
    const u = t <= peak ? t / peak : (1 - t) / (1 - peak);
    const w = wMin + (wMax - wMin) * Math.pow(Math.sin((Math.PI / 2) * u), p);
    out.push(pt(cx, cy, r + w / 2, a));
    inn.push(pt(cx, cy, r - w / 2, a));
  }
  const body = new paper.Path({ segments: [...out, ...inn.reverse()], closed: true });
  body.smooth({ type: 'catmull-rom', factor: 0.5 });
  const c0 = circle(...pt(cx, cy, r, a0), wMin / 2), c1 = circle(...pt(cx, cy, r, a1), wMin / 2);
  return U(U(body, c0), c1);
}
