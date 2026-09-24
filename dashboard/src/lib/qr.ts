// A QR code, drawn here rather than fetched from anywhere. Two reasons: a
// secret must never be handed to an image service, and a dependency for this
// would weigh more than the code below. Byte mode, error correction M,
// versions 1–10 — plenty for an otpauth:// URI.
//
// It lives in the account chunk, so the dashboard's first load never sees it.

const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];
// 15-bit format strings for level M, one per mask, and the 18-bit version
// strings needed from version 7 on. Both carry their own BCH check bits.
const FORMAT = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];
const VERSION = [0, 0, 0, 0, 0, 0, 0, 0x07c94, 0x085bc, 0x09a99, 0x0a4d3];

const dataCodewords = (v: number) => TOTAL[v] - EC_PER_BLOCK[v] * BLOCKS[v];
const byteCapacity = (v: number) =>
  Math.floor((dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);

// GF(256) with the QR polynomial, built once.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The Reed–Solomon check bytes for one block. */
function ecc(data: Uint8Array, n: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(gen.length + 1);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rest = new Uint8Array(n);
  for (const b of data) {
    const factor = b ^ rest[0];
    rest.copyWithin(0, 1);
    rest[n - 1] = 0;
    for (let j = 0; j < n; j++) rest[j] ^= mul(gen[j + 1], factor);
  }
  return rest;
}

const MASKS: ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => ((i >> 1) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

type Grid = (boolean | null)[][];

/** Encodes text as a grid of dark/light modules, with no quiet zone. */
export function qr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 0;
  for (let v = 1; v <= 10; v++)
    if (bytes.length <= byteCapacity(v)) {
      version = v;
      break;
    }
  if (!version) throw new Error("too much text for a small QR code");

  const stream = codewords(bytes, version);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = build(version, mask, stream);
    const s = penalty(g as boolean[][]);
    if (s < bestScore) ((bestScore = s), (best = g));
  }
  return best as boolean[][];
}

/** Data and check bytes, in the interleaved order the symbol expects. */
function codewords(bytes: Uint8Array, version: number): Uint8Array {
  const total = dataCodewords(version);
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, total * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = new Uint8Array(total);
  for (let i = 0; i < bits.length; i += 8)
    for (let b = 0; b < 8; b++) data[i / 8] |= bits[i + b] << (7 - b);
  for (let i = bits.length / 8, pad = 0; i < total; i++, pad++)
    data[i] = pad % 2 === 0 ? 0xec : 0x11;

  const n = BLOCKS[version];
  const ecLen = EC_PER_BLOCK[version];
  const short = Math.floor(total / n);
  const longs = total % n; // the last blocks carry one byte more
  const blocks: Uint8Array[] = [];
  const checks: Uint8Array[] = [];
  for (let i = 0, at = 0; i < n; i++) {
    const len = short + (i >= n - longs ? 1 : 0);
    const block = data.subarray(at, at + len);
    at += len;
    blocks.push(block);
    checks.push(ecc(block, ecLen));
  }
  const out: number[] = [];
  for (let i = 0; i < short + 1; i++)
    for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const c of checks) out.push(c[i]);
  return new Uint8Array(out);
}

/** The symbol for one mask: patterns first, then the data zigzag. */
function build(version: number, mask: number, stream: Uint8Array): Grid {
  const size = version * 4 + 17;
  const m: Grid = Array.from({ length: size }, () =>
    Array<boolean | null>(size).fill(null),
  );

  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const y = row + r;
        const x = col + c;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        m[y][x] =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (const row of ALIGN[version])
    for (const col of ALIGN[version]) {
      if (m[row][col] !== null) continue; // overlaps a finder
      for (let r = -2; r <= 2; r++)
        for (let c = -2; c <= 2; c++)
          m[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
    }

  for (let i = 8; i < size - 8; i++) {
    const on = i % 2 === 0;
    if (m[6][i] === null) m[6][i] = on;
    if (m[i][6] === null) m[i][6] = on;
  }

  const f = FORMAT[mask];
  for (let i = 0; i < 15; i++) {
    const on = ((f >> i) & 1) === 1;
    if (i < 6) m[i][8] = on;
    else if (i < 8) m[i + 1][8] = on;
    else m[size - 15 + i][8] = on;
    if (i < 8) m[8][size - i - 1] = on;
    else if (i < 9) m[8][15 - i] = on;
    else m[8][14 - i] = on;
  }
  m[size - 8][8] = true; // the module that is always dark

  if (version >= 7)
    for (let i = 0; i < 18; i++) {
      const on = ((VERSION[version] >> i) & 1) === 1;
      m[Math.floor(i / 3)][(i % 3) + size - 11] = on;
      m[(i % 3) + size - 11][Math.floor(i / 3)] = on;
    }

  let bit = 0;
  const next = () => {
    if (bit >= stream.length * 8) return false;
    const on = ((stream[bit >> 3] >> (7 - (bit & 7))) & 1) === 1;
    bit++;
    return on;
  };
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // the timing column is not part of the zigzag
    for (let step = 0; step < size; step++) {
      const row = up ? size - 1 - step : step;
      for (let c = 0; c < 2; c++) {
        if (m[row][col - c] !== null) continue;
        let on = next();
        if (MASKS[mask](row, col - c)) on = !on;
        m[row][col - c] = on;
      }
    }
    up = !up;
  }
  return m;
}

/** The standard four penalties: the lowest total is the friendliest to scan. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const line = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      const bits: boolean[] = [];
      for (let b = 0; b < size; b++) {
        bits.push(get(a, b));
        if (b > 0 && get(a, b) === get(a, b - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
      // The finder-like sequence, which a scanner could mistake for a corner.
      const s = bits.map((x) => (x ? "1" : "0")).join("");
      for (const p of ["1011101 0000", "0000 1011101"].map((x) =>
        x.replace(" ", ""),
      )) {
        let at = s.indexOf(p);
        while (at !== -1) ((score += 40), (at = s.indexOf(p, at + 1)));
      }
    }
  };
  line((a, b) => m[a][b]);
  line((a, b) => m[b][a]);
  let dark = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (m[r][c]) dark++;
      if (
        r + 1 < size &&
        c + 1 < size &&
        m[r][c] === m[r][c + 1] &&
        m[r][c] === m[r + 1][c] &&
        m[r][c] === m[r + 1][c + 1]
      )
        score += 3;
    }
  score += 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
  return score;
}

/** The dark modules as one SVG path, so a code is a single element. */
export function qrPath(grid: boolean[][]): string {
  let d = "";
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid.length; c++)
      if (grid[r][c]) d += `M${c} ${r}h1v1h-1z`;
  return d;
}
