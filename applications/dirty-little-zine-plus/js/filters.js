// Photo effects. Adjustments run through ctx.filter where the browser supports
// it; the 1-bit / screened looks that make a zine read as a zine need a pixel
// pass and are done here by hand.

export const EFFECTS = [
  { id: 'none',      label: 'None' },
  { id: 'threshold', label: 'Threshold (1-bit)' },
  { id: 'dither',    label: 'Dither' },
  { id: 'halftone',  label: 'Halftone' },
  { id: 'duotone',   label: 'Duotone' },
  { id: 'posterize', label: 'Posterize' },
];

export function defaultFx() {
  return {
    preset: 'none',
    brightness: 1,
    contrast: 1,
    saturate: 1,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    blur: 0,          // mm
    effect: 'none',
    threshold: 0.5,
    dotMM: 1.2,       // physical dot pitch, so preview and print agree
    angle: 45,
    levels: 4,
    dark: '#141414',
    light: '#ffffff',
    grain: 0,
    vignette: 0,
  };
}

export const PRESETS = {
  none:      { label: 'None',       fx: {} },
  bw:        { label: 'Mono',       fx: { grayscale: 1, contrast: 1.15 } },
  punch:     { label: 'Punch',      fx: { contrast: 1.35, saturate: 1.25, brightness: 1.02 } },
  faded:     { label: 'Faded',      fx: { contrast: 0.82, saturate: 0.7, brightness: 1.08, sepia: 0.2, grain: 0.12 } },
  photocopy: { label: 'Photocopy',  fx: { grayscale: 1, contrast: 1.5, effect: 'threshold', threshold: 0.52, grain: 0.08 } },
  newsprint: { label: 'Newsprint',  fx: { grayscale: 1, contrast: 1.1, effect: 'halftone', dotMM: 1.1, angle: 45, dark: '#111111', light: '#faf8f2' } },
  riso:      { label: 'Riso',       fx: { effect: 'duotone', dark: '#1b3fd8', light: '#ffd9e8', contrast: 1.1, grain: 0.1 } },
  ash:       { label: 'Ash',        fx: { effect: 'duotone', dark: '#1a1a1a', light: '#e8e4d8', contrast: 1.2 } },
  toxic:     { label: 'Toxic',      fx: { effect: 'duotone', dark: '#0d2818', light: '#c6ff3d', contrast: 1.25 } },
  zine:      { label: 'Zine',       fx: { grayscale: 1, contrast: 1.3, effect: 'dither', dotMM: 0.9, grain: 0.06 } },
  poster:    { label: 'Poster',     fx: { effect: 'posterize', levels: 4, contrast: 1.2, saturate: 1.2 } },
};

export function applyPreset(fx, presetId) {
  const next = { ...defaultFx(), preset: presetId };
  Object.assign(next, PRESETS[presetId]?.fx || {});
  return next;
}

export function isNeutral(fx) {
  const d = defaultFx();
  return Object.keys(d).every(k => k === 'preset' || fx[k] === d[k]);
}

let filterSupport = null;
function supportsCtxFilter() {
  if (filterSupport !== null) return filterSupport;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.filter = 'grayscale(1)';
    x.fillStyle = '#ff0000';
    x.fillRect(0, 0, 1, 1);
    const [r, g] = x.getImageData(0, 0, 1, 1).data;
    filterSupport = r === g;
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

function cssFilter(fx, pxPerMM) {
  const parts = [];
  if (fx.grayscale) parts.push(`grayscale(${fx.grayscale})`);
  if (fx.sepia) parts.push(`sepia(${fx.sepia})`);
  if (fx.invert) parts.push(`invert(${fx.invert})`);
  if (fx.saturate !== 1) parts.push(`saturate(${fx.saturate})`);
  if (fx.contrast !== 1) parts.push(`contrast(${fx.contrast})`);
  if (fx.brightness !== 1) parts.push(`brightness(${fx.brightness})`);
  if (fx.blur) parts.push(`blur(${(fx.blur * pxPerMM).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function hexToRGB(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Applied only when ctx.filter is unavailable (older Safari silently ignores it
// rather than throwing, so the capability probe above is the only safe gate).
function manualAdjust(data, fx) {
  const { brightness: br, contrast: ct, saturate: sa, grayscale: gs, sepia: se, invert: iv } = fx;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (gs) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (l - r) * gs; g += (l - g) * gs; b += (l - b) * gs;
    }
    if (se) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * se; g += (sg - g) * se; b += (sb - b) * se;
    }
    if (sa !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sa; g = l + (g - l) * sa; b = l + (b - l) * sa;
    }
    if (ct !== 1) {
      r = (r - 128) * ct + 128; g = (g - 128) * ct + 128; b = (b - 128) * ct + 128;
    }
    if (br !== 1) { r *= br; g *= br; b *= br; }
    if (iv) { r += (255 - 2 * r) * iv; g += (255 - 2 * g) * iv; b += (255 - 2 * b) * iv; }
    data[i] = clamp255(r); data[i + 1] = clamp255(g); data[i + 2] = clamp255(b);
  }
}

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
].map(row => row.map(v => (v + 0.5) / 64));

function applyPixelEffect(ctx, w, h, fx, pxPerMM) {
  if (fx.effect === 'none' || fx.effect === 'halftone') return;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [dr, dg, db] = hexToRGB(fx.dark);
  const [lr, lg, lb] = hexToRGB(fx.light);

  if (fx.effect === 'threshold') {
    for (let i = 0; i < d.length; i += 4) {
      const on = lum(d[i], d[i + 1], d[i + 2]) >= fx.threshold;
      d[i] = on ? lr : dr; d[i + 1] = on ? lg : dg; d[i + 2] = on ? lb : db;
    }
  } else if (fx.effect === 'dither') {
    // Cell size is physical, so the pattern is the same coarseness in print as
    // it looks on screen; 1 device pixel of Bayer at 300 DPI would vanish.
    const cell = Math.max(1, Math.round(fx.dotMM * pxPerMM));
    for (let y = 0; y < h; y++) {
      const by = Math.floor(y / cell) & 7;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const t = BAYER8[by][Math.floor(x / cell) & 7];
        const on = lum(d[i], d[i + 1], d[i + 2]) >= t;
        d[i] = on ? lr : dr; d[i + 1] = on ? lg : dg; d[i + 2] = on ? lb : db;
      }
    }
  } else if (fx.effect === 'duotone') {
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d[i], d[i + 1], d[i + 2]);
      d[i] = dr + (lr - dr) * l; d[i + 1] = dg + (lg - dg) * l; d[i + 2] = db + (lb - db) * l;
    }
  } else if (fx.effect === 'posterize') {
    const n = Math.max(2, Math.round(fx.levels));
    const step = 255 / (n - 1);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / step) * step;
      d[i + 1] = Math.round(d[i + 1] / step) * step;
      d[i + 2] = Math.round(d[i + 2] / step) * step;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function applyHalftone(ctx, w, h, fx, pxPerMM) {
  const cell = Math.max(2, fx.dotMM * pxPerMM);

  // One luminance sample per cell, produced by letting the browser box-average
  // during a downscale. Point-sampling the full-res image aliases badly.
  const gw = Math.max(1, Math.ceil(w / cell));
  const gh = Math.max(1, Math.ceil(h / cell));
  const grid = document.createElement('canvas');
  grid.width = gw; grid.height = gh;
  const gctx = grid.getContext('2d', { willReadFrequently: true });
  gctx.drawImage(ctx.canvas, 0, 0, gw, gh);
  const gd = gctx.getImageData(0, 0, gw, gh).data;

  const sample = (x, y) => {
    const gx = Math.min(gw - 1, Math.max(0, Math.floor(x / cell)));
    const gy = Math.min(gh - 1, Math.max(0, Math.floor(y / cell)));
    const i = (gy * gw + gx) * 4;
    return lum(gd[i], gd[i + 1], gd[i + 2]);
  };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fx.light;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fx.dark;

  const a = (fx.angle * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const cx = w / 2, cy = h / 2;
  const reach = Math.hypot(w, h) / 2 + cell;

  ctx.beginPath();
  for (let v = -reach; v <= reach; v += cell) {
    for (let u = -reach; u <= reach; u += cell) {
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
      // Ink coverage is the dot's AREA, so radius goes as its square root; a
      // linear ramp turns every midtone into a solid. The quartic term only
      // bites in the last stop, pushing dots past the lattice corner radius
      // (0.707 cell) so deep shadows reach solid black instead of holding a
      // grid of white diamonds.
      const c = 1 - sample(x, y);
      const r = (cell / 2) * (Math.sqrt(c) * 1.15 + c * c * c * c * 0.3);
      if (r < 0.2) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

function applyGrain(ctx, w, h, amount, pxPerMM) {
  // Grain is generated at a fixed physical pitch; per-device-pixel noise is
  // invisible once it hits 300 DPI paper.
  const pitch = Math.max(1, Math.round(0.12 * pxPerMM));
  const nw = Math.max(1, Math.ceil(w / pitch));
  const nh = Math.max(1, Math.ceil(h / pitch));
  const n = document.createElement('canvas');
  n.width = nw; n.height = nh;
  const nctx = n.getContext('2d');
  const img = nctx.createImageData(nw, nh);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    d[i] = d[i + 1] = d[i + 2] = clamp255(v);
    d[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.drawImage(n, 0, 0, w, h);
  ctx.restore();
}

function applyVignette(ctx, w, h, amount) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Rasterize one photo's crop at destW x destH with its effects baked in.
 * Returns a canvas the renderer and the PDF exporter can both draw directly.
 */
export function renderPhotoCanvas(img, src, destW, destH, fx, pxPerMM) {
  const w = Math.max(1, Math.round(destW));
  const h = Math.max(1, Math.round(destH));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  const useCss = supportsCtxFilter();
  if (useCss) ctx.filter = cssFilter(fx, pxPerMM);
  ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, 0, 0, w, h);
  ctx.filter = 'none';

  if (!useCss) {
    const d = ctx.getImageData(0, 0, w, h);
    manualAdjust(d.data, fx);
    ctx.putImageData(d, 0, 0);
  }

  if (fx.effect === 'halftone') applyHalftone(ctx, w, h, fx, pxPerMM);
  else applyPixelEffect(ctx, w, h, fx, pxPerMM);

  if (fx.grain > 0) applyGrain(ctx, w, h, fx.grain, pxPerMM);
  if (fx.vignette > 0) applyVignette(ctx, w, h, fx.vignette);

  return c;
}

// Rasterizing a 300 DPI panel is expensive enough that redrawing on every pan
// frame would stutter, so each photo keeps its last result keyed by everything
// that can change it.
const cache = new WeakMap();

export function cachedPhotoCanvas(photo, img, src, destW, destH, fx, pxPerMM) {
  const w = Math.round(destW), h = Math.round(destH);
  const key = [
    w, h, Math.round(src.sx), Math.round(src.sy), Math.round(src.sw), Math.round(src.sh),
    Math.round(pxPerMM * 100), JSON.stringify(fx),
  ].join('|');

  const hit = cache.get(photo);
  if (hit && hit.key === key) return hit.canvas;

  const canvas = renderPhotoCanvas(img, src, w, h, fx, pxPerMM);
  cache.set(photo, { key, canvas });
  return canvas;
}

export function invalidate(photo) {
  cache.delete(photo);
}
