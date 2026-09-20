// Canvas rendering. The same code path draws the on-screen preview and the
// 300 DPI export; only the dpi argument differs.

import { sheetGeometry, renderBoxes, panelRect, fitRect, PANELS, SPREADS, MM_PER_IN } from './geometry.js';
import { layoutRects } from './layouts.js';
import { cachedPhotoCanvas } from './filters.js';
import { fontById, TITLE_SCALE, CAPTION_SCALE } from './state.js';
import { qrFor } from './qrcode.js';

const defaultImageFor = p => p.img;

export function renderSheet(canvas, state, { dpi = 150, guides = true, imageFor = defaultImageFor, simplify = false } = {}) {
  const geo = sheetGeometry(state.paperSize, dpi);
  canvas.width = geo.w;
  canvas.height = geo.h;
  const ctx = canvas.getContext('2d');
  const pxPerMM = dpi / MM_PER_IN;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, geo.w, geo.h);

  for (const box of renderBoxes(geo, state)) {
    ctx.save();
    if (box.rotated) {
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-box.w / 2, -box.h / 2);
    } else {
      ctx.translate(box.x, box.y);
    }
    drawContent(ctx, state, box, { x: 0, y: 0, w: box.w, h: box.h }, { pxPerMM, imageFor, simplify });
    ctx.restore();
  }

  if (guides) drawGuides(ctx, geo);
  return geo;
}

/**
 * One page, upright, at whatever size the editor stage has room for. `page`
 * carries the physical size of the box so mm-based effects scale correctly.
 */
export function renderPage(canvas, state, page, cssW, dpr, { imageFor = defaultImageFor, simplify = false } = {}) {
  const cssH = cssW * (page.heightMM / page.widthMM);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  const rect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const pxPerMM = canvas.width / page.widthMM;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cells = drawContent(ctx, state, page, rect, { pxPerMM, imageFor, simplify });
  return { cssW, cssH, rect, pxPerMM, cells };
}

function coverConfigFor(state, box) {
  if (box.kind !== 'panel') return null;
  if (box.meta.role === 'front') return state.cover;
  if (box.meta.role === 'back') return state.back;
  return null;
}

// Dropping the pixel effects keeps dragging at 60fps; the full pipeline is
// re-run the moment the pointer is released.
function simplifyFx(fx) {
  return fx.effect === 'none' && !fx.grain ? fx : { ...fx, effect: 'none', grain: 0 };
}

export function drawContent(ctx, state, box, rect, { pxPerMM, imageFor, forHitTest = false, simplify = false }) {
  const content = box.panel;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = content.bg || '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const cells = layoutRects(content.layout, rect, {
    gutter: content.gutterMM * pxPerMM,
    margin: content.marginMM * pxPerMM,
  });

  if (forHitTest) {
    ctx.restore();
    return cells;
  }

  cells.forEach((cell, i) => {
    const photo = content.photos[i];
    if (!photo) {
      drawPlaceholder(ctx, cell, cells.length > 1);
      return;
    }
    const img = imageFor(photo);
    if (!img) { drawPlaceholder(ctx, cell, cells.length > 1); return; }

    const src = fitRect(img.naturalWidth, img.naturalHeight, cell, photo, content.fit);
    const fx = simplify ? simplifyFx(photo.fx) : photo.fx;
    const baked = cachedPhotoCanvas(photo, img, src, src.dw, src.dh, fx, pxPerMM);
    ctx.drawImage(baked, src.dx, src.dy, src.dw, src.dh);
  });

  drawTextLayer(ctx, state, box, rect, pxPerMM);

  ctx.restore();
  return cells;
}

/** Cover lettering, caption and QR code only, on whatever is already there. */
export function drawTextLayer(ctx, state, box, rect, pxPerMM) {
  const cover = coverConfigFor(state, box);
  if (cover) drawCoverText(ctx, rect, cover, pxPerMM);
  if (box.panel.caption.text.trim()) drawCaption(ctx, rect, box.panel.caption, pxPerMM);
  if (box.panel.qr.text.trim()) drawQR(ctx, rect, box.panel.qr, pxPerMM);
}

export const QR_QUIET_MODULES = 4;

/** Side of the printed plate, clamped to what the page can hold. */
export function qrSide(cfg, rect, pxPerMM) {
  const pad = rect.w * 0.06;
  return Math.min(cfg.sizeMM * pxPerMM, rect.w - pad * 2, rect.h - pad * 2);
}

function drawQR(ctx, rect, cfg, pxPerMM) {
  let code;
  try {
    code = qrFor(cfg.text.trim(), cfg.ecc);
  } catch {
    return;
  }

  const pad = rect.w * 0.06;
  const side = qrSide(cfg, rect, pxPerMM);
  const x = cfg.align === 'left' ? rect.x + pad
    : cfg.align === 'right' ? rect.x + rect.w - pad - side
    : rect.x + (rect.w - side) / 2;
  const y = cfg.valign === 'top' ? rect.y + pad
    : cfg.valign === 'bottom' ? rect.y + rect.h - pad - side
    : rect.y + (rect.h - side) / 2;

  const m = side / (code.size + QR_QUIET_MODULES * 2);
  // Snapping module edges to whole pixels keeps the print crisp, but below
  // about a pixel per module it would swallow whole rows instead.
  const snap = m >= 1.5;
  const edge = (origin, i) => (snap ? Math.round(origin + i * m) : origin + i * m);
  const ox = x + QR_QUIET_MODULES * m;
  const oy = y + QR_QUIET_MODULES * m;

  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (cfg.plate) {
    ctx.fillStyle = cfg.light;
    ctx.fillRect(x, y, side, side);
  }
  ctx.fillStyle = cfg.dark;
  ctx.beginPath();
  for (let row = 0; row < code.size; row++) {
    const y0 = edge(oy, row);
    const y1 = edge(oy, row + 1);
    for (let col = 0; col < code.size; col++) {
      if (!code.get(col, row)) continue;
      const x0 = edge(ox, col);
      ctx.rect(x0, y0, edge(ox, col + 1) - x0, y1 - y0);
    }
  }
  ctx.fill();
  ctx.restore();
}

/** Cell rects for the currently rendered content, for pointer hit-testing. */
export function cellsFor(content, rect, pxPerMM) {
  return layoutRects(content.layout, rect, {
    gutter: content.gutterMM * pxPerMM,
    margin: content.marginMM * pxPerMM,
  });
}

function drawPlaceholder(ctx, cell, compact) {
  ctx.save();
  ctx.fillStyle = '#ececec';
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  ctx.strokeStyle = '#d6d6d6';
  ctx.lineWidth = Math.max(1, cell.w * 0.004);
  ctx.setLineDash([cell.w * 0.03, cell.w * 0.02]);
  ctx.strokeRect(cell.x + 2, cell.y + 2, cell.w - 4, cell.h - 4);
  ctx.setLineDash([]);

  const size = Math.round(Math.min(cell.w, cell.h) * (compact ? 0.09 : 0.07));
  ctx.fillStyle = '#a5a5a5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px "Special Elite", "Courier New", monospace`;
  ctx.fillText('drop a photo', cell.x + cell.w / 2, cell.y + cell.h / 2);
  ctx.restore();
}

function wrapLines(ctx, text, family, size, maxW) {
  ctx.font = `${size}px ${family}`;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function fitToWidth(ctx, text, family, maxW) {
  ctx.font = `100px ${family}`;
  const w = ctx.measureText(text).width || 1;
  return (maxW / w) * 100;
}

function typesetTitle(ctx, text, maxW, font, scale, boxW) {
  const cap = font.cap * boxW * scale;
  let size = Math.min(cap, fitToWidth(ctx, text, font.family, maxW));
  let lines = [text];

  // A long title fitted as a single line goes unreadably small; wrap it and let
  // the cap drive the size instead.
  if (size < cap * 0.6 && text.trim().includes(' ')) {
    lines = wrapLines(ctx, text, font.family, cap, maxW);
    size = cap;
    for (const ln of lines) size = Math.min(size, fitToWidth(ctx, ln, font.family, maxW));
  }
  return { lines, size };
}

function drawTracked(ctx, text, x, y, tracking, align) {
  if (!tracking) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }
  const size = parseFloat(ctx.font);
  const extra = size * tracking;
  const chars = [...text];
  const width = chars.reduce((s, c) => s + ctx.measureText(c).width + extra, 0) - extra;
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.textAlign = 'left';
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + extra;
  }
}

function textAnchor(rect, align, valign, pad) {
  const x = align === 'left' ? rect.x + pad : align === 'right' ? rect.x + rect.w - pad : rect.x + rect.w / 2;
  const y = valign === 'top' ? rect.y + pad : valign === 'center' ? rect.y + rect.h / 2 : rect.y + rect.h - pad;
  return { x, y };
}

// 'custom' carries its own two colours; the presets derive a shadow that reads
// against whatever the ink is.
function inkOf(cfg) {
  if (cfg.color === 'custom') return cfg.inkColor || '#ffffff';
  return cfg.color === 'black' ? '#111111' : '#ffffff';
}

function shadowOf(cfg) {
  if (!cfg.shadow) return null;
  if (cfg.color === 'custom') return cfg.shadowColor || '#000000';
  return cfg.color === 'white' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
}

function applyShadow(ctx, cfg, size) {
  const shade = shadowOf(cfg);
  if (!shade) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; return; }
  ctx.shadowColor = shade;
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.03;
}

function drawCoverText(ctx, rect, cfg, pxPerMM) {
  const title = (cfg.title || '').trim();
  const sub = [cfg.subtitle, cfg.author].map(s => (s || '').trim()).filter(Boolean).join('  ');
  if (!title && !sub) return;

  const font = fontById(cfg.font);
  const pad = rect.w * 0.08;
  const maxW = rect.w - pad * 2;
  const scale = TITLE_SCALE[cfg.titleSize] ?? 1;
  ctx.save();
  ctx.fillStyle = inkOf(cfg);

  const block = [];
  let titleSize = 0;
  if (title) {
    const t = typesetTitle(ctx, title, maxW, font, scale, rect.w);
    titleSize = t.size;
    t.lines.forEach(ln => block.push({ text: ln, size: t.size, leading: t.size * font.leading, tracking: 0 }));
  }
  if (sub) {
    const base = titleSize || font.cap * rect.w * scale;
    const size = Math.min(base * font.subScale, fitToWidth(ctx, sub, font.family, maxW) * 0.95);
    block.push({ text: sub.toUpperCase(), size, leading: size * 1.6, tracking: font.tracking, gapBefore: size * 0.9 });
  }

  const total = block.reduce((s, b) => s + b.leading + (b.gapBefore || 0), 0);
  const anchor = textAnchor(rect, cfg.align, cfg.valign, pad);
  let y = cfg.valign === 'top' ? anchor.y : cfg.valign === 'center' ? anchor.y - total / 2 : anchor.y - total;

  ctx.textBaseline = 'top';
  for (const b of block) {
    y += b.gapBefore || 0;
    ctx.font = `${b.size}px ${font.family}`;
    applyShadow(ctx, cfg, b.size);
    drawTracked(ctx, b.text, anchor.x, y, b.tracking, cfg.align);
    y += b.leading;
  }
  ctx.restore();
}

function drawCaption(ctx, rect, cap, pxPerMM) {
  const font = fontById(cap.font).family;
  const size = Math.round(rect.w * (CAPTION_SCALE[cap.size] ?? CAPTION_SCALE.medium));
  const pad = rect.w * 0.06;
  const maxW = rect.w - pad * 2;
  const lines = wrapLines(ctx, cap.text, font, size, maxW);
  const leading = size * 1.35;
  const total = lines.length * leading;

  const anchor = textAnchor(rect, cap.align, cap.valign, pad);
  let y = cap.valign === 'top' ? anchor.y : cap.valign === 'center' ? anchor.y - total / 2 : anchor.y - total;

  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = cap.align;
  ctx.fillStyle = inkOf(cap);
  applyShadow(ctx, cap, size);
  for (const ln of lines) {
    ctx.fillText(ln, anchor.x, y);
    y += leading;
  }
  ctx.restore();
}

function drawGuides(ctx, geo) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = Math.max(1, geo.k * 0.15);

  PANELS.forEach((_, i) => {
    const r = panelRect(geo, i);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  });

  // The slit that turns the folded sheet into pages runs along the centre fold
  // across the two middle panels only.
  const midY = geo.margin + geo.panelH + geo.gap / 2;
  const x0 = geo.margin + (geo.panelW + geo.gap);
  const x1 = x0 + geo.panelW * 2 + geo.gap;
  ctx.strokeStyle = 'rgba(200,30,30,0.85)';
  ctx.lineWidth = Math.max(1.5, geo.k * 0.25);
  ctx.setLineDash([geo.k * 3, geo.k * 2]);
  ctx.beginPath();
  ctx.moveTo(x0, midY);
  ctx.lineTo(x1, midY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export { SPREADS, PANELS };
