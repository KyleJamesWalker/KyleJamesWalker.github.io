/**
 * Flat-blank geometry for laser-cut folding boxes.
 *
 * Everything in here works in millimetres with SVG screen coordinates
 * (x right, y down). One user unit in the emitted SVG equals one millimetre.
 */

export const MM_PER_INCH = 25.4;

export const toMM = (value, unit) => (unit === 'in' ? value * MM_PER_INCH : value);
export const fromMM = (value, unit) => (unit === 'in' ? value / MM_PER_INCH : value);

export const VARIANTS = [
  { id: 'tray', name: 'Open tray', blurb: 'Four walls, no lid. Corner tabs glue inside.' },
  { id: 'mailer', name: 'Locking flap lid', blurb: 'Hinged lid with a tuck flap that locks into the front wall.' },
  { id: 'sliplid', name: 'Slip-on lid', blurb: 'Two trays: a base plus a shallow lid that slides over it.' },
];

/** Sheet margin around the nested blanks. */
const MARGIN = 5;
/** Gap between separate pieces on the same sheet. */
const PIECE_GAP = 8;

const r = (n) => Math.round(n * 1000) / 1000;

const polygon = (points) => ({
  d: points.map(([x, y], i) => `${i ? 'L' : 'M'}${r(x)} ${r(y)}`).join(' ') + ' Z',
});

const segment = (x1, y1, x2, y2) => ({ d: `M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}` });

/** Stadium-shaped slot, centred on (cx, cy), running along x. */
const slot = (cx, cy, length, width) => {
  const rad = width / 2;
  const x1 = cx - length / 2 + rad;
  const x2 = cx + length / 2 - rad;
  return {
    d:
      `M${r(x1)} ${r(cy - rad)}L${r(x2)} ${r(cy - rad)}` +
      `A${r(rad)} ${r(rad)} 0 0 1 ${r(x2)} ${r(cy + rad)}` +
      `L${r(x1)} ${r(cy + rad)}` +
      `A${r(rad)} ${r(rad)} 0 0 1 ${r(x1)} ${r(cy - rad)}Z`,
  };
};

/** Horizontal fold line broken around each [from, to] gap so scores never cross a slot. */
const foldWithGaps = (y, x1, x2, gaps) => {
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = x1;
  for (const [from, to] of sorted) {
    if (from > cursor) out.push(segment(cursor, y, from, y));
    cursor = Math.max(cursor, to);
  }
  if (cursor < x2) out.push(segment(cursor, y, x2, y));
  return out;
};

const boundsOf = (points) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

/**
 * Open tray: bottom panel with four walls folded up and a glue tab on each
 * end of the two short walls. Also used for the base and lid of a slip-on set.
 */
export function trayPiece({ L, W, H, t, tabWidth, label }) {
  const tab = Math.min(tabWidth, H);
  const ch = Math.max(0, Math.min(2, tab / 3, H / 3));

  const x0 = 0;
  const x1 = H;
  const x2 = H + L;
  const x3 = H + L + H;
  const y0 = 0;
  const y1 = H;
  const y2 = H + W;
  const y3 = H + W + H;
  const tabTop = y1 - tab;
  const tabBottom = y2 + tab;

  const outline = [
    [x1, y0], [x2, y0],
    [x2, tabTop], [x3 - ch, tabTop], [x3, tabTop + ch],
    [x3, tabBottom - ch], [x3 - ch, tabBottom], [x2, tabBottom],
    [x2, y3], [x1, y3],
    [x1, tabBottom], [x0 + ch, tabBottom], [x0, tabBottom - ch],
    [x0, tabTop + ch], [x0 + ch, tabTop], [x1, tabTop],
  ];

  const folds = [
    segment(x0, y1, x3, y1),
    segment(x0, y2, x3, y2),
    segment(x1, y1, x1, y2),
    segment(x2, y1, x2, y2),
  ];

  return {
    name: label,
    outline,
    cuts: [polygon(outline)],
    folds,
    labels: [{ x: x1 + L / 2, y: y1 + W / 2, text: label }],
    ...boundsOf(outline),
  };
}

/**
 * Hinged-lid mailer in the spirit of FEFCO 0427. The lid hinges off the back
 * wall; its tuck flap drops inside the front wall and two lock tabs snap into
 * slots cut across the front wall crease.
 *
 * The lid panel runs one board deeper than the cavity so it reaches the top of
 * the front wall, and the tuck flap is inset at both ends so it slides past the
 * corner glue tabs instead of jamming against them.
 */
export function mailerPiece({ L, W, H, t, tabWidth, lockWidth, lockLength, slotClearance, label }) {
  const tab = Math.min(tabWidth, H);
  const ch = Math.max(0, Math.min(2, tab / 3, H / 3));
  const tuckInset = Math.min(tab + 1, L / 6);
  const lockW = Math.max(2, Math.min(lockWidth, L / 3, L * 0.5 - 2 * tuckInset));
  const lockCh = Math.max(0, Math.min(1.5, lockW / 4));
  const tuckH = Math.max(1, H - t);
  const lidDepth = W + t;
  const wingDepth = Math.max(1, H - t);
  const wingInset = 2 * t + 1;
  const wingCh = Math.max(0, Math.min(2, wingDepth / 3));

  const x0 = 0;
  const x1 = H;
  const x2 = H + L;
  const x3 = H + L + H;
  const wingL = x1 - wingDepth;
  const wingR = x2 + wingDepth;
  const tuckL = x1 + tuckInset;
  const tuckR = x2 - tuckInset;

  const y0 = 0;
  const y1 = lockLength;
  const y2 = y1 + tuckH;
  const y3 = y2 + lidDepth;
  const y4 = y3 + H;
  const y5 = y4 + W;
  const y6 = y5 + H;
  const tabTop = y4 - tab;
  const tabBottom = y5 + tab;
  const wingTop = y2 + wingInset;
  const wingBottom = y3 - wingInset;

  const lockCentres = [x1 + L * 0.25, x1 + L * 0.75];

  const outline = [[tuckL, y1]];
  for (const c of lockCentres) {
    outline.push(
      [c - lockW / 2, y1],
      [c - lockW / 2 + lockCh, y0],
      [c + lockW / 2 - lockCh, y0],
      [c + lockW / 2, y1],
    );
  }
  outline.push(
    [tuckR, y1], [tuckR, y2], [x2, y2],
    [x2, wingTop], [wingR - wingCh, wingTop], [wingR, wingTop + wingCh],
    [wingR, wingBottom - wingCh], [wingR - wingCh, wingBottom], [x2, wingBottom],
    [x2, tabTop], [x3 - ch, tabTop], [x3, tabTop + ch],
    [x3, tabBottom - ch], [x3 - ch, tabBottom], [x2, tabBottom],
    [x2, y6], [x1, y6],
    [x1, tabBottom], [x0 + ch, tabBottom], [x0, tabBottom - ch],
    [x0, tabTop + ch], [x0 + ch, tabTop], [x1, tabTop],
    [x1, wingBottom], [wingL + wingCh, wingBottom], [wingL, wingBottom - wingCh],
    [wingL, wingTop + wingCh], [wingL + wingCh, wingTop], [x1, wingTop],
    [x1, y2], [tuckL, y2],
  );

  const slotLength = lockW + slotClearance;
  const slotWidth = t + slotClearance;
  const slots = lockCentres.map((c) => slot(c, y5, slotLength, slotWidth));
  const slotGaps = lockCentres.map((c) => [c - slotLength / 2 - 1, c + slotLength / 2 + 1]);

  const folds = [
    segment(tuckL, y2, tuckR, y2),
    segment(x1, y3, x2, y3),
    segment(x0, y4, x3, y4),
    ...foldWithGaps(y5, x0, x3, slotGaps),
    segment(x1, y4, x1, y5),
    segment(x2, y4, x2, y5),
    segment(x1, wingTop, x1, wingBottom),
    segment(x2, wingTop, x2, wingBottom),
  ];

  return {
    name: label,
    outline,
    cuts: [polygon(outline), ...slots],
    folds,
    labels: [{ x: x1 + L / 2, y: y4 + W / 2, text: label }],
    ...boundsOf(outline),
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
  tabWidth = 15,
  lidDepth = 25,
  lidClearance = 0.4,
  lockWidth = 25,
  lockLength,
  slotClearance = 0.4,
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

  if (tabWidth > inner.H) {
    warnings.push(`Glue tabs trimmed to ${r(inner.H)} mm so they fit beside the walls on the blank.`);
  }

  const pieces = [];
  if (variant === 'mailer') {
    if (tabWidth + 1 > inner.L / 6) {
      warnings.push('Glue tabs are wide for this length, so the lid tuck flap was narrowed to clear them.');
    }
    pieces.push(
      mailerPiece({
        ...inner,
        t,
        tabWidth,
        lockWidth,
        lockLength: lockLength ?? t + 3,
        slotClearance,
        label: 'Mailer',
      }),
    );
  } else if (variant === 'sliplid') {
    const outerBase = outerFromInner('tray', { ...inner, t, lidClearance });
    pieces.push(trayPiece({ ...inner, t, tabWidth, label: 'Base' }));
    pieces.push(
      trayPiece({
        L: outerBase.L + 2 * lidClearance,
        W: outerBase.W + 2 * lidClearance,
        H: lidDepth,
        t,
        tabWidth,
        label: 'Lid',
      }),
    );
    if (lidDepth >= inner.H) {
      warnings.push('The lid is as deep as the base, so it will bottom out before it reaches the base rim.');
    }
  } else {
    pieces.push(trayPiece({ ...inner, t, tabWidth, label: 'Tray' }));
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
  const group = (piece, key) =>
    piece[key].map((path) => `<path d="${path.d}"/>`).join('');

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
