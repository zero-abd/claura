// Claura logo concepts. Each concept returns colour layers + mono layers (256 box).
import * as g from './geo.mjs';
const { circle, ellipse, rrect, rect, poly, U, S, I, rot, D, cRingD, bandD, P, pt, rad, taperedRing } = g;
const O = 'O';

const mono = (layers) => layers.map(({ d }) => ({ d }));

// ---------------------------------------------------------------- 01 staggered aura
function auraRings() {
  const A = cRingD(128, 128, 98, 24, -45, 44);
  const B = cRingD(128, 128, 58, 24, 135, 64);
  const dot = D(circle(128, 128, 22));
  const color = [
    { d: A, fill: O }, { d: B, fill: O }, { d: dot, fill: O, id: 'seal' },
  ];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 02 glass C (layers)
function glassC() {
  const mk = (a) => cRingD(128, 128, 84, 46, a, 72);
  const color = [
    { d: mk(-34), fill: O, opacity: 0.42 },
    { d: mk(34), fill: O, opacity: 0.42 },
    { d: mk(0), fill: O, opacity: 0.62, id: 'seal' },
  ];
  const mk2 = (r, a) => cRingD(128, 128, r, 20, a, 64);
  const m = [
    { d: mk2(100, -30) }, { d: mk2(70, 0) }, { d: mk2(40, 30) },
  ];
  return { color, mono: m };
}

// ---------------------------------------------------------------- 03 eclipse (eccentric ring + orb)
function eclipse() {
  const ring = S(circle(128, 128, 110), circle(146, 110, 72));
  const orb = circle(122, 134, 28);
  const color = [{ d: D(ring), fill: O }, { d: D(orb), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 04 split bulkhead doors + bolt
function splitDoors() {
  const disc = circle(128, 128, 110);
  const gap = 16;
  const left = I(disc, rect(0, 0, 128 - gap / 2, 256));
  const right = I(disc, rect(128 + gap / 2, 0, 128 - gap / 2, 256));
  const halo = rrect(70, 128 - 28, 116, 56, 28);
  const L = S(left, halo), R = S(right, halo);
  const bolt = rrect(84, 128 - 20, 88, 40, 20);
  const color = [
    { d: D(L), fill: O }, { d: D(R), fill: O }, { d: D(bolt), fill: O, id: 'seal' },
  ];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 05 sentinel eye
function eye() {
  const lens = (a, b) => {
    const R = (a * a + b * b) / (2 * b);
    return I(circle(128, 128 + (R - b), R), circle(128, 128 - (R - b), R));
  };
  const outer = lens(108, 74), inner = lens(82, 48);
  const band = S(outer, inner);
  const iris = circle(128, 128, 30);
  const color = [{ d: D(band), fill: O }, { d: D(iris), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 06 halo orb (over/under)
function haloOrb() {
  const orb0 = circle(128, 132, 60);
  const ring = S(ellipse(128, 132, 114, 38, -22), ellipse(128, 132, 96, 22, -22));
  // back half = above the tilted axis, front half = below
  const axisClip = (up) => {
    const p = poly(up
      ? [[-50, -50], [306, -50], [306, 132 - Math.tan(rad(22)) * 178 + 0], [-50, 132 + Math.tan(rad(22)) * 178]]
      : [[-50, 306], [306, 306], [306, 132 - Math.tan(rad(22)) * 178], [-50, 132 + Math.tan(rad(22)) * 178]]);
    return p;
  };
  const back = I(ring, axisClip(true));
  const front = I(ring, axisClip(false));
  const backCut = S(back, circle(128, 132, 72));
  // orb with a gap around the front arc
  const gapAround = (() => {
    const fat = S(ellipse(128, 132, 124, 48, -22), ellipse(128, 132, 86, 12, -22));
    return I(fat, axisClip(false));
  })();
  const orbCut = S(orb0, gapAround);
  const color = [
    { d: D(backCut), fill: O }, { d: D(orbCut), fill: O }, { d: D(front), fill: O, id: 'seal' },
  ];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 07 monogram a/C
function monogramA() {
  const bowl = cRingD(112, 134, 62, 36, 0, 78);
  const stem = rrect(176, 46, 36, 176, 18);
  const color = [{ d: bowl, fill: O }, { d: D(stem), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 08 halo lock
function haloLock() {
  const body0 = circle(128, 152, 58);
  const key = U(circle(128, 146, 11), poly([[121, 150], [135, 150], [138, 180], [118, 180]]));
  const body = S(body0, key);
  const halo = bandD(128, 152, 82, 18, 195, 345, { start: 'round', end: 'round' });
  const color = [{ d: halo, fill: O, id: 'seal' }, { d: D(body), fill: O }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 09 spiral to dot
function spiral() {
  const n = 120;
  const a0 = 20, a1 = 20 + 440, r0 = 100, r1 = 40, w = 24;
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, r = r0 + (r1 - r0) * t;
    out.push(pt(128, 128, r + w / 2, a));
    inn.push(pt(128, 128, r - w / 2, a));
  }
  let sp = poly([...out, ...inn.reverse()]);
  sp.smooth({ type: 'catmull-rom', factor: 0.5 });
  const capS = circle(...pt(128, 128, r0, a0), w / 2);
  const capE = circle(...pt(128, 128, r1, a1), w / 2);
  const body = U(U(sp, capS), capE);
  const dot = circle(128, 128, 14);
  const color = [{ d: D(body), fill: O }, { d: D(dot), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 10 quad hatch (four agents)
function quadHatch() {
  const segs = [];
  for (let k = 0; k < 4; k++) {
    const c = k * 90; // centred on E,S,W,N
    segs.push(bandD(128, 128, 86, 44, c - 38, c + 38, { start: 'butt', end: 'butt' }));
  }
  const dot = D(circle(128, 128, 20));
  const color = [
    { d: segs[0], fill: O }, { d: segs[1], fill: O }, { d: segs[2], fill: O },
    { d: segs[3], fill: O, id: 'seal' }, { d: dot, fill: O },
  ];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 11 squircle with corner badge
function squircleBadge() {
  const outer = rrect(20, 28, 208, 208, 70), inner = rrect(52, 60, 144, 144, 40);
  const ring0 = S(outer, inner);
  const cut = circle(212, 44, 44);
  const ring = S(ring0, cut);
  const dot = circle(212, 44, 24);
  const color = [{ d: D(ring), fill: O }, { d: D(dot), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 12 nested tangent crescents
function nest() {
  const T = [128, 236];
  const C = (r) => circle(T[0], T[1] - r, r);
  const A = S(C(110), C(84));
  const B = S(C(58), C(32));
  const dot = C(16);
  const color = [{ d: D(A), fill: O }, { d: D(B), fill: O }, { d: D(dot), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- 13 cradle crescent + orb
function cradle() {
  const cres = S(circle(128, 128, 110), circle(160, 128, 86));
  const orb = circle(150, 128, 36);
  const color = [{ d: D(cres), fill: O }, { d: D(orb), fill: O, id: 'seal' }];
  return { color, mono: mono(color) };
}


// ================================================================ round 2
// ---------------------------------------------------------------- keyhole inside a halo
function keyholeHalo() {
  const ring = cRingD(128, 128, 98, 26, 90, 46);
  const head = circle(128, 104, 30);
  const stem = poly([[114, 120], [142, 120], [156, 196], [100, 196]]);
  const key = U(head, stem);
  const color = [{ d: ring, fill: 'O' }, { d: D(key), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- tapered ring + pearl in its mouth
function ensoPearl() {
  const ring = taperedRing({ r: 86, wMax: 54, wMin: 18, a0: -20, a1: 255, p: 0.9, peak: 0.55 });
  const pearl = circle(...pt(128, 128, 86, -48), 17);
  const color = [{ d: D(ring), fill: 'O' }, { d: D(pearl), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

// ---------------------------------------------------------------- three agents overlap
function venn() {
  const R = 68, off = 40;
  const cs = [-90, 30, 150].map((a) => circle(...pt(128, 128 + 6, off, a), R));
  const core = I(I(cs[0], cs[1]), cs[2]);
  const color = [
    { d: D(cs[0]), fill: 'O', opacity: 0.5 }, { d: D(cs[1]), fill: 'O', opacity: 0.5 }, { d: D(cs[2]), fill: 'O', opacity: 0.5 },
    { d: D(core), fill: 'O', id: 'seal' },
  ];
  // mono: three rings + solid core
  const rings = cs.map((c) => S(c, circle(c.bounds.center.x, c.bounds.center.y, R - 14)));
  const m = [...rings.map((r) => ({ d: D(r) })), { d: D(core) }];
  return { color, mono: m };
}

// ---------------------------------------------------------------- 'a' that a C closes into
function closingA() {
  const cx = 112, cy = 140, r = 56, w = 40;
  const bowl = cRingD(cx, cy, r, w, 0, 64);
  const stem = rrect(168, 52, w, 176, 20);
  const color = [{ d: bowl, fill: 'O' }, { d: D(stem), fill: 'O', id: 'seal' }];
  return { color, mono: mono(color) };
}

export const concepts = [
  { slug: 'aura-rings', name: 'Staggered Aura', build: auraRings, rationale: 'Two rings whose openings never line up, so nothing passes straight through, and the core sits inside.' },
  { slug: 'glass-c', name: 'Glass C', build: glassC, rationale: 'A C made of stacked translucent panes; the overlap is the strongest, sealed part.' },
  { slug: 'eclipse', name: 'Eclipse', build: eclipse, rationale: 'A wall that thins where pressure is highest, with the contained core held inside.' },
  { slug: 'split-doors', name: 'Bulkhead Doors', build: splitDoors, rationale: 'Two bulkhead doors slid almost shut, one bolt across the seam.' },
  { slug: 'cradle', name: 'Cradle', build: cradle, rationale: 'A crescent that cups an orb: the breach, held.' },
  { slug: 'spiral', name: 'Closing Spiral', build: spiral, rationale: 'One stroke winding in until it holds a single point.' },
  { slug: 'keyhole-halo', name: 'Keyhole Halo', build: keyholeHalo, rationale: 'A keyhole standing inside a halo that opens only at its foot.' },
  { slug: 'enso-pearl', name: 'Enso Pearl', build: ensoPearl, rationale: 'A calm tapered ring, closed by one pearl set in its mouth.' },
  { slug: 'venn', name: 'Three Fields', build: venn, rationale: 'Sentry, Triage and Warden fields overlap; where all three agree is the seal.' },
  { slug: 'closing-a', name: 'Closing a', build: closingA, rationale: 'A C that closes into an a: the stem is the seal.' },
];
