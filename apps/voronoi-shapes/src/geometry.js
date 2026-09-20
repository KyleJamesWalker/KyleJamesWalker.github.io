import { Delaunay } from 'd3-delaunay';

// --- Algorithms ---

export function floodFill(imageData, startX, startY, tolerance) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const idx = (x, y) => (y * width + x) * 4;

  const si = idx(startX, startY);
  const sr = data[si], sg = data[si + 1], sb = data[si + 2], sa = data[si + 3];

  const matches = (x, y) => {
    const i = idx(x, y);
    return Math.abs(data[i] - sr) <= tolerance &&
      Math.abs(data[i + 1] - sg) <= tolerance &&
      Math.abs(data[i + 2] - sb) <= tolerance &&
      Math.abs(data[i + 3] - sa) <= tolerance;
  };

  const stack = [startX, startY];
  mask[startY * width + startX] = 1;
  let minX = startX, maxX = startX, minY = startY, maxY = startY;

  while (stack.length > 0) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    if (x + 1 < width && !mask[y * width + x + 1] && matches(x + 1, y)) {
      mask[y * width + x + 1] = 1; stack.push(x + 1, y);
    }
    if (x - 1 >= 0 && !mask[y * width + x - 1] && matches(x - 1, y)) {
      mask[y * width + x - 1] = 1; stack.push(x - 1, y);
    }
    if (y + 1 < height && !mask[(y + 1) * width + x] && matches(x, y + 1)) {
      mask[(y + 1) * width + x] = 1; stack.push(x, y + 1);
    }
    if (y - 1 >= 0 && !mask[(y - 1) * width + x] && matches(x, y - 1)) {
      mask[(y - 1) * width + x] = 1; stack.push(x, y - 1);
    }
  }

  return { mask, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

function erodeMask(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const r = Math.ceil(radius);

  // Horizontal pass: pixel survives only if all pixels in row within ±r are set
  const hPass = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = r; x < width - r; x++) {
      let ok = true;
      for (let dx = -r; dx <= r; dx++) {
        if (!mask[row + x + dx]) { ok = false; break; }
      }
      if (ok) hPass[row + x] = 1;
    }
  }

  // Vertical pass on horizontal result
  const result = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = r; y < height - r; y++) {
      let ok = true;
      for (let dy = -r; dy <= r; dy++) {
        if (!hPass[(y + dy) * width + x]) { ok = false; break; }
      }
      if (ok) result[y * width + x] = 1;
    }
  }
  return result;
}

function computeBounds(mask, width, height) {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count === 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function sampleBoundaryGuards(erodedMask, width, height, spacing) {
  // Find pixels just OUTSIDE the eroded mask that are adjacent to it.
  // These form a dense ring of guard Voronoi sites that push interior
  // cells inward, creating organic curved edges along boundaries.
  const guards = [];
  const cellSize = Math.max(2, Math.round(spacing));
  const seen = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (erodedMask[y * width + x]) continue; // skip interior pixels
      // Is this pixel adjacent to the eroded mask?
      const adj =
        (x > 0 && erodedMask[y * width + x - 1]) ||
        (x < width - 1 && erodedMask[y * width + x + 1]) ||
        (y > 0 && erodedMask[(y - 1) * width + x]) ||
        (y < height - 1 && erodedMask[(y + 1) * width + x]);
      if (!adj) continue;

      // Spatial subsampling — one guard per cellSize x cellSize grid cell
      const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      guards.push([x, y]);
    }
  }
  return guards;
}

function bestCandidateSampling(mask, bounds, canvasWidth, count) {
  const points = [];
  const candidatesPerPoint = 20;
  const maxAttempts = count * 100;
  let attempts = 0;

  while (points.length < count && attempts < maxAttempts) {
    let bestDist = -1;
    let bestX = 0, bestY = 0;

    const numCandidates = points.length === 0 ? 1 : candidatesPerPoint;
    for (let c = 0; c < numCandidates; c++) {
      const cx = bounds.x + Math.random() * bounds.w;
      const cy = bounds.y + Math.random() * bounds.h;
      const px = Math.floor(cx);
      const py = Math.floor(cy);

      if (px < 0 || py < 0 || px >= canvasWidth || !mask[py * canvasWidth + px]) {
        attempts++;
        continue;
      }

      let minDist = Infinity;
      for (const [ex, ey] of points) {
        const d = (cx - ex) * (cx - ex) + (cy - ey) * (cy - ey);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestDist) {
        bestDist = minDist;
        bestX = cx;
        bestY = cy;
      }
      attempts++;
    }

    if (bestDist >= 0) {
      points.push([bestX, bestY]);
    }
  }
  return points;
}

function interpolateColor(c1, c2, t) {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function generateCellColor(index, total, settings) {
  const { colorMode, colorPalette, gradientStart, gradientEnd } = settings;
  if (colorMode === 'outline') return 'none';
  if (colorMode === 'gradient') {
    return interpolateColor(gradientStart, gradientEnd, total > 1 ? index / (total - 1) : 0);
  }
  if (colorMode === 'palette') {
    return colorPalette[index % colorPalette.length];
  }
  return colorPalette[Math.floor(Math.random() * colorPalette.length)];
}

export function thickenStrokes(svgContent) {
  return svgContent
    .replace(/stroke-width\s*:\s*[\d.]+\s*[a-z]*/gi, 'stroke-width:2')
    .replace(/stroke-width\s*=\s*"[\d.]+[a-z]*"/gi, 'stroke-width="2"');
}

function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function insetPolygon(polygon, amount) {
  if (amount <= 0) return polygon;
  const n = polygon.length - 1; // d3 voronoi closes polygons (last === first)
  if (n < 3) return null;

  // Centroid for determining inward direction
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += polygon[i][0]; cy += polygon[i][1]; }
  cx /= n; cy /= n;

  // Offset each edge inward
  const edges = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = polygon[j][0] - polygon[i][0];
    const dy = polygon[j][1] - polygon[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) continue;

    // Normal perpendicular to edge
    let nx = -dy / len, ny = dx / len;

    // Ensure it points inward (toward centroid)
    const mx = (polygon[i][0] + polygon[j][0]) / 2;
    const my = (polygon[i][1] + polygon[j][1]) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) { nx = -nx; ny = -ny; }

    edges.push({
      x1: polygon[i][0] + nx * amount, y1: polygon[i][1] + ny * amount,
      x2: polygon[j][0] + nx * amount, y2: polygon[j][1] + ny * amount,
    });
  }

  if (edges.length < 3) return null;

  // Intersect adjacent offset edges to form the inset polygon
  const result = [];
  for (let i = 0; i < edges.length; i++) {
    const j = (i + 1) % edges.length;
    const pt = lineIntersection(
      edges[i].x1, edges[i].y1, edges[i].x2, edges[i].y2,
      edges[j].x1, edges[j].y1, edges[j].x2, edges[j].y2,
    );
    if (pt) result.push(pt);
  }

  if (result.length < 3) return null; // collapsed to nothing
  result.push(result[0]); // close the polygon
  return result;
}

function chaikinSmooth(polygon, iterations) {
  if (iterations <= 0) return polygon;
  let pts = polygon.slice(0, -1); // remove closing point

  for (let iter = 0; iter < iterations; iter++) {
    const next = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      next.push([
        0.75 * pts[i][0] + 0.25 * pts[j][0],
        0.75 * pts[i][1] + 0.25 * pts[j][1],
      ]);
      next.push([
        0.25 * pts[i][0] + 0.75 * pts[j][0],
        0.25 * pts[i][1] + 0.75 * pts[j][1],
      ]);
    }
    pts = next;
  }

  pts.push(pts[0]); // re-close
  return pts;
}

export function parseSVGDimensions(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  // Detect physical unit from width attribute (e.g. "190.000mm")
  const widthAttr = svg.getAttribute('width') || '';
  const unitMatch = widthAttr.match(/(mm|cm|in|pt)$/);
  const unit = unitMatch ? unitMatch[1] : '';

  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    return { width: parts[2], height: parts[3], unit };
  }
  return { width: parseFloat(widthAttr) || 800, height: parseFloat(svg.getAttribute('height')) || 600, unit };
}

function maskToSVGPath(mask, width, height, blockSize = 2) {
  const bw = Math.ceil(width / blockSize);
  const bh = Math.ceil(height / blockSize);

  const spans = [];
  for (let by = 0; by < bh; by++) {
    let bx = 0;
    while (bx < bw) {
      let count = 0, total = 0;
      for (let dy = 0; dy < blockSize && by * blockSize + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && bx * blockSize + dx < width; dx++) {
          total++;
          if (mask[(by * blockSize + dy) * width + (bx * blockSize + dx)]) count++;
        }
      }
      if (count > total / 2) {
        const startBx = bx;
        bx++;
        while (bx < bw) {
          let c2 = 0, t2 = 0;
          for (let dy = 0; dy < blockSize && by * blockSize + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && bx * blockSize + dx < width; dx++) {
              t2++;
              if (mask[(by * blockSize + dy) * width + (bx * blockSize + dx)]) c2++;
            }
          }
          if (c2 <= t2 / 2) break;
          bx++;
        }
        spans.push({ x: startBx * blockSize, y: by * blockSize, w: (bx - startBx) * blockSize, h: blockSize });
      } else {
        bx++;
      }
    }
  }

  // Merge vertically
  for (let i = 0; i < spans.length; i++) {
    if (!spans[i]) continue;
    for (let j = i + 1; j < spans.length; j++) {
      if (!spans[j]) continue;
      if (spans[j].x === spans[i].x && spans[j].w === spans[i].w && spans[j].y === spans[i].y + spans[i].h) {
        spans[i].h += spans[j].h;
        spans[j] = null;
      }
    }
  }

  return spans.filter(Boolean).map(s => `M${s.x} ${s.y}h${s.w}v${s.h}h${-s.w}Z`).join('');
}

function polygonArea(polygon) {
  let area = 0;
  const n = polygon.length - 1; // last point === first (closed)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area) / 2;
}

export function generateVoronoiForRegion(region, settings, canvasWidth, canvasHeight, pxPerUnit) {
  const gapPx = settings.gapWidth * pxPerUnit;
  const erosionRadius = Math.ceil(gapPx / 2);
  const erodedMask = erodeMask(region.mask, canvasWidth, canvasHeight, erosionRadius);
  const erodedBounds = computeBounds(erodedMask, canvasWidth, canvasHeight);
  if (!erodedBounds) return { cells: [], erodedMask };

  // Interior points — these become rendered cells
  const interiorPoints = bestCandidateSampling(erodedMask, erodedBounds, canvasWidth, settings.pointCount);
  if (interiorPoints.length < 2) return { cells: [], erodedMask };

  // Dense guard points tracing the eroded mask boundary — push interior
  // cells inward so they curve organically near edges instead of being
  // hard-clipped. Spacing ~1/4 of average inter-cell distance ensures
  // smooth curves even along rounded corners.
  const area = erodedBounds.w * erodedBounds.h;
  const avgSpacing = Math.sqrt(area / settings.pointCount);
  const guardSpacing = Math.max(3, Math.floor(avgSpacing / 4));
  const guardPoints = sampleBoundaryGuards(erodedMask, canvasWidth, canvasHeight, guardSpacing);

  const allPoints = [...interiorPoints, ...guardPoints];
  const delaunay = Delaunay.from(allPoints);
  const voronoi = delaunay.voronoi([0, 0, canvasWidth, canvasHeight]);
  const cells = [];
  const insetAmount = gapPx / 2; // half gap per side
  // Min cell area in px² — derived from the linear mm setting
  const minSizePx = settings.minCellSize * pxPerUnit;
  const minAreaPx = minSizePx * minSizePx;

  // Only generate cells for interior points (not guards)
  for (let i = 0; i < interiorPoints.length; i++) {
    const poly = voronoi.cellPolygon(i);
    if (!poly) continue;

    // Inset for laser-cut gaps, then smooth for organic look
    const inset = insetPolygon(poly, insetAmount);
    if (!inset) continue; // cell collapsed, skip

    // Drop cells that are too small to cut cleanly
    if (polygonArea(inset) < minAreaPx) continue;

    const smoothed = chaikinSmooth(inset, settings.smoothIterations);
    cells.push({
      polygon: smoothed,
      color: generateCellColor(i, interiorPoints.length, settings),
    });
  }
  return { cells, erodedMask };
}

export function renderToCanvas(ctx, canvasWidth, canvasHeight, svgImage, regions, voronoiMap, settings, pxPerUnit) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(svgImage, 0, 0, canvasWidth, canvasHeight);

  for (const region of regions) {
    const data = voronoiMap.get(region.id);
    const cells = data?.cells;
    const clipMask = data?.erodedMask || region.mask;

    // Create mask canvas using eroded mask for cell clipping
    const maskCvs = document.createElement('canvas');
    maskCvs.width = canvasWidth;
    maskCvs.height = canvasHeight;
    const maskCtx = maskCvs.getContext('2d');
    const maskImg = maskCtx.createImageData(canvasWidth, canvasHeight);
    for (let i = 0; i < clipMask.length; i++) {
      if (clipMask[i]) {
        const o = i * 4;
        maskImg.data[o] = 255;
        maskImg.data[o + 1] = 255;
        maskImg.data[o + 2] = 255;
        maskImg.data[o + 3] = 255;
      }
    }
    maskCtx.putImageData(maskImg, 0, 0);

    if (cells && cells.length > 0) {
      const cellCvs = document.createElement('canvas');
      cellCvs.width = canvasWidth;
      cellCvs.height = canvasHeight;
      const cellCtx = cellCvs.getContext('2d');
      cellCtx.globalAlpha = settings.cellOpacity;

      for (const cell of cells) {
        cellCtx.beginPath();
        cellCtx.moveTo(cell.polygon[0][0], cell.polygon[0][1]);
        for (let j = 1; j < cell.polygon.length; j++) {
          cellCtx.lineTo(cell.polygon[j][0], cell.polygon[j][1]);
        }
        cellCtx.closePath();
        if (settings.colorMode !== 'outline') {
          cellCtx.fillStyle = cell.color;
          cellCtx.fill();
        }
        const strokePx = settings.strokeWidth * pxPerUnit;
        if (strokePx > 0 || settings.colorMode === 'outline') {
          cellCtx.globalAlpha = 1;
          cellCtx.strokeStyle = settings.strokeColor;
          cellCtx.lineWidth = settings.colorMode === 'outline' ? Math.max(strokePx, 0.5) : strokePx;
          cellCtx.stroke();
          cellCtx.globalAlpha = settings.cellOpacity;
        }
      }

      cellCtx.globalCompositeOperation = 'destination-in';
      cellCtx.globalAlpha = 1;
      cellCtx.drawImage(maskCvs, 0, 0);

      ctx.drawImage(cellCvs, 0, 0);
    } else {
      // Highlight unprocessed region
      const [r, g, b] = region.color;
      const hImg = maskCtx.createImageData(canvasWidth, canvasHeight);
      for (let i = 0; i < region.mask.length; i++) {
        if (region.mask[i]) {
          const o = i * 4;
          hImg.data[o] = r;
          hImg.data[o + 1] = g;
          hImg.data[o + 2] = b;
          hImg.data[o + 3] = 80;
        }
      }
      const hCvs = document.createElement('canvas');
      hCvs.width = canvasWidth;
      hCvs.height = canvasHeight;
      hCvs.getContext('2d').putImageData(hImg, 0, 0);
      ctx.drawImage(hCvs, 0, 0);
    }
  }

  // Redraw strokes on top using multiply
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(svgImage, 0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = 'source-over';
}

// --- SVG path transform helpers ---
// Bake affine transforms directly into path coordinates so the output
// has no `transform` attributes (LightBurn ignores them).

function parseTransformAttr(s) {
  // Returns affine matrix [a, b, c, d, e, f] from a transform string.
  // SVG matrix(a,b,c,d,e,f): x' = a*x + c*y + e,  y' = b*x + d*y + f
  if (!s) return [1, 0, 0, 1, 0, 0];
  const m = s.match(/matrix\(\s*([-\d.e+]+)[\s,]+([-\d.e+]+)[\s,]+([-\d.e+]+)[\s,]+([-\d.e+]+)[\s,]+([-\d.e+]+)[\s,]+([-\d.e+]+)\s*\)/);
  if (m) return m.slice(1).map(Number);
  const t = s.match(/translate\(\s*([-\d.e+]+)[\s,]*([-\d.e+]*)\s*\)/);
  if (t) return [1, 0, 0, 1, Number(t[1]), Number(t[2] || 0)];
  return [1, 0, 0, 1, 0, 0];
}

function composeMat(m1, m2) {
  // m2 applied first, then m1.  [a c e][a c e]
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
  ];
}

function transformPathD(d, mat) {
  const [a, b, c, dd, e, f] = mat;
  const tx = (x, y) => [a * x + c * y + e, b * x + dd * y + f];
  const fmt = (v) => +v.toFixed(4);

  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return d;

  let out = '';
  let i = 0;
  let cx = 0, cy = 0; // current untransformed position

  while (i < tokens.length) {
    const cmd = tokens[i++];
    const abs = cmd === cmd.toUpperCase();
    const type = cmd.toUpperCase();
    if (type === 'Z') { out += 'Z'; continue; }

    const sizes = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7 };
    const sz = sizes[type] || 0;
    const vals = [];
    while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) vals.push(parseFloat(tokens[i++]));

    for (let j = 0; j < vals.length; j += sz) {
      if (type === 'M' || type === 'L' || type === 'T') {
        let x = vals[j], y = vals[j + 1];
        if (!abs) { x += cx; y += cy; }
        cx = x; cy = y;
        const [nx, ny] = tx(x, y);
        out += `${type}${fmt(nx)},${fmt(ny)}`;
      } else if (type === 'H') {
        let x = vals[j];
        if (!abs) x += cx;
        cx = x;
        const [nx, ny] = tx(x, cy);
        out += `L${fmt(nx)},${fmt(ny)}`;
      } else if (type === 'V') {
        let y = vals[j];
        if (!abs) y += cy;
        cy = y;
        const [nx, ny] = tx(cx, y);
        out += `L${fmt(nx)},${fmt(ny)}`;
      } else if (type === 'C') {
        let [x1, y1, x2, y2, x, y] = vals.slice(j, j + 6);
        if (!abs) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
        cx = x; cy = y;
        const [nx1, ny1] = tx(x1, y1);
        const [nx2, ny2] = tx(x2, y2);
        const [nx, ny] = tx(x, y);
        out += `C${fmt(nx1)},${fmt(ny1)} ${fmt(nx2)},${fmt(ny2)} ${fmt(nx)},${fmt(ny)}`;
      } else if (type === 'S') {
        let [x2, y2, x, y] = vals.slice(j, j + 4);
        if (!abs) { x2 += cx; y2 += cy; x += cx; y += cy; }
        cx = x; cy = y;
        const [nx2, ny2] = tx(x2, y2);
        const [nx, ny] = tx(x, y);
        out += `S${fmt(nx2)},${fmt(ny2)} ${fmt(nx)},${fmt(ny)}`;
      } else if (type === 'Q') {
        let [x1, y1, x, y] = vals.slice(j, j + 4);
        if (!abs) { x1 += cx; y1 += cy; x += cx; y += cy; }
        cx = x; cy = y;
        const [nx1, ny1] = tx(x1, y1);
        const [nx, ny] = tx(x, y);
        out += `Q${fmt(nx1)},${fmt(ny1)} ${fmt(nx)},${fmt(ny)}`;
      } else if (type === 'A') {
        let [rx, ry, xRot, la, sw, x, y] = vals.slice(j, j + 7);
        if (!abs) { x += cx; y += cy; }
        cx = x; cy = y;
        const det = a * dd - b * c;
        if (det < 0) sw = sw ? 0 : 1; // flip sweep on mirror
        const [nx, ny] = tx(x, y);
        out += `A${fmt(rx)},${fmt(ry)} ${xRot} ${la} ${sw} ${fmt(nx)},${fmt(ny)}`;
      }
    }
  }
  return out;
}

function flattenOriginalPaths(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  // ViewBox offset — shift origin to (0,0)
  const vb = svg.getAttribute('viewBox');
  const [vbX, vbY] = vb ? vb.trim().split(/[\s,]+/).map(Number) : [0, 0];
  const vbMat = [1, 0, 0, 1, -vbX, -vbY];

  const paths = svg.querySelectorAll('path');
  const lines = [];
  for (const el of paths) {
    const elMat = parseTransformAttr(el.getAttribute('transform'));
    const mat = composeMat(vbMat, elMat); // element transform first, then viewBox shift

    const d = el.getAttribute('d');
    if (!d) continue;
    const newD = transformPathD(d, mat);

    // Extract stroke props from CSS style attribute
    let stroke = '#000000', strokeWidth = '0.05';
    const style = el.getAttribute('style') || '';
    const sm = style.match(/stroke\s*:\s*([^;]+)/);
    if (sm) stroke = sm[1].trim();
    const swm = style.match(/stroke-width\s*:\s*([^;]+)/);
    if (swm) strokeWidth = parseFloat(swm[1]).toString();

    lines.push(`  <path d="${newD}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  }
  return lines;
}

export function exportAsSVG(svgContent, canvasWidth, canvasHeight, regions, voronoiMap, settings, svgDims) {
  const isOutline = settings.colorMode === 'outline';
  const unit = svgDims.unit || '';
  // Scale factor: canvas pixels → physical SVG units (e.g. mm)
  const pxToPhys = svgDims.width / canvasWidth;

  // In outline mode: flat list of polygons in physical units (mm), no clip
  // paths, no nested SVG. Original frame paths included. LightBurn-compatible.
  if (isOutline) {
    const physW = svgDims.width;
    const physH = svgDims.height;
    const parts = [];

    // Include original SVG paths (frame outlines) flattened for LightBurn
    const origPaths = flattenOriginalPaths(svgContent);
    parts.push(...origPaths);

    // Voronoi cell outlines
    for (const region of regions) {
      const data = voronoiMap.get(region.id);
      const cells = data?.cells;
      if (!cells || cells.length === 0) continue;
      for (const cell of cells) {
        const pts = cell.polygon.map(p =>
          `${(p[0] * pxToPhys).toFixed(3)},${(p[1] * pxToPhys).toFixed(3)}`
        ).join(' ');
        const sw = Math.max(settings.strokeWidth, 0.1);
        parts.push(`  <polygon points="${pts}" fill="none" stroke="${settings.strokeColor}" stroke-width="${sw}"/>`);
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${physW}${unit}" height="${physH}${unit}" viewBox="0 0 ${physW} ${physH}">
${parts.join('\n')}
</svg>`;
  }

  const regionDefs = [];
  const regionGroups = [];

  regions.forEach((region, idx) => {
    const data = voronoiMap.get(region.id);
    const cells = data?.cells;
    if (!cells || cells.length === 0) return;

    const clipMask = data?.erodedMask || region.mask;
    const clipId = `region-clip-${idx}`;
    const pathD = maskToSVGPath(clipMask, canvasWidth, canvasHeight);
    regionDefs.push(`<clipPath id="${clipId}"><path d="${pathD}"/></clipPath>`);

    const strokePx = settings.strokeWidth / pxToPhys; // convert mm back to canvas pixels
    const polys = cells.map(cell => {
      const pts = cell.polygon.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      return `<polygon points="${pts}" fill="${cell.color}" fill-opacity="${settings.cellOpacity}" stroke="${settings.strokeColor}" stroke-width="${strokePx.toFixed(1)}"/>`;
    }).join('\n      ');

    regionGroups.push(`<g clip-path="url(#${clipId})">\n      ${polys}\n    </g>`);
  });

  // Re-embed original SVG content as nested SVG for strokes
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const origSvg = doc.querySelector('svg');
  const origContent = origSvg.innerHTML;
  const origViewBox = origSvg.getAttribute('viewBox') || `0 0 ${svgDims.width} ${svgDims.height}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <defs>
    ${regionDefs.join('\n    ')}
  </defs>
  <rect width="${canvasWidth}" height="${canvasHeight}" fill="white"/>
  ${regionGroups.join('\n  ')}
  <svg x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" viewBox="${origViewBox}">
    ${origContent}
  </svg>
</svg>`;
}

