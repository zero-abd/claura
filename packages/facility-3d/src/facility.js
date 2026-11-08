// Claura DFW-2 facility visualization.
//
//   import { createFacility } from './facility.js'
//   const f = createFacility(containerOrCanvas, { look: 'iso' | 'lumen', background: 'transparent' | '#rrggbb' })
//   await f.ready
//   f.setState('breach'); f.fly('rack14')            // interactive, animated (own requestAnimationFrame loop)
//   f.renderAt('containing', 3.2, 'hallB')           // pure: same inputs, same pixels
//   f.film.renderAt(7.5, track)                      // pure: track = [{ t, state?, cam?, progress? }, ...]
//   f.onPick(({ host, hall, rack }) => ...)          // click a host; f.highlight('b14-gpu-07', 'select') to outline one
//   (highlight is UI state: call f.highlight(null) and f.highlight(null, 'select') before capturing film frames)
//
// Determinism: nothing in this package reads a wall clock or Math.random. The interactive loop only uses the
// timestamp that requestAnimationFrame hands it, and feeds it to the same pure functions as renderAt.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import * as TL from './timeline.js';
import { clamp, easeInOutCubic } from './util.js';
import { RACK_BY_ID, parseHost } from './layout.js';

export const STATES = TL.STATES;
export const CAMERA_PRESETS = TL.PRESET_NAMES;
export const STATE_DURATION = TL.DUR;
export const storyTrack = TL.storyTrack;
export const trackDuration = TL.trackDuration;
export const evalTrack = TL.evalTrack;

export function createFacility(target, opts = {}) {
  const look = opts.look === 'iso' ? 'iso' : 'lumen'; // Lumen is the recommended (default) look
  const bgOpt = opts.background ?? 'default';
  const transparent = bgOpt === 'transparent';

  // ------------------------------------------------------------ canvas + renderer
  let canvas, container = null;
  if (target && target.tagName === 'CANVAS') canvas = target;
  else {
    container = target || document.body;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    container.appendChild(canvas);
  }
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  const world = buildWorld({ look, lineWidth: opts.lineWidth ?? 1.25 });
  renderer.toneMapping = world.config.toneMapping;
  renderer.toneMappingExposure = world.config.exposure;
  if (world.config.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  world.initEnvironment(renderer);
  if (transparent) renderer.setClearColor(0x000000, 0);
  else if (bgOpt === 'default') renderer.setClearColor(new THREE.Color(world.bgColor), 1);
  else renderer.setClearColor(new THREE.Color(bgOpt), 1);
  if (world.background) world.background.visible = bgOpt === 'default';

  let W = 0, H = 0, dpr = 1;
  /** resize(): follow the container. resize(w, h, pixelRatio): fixed size in CSS px (e.g. 1920, 1080, 1 for video). */
  function resize(w, h, ratio) {
    const ew = w ?? opts.width, eh = h ?? opts.height;
    const box = container || canvas;
    W = Math.round(ew ?? box.clientWidth) || 1280;
    H = Math.round(eh ?? box.clientHeight) || 800;
    dpr = ratio ?? opts.pixelRatio ?? Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, ew != null || eh != null);
    world.setViewport(W, H, dpr);
    if (lastDraw) lastDraw();
  }

  // ------------------------------------------------------------ drawing (pure given its arguments)
  let lastDraw = null;
  const camTmp = { eye: new THREE.Vector3(), tgt: new THREE.Vector3() };
  function applyPose(pose, offs) {
    const az = pose.az + (offs ? offs.az : 0);
    const el = clamp(pose.el + (offs ? offs.el : 0), 6, 88);
    const { d } = TL.basis(az, el);
    const aspect = W / H;
    const Hh = Math.max(pose.h, pose.w / aspect) * (offs ? offs.zoom : 1);
    const cam = world.camera;
    cam.left = (-Hh * aspect) / 2; cam.right = (Hh * aspect) / 2; cam.top = Hh / 2; cam.bottom = -Hh / 2;
    camTmp.tgt.set(pose.target[0], pose.target[1], pose.target[2]);
    cam.position.set(pose.target[0] + d[0] * 100, pose.target[1] + d[1] * 100, pose.target[2] + d[2] * 100);
    cam.up.set(0, 1, 0);
    cam.lookAt(camTmp.tgt);
    cam.near = 1; cam.far = 300;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return Hh;
  }
  function draw(res, offs) {
    const Hh = applyPose(res.pose, offs);
    world.update({ ch: res.ch, T: res.T }, { H: Hh, ppm: H / Hh });
    renderer.render(world.scene, world.camera);
    return canvas;
  }

  // Warm up synchronously: compile every program and draw two throwaway frames. No timers, no rAF involved
  // (renderer.compileAsync polls with setTimeout internally, which a seek-driven renderer cannot rely on).
  resize();
  renderer.compile(world.scene, world.camera);
  draw(TL.evalState('breach', 3, 'facility'));
  draw(TL.evalState('contained', 2, 'rack14'));
  draw(TL.evalState('nominal', 0, 'facility'));
  /** Resolves (in a microtask, no timers) once meshes are built and shaders are compiled. Resolves to the facility. */
  const ready = Promise.resolve().then(() => api);

  // ------------------------------------------------------------ pure API
  /** Pure. Draws `state` at t seconds after entering it, with camera preset (or pose object) `cam`. */
  function renderAt(stateName, t = 0, cam = 'facility') {
    pause();
    const res = TL.evalState(stateName, t, cam);
    lastDraw = () => draw(res);
    return draw(res);
  }
  /** Pure. Resolves `track` at absolute time t (camera flights + state crossfades) and draws it. */
  function filmRenderAt(t, track) {
    pause();
    const res = TL.evalTrack(t, track);
    lastDraw = () => draw(res);
    return draw(res);
  }
  const film = {
    renderAt: filmRenderAt,
    evalAt: (t, track) => TL.evalTrack(t, track),
    duration: TL.trackDuration,
    storyTrack: TL.storyTrack,
  };

  // ------------------------------------------------------------ interactive mode (same pure functions, own clock)
  let keys = [{ t: 0, state: 'nominal', cam: 'facility' }];
  let now = 0, tsOrigin = null, raf = 0, running = false;
  let offs = { az: 0, el: 0, zoom: 1 }, offsAnim = null;
  const curOffs = () => {
    if (!offsAnim) return offs;
    const k = easeInOutCubic(clamp((now - offsAnim.t0) / TL.FLY));
    return { az: offsAnim.from.az * (1 - k), el: offsAnim.from.el * (1 - k), zoom: Math.exp(Math.log(offsAnim.from.zoom) * (1 - k)) };
  };
  function compact() {
    const last = keys[keys.length - 1];
    if (keys.length < 2 || now - last.t < Math.max(TL.BLEND, TL.FLY) + 0.1) return;
    let s = last;
    for (let i = keys.length - 1; i >= 0; i--) if (keys[i].state != null) { s = keys[i]; break; }
    keys = [{ t: s.t, state: s.state, progress: s.progress, cam: last.cam }];
  }
  function tick(ts) {
    if (!running) return;
    if (tsOrigin == null) tsOrigin = ts - now * 1000;
    now = (ts - tsOrigin) / 1000;
    if (offsAnim && now - offsAnim.t0 >= TL.FLY) { offs = { az: 0, el: 0, zoom: 1 }; offsAnim = null; }
    compact();
    const res = TL.evalTrack(now, keys);
    lastDraw = () => draw(res, curOffs());
    draw(res, curOffs());
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (running) return;
    running = true; tsOrigin = null;
    lastDraw = null;
    raf = requestAnimationFrame(tick);
  }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  /** Animated: crossfades the visuals into `name` (and its entry animation plays from t = 0). */
  function setState(name) {
    if (!STATES.includes(name)) throw new Error(`unknown state "${name}" (expected one of ${STATES.join(', ')})`);
    keys.push({ t: now, state: name });
    play();
  }
  /** Animated: flies the camera to a preset (or pose object). */
  function fly(preset) {
    TL.resolvePose(preset, 0); // validates
    if (offs.az || offs.el || offs.zoom !== 1) offsAnim = { from: { ...curOffs() }, t0: now };
    keys.push({ t: now, cam: preset });
    play();
  }
  const getState = () => TL.evalTrack(now, keys).state;
  const getCamera = () => keys[keys.length - 1].cam;
  const getTime = () => now;

  // ------------------------------------------------------------ picking, hover, selection
  const pickCbs = new Set(), hoverCbs = new Set();
  let hoverHost = null, selectHost = null;
  const redrawIfIdle = () => { if (!running && lastDraw) lastDraw(); };
  /** Outline a host. host = 'b14-gpu-07' (or a pick result), kind = 'hover' | 'select', null clears that outline. */
  function highlight(host, kind = 'hover') {
    const id = host && typeof host === 'object' ? host.host : host;
    const k = kind === 'select' ? 'select' : 'hover';
    if (!world.setHighlight(k, id || null)) throw new Error(`unknown host "${id}" (expected e.g. b14-gpu-07)`);
    if (k === 'select') selectHost = id ? parseHost(id).host : null; else hoverHost = id ? parseHost(id).host : null;
    redrawIfIdle();
    return true;
  }
  const decorate = (hit) => {
    if (!hit) return null;
    const rack = RACK_BY_ID[hit.rack];
    return { ...hit, position: hit.point, pose: hit.rack === 'B14' ? 'rack14' : TL.rackPose(rack) };
  };
  /** Pick at canvas-relative CSS px (x, y). Returns { host, hall, rack, ... } or null. Uses the camera of the last drawn frame. */
  function pickAt(x, y) {
    const r = canvas.getBoundingClientRect();
    const w = r.width || W, h = r.height || H;
    return decorate(world.pick((x / w) * 2 - 1, -((y / h) * 2 - 1)));
  }
  const onPick = (cb) => { pickCbs.add(cb); return () => pickCbs.delete(cb); };
  const onHover = (cb) => { hoverCbs.add(cb); return () => hoverCbs.delete(cb); };

  if ((opts.controls !== false || opts.pick !== false) && typeof canvas.addEventListener === 'function') {
    let down = null, last = null, moved = false;
    const rel = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; last = { ...down }; moved = false; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (down) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true;
        if (moved && opts.controls !== false && running) {
          offsAnim = null;
          offs = { ...offs, az: offs.az - (e.clientX - last.x) * 0.3, el: offs.el + (e.clientY - last.y) * 0.2 };
        }
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      if (opts.pick === false) return;
      const hit = pickAt(...rel(e));
      const id = hit ? hit.host : null;
      if (id !== hoverHost) {
        highlight(id, 'hover');
        canvas.style.cursor = id ? 'pointer' : '';
        hoverCbs.forEach((cb) => cb(hit));
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      const wasClick = down && !moved;
      down = null;
      if (!wasClick || opts.pick === false) return;
      const hit = pickAt(...rel(e));
      if (hit) { highlight(hit.host, 'select'); pickCbs.forEach((cb) => cb(hit)); }
      else if (selectHost) highlight(null, 'select');
    });
    canvas.addEventListener('pointercancel', () => { down = null; });
    canvas.addEventListener('pointerleave', () => { if (hoverHost) { highlight(null, 'hover'); canvas.style.cursor = ''; hoverCbs.forEach((cb) => cb(null)); } });
    canvas.addEventListener('wheel', (e) => {
      if (!running || opts.controls === false) return;
      e.preventDefault(); offsAnim = null;
      offs = { ...offs, zoom: clamp(offs.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 2.4) };
    }, { passive: false });
  }

  let ro = null;
  if (container && typeof ResizeObserver !== 'undefined' && opts.width == null) {
    ro = new ResizeObserver(() => resize());
    ro.observe(container);
  }

  function dispose() {
    pause();
    if (ro) ro.disconnect();
    world.dispose();
    renderer.dispose();
    if (container && canvas.parentNode === container) container.removeChild(canvas);
  }

  const api = {
    canvas, look, ready,
    states: STATES, presets: CAMERA_PRESETS,
    setState, fly, renderAt, film,
    onPick, onHover, highlight, pickAt,
    play, pause, resize, dispose, getState, getCamera, getTime,
    get size() { return { width: W, height: H, pixelRatio: dpr }; },
  };
  if (opts.autoplay) play();
  return api;
}

export default createFacility;
