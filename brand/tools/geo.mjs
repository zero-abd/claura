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

/** Ring of varying width (thick at 'peak', thin at the tips) with round tips. */
export function taperedRing({ cx = 128, cy = 128, r, wMax, wMin, a0, a1, p = 1, peak = 0.5, tol = 0.12 }) {
  const n = 220, out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const u = t <= peak ? t / peak : (1 - t) / (1 - peak);
    const w = wMin + (wMax - wMin) * Math.pow(Math.sin((Math.PI / 2) * u), p);
    out.push(pt(cx, cy, r + w / 2, a));
    inn.push(pt(cx, cy, r - w / 2, a));
  }
  const po = new paper.Path({ segments: out }); po.simplify(tol);
  const pi = new paper.Path({ segments: inn }); pi.simplify(tol); pi.reverse();
  const body = new paper.Path();
  body.addSegments(po.segments); body.addSegments(pi.segments); body.closePath();
  const c0 = circle(...pt(cx, cy, r, a0), wMin / 2), c1 = circle(...pt(cx, cy, r, a1), wMin / 2);
  return U(U(body, c0), c1);
}

/** C with a circular inner edge (concentric socket for an orb); outer edge swells to wMax at 'peak'. */
export function socketRing({ cx = 128, cy = 128, ri, wMax, wMin, a0, a1, p = 1, peak = 0.5, tol = 0.12, tip = 'round' }) {
  const n = 240, out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const u = t <= peak ? t / peak : (1 - t) / (1 - peak);
    const w = wMin + (wMax - wMin) * Math.pow(Math.sin((Math.PI / 2) * u), p);
    out.push(pt(cx, cy, ri + w, a));
    inn.push(pt(cx, cy, ri, a));
  }
  const po = new paper.Path({ segments: out }); po.simplify(tol);
  const pi = new paper.Path({ segments: inn }); pi.simplify(tol); pi.reverse();
  const body = new paper.Path();
  body.addSegments(po.segments); body.addSegments(pi.segments); body.closePath();
  if (tip !== 'round') return body;
  const c0 = circle(...pt(cx, cy, ri + wMin / 2, a0), wMin / 2), c1 = circle(...pt(cx, cy, ri + wMin / 2, a1), wMin / 2);
  return U(U(body, c0), c1);
}

/**
 * "Cradle" aura: a C whose inner edge is a circle (the socket: radius ri, centre cx,cy) and whose outer
 * edge is a single eccentric circle (radius ri+t0, centre shifted left by e). Each tip is a round cap
 * tangent to BOTH circles (a true fillet), placed at +-alpha from the socket centre. Arcs only.
 */
export function cradleC({ cx = 156, cy = 128, ri = 78, e = 21, t0 = 33, alpha = 36 }) {
  const R = ri + t0, a = rad(alpha), K = R + ri;
  const m = (K * K - e * e) / (2 * (K + e * Math.cos(a)));  // |tip centre - socket centre| = ri + rc
  const rc = m - ri;
  const S = [cx, cy], O = [cx - e, cy];
  const C = (sgn) => [cx + m * Math.cos(a), cy + sgn * m * Math.sin(a)];
  const unit = (p, q) => { const dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  const To = (sgn) => { const c = C(sgn), u = unit(c, O); return [O[0] + R * u[0], O[1] + R * u[1]]; };
  const Ti = (sgn) => { const c = C(sgn), u = unit(c, S); return [S[0] + ri * u[0], S[1] + ri * u[1]]; };
  const n = (v) => +v.toFixed(2);
  const [uo, lo, li, ui] = [To(-1), To(1), Ti(1), Ti(-1)];
  const d = `M${n(uo[0])} ${n(uo[1])}A${R} ${R} 0 1 0 ${n(lo[0])} ${n(lo[1])}A${n(rc)} ${n(rc)} 0 0 0 ${n(li[0])} ${n(li[1])}A${ri} ${ri} 0 1 1 ${n(ui[0])} ${n(ui[1])}A${n(rc)} ${n(rc)} 0 0 0 ${n(uo[0])} ${n(uo[1])}Z`;
  return { d, rc, R, tipC: C(-1), opening: 2 * m * Math.sin(a) - 2 * rc };
}
