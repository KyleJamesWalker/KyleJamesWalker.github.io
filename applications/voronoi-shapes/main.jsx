import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Upload, Download, Trash2, RotateCcw, Save, FileUp, FileDown,
  MousePointer2, Settings2, ChevronDown, ChevronUp, Hexagon
} from 'lucide-react';
import { Delaunay } from 'd3-delaunay';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './app.css';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Constants ---

const STORAGE_KEY = 'voronoi-shapes-settings';
const MAX_CANVAS_SIZE = 900;

const DEFAULT_SETTINGS = {
  pointCount: 100,
  colorMode: 'random',
  colorPalette: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'],
  strokeWidth: 1,
  strokeColor: '#333333',
  cellOpacity: 0.85,
  gradientStart: '#FF6B6B',
  gradientEnd: '#4ECDC4',
  fillTolerance: 30,
};

const REGION_COLORS = [
  [255, 107, 107],
  [78, 205, 196],
  [69, 183, 209],
  [150, 206, 180],
  [255, 234, 167],
  [221, 160, 221],
];

// --- Algorithms ---

function floodFill(imageData, startX, startY, tolerance) {
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
  if (colorMode === 'gradient') {
    return interpolateColor(gradientStart, gradientEnd, total > 1 ? index / (total - 1) : 0);
  }
  if (colorMode === 'palette') {
    return colorPalette[index % colorPalette.length];
  }
  return colorPalette[Math.floor(Math.random() * colorPalette.length)];
}

function thickenStrokes(svgContent) {
  return svgContent
    .replace(/stroke-width\s*:\s*[\d.]+\s*[a-z]*/gi, 'stroke-width:2')
    .replace(/stroke-width\s*=\s*"[\d.]+[a-z]*"/gi, 'stroke-width="2"');
}

function parseSVGDimensions(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    return { width: parts[2], height: parts[3] };
  }
  return { width: parseFloat(svg.getAttribute('width')) || 800, height: parseFloat(svg.getAttribute('height')) || 600 };
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

function generateVoronoiForRegion(region, settings, canvasWidth, canvasHeight) {
  const points = bestCandidateSampling(region.mask, region.bounds, canvasWidth, settings.pointCount);
  if (points.length < 2) return [];

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, canvasWidth, canvasHeight]);
  const cells = [];

  for (let i = 0; i < points.length; i++) {
    const poly = voronoi.cellPolygon(i);
    if (poly) {
      cells.push({
        polygon: poly,
        color: generateCellColor(i, points.length, settings),
      });
    }
  }
  return cells;
}

function renderToCanvas(ctx, canvasWidth, canvasHeight, svgImage, regions, voronoiMap, settings) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(svgImage, 0, 0, canvasWidth, canvasHeight);

  for (const region of regions) {
    const cells = voronoiMap.get(region.id);

    // Create mask canvas
    const maskCvs = document.createElement('canvas');
    maskCvs.width = canvasWidth;
    maskCvs.height = canvasHeight;
    const maskCtx = maskCvs.getContext('2d');
    const maskImg = maskCtx.createImageData(canvasWidth, canvasHeight);
    for (let i = 0; i < region.mask.length; i++) {
      if (region.mask[i]) {
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
        cellCtx.fillStyle = cell.color;
        cellCtx.fill();
        if (settings.strokeWidth > 0) {
          cellCtx.globalAlpha = 1;
          cellCtx.strokeStyle = settings.strokeColor;
          cellCtx.lineWidth = settings.strokeWidth;
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

function exportAsSVG(svgContent, canvasWidth, canvasHeight, regions, voronoiMap, settings, svgDims) {
  const regionDefs = [];
  const regionGroups = [];

  regions.forEach((region, idx) => {
    const cells = voronoiMap.get(region.id);
    if (!cells || cells.length === 0) return;

    const clipId = `region-clip-${idx}`;
    const pathD = maskToSVGPath(region.mask, canvasWidth, canvasHeight);
    regionDefs.push(`<clipPath id="${clipId}"><path d="${pathD}"/></clipPath>`);

    const polys = cells.map(cell => {
      const pts = cell.polygon.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      return `<polygon points="${pts}" fill="${cell.color}" fill-opacity="${settings.cellOpacity}" stroke="${settings.strokeColor}" stroke-width="${settings.strokeWidth}"/>`;
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

// --- App Component ---

const App = () => {
  const [svgContent, setSvgContent] = useState(null);
  const [svgImage, setSvgImage] = useState(null);
  const [thickSvgImage, setThickSvgImage] = useState(null);
  const [svgDims, setSvgDims] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [regions, setRegions] = useState([]);
  const [voronoiMap, setVoronoiMap] = useState(new Map());
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [regenKey, setRegenKey] = useState(0);

  const canvasRef = useRef(null);
  const thickCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const settingsInputRef = useRef(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Load SVG into images
  useEffect(() => {
    if (!svgContent) return;
    const dims = parseSVGDimensions(svgContent);
    setSvgDims(dims);

    const scale = Math.min(MAX_CANVAS_SIZE / dims.width, MAX_CANVAS_SIZE / dims.height, 5);
    const cw = Math.round(dims.width * scale);
    const ch = Math.round(dims.height * scale);
    setCanvasSize({ width: cw, height: ch });

    // Load original SVG image
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { setSvgImage(img); URL.revokeObjectURL(url); };
    img.src = url;

    // Load thick-stroke SVG for flood fill
    const thickSvg = thickenStrokes(svgContent);
    const tBlob = new Blob([thickSvg], { type: 'image/svg+xml' });
    const tUrl = URL.createObjectURL(tBlob);
    const tImg = new Image();
    tImg.onload = () => { setThickSvgImage(tImg); URL.revokeObjectURL(tUrl); };
    tImg.src = tUrl;

    setRegions([]);
    setVoronoiMap(new Map());
  }, [svgContent]);

  // Render thick SVG to offscreen canvas
  useEffect(() => {
    if (!thickSvgImage || !thickCanvasRef.current) return;
    const cvs = thickCanvasRef.current;
    cvs.width = canvasSize.width;
    cvs.height = canvasSize.height;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.drawImage(thickSvgImage, 0, 0, canvasSize.width, canvasSize.height);
  }, [thickSvgImage, canvasSize]);

  // Generate Voronoi for all regions
  useEffect(() => {
    if (regions.length === 0) {
      setVoronoiMap(new Map());
      return;
    }
    const map = new Map();
    for (const region of regions) {
      const cells = generateVoronoiForRegion(region, settings, canvasSize.width, canvasSize.height);
      map.set(region.id, cells);
    }
    setVoronoiMap(map);
  }, [regions, settings, canvasSize, regenKey]);

  // Render canvas
  useEffect(() => {
    if (!svgImage || !canvasRef.current) return;
    const cvs = canvasRef.current;
    cvs.width = canvasSize.width;
    cvs.height = canvasSize.height;
    const ctx = cvs.getContext('2d');
    renderToCanvas(ctx, canvasSize.width, canvasSize.height, svgImage, regions, voronoiMap, settings);
  }, [svgImage, regions, voronoiMap, settings, canvasSize]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSvgContent(ev.target.result);
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.svg')) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSvgContent(ev.target.result);
    reader.readAsText(file);
  };

  const handleCanvasClick = (e) => {
    if (!thickCanvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasSize.width / rect.width;
    const scaleY = canvasSize.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    // Check if clicking existing region to deselect
    for (const region of regions) {
      if (region.mask[y * canvasSize.width + x]) {
        setRegions(prev => prev.filter(r => r.id !== region.id));
        return;
      }
    }

    // Flood fill on thick-stroke canvas
    const ctx = thickCanvasRef.current.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height);
    const { mask, bounds } = floodFill(imageData, x, y, settings.fillTolerance);

    const pixelCount = mask.reduce((s, v) => s + v, 0);
    if (pixelCount < 50) return;

    setRegions(prev => [...prev, {
      id: Date.now(),
      mask,
      bounds,
      color: REGION_COLORS[prev.length % REGION_COLORS.length],
    }]);
  };

  const handleExportSVG = () => {
    if (!svgContent || regions.length === 0) return;
    const svg = exportAsSVG(svgContent, canvasSize.width, canvasSize.height, regions, voronoiMap, settings, svgDims);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voronoi-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voronoi-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSettings = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        setSettings({ ...DEFAULT_SETTINGS, ...imported });
      } catch { /* ignore invalid JSON */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updatePaletteColor = (index, color) => {
    setSettings(prev => {
      const palette = [...prev.colorPalette];
      palette[index] = color;
      return { ...prev, colorPalette: palette };
    });
  };

  const addPaletteColor = () => {
    setSettings(prev => ({
      ...prev,
      colorPalette: [...prev.colorPalette, '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')],
    }));
  };

  const removePaletteColor = (index) => {
    if (settings.colorPalette.length <= 1) return;
    setSettings(prev => ({
      ...prev,
      colorPalette: prev.colorPalette.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-violet-700 h-14 flex items-center justify-between px-5 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <Hexagon className="text-white" size={22} />
          <h1 className="text-white text-lg font-bold">Voronoi Shapes</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportSettings} title="Export settings" className="p-2 text-violet-200 hover:text-white transition-colors">
            <FileDown size={18} />
          </button>
          <button onClick={() => settingsInputRef.current?.click()} title="Import settings" className="p-2 text-violet-200 hover:text-white transition-colors">
            <FileUp size={18} />
          </button>
          <input ref={settingsInputRef} type="file" accept=".json" className="hidden" onChange={handleImportSettings} />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {!svgContent ? (
          /* Upload Area */
          <div
            className="flex flex-col items-center justify-center p-12 m-6 border-4 border-dashed border-slate-300 rounded-3xl bg-white min-h-[400px] cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload size={56} className="text-slate-300 mb-6" />
            <p className="text-xl font-bold text-slate-600 mb-2">Upload SVG File</p>
            <p className="text-sm text-slate-400">Drag & drop or click to browse</p>
            <input ref={fileInputRef} type="file" accept=".svg" className="hidden" onChange={handleFileUpload} />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Canvas */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <MousePointer2 size={14} />
                  Click regions to select/deselect
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { fileInputRef.current?.click(); }}
                    className="text-xs text-slate-500 hover:text-violet-600 font-bold transition-colors"
                  >
                    New SVG
                  </button>
                  <input ref={fileInputRef} type="file" accept=".svg" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>
              <div className="canvas-container flex justify-center p-4 bg-slate-100/50">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>
            </div>

            {/* Selected Regions */}
            {regions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Regions:</span>
                {regions.map((region, idx) => (
                  <button
                    key={region.id}
                    onClick={() => setRegions(prev => prev.filter(r => r.id !== region.id))}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 hover:border-red-300 hover:text-red-500 transition-all"
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: `rgb(${region.color.join(',')})` }} />
                    Region {idx + 1}
                    <span className="text-slate-300 ml-0.5">&times;</span>
                  </button>
                ))}
                <button
                  onClick={() => setRegions([])}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                  title="Clear all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setRegenKey(k => k + 1)}
                disabled={regions.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-30 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <RotateCcw size={14} />
                Regenerate
              </button>
              <button
                onClick={handleExportSVG}
                disabled={regions.length === 0 || voronoiMap.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-30 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Download size={14} />
                Download SVG
              </button>
            </div>

            {/* Settings Panel */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => setSettingsOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Settings2 size={16} />
                  Settings
                </span>
                {settingsOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>

              {settingsOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
                  {/* Point Count */}
                  <label className="block pt-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Points: {settings.pointCount}</span>
                    <input type="range" min="5" max="500" value={settings.pointCount}
                      onChange={(e) => updateSetting('pointCount', parseInt(e.target.value))}
                      className="w-full mt-1" />
                  </label>

                  {/* Color Mode */}
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Color Mode</span>
                    <select value={settings.colorMode}
                      onChange={(e) => updateSetting('colorMode', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium">
                      <option value="random">Random from palette</option>
                      <option value="palette">Sequential from palette</option>
                      <option value="gradient">Gradient</option>
                    </select>
                  </label>

                  {/* Palette Colors */}
                  {(settings.colorMode === 'random' || settings.colorMode === 'palette') && (
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Palette</span>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {settings.colorPalette.map((color, i) => (
                          <div key={i} className="relative group">
                            <input type="color" value={color}
                              onChange={(e) => updatePaletteColor(i, e.target.value)} />
                            {settings.colorPalette.length > 1 && (
                              <button onClick={() => removePaletteColor(i)}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-bold leading-none hidden group-hover:flex items-center justify-center">
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                        <button onClick={addPaletteColor}
                          className="w-8 h-8 rounded border-2 border-dashed border-slate-300 text-slate-400 hover:border-violet-400 hover:text-violet-500 text-lg font-bold transition-colors flex items-center justify-center">
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Gradient Colors */}
                  {settings.colorMode === 'gradient' && (
                    <div className="flex gap-4">
                      <label>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start</span>
                        <input type="color" value={settings.gradientStart}
                          onChange={(e) => updateSetting('gradientStart', e.target.value)}
                          className="block mt-1" />
                      </label>
                      <label>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">End</span>
                        <input type="color" value={settings.gradientEnd}
                          onChange={(e) => updateSetting('gradientEnd', e.target.value)}
                          className="block mt-1" />
                      </label>
                    </div>
                  )}

                  {/* Stroke */}
                  <div className="flex gap-4 items-end">
                    <label className="flex-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stroke Width: {settings.strokeWidth}</span>
                      <input type="range" min="0" max="5" step="0.5" value={settings.strokeWidth}
                        onChange={(e) => updateSetting('strokeWidth', parseFloat(e.target.value))}
                        className="w-full mt-1" />
                    </label>
                    <label>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Color</span>
                      <input type="color" value={settings.strokeColor}
                        onChange={(e) => updateSetting('strokeColor', e.target.value)}
                        className="block mt-1" />
                    </label>
                  </div>

                  {/* Opacity */}
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cell Opacity: {Math.round(settings.cellOpacity * 100)}%</span>
                    <input type="range" min="0" max="1" step="0.05" value={settings.cellOpacity}
                      onChange={(e) => updateSetting('cellOpacity', parseFloat(e.target.value))}
                      className="w-full mt-1" />
                  </label>

                  {/* Fill Tolerance */}
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fill Tolerance: {settings.fillTolerance}</span>
                    <input type="range" min="1" max="128" value={settings.fillTolerance}
                      onChange={(e) => updateSetting('fillTolerance', parseInt(e.target.value))}
                      className="w-full mt-1" />
                    <span className="text-[10px] text-slate-400">Lower = stricter boundary detection. Increase if regions bleed through thin strokes.</span>
                  </label>

                  {/* Reset */}
                  <button onClick={() => setSettings(DEFAULT_SETTINGS)}
                    className="text-xs text-slate-400 hover:text-red-500 font-bold transition-colors">
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Hidden thick-stroke canvas for flood fill */}
      <canvas ref={thickCanvasRef} className="hidden" />
    </div>
  );
};

const container = document.getElementById('voronoi-shapes-root');
const root = createRoot(container);
root.render(<App />);
