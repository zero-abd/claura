// Small deterministic helpers. No Math.random, no Date.now, no performance.now anywhere in this package.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
export const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeInOutSine = (k) => -(Math.cos(Math.PI * k) - 1) / 2;
export const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
export const easeInQuart = (k) => k * k * k * k;
export const easeOutExpo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));

/** Seeded PRNG (mulberry32). Same seed, same sequence, on every machine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash -> [0,1). Pure; used for per-cell shimmer so nothing needs state. */
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in time for cell index i. */
export function shimmer(i, T, rate = 1) {
  const x = T * rate;
  const k = Math.floor(x);
  const f = x - k;
  const s = f * f * (3 - 2 * f);
  return lerp(hash01(i, k), hash01(i, k + 1), s);
}

export const wrapDeg = (d) => ((d + 180) % 360 + 360) % 360 - 180;
export const lerpAngleDeg = (a, b, k) => a + wrapDeg(b - a) * k;
