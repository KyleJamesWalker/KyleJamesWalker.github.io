import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBox, innerFromOuter, outerFromInner, roundForUnit, stepForUnit, toSVG, toMM, fromMM } from './geometry.js';

const base = { length: 500, width: 300, height: 80, thickness: 3 };
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

const outlineFits = (piece) => {
  for (const [x, y] of piece.outline) {
    assert.ok(x >= -1e-9 && x <= piece.width + 1e-9, `x ${x} outside 0..${piece.width}`);
    assert.ok(y >= -1e-9 && y <= piece.height + 1e-9, `y ${y} outside 0..${piece.height}`);
  }
};

/** Slot paths open "M<x> <y1>L<x> <y2>", so the pair gives the slot's span. */
const slotSpan = (path) => {
  const [, y1, y2] = path.d.match(/^M[\d.-]+ ([\d.-]+)L[\d.-]+ ([\d.-]+)/).map(Number);
  return { centre: (y1 + y2) / 2, x: Number(path.d.match(/^M([\d.-]+)/)[1]) };
};

test('unit conversion round-trips', () => {
  close(fromMM(toMM(2.5, 'in'), 'in'), 2.5, 'inches');
  close(toMM(1, 'in'), 25.4, 'one inch');
  close(toMM(7, 'mm'), 7, 'mm passthrough');
});

for (const variant of ['tray', 'mailer', 'sliplid']) {
  test(`${variant}: inner and outer dimensions are inverses`, () => {
    const dims = { L: 500, W: 300, H: 80, t: 3, lidClearance: 0.4 };
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

  test(`${variant}: each end carries a side wall, a roll and a return`, () => {
    const box = buildBox({ ...base, variant });
    for (const piece of box.pieces) {
      const { x, roll, ret } = piece.metrics;
      close(x.x4 - x.x3, x.x6 - x.x5, 'side walls match');
      close(x.x3 - x.x2, roll, 'left roll panel');
      close(x.x7 - x.x6, roll, 'right roll panel');
      close(x.x2 - x.x1, ret, 'left return panel');
      close(x.x8 - x.x7, ret, 'right return panel');
    }
  });

  test(`${variant}: the return reaches the base so its tabs can lock`, () => {
    const box = buildBox({ ...base, variant });
    for (const piece of box.pieces) {
      const { ret, lockLength, x } = piece.metrics;
      const wallHeight = x.x4 - x.x3;
      assert.ok(ret + lockLength >= wallHeight, `return ${ret}+${lockLength} cannot reach ${wallHeight}`);
    }
  });

  test(`${variant}: lock tabs register with the slots cut in the base`, () => {
    const box = buildBox({ ...base, variant });
    for (const piece of box.pieces) {
      const { x, lockY, slotInset, slotWidth } = piece.metrics;

      // Tab tips are the only outline points out at x9 and x0.
      const tipY = piece.outline.filter(([px]) => Math.abs(px - x.x9) < 1e-9).map(([, py]) => py);
      assert.equal(tipY.length, 4, 'two tabs on the right return');
      const tabCentres = [(tipY[0] + tipY[1]) / 2, (tipY[2] + tipY[3]) / 2].sort((a, b) => a - b);

      // Path coordinates are rounded to a micron on the way out, so compare
      // against the raw positions with that much slack.
      const slots = piece.cuts.slice(1, 5).map(slotSpan);
      const slotCentres = [...new Set(slots.map((s) => s.centre))].sort((a, b) => a - b);
      const wanted = [...lockY].sort((a, b) => a - b);
      assert.equal(slotCentres.length, 2, 'two slot positions per piece');
      slotCentres.forEach((centre, i) => {
        assert.ok(Math.abs(centre - tabCentres[i]) < 1e-3, `tab ${tabCentres[i]} misses slot ${centre}`);
        assert.ok(Math.abs(centre - wanted[i]) < 1e-3, `slot ${centre} is off lock position ${wanted[i]}`);
      });

      // Each slot sits one board in from its base crease, inside the base panel.
      for (const s of slots) {
        const fromLeft = s.x - x.x4;
        const fromRight = x.x5 - (s.x + slotWidth);
        assert.ok(
          Math.abs(fromLeft - slotInset) < 1e-3 || Math.abs(fromRight - slotInset) < 1e-3,
          `slot at ${s.x} is not inset ${slotInset} from a base crease`,
        );
      }
    }
  });
}

test('every fold-in flap is tapered rather than left square', () => {
  const has = (piece, x, y) =>
    piece.outline.some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6);

  for (const variant of ['tray', 'mailer', 'sliplid']) {
    for (const piece of buildBox({ ...base, variant }).pieces) {
      const { x, y, flap, flapTaper, wing, wingTaper } = piece.metrics;
      assert.ok(flapTaper > 0 && flapTaper < flap, `${variant}: end flap taper ${flapTaper}`);

      // Back and front end flaps, outer corners on both ends of the blank.
      for (const [edge, sign] of [[x.x4 - flap, 1], [x.x5 + flap, -1]]) {
        for (const corner of [y.yLid, y.y1, y.y2, y.y3]) {
          const inward = corner === y.yLid || corner === y.y2 ? 1 : -1;
          assert.ok(!has(piece, edge, corner), `${variant}: square corner at ${edge},${corner}`);
          assert.ok(has(piece, edge + sign * flapTaper, corner), `${variant}: missing taper run at ${corner}`);
          assert.ok(has(piece, edge, corner + inward * flapTaper), `${variant}: missing taper rise at ${corner}`);
        }
      }

      if (variant !== 'mailer') continue;
      assert.ok(wingTaper > 0 && wingTaper < wing, `wing taper ${wingTaper}`);

      // A tapered wing meets its outer edge at two points, each set back from
      // the fold edge by the taper. A square wing would meet it at the corners.
      // The tuck flap ears reach the same depth, so look below the tuck crease.
      const wingR = x.x5 + wing;
      const below = piece.outline.filter(([, py]) => py > y.yTuck);
      const outerY = below.filter(([px]) => Math.abs(px - wingR) < 1e-6).map(([, py]) => py);
      const runInY = below.filter(([px]) => Math.abs(px - (wingR - wingTaper)) < 1e-6).map(([, py]) => py);
      assert.equal(outerY.length, 2, 'right wing outer edge should have two tapered ends');
      assert.equal(runInY.length, 2, 'right wing taper should run in from the fold edge');
      outerY.sort((a, b) => a - b);
      runInY.sort((a, b) => a - b);
      close(outerY[0] - runInY[0], wingTaper, 'wing taper rises by the taper amount');
      close(runInY[1] - outerY[1], wingTaper, 'wing taper falls by the taper amount');
    }
  }
});

test('tray blank spans the base plus two roll-end arms', () => {
  const { length: L, width: W, height: H, thickness: t } = base;
  const [tray] = buildBox({ ...base, variant: 'tray' }).pieces;
  // arm = side wall H + roll 2t + return (H - t) + lock tab 2t
  close(tray.width, L + 2 * (2 * H + 3 * t), 'blank width');
  close(tray.height, W + 2 * H, 'blank height');
});

test('the tray is the mailer blank without its lid rows', () => {
  const { width: W, height: H } = base;
  const [tray] = buildBox({ ...base, variant: 'tray' }).pieces;
  const [mailer] = buildBox({ ...base, variant: 'mailer' }).pieces;
  close(mailer.width, tray.width, 'same blank width');
  // The extra rows are the tuck flap (H - t) and the lid panel (W + t).
  close(mailer.height - tray.height, H + W, 'lid rows');
  assert.deepEqual(mailer.metrics.x, tray.metrics.x, 'identical column layout');
});

test('mailer adds a tuck flap, a lid and wings above the back wall', () => {
  const { width: W, height: H, thickness: t } = base;
  const [mailer] = buildBox({ ...base, variant: 'mailer' }).pieces;
  const { y } = mailer.metrics;
  close(y.yTuck, H - t, 'tuck flap height');
  close(y.yLid - y.yTuck, W + t, 'lid panel reaches the front wall');
  close(y.y1 - y.yLid, H, 'back wall');
  close(y.y2 - y.y1, W, 'base');
  close(y.y3 - y.y2, H, 'front wall');
});

test('tray has no lid rows at all', () => {
  const [tray] = buildBox({ ...base, variant: 'tray' }).pieces;
  const { y } = tray.metrics;
  close(y.yTuck, 0, 'no tuck flap');
  close(y.yLid, 0, 'no lid panel');
});

test('every piece cuts four lock slots and parts the end flaps from the side walls', () => {
  for (const variant of ['tray', 'mailer', 'sliplid']) {
    for (const piece of buildBox({ ...base, variant }).pieces) {
      assert.equal(piece.cuts.length, 9, `${variant}: outline + 4 slots + 4 parting cuts`);
    }
  }
});

test('end flaps are trimmed so the front and back pair cannot collide', () => {
  const box = buildBox({ ...base, width: 100, variant: 'tray' });
  const [tray] = box.pieces;
  assert.ok(2 * tray.metrics.flap <= 100, 'end flaps overlap inside the box');
  assert.ok(box.warnings.some((w) => w.includes('end flaps were trimmed')), box.warnings.join('|'));
});

test('lock tabs are trimmed so the two on a side stay clear of each other', () => {
  const box = buildBox({ ...base, lockWidth: 500, variant: 'tray' });
  assert.ok(box.pieces[0].metrics.lockWidth <= base.width * 0.4);
  assert.ok(box.warnings.some((w) => w.includes('Lock tabs trimmed')), box.warnings.join('|'));
});

test('slip lid is a base plus a lid sized to clear the base outside', () => {
  const clearance = 0.4;
  const box = buildBox({ ...base, variant: 'sliplid', lidClearance: clearance, lidDepth: 30 });
  const [baseTray, lid] = box.pieces;
  assert.equal(baseTray.name, 'Base');
  assert.equal(lid.name, 'Lid');
  const lidInnerL = lid.metrics.x.x5 - lid.metrics.x.x4;
  close(lidInnerL, base.length + 2 * base.thickness + 2 * clearance, 'lid clears the base outside');
});

test('slip lid warns when the lid is too deep to seat', () => {
  const box = buildBox({ ...base, variant: 'sliplid', lidDepth: 90 });
  assert.ok(box.warnings.some((w) => w.includes('bottom out')), box.warnings.join('|'));
});

test('impossible outer dimensions are reported rather than drawn', () => {
  const box = buildBox({ length: 4, width: 4, height: 4, thickness: 3, variant: 'tray', dimensionMode: 'outer' });
  assert.ok(box.errors.length > 0);
  assert.equal(box.pieces.length, 0);
});

test('SVG carries millimetre page size and separate cut and fold layers', () => {
  const box = buildBox({ ...base, variant: 'mailer' });
  const svg = toSVG(box);
  assert.match(svg, /width="848mm"/);
  assert.match(svg, /viewBox="0 0 848 850"/);
  assert.match(svg, /<g id="cut"/);
  assert.match(svg, /<g id="fold"/);
  assert.ok(!svg.includes('NaN'), 'no NaN coordinates');
  assert.ok(!svg.includes('id="engrave"'), 'labels are opt-in');
  assert.match(toSVG(box, { showLabels: true }), /id="engrave"/);
});

/** Mirrors how a number input validates: value - min must be a whole multiple of step. */
const onStepGrid = (value, step) => {
  const multiples = value / step;
  return Math.abs(multiples - Math.round(multiples)) < 1e-9;
};

test('converted values land on the step grid the input validates against', () => {
  const units = ['mm', 'in'];
  const samples = [200, 140, 60, 3, 0.4, 7.9, 2.5, 0.118, 63.5, 1];

  for (const from of units) {
    for (const to of units) {
      for (const value of samples) {
        const converted = roundForUnit(fromMM(toMM(value, from), to), to);
        assert.ok(
          onStepGrid(converted, stepForUnit(to)),
          `${value}${from} -> ${converted}${to} is off the ${stepForUnit(to)} grid`,
        );
      }
    }
  }
});

test('a unit round trip stays within the rounding precision', () => {
  // 3dp of an inch is the coarsest step, so it bounds the whole round trip.
  const tolerance = toMM(stepForUnit('in'), 'in');

  for (const value of [200, 140, 60, 3, 0.4, 7.9]) {
    const back = toMM(roundForUnit(fromMM(value, 'in'), 'in'), 'in');
    assert.ok(
      Math.abs(back - value) <= tolerance,
      `${value}mm -> in -> ${back}mm drifted more than ${tolerance}mm`,
    );
  }
});
