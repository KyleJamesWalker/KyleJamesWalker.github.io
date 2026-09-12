// QR Code encoder: byte mode, versions 1-40, all four correction levels.

export const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

// Format-info bit pattern per level, which is not the same as the table order.
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
const ORDINAL = { L: 0, M: 1, Q: 2, H: 3 };

const ECC_CODEWORDS_PER_BLOCK = [
  // index 0 is unused; versions run 1..40
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ECC_BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const sizeOf = ver => ver * 4 + 17;

/** Module count available to data and ECC, function patterns already removed. */
function rawDataModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    n -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

function dataCodewords(ver, ecc) {
  const o = ORDINAL[ecc];
  return Math.floor(rawDataModules(ver) / 8)
    - ECC_CODEWORDS_PER_BLOCK[o][ver] * NUM_ECC_BLOCKS[o][ver];
}

const charCountBits = ver => (ver <= 9 ? 8 : 16);

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const count = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
  const pos = [6];
  for (let i = 1, p = sizeOf(ver) - 7; i < count; i++, p -= step) pos.splice(1, 0, p);
  return pos;
}

// ---------------------------------------------------------------------------
// GF(256) arithmetic, primitive polynomial 0x11D
// ---------------------------------------------------------------------------

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

// ---------------------------------------------------------------------------
// bitstream
// ---------------------------------------------------------------------------

function bitBuffer() {
  const bits = [];
  return {
    bits,
    push(value, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    },
  };
}

function codewordsFor(bytes, ver, ecc) {
  const capacity = dataCodewords(ver, ecc) * 8;
  const bb = bitBuffer();
  bb.push(0b0100, 4);
  bb.push(bytes.length, charCountBits(ver));
  for (const b of bytes) bb.push(b, 8);

  bb.push(0, Math.min(4, capacity - bb.bits.length));
  bb.push(0, (8 - (bb.bits.length % 8)) % 8);
  for (let pad = 0xec; bb.bits.length < capacity; pad ^= 0xec ^ 0x11) bb.push(pad, 8);

  const out = new Uint8Array(capacity / 8);
  bb.bits.forEach((bit, i) => { out[i >>> 3] |= bit << (7 - (i & 7)); });
  return out;
}

/** Split into blocks, append each block's ECC, interleave as the spec requires. */
function interleave(data, ver, ecc) {
  const o = ORDINAL[ecc];
  const numBlocks = NUM_ECC_BLOCKS[o][ver];
  const eccLen = ECC_CODEWORDS_PER_BLOCK[o][ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);

  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.subarray(k, k + len);
    k += len;
    blocks.push({ dat, ecc: rsRemainder(dat, divisor) });
  }

  const result = [];
  for (let i = 0; i < shortLen - eccLen + 1; i++) {
    // The short blocks have no codeword in the last data column.
    for (const b of blocks) if (i < b.dat.length) result.push(b.dat[i]);
  }
  for (let i = 0; i < eccLen; i++) for (const b of blocks) result.push(b.ecc[i]);
  return Uint8Array.from(result);
}

// ---------------------------------------------------------------------------
// matrix
// ---------------------------------------------------------------------------

class Matrix {
  constructor(size) {
    this.size = size;
    this.modules = new Uint8Array(size * size);
    this.reserved = new Uint8Array(size * size);
  }
  get(x, y) { return this.modules[y * this.size + x]; }
  set(x, y, dark, reserve = true) {
    this.modules[y * this.size + x] = dark ? 1 : 0;
    if (reserve) this.reserved[y * this.size + x] = 1;
  }
  isFree(x, y) { return !this.reserved[y * this.size + x]; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
}

function drawFunctionPatterns(m, ver, ecc) {
  const n = m.size;

  for (let i = 0; i < n; i++) {
    m.set(6, i, i % 2 === 0);
    m.set(i, 6, i % 2 === 0);
  }

  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (m.inside(cx + dx, cy + dy)) m.set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  }

  const align = alignmentPositions(ver);
  const last = align.length - 1;
  align.forEach((ax, i) => align.forEach((ay, j) => {
    // The three corners are already occupied by the finder patterns.
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        m.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }));

  drawFormatBits(m, ecc, 0);
  drawVersionBits(m, ver);
}

function drawFormatBits(m, ecc, mask) {
  const n = m.size;
  const data = (FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = i => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) m.set(8, i, bit(i));
  m.set(8, 7, bit(6));
  m.set(8, 8, bit(7));
  m.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) m.set(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) m.set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) m.set(8, n - 15 + i, bit(i));
  m.set(8, n - 8, true);
}

function drawVersionBits(m, ver) {
  if (ver < 7) return;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = m.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    m.set(a, b, dark);
    m.set(b, a, dark);
  }
}

/** Two-column zigzag from the bottom right, skipping the vertical timing line. */
function drawCodewords(m, data) {
  const n = m.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - v : v;
        if (!m.isFree(x, y)) continue;
        const dark = i < data.length * 8 && ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        m.set(x, y, dark, false);
        i++;
      }
    }
  }
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(m, mask) {
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.isFree(x, y) && maskBit(mask, x, y)) m.modules[y * m.size + x] ^= 1;
    }
  }
}

const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

/** ISO 18004 mask evaluation: run length, 2x2 blocks, finder lookalikes, dark ratio. */
function penalty(m) {
  const n = m.size;
  let score = 0;

  // The border outside the symbol counts as light, so the first and last run of
  // every line is extended by the symbol width before the ratio test.
  const addHistory = (run, history) => {
    history.pop();
    history.unshift(history[0] === 0 ? run + n : run);
  };

  const countPatterns = h => {
    const k = h[1];
    const core = k > 0 && h[2] === k && h[3] === k * 3 && h[4] === k && h[5] === k;
    if (!core) return 0;
    return (h[0] >= k * 4 && h[6] >= k ? 1 : 0) + (h[6] >= k * 4 && h[0] >= k ? 1 : 0);
  };

  const scan = at => {
    for (let a = 0; a < n; a++) {
      let colour = 0;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < n; b++) {
        const v = at(a, b);
        if (v === colour) {
          run++;
          if (run === 5) score += PENALTY_N1;
          else if (run > 5) score++;
        } else {
          addHistory(run, history);
          if (colour === 0) score += countPatterns(history) * PENALTY_N3;
          colour = v;
          run = 1;
        }
      }
      if (colour === 1) {
        addHistory(run, history);
        run = 0;
      }
      addHistory(run + n, history);
      score += countPatterns(history) * PENALTY_N3;
    }
  };

  scan((y, x) => m.get(x, y));
  scan((x, y) => m.get(x, y));

  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = m.get(x, y);
      if (v === m.get(x + 1, y) && v === m.get(x, y + 1) && v === m.get(x + 1, y + 1)) score += PENALTY_N2;
    }
  }

  let dark = 0;
  for (const v of m.modules) dark += v;
  const total = n * n;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return score + k * PENALTY_N4;
}

// ---------------------------------------------------------------------------
// public
// ---------------------------------------------------------------------------

export class QRTooLongError extends Error {}

/** @returns {{version:number, ecc:string, mask:number, size:number, get:(x:number,y:number)=>boolean}} */
export function encodeQR(text, ecc = 'M') {
  if (!ECC_LEVELS.includes(ecc)) ecc = 'M';
  const bytes = new TextEncoder().encode(text);

  let ver = 0;
  for (let v = 1; v <= 40; v++) {
    if (4 + charCountBits(v) + bytes.length * 8 <= dataCodewords(v, ecc) * 8) { ver = v; break; }
  }
  if (!ver) throw new QRTooLongError('Too long for a QR code at this correction level');

  const codewords = interleave(codewordsFor(bytes, ver, ecc), ver, ecc);

  const m = new Matrix(sizeOf(ver));
  drawFunctionPatterns(m, ver, ecc);
  drawCodewords(m, codewords);

  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, mask);
    drawFormatBits(m, ecc, mask);
    const s = penalty(m);
    if (s < bestScore) { bestScore = s; best = mask; }
    applyMask(m, mask);
  }
  applyMask(m, best);
  drawFormatBits(m, ecc, best);

  return {
    version: ver,
    ecc,
    mask: best,
    size: m.size,
    get: (x, y) => m.get(x, y) === 1,
  };
}

const cache = new Map();
const CACHE_MAX = 16;

/** Memoized `encodeQR`; a pan drag re-renders the page on every frame. */
export function qrFor(text, ecc = 'M') {
  const key = `${ecc} ${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const code = encodeQR(text, ecc);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, code);
  return code;
}
