// Multi-photo panel layouts. Cells are normalized 0..1 rects inside a panel.

export const LAYOUTS = [
  { id: 'single', label: 'Full bleed',   slots: 1, cells: [[0, 0, 1, 1]] },
  { id: 'stack2', label: '2 stacked',    slots: 2, cells: [[0, 0, 1, 1 / 2], [0, 1 / 2, 1, 1 / 2]] },
  { id: 'side2',  label: '2 side by side', slots: 2, cells: [[0, 0, 1 / 2, 1], [1 / 2, 0, 1 / 2, 1]] },
  { id: 'hero2',  label: 'Hero + band',  slots: 2, cells: [[0, 0, 1, 0.64], [0, 0.64, 1, 0.36]] },
  { id: 'stack3', label: '3 stacked',    slots: 3, cells: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] },
  { id: 'hero3',  label: 'Hero + 2',     slots: 3, cells: [[0, 0, 1, 0.58], [0, 0.58, 1 / 2, 0.42], [1 / 2, 0.58, 1 / 2, 0.42]] },
  { id: 'grid4',  label: '2 x 2 grid',   slots: 4, cells: [[0, 0, 1 / 2, 1 / 2], [1 / 2, 0, 1 / 2, 1 / 2], [0, 1 / 2, 1 / 2, 1 / 2], [1 / 2, 1 / 2, 1 / 2, 1 / 2]] },
  { id: 'strip4', label: '4 stacked',    slots: 4, cells: [[0, 0, 1, 1 / 4], [0, 1 / 4, 1, 1 / 4], [0, 2 / 4, 1, 1 / 4], [0, 3 / 4, 1, 1 / 4]] },
  { id: 'mag5',   label: 'Hero + 4',     slots: 5, cells: [[0, 0, 1, 0.5], [0, 0.5, 1 / 2, 0.25], [1 / 2, 0.5, 1 / 2, 0.25], [0, 0.75, 1 / 2, 0.25], [1 / 2, 0.75, 1 / 2, 0.25]] },
  { id: 'grid6',  label: '2 x 3 grid',   slots: 6, cells: [[0, 0, 1 / 2, 1 / 3], [1 / 2, 0, 1 / 2, 1 / 3], [0, 1 / 3, 1 / 2, 1 / 3], [1 / 2, 1 / 3, 1 / 2, 1 / 3], [0, 2 / 3, 1 / 2, 1 / 3], [1 / 2, 2 / 3, 1 / 2, 1 / 3]] },
];

// Spread layouts reuse the same table; a double-width box just gets wider cells.
export const LAYOUT_BY_ID = Object.fromEntries(LAYOUTS.map(l => [l.id, l]));

export function layoutFor(id) {
  return LAYOUT_BY_ID[id] || LAYOUT_BY_ID.single;
}

export function slotsFor(id) {
  return layoutFor(id).slots;
}

/**
 * Cell rects in device pixels. `gutter` separates neighbouring photos, `margin`
 * insets the whole block from the panel edge (0 keeps it full bleed).
 */
export function layoutRects(id, box, { gutter = 0, margin = 0 } = {}) {
  const eps = 1e-6;
  return layoutFor(id).cells.map(([cx, cy, cw, ch]) => {
    const left = box.x + cx * box.w;
    const top = box.y + cy * box.h;
    const right = left + cw * box.w;
    const bottom = top + ch * box.h;
    const iL = cx <= eps ? margin : gutter / 2;
    const iT = cy <= eps ? margin : gutter / 2;
    const iR = cx + cw >= 1 - eps ? margin : gutter / 2;
    const iB = cy + ch >= 1 - eps ? margin : gutter / 2;
    return {
      x: left + iL,
      y: top + iT,
      w: Math.max(1, right - left - iL - iR),
      h: Math.max(1, bottom - top - iT - iB),
    };
  });
}

/** Which cell contains a point, or -1. */
export function hitCell(rects, x, y) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
