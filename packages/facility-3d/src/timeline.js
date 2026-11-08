// Pure scene timeline: incident states, camera presets, and track evaluation. No three.js, no clocks.
//
// Everything the renderer draws is a function of (state channels, ambient time T, camera pose).
// `channelsAt(state, tl)` returns the full set of numeric "channels" for a state, tl seconds after entering it.
// `evalTrack(t, track)` resolves a list of keys {t, state?, cam?, progress?, blend?, fly?} into the channels and
// camera pose at absolute time t. It is stateless: the same (t, track) always yields the same result, whatever
// was requested before it.

import { clamp, lerp, sstep, easeInOutSine, easeInOutCubic, lerpAngleDeg } from './util.js';
import { HALL_CENTERS, HALL, PLINTH, B14, RACK, SLAB_Y, frontZ } from './layout.js';

export const STATES = ['nominal', 'breach', 'containing', 'approval', 'contained'];
/** Seconds each state's entry animation takes. After that the state is static (apart from ambient shimmer). */
export const DUR = { nominal: 0, breach: 5, containing: 6, approval: 3, contained: 4 };
/** Default story: how long a demo holds each state. */
export const STORY = [
  { state: 'nominal', hold: 4 }, { state: 'breach', hold: 5 }, { state: 'containing', hold: 6.5 },
  { state: 'approval', hold: 4 }, { state: 'contained', hold: 5 },
];
export const BLEND = 0.7; // s, crossfade when a key switches state
export const FLY = 1.8; // s, camera flight between presets
export const ORBIT_PERIOD = 48; // s per 360 degrees

export const ZERO = Object.freeze({
  hot: 0, sus: 0, hyp: 0, mgmt: 0, pc: 0, pulseAmp: 0, linkA: 0, linkB: 0,
  d1: 0, d2: 0, d3: 0, lid: 0, mig: 0, ring: 0, appr: 0, seal: 0, green: 0, flash: 0, sw: 0, drain: 0,
});
export const CHANNELS = Object.keys(ZERO);

export function channelsAt(state, tl) {
  tl = Math.max(0, tl);
  const c = { ...ZERO };
  switch (state) {
    case 'nominal':
      break;
    case 'breach':
      c.hot = sstep(0, 1.0, tl);
      c.sus = sstep(0, 0.35, tl);
      c.pc = tl;
      c.pulseAmp = sstep(0.05, 0.6, tl);
      c.hyp = sstep(0.9, 1.5, tl);
      c.linkB = easeInOutSine(clamp((tl - 1.2) / 2.8));
      c.mgmt = sstep(3.8, 4.5, tl);
      break;
    case 'containing':
      c.hot = 1; c.sus = 1; c.hyp = 1;
      c.pc = DUR.breach + tl;
      c.pulseAmp = 1 - sstep(3.8, 4.9, tl);
      c.linkB = 1;
      c.linkA = easeInOutSine(clamp((tl - 0.45) / 1.1));
      c.mgmt = 1 - sstep(1.1, 2.1, tl);
      c.d1 = clamp((tl - 0.35) / 0.85);
      c.d2 = clamp((tl - 1.5) / 0.85);
      c.d3 = clamp((tl - 2.7) / 0.95);
      c.mig = clamp(tl - 0.9, 0, 4.6);
      break;
    case 'approval':
      c.hot = lerp(1, 0.62, sstep(0, 1.2, tl));
      c.sus = 1;
      c.hyp = lerp(1, 0.7, sstep(0, 1, tl));
      c.linkA = 1; c.linkB = 1;
      c.d1 = 1; c.d2 = 1; c.d3 = 1;
      c.mig = 4.6;
      c.ring = sstep(0, 1.0, tl);
      c.appr = sstep(0.2, 1.2, tl);
      c.pc = DUR.breach + DUR.containing;
      break;
    case 'contained':
      c.hot = 0.62 * (1 - sstep(2.4, 3.6, tl));
      c.drain = sstep(0.5, 3.4, tl);
      c.sus = 1 - sstep(0.5, 2.0, tl);
      c.hyp = 0.7 * (1 - sstep(0.5, 2.0, tl));
      c.linkA = 1; c.linkB = 1;
      c.d1 = 1; c.d2 = 1; c.d3 = 1;
      c.mig = 4.6;
      c.ring = 1;
      c.appr = 1 - sstep(0.2, 0.8, tl);
      c.seal = clamp((tl - 0.3) / 0.85);
      c.lid = clamp((tl - 0.1) / 1.0);
      c.green = sstep(1.0, 1.9, tl);
      c.flash = Math.exp(-Math.pow((tl - 1.2) / 0.3, 2));
      c.sw = clamp((tl - 1.1) / 1.8);
      c.pc = DUR.breach + DUR.containing;
      break;
    default:
      throw new Error(`unknown state "${state}" (expected one of ${STATES.join(', ')})`);
  }
  return c;
}

export function lerpChannels(a, b, k) {
  const o = {};
  for (const key of CHANNELS) o[key] = lerp(a[key], b[key], k);
  return o;
}

// ---------------------------------------------------------------- camera

const rad = (d) => (d * Math.PI) / 180;
/** Camera basis for an orthographic view: d points from the target toward the eye. */
export function basis(az, el) {
  const a = rad(az), e = rad(el);
  const d = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const r = [Math.cos(a), 0, -Math.sin(a)];
  const u = [-Math.sin(a) * Math.sin(e), Math.cos(e), -Math.cos(a) * Math.sin(e)];
  return { d, r, u };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const boxPts = (x0, x1, y0, y1, z0, z1) => {
  const p = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) p.push([x, y, z]);
  return p;
};

/** Pose = { target:[x,y,z], az, el, w, h }: w,h are the world extents (metres, in screen space) that must fit. */
export function fitPose(points, az, el, pad = [0.05, 0.06]) {
  const { r, u } = basis(az, el);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    const sx = dot(p, r), sy = dot(p, u);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return {
    target: [r[0] * cx + u[0] * cy, r[1] * cx + u[1] * cy, r[2] * cx + u[2] * cy],
    az, el, w: (x1 - x0) * (1 + pad[0]), h: (y1 - y0) * (1 + pad[1]),
  };
}

const ISO_EL = 35.264;
const hb = HALL_CENTERS.B;
const facilityPts = boxPts(-PLINTH.hx, PLINTH.hx, -PLINTH.depth, 3.4, -PLINTH.hz, PLINTH.hz);
const hallBPts = boxPts(hb[0] - HALL.len / 2 - 0.4, hb[0] + HALL.len / 2 + 0.4, -0.1, 3.6, hb[1] - HALL.wid / 2 - 0.4, hb[1] + HALL.wid / 2 + 0.4);
const zf14 = frontZ(B14);
const rack14Pts = boxPts(B14.x - 1.7, B14.x + 1.7, 0, 4.75, B14.z - 1.0, zf14 + 1.55);

export const PRESETS = {
  facility: fitPose(facilityPts, 45, ISO_EL, [0.1, 0.12]),
  hallB: fitPose(hallBPts, 45, 33, [0.08, 0.06]),
  rack14: fitPose(rack14Pts, 28, 24, [0.04, 0.02]),
};
// orbit: facility framing that holds at every azimuth
PRESETS.orbit = (() => {
  let w = 0, h = 0;
  for (let az = 0; az < 360; az += 10) {
    const p = fitPose(facilityPts, az, ISO_EL, [0.1, 0.12]);
    w = Math.max(w, p.w); h = Math.max(h, p.h);
  }
  return { target: [0, 0.4, 0], az: 45, el: ISO_EL, w, h };
})();
export const PRESET_NAMES = ['facility', 'hallB', 'rack14', 'orbit'];

/** A pose that frames one rack from the front (rows facing -z are viewed from the other side). Feed it to fly(). */
export function rackPose(rack) {
  const az = rack.f > 0 ? 28 : 208, f = rack.f;
  const zFront = rack.z + f * (RACK.d / 2 + 1.5), zBack = rack.z - f * 0.7;
  return fitPose(boxPts(rack.x - 1.6, rack.x + 1.6, 0, 3.4, Math.min(zFront, zBack), Math.max(zFront, zBack)), az, 24, [0.05, 0.05]);
}

export function resolvePose(cam, t) {
  let p;
  if (cam == null) p = PRESETS.facility;
  else if (typeof cam === 'string') {
    p = PRESETS[cam];
    if (!p) throw new Error(`unknown camera preset "${cam}" (expected one of ${PRESET_NAMES.join(', ')})`);
    cam = { preset: cam };
  } else if (cam.preset) {
    const base = PRESETS[cam.preset];
    if (!base) throw new Error(`unknown camera preset "${cam.preset}"`);
    p = { ...base, ...cam };
  } else p = cam;
  const name = typeof cam === 'object' && cam ? cam.preset : null;
  if (name === 'orbit') return { ...p, az: p.az + (360 * t) / ORBIT_PERIOD };
  return p;
}

export function lerpPose(a, b, k) {
  return {
    target: [lerp(a.target[0], b.target[0], k), lerp(a.target[1], b.target[1], k), lerp(a.target[2], b.target[2], k)],
    az: lerpAngleDeg(a.az, b.az, k),
    el: lerp(a.el, b.el, k),
    w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)),
    h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), k)),
  };
}

// ---------------------------------------------------------------- tracks

/** Sort keys by t (stable), fill defaults, and note which key owns the state timeline for each key. */
export function normalizeTrack(track) {
  if (!Array.isArray(track) || !track.length) throw new Error('track must be a non-empty array of {t, state?, cam?} keys');
  const keys = track.map((k, i) => ({ ...k, _i: i })).sort((a, b) => a.t - b.t || a._i - b._i);
  let lastCam = null, owner = -1;
  keys.forEach((k, i) => {
    if (k.state != null) {
      if (!STATES.includes(k.state)) throw new Error(`unknown state "${k.state}" in track key ${i}`);
      owner = i;
    }
    if (owner < 0) { k.state = 'nominal'; owner = i; }
    k._owner = owner;
    if (k.cam == null) k.cam = lastCam ?? 'facility';
    lastCam = k.cam;
  });
  return keys;
}

function chOwner(keys, oi, t) {
  const k = keys[oi];
  const tl = (k.progress != null ? k.progress * DUR[k.state] : 0) + Math.max(0, t - k.t);
  const cur = channelsAt(k.state, tl);
  if (oi === 0) return cur;
  const dt = t - k.t;
  const B = k.blend ?? BLEND;
  if (dt >= B) return cur;
  const prevOwner = keys[oi - 1]._owner;
  const prev = chOwner(keys, prevOwner, k.t);
  return lerpChannels(prev, cur, easeInOutCubic(clamp(dt / B)));
}

function poseAt(keys, i, t) {
  const k = keys[i];
  const target = resolvePose(k.cam, t);
  if (i === 0) return target;
  const dt = t - k.t;
  const F = k.fly ?? FLY;
  if (dt >= F || (keys[i - 1].cam === k.cam && !isOrbit(k.cam))) return target;
  const from = poseAt(keys, i - 1, k.t);
  return lerpPose(from, target, easeInOutCubic(clamp(dt / F)));
}
const isOrbit = (cam) => cam === 'orbit' || (cam && typeof cam === 'object' && cam.preset === 'orbit');

/** Resolve a track at absolute time t. Pure. `keys` may be pre-normalised (see normalizeTrack). */
export function evalTrack(t, track, normalized = false) {
  const keys = normalized ? track : normalizeTrack(track);
  let i = 0;
  for (let j = 0; j < keys.length; j++) if (keys[j].t <= t) i = j;
  const own = keys[i]._owner;
  const ch = chOwner(keys, own, t);
  const pose = poseAt(keys, i, t);
  const ok = keys[own];
  return { ch, pose, T: t, state: ok.state, tl: Math.max(0, t - ok.t) };
}

/** Total length of a track in seconds: last key time plus the longest animation tail it triggers. */
export function trackDuration(track) {
  const keys = normalizeTrack(track);
  const last = keys[keys.length - 1];
  return last.t + Math.max(DUR[keys[last._owner].state], FLY);
}

/** Single-state helper: channels/pose for renderAt(state, t, cam). */
export function evalState(state, t, cam) {
  return evalTrack(t, [{ t: 0, state, cam: cam ?? 'facility' }]);
}

/** Map a continuous story time onto a track using STORY holds (handy for video: one number per frame). */
export function storyTrack(story = STORY, cams = {}) {
  let t = 0;
  const keys = [];
  for (const s of story) {
    keys.push({ t, state: s.state, cam: cams[s.state] ?? s.cam ?? 'facility' });
    t += s.hold;
  }
  return keys;
}
