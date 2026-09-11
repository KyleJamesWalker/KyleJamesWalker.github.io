// PDF export.
//
// Each photo is embedded as its own JPEG at its final cropped resolution and
// the lettering rides on a transparent overlay, rather than flattening the
// whole sheet into one page-sized raster. Same visual result, far smaller
// files, and text edges stay sharp at print size.

import { sheetGeometry, renderBoxes, panelRect, fitRect, MM_PER_IN, PANELS } from './geometry.js';
import { cellsFor, drawTextLayer } from './renderer.js';
import { renderPhotoCanvas } from './filters.js';

const PDFLIB_URL = 'vendor/pdf-lib.min.js';
const EXPORT_DPI = 300;
const PT_PER_IN = 72;

let libPromise = null;
function loadPDFLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFLIB_URL;
    s.async = true;
    s.onload = () => resolve(window.PDFLib);
    s.onerror = () => { libPromise = null; reject(new Error('pdf-lib failed to load')); };
    document.head.appendChild(s);
  });
  return libPromise;
}

const S = EXPORT_DPI / PT_PER_IN;

function canvasBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a))) : reject(new Error('encode failed'))),
      type,
      quality
    );
  });
}

function hexRGB(rgb, hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Map a rect expressed in the box's own upright coordinates onto the page,
 * applying the 180 degree rotation the top row of the sheet prints with.
 */
function place(box, local, pageH, degrees) {
  const sx = box.rotated ? box.x + box.w - local.x - local.w : box.x + local.x;
  const sy = box.rotated ? box.y + box.h - local.y - local.h : box.y + local.y;
  const y = pageH - sy - local.h;
  return box.rotated
    ? { x: sx + local.w, y: y + local.h, width: local.w, height: local.h, rotate: degrees(180) }
    : { x: sx, y, width: local.w, height: local.h };
}

export async function exportPDF(state, { imageFor, onProgress = () => {} } = {}) {
  const { PDFDocument, rgb, degrees } = await loadPDFLib();

  const geoPt = sheetGeometry(state.paperSize, PT_PER_IN);
  const ptPerMM = PT_PER_IN / MM_PER_IN;
  const pxPerMM = EXPORT_DPI / MM_PER_IN;

  const doc = await PDFDocument.create();
  const page = doc.addPage([geoPt.w, geoPt.h]);

  const boxes = renderBoxes(geoPt, state);
  let done = 0;

  for (const box of boxes) {
    const content = box.panel;
    const boxLocal = { x: 0, y: 0, w: box.w, h: box.h };

    page.drawRectangle({
      ...place(box, boxLocal, geoPt.h, degrees),
      color: hexRGB(rgb, content.bg || '#ffffff'),
    });

    const cellsPt = cellsFor(content, boxLocal, ptPerMM);

    for (let i = 0; i < cellsPt.length; i++) {
      const photo = content.photos[i];
      if (!photo) continue;
      const img = imageFor(photo);
      if (!img) continue;

      const cellPt = cellsPt[i];
      const cellPx = { x: cellPt.x * S, y: cellPt.y * S, w: cellPt.w * S, h: cellPt.h * S };
      const src = fitRect(img.naturalWidth, img.naturalHeight, cellPx, photo, content.fit);

      const baked = renderPhotoCanvas(img, src, src.dw, src.dh, photo.fx, pxPerMM);
      const embedded = await doc.embedJpg(await canvasBytes(baked, 'image/jpeg', 0.94));

      page.drawImage(embedded, place(box, {
        x: src.dx / S, y: src.dy / S, w: src.dw / S, h: src.dh / S,
      }, geoPt.h, degrees));
    }

    const hasText = content.caption.text.trim()
      || (box.kind === 'panel' && (box.meta.role === 'front' || box.meta.role === 'back'));

    if (hasText) {
      const tc = document.createElement('canvas');
      tc.width = Math.round(box.w * S);
      tc.height = Math.round(box.h * S);
      const tctx = tc.getContext('2d');
      drawTextLayer(tctx, state, box, { x: 0, y: 0, w: tc.width, h: tc.height }, pxPerMM);
      const embedded = await doc.embedPng(await canvasBytes(tc, 'image/png'));
      page.drawImage(embedded, place(box, boxLocal, geoPt.h, degrees));
    }

    done += 1;
    onProgress(done / boxes.length);
  }

  if (state.guidesInExport) drawGuidesPDF(page, geoPt, rgb);

  doc.setTitle(state.cover.title || 'Zine');
  doc.setAuthor(state.cover.author || '');
  doc.setSubject(state.cover.subtitle || '');
  doc.setProducer('Dirty Little Zine Plus');
  doc.setCreator('Dirty Little Zine Plus');

  const bytes = await doc.save();
  download(new Blob([bytes], { type: 'application/pdf' }), `${slug(state.cover.title)}-${stamp()}.pdf`);
  return true;
}

function drawGuidesPDF(page, geo, rgb) {
  const h = geo.h;
  const grey = rgb(0.75, 0.75, 0.75);
  PANELS.forEach((_, i) => {
    const r = panelRect(geo, i);
    page.drawRectangle({
      x: r.x, y: h - r.y - r.h, width: r.w, height: r.h,
      borderColor: grey, borderWidth: 0.4, opacity: 0,
    });
  });
  const midY = h - (geo.margin + geo.panelH + geo.gap / 2);
  const x0 = geo.margin + geo.panelW + geo.gap;
  page.drawLine({
    start: { x: x0, y: midY },
    end: { x: x0 + geo.panelW * 2 + geo.gap, y: midY },
    thickness: 0.6,
    color: rgb(0.8, 0.15, 0.15),
    dashArray: [6, 4],
  });
}

/** Full-sheet PNG, for people who would rather hand a raster to a print shop. */
export async function exportPNG(state, renderSheet, imageFor) {
  const canvas = document.createElement('canvas');
  renderSheet(canvas, state, { dpi: EXPORT_DPI, guides: state.guidesInExport, imageFor });
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  download(blob, `${slug(state.cover.title)}-${stamp()}.png`);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(title) {
  const s = (title || 'zine').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || 'zine';
}

export function stamp() {
  return new Date().toISOString().slice(0, 10);
}
