// Claura logo concepts (256 box, centre 128,128). Each build() returns colour + mono layers.
// Layer: { d, fill: 'O'|'G'|..., opacity?, id? }. The element that means "sealed" carries id="seal".
import * as g from './geo.mjs';
const { circle, rrect, rect, poly, U, S, I, D, cRingD, pt, taperedRing, socketRing } = g;

const mono = (layers) => layers.map(({ d }) => ({ d }));

// ---------------------------------------------------------------- Staggered Aura
function auraRings() {
  const A = cRingD(128, 128, 98, 26, -45, 40);
  const B = cRingD(128, 128, 58, 26, 135, 60);
  const core = D(circle(128, 128, 22));
  const color = [{ d: A, fill: 'O' }, { d: B, fill: 'O' }, { d: core, fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Glass C
const GLASS = { r: 82, w: 48, panes: [[-28, 58], [28, 58], [0, 112]] };
function glassC() {
  const { r, w, panes } = GLASS;
  const color = [
    { d: cRingD(128, 128, r, w, ...panes[0]), fill: 'O', opacity: 0.5 },
    { d: cRingD(128, 128, r, w, ...panes[1]), fill: 'O', opacity: 0.5 },
    { d: cRingD(128, 128, r, w, ...panes[2]), fill: 'O', id: 'seal' },
  ];
  // mono: solid front pane + the faint panes' overhang as detached echo segments (6 unit gap)
  const capDeg = (ww) => (ww / 2 / r) * 180 / Math.PI;
  const front = g.P(cRingD(128, 128, r, w, ...panes[2]));
  const wide = 12, [fa, fg] = panes[2];
  const frontWide = g.P(cRingD(128, 128, r, w + wide, fa, fg + 2 * (capDeg(w) - capDeg(w + wide))));
  const back = U(g.P(cRingD(128, 128, r, w, ...panes[0])), g.P(cRingD(128, 128, r, w, ...panes[1])));
  const echo = S(back, frontWide);
  return { color, mono: [{ d: D(front) }, { d: D(echo) }] };
}

// ---------------------------------------------------------------- Eclipse
function eclipse() {
  const ring = S(circle(128, 128, 110), circle(146, 110, 72));
  const orb = circle(122, 134, 28);
  const color = [{ d: D(ring), fill: 'O' }, { d: D(orb), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Bulkhead Doors
function splitDoors() {
  const disc = circle(128, 128, 110);
  const gap = 16;
  const left = I(disc, rect(0, 0, 128 - gap / 2, 256));
  const right = I(disc, rect(128 + gap / 2, 0, 128 - gap / 2, 256));
  const halo = rrect(66, 128 - 30, 124, 60, 22);
  const bolt = rrect(80, 128 - 20, 96, 40, 12);
  const color = [
    { d: D(S(left, halo)), fill: 'O' }, { d: D(S(right, halo)), fill: 'O' }, { d: D(bolt), fill: 'O', id: 'seal' },
  ];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Cradle (C-shaped aura + orb in a concentric socket)
export const CRADLE = { cx: 156, cy: 128, ri: 78, e: 21, t0: 33, alpha: 36, orb: 48 };
function cradle() {
  const k = g.cradleC(CRADLE);
  const orb = D(circle(CRADLE.cx, CRADLE.cy, CRADLE.orb));
  const color = [{ d: k.d, fill: 'O', id: 'aura' }, { d: orb, fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Closing Spiral
function spiral() {
  const n = 120, a0 = 20, a1 = 460, r0 = 100, r1 = 40, w = 24;
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, r = r0 + (r1 - r0) * t;
    out.push(pt(128, 128, r + w / 2, a));
    inn.push(pt(128, 128, r - w / 2, a));
  }
  const sp = poly([...out, ...inn.reverse()]);
  sp.smooth({ type: 'catmull-rom', factor: 0.5 });
  const body = U(U(sp, circle(...pt(128, 128, r0, a0), w / 2)), circle(...pt(128, 128, r1, a1), w / 2));
  const color = [{ d: D(body), fill: 'O' }, { d: D(circle(128, 128, 14)), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Keyhole Halo
function keyholeHalo() {
  const ring = cRingD(128, 128, 98, 26, 90, 46);
  const key = U(circle(128, 104, 30), poly([[114, 120], [142, 120], [156, 196], [100, 196]]));
  const color = [{ d: ring, fill: 'O' }, { d: D(key), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Enso Pearl
function ensoPearl() {
  const ring = taperedRing({ r: 84, wMax: 56, wMin: 20, a0: 38, a1: 322, p: 0.9, peak: 0.5 });
  const pearl = circle(...pt(128, 128, 84, 0), 22);
  const color = [{ d: D(ring), fill: 'O' }, { d: D(pearl), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- Closing a
function closingA() {
  const bowl = cRingD(112, 140, 56, 40, 0, 64);
  const stem = rrect(168, 52, 40, 176, 20);
  const color = [{ d: bowl, fill: 'O' }, { d: D(stem), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

export const concepts = [
  { slug: 'aura-rings', name: 'Staggered Aura', build: auraRings, direction: 'Aura field', rationale: 'Two rings whose openings never line up, so nothing passes straight through; the core sits inside.' },
  { slug: 'glass-c', name: 'Glass C', build: glassC, direction: 'Glass C', rationale: 'A C of stacked glass panes: the solid front pane is the seal, the faint panes behind are the aura.' },
  { slug: 'eclipse', name: 'Eclipse', build: eclipse, direction: 'Ring around a dot', rationale: 'A containment ring that thickens away from the breach it holds.' },
  { slug: 'split-doors', name: 'Bulkhead Doors', build: splitDoors, direction: 'Bulkhead hatch', rationale: 'Two bulkhead doors slid shut, one bolt across the seam.' },
  { slug: 'cradle', name: 'Cradle', build: cradle, direction: 'Shield-orb', rationale: 'A C-shaped aura cupping the breach in a concentric socket; the mouth is narrower than the orb, so it cannot slip out.' },
  { slug: 'spiral', name: 'Closing Spiral', build: spiral, direction: 'Aura that closes', rationale: 'One stroke winding in until it holds a single point.' },
  { slug: 'keyhole-halo', name: 'Keyhole Halo', build: keyholeHalo, direction: 'Lock-halo', rationale: 'A keyhole standing inside a halo that opens only at its foot.' },
  { slug: 'enso-pearl', name: 'Enso Pearl', build: ensoPearl, direction: 'Calm guardian', rationale: 'A calm tapered ring, closed by one pearl set in its mouth.' },
  { slug: 'closing-a', name: 'Closing a', build: closingA, direction: 'Monogram that seals', rationale: 'A C that closes into an a: the stem is the seal.' },
];
