// DFW-2 site plan. Pure data (no three.js). Units are metres, y is up.
// The camera sits at +x/+z looking toward the origin, so +x runs down-right on screen and +z runs down-left.
//
//            A (top)
//     D (left)  [MGMT/BMC hub]  B (right)
//            C (bottom)
//
// Every hall: two rows of 8 racks (01-08 and 09-16). Rows face OUTWARD (hot-aisle containment), so the
// 09-16 row always faces +z and shows its front to the default camera. B14 lives in that row.

export const RACK = { w: 0.62, d: 1.0, h: 2.1, pitch: 0.86 };
export const HALL = { len: 7.4, wid: 4.8 };
export const SLAB_Y = 0.1;
export const PLINTH = { hx: 10.2, hz: 7.6, depth: 0.7 };
export const HALL_CENTERS = { A: [-5.2, -3.9], B: [5.2, -3.9], C: [5.2, 3.9], D: [-5.2, 3.9] };
export const HALL_IDS = ['A', 'B', 'C', 'D'];
export const BLADES = 12; // U-blocks per rack front
export const BLADE_H = 0.145;
export const BLADE_Y0 = 0.2; // above slab

export const HUB = { x: 0, z: 0, base: [2.8, 0.5, 2.8], core: [1.9, 1.55, 1.9], crown: [1.0, 0.4, 1.0] };

export function rackId(hall, n) { return hall + String(n).padStart(2, '0'); }

/** All 64 racks, row-major per hall. */
export const RACKS = (() => {
  const out = [];
  for (const hall of HALL_IDS) {
    const [hx, hz] = HALL_CENTERS[hall];
    for (let n = 1; n <= 16; n++) {
      const row = n <= 8 ? 1 : 2;
      const idx = (n - 1) % 8;
      const f = row === 1 ? -1 : 1; // facing sign along z
      out.push({
        id: rackId(hall, n), hall, n, row, idx, f, index: out.length,
        x: hx + (idx - 3.5) * RACK.pitch,
        z: hz + (row === 1 ? -1.0 : 1.0),
      });
    }
  }
  return out;
})();
export const RACK_BY_ID = Object.fromEntries(RACKS.map((r) => [r.id, r]));

export const B14 = RACK_BY_ID.B14;
export const C05 = RACK_BY_ID.C05;
export const C12 = RACK_BY_ID.C12;

/** Local frame helpers for the rack front. */
export const frontZ = (r) => r.z + r.f * (RACK.d / 2);
export const bladeY = (i) => SLAB_Y + BLADE_Y0 + (i + 0.5) * BLADE_H;

/** Host b14-gpu-07: three blades tall, carries 12 guest VM cells in a 4 x 3 grid. */
export const HOST = { blades: [5, 6, 7], cols: 4, rows: 3, w: 0.54, protrude: 0.035 };
export const SUSPECT_CELL = 6; // vm-7f3a: row 1, col 2
export const GUEST_CELLS = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11]; // the 11 co-resident guests
export function hostCellPos(i) {
  const col = i % HOST.cols, row = Math.floor(i / HOST.cols);
  const cw = HOST.w / HOST.cols;
  const y0 = bladeY(HOST.blades[0]) - BLADE_H / 2, y1 = bladeY(HOST.blades[2]) + BLADE_H / 2;
  const ch = (y1 - y0) / HOST.rows;
  return {
    x: B14.x - HOST.w / 2 + cw * (col + 0.5),
    y: y1 - ch * (row + 0.5),
    z: frontZ(B14) + HOST.protrude,
    w: cw * 0.82, h: ch * 0.78,
  };
}

/** Guest migration plan: 6 -> C05, 5 -> C12. */
export const MIGRATION = GUEST_CELLS.map((cell, k) => ({ cell, k, target: k < 6 ? 'C05' : 'C12', slot: k < 6 ? k : k - 6 }));

/** Landing slots on a rack top (3 x 2 grid). */
export function topSlotPos(rack, slot) {
  const col = slot % 3, row = Math.floor(slot / 3);
  return { x: rack.x + (col - 1) * 0.19, y: SLAB_Y + RACK.h, z: rack.z + (row - 0.5) * 0.4 };
}

/** The route the breach takes: vm cell -> hypervisor port on the host -> out of the rack -> corridor -> hub. */
export function linkPoints() {
  const c = hostCellPos(SUSPECT_CELL);
  const zf = frontZ(B14);
  return [
    [c.x, c.y, c.z + 0.01],
    [B14.x + HOST.w / 2 - 0.03, bladeY(HOST.blades[0]) + 0.04, zf + 0.05],
    [B14.x + 0.44, 0.78, zf + 0.34],
    [B14.x + 0.34, 0.34, zf + 0.85],
    [B14.x - 0.1, 0.13, -1.0],
    [B14.x - 1.1, 0.075, -0.1],
    [3.6, 0.075, 0.0],
    [1.75, 0.09, 0.0],
    [HUB.base[0] / 2 + 0.02, 0.36, 0.0],
  ];
}

/** Management network conduits (hub -> halls), drawn as faint wires with travelling light. */
export const CONDUITS = [
  [[1.4, 0.03, 0.0], [5.2, 0.03, 0.0], [5.2, 0.03, -1.5]], // to B
  [[5.2, 0.03, 0.0], [5.2, 0.03, 1.5]], // to C
  [[-1.4, 0.03, 0.0], [-5.2, 0.03, 0.0], [-5.2, 0.03, -1.5]], // to A
  [[-5.2, 0.03, 0.0], [-5.2, 0.03, 1.5]], // to D
];
