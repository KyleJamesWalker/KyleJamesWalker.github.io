import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBox, innerFromOuter, outerFromInner, toSVG, toMM, fromMM } from './geometry.js';

const base = { length: 150, width: 100, height: 50, thickness: 3 };
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

const outlineFits = (piece) => {
  for (const [x, y] of piece.outline) {
    assert.ok(x >= -1e-9 && x <= piece.width + 1e-9, `x ${x} outside 0..${piece.width}`);
    assert.ok(y >= -1e-9 && y <= piece.height + 1e-9, `y ${y} outside 0..${piece.height}`);
  }
};

test('unit conversion round-trips', () => {
  close(fromMM(toMM(2.5, 'in'), 'in'), 2.5, 'inches');
  close(toMM(1, 'in'), 25.4, 'one inch');
  close(toMM(7, 'mm'), 7, 'mm passthrough');
});

for (const variant of ['tray', 'mailer', 'sliplid']) {
  test(`${variant}: inner and outer dimensions are inverses`, () => {
    const dims = { L: 150, W: 100, H: 50, t: 3, lidClearance: 0.4 };
    const outer = outerFromInner(variant, dims);
    const back = innerFromOuter(variant, { ...outer, t: dims.t, lidClearance: dims.lidClearance });
    close(back.L, dims.L, 'L');
    close(back.W, dims.W, 'W');
    close(back.H, dims.H, 'H');
  });

  test(`${variant}: outer mode reproduces the requested outside size`, () => {
    const box = buildBox({ ...base, variant, dimensionMode: 'outer' });
    assert.deepEqual(box.errors, []);
    close(box.dims.outer.L, base.length, 'outer L');
    close(box.dims.outer.W, base.width, 'outer W');
    close(box.dims.outer.H, base.height, 'outer H');
  });

  test(`${variant}: every piece outline stays inside its own bounding box`, () => {
    const box = buildBox({ ...base, variant });
    assert.ok(box.pieces.length > 0);
    box.pieces.forEach(outlineFits);
  });

  test(`${variant}: sheet is large enough to hold every piece`, () => {
    const box = buildBox({ ...base, variant });
    for (const piece of box.pieces) {
      assert.ok(piece.x + piece.width <= box.sheet.width + 1e-9, 'piece overflows sheet width');
      assert.ok(piece.y + piece.height <= box.sheet.height + 1e-9, 'piece overflows sheet height');
    }
  });
}

test('tray outer size adds one wall per side and one bottom', () => {
  const box = buildBox({ ...base, variant: 'tray' });
  close(box.dims.outer.L, 156, 'outer L');
  close(box.dims.outer.W, 106, 'outer W');
  close(box.dims.outer.H, 53, 'outer H');
});

test('tray blank spans length plus two wall heights', () => {
  const [tray] = buildBox({ ...base, variant: 'tray' }).pieces;
  close(tray.width, 150 + 2 * 50, 'blank width');
  close(tray.height, 100 + 2 * 50, 'blank height');
});

test('mailer blank stacks tuck, lid, back, bottom and front', () => {
  const [mailer] = buildBox({ ...base, variant: 'mailer' }).pieces;
  const lockLength = base.thickness + 3;
  const tuck = base.height - base.thickness;
  const lid = base.width + base.thickness;
  close(mailer.width, 150 + 2 * 50, 'blank width');
  close(mailer.height, lockLength + tuck + lid + 50 + 100 + 50, 'blank height');
});

test('mailer lid is one board deeper than the cavity so it meets the front wall', () => {
  const [mailer] = buildBox({ ...base, variant: 'mailer' }).pieces;
  const yOf = (fold) => Number(fold.d.match(/^M[\d.-]+ ([\d.-]+)/)[1]);
  const [tuckHinge, lidHinge] = mailer.folds;
  close(yOf(lidHinge) - yOf(tuckHinge), base.width + base.thickness, 'lid panel depth');
});

test('mailer tuck flap clears the corner glue tabs at both ends', () => {
  const tabWidth = 15;
  const [mailer] = buildBox({ ...base, variant: 'mailer', tabWidth }).pieces;
  const lockLength = base.thickness + 3;
  const flap = mailer.outline.filter(([, y]) => Math.abs(y - lockLength) < 1e-9);
  const left = Math.min(...flap.map(([x]) => x));
  const right = Math.max(...flap.map(([x]) => x));
  // Panel edges sit at x = H and x = H + L; the flap must start inside both.
  assert.ok(left >= 50 + tabWidth, `flap left edge ${left} does not clear the glue tab`);
  assert.ok(right <= 50 + 150 - tabWidth, `flap right edge ${right} does not clear the glue tab`);
});

test('mailer cuts the two lock slots that the tuck flap tabs drop into', () => {
  const [mailer] = buildBox({ ...base, variant: 'mailer' }).pieces;
  assert.equal(mailer.cuts.length, 3, 'outline plus two slots');
});

test('slip lid is a base plus a lid sized to clear the base outside', () => {
  const clearance = 0.4;
  const box = buildBox({ ...base, variant: 'sliplid', lidClearance: clearance, lidDepth: 20 });
  const [baseTray, lid] = box.pieces;
  assert.equal(baseTray.name, 'Base');
  assert.equal(lid.name, 'Lid');

  // Lid blank width = lid inner length + two lid wall heights.
  const lidInnerL = lid.width - 2 * 20;
  close(lidInnerL, 150 + 2 * base.thickness + 2 * clearance, 'lid inner length clears the base outside');
});

test('slip lid warns when the lid is too deep to seat', () => {
  const box = buildBox({ ...base, variant: 'sliplid', lidDepth: 60 });
  assert.ok(box.warnings.some((w) => w.includes('bottom out')), box.warnings.join('|'));
});

test('impossible outer dimensions are reported rather than drawn', () => {
  const box = buildBox({ length: 4, width: 4, height: 4, thickness: 3, variant: 'tray', dimensionMode: 'outer' });
  assert.ok(box.errors.length > 0);
  assert.equal(box.pieces.length, 0);
});

test('glue tabs never grow past the wall height', () => {
  const box = buildBox({ ...base, height: 10, tabWidth: 40, variant: 'tray' });
  assert.ok(box.warnings.some((w) => w.includes('Glue tabs trimmed')), box.warnings.join('|'));
  box.pieces.forEach(outlineFits);
});

test('SVG carries millimetre page size and separate cut and fold layers', () => {
  const box = buildBox({ ...base, variant: 'mailer' });
  const svg = toSVG(box);
  assert.match(svg, /width="260mm"/);
  assert.match(svg, /viewBox="0 0 260 366"/);
  assert.match(svg, /<g id="cut"/);
  assert.match(svg, /<g id="fold"/);
  assert.ok(!svg.includes('NaN'), 'no NaN coordinates');
  assert.ok(!svg.includes('id="engrave"'), 'labels are opt-in');
  assert.match(toSVG(box, { showLabels: true }), /id="engrave"/);
});
