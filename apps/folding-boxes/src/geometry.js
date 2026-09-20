/**
 * Flat-blank geometry for laser-cut folding boxes.
 *
 * Everything in here works in millimetres with SVG screen coordinates
 * (x right, y down). One user unit in the emitted SVG equals one millimetre.
 *
 * All three styles share one roll-end core, the FEFCO 0400-series construction:
 * each end of the base carries a side wall, a narrow roll panel, and a return
 * panel that folds back down inside and locks into slots cut in the base. The
 * end flaps of the front and back walls are trapped inside that roll, which is
 * what makes the ends triple-thick and the whole box glue-free.
 */

export const MM_PER_INCH = 25.4;

export const toMM = (value, unit) => (unit === 'in' ? value * MM_PER_INCH : value);
export const fromMM = (value, unit) => (unit === 'in' ? value / MM_PER_INCH : value);

const UNIT_DECIMALS = { mm: 2, in: 3 };

/** A number input rejects any value off its step grid, so both must agree. */
export const roundForUnit = (value, unit) => Number(value.toFixed(UNIT_DECIMALS[unit]));
export const stepForUnit = (unit) => 10 ** -UNIT_DECIMALS[unit];

export const VARIANTS = [
  { id: 'tray', name: 'Open tray', blurb: 'Roll-end tray, no lid. The ends lock into the base.' },
  { id: 'mailer', name: 'Locking flap lid', blurb: 'The same tray plus a hinged lid whose eared flap tucks inside the front wall.' },
  { id: 'sliplid', name: 'Slip-on lid', blurb: 'Two roll-end trays: a base and a shallow lid that slides over it.' },
];

/** Sheet margin around the nested blanks. */
const MARGIN = 5;
/** Gap between separate pieces on the same sheet. */
const PIECE_GAP = 8;

const r = (n) => Math.round(n * 1000) / 1000;

/** Path builder that records its own corner points so bounds stay exact. */
const outline = () => {
  const parts = [];
  const points = [];
  const api = {
    points,
    move(x, y) {
      parts.push(`M${r(x)} ${r(y)}`);
      points.push([x, y]);
      return api;
    },
    line(x, y) {
      parts.push(`L${r(x)} ${r(y)}`);
      points.push([x, y]);
      return api;
    },
    arc(radius, x, y) {
      parts.push(`A${r(radius)} ${r(radius)} 0 0 1 ${r(x)} ${r(y)}`);
      points.push([x, y]);
      return api;
    },
    path() {
      return { d: `${parts.join(' ')} Z` };
    },
  };
  return api;
};

const segment = (x1, y1, x2, y2) => ({ d: `M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}` });

/** Stadium-shaped slot centred on (cx, cy), long axis running along y. */
const slot = (cx, cy, length, width) => {
  const rad = width / 2;
  const y1 = cy - length / 2 + rad;
  const y2 = cy + length / 2 - rad;
  return {
    d:
      `M${r(cx - rad)} ${r(y1)}L${r(cx - rad)} ${r(y2)}` +
      `A${r(rad)} ${r(rad)} 0 0 0 ${r(cx + rad)} ${r(y2)}` +
      `L${r(cx + rad)} ${r(y1)}` +
      `A${r(rad)} ${r(rad)} 0 0 0 ${r(cx - rad)} ${r(y1)}Z`,
  };
};

const boundsOf = (points) => ({
  width: Math.max(...points.map((p) => p[0])),
  height: Math.max(...points.map((p) => p[1])),
});

/**
 * One roll-end piece, with or without a hinged lid.
 *
 * Panel columns across the blank, left to right:
 *   lock tabs | return | roll | side wall | BASE | side wall | roll | return | lock tabs
 *
 * Panel rows down the blank (lid rows only when `withLid`):
 *   tuck flap | lid | back wall | BASE | front wall
 */
export function rollEndPiece({ L, W, H, t, lockWidth, slotClearance, withLid, lidDepth, label }) {
  const roll = 2 * t;
  const ret = Math.max(1, H - t);
  const lockLength = 2 * t;
  const lockW = Math.max(2, Math.min(lockWidth, W * 0.4));
  const flap = Math.max(1, Math.min(H, (W - 2) / 2));
  const wing = Math.max(1, H - 2 * t);
  const tuckHeight = Math.max(1, H - t);
  // Relief at the front corner, where the ear and the wing both fold inwards.
  const wingLead = Math.max(2 * t + 2, H * 0.12);
  const wingTail = t + 1;
  const earRadius = Math.max(0, Math.min(wing * 0.9, tuckHeight * 0.9));
  const tabCh = Math.max(0, Math.min(1.5, lockLength / 2, lockW / 6));

  const x0 = 0;
  const x1 = lockLength;
  const x2 = x1 + ret;
  const x3 = x2 + roll;
  const x4 = x3 + H;
  const x5 = x4 + L;
  const x6 = x5 + H;
  const x7 = x6 + roll;
  const x8 = x7 + ret;
  const x9 = x8 + lockLength;

  const flapL = x4 - flap;
  const flapR = x5 + flap;
  const wingL = x4 - wing;
  const wingR = x5 + wing;
  const earL = x4 - wing;
  const earR = x5 + wing;

  const yTop = 0;
  const yTuck = withLid ? tuckHeight : 0;
  const yLid = withLid ? yTuck + lidDepth : 0;
  const y1 = yLid + H;
  const y2 = y1 + W;
  const y3 = y2 + H;
  const wingTop = yTuck + wingLead;
  const wingBottom = yLid - wingTail;

  // Fold-in flaps taper at their free corners so those corners clear the panels
  // they land against instead of catching on them.
  const wingSpan = wingBottom - wingTop;
  const wingTaper = Math.max(0, Math.min(wing * 0.25, wingSpan * 0.1, wing - 1, wingSpan / 2 - 1));
  const flapTaper = Math.max(0, Math.min(flap * 0.25, H * 0.2, flap - 1, H / 2 - 1));

  const lockY = [y1 + W * 0.28, y1 + W * 0.72];

  // The return panel lands one board inside the side wall, so the slots that
  // catch its tabs sit that far in from the base edge.
  const slotInset = Math.max(0, roll - t);
  const slotWidth = t + slotClearance;

  const o = outline();
  if (withLid) {
    o.move(earL, yTuck)
      .line(earL, yTop + earRadius)
      .arc(earRadius, earL + earRadius, yTop)
      .line(earR - earRadius, yTop)
      .arc(earRadius, earR, yTop + earRadius)
      .line(earR, yTuck)
      .line(x5, yTuck)
      .line(x5, wingTop)
      .line(wingR - wingTaper, wingTop)
      .line(wingR, wingTop + wingTaper)
      .line(wingR, wingBottom - wingTaper)
      .line(wingR - wingTaper, wingBottom)
      .line(x5, wingBottom)
      .line(x5, yLid)
      .line(flapR - flapTaper, yLid)
      .line(flapR, yLid + flapTaper);
  } else {
    o.move(flapL + flapTaper, yTop).line(flapR - flapTaper, yTop).line(flapR, yTop + flapTaper);
  }

  o.line(flapR, y1 - flapTaper).line(flapR - flapTaper, y1).line(x8, y1);
  for (const cy of lockY) {
    o.line(x8, cy - lockW / 2)
      .line(x9, cy - lockW / 2 + tabCh)
      .line(x9, cy + lockW / 2 - tabCh)
      .line(x8, cy + lockW / 2);
  }
  o.line(x8, y2)
    .line(flapR - flapTaper, y2)
    .line(flapR, y2 + flapTaper)
    .line(flapR, y3 - flapTaper)
    .line(flapR - flapTaper, y3)
    .line(flapL + flapTaper, y3)
    .line(flapL, y3 - flapTaper)
    .line(flapL, y2 + flapTaper)
    .line(flapL + flapTaper, y2)
    .line(x1, y2);
  for (const cy of [...lockY].reverse()) {
    o.line(x1, cy + lockW / 2)
      .line(x0, cy + lockW / 2 - tabCh)
      .line(x0, cy - lockW / 2 + tabCh)
      .line(x1, cy - lockW / 2);
  }
  o.line(x1, y1).line(flapL + flapTaper, y1).line(flapL, y1 - flapTaper);

  if (withLid) {
    o.line(flapL, yLid + flapTaper)
      .line(flapL + flapTaper, yLid)
      .line(x4, yLid)
      .line(x4, wingBottom)
      .line(wingL + wingTaper, wingBottom)
      .line(wingL, wingBottom - wingTaper)
      .line(wingL, wingTop + wingTaper)
      .line(wingL + wingTaper, wingTop)
      .line(x4, wingTop)
      .line(x4, yTuck)
      .line(earL, yTuck);
  } else {
    o.line(flapL, yTop + flapTaper).line(flapL + flapTaper, yTop);
  }

  const slots = [];
  for (const cy of lockY) {
    slots.push(slot(x4 + slotInset + slotWidth / 2, cy, lockW, slotWidth));
    slots.push(slot(x5 - slotInset - slotWidth / 2, cy, lockW, slotWidth));
  }

  // The end flaps and the side walls both hinge on x4 and x5, so they have to
  // be parted along the base creases.
  const partingCuts = [
    segment(flapL + flapTaper, y1, x4, y1),
    segment(flapL + flapTaper, y2, x4, y2),
    segment(x5, y1, flapR - flapTaper, y1),
    segment(x5, y2, flapR - flapTaper, y2),
  ];

  const folds = [
    segment(x4, y1, x4, y2),
    segment(x5, y1, x5, y2),
    segment(x3, y1, x3, y2),
    segment(x6, y1, x6, y2),
    segment(x2, y1, x2, y2),
    segment(x7, y1, x7, y2),
    segment(x4, y1, x5, y1),
    segment(x4, y2, x5, y2),
    segment(x4, yLid, x4, y3),
    segment(x5, yLid, x5, y3),
  ];
  if (withLid) {
    folds.push(
      segment(x4, yTuck, x5, yTuck),
      segment(x4, yLid, x5, yLid),
      segment(x4, yTop, x4, yTuck),
      segment(x5, yTop, x5, yTuck),
      segment(x4, wingTop, x4, wingBottom),
      segment(x5, wingTop, x5, wingBottom),
    );
  }

  return {
    name: label,
    outline: o.points,
    cuts: [o.path(), ...slots, ...partingCuts],
    folds,
    labels: [{ x: x4 + L / 2, y: y1 + W / 2, text: label }],
    metrics: {
      roll,
      ret,
      lockLength,
      lockWidth: lockW,
      flap,
      wing,
      slotInset,
      slotWidth,
      wingTaper,
      flapTaper,
      lockY,
      x: { x0, x1, x2, x3, x4, x5, x6, x7, x8, x9 },
      y: { yTop, yTuck, yLid, y1, y2, y3 },
    },
    ...boundsOf(o.points),
  };
}

/**
 * Convert the dimensions the user typed into the inner cavity of the box.
 * Each variant stacks material differently, so the offsets differ per variant.
 */
export function innerFromOuter(variant, { L, W, H, t, lidClearance }) {
  if (variant === 'mailer') {
    return { L: L - 2 * t, W: W - 2 * t, H: H - 2 * t };
  }
  if (variant === 'sliplid') {
    const wall = 4 * t + 2 * lidClearance;
    return { L: L - wall, W: W - wall, H: H - 2 * t };
  }
  return { L: L - 2 * t, W: W - 2 * t, H: H - t };
}

export function outerFromInner(variant, { L, W, H, t, lidClearance }) {
  if (variant === 'mailer') {
    return { L: L + 2 * t, W: W + 2 * t, H: H + 2 * t };
  }
  if (variant === 'sliplid') {
    const wall = 4 * t + 2 * lidClearance;
    return { L: L + wall, W: W + wall, H: H + 2 * t };
  }
  return { L: L + 2 * t, W: W + 2 * t, H: H + t };
}

/**
 * Build the complete sheet for a box.
 *
 * All numeric inputs are millimetres. `dimensionMode` selects whether L/W/H
 * describe the inner cavity or the finished outside of the assembled box.
 */
export function buildBox({
  variant = 'tray',
  dimensionMode = 'inner',
  length,
  width,
  height,
  thickness,
  lockWidth = 40,
  slotClearance = 0.4,
  lidDepth = 25,
  lidClearance = 0.4,
} = {}) {
  const t = thickness;
  const typed = { L: length, W: width, H: height, t, lidClearance };
  const inner =
    dimensionMode === 'outer'
      ? innerFromOuter(variant, typed)
      : { L: length, W: width, H: height };

  const warnings = [];
  const errors = [];

  const names = { L: 'length', W: 'width', H: 'height' };
  for (const [key, value] of Object.entries(inner)) {
    if (!(value > 0)) {
      errors.push(
        `Inner ${names[key]} works out to ${r(value)} mm. Increase the outside ${names[key]} or use thinner material.`,
      );
    }
  }
  if (!(t > 0)) errors.push('Material thickness must be greater than zero.');
  if (errors.length) return { errors, warnings, pieces: [], sheet: { width: 0, height: 0 } };

  if (inner.H <= 2 * t) {
    warnings.push('The walls are barely thicker than the board, so the roll ends will not close cleanly.');
  }
  if (2 * inner.H > inner.W - 2) {
    warnings.push('Walls are tall relative to the width, so the front and back end flaps were trimmed to avoid meeting.');
  }
  if (lockWidth > inner.W * 0.4) {
    warnings.push(`Lock tabs trimmed to ${r(inner.W * 0.4)} mm so the two tabs on each side stay clear of each other.`);
  }

  const shared = { t, lockWidth, slotClearance };
  const pieces = [];
  if (variant === 'mailer') {
    pieces.push(
      rollEndPiece({ ...inner, ...shared, withLid: true, lidDepth: inner.W + t, label: 'Mailer' }),
    );
  } else if (variant === 'sliplid') {
    const outerBase = outerFromInner('tray', { ...inner, t, lidClearance });
    pieces.push(rollEndPiece({ ...inner, ...shared, withLid: false, label: 'Base' }));
    pieces.push(
      rollEndPiece({
        L: outerBase.L + 2 * lidClearance,
        W: outerBase.W + 2 * lidClearance,
        H: lidDepth,
        ...shared,
        withLid: false,
        label: 'Lid',
      }),
    );
    if (lidDepth >= inner.H) {
      warnings.push('The lid is as deep as the base, so it will bottom out before it reaches the base rim.');
    }
  } else {
    pieces.push(rollEndPiece({ ...inner, ...shared, withLid: false, label: 'Tray' }));
  }

  let cursorX = MARGIN;
  for (const piece of pieces) {
    piece.x = cursorX;
    piece.y = MARGIN;
    cursorX += piece.width + PIECE_GAP;
  }

  const sheet = {
    width: r(cursorX - PIECE_GAP + MARGIN),
    height: r(Math.max(...pieces.map((p) => p.height)) + 2 * MARGIN),
  };

  const outer = outerFromInner(variant, { ...inner, t, lidClearance });

  return {
    pieces,
    sheet,
    errors,
    warnings,
    dims: {
      inner: { L: r(inner.L), W: r(inner.W), H: r(inner.H) },
      outer: { L: r(outer.L), W: r(outer.W), H: r(outer.H) },
    },
  };
}

/** Serialise a built box as a laser-ready SVG: one layer for cuts, one for folds. */
export function toSVG(box, { cutColor = '#000000', foldColor = '#0000ff', strokeWidth = 0.1, showLabels = false } = {}) {
  const { sheet, pieces } = box;
  const group = (piece, key) => piece[key].map((path) => `<path d="${path.d}"/>`).join('');

  const cuts = pieces
    .map((p) => `<g transform="translate(${r(p.x)} ${r(p.y)})">${group(p, 'cuts')}</g>`)
    .join('');
  const folds = pieces
    .map((p) => `<g transform="translate(${r(p.x)} ${r(p.y)})">${group(p, 'folds')}</g>`)
    .join('');
  const labels = showLabels
    ? pieces
        .map(
          (p) =>
            `<g transform="translate(${r(p.x)} ${r(p.y)})">` +
            p.labels
              .map(
                (l) =>
                  `<text x="${r(l.x)}" y="${r(l.y)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="6">${l.text}</text>`,
              )
              .join('') +
            '</g>',
        )
        .join('')
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" ` +
    `viewBox="0 0 ${sheet.width} ${sheet.height}">` +
    `<g id="cut" fill="none" stroke="${cutColor}" stroke-width="${strokeWidth}">${cuts}</g>` +
    `<g id="fold" fill="none" stroke="${foldColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 2">${folds}</g>` +
    (labels ? `<g id="engrave" fill="none" stroke="${foldColor}" stroke-width="${strokeWidth}">${labels}</g>` : '') +
    '</svg>'
  );
}
