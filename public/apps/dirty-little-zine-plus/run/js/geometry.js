// Sheet geometry for the 8-page single-sheet zine imposition.

export const MM_PER_IN = 25.4;

export const PAPER = {
  letter: { label: 'US Letter', widthMM: 279.4, heightMM: 215.9 },
  a4:     { label: 'A4',        widthMM: 297,   heightMM: 210   },
  a3:     { label: 'A3',        widthMM: 420,   heightMM: 297   },
  tabloid:{ label: 'Tabloid',   widthMM: 431.8, heightMM: 279.4 },
};

export const MARGIN_MM = 6;
export const GAP_MM = 0;

// index = physical position on the printed sheet. Row 0 prints upside down.
export const PANELS = [
  { index: 0, row: 0, col: 0, role: 'inner', label: 'Page 7', page: 7 },
  { index: 1, row: 0, col: 1, role: 'inner', label: 'Page 6', page: 6 },
  { index: 2, row: 0, col: 2, role: 'inner', label: 'Page 5', page: 5 },
  { index: 3, row: 0, col: 3, role: 'inner', label: 'Page 4', page: 4 },
  { index: 4, row: 1, col: 0, role: 'back',  label: 'Back Cover', page: 8 },
  { index: 5, row: 1, col: 1, role: 'front', label: 'Front Cover', page: 1 },
  { index: 6, row: 1, col: 2, role: 'inner', label: 'Page 2', page: 2 },
  { index: 7, row: 1, col: 3, role: 'inner', label: 'Page 3', page: 3 },
];

// left/right are panel indices in READING order; on the top row that is the
// reverse of their left-to-right position, because the row prints rotated.
export const SPREADS = [
  { id: 0, left: 6, right: 7, label: 'Pages 2-3' },
  { id: 1, left: 3, right: 2, label: 'Pages 4-5' },
  { id: 2, left: 1, right: 0, label: 'Pages 6-7' },
];

export const READING_ORDER = [5, 6, 7, 3, 2, 1, 0, 4];

export function sheetPx(paperSize, dpi) {
  const p = PAPER[paperSize];
  const k = dpi / MM_PER_IN;
  return { w: Math.round(p.widthMM * k), h: Math.round(p.heightMM * k), k };
}

/** Panel grid in device pixels for the given paper and dpi. */
export function sheetGeometry(paperSize, dpi) {
  const { w, h, k } = sheetPx(paperSize, dpi);
  const margin = MARGIN_MM * k;
  const gap = GAP_MM * k;
  const panelW = (w - margin * 2 - gap * 3) / 4;
  const panelH = (h - margin * 2 - gap) / 2;
  return { w, h, k, margin, gap, panelW, panelH };
}

export function panelRect(geo, index) {
  const m = PANELS[index];
  return {
    x: geo.margin + m.col * (geo.panelW + geo.gap),
    y: geo.margin + m.row * (geo.panelH + geo.gap),
    w: geo.panelW,
    h: geo.panelH,
  };
}

/**
 * Every box the renderer draws into, in sheet space, with the rotation the
 * printed fold requires. A merged spread collapses its two panels into one
 * double-width box.
 */
export function renderBoxes(geo, state) {
  const merged = new Set();
  const boxes = [];

  state.spreads.forEach((sp, i) => {
    if (!sp.merged) return;
    const def = SPREADS[i];
    merged.add(def.left);
    merged.add(def.right);
    const a = panelRect(geo, def.left);
    const b = panelRect(geo, def.right);
    boxes.push({
      kind: 'spread',
      spreadId: i,
      panel: sp.panel,
      rotated: PANELS[def.left].row === 0,
      x: Math.min(a.x, b.x),
      y: a.y,
      w: a.w + geo.gap + b.w,
      h: a.h,
    });
  });

  PANELS.forEach(m => {
    if (merged.has(m.index)) return;
    const r = panelRect(geo, m.index);
    boxes.push({
      kind: 'panel',
      panelIndex: m.index,
      panel: state.panels[m.index],
      meta: m,
      rotated: m.row === 0,
      ...r,
    });
  });

  return boxes;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** object-fit: contain. No crop, so pan and zoom do not apply. */
export function containRect(imgW, imgH, box) {
  const ia = imgW / imgH;
  const ba = box.w / box.h;
  const dw = ia > ba ? box.w : box.h * ia;
  const dh = ia > ba ? box.w / ia : box.h;
  return {
    sx: 0, sy: 0, sw: imgW, sh: imgH,
    dx: box.x + (box.w - dw) / 2,
    dy: box.y + (box.h - dh) / 2,
    dw, dh,
  };
}

/**
 * object-fit: cover with zoom. zoom 1 is the tightest fit that still fills the
 * box; above that the source window shrinks and both axes gain pan slack.
 * offsetX/offsetY are -1..1 across whatever slack exists.
 */
export function coverRect(imgW, imgH, box, { offsetX = 0, offsetY = 0, zoom = 1 } = {}) {
  const ia = imgW / imgH;
  const ba = box.w / box.h;
  let sw = ia > ba ? imgH * ba : imgW;
  let sh = ia > ba ? imgH : imgW / ba;

  const z = Math.max(1, zoom);
  sw /= z;
  sh /= z;

  const slackX = Math.max(0, imgW - sw);
  const slackY = Math.max(0, imgH - sh);
  const sx = clamp(slackX / 2 + (offsetX * slackX) / 2, 0, slackX);
  const sy = clamp(slackY / 2 + (offsetY * slackY) / 2, 0, slackY);

  return { sx, sy, sw, sh, dx: box.x, dy: box.y, dw: box.w, dh: box.h, slackX, slackY };
}

export function fitRect(imgW, imgH, box, photo, fit) {
  return fit === 'contain'
    ? containRect(imgW, imgH, box)
    : coverRect(imgW, imgH, box, photo);
}
