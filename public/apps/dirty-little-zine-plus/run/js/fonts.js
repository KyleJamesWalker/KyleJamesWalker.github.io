// User-supplied typefaces.
//
// FontFace accepts raw bytes, so a font file the user picked is registered
// without a network request and without a CSP font-src exemption. The bytes go
// to IndexedDB and are re-registered on boot.
//
// Nothing embeds the font in the exported PDF: cover text and captions are
// rasterized to a transparent overlay at export resolution, so a custom face
// prints exactly as it previews.

import { openDB, FONT_STORE } from './photo-store.js';
import { CUSTOM_FONTS } from './state.js';

const EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2', '.ttc'];
const MAX_BYTES = 8 * 1024 * 1024;

export function isFontFile(file) {
  const name = (file.name || '').toLowerCase();
  return EXTENSIONS.some(e => name.endsWith(e));
}

function labelFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.replace(/\b([a-z])/g, (_, c) => c.toUpperCase()) || 'Custom font';
}

/**
 * Derive the typographic profile the renderer needs by measuring the face,
 * rather than asking the user for numbers they have no way to know.
 */
function calibrate(family) {
  const c = document.createElement('canvas').getContext('2d');
  c.font = `100px "${family}"`;

  // Title size is capped as a fraction of column width, and what decides that
  // is how wide the glyphs run: a condensed face can be set far larger at the
  // same measure than a wide one. 0.126 is fitted to the built-in profiles.
  const sample = 'HAMBURGEFONTSIV';
  const advance = c.measureText(sample).width / 100 / sample.length;
  const cap = clamp(0.126 / (advance || 0.6), 0.12, 0.34);

  const m = c.measureText('Hxpq');
  const box = ((m.fontBoundingBoxAscent || 80) + (m.fontBoundingBoxDescent || 20)) / 100;
  const leading = clamp(box * 0.95, 0.95, 1.35);

  return { cap, leading, subScale: 0.38, tracking: 0.05 };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function register(id, label, bytes) {
  const family = `dlz-${id}`;
  const face = new FontFace(family, bytes);
  return face.load().then(loaded => {
    document.fonts.add(loaded);
    const entry = {
      id, label, custom: true,
      family: `"${family}", sans-serif`,
      ...calibrate(family),
    };
    const at = CUSTOM_FONTS.findIndex(f => f.id === id);
    if (at >= 0) CUSTOM_FONTS[at] = entry;
    else CUSTOM_FONTS.push(entry);
    return entry;
  });
}

async function store(id, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FONT_STORE, 'readwrite').objectStore(FONT_STORE).put(record, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Register one picked font file and persist it. Returns the font entry. */
export async function addFontFile(file) {
  if (!isFontFile(file)) throw new Error(`${file.name} is not a font file`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is too large`);

  const bytes = await file.arrayBuffer();
  const id = `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const label = labelFromFilename(file.name);

  // Registering first means a corrupt or unsupported file fails before it is
  // written, so a bad font can never wedge the restore path on next boot.
  const entry = await register(id, label, bytes);
  await store(id, { id, label, bytes });
  return entry;
}

export async function restoreFonts() {
  let records;
  try {
    const db = await openDB();
    records = await new Promise((resolve, reject) => {
      const req = db.transaction(FONT_STORE, 'readonly').objectStore(FONT_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }

  const ok = [];
  for (const r of records) {
    try {
      ok.push(await register(r.id, r.label, r.bytes));
    } catch {
      removeFont(r.id);
    }
  }
  return ok;
}

export async function removeFont(id) {
  const at = CUSTOM_FONTS.findIndex(f => f.id === id);
  if (at >= 0) CUSTOM_FONTS.splice(at, 1);
  try {
    const db = await openDB();
    db.transaction(FONT_STORE, 'readwrite').objectStore(FONT_STORE).delete(id);
  } catch {}
}
