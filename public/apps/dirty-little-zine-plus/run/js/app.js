// UI wiring: page rail, stage interactions, inspector, export.

import {
  PAPER, PANELS, SPREADS, READING_ORDER, MM_PER_IN,
  sheetGeometry, coverRect,
} from './geometry.js';
import { LAYOUTS, layoutFor, layoutRects, hitCell } from './layouts.js';
import { PRESETS, EFFECTS, applyPreset, defaultFx, invalidate } from './filters.js';
import {
  createState, allFonts, CUSTOM_FONTS, makePhoto, setLayout, addPhoto, removePhoto,
  movePhoto, resetView, spreadOf, capacity,
} from './state.js';
import { addFontFile, restoreFonts, removeFont, isFontFile } from './fonts.js';
import { loadSaved, scheduleSave, clearSaved } from './storage.js';
import {
  putPhoto, getPhoto, deletePhoto, pruneExcept, makeVariants, blobToImage,
  fileToImage, storageAvailable, FULL_MAX_EDGE,
} from './photo-store.js';
import { renderSheet, renderPage, qrSide, QR_QUIET_MODULES } from './renderer.js';
import { qrFor, ECC_LEVELS } from './qrcode.js';
import { exportPDF, exportPNG } from './export-pdf.js';

const MAX_ZOOM = 6;

const $ = id => document.getElementById(id);
const dom = {
  rail: $('rail'), stage: $('stage'), stageWrap: $('stageWrap'),
  page: $('pageCanvas'), sheet: $('sheetCanvas'), inspector: $('inspector'),
  hint: $('hint'), paper: $('paper'), guides: $('guides'), viewToggle: $('viewToggle'),
  exportPdf: $('exportPdf'), exportPng: $('exportPng'), resetAll: $('resetAll'),
  filePicker: $('filePicker'), fontPicker: $('fontPicker'),
  dropVeil: $('dropVeil'), toast: $('toast'),
};

let state = createState();
let view = 'page';
let sel = { page: 0, slot: 0 };
let dragging = false;
let rafId = null;
let lastCells = [];
let lastGeom = null;

// ---------------------------------------------------------------------------
// page model
// ---------------------------------------------------------------------------

function mm() {
  return sheetGeometry(state.paperSize, MM_PER_IN);
}

function pages() {
  const g = mm();
  const out = [];
  const seen = new Set();
  for (const idx of READING_ORDER) {
    if (seen.has(idx)) continue;
    const sIdx = spreadOf(idx);
    if (sIdx >= 0 && state.spreads[sIdx].merged) {
      const def = SPREADS[sIdx];
      seen.add(def.left);
      seen.add(def.right);
      out.push({
        kind: 'spread', spreadId: sIdx, panel: state.spreads[sIdx].panel,
        label: def.label, widthMM: g.panelW * 2 + g.gap, heightMM: g.panelH,
      });
    } else {
      seen.add(idx);
      out.push({
        kind: 'panel', panelIndex: idx, meta: PANELS[idx], panel: state.panels[idx],
        label: PANELS[idx].label, widthMM: g.panelW, heightMM: g.panelH,
      });
    }
  }
  return out;
}

const currentPage = () => pages()[Math.min(sel.page, pages().length - 1)];
const currentContent = () => currentPage().panel;
const currentPhoto = () => currentContent().photos[sel.slot] || null;

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

const previewImage = p => p.img || null;

function stageSize(page) {
  const padding = 36;
  const availW = dom.stage.clientWidth - padding;
  const availH = dom.stage.clientHeight - padding - 28;
  const aspect = page.widthMM / page.heightMM;
  return Math.max(160, Math.min(availW, availH * aspect));
}

function drawStage({ fast = false } = {}) {
  if (view === 'sheet') {
    dom.page.hidden = true;
    dom.sheet.hidden = false;
    const targetW = Math.min(1700, Math.max(700, dom.stage.clientWidth * 2));
    const dpi = targetW / (PAPER[state.paperSize].widthMM / MM_PER_IN);
    renderSheet(dom.sheet, state, { dpi, guides: state.guides, imageFor: previewImage, simplify: fast });
    return;
  }

  dom.sheet.hidden = true;
  dom.page.hidden = false;
  const page = currentPage();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  lastGeom = renderPage(dom.page, state, page, stageSize(page), dpr, {
    imageFor: previewImage,
    simplify: fast,
  });
  lastCells = lastGeom.cells;
  updateCursor();
}

function schedule(opts) {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    drawStage(opts);
  });
}

function refresh({ rail = true, inspector = true, fast = false } = {}) {
  drawStage({ fast });
  if (rail) drawRail();
  if (inspector) buildInspector();
  scheduleSave(state);
}

function drawRail() {
  const list = pages();
  dom.rail.replaceChildren(...list.map((page, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `thumb${i === sel.page ? ' on' : ''}${page.kind === 'spread' ? ' wide' : ''}`;
    const c = document.createElement('canvas');
    const label = document.createElement('span');
    label.textContent = page.label;
    btn.append(c, label);
    btn.addEventListener('click', () => {
      sel = { page: i, slot: 0 };
      view = 'page';
      syncViewToggle();
      refresh();
    });
    queueMicrotask(() => renderPage(c, state, page, page.kind === 'spread' ? 88 : 66, 2, {
      imageFor: previewImage, simplify: true,
    }));
    return btn;
  }));
}

function updateCursor() {
  const photo = currentPhoto();
  const canPan = photo && currentContent().fit === 'cover';
  dom.page.className = dragging ? 'grabbing' : canPan ? 'grabbable' : 'selecting';

  const content = currentContent();
  if (!content.photos.length) {
    dom.hint.textContent = 'Drop photos anywhere, or click a slot to add one.';
  } else if (content.fit === 'contain') {
    dom.hint.textContent = 'Fit mode shows the whole photo. Switch to Fill to pan and zoom.';
  } else {
    dom.hint.textContent = 'Drag to pan - scroll or pinch to zoom - double-click to reset.';
  }
}

// ---------------------------------------------------------------------------
// stage interaction
// ---------------------------------------------------------------------------

function canvasPoint(ev) {
  const r = dom.page.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / r.width) * dom.page.width,
    y: ((ev.clientY - r.top) / r.height) * dom.page.height,
  };
}

function cellAt(pt) {
  return hitCell(lastCells, pt.x, pt.y);
}

function sourceFor(photo, cell) {
  return coverRect(photo.img.naturalWidth, photo.img.naturalHeight, cell, photo);
}

dom.page.addEventListener('pointerdown', ev => {
  if (view !== 'page') return;
  const pt = canvasPoint(ev);
  const i = cellAt(pt);
  if (i < 0) return;

  if (i !== sel.slot) {
    sel.slot = i;
    refresh({ rail: false });
  }

  const content = currentContent();
  const photo = content.photos[i];
  if (!photo || content.fit !== 'cover') return;

  const cell = lastCells[i];
  const src = sourceFor(photo, cell);
  if (src.slackX <= 0 && src.slackY <= 0) return;

  dragging = true;
  dom.page.setPointerCapture(ev.pointerId);
  updateCursor();

  const start = { x: ev.clientX, y: ev.clientY, ox: photo.offsetX, oy: photo.offsetY };
  const scale = dom.page.width / dom.page.getBoundingClientRect().width;

  const move = e => {
    const dx = (e.clientX - start.x) * scale;
    const dy = (e.clientY - start.y) * scale;
    if (src.slackX > 0) {
      photo.offsetX = clamp(start.ox - (2 * dx * (src.sw / cell.w)) / src.slackX, -1, 1);
    }
    if (src.slackY > 0) {
      photo.offsetY = clamp(start.oy - (2 * dy * (src.sh / cell.h)) / src.slackY, -1, 1);
    }
    schedule({ fast: true });
  };

  const up = e => {
    dragging = false;
    dom.page.releasePointerCapture?.(ev.pointerId);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    refresh({ rail: true, inspector: false });
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

dom.page.addEventListener('wheel', ev => {
  if (view !== 'page') return;
  const pt = canvasPoint(ev);
  const i = cellAt(pt);
  if (i < 0) return;
  const content = currentContent();
  const photo = content.photos[i];
  if (!photo || content.fit !== 'cover') return;

  ev.preventDefault();
  if (i !== sel.slot) sel.slot = i;
  zoomAt(photo, lastCells[i], pt, Math.exp(-ev.deltaY * 0.0015));
  schedule({ fast: true });
  clearTimeout(zoomSettle);
  zoomSettle = setTimeout(() => refresh({ rail: true }), 140);
}, { passive: false });

let zoomSettle = null;

/** Zoom about the pointer so the pixel under the cursor stays put. */
function zoomAt(photo, cell, pt, factor) {
  const before = sourceFor(photo, cell);
  const u = (pt.x - cell.x) / cell.w;
  const v = (pt.y - cell.y) / cell.h;
  const anchorX = before.sx + u * before.sw;
  const anchorY = before.sy + v * before.sh;

  photo.zoom = clamp(photo.zoom * factor, 1, MAX_ZOOM);

  const after = sourceFor(photo, cell);
  if (after.slackX > 0) {
    photo.offsetX = clamp((2 * (anchorX - u * after.sw)) / after.slackX - 1, -1, 1);
  }
  if (after.slackY > 0) {
    photo.offsetY = clamp((2 * (anchorY - v * after.sh)) / after.slackY - 1, -1, 1);
  }
}

dom.page.addEventListener('dblclick', ev => {
  const i = cellAt(canvasPoint(ev));
  const photo = currentContent().photos[i];
  if (!photo) return;
  resetView(photo);
  refresh();
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// photo ingest
// ---------------------------------------------------------------------------

let pendingSlot = null;

// Dropping six photos onto a one-up page and keeping only the last is never
// what was meant; grow the layout to hold what arrived, then spill the rest
// onto the following pages in reading order.
const GROW_TO = { 1: 'single', 2: 'stack2', 3: 'hero3', 4: 'grid4', 5: 'mag5', 6: 'grid6' };

function growLayout(content, incoming) {
  const needed = Math.min(6, content.photos.length + incoming);
  if (needed > capacity(content)) setLayout(content, GROW_TO[needed]);
}

/** Slots to fill, in order, for `count` incoming photos. */
function allocate(count, startPage, startSlot) {
  const list = pages();
  const targets = [];
  let remaining = count;

  for (let i = startPage; i < list.length && remaining > 0; i++) {
    const content = list[i].panel;
    let from;
    if (i === startPage && startSlot != null) {
      from = startSlot;
    } else {
      from = content.photos.length;
      growLayout(content, remaining);
    }
    for (let slot = from; slot < capacity(content) && remaining > 0; slot++) {
      targets.push({ content, slot });
      remaining -= 1;
    }
  }
  return { targets, dropped: remaining };
}

async function ingest(files, startPage, startSlot) {
  const images = [...files].filter(f => f.type.startsWith('image/'));
  if (!images.length) return;

  const { targets, dropped } = allocate(images.length, startPage, startSlot);
  toast(`Loading ${targets.length} photo${targets.length > 1 ? 's' : ''}...`);

  for (let i = 0; i < targets.length; i++) {
    const file = images[i];
    const { content, slot } = targets[i];
    try {
      const decoded = await fileToImage(file);
      const variants = await makeVariants(decoded);
      const preview = await blobToImage(variants.preview);
      const photo = makePhoto(preview, file);
      photo.name = file.name;
      photo.fullW = decoded.naturalWidth;
      photo.fullH = decoded.naturalHeight;

      const old = content.photos[slot];
      if (old) deletePhoto(old.photoId);
      content.photos[slot] = photo;

      putPhoto(photo.photoId, variants).catch(() => {});
      refresh();
    } catch {
      toast(`Could not read ${file.name}`);
    }
  }

  if (dropped > 0) {
    toast(`${dropped} photo${dropped > 1 ? 's' : ''} did not fit - the zine holds 8 pages.`);
    setTimeout(hideToast, 3200);
  } else {
    hideToast();
  }
}

async function ingestFonts(files) {
  const fonts = [...files].filter(isFontFile);
  if (!fonts.length) return 0;
  let added = 0;
  for (const file of fonts) {
    try {
      const entry = await addFontFile(file);
      added += 1;
      toast(`Added ${entry.label}`);
    } catch (err) {
      toast(err.message || `Could not read ${file.name}`);
    }
  }
  if (added) {
    // A newly registered face has to be resolvable before the canvas draws with
    // it, or the first render silently falls back.
    await document.fonts.ready;
    refresh();
  }
  setTimeout(hideToast, 2000);
  return added;
}

dom.fontPicker.addEventListener('change', async () => {
  await ingestFonts(dom.fontPicker.files);
  dom.fontPicker.value = '';
});

dom.filePicker.addEventListener('change', async () => {
  await ingest(dom.filePicker.files, sel.page, pendingSlot);
  dom.filePicker.value = '';
  pendingSlot = null;
});

function pickFiles(slot) {
  pendingSlot = slot;
  dom.filePicker.click();
}

let dragDepth = 0;
window.addEventListener('dragenter', e => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  dragDepth += 1;
  dom.dropVeil.hidden = false;
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dom.dropVeil.hidden = true;
});
window.addEventListener('drop', async e => {
  e.preventDefault();
  dragDepth = 0;
  dom.dropVeil.hidden = true;
  if (!e.dataTransfer?.files?.length) return;

  const files = [...e.dataTransfer.files];
  if (files.some(isFontFile)) await ingestFonts(files);
  if (!files.some(f => f.type.startsWith('image/'))) return;

  let slot;
  if (view === 'page' && e.target instanceof Node && dom.page.contains(e.target)) {
    const i = cellAt(canvasPoint(e));
    if (i >= 0) slot = i;
  }
  await ingest(files, sel.page, slot);
});

// ---------------------------------------------------------------------------
// inspector
// ---------------------------------------------------------------------------

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter(Boolean));
  return el;
}

function section(title, ...kids) {
  return h('div', { class: 'sec' }, title ? h('h2', { text: title }) : null, ...kids);
}

function seg(value, options, onPick) {
  return h('div', { class: 'seg' }, options.map(([val, label]) =>
    h('button', {
      type: 'button', class: val === value ? 'on' : '', text: label,
      onclick: () => onPick(val),
    })));
}

function slider(label, value, min, max, step, format, onInput) {
  const out = h('output', { text: format(value) });
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: e => {
      const v = parseFloat(e.target.value);
      out.textContent = format(v);
      onInput(v);
    },
  });
  return h('div', { class: 'slider' }, h('label', { text: label }), input, out);
}

/** White / Black / Custom, with the two pickers revealed only when needed. */
function colorControls(cfg) {
  return [
    seg(cfg.color, [['white', 'White'], ['black', 'Black'], ['custom', 'Custom']],
      v => { cfg.color = v; refresh(); }),
    cfg.color === 'custom'
      ? h('div', { class: 'row' },
          h('span', { class: 'note', text: 'Ink' }),
          h('input', {
            type: 'color', value: cfg.inkColor || '#ffffff',
            oninput: e => { cfg.inkColor = e.target.value; refresh({ inspector: false }); },
          }),
          h('span', { class: 'note', text: 'Shadow' }),
          h('input', {
            type: 'color', value: cfg.shadowColor || '#000000',
            oninput: e => { cfg.shadowColor = e.target.value; refresh({ inspector: false }); },
          }))
      : null,
  ];
}

function typefaceField(current, onPick) {
  return h('label', { class: 'field stack' },
    h('span', { text: 'Typeface' }),
    h('div', { class: 'row' },
      h('select', { onchange: e => onPick(e.target.value) },
        allFonts().map(f => h('option', {
          value: f.id, ...(f.id === current ? { selected: true } : {}),
          text: f.custom ? `${f.label} (added)` : f.label,
        }))),
      h('button', { type: 'button', text: 'Add', title: 'Add a font file', onclick: () => dom.fontPicker.click() })));
}

function field(label, control) {
  return h('label', { class: 'field stack' }, h('span', { text: label }), control);
}

function textInput(value, onChange, placeholder = '') {
  return h('input', {
    type: 'text', value, placeholder,
    oninput: e => onChange(e.target.value),
  });
}

function layoutIcon(layout) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 30');
  for (const [x, y, w, hh] of layout.cells) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', (x * 20 + 0.6).toFixed(2));
    r.setAttribute('y', (y * 30 + 0.6).toFixed(2));
    r.setAttribute('width', Math.max(0.5, w * 20 - 1.2).toFixed(2));
    r.setAttribute('height', Math.max(0.5, hh * 30 - 1.2).toFixed(2));
    r.setAttribute('rx', '0.8');
    svg.append(r);
  }
  return svg;
}

function buildInspector() {
  const page = currentPage();
  const content = page.panel;
  sel.slot = Math.min(sel.slot, Math.max(0, capacity(content) - 1));
  const photo = content.photos[sel.slot] || null;

  const kids = [
    section(null,
      h('p', { class: 'page-title', text: page.label }),
      h('p', {
        class: 'page-sub',
        text: page.kind === 'spread'
          ? 'Merged spread - one image across both pages'
          : page.meta.role === 'front' ? 'Cover'
          : page.meta.role === 'back' ? 'Back cover' : `Interior page ${page.meta.page}`,
      }),
      spreadToggle(page)),

    section('Layout',
      h('div', { class: 'layouts' }, LAYOUTS.map(l =>
        h('button', {
          type: 'button', class: l.id === content.layout ? 'on' : '', title: l.label,
          onclick: () => { setLayout(content, l.id); sel.slot = 0; refresh(); },
        }, layoutIcon(l)))),
      h('div', { class: 'row' },
        seg(content.fit, [['cover', 'Fill'], ['contain', 'Fit']], v => { content.fit = v; refresh(); }),
        h('input', {
          type: 'color', value: content.bg, title: 'Page background',
          oninput: e => { content.bg = e.target.value; refresh(); },
        })),
      capacity(content) > 1 ? slider('Gutter', content.gutterMM, 0, 12, 0.5, v => `${v}mm`,
        v => { content.gutterMM = v; refresh({ inspector: false }); }) : null,
      slider('Edge inset', content.marginMM, 0, 14, 0.5, v => `${v}mm`,
        v => { content.marginMM = v; refresh({ inspector: false }); })),

    section('Photos', slotList(content)),
  ];

  if (photo) kids.push(...photoSections(content, photo));
  kids.push(captionSection(content));
  kids.push(qrSection(content, page));
  const fonts = fontsSection();
  if (fonts) kids.push(fonts);
  if (page.kind === 'panel' && (page.meta.role === 'front' || page.meta.role === 'back')) {
    kids.push(coverSection(page.meta.role === 'front' ? state.cover : state.back,
      page.meta.role === 'front' ? 'Cover type' : 'Back cover type'));
  }

  dom.inspector.replaceChildren(...kids);
}

function spreadToggle(page) {
  const sIdx = page.kind === 'spread' ? page.spreadId : spreadOf(page.panelIndex);
  if (sIdx < 0) return null;
  const sp = state.spreads[sIdx];
  return h('label', { class: 'chk' },
    h('input', {
      type: 'checkbox', ...(sp.merged ? { checked: true } : {}),
      onchange: e => {
        sp.merged = e.target.checked;
        sel = { page: Math.min(sel.page, pages().length - 1), slot: 0 };
        refresh();
      },
    }),
    h('span', { text: `Merge ${SPREADS[sIdx].label} into one spread` }));
}

function slotList(content) {
  const max = capacity(content);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const photo = content.photos[i];
    const on = i === sel.slot;
    if (!photo) {
      rows.push(h('div', { class: `slot empty${on ? ' on' : ''}` },
        h('div', { class: 'pic' }),
        h('span', { class: 'name', text: `Slot ${i + 1} - empty` }),
        h('button', { type: 'button', text: 'Add', onclick: () => { sel.slot = i; pickFiles(i); } })));
      continue;
    }
    const pic = h('img', { class: 'pic', alt: '' });
    pic.src = photo.img.src;
    rows.push(h('div', {
      class: `slot${on ? ' on' : ''}`,
      onclick: () => { sel.slot = i; refresh({ rail: false }); },
    },
      pic,
      h('span', { class: 'name', text: photo.name || `Photo ${i + 1}` }),
      i > 0 ? h('button', { type: 'button', text: '↑', title: 'Move up', onclick: e => { e.stopPropagation(); movePhoto(content, i, i - 1); sel.slot = i - 1; refresh(); } }) : null,
      i < content.photos.length - 1 ? h('button', { type: 'button', text: '↓', title: 'Move down', onclick: e => { e.stopPropagation(); movePhoto(content, i, i + 1); sel.slot = i + 1; refresh(); } }) : null,
      h('button', { type: 'button', text: '⟳', title: 'Replace', onclick: e => { e.stopPropagation(); pickFiles(i); } }),
      h('button', { type: 'button', text: '✕', title: 'Remove', onclick: e => {
        e.stopPropagation();
        deletePhoto(photo.photoId);
        removePhoto(content, i);
        sel.slot = 0;
        refresh();
      } })));
  }
  rows.push(h('button', {
    type: 'button', text: content.photos.length >= max ? 'Replace photos...' : 'Add photos...',
    onclick: () => pickFiles(content.photos.length < max ? content.photos.length : 0),
  }));
  return h('div', { class: 'slots' }, rows);
}

function photoSections(content, photo) {
  const fx = photo.fx;
  const out = [];

  const zoomRow = content.fit === 'cover'
    ? slider('Zoom', photo.zoom, 1, MAX_ZOOM, 0.02, v => `${v.toFixed(2)}x`, v => {
        photo.zoom = v;
        refresh({ inspector: false });
      })
    : h('p', { class: 'note', text: 'Zoom applies in Fill mode only.' });

  out.push(section(`Photo ${sel.slot + 1}`,
    zoomRow,
    h('div', { class: 'row' },
      h('button', { type: 'button', text: 'Reset view', onclick: () => { resetView(photo); refresh(); } }),
      resolutionNote(content, photo))));

  out.push(section('Filter',
    h('div', { class: 'chips' }, Object.entries(PRESETS).map(([id, p]) =>
      h('button', {
        type: 'button', class: fx.preset === id ? 'on' : '', text: p.label,
        onclick: () => { photo.fx = applyPreset(fx, id); invalidate(photo); refresh(); },
      }))),

    field('Effect', h('select', {
      onchange: e => { fx.effect = e.target.value; fx.preset = 'custom'; invalidate(photo); refresh(); },
    }, EFFECTS.map(e => h('option', { value: e.id, ...(e.id === fx.effect ? { selected: true } : {}), text: e.label })))),

    ...effectParams(photo, fx),

    h('details', { class: 'more' },
      h('summary', { text: 'Fine tune' }),
      h('div', {},
        ...[
          ['Brightness', 'brightness', 0.4, 1.8, 0.01],
          ['Contrast', 'contrast', 0.3, 2.2, 0.01],
          ['Saturation', 'saturate', 0, 2.5, 0.01],
          ['Grayscale', 'grayscale', 0, 1, 0.01],
          ['Sepia', 'sepia', 0, 1, 0.01],
          ['Blur', 'blur', 0, 2, 0.05],
          ['Grain', 'grain', 0, 0.6, 0.01],
          ['Vignette', 'vignette', 0, 0.9, 0.01],
        ].map(([label, key, min, max, step]) =>
          slider(label, fx[key], min, max, step,
            v => (key === 'blur' ? `${v.toFixed(2)}mm` : v.toFixed(2)),
            v => { fx[key] = v; fx.preset = 'custom'; refresh({ inspector: false }); })),
        h('button', {
          type: 'button', text: 'Clear filter',
          onclick: () => { photo.fx = defaultFx(); refresh(); },
        }))),

    h('div', { class: 'row wrap' },
      h('button', { type: 'button', text: 'Apply to page', onclick: () => applyFx(fx, content.photos) }),
      h('button', { type: 'button', text: 'Apply to zine', onclick: () => applyFx(fx, allPhotos()) }))));

  return out;
}

function effectParams(photo, fx) {
  const out = [];
  const bump = () => { fx.preset = 'custom'; refresh({ inspector: false }); };

  if (fx.effect === 'threshold') {
    out.push(slider('Cutoff', fx.threshold, 0.1, 0.9, 0.01, v => v.toFixed(2), v => { fx.threshold = v; bump(); }));
  }
  if (fx.effect === 'halftone' || fx.effect === 'dither') {
    out.push(slider(fx.effect === 'dither' ? 'Cell' : 'Dot pitch', fx.dotMM, 0.3, 4, 0.05, v => `${v.toFixed(2)}mm`,
      v => { fx.dotMM = v; bump(); }));
  }
  if (fx.effect === 'halftone') {
    out.push(slider('Screen angle', fx.angle, 0, 90, 1, v => `${v}°`, v => { fx.angle = v; bump(); }));
  }
  if (fx.effect === 'posterize') {
    out.push(slider('Levels', fx.levels, 2, 10, 1, v => String(v), v => { fx.levels = v; bump(); }));
  }
  if (['threshold', 'dither', 'halftone', 'duotone'].includes(fx.effect)) {
    out.push(h('div', { class: 'row' },
      h('span', { class: 'note', text: 'Ink' }),
      h('input', { type: 'color', value: fx.dark, oninput: e => { fx.dark = e.target.value; bump(); } }),
      h('span', { class: 'note', text: 'Paper' }),
      h('input', { type: 'color', value: fx.light, oninput: e => { fx.light = e.target.value; bump(); } })));
  }
  return out;
}

function applyFx(fx, photos) {
  for (const p of photos) {
    p.fx = JSON.parse(JSON.stringify(fx));
    invalidate(p);
  }
  refresh();
  toast('Filter applied');
  setTimeout(hideToast, 1200);
}

function allPhotos() {
  return [
    ...state.panels.flatMap(p => p.photos),
    ...state.spreads.flatMap(s => s.panel.photos),
  ];
}

/**
 * Zooming past the resolution actually stored is the one way to make a crisp
 * screen preview print soft, so say so rather than let it surprise them.
 */
function resolutionNote(content, photo) {
  if (content.fit !== 'cover' || photo.zoom <= 1.01) return null;
  const g = mm();
  const page = currentPage();
  const cells = layoutRects(content.layout, { x: 0, y: 0, w: page.widthMM, h: page.heightMM },
    { gutter: content.gutterMM, margin: content.marginMM });
  const cell = cells[sel.slot] || cells[0];
  const neededPx = (cell.w / MM_PER_IN) * 300;
  const src = coverRect(photo.img.naturalWidth, photo.img.naturalHeight,
    { x: 0, y: 0, w: cell.w, h: cell.h }, photo);
  const storedW = (src.sw / photo.img.naturalWidth) * Math.min(FULL_MAX_EDGE,
    Math.max(photo.fullW || FULL_MAX_EDGE, photo.fullH || FULL_MAX_EDGE));
  if (storedW >= neededPx * 0.85) return null;
  return h('span', { class: 'note warn', text: `${Math.round((storedW / neededPx) * 300)} DPI at this zoom` });
}

function captionSection(content) {
  const cap = content.caption;
  return section('Caption',
    h('textarea', {
      placeholder: 'Optional text over this page',
      oninput: e => { cap.text = e.target.value; refresh({ inspector: false }); },
    }, cap.text),
    typefaceField(cap.font, v => { cap.font = v; refresh(); }),
    h('div', { class: 'row wrap' },
      seg(cap.align, [['left', '◧'], ['center', '▣'], ['right', '◨']], v => { cap.align = v; refresh(); }),
      seg(cap.valign, [['top', '▲'], ['center', '●'], ['bottom', '▼']], v => { cap.valign = v; refresh(); })),
    h('div', { class: 'row wrap' },
      seg(cap.size, [['small', 'S'], ['medium', 'M'], ['big', 'L']], v => { cap.size = v; refresh(); }),
      h('label', { class: 'chk' },
        h('input', {
          type: 'checkbox', ...(cap.shadow ? { checked: true } : {}),
          onchange: e => { cap.shadow = e.target.checked; refresh(); },
        }),
        h('span', { text: 'Shadow' }))),
    h('div', { class: 'row wrap' }, colorControls(cap)));
}

function qrNote(qr, page) {
  const text = qr.text.trim();
  if (!text) return 'Generated on the page. Nothing is fetched and nothing is sent.';

  let code;
  try {
    code = qrFor(text, qr.ecc);
  } catch {
    return 'Too long to encode. Shorten it, or drop to a lower correction level.';
  }

  const mmPerModule = qrSide(qr, { w: page.widthMM, h: page.heightMM }, 1) / (code.size + QR_QUIET_MODULES * 2);
  const warn = mmPerModule < 0.5 ? ' - under 0.5mm a module, print it bigger' : '';
  return `Version ${code.version}, ${code.size}x${code.size} modules, ${mmPerModule.toFixed(2)}mm each${warn}`;
}

function qrSection(content, page) {
  const qr = content.qr;
  const note = h('p', { class: 'note' });
  const sync = () => { note.textContent = qrNote(qr, page); };
  sync();

  const colorInput = key => h('input', {
    type: 'color', value: qr[key],
    oninput: e => { qr[key] = e.target.value; refresh({ inspector: false }); },
  });

  return section('QR code',
    field('Link or text', textInput(qr.text, v => { qr.text = v; sync(); refresh({ inspector: false }); }, 'https://')),
    slider('Size', qr.sizeMM, 10, 60, 1, v => `${v}mm`,
      v => { qr.sizeMM = v; sync(); refresh({ inspector: false }); }),
    h('div', { class: 'row wrap' },
      seg(qr.align, [['left', '◧'], ['center', '▣'], ['right', '◨']], v => { qr.align = v; refresh(); }),
      seg(qr.valign, [['top', '▲'], ['center', '●'], ['bottom', '▼']], v => { qr.valign = v; refresh(); })),
    h('div', { class: 'row wrap' },
      h('span', { class: 'note', text: 'Correction' }),
      seg(qr.ecc, ECC_LEVELS.map(l => [l, l]), v => { qr.ecc = v; refresh(); })),
    h('div', { class: 'row wrap' },
      h('label', { class: 'chk' },
        h('input', {
          type: 'checkbox', ...(qr.plate ? { checked: true } : {}),
          onchange: e => { qr.plate = e.target.checked; refresh(); },
        }),
        h('span', { text: 'Plate' })),
      h('span', { class: 'note', text: 'Ink' }),
      colorInput('dark'),
      qr.plate ? h('span', { class: 'note', text: 'Paper' }) : null,
      qr.plate ? colorInput('light') : null),
    note);
}

function fontsSection() {
  if (!CUSTOM_FONTS.length) return null;
  return section('Added fonts',
    h('div', { class: 'slots' }, CUSTOM_FONTS.map(f =>
      h('div', { class: 'slot' },
        h('span', { class: 'name', style: `font-family:${f.family};font-size:14px`, text: f.label }),
        h('button', {
          type: 'button', text: '✕', title: 'Remove this font',
          onclick: async () => { await removeFont(f.id); refresh(); },
        })))),
    h('p', { class: 'note', text: 'Stored in this browser. Pages using a removed font fall back to the first built-in.' }));
}

function coverSection(cfg, title) {
  return section(title,
    field('Title', textInput(cfg.title, v => { cfg.title = v; refresh({ inspector: false }); })),
    field('Subtitle', textInput(cfg.subtitle, v => { cfg.subtitle = v; refresh({ inspector: false }); })),
    field('Byline', textInput(cfg.author, v => { cfg.author = v; refresh({ inspector: false }); })),
    typefaceField(cfg.font, v => { cfg.font = v; refresh(); }),
    h('div', { class: 'row wrap' },
      seg(cfg.titleSize, [['small', 'S'], ['medium', 'M'], ['big', 'L']], v => { cfg.titleSize = v; refresh(); })),
    h('div', { class: 'row wrap' }, colorControls(cfg)),
    h('div', { class: 'row wrap' },
      seg(cfg.align, [['left', '◧'], ['center', '▣'], ['right', '◨']], v => { cfg.align = v; refresh(); }),
      seg(cfg.valign, [['top', '▲'], ['center', '●'], ['bottom', '▼']], v => { cfg.valign = v; refresh(); }),
      h('label', { class: 'chk' },
        h('input', {
          type: 'checkbox', ...(cfg.shadow ? { checked: true } : {}),
          onchange: e => { cfg.shadow = e.target.checked; refresh(); },
        }),
        h('span', { text: 'Shadow' }))));
}

// ---------------------------------------------------------------------------
// chrome
// ---------------------------------------------------------------------------

function syncViewToggle() {
  dom.viewToggle.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
}

dom.viewToggle.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  view = b.dataset.view;
  syncViewToggle();
  refresh({ inspector: false });
});

dom.paper.replaceChildren(...Object.entries(PAPER).map(([id, p]) =>
  h('option', { value: id, text: p.label })));
dom.paper.addEventListener('change', () => {
  state.paperSize = dom.paper.value;
  refresh();
});

dom.guides.addEventListener('change', () => {
  state.guides = dom.guides.checked;
  refresh({ inspector: false });
});

dom.resetAll.addEventListener('click', () => {
  if (!confirm('Start over? This clears every page and photo.')) return;
  allPhotos().forEach(p => deletePhoto(p.photoId));
  clearSaved();
  state = createState();
  sel = { page: 0, slot: 0 };
  dom.paper.value = state.paperSize;
  dom.guides.checked = state.guides;
  refresh();
});

async function withFullResolution(fn) {
  const photos = allPhotos();
  const loaded = [];
  try {
    for (const p of photos) {
      if (p.fullImg) continue;
      const rec = await getPhoto(p.photoId);
      if (rec?.full) {
        p.fullImg = await blobToImage(rec.full);
        loaded.push(p);
      }
    }
    return await fn(p => p.fullImg || p.img);
  } finally {
    // These are the biggest objects in the tab; holding them after an export
    // is how a long editing session ends up swapping.
    loaded.forEach(p => { p.fullImg = null; });
  }
}

dom.exportPdf.addEventListener('click', async () => {
  dom.exportPdf.disabled = true;
  const original = dom.exportPdf.textContent;
  dom.exportPdf.textContent = 'Exporting...';
  try {
    await withFullResolution(imageFor =>
      exportPDF(state, { imageFor, onProgress: p => { dom.exportPdf.textContent = `${Math.round(p * 100)}%`; } }));
    toast('PDF saved');
  } catch (err) {
    console.error(err);
    toast(err.message.includes('pdf-lib') ? 'PDF library failed to load. Check your connection.' : 'Export failed.');
  } finally {
    dom.exportPdf.disabled = false;
    dom.exportPdf.textContent = original;
    setTimeout(hideToast, 2200);
  }
});

dom.exportPng.addEventListener('click', async () => {
  dom.exportPng.disabled = true;
  try {
    await withFullResolution(imageFor => exportPNG(state, renderSheet, imageFor));
    toast('PNG saved');
  } catch {
    toast('Export failed.');
  } finally {
    dom.exportPng.disabled = false;
    setTimeout(hideToast, 2000);
  }
});

function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
}
function hideToast() { dom.toast.hidden = true; }

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => drawStage(), 120);
});

window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  const list = pages();
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    sel = { page: (sel.page + 1) % list.length, slot: 0 };
    refresh();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    sel = { page: (sel.page - 1 + list.length) % list.length, slot: 0 };
    refresh();
  }
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function rehydrate(saved) {
  const fresh = createState();
  // Merge rather than trust: a saved document from an older build can be
  // missing whole keys, and a half-built state crashes the renderer.
  const merged = { ...fresh, ...saved };
  merged.panels = fresh.panels.map((p, i) => ({ ...p, ...(saved.panels?.[i] || {}) }));
  merged.spreads = fresh.spreads.map((s, i) => ({
    merged: saved.spreads?.[i]?.merged ?? false,
    panel: { ...s.panel, ...(saved.spreads?.[i]?.panel || {}) },
  }));
  merged.cover = { ...fresh.cover, ...(saved.cover || {}) };
  merged.back = { ...fresh.back, ...(saved.back || {}) };
  state = merged;

  // A read that FAILS and a record that is GONE are different things. Dropping
  // the reference on a failure would hand pruneExcept an empty document and
  // permanently delete bytes that were only temporarily unreachable, so a
  // failure keeps the photo (it renders as an empty slot) and cancels the prune.
  let readFailed = false;

  const contents = [...state.panels, ...state.spreads.map(s => s.panel)];
  await Promise.all(contents.map(async content => {
    const restored = [];
    for (const meta of content.photos || []) {
      const photo = { ...meta, img: null, fx: { ...defaultFx(), ...(meta.fx || {}) }, file: null };
      try {
        const rec = await getPhoto(meta.photoId);
        if (!rec?.preview) continue;
        photo.img = await blobToImage(rec.preview);
      } catch {
        readFailed = true;
      }
      restored.push(photo);
    }
    content.photos = restored;
  }));

  if (readFailed) toast('Some photos could not be reopened. They are still saved - try reloading.');
  else pruneExcept(allPhotos().map(p => p.photoId));
}

async function boot() {
  const ok = await storageAvailable();
  const saved = loadSaved();
  if (saved && ok) {
    try { await rehydrate(saved); } catch { state = createState(); }
  } else if (saved) {
    state = { ...createState(), ...saved, panels: createState().panels, spreads: createState().spreads };
  }

  dom.paper.value = state.paperSize;
  dom.guides.checked = state.guides;
  syncViewToggle();

  await restoreFonts();
  if (document.fonts?.ready) await document.fonts.ready;
  refresh();

  if (!ok) toast('Private browsing: photos will not survive a reload.');
}

boot();
