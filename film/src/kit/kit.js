/* Claura film kit (K): GSAP helpers shared by every scene, inlined by tools/build.mjs at the KIT marker.
   Every visible value is a function of timeline time: no clocks, no unseeded randomness, layout read once at build. */
const K = (() => {
  const $ = (s) => (typeof s === 'string' ? document.querySelector(s) : s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const INK = 'rgba(247,249,255,0.97)', INK4 = 'rgba(214,222,246,0.24)';
  const ORANGE = '#FF5A1F', GREEN = '#2FBF71';
  const W = 1920, H = 1080;

  // ---------------------------------------------------------------- wallpaper
  // Blob drift is linear in FILM time (px/s), so the ground is continuous across every cut and every transition.
  const DRIFT = { b1: [2.6, 1.6], b2: [-2.2, 1.8], b3: [-2.8, -0.9], b4: [2.4, -1.5], ember: [-1.6, 1.2], green: [-1.6, 1.2] };
  const TONE = { nominal: [0, 0], breach: [1, 0], contained: [0, 1] };
  function wall(tl, P, S) {
    const a = S.from, b = S.from + S.dur;
    for (const k in DRIFT) {
      const el = $(P + 'wp-' + k);
      if (!el) continue;
      const [vx, vy] = DRIFT[k];
      tl.fromTo(el, { x: vx * a, y: vy * a }, { x: vx * b, y: vy * b, duration: S.dur, ease: 'none' }, 0);
    }
    const t0 = TONE[S.tone] || TONE.nominal;
    tl.set(P + 'wp-ember', { opacity: t0[0] }, 0);
    tl.set(P + 'wp-green', { opacity: t0[1] }, 0);
  }
  // colour flood of the ground: ~1 s power2.inOut (the hero stays, the light changes)
  function tone(tl, P, from, to, at, dur = 1.0) {
    const a = TONE[from] || TONE.nominal, b = TONE[to] || TONE.nominal;
    tl.fromTo(P + 'wp-ember', { opacity: a[0] }, { opacity: b[0], duration: dur, ease: 'power2.inOut', immediateRender: false }, at);
    tl.fromTo(P + 'wp-green', { opacity: a[1] }, { opacity: b[1], duration: dur, ease: 'power2.inOut', immediateRender: false }, at);
  }

  // ---------------------------------------------------------------- titles (never fade + slide-up)
  const ws = (sel) => (Array.isArray(sel) ? sel : $$(sel + ' .w'));
  // per word: blur 6 -> 0 and opacity 0 -> 1 in 0.13 s, 0.067 s apart, no translate
  function blurWords(tl, sel, at, o = {}) {
    const list = ws(sel);
    list.forEach((w, i) => {
      const t = o.times ? o.times[Math.min(i, o.times.length - 1)] : at + i * (o.stagger ?? 0.067);
      tl.fromTo(w, { opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', duration: o.dur ?? 0.13, ease: 'power2.out' }, t);
    });
    return at + (list.length - 1) * (o.stagger ?? 0.067) + 0.13;
  }
  // per word from light grey to ink, 0.085 s apart, or on the voice's own word times (o.times)
  function inkWords(tl, sel, at, o = {}) {
    const list = ws(sel);
    list.forEach((w, i) => {
      const t = o.times ? o.times[Math.min(i, o.times.length - 1)] : at + i * (o.stagger ?? 0.085);
      const to = w.classList.contains('acc') ? ORANGE : w.classList.contains('safe-c') ? GREEN : o.to ?? INK;
      tl.fromTo(w, { color: o.from ?? INK4 }, { color: to, duration: o.dur ?? 0.14, ease: 'power1.out' }, t);
    });
  }
  // the whole line blurring in: 8 px -> 0 in 0.18 s
  function blurLine(tl, sel, at, o = {}) {
    tl.fromTo(sel, { opacity: 0, filter: `blur(${o.blur ?? 8}px)` }, { opacity: o.opacity ?? 1, filter: 'blur(0px)', duration: o.dur ?? 0.18, ease: 'power2.out' }, at);
  }
  // per letter (a name): 0.06 s apart, opacity 0.25 -> 1 with a slight blur
  function letters(tl, sel, at, o = {}) {
    $$(sel + ' .l').forEach((l, i) => tl.fromTo(l, { opacity: 0.2, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.16, ease: 'power2.out' }, at + i * (o.stagger ?? 0.06)));
  }
  // exit: blur-out and fade, 0.13-0.25 s (word by word with o.stagger)
  function out(tl, sel, at, o = {}) {
    const list = o.words ? ws(sel) : [sel];
    list.forEach((el, i) => tl.to(el, { opacity: 0, filter: `blur(${o.blur ?? 8}px)`, duration: o.dur ?? 0.2, ease: 'power2.in' }, at + i * (o.stagger ?? 0)));
  }
  // an object lands: depth, not a slide (scale 0.94 -> 1, blur 10 -> 0, expo.out)
  function land(tl, sel, at, o = {}) {
    tl.fromTo(sel, { opacity: 0, scale: o.from ?? 0.94, filter: `blur(${o.blur ?? 10}px)` }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: o.dur ?? 0.55, ease: o.ease ?? 'expo.out' }, at);
    if (o.clearFilter !== false) tl.set(sel, { filter: 'none' }, at + (o.dur ?? 0.55) + 0.01);
  }
  // glass lands: opacity on the pane itself (never on a wrapper, which would cut its backdrop), scale settle
  function glassIn(tl, sel, at, o = {}) {
    tl.fromTo(sel, { opacity: 0, scale: o.from ?? 0.96 }, { opacity: 1, scale: 1, duration: o.dur ?? 0.5, ease: o.ease ?? 'expo.out' }, at);
  }
  // a chip / number landing: pop
  function pop(tl, sel, at, o = {}) {
    tl.fromTo(sel, { opacity: 0, scale: o.from ?? 0.82 }, { opacity: 1, scale: 1, duration: o.dur ?? 0.42, ease: 'back.out(1.6)' }, at);
  }
  // number count-up: 1.4 s expo.out, then it holds
  function count(tl, sel, from, to, at, o = {}) {
    const el = $(sel), dec = o.dec ?? 1, st = { v: from };
    el.textContent = from.toFixed(dec);
    tl.fromTo(st, { v: from }, { v: to, duration: o.dur ?? 1.4, ease: o.ease ?? 'expo.out', onUpdate: () => { el.textContent = st.v.toFixed(dec); } }, at);
  }

  // ---------------------------------------------------------------- camera on a wrapper (never on the media)
  // key: {t, u, v, z} puts footage point (u, v) (0..1 of ctx.screen, in world px) at frame point (fx, fy) at scale z;
  //      {t, x, y, z} the same for a world point; {t, home: true} the identity. d = move seconds (0 = hard cut).
  function camState(k, ctx = {}) {
    if (k.home) return { x: 0, y: 0, scale: 1 };
    const s = k.z ?? 1;
    let cx = k.x, cy = k.y;
    if (k.u !== undefined) { const r = ctx.screen; cx = r.x + k.u * r.w; cy = r.y + k.v * r.h; }
    return { x: (k.fx ?? W / 2) - cx * s, y: (k.fy ?? H / 2) - cy * s, scale: s };
  }
  function cam(tl, sel, keys, ctx = {}) {
    if (!keys || !keys.length) return;
    let prev = camState(keys[0], ctx);
    tl.set(sel, { ...prev, transformOrigin: '0 0' }, 0);
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i], st = camState(k, ctx), d = k.d ?? 0.6;
      if (d <= 0) tl.set(sel, st, k.t);
      else tl.fromTo(sel, prev, { ...st, duration: d, ease: k.ease ?? 'power2.inOut', immediateRender: false }, k.t);
      prev = st;
    }
  }
  // the scale the camera holds at time t (for callouts drawn at a constant on-screen size)
  function camScaleAt(keys, t) {
    let s = keys && keys.length ? keys[0].home ? 1 : keys[0].z ?? 1 : 1;
    for (const k of keys || []) if (k.t <= t + 1e-6) s = k.home ? 1 : k.z ?? 1;
    return s;
  }

  // ---------------------------------------------------------------- cursor (only where the footage has none)
  // keys [{t, x, y, click}] in the cursor's own parent coordinates; a move ends at t; a click presses at t
  function cursor(tl, sel, keys) {
    if (!keys || !keys.length) return;
    tl.set(sel, { x: keys[0].x, y: keys[0].y, scale: 1, opacity: 1 }, 0);
    let px = keys[0].x, py = keys[0].y;
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i], d = k.d ?? 0.55;
      tl.fromTo(sel, { x: px, y: py }, { x: k.x, y: k.y, duration: d, ease: k.ease ?? 'power2.inOut', immediateRender: false }, k.t - d);
      if (k.click) {
        tl.to(sel, { scale: 0.84, duration: 0.07, ease: 'power2.out' }, k.t);
        tl.to(sel, { scale: 1, duration: 0.14, ease: 'power2.out' }, k.t + 0.08);
      }
      px = k.x; py = k.y;
    }
  }

  // ---------------------------------------------------------------- transitions with a cause
  // A scene's `in` is the previous scene's `out` (film.config.mjs). Layers: #P-stage > #P-wall, #P-whip > #P-settle >
  // #P-cam, and #P-fx (fill, zoom, ghost). Types: cut | blur | whip | zoom | iris | morph.
  function enter(tl, P, T, o = {}) {
    if (!T || T.type === 'cut') return;
    const whip = P + 'whip';
    if (T.type === 'blur') {
      tl.fromTo(whip, { opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)', duration: T.dur, ease: 'power2.out' }, 0);
      tl.set(whip, { filter: 'none' }, T.dur + 0.01);
    } else if (T.type === 'whip') {
      // the arriving frame lands blurred and sharpens: 0.3 s power3.out, horizontal travel
      tl.fromTo(whip, { x: 760 * (T.dir ?? 1), filter: 'blur(20px)' }, { x: 0, filter: 'blur(0px)', duration: T.dur, ease: 'power3.out' }, 0);
      tl.set(whip, { filter: 'none' }, T.dur + 0.01);
      tl.fromTo(P + 'wall', { x: 90 * (T.dir ?? 1) }, { x: 0, duration: T.dur + 0.1, ease: 'power3.out' }, 0);
    } else if (T.type === 'zoom') {
      // the previous scene zoomed through a button; its fill is this frame's first frame, then the scene settles
      tl.fromTo(P + 'fx-fill', { opacity: 1, background: T.color }, { opacity: 0, duration: T.fadeDur ?? 0.34, ease: 'power1.out' }, 0.04);
      tl.fromTo(P + 'settle', { scale: 1.07 }, { scale: 1, duration: 0.8, ease: 'expo.out' }, 0);
    } else if (T.type === 'iris') {
      // clip-path circle opens from the clicked point onto this world; the previous host plays underneath
      tl.fromTo(P + 'stage', { clipPath: `circle(0px at ${T.x}px ${T.y}px)` }, { clipPath: `circle(2300px at ${T.x}px ${T.y}px)`, duration: T.dur, ease: 'power2.in' }, 0);
      tl.set(P + 'stage', { clipPath: 'none' }, T.dur + 0.01);
    } else if (T.type === 'morph') {
      morphIn(tl, P, T, o.morph || {});
    }
  }
  function exit(tl, P, S, o = {}) {
    const T = S.out, cut = S.cut;
    if (!T || ['cut', 'end', 'iris'].includes(T.type)) return;
    const whip = P + 'whip';
    if (T.type === 'blur') {
      tl.to(whip, { opacity: 0, filter: 'blur(12px)', duration: 0.18, ease: 'power2.in' }, cut - 0.18);
    } else if (T.type === 'whip') {
      tl.to(whip, { x: -760 * (T.dir ?? 1), filter: 'blur(20px)', duration: 0.24, ease: 'power3.in' }, cut - 0.24);
      tl.to(P + 'wall', { x: -90 * (T.dir ?? 1), duration: 0.24, ease: 'power3.in' }, cut - 0.24);
    } else if (T.type === 'zoom') {
      zoomOut(tl, P, T, cut);
    } else if (T.type === 'morph') {
      morphOut(tl, P, T, cut, o.morph || {});
    }
  }
  // zoom through a button: the content pushes into it while its fill grows past the frame, strong ease-in
  function zoomOut(tl, P, T, cut) {
    const [x, y, w, h, r] = T.rect || [W / 2 - 60, H / 2 - 60, 120, 120, 60], d = T.dur ?? 0.36;
    const z = P + 'fx-zoom', from = cut - d;
    tl.set(z, { background: T.color, opacity: 1 }, from);
    tl.fromTo(z, { clipPath: `inset(${y}px ${W - x - w}px ${H - y - h}px ${x}px round ${r}px)` },
      { clipPath: 'inset(-4px -4px -4px -4px round 0px)', duration: d, ease: 'power3.in', immediateRender: false }, from);
    tl.set(P + 'settle', { transformOrigin: `${x + w / 2}px ${y + h / 2}px` }, from);
    tl.fromTo(P + 'settle', { scale: 1 }, { scale: 2.6, duration: d, ease: 'power3.in', immediateRender: false }, from);
  }
  // glass pane morph, outgoing half: everything but the pane blurs out; the pane's own content leaves; the pane stays
  function morphOut(tl, P, T, cut, m) {
    const d = 0.28;
    (m.out || []).forEach((s) => tl.to(s, { opacity: 0, filter: 'blur(10px)', duration: d, ease: 'power2.in' }, cut - d - 0.04));
    (m.inner || []).forEach((s) => tl.to(s, { opacity: 0, filter: 'blur(6px)', duration: 0.18, ease: 'power2.in' }, cut - 0.2));
  }
  // incoming half: a glass ghost at the old pane's rect grows into this scene's target; the target sharpens inside it
  function morphIn(tl, P, T, m) {
    const g = P + 'fx-ghost', d = T.dur ?? 0.55;
    const [x0, y0, w0, h0, r0] = T.from || [W / 2 - 160, H / 2 - 40, 320, 80, 40];
    const [x1, y1, w1, h1, r1] = m.to || [160, 120, 1600, 900, 28];
    tl.fromTo(g, { opacity: 1, left: x0, top: y0, width: w0, height: h0, borderRadius: r0 },
      { left: x1, top: y1, width: w1, height: h1, borderRadius: r1, duration: d, ease: 'power3.inOut' }, 0);
    tl.to(g, { opacity: 0, duration: 0.22, ease: 'power1.out' }, d - 0.06);
    if (m.target) tl.fromTo(m.target, { opacity: 0, filter: 'blur(12px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out' }, d * 0.62);
    if (m.target) tl.set(m.target, { filter: 'none' }, d * 0.62 + 0.31);
    (m.after || []).forEach((s, i) => tl.fromTo(s, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.22, ease: 'power2.out' }, d + 0.05 + i * 0.07));
  }

  // ---------------------------------------------------------------- scene boilerplate
  function scene(tl, P, S, o = {}) {
    wall(tl, P, S);
    enter(tl, P, S.in, o);
    exit(tl, P, S, o);
  }

  return { $, $$, ORANGE, GREEN, INK, INK4, wall, tone, blurWords, inkWords, blurLine, letters, out, land, glassIn, pop, count,
    camState, cam, camScaleAt, cursor, enter, exit, zoomOut, morphIn, morphOut, scene };
})();
