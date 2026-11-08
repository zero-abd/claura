// The DFW-2 scene graph, for both looks. build once, then update(frame, view) is a pure function of its inputs:
// it writes every animated property from scratch each call (colours, matrices, uniforms), so the picture never
// depends on a previous frame.
//
//   look 'iso'   : near-black solids + hairline edges (fat lines, 1 CSS px); only live things glow
//   look 'lumen' : lit PBR solids, soft shadows, studio environment, emissive accents
//
// Units are metres, y up. See layout.js for the site plan.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, sstep, easeInOutSine, easeInQuart, mulberry32, hash01, shimmer } from './util.js';
import {
  RACK, HALL, SLAB_Y, PLINTH, HALL_CENTERS, HALL_IDS, RACKS, B14, C05, C12, HUB, BLADES, BLADE_H,
  bladeY, BLADE_Y0, frontZ, HOST, SUSPECT_CELL, GUEST_CELLS, hostCellPos, MIGRATION, topSlotPos, linkPoints, CONDUITS,
  RACK_BY_ID, hostId, bladeAt, parseHost, hostSlot,
} from './layout.js';

const ORANGE = new THREE.Color('#FF5A1F');
const GREEN = new THREE.Color('#2FBF71');
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const tmpC = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const ID_Q = new THREE.Quaternion();

// ------------------------------------------------------------------ palettes

const PAL = {
  iso: {
    bg: '#06080c',
    fill: '#1b2431', plinth: '#141b26', slab: '#18202c', aisle: '#10161f', hub: '#1b2431',
    line: '#4b5d76', lineDim: '#212c3b', lineFaint: '#161e29', lineHot: '#7d93b3',
    cool: [0.30, 0.58, 0.96], off: [0.05, 0.075, 0.11],
    label: '#93a5bd',
  },
  lumen: {
    bg: '#0c0f14',
    rack: '#7d8591', panel: '#07090d', blade: '#20262f', plinth: '#171b22', slab: '#1d222a', aisle: '#12151a', hub: '#8d95a1',
    cool: [0.55, 0.86, 1.0], off: [0.035, 0.05, 0.075],
    label: '#e9eef6',
  },
};

// ------------------------------------------------------------------ small builders

class LineBank {
  constructor() { this.p = []; this.c = []; }
  seg(a, b, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]); this.c.push(col.r, col.g, col.b, col.r, col.g, col.b); return this; }
  poly(pts, col, close = false) {
    for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1], col);
    if (close) this.seg(pts[pts.length - 1], pts[0], col);
    return this;
  }
  box(x0, x1, y0, y1, z0, z1, col, only) {
    const P = (x, y, z) => [x, y, z];
    const c = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const keep = only ?? e.map((_, i) => i);
    for (const i of keep) this.seg(c[e[i][0]], c[e[i][1]], col);
    return this;
  }
  get count() { return this.p.length / 6; }
  build(material, withColors = true) {
    const g = new LineSegmentsGeometry();
    g.setPositions(this.p);
    if (withColors) g.setColors(this.c);
    const m = new LineSegments2(g, material);
    m.frustumCulled = false;
    return m;
  }
}

function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function glowTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.04)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function hazardTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#12151a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#FF5A1F';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + h, h); g.lineTo(i * 32 + h, h);
      g.closePath(); g.fill();
    }
  }, { repeat: true });
}

function gridTexture(cell = 64, line = 'rgba(255,255,255,0.045)') {
  return canvasTex(cell, cell, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: true });
}

const SHELL_VS = /* glsl */`
  uniform vec3 uHalf;
  varying vec3 vL; varying float vY;
  void main() {
    vL = position / uHalf;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SHELL_FS = /* glsl */`
  uniform vec3 uColor; uniform float uHot, uLevel, uT, uFill, uEdge;
  varying vec3 vL; varying float vY;
  void main() {
    vec3 q = abs(vL);
    float m1 = max(q.x, max(q.y, q.z));
    float m3 = min(q.x, min(q.y, q.z));
    float m2 = q.x + q.y + q.z - m1 - m3;
    float edge = smoothstep(0.7, 1.0, m2);
    float band = 1.0 - abs(fract(vY * 0.42 - uT * 0.22) - 0.5) * 2.0;
    band = smoothstep(0.55, 1.0, band);
    float vgrad = 0.6 + 0.4 * smoothstep(0.0, 2.4, vY);
    float a = uFill * (0.5 + 0.5 * band) * vgrad + uEdge * edge;
    float below = 1.0 - smoothstep(uLevel - 0.03, uLevel + 0.03, vY);
    float meniscus = exp(-pow((vY - uLevel) / 0.045, 2.0)) * step(uLevel, 3.0) * step(0.1, uLevel);
    a = a * below + meniscus * uEdge * 1.4;
    gl_FragColor = vec4(uColor, a * uHot);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const RING_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = /* glsl */`
  uniform vec3 uColor; uniform float uR, uW, uA, uMax;
  varying vec2 vUv;
  void main() {
    float d = length(vUv * 2.0 - 1.0) * uMax;
    float x = abs(d - uR);
    float a = (1.0 - smoothstep(0.0, uW, x)) * uA;
    a *= 1.0 - smoothstep(0.85 * uMax, uMax, d);
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const WIRE_VS = /* glsl */`
  uniform float uR0, uK;
  varying float vU; varying vec3 vN;
  void main() {
    vU = uv.x; vN = normal;
    vec3 c = position - normal * uR0;           // centre line
    vec3 p = c + normal * uR0 * uK;             // radius rescaled so the wire keeps its on-screen width
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const WIRE_FS = /* glsl */`
  uniform vec3 uColor; uniform float uA, uB, uT, uGlow, uBase, uPulse, uFreq, uDir;
  varying float vU; varying vec3 vN;
  void main() {
    if (vU < uA || vU > uB) discard;
    float ph = vU * uFreq - uT * uDir;
    float p = smoothstep(0.82, 1.0, sin(ph * 6.2831853) * 0.5 + 0.5);
    float head = exp(-pow((uB - vU) / 0.025, 2.0)) * step(uB, 0.999);
    float k = uBase + uPulse * p + head * 1.4;
    float al = uGlow > 0.0 ? uGlow * (0.6 + 0.8 * p + head) : 1.0;
    gl_FragColor = vec4(uColor * k, al);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ world

export function buildWorld({ look = 'iso', lineWidth = 1.25 } = {}) {
  const ISO = look === 'iso';
  const P = ISO ? PAL.iso : PAL.lumen;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 300);
  const lineMats = [];
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const cool = new THREE.Color().setRGB(...P.cool, THREE.LinearSRGBColorSpace);
  const off = new THREE.Color().setRGB(...P.off, THREE.LinearSRGBColorSpace);
  const glowTex = track(glowTexture());

  const lineMat = (opts = {}) => {
    const m = new LineMaterial({ linewidth: lineWidth, worldUnits: false, vertexColors: false, ...opts });
    lineMats.push(m);
    return m;
  };

  // ---------------------------------------------------------------- lights
  let keyLight = null, orangeLight = null, haloLight = null;
  if (ISO) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.55 * Math.PI));
    const d = new THREE.DirectionalLight(0xffffff, 0.75 * Math.PI);
    d.position.set(-5, 8, 6);
    scene.add(d);
  } else {
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f28, 0.35));
    keyLight = new THREE.DirectionalLight(0xfff4e8, 2.9);
    keyLight.position.set(-11, 19, 13);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    const sc = keyLight.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 4; sc.far = 70;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0x9db6ff, 0.55);
    fill.position.set(14, 7, -8);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc8d8ff, 0.5);
    rim.position.set(4, 5, 18);
    scene.add(rim);
    haloLight = new THREE.PointLight(0xff5a1f, 0, 8, 1.4);
    haloLight.position.set(B14.x, SLAB_Y + RACK.h + 0.6, B14.z + 0.3);
    scene.add(haloLight);
    orangeLight = new THREE.PointLight(0xff5a1f, 0, 9, 1.6);
    orangeLight.position.set(B14.x, 1.6, frontZ(B14) + 0.9);
    scene.add(orangeLight);
  }

  // ---------------------------------------------------------------- materials
  const polyOff = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const M = {};
  if (ISO) {
    M.plinth = new THREE.MeshLambertMaterial({ color: P.plinth, ...polyOff });
    M.slab = new THREE.MeshLambertMaterial({ color: P.slab, ...polyOff });
    M.aisle = new THREE.MeshLambertMaterial({ color: P.aisle, ...polyOff });
    M.rack = new THREE.MeshLambertMaterial({ color: P.fill, ...polyOff });
    M.hub = new THREE.MeshLambertMaterial({ color: P.hub, ...polyOff });
    M.chassis = new THREE.MeshLambertMaterial({ color: '#232d3c', ...polyOff });
    M.plate = new THREE.MeshLambertMaterial({ color: '#1f2733', ...polyOff });
  } else {
    M.plinth = new THREE.MeshStandardMaterial({ color: P.plinth, roughness: 0.55, metalness: 0.2 });
    M.slab = new THREE.MeshStandardMaterial({ color: P.slab, roughness: 0.5, metalness: 0.25 });
    M.aisle = new THREE.MeshStandardMaterial({ color: P.aisle, roughness: 0.6, metalness: 0.2 });
    M.rack = new THREE.MeshStandardMaterial({ color: P.rack, roughness: 0.3, metalness: 0.9 });
    M.panel = new THREE.MeshStandardMaterial({ color: P.panel, roughness: 0.18, metalness: 0.5 });
    M.blade = new THREE.MeshStandardMaterial({ color: P.blade, roughness: 0.4, metalness: 0.7 });
    M.hub = new THREE.MeshStandardMaterial({ color: P.hub, roughness: 0.36, metalness: 0.8 });
    M.chassis = new THREE.MeshStandardMaterial({ color: '#2a313b', roughness: 0.3, metalness: 0.8 });
    M.plate = new THREE.MeshStandardMaterial({ color: '#59616f', roughness: 0.3, metalness: 0.85, emissive: ORANGE, emissiveIntensity: 0 });
  }
  Object.values(M).forEach(track);

  const root = new THREE.Group();
  scene.add(root);
  const addMesh = (geo, mat, x, y, z, { cast = true, receive = true, parent = root } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = !ISO && cast;
    m.receiveShadow = !ISO && receive;
    parent.add(m);
    track(geo);
    return m;
  };
  const solidBox = (w, h, d, r = 0.0) => (ISO || r === 0 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 3, r));

  const bank = new LineBank(); // static hairlines (iso only)
  const cLine = new THREE.Color(P.line), cDim = new THREE.Color(P.lineDim), cFaint = new THREE.Color(P.lineFaint), cHi = new THREE.Color(P.lineHot);

  // ---------------------------------------------------------------- plinth + halls + hub
  const plinthH = PLINTH.depth;
  addMesh(solidBox(PLINTH.hx * 2, plinthH, PLINTH.hz * 2, 0.16), M.plinth, 0, -plinthH / 2, 0);
  if (ISO) {
    bank.box(-PLINTH.hx, PLINTH.hx, -plinthH, 0, -PLINTH.hz, PLINTH.hz, cLine, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // faint floor grid on the corridors
    for (let x = -PLINTH.hx + 1; x < PLINTH.hx; x += 1) bank.seg([x, 0.002, -PLINTH.hz], [x, 0.002, PLINTH.hz], cFaint);
    for (let z = -PLINTH.hz + 1; z < PLINTH.hz; z += 1) bank.seg([-PLINTH.hx, 0.002, z], [PLINTH.hx, 0.002, z], cFaint);
  } else {
    const gt = track(gridTexture(64, 'rgba(255,255,255,0.05)'));
    gt.repeat.set(PLINTH.hx * 2, PLINTH.hz * 2);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(PLINTH.hx * 2 - 0.3, PLINTH.hz * 2 - 0.3), new THREE.MeshStandardMaterial({ map: gt, transparent: true, roughness: 0.6, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.003; top.receiveShadow = true;
    root.add(top);
    track(top.geometry); track(top.material);
  }

  // halls
  for (const id of HALL_IDS) {
    const [hx, hz] = HALL_CENTERS[id];
    addMesh(solidBox(HALL.len, SLAB_Y, HALL.wid, 0.05), M.slab, hx, SLAB_Y / 2, hz, { cast: false });
    // hot aisle strip between the two rows
    addMesh(new THREE.BoxGeometry(HALL.len - 0.5, 0.012, 1.0 - 0.08), M.aisle, hx, SLAB_Y + 0.006, hz, { cast: false });
    if (ISO) {
      bank.box(hx - HALL.len / 2, hx + HALL.len / 2, 0, SLAB_Y, hz - HALL.wid / 2, hz + HALL.wid / 2, cLine, [0, 1, 2, 3, 4, 5, 6, 7]);
      // raised-floor tile lines
      for (let x = hx - HALL.len / 2 + 0.6; x < hx + HALL.len / 2 - 0.1; x += 0.6) bank.seg([x, SLAB_Y + 0.002, hz - HALL.wid / 2], [x, SLAB_Y + 0.002, hz + HALL.wid / 2], cFaint);
      for (let z = hz - HALL.wid / 2 + 0.6; z < hz + HALL.wid / 2 - 0.1; z += 0.6) bank.seg([hx - HALL.len / 2, SLAB_Y + 0.002, z], [hx + HALL.len / 2, SLAB_Y + 0.002, z], cFaint);
      // aisle outline
      bank.poly([[hx - HALL.len / 2 + 0.25, SLAB_Y + 0.014, hz - 0.46], [hx + HALL.len / 2 - 0.25, SLAB_Y + 0.014, hz - 0.46], [hx + HALL.len / 2 - 0.25, SLAB_Y + 0.014, hz + 0.46], [hx - HALL.len / 2 + 0.25, SLAB_Y + 0.014, hz + 0.46]], cDim, true);
      // compartment rim (low wall) hairline
      const rimY = SLAB_Y + 0.2;
      bank.poly([[hx - HALL.len / 2 + 0.12, rimY, hz - HALL.wid / 2 + 0.12], [hx + HALL.len / 2 - 0.12, rimY, hz - HALL.wid / 2 + 0.12], [hx + HALL.len / 2 - 0.12, rimY, hz + HALL.wid / 2 - 0.12], [hx - HALL.len / 2 + 0.12, rimY, hz + HALL.wid / 2 - 0.12]], cDim, true);
    } else {
      const gt = track(gridTexture(64, 'rgba(255,255,255,0.035)'));
      gt.repeat.set(HALL.len / 0.6, HALL.wid / 0.6);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(HALL.len - 0.1, HALL.wid - 0.1), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      top.rotation.x = -Math.PI / 2; top.position.set(hx, SLAB_Y + 0.002, hz);
      root.add(top); track(top.geometry); track(top.material);
      // low perimeter rim (compartment wall)
      const rimM = M.hub;
      const t = 0.07, rh = 0.12;
      addMesh(new THREE.BoxGeometry(HALL.len, rh, t), rimM, hx, SLAB_Y + rh / 2, hz - HALL.wid / 2 + t / 2, { cast: false });
      addMesh(new THREE.BoxGeometry(HALL.len, rh, t), rimM, hx, SLAB_Y + rh / 2, hz + HALL.wid / 2 - t / 2, { cast: false });
      addMesh(new THREE.BoxGeometry(t, rh, HALL.wid - 2 * t), rimM, hx - HALL.len / 2 + t / 2, SLAB_Y + rh / 2, hz, { cast: false });
      addMesh(new THREE.BoxGeometry(t, rh, HALL.wid - 2 * t), rimM, hx + HALL.len / 2 - t / 2, SLAB_Y + rh / 2, hz, { cast: false });
    }
  }

  // hub (management / BMC zone)
  const hubBase = HUB.base, hubCore = HUB.core, hubCrown = HUB.crown;
  addMesh(solidBox(hubBase[0], hubBase[1], hubBase[2], 0.06), M.hub, HUB.x, hubBase[1] / 2, HUB.z);
  addMesh(solidBox(hubCore[0], hubCore[1], hubCore[2], 0.05), M.hub, HUB.x, hubBase[1] + hubCore[1] / 2, HUB.z);
  addMesh(solidBox(hubCrown[0], hubCrown[1], hubCrown[2], 0.04), M.hub, HUB.x, hubBase[1] + hubCore[1] + hubCrown[1] / 2, HUB.z);
  const hubTop = hubBase[1] + hubCore[1] + hubCrown[1];
  const masts = [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]];
  masts.forEach(([mx, mz], i) => addMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9 + (i % 2) * 0.35, 8), M.hub, HUB.x + mx, hubTop + 0.45 + (i % 2) * 0.17, HUB.z + mz, { receive: false }));
  if (ISO) {
    bank.box(-hubBase[0] / 2, hubBase[0] / 2, 0, hubBase[1], -hubBase[2] / 2, hubBase[2] / 2, cLine);
    bank.box(-hubCore[0] / 2, hubCore[0] / 2, hubBase[1], hubBase[1] + hubCore[1], -hubCore[2] / 2, hubCore[2] / 2, cLine);
    bank.box(-hubCrown[0] / 2, hubCrown[0] / 2, hubBase[1] + hubCore[1], hubTop, -hubCrown[2] / 2, hubCrown[2] / 2, cLine);
    masts.forEach(([mx, mz], i) => bank.seg([mx, hubTop, mz], [mx, hubTop + 0.9 + (i % 2) * 0.35, mz], cLine));
  }

  // ---------------------------------------------------------------- racks (instanced)
  const N = RACKS.length;
  const rackGeo = ISO ? new THREE.BoxGeometry(RACK.w, RACK.h, RACK.d) : new RoundedBoxGeometry(RACK.w, RACK.h, RACK.d, 3, 0.022);
  track(rackGeo);
  const rackMesh = new THREE.InstancedMesh(rackGeo, M.rack, N);
  rackMesh.castShadow = !ISO; rackMesh.receiveShadow = !ISO; rackMesh.frustumCulled = false;
  const rackCol = new Float32Array(N * 3).fill(1);
  RACKS.forEach((r, i) => {
    tmpM.makeTranslation(r.x, SLAB_Y + RACK.h / 2, r.z);
    rackMesh.setMatrixAt(i, tmpM);
    rackMesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
  });
  root.add(rackMesh);

  // front glass panels + blades (lumen only; iso uses hairlines)
  if (!ISO) {
    const panelGeo = track(new RoundedBoxGeometry(RACK.w - 0.08, RACK.h - 0.22, 0.02, 2, 0.006));
    const panels = new THREE.InstancedMesh(panelGeo, M.panel, N);
    panels.frustumCulled = false; panels.receiveShadow = true;
    RACKS.forEach((r, i) => { tmpM.makeTranslation(r.x, SLAB_Y + RACK.h / 2 - 0.01, frontZ(r) + r.f * 0.004); panels.setMatrixAt(i, tmpM); });
    root.add(panels);
    const bladeGeo = track(new RoundedBoxGeometry(0.5, BLADE_H * 0.78, 0.02, 2, 0.004));
    const blades = new THREE.InstancedMesh(bladeGeo, M.blade, N * BLADES);
    blades.frustumCulled = false; blades.receiveShadow = true;
    let bi = 0;
    for (const r of RACKS) for (let b = 0; b < BLADES; b++) { tmpM.makeTranslation(r.x, bladeY(b), frontZ(r) + r.f * 0.018); blades.setMatrixAt(bi++, tmpM); }
    root.add(blades);
  }

  // rack hairlines
  if (ISO) {
    for (const r of RACKS) {
      const x0 = r.x - RACK.w / 2, x1 = r.x + RACK.w / 2, z0 = r.z - RACK.d / 2, z1 = r.z + RACK.d / 2;
      bank.box(x0, x1, SLAB_Y, SLAB_Y + RACK.h, z0, z1, cLine);
      const zf = frontZ(r) + r.f * 0.002;
      for (let b = 0; b <= BLADES; b++) {
        const y = SLAB_Y + BLADE_Y0 + b * BLADE_H;
        bank.seg([x0 + 0.05, y, zf], [x1 - 0.05, y, zf], b === 0 || b === BLADES ? cDim : cFaint);
      }
      bank.seg([x0 + 0.05, SLAB_Y + BLADE_Y0, zf], [x0 + 0.05, SLAB_Y + BLADE_Y0 + BLADES * BLADE_H, zf], cFaint);
      bank.seg([x1 - 0.05, SLAB_Y + BLADE_Y0, zf], [x1 - 0.05, SLAB_Y + BLADE_Y0 + BLADES * BLADE_H, zf], cFaint);
    }
  }

  // ---------------------------------------------------------------- B14 host chassis + bay
  const zf14 = frontZ(B14);
  const chTop = bladeY(HOST.blades[0]) - BLADE_H / 2 + 0.008, chBot = bladeY(HOST.blades[2]) + BLADE_H / 2 - 0.008;
  const chassisH = chBot - chTop;
  const chassis = addMesh(new THREE.BoxGeometry(HOST.w + 0.04, chassisH, HOST.protrude), M.chassis, B14.x, (chTop + chBot) / 2, zf14 + HOST.protrude / 2, { cast: false });
  let hostLines = null, hotLines = null;
  const hostLineMat = ISO ? lineMat({ color: ORANGE, transparent: true, opacity: 0 }) : null;
  const hotLineMat = ISO ? lineMat({ color: ORANGE, transparent: true, opacity: 0 }) : null;
  if (ISO) {
    const hb = new LineBank();
    hb.box(B14.x - HOST.w / 2 - 0.02, B14.x + HOST.w / 2 + 0.02, chTop, chBot, zf14, zf14 + HOST.protrude, ORANGE);
    hostLines = hb.build(hostLineMat, false); root.add(hostLines);
    const rb = new LineBank();
    rb.box(B14.x - RACK.w / 2, B14.x + RACK.w / 2, SLAB_Y, SLAB_Y + RACK.h, B14.z - RACK.d / 2, B14.z + RACK.d / 2, ORANGE);
    hotLines = rb.build(hotLineMat, false); root.add(hotLines);
  }

  // glow shell on B14 and hub core (custom additive shader)
  const shellUniforms = () => ({ uColor: { value: ORANGE.clone() }, uHot: { value: 0 }, uLevel: { value: 99 }, uT: { value: 0 }, uFill: { value: 0.5 }, uEdge: { value: 1 }, uHalf: { value: new THREE.Vector3() } });
  function makeShell(w, h, d, x, y, z, fill, edge) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.ShaderMaterial({ uniforms: shellUniforms(), vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.uniforms.uHalf.value.set(w / 2, h / 2, d / 2);
    mat.uniforms.uFill.value = fill; mat.uniforms.uEdge.value = edge;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.renderOrder = 5;
    root.add(m); track(geo); track(mat);
    return m;
  }
  const rackShell = makeShell(RACK.w + 0.05, RACK.h + 0.05, RACK.d + 0.05, B14.x, SLAB_Y + RACK.h / 2, B14.z, ISO ? 0.2 : 0.42, ISO ? 0.9 : 0.8);
  const hubShell = makeShell(hubCore[0] + 0.06, hubCore[1] + 0.06, hubCore[2] + 0.06, HUB.x, hubBase[1] + hubCore[1] / 2, HUB.z, ISO ? 0.2 : 0.4, ISO ? 0.9 : 0.8);

  // floor glow + halos
  const mkGlowPlane = (r, x, z) => {
    const geo = new THREE.PlaneGeometry(r * 2, r * 2);
    const mat = new THREE.MeshBasicMaterial({ map: glowTex, color: ORANGE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, SLAB_Y + 0.02, z); m.renderOrder = 4;
    root.add(m); track(geo); track(mat);
    return m;
  };
  const floorGlow = mkGlowPlane(3.4, B14.x, B14.z + 0.5);
  const hubGlowPlane = mkGlowPlane(3.0, HUB.x, HUB.z);
  hubGlowPlane.position.y = 0.025;
  const sealGlow = mkGlowPlane(2.6, B14.x, B14.z + 0.3);

  const sprites = [];
  const mkSprite = (color, size, x, y, z) => {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z); s.scale.set(size, size, 1); s.renderOrder = 20; s.frustumCulled = false;
    root.add(s); track(mat);
    sprites.push(s);
    return s;
  };
  const rackHalo = mkSprite(ORANGE, 4.2, B14.x, SLAB_Y + 1.1, B14.z);
  const vmHalo = mkSprite(ORANGE, 1.1, ...Object.values(hostCellPos(SUSPECT_CELL)).slice(0, 3));
  vmHalo.position.set(hostCellPos(SUSPECT_CELL).x, hostCellPos(SUSPECT_CELL).y, hostCellPos(SUSPECT_CELL).z + 0.05);
  const hubHalo = mkSprite(ORANGE, 4.0, HUB.x, 1.1, HUB.z);
  const linkHead = mkSprite(ORANGE, 0.9, 0, 0, 0);

  // ---------------------------------------------------------------- LED cells (one instanced mesh)
  const cellMeta = [];
  const cellMats = [];
  const pushCell = (kind, x, y, z, sx, sy, sz, ref = {}) => { cellMeta.push({ kind, x, y, z, ...ref }); cellMats.push([x, y, z, sx, sy, sz]); return cellMeta.length - 1; };
  const ledProt = ISO ? 0.004 : 0.026;
  RACKS.forEach((r) => {
    for (let b = 0; b < BLADES; b++) {
      for (let l = 0; l < 3; l++) {
        pushCell(0, r.x - 0.2 + l * 0.065, bladeY(b), frontZ(r) + r.f * ledProt, 0.032, 0.03, 0.008, { rack: r.index, id: r.index * 64 + b * 4 + l });
      }
    }
  });
  // hub BMC cells on the +x and +z faces of the core
  const hubCells = [];
  {
    const cols = 7, rows = 9, cw = hubCore[0] / (cols + 1), rh = hubCore[1] / (rows + 1);
    for (let c = 0; c < cols; c++) for (let rr = 0; rr < rows; rr++) {
      const y = hubBase[1] + rh * (rr + 1), u = -hubCore[0] / 2 + cw * (c + 1);
      hubCells.push(pushCell(1, HUB.x + u, y, HUB.z + hubCore[2] / 2 + 0.004, 0.06, 0.042, 0.008, { id: 90000 + c * 17 + rr }));
      hubCells.push(pushCell(1, HUB.x + hubCore[0] / 2 + 0.004, y, HUB.z + u, 0.008, 0.042, 0.06, { id: 91000 + c * 17 + rr }));
    }
  }
  // 12 VM cells on b14-gpu-07
  const vmCellIdx = [];
  for (let i = 0; i < 12; i++) {
    const c = hostCellPos(i);
    vmCellIdx.push(pushCell(2, c.x, c.y, c.z + 0.003, c.w, c.h, 0.006, { vm: i }));
  }
  // landing slots on top of C05 (6) and C12 (5)
  const slotIdx = [];
  MIGRATION.forEach((m) => {
    const rack = RACK_BY_ID[m.target];
    const p = topSlotPos(rack, m.slot);
    slotIdx.push(pushCell(3, p.x, p.y + 0.004, p.z, 0.14, 0.006, 0.3, { k: m.k, rackIdx: rack.index }));
  });

  const cellGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const cellMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: !ISO ? true : false });
  track(cellMat);
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, cellMeta.length);
  cells.frustumCulled = false;
  cellMats.forEach((c, i) => { tmpM.compose(tmpP.set(c[0], c[1], c[2]), ID_Q, tmpS.set(c[3], c[4], c[5])); cells.setMatrixAt(i, tmpM); cells.setColorAt(i, tmpC.setRGB(0, 0, 0)); });
  root.add(cells);
  const cellRate = cellMeta.map((m, i) => 0.22 + 0.95 * hash01(m.id ?? i, 7));

  // ---------------------------------------------------------------- wires (link + conduits), pulses
  const wireUniforms = (color, base, pulse, freq, dir, glow = 0, r0 = 0.02) => ({
    uR0: { value: r0 }, uK: { value: 1 }, uColor: { value: color.clone() }, uA: { value: 0 }, uB: { value: 1 }, uT: { value: 0 }, uGlow: { value: glow },
    uBase: { value: base }, uPulse: { value: pulse }, uFreq: { value: freq }, uDir: { value: dir },
  });
  const wireMat = (u, glow) => new THREE.ShaderMaterial({
    uniforms: u, vertexShader: WIRE_VS, fragmentShader: WIRE_FS, side: THREE.DoubleSide,
    transparent: !!glow, depthWrite: !glow, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const curve = new THREE.CatmullRomCurve3(linkPoints().map(V3), false, 'centripetal');
  const linkLen = curve.getLength();
  const linkRadius = ISO ? 0.02 : 0.03;
  const linkGeo = track(new THREE.TubeGeometry(curve, 260, linkRadius, 6, false));
  const linkU = wireUniforms(ORANGE, 1.0, 0.9, linkLen / 0.6, 1.4, 0, linkRadius);
  const linkMesh = new THREE.Mesh(linkGeo, track(wireMat(linkU, 0)));
  linkMesh.frustumCulled = false; linkMesh.renderOrder = 6;
  root.add(linkMesh);
  const linkGlowGeo = track(new THREE.TubeGeometry(curve, 260, linkRadius * 4.5, 8, false));
  const linkGU = wireUniforms(ORANGE, 0.9, 0.7, linkLen / 0.6, 1.4, ISO ? 0.1 : 0.16, linkRadius * 4.5);
  const linkGlow = new THREE.Mesh(linkGlowGeo, track(wireMat(linkGU, 1)));
  linkGlow.frustumCulled = false; linkGlow.renderOrder = 7;
  root.add(linkGlow);

  const conduitCool = cool.clone().multiplyScalar(ISO ? 0.55 : 0.5);
  const fillet = (pts, r = 0.28) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = V3(pts[i - 1]), b = V3(pts[i]), c = V3(pts[i + 1]);
      const da = a.clone().sub(b).normalize(), dc = c.clone().sub(b).normalize();
      out.push(b.clone().addScaledVector(da, r).toArray(), pts[i], b.clone().addScaledVector(dc, r).toArray());
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const conduits = CONDUITS.map((pts) => {
    const c = new THREE.CatmullRomCurve3(fillet(pts).map(V3), false, 'centripetal', 0.5);
    const len = c.getLength();
    const g = track(new THREE.TubeGeometry(c, 120, 0.016, 5, false));
    const u = wireUniforms(conduitCool, 0.28, 1.1, len / 1.4, -0.45, 0, 0.016);
    const mesh = new THREE.Mesh(g, track(wireMat(u, 0)));
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, u };
  });

  // pulse rings: face (vertical, in front of the host) and floor
  const mkRing = (rMax, orient) => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: ORANGE.clone() }, uR: { value: 0 }, uW: { value: 0.03 }, uA: { value: 0 }, uMax: { value: rMax } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rMax * 2, rMax * 2), mat);
    if (orient === 'floor') m.rotation.x = -Math.PI / 2;
    m.renderOrder = 8; m.frustumCulled = false;
    root.add(m); track(geo); track(m.geometry); track(mat);
    return m;
  };
  const vmPos = hostCellPos(SUSPECT_CELL);
  const faceRings = [0, 1, 2].map(() => { const r = mkRing(1.5, 'face'); r.position.set(vmPos.x, vmPos.y, zf14 + 0.07); return r; });
  const floorRings = [0, 1, 2].map(() => { const r = mkRing(4.6, 'floor'); r.position.set(B14.x, SLAB_Y + 0.03, B14.z + 0.3); return r; });
  const sealRing = mkRing(5.2, 'floor');
  sealRing.position.set(B14.x, SLAB_Y + 0.035, B14.z + 0.3);
  sealRing.material.uniforms.uColor.value.copy(GREEN);

  // ---------------------------------------------------------------- doors (bulkhead plates), lid, aura ring + seal bar
  const finH = 2.55, finT = 0.05, finLen = 1.5, finZc = B14.z + 0.25;
  const hazTex = track(hazardTexture());
  const plates = [];
  function makePlate(name, size, pos, strip, hatch, glass = false) {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    const mat = M.plate.clone(); track(mat);
    if (glass) { mat.transparent = true; mat.opacity = ISO ? 0.34 : 0.42; mat.depthWrite = false; mat.polygonOffset = false; if (!ISO) { mat.roughness = 0.12; mat.metalness = 0.6; } }
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(size[0], size[1], size[2])), mat);
    mesh.castShadow = !ISO; mesh.receiveShadow = !ISO;
    g.add(mesh);
    let lines = null, lmat = null;
    if (!ISO) {
      const t = hazTex.clone(); t.needsUpdate = true; track(t);
      const long = Math.max(strip.size[0], strip.size[1], strip.size[2]);
      t.repeat.set(Math.max(1, Math.round(long / 0.16)), 1);
      const sm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.2, emissive: ORANGE, emissiveMap: t, emissiveIntensity: 0.15 });
      track(sm);
      const s = new THREE.Mesh(track(new THREE.BoxGeometry(...strip.size)), sm);
      s.position.set(...strip.pos); s.castShadow = true;
      g.add(s);
    } else {
      const lb = new LineBank();
      const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
      lb.box(-hx, hx, -hy, hy, -hz, hz, ORANGE);
      for (const h of hatch) lb.seg(h[0], h[1], ORANGE);
      lmat = lineMat({ color: ORANGE, transparent: true, opacity: 1 });
      lines = lb.build(lmat, false);
      g.add(lines);
    }
    root.add(g);
    const p = { name, g, mat, lmat, base: new THREE.Vector3(...pos) };
    plates.push(p);
    return p;
  }
  const hatchLines = (n, fn) => { const out = []; for (let i = 0; i < n; i++) out.push(fn(i / (n - 1))); return out; };
  const P_ = RACK.pitch;
  // fins: stripes along the bottom band (y from -H/2 to -H/2+0.18)
  const finHatch = hatchLines(9, (k) => { const z = -finLen / 2 + k * finLen; return [[finT / 2 + 0.001, -finH / 2, z - 0.09], [finT / 2 + 0.001, -finH / 2 + 0.18, z + 0.09]]; });
  const fin1 = makePlate('d1', [finT, finH, finLen], [B14.x - P_ / 2, SLAB_Y + finH / 2, finZc], { pos: [0, -finH / 2 + 0.08, 0], size: [finT + 0.012, 0.16, finLen + 0.004] }, finHatch);
  const fin2 = makePlate('d2', [finT, finH, finLen], [B14.x + P_ / 2, SLAB_Y + finH / 2, finZc], { pos: [0, -finH / 2 + 0.08, 0], size: [finT + 0.012, 0.16, finLen + 0.004] }, finHatch);
  const frontW = P_ - 0.06, frontH = 2.12;
  const frontHatch = hatchLines(9, (k) => { const x = -frontW / 2 + k * frontW; return [[x - 0.08, frontH / 2 - 0.15, finT / 2 + 0.001], [x + 0.08, frontH / 2, finT / 2 + 0.001]]; });
  const door3 = makePlate('d3', [frontW, frontH, finT], [B14.x, SLAB_Y + frontH / 2, zf14 + 0.4], { pos: [0, frontH / 2 - 0.07, 0], size: [frontW, 0.14, finT + 0.012] }, frontHatch, true);
  const lidLen = finLen, lidT = 0.05, lidY = SLAB_Y + RACK.h + 0.06;
  const lidHatch = hatchLines(9, (k) => { const x = -frontW / 2 + k * frontW; return [[x - 0.08, lidT / 2 + 0.001, lidLen / 2 - 0.16], [x + 0.08, lidT / 2 + 0.001, lidLen / 2]]; });
  const lid = makePlate('lid', [frontW, lidT, lidLen], [B14.x, lidY, finZc], { pos: [0, 0, lidLen / 2 - 0.08], size: [frontW, lidT + 0.012, 0.16] }, lidHatch);

  // aura ring + seal bar, built from the Claura mark (open C ring, door bar closing its opening)
  const RING_R = 1.75, RING_r = (RING_R * 68) / 104, GAP = (40 * Math.PI) / 180;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, RING_R, GAP, Math.PI * 2 - GAP, false);
  ringShape.absarc(0, 0, RING_r, Math.PI * 2 - GAP, GAP, true);
  ringShape.closePath();
  const ringDepth = 0.1;
  const ringGeo = track(new THREE.ExtrudeGeometry(ringShape, { depth: ringDepth, bevelEnabled: !ISO, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 72 }));
  ringGeo.rotateX(-Math.PI / 2);
  const barW = 24 * RING_R / 104, barL = 72 * RING_R / 104, barX = 74 * RING_R / 104;
  const barShape = new THREE.Shape();
  barShape.absarc(0, barL / 2 - barW / 2, barW / 2, 0, Math.PI, false);
  barShape.absarc(0, -(barL / 2 - barW / 2), barW / 2, Math.PI, Math.PI * 2, false);
  barShape.closePath();
  const barGeo = track(new THREE.ExtrudeGeometry(barShape, { depth: ringDepth + 0.03, bevelEnabled: !ISO, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 32 }));
  barGeo.rotateX(-Math.PI / 2);
  const auraGroup = new THREE.Group();
  const HALO_Y = SLAB_Y + RACK.h + 0.95; // the aura floats above B14, clear of the tall racks that would hide a floor ring
  auraGroup.position.set(B14.x, HALO_Y, B14.z + 0.3);
  auraGroup.rotation.y = Math.PI / 4; // opening faces screen-right, exactly like the Claura mark
  root.add(auraGroup);
  let ringMat, barMat, ringLineMat = null, barLineMat = null;
  if (ISO) {
    ringMat = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    barMat = ringMat.clone();
  } else {
    ringMat = new THREE.MeshStandardMaterial({ color: '#1b1f26', emissive: ORANGE, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0 });
    barMat = ringMat.clone();
  }
  track(ringMat); track(barMat);
  const ringMesh = new THREE.Mesh(ringGeo, ringMat); ringMesh.castShadow = false; ringMesh.renderOrder = 3;
  const barMesh = new THREE.Mesh(barGeo, barMat); barMesh.renderOrder = 3;
  const barPivot = new THREE.Group(); barPivot.add(barMesh);
  auraGroup.add(ringMesh, barPivot);
  if (ISO) {
    const rb = new LineBank();
    const sp = ringShape.getPoints(96).map((p) => [p.x, ringDepth, -p.y]);
    rb.poly(sp, ORANGE, true);
    ringLineMat = lineMat({ color: ORANGE, transparent: true, opacity: 0 });
    const rl = rb.build(ringLineMat, false); auraGroup.add(rl);
    const bb = new LineBank();
    const bp = barShape.getPoints(48).map((p) => [p.x, ringDepth + 0.03, -p.y]);
    bb.poly(bp, ORANGE, true);
    barLineMat = lineMat({ color: ORANGE, transparent: true, opacity: 0 });
    barPivot.add(bb.build(barLineMat, false));
  }

  // ---------------------------------------------------------------- guest particles
  const rng = mulberry32(0xc1a02a);
  const guests = MIGRATION.map((m, k) => {
    const c = hostCellPos(m.cell);
    const rack = RACK_BY_ID[m.target];
    const slot = topSlotPos(rack, m.slot);
    const jx = (rng() - 0.5) * 0.5, ja = (rng() - 0.5) * 0.8, jz = (rng() - 0.5) * 0.6;
    const delay = k * 0.14 + rng() * 0.05, dur = 2.45 + rng() * 0.35;
    const p0 = new THREE.Vector3(c.x, c.y, c.z + 0.02);
    const p1 = new THREE.Vector3(c.x + jx, c.y + 2.4 + ja, c.z + 1.6 + jz * 0.4);
    const p3 = new THREE.Vector3(slot.x, slot.y + 0.08, slot.z);
    const p2 = new THREE.Vector3(slot.x - jx * 0.4, slot.y + 3.4 + ja * 0.6, slot.z - 1.0 + jz);
    return { m, k, delay, dur, bez: new THREE.CubicBezierCurve3(p0, p1, p2, p3), cell: vmCellIdx[m.cell], slotCell: slotIdx[k] };
  });
  const TRAIL = 6;
  const partGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: !ISO });
  track(partMat);
  const parts = new THREE.InstancedMesh(partGeo, partMat, guests.length * TRAIL);
  parts.frustumCulled = false; parts.renderOrder = 9;
  guests.forEach((_, i) => { for (let j = 0; j < TRAIL; j++) parts.setColorAt(i * TRAIL + j, tmpC.setRGB(1, 1, 1)); });
  root.add(parts);
  const ICE = new THREE.Color(ISO ? '#d6ebff' : '#e8f4ff');
  const guestHalos = guests.map(() => mkSprite(ICE, 1.15, 0, 0, 0));
  const landFlash = guests.map(() => mkSprite(ICE, 1.3, 0, 0, 0));

  // ---------------------------------------------------------------- labels
  const labels = [];
  const labelCache = new Map();
  const FONT = '-apple-system, "SF Pro Display", "SF Pro Text", Inter, "Helvetica Neue", Arial, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
  function labelTex(text, tone, noTick = false) {
    const key = text + '|' + tone + '|' + noTick;
    if (labelCache.has(key)) return labelCache.get(key);
    const S = 3;
    const probe = document.createElement('canvas').getContext('2d');
    const size = ISO ? 11 : 12.5;
    const font = ISO ? `600 ${size}px ${MONO}` : `600 ${size}px ${FONT}`;
    probe.font = font;
    const track_ = ISO ? 1.2 : 0.2;
    const txt = ISO && !/^[a-z]+\d*-/.test(text) ? text.toUpperCase() : text;
    const tw = probe.measureText(txt).width + track_ * txt.length;
    const padX = ISO ? 6 : 12, h = ISO ? 20 : 26, tick = noTick ? 0 : 16;
    const w = Math.ceil(tw + padX * 2 + (tone !== 'plain' ? 12 : 0)), H = h + tick;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * S); c.height = Math.ceil(H * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    const col = tone === 'hot' ? '#FF5A1F' : tone === 'ok' ? '#2FBF71' : P.label;
    if (!ISO) {
      g.fillStyle = 'rgba(14,17,22,0.72)';
      g.strokeStyle = tone === 'hot' ? 'rgba(255,90,31,0.55)' : tone === 'ok' ? 'rgba(47,191,113,0.55)' : 'rgba(255,255,255,0.16)';
      g.lineWidth = 1;
      g.beginPath(); g.roundRect(0.5, 0.5, w - 1, h - 1, h / 2); g.fill(); g.stroke();
    } else {
      g.strokeStyle = col; g.globalAlpha = 0.9; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0.5, h - 0.5); g.lineTo(0.5, 0.5); g.lineTo(w - 0.5, 0.5); g.lineTo(w - 0.5, h - 0.5); g.stroke();
      g.fillStyle = 'rgba(6,8,12,0.78)'; g.globalAlpha = 1; g.fillRect(1, 1, w - 2, h - 2);
    }
    g.strokeStyle = col; g.globalAlpha = tone === 'plain' ? 0.45 : 0.9; g.lineWidth = 1;
    if (!noTick) { g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, H); g.stroke(); }
    g.globalAlpha = 1;
    let x = padX;
    if (tone !== 'plain') { g.fillStyle = col; g.beginPath(); g.arc(padX + 3, h / 2, 3, 0, Math.PI * 2); g.fill(); x += 12; }
    g.font = font; g.fillStyle = ISO ? col : (tone === 'plain' ? '#e9eef6' : '#ffffff'); g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${track_}px`;
    g.fillText(txt, x, h / 2 + 0.5);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const r = { tex, w, h: H };
    labelCache.set(key, r);
    return r;
  }
  function addLabel(name, text, tone, anchor, vis, o = {}) {
    const t = labelTex(text, tone, o.noTick);
    const mat = new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.center.set(...(o.center || [0.5, 0]));
    s.position.set(anchor[0], anchor[1], anchor[2]);
    s.renderOrder = 100; s.frustumCulled = false;
    root.add(s);
    const L = { name, sprite: s, mat, text, tone, vis, tex: t };
    labels.push(L);
    track(mat);
    return L;
  }
  const hallLabel = (id, y = 3.1) => addLabel('hall' + id, 'Hall ' + id, 'plain', [HALL_CENTERS[id][0], y, HALL_CENTERS[id][1]], (H) => sstep(6.5, 8.5, H));
  HALL_IDS.forEach((id) => hallLabel(id));
  const title = addLabel('title', 'DFW-2 · 2,048 hosts', 'plain', [-9.4, 0.4, 6.9], (H) => sstep(11, 14, H));
  addLabel('hub', 'Mgmt / BMC', 'plain', [HUB.x, hubTop + 1.5, HUB.z], (H) => sstep(6.5, 8.5, H));
  const b14tag = addLabel('b14', 'B14', 'plain', [B14.x - 1.38, HALO_Y, B14.z + 0.3 + 1.38], () => 1, { noTick: true, center: [1, 0.5] });
  const c05 = addLabel('c05', 'C05', 'plain', [C05.x, SLAB_Y + RACK.h + 0.55, C05.z], () => 1);
  const c12 = addLabel('c12', 'C12', 'plain', [C12.x, SLAB_Y + RACK.h + 0.55, C12.z], () => 1);
  const hostLabel = addLabel('host', 'b14-gpu-07', 'plain', [B14.x - 0.5, chTop - 0.02, zf14 + 0.08], (H) => 1 - sstep(5.8, 7.2, H));
  const vmLabel = addLabel('vm', 'vm-7f3a', 'hot', [vmPos.x + 0.04, vmPos.y + 0.09, vmPos.z + 0.05], (H) => 1 - sstep(5.8, 7.2, H));
  const b14Texts = {
    plain: labelTex('B14', 'plain', true),
    breach: labelTex('B14 · breach', 'hot', true),
    containing: labelTex('B14 · containing', 'hot', true),
    approval: labelTex('B14 · awaiting approval', 'hot', true),
    sealed: labelTex('B14 · sealed', 'ok', true),
  };
  const setLabelTex = (L, t) => { if (L.tex !== t) { L.tex = t; L.mat.map = t.tex; L.mat.needsUpdate = true; } };
  title.sprite.center.set(0, 0);

  // background quad for lumen (soft studio gradient + pool of light); transparent mode skips it
  let bgMesh = null;
  if (!ISO) {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: new THREE.Color('#1a2029') }, uB: { value: new THREE.Color('#07090c') }, uC: { value: new THREE.Color('#2a323f') }, uAspect: { value: 1.6 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }',
      fragmentShader: `uniform vec3 uA, uB, uC; uniform float uAspect; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 p = (vUv - vec2(0.5, 0.47)) * vec2(uAspect, 1.0);
          float d = length(p);
          vec3 c = mix(uA, uB, smoothstep(0.1, 1.05, d));
          c += uC * 0.35 * exp(-d * d * 7.0);
          c += (h(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    bgMesh = new THREE.Mesh(geo, mat);
    bgMesh.frustumCulled = false; bgMesh.renderOrder = -1000;
    scene.add(bgMesh); track(geo); track(mat);
    // soft contact shadow under the plinth (reads on any background)
    const sg = new THREE.PlaneGeometry(PLINTH.hx * 2 + 9, PLINTH.hz * 2 + 9);
    const sm = new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.78)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
      transparent: true, depthWrite: false, color: 0x000000,
    });
    const sh = new THREE.Mesh(sg, sm); sh.rotation.x = -Math.PI / 2; sh.position.y = -plinthH - 0.35; sh.renderOrder = -500;
    scene.add(sh); track(sg); track(sm);
  }

  // static hairlines
  let staticLines = null;
  if (ISO) {
    const mat = lineMat({ vertexColors: true });
    staticLines = bank.build(mat, true);
    root.add(staticLines);
    track(staticLines.geometry);
  }

  // ---------------------------------------------------------------- picking + highlight (UI state, not part of the pure frame)
  const raycaster = new THREE.Raycaster();
  const unitBox = new LineBank();
  unitBox.box(-0.5, 0.5, -0.5, 0.5, -0.5, 0.5, new THREE.Color(1, 1, 1));
  const mkOutline = (color, wk, opacity) => {
    const mat = lineMat({ color: new THREE.Color(color), transparent: true, opacity, depthTest: false, depthWrite: false });
    mat.userData.wk = wk;
    const o = unitBox.build(mat, false);
    o.renderOrder = 60; o.visible = false;
    root.add(o);
    return o;
  };
  const outlines = {
    hover: { rack: mkOutline('#cfdcff', 1.0, 0.42), host: mkOutline('#ffffff', 1.25, 0.9) },
    select: { rack: mkOutline('#ffffff', 1.25, 0.7), host: mkOutline('#ffffff', 1.9, 1.0) },
  };
  const selHalo = mkSprite(new THREE.Color('#ffffff'), 1.1, 0, 0, 0);
  const highlighted = { hover: null, select: null };
  /** Outline a host (hover or selection). id = 'b14-gpu-07' or null to clear. Returns false for an unknown id. */
  function setHighlight(kind, id) {
    const o = outlines[kind];
    const p = id ? parseHost(id) : null;
    if (id && !p) return false;
    highlighted[kind] = p ? p.host : null;
    o.rack.visible = o.host.visible = !!p;
    if (kind === 'select') selHalo.visible = !!p;
    if (!p) return true;
    const r = p.rack, s = hostSlot(r, p.blade);
    o.rack.position.set(r.x, SLAB_Y + RACK.h / 2, r.z);
    o.rack.scale.set(RACK.w + 0.03, RACK.h + 0.03, RACK.d + 0.03);
    o.host.position.set(s.x, s.y, s.z);
    o.host.scale.set(s.w, s.h, s.d);
    if (kind === 'select') { selHalo.position.set(s.x, s.y, s.z + r.f * 0.1); selHalo.material.opacity = ISO ? 0.22 : 0.3; }
    return true;
  }
  /** Raycast (ndc coords, -1..1) against the racks. Returns { host, hall, rack, rackIndex, blade, point } or null. */
  function pick(nx, ny) {
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    const hits = raycaster.intersectObject(rackMesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    const r = RACKS[h.instanceId];
    if (!r) return null;
    const blade = bladeAt(h.point.y);
    return { host: hostId(r, blade), hall: r.hall, rack: r.id, rackIndex: r.index, blade, point: [h.point.x, h.point.y, h.point.z] };
  }

  // ---------------------------------------------------------------- per-frame update
  const keep = (v) => (v < 0 ? 0 : v);
  const bez = new THREE.Vector3();
  const hubC = new THREE.Color();
  const dirOut = new THREE.Vector3(1, 0, 0);

  function update(frame, view) {
    const { ch, T, bgTransparent } = frame;
    const H = view.H;
    const hotCol = ORANGE;

    // --- B14 body tint + glow shell
    const level = SLAB_Y + (RACK.h + 0.05) * (1 - ch.drain);
    const slowPulse = 0.5 + 0.5 * Math.sin((Math.PI * 2 * T) / 2.6 - 1.2);
    const fast = 0.5 + 0.5 * Math.sin(T * 7.0);
    const breachBeat = ch.pulseAmp * (0.82 + 0.18 * fast);
    const hot = ch.hot * (1 + 0.28 * ch.appr * (slowPulse - 0.4)) * (0.9 + 0.1 * breachBeat);
    const shellHot = hot * (ISO ? 0.8 : 1.0);
    const sh = rackShell.material.uniforms;
    sh.uHot.value = clamp(shellHot, 0, 1.6); sh.uLevel.value = ch.drain > 0.001 ? level : 99; sh.uT.value = T;
    rackShell.visible = shellHot > 0.004;
    rackMesh.setColorAt(B14.index, tmpC.setRGB(1 + 1.6 * hot, 1 - 0.25 * hot, 1 - 0.55 * hot));
    rackMesh.instanceColor.needsUpdate = true;
    if (ISO) {
      hotLineMat.opacity = clamp(hot * 1.05, 0, 1);
      hotLineMat.color.copy(ORANGE).lerp(GREEN, ch.green * 0.0);
      hostLineMat.opacity = clamp(ch.hyp * 1.0, 0, 1);
    }
    // hub shell
    const hubHot = ch.mgmt * (0.75 + 0.25 * fast);
    hubShell.material.uniforms.uHot.value = hubHot; hubShell.material.uniforms.uT.value = T; hubShell.visible = hubHot > 0.004;

    // --- glows
    floorGlow.material.opacity = clamp(hot, 0, 1.5) * (ISO ? 0.5 : 0.95);
    floorGlow.visible = floorGlow.material.opacity > 0.003;
    hubGlowPlane.material.opacity = hubHot * (ISO ? 0.4 : 0.8); hubGlowPlane.visible = hubGlowPlane.material.opacity > 0.003;
    rackHalo.material.opacity = clamp(hot, 0, 1.4) * (ISO ? 0.2 : 0.3);
    rackHalo.visible = rackHalo.material.opacity > 0.003;
    hubHalo.material.opacity = hubHot * (ISO ? 0.2 : 0.3); hubHalo.visible = hubHalo.material.opacity > 0.003;
    vmHalo.material.opacity = ch.sus * (0.55 + 0.35 * fast) * (ISO ? 0.8 : 0.9);
    vmHalo.visible = vmHalo.material.opacity > 0.003;
    if (orangeLight) orangeLight.intensity = (hot * 26 + 0) * (0.92 + 0.08 * fast);

    // --- LED cells
    const dim = 1 - 0.85 * ch.d3; // B14's own shimmer freezes as it is isolated
    const sealTone = hubC.copy(GREEN);
    for (let i = 0; i < cellMeta.length; i++) {
      const m = cellMeta[i];
      let r, g, b;
      if (m.kind === 0) {
        const v = shimmer(m.id, T, cellRate[i]);
        let lv = sstep(0.58, 0.9, v);
        const isB14 = m.rack === B14.index;
        if (isB14) lv *= dim;
        const base = 0.16 + 0.84 * lv;
        r = off.r + cool.r * base * 0.9; g = off.g + cool.g * base * 0.9; b = off.b + cool.b * base * 0.9;
        if (isB14) {
          const my = bladeY(Math.floor(((m.id % 64) / 4)));
          const mask = my < level ? 1 : 0;
          const hh = hot * mask;
          const fl = 0.7 + 0.3 * shimmer(m.id, T, 3.0 + cellRate[i]);
          r = lerp(r, 1.0 * fl * 1.1, clamp(hh)); g = lerp(g, 0.34 * fl, clamp(hh)); b = lerp(b, 0.1 * fl, clamp(hh));
        }
      } else if (m.kind === 1) {
        const v = shimmer(m.id, T, 0.8 + cellRate[i] * 0.8);
        const lv = 0.2 + 0.8 * sstep(0.45, 0.85, v);
        r = off.r + cool.r * lv; g = off.g + cool.g * lv; b = off.b + cool.b * lv;
        const hh = hubHot * (0.5 + 0.5 * shimmer(m.id, T, 4));
        r = lerp(r, 1.1, clamp(hh)); g = lerp(g, 0.33, clamp(hh)); b = lerp(b, 0.1, clamp(hh));
      } else if (m.kind === 2) {
        // host VM cell
        const alive = 0.55 + 0.45 * shimmer(100 + m.vm, T, 0.9);
        if (m.vm === SUSPECT_CELL) {
          const f = ch.sus * (0.8 + 0.3 * fast);
          const coolPart = (1 - ch.sus) * alive * (1 - ch.d3);
          r = 1.15 * f + cool.r * coolPart; g = 0.36 * f + cool.g * coolPart; b = 0.1 * f + cool.b * coolPart;
        } else {
          const gk = guests.findIndex((q) => q.m.cell === m.vm);
          const s = clamp((ch.mig - guests[gk].delay) / guests[gk].dur);
          const gone = sstep(0.0, 0.12, s);
          const a = alive * (1 - gone);
          // a faint orange tint on the host while the breach is live
          const tint = ch.hyp * 0.18 * (1 - gone);
          const kk = ISO ? 0.5 : 0.62;
          r = cool.r * a * kk + tint * 0.5; g = cool.g * a * kk + tint * 0.16; b = cool.b * a * kk;
        }
        if (m.vm === SUSPECT_CELL && ch.green > 0.01) { /* sealed: stays dark */ }
      } else {
        // landing slot on C05 / C12
        const gk = guests[m.k];
        const s = clamp((ch.mig - gk.delay) / gk.dur);
        const arrived = sstep(0.95, 1.0, s);
        const sinceArrive = keep(ch.mig - gk.delay - gk.dur);
        const flash = arrived * Math.exp(-sinceArrive / 0.5) * 1.6;
        const lv = arrived * (0.85 + flash);
        tmpM.compose(tmpP.set(m.x, m.y, m.z), ID_Q, tmpS.set(arrived > 0.001 ? 0.14 : 0, arrived > 0.001 ? 0.006 : 0, arrived > 0.001 ? 0.3 : 0));
        cells.setMatrixAt(i, tmpM);
        const sk = ISO ? 1 : 0.62;
        r = 0.012 + 0.78 * lv * sk; g = 0.019 + 0.9 * lv * sk; b = 0.032 + 1.0 * lv * sk;
      }
      cells.setColorAt(i, tmpC.setRGB(r, g, b));
    }
    cells.instanceColor.needsUpdate = true; cells.instanceMatrix.needsUpdate = true;

    // --- wires
    const lu = linkU;
    lu.uA.value = ch.linkA; lu.uB.value = ch.linkB; lu.uT.value = T;
    const lg = linkGU; lg.uA.value = ch.linkA; lg.uB.value = ch.linkB; lg.uT.value = T;
    const linkLive = ch.linkB - ch.linkA > 0.002;
    linkMesh.visible = linkLive; linkGlow.visible = linkLive;
    if (linkLive) {
      const hs = ch.linkB < 0.999 ? ch.linkB : (ch.linkA > 0.001 ? ch.linkA : 1);
      curve.getPointAt(clamp(hs), bez);
      linkHead.position.copy(bez);
      linkHead.material.opacity = (ch.linkB < 0.999 || ch.linkA > 0.001) ? 0.9 : 0;
      linkHead.visible = linkHead.material.opacity > 0.01;
    } else linkHead.visible = false;
    for (const c of conduits) { c.u.uT.value = T; c.u.uK.value = clamp((ISO ? 0.9 : 1.1) / view.ppm / 0.016, 0.12, 2.5); }
    {
      const rw = ISO ? 1.6 / view.ppm : clamp(2.4 / view.ppm, 0.011, 0.034);
      lu.uK.value = clamp(rw / linkRadius, 0.1, 3);
      lg.uK.value = clamp((ISO ? 6.5 : 9) / view.ppm / (linkRadius * 4.5), 0.1, 3);
    }

    // --- pulse rings
    const period = 2.4;
    for (let j = 0; j < 3; j++) {
      const ph = (((ch.pc / period + j / 3) % 1) + 1) % 1;
      const al = ch.pulseAmp * Math.pow(1 - ph, 1.5) * sstep(0, 0.06, ph);
      const fr = faceRings[j];
      fr.material.uniforms.uR.value = ph * 1.4; fr.material.uniforms.uW.value = ISO ? 0.028 : 0.05; fr.material.uniforms.uA.value = al * (ISO ? 1 : 0.9);
      fr.visible = al > 0.004;
      const fl = floorRings[j];
      const ph2 = (((ch.pc / (period * 1.4) + j / 3) % 1) + 1) % 1;
      const al2 = ch.pulseAmp * Math.pow(1 - ph2, 1.8) * sstep(0, 0.05, ph2);
      fl.material.uniforms.uR.value = 0.5 + ph2 * 4.0; fl.material.uniforms.uW.value = ISO ? 0.035 : 0.09; fl.material.uniforms.uA.value = al2 * (ISO ? 0.8 : 0.7);
      fl.visible = al2 > 0.004;
    }
    {
      const a = ch.sw;
      const al = a > 0.002 && a < 0.998 ? Math.pow(1 - a, 2) : 0;
      sealRing.material.uniforms.uR.value = 1.0 + a * 4.0; sealRing.material.uniforms.uW.value = ISO ? 0.05 : 0.14; sealRing.material.uniforms.uA.value = al * 0.9;
      sealRing.visible = al > 0.004;
    }

    // --- plates
    const lerpCol = (c) => tmpC.copy(ORANGE).lerp(GREEN, ch.green * 0.85);
    const setPlate = (p, pos) => {
      p.g.position.copy(p.base).add(pos);
    };
    const e1 = 1 - easeInQuart(clamp(ch.d1)), e2 = 1 - easeInQuart(clamp(ch.d2)), e3 = 1 - easeInQuart(clamp(ch.d3));
    setPlate(fin1, tmpP.set(0, e1 * 3.2, 0));
    setPlate(fin2, tmpP.set(0, e2 * 3.2, 0));
    setPlate(door3, tmpP.set(0, -e3 * 2.6, 0));
    const eL = 1 - easeInOutSine(clamp(ch.lid));
    setPlate(lid, tmpP.set(0, 0, eL * 2.0));
    const plateVals = [[fin1, ch.d1, e1], [fin2, ch.d2, e2], [door3, ch.d3, e3], [lid, ch.lid, eL]];
    for (const [p, d, e] of plateVals) {
      const moving = d > 0.001 && d < 0.999 ? 1 : 0;
      const seated = d >= 0.999 ? 1 : 0;
      const slam = Math.exp(-Math.pow((d - 1) * 0 + 0, 2));
      p.g.visible = (p === lid ? ch.lid > 0.001 : d > 0.001) || false;
      const glow = moving * 1.0 + seated * (0.45 + 0.15 * ch.appr * slowPulse);
      const colr = tmpC.copy(ORANGE).lerp(GREEN, ch.green * 0.9);
      if (ISO) {
        p.lmat.color.copy(colr);
        p.lmat.opacity = clamp(0.35 + glow * 0.7, 0, 1);
      } else {
        p.mat.emissive.copy(colr);
        p.mat.emissiveIntensity = moving * 0.2 + seated * (0.035 + 0.02 * ch.appr * slowPulse);
      }
    }

    // --- aura ring + seal bar
    {
      const ringA = ch.ring;
      const col = tmpC.copy(ORANGE).lerp(GREEN, ch.green);
      const pulse = 1 + 0.35 * ch.appr * (slowPulse - 0.4) + 0.5 * ch.flash;
      ringMesh.visible = barPivot.visible = ringA > 0.002;
      if (ISO) {
        ringMat.color.copy(col); barMat.color.copy(col);
        ringMat.opacity = ringA * 0.22 * pulse; barMat.opacity = ringA * (0.3 + 0.45 * ch.seal) * pulse;
        ringLineMat.color.copy(col); barLineMat.color.copy(col);
        ringLineMat.opacity = clamp(ringA * 0.95 * pulse, 0, 1); barLineMat.opacity = clamp(ringA * (0.95), 0, 1);
      } else {
        ringMat.emissive.copy(col); barMat.emissive.copy(col);
        const eb = lerp(1.15, 0.7, ch.green);
        ringMat.emissiveIntensity = eb * pulse; barMat.emissiveIntensity = (eb + 0.3) * pulse + 0.9 * ch.flash;
        ringMat.opacity = ringA >= 0.999 ? 1 : ringA * 0.9; barMat.opacity = ringA >= 0.999 ? 1 : ringA * 0.95;
        haloLight.color.copy(col); haloLight.intensity = ringA * lerp(7, 4.5, ch.green) * pulse;
      }
      const es = easeInQuart(clamp(ch.seal));
      barPivot.position.set(barX + (1 - es) * 1.05, (1 - es) * 0.5, 0);
      sealGlow.material.color.copy(col);
      sealGlow.material.opacity = ringA * (ISO ? 0.16 : 0.32) * (0.7 + 0.5 * pulse) * (ch.green > 0.5 ? 0.8 : 1);
      sealGlow.visible = sealGlow.material.opacity > 0.003;
      if (!ISO) {
        sealGlow.material.opacity *= 0.9;
        orangeLight && (orangeLight.color.copy(ORANGE).lerp(GREEN, ch.green));
        if (ch.green > 0.01 && orangeLight) orangeLight.intensity += ch.green * 2.2 * ch.ring * (0.9 + 0.1 * slowPulse);
      }
    }

    // --- guests
    for (let k = 0; k < guests.length; k++) {
      const gk = guests[k];
      const u = clamp((ch.mig - gk.delay) / gk.dur);
      const s = easeInOutSine(u);
      const flying = u > 0.0005 && u < 0.9995;
      for (let j = 0; j < TRAIL; j++) {
        const sj = easeInOutSine(clamp(u - j * 0.016));
        const sc = flying ? 0.17 * (1 - j / (TRAIL + 1)) : 0;
        gk.bez.getPoint(sj, bez);
        tmpM.compose(tmpP.copy(bez), ID_Q, tmpS.set(sc, sc, sc));
        parts.setMatrixAt(k * TRAIL + j, tmpM);
        const f = 1 - j / TRAIL;
        parts.setColorAt(k * TRAIL + j, tmpC.copy(ICE).multiplyScalar(j === 0 ? 1.4 : 0.9 * f * f));
      }
      const gh = guestHalos[k];
      gk.bez.getPoint(s, bez);
      gh.position.copy(bez);
      gh.material.opacity = flying ? (ISO ? 0.5 : 0.38) : 0;
      gh.visible = flying;
      const lf = landFlash[k];
      const since = keep(ch.mig - gk.delay - gk.dur);
      lf.position.set(gk.bez.v3.x, gk.bez.v3.y + 0.05, gk.bez.v3.z);
      lf.material.opacity = u >= 0.9995 ? Math.exp(-since / 0.55) * (ISO ? 0.5 : 0.42) : 0;
      lf.visible = lf.material.opacity > 0.01;
    }
    parts.instanceMatrix.needsUpdate = true; parts.instanceColor.needsUpdate = true;

    // --- labels (constant screen size; fade by zoom)
    const ppm = view.ppm;
    const sscale = (px) => px / ppm;
    const state_ =
      ch.green > 0.5 ? 'sealed' : ch.ring > 0.4 ? 'approval' : ch.d1 > 0.02 ? 'containing' : ch.hot > 0.25 ? 'breach' : 'plain';
    setLabelTex(b14tag, b14Texts[state_]);
    for (const L of labels) {
      const wpx = L.tex.w, hpx = L.tex.h;
      L.sprite.scale.set(sscale(wpx), sscale(hpx), 1);
      L.mat.opacity = (L === c05 || L === c12) ? sstep(0.2, 1.0, ch.mig) * 0.95 : L.vis(H);
      L.sprite.visible = L.mat.opacity > 0.01;
    }
  }

  function setViewport(wCss, hCss, dpr) {
    for (const m of lineMats) m.resolution.set(wCss * dpr, hCss * dpr);
    for (const m of lineMats) m.linewidth = lineWidth * (m.userData.wk ?? 1) * dpr;
    if (bgMesh) bgMesh.material.uniforms.uAspect.value = wCss / hCss;
  }

  function initEnvironment(renderer) {
    if (ISO) return;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    scene.environment = pm.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.42;
    env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pm.dispose();
  }

  function dispose() {
    disposables.forEach((d) => { try { d.dispose && d.dispose(); } catch (e) { /* ignore */ } });
    labelCache.forEach((v) => v.tex.dispose());
    rackMesh.dispose(); cells.dispose(); parts.dispose();
    lineMats.forEach((m) => m.dispose());
  }

  return {
    look, scene, camera, update, setViewport, initEnvironment, dispose, pick, setHighlight,
    background: bgMesh, bgColor: P.bg, keyLight,
    config: ISO
      ? { toneMapping: THREE.NoToneMapping, exposure: 1, shadows: false }
      : { toneMapping: THREE.NeutralToneMapping, exposure: 1.0, shadows: true },
  };
}
