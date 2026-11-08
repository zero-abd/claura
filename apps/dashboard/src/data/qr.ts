// A small QR Code encoder, generated locally with no network and no dependencies.
//
// Scope: byte mode, error correction L, fixed version 2 (25 x 25 modules, up to 32 bytes). That is exactly enough for a
// break-glass enrollment link such as "claura://join/K7QM-4TXD-9HVP". Structure follows ISO/IEC 18004: one RS(44,34)
// block, finder / timing / alignment patterns, the eight masks scored by the standard penalty rules, 15-bit BCH format
// information. It is checked in the browser with BarcodeDetector (see tools/shoot.mjs --eval).

const SIZE = 25;
const DATA_CODEWORDS = 34;
const EC_CODEWORDS = 10;

/** GF(256) multiply, primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D). */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMul(coef, factor);
    });
  }
  return result;
}

function codewords(text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 32) throw new Error(`QR payload is ${bytes.length} bytes; version 2-L holds 32`);
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const cap = DATA_CODEWORDS * 8;
  push(0, Math.min(4, cap - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }
  return data.concat(rsRemainder(data, rsDivisor(EC_CODEWORDS)));
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

function penalty(m: boolean[][]): number {
  let score = 0;
  const lines: boolean[][] = [];
  for (let i = 0; i < SIZE; i++) {
    lines.push(m[i]);
    lines.push(m.map((row) => row[i]));
  }
  for (const line of lines) {
    // N1: runs of 5 or more; N3: finder-like 1:1:3:1:1 with four light modules on a side
    let run = 1;
    for (let i = 1; i <= SIZE; i++) {
      if (i < SIZE && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    const s = line.map((b) => (b ? "1" : "0")).join("");
    for (const pat of ["00001011101", "10111010000"]) {
      let at = s.indexOf(pat);
      while (at >= 0) {
        score += 40;
        at = s.indexOf(pat, at + 1);
      }
    }
  }
  for (let y = 0; y < SIZE - 1; y++)
    for (let x = 0; x < SIZE - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3; // N2
    }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  score += (Math.ceil(Math.abs(dark * 20 - SIZE * SIZE * 10) / (SIZE * SIZE)) - 1) * 10; // N4
  return score;
}

/** The module matrix (true = dark) for `text`. Throws if it does not fit version 2-L. */
export function qrMatrix(text: string): boolean[][] {
  const modules: boolean[][] = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const isFn: boolean[][] = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFn[y][x] = true;
  };

  for (let i = 0; i < SIZE; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) setFn(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(SIZE - 4, 3);
  finder(3, SIZE - 4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(18 + dx, 18 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);

  const drawFormat = (mask: number) => {
    const data = (1 << 3) | mask; // error correction L = 01
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(SIZE - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, SIZE - 15 + i, bit(i));
    setFn(8, SIZE - 8, true); // the always-dark module
  };
  drawFormat(0);

  // zig-zag the codewords up and down the column pairs, skipping the vertical timing column
  const cw = codewords(text);
  let i = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < SIZE; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? SIZE - 1 - vert : vert;
        if (!isFn[y][x] && i < cw.length * 8) {
          modules[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!isFn[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const s = penalty(modules);
    if (s < bestScore) {
      bestScore = s;
      best = mask;
    }
    applyMask(mask); // undo
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

/** Inline SVG: dark modules as one path on a light plate with a 2-module quiet zone. */
export function qrSVG(m: boolean[][], opts: { quiet?: number; dark?: string; light?: string; label?: string } = {}): string {
  const q = opts.quiet ?? 2;
  const n = m.length + q * 2;
  let d = "";
  for (let y = 0; y < m.length; y++) {
    let x = 0;
    while (x < m.length) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < m.length && m[y][x]) x++;
      d += `M${start + q} ${y + q}h${x - start}v1h-${x - start}z`;
    }
  }
  const label = (opts.label ?? "QR code").replace(/"/g, "&quot;");
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${opts.light ?? "#fff"}"/><path d="${d}" fill="${opts.dark ?? "#0b0c0e"}"/></svg>`;
}
