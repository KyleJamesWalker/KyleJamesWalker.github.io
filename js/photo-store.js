// Photo bytes: decode, downscale to two variants, persist in IndexedDB.
//
// Two variants, not one. Interactive pan/zoom re-runs the whole effect pipeline
// per frame, and doing that on a 3200px source is what makes an editor feel
// broken; the preview variant keeps it responsive while export still gets the
// resolution that zooming in needs.

const DB_NAME = 'dlzplus';
const DB_VERSION = 2;
const STORE = 'photos';
export const FONT_STORE = 'fonts';

export const FULL_MAX_EDGE = 3200;
export const PREVIEW_MAX_EDGE = 1400;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(FONT_STORE)) db.createObjectStore(FONT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // An older version held open in another tab blocks the upgrade. Without
    // this the promise never settles and every caller hangs instead of failing.
    req.onblocked = () => reject(new Error('database upgrade blocked by another tab'));
  }).catch(err => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

export async function storageAvailable() {
  try {
    await openDB();
    return true;
  } catch {
    return false;
  }
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putPhoto(id, variants) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(variants, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePhoto(id) {
  const db = await openDB();
  return new Promise(resolve => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = req.onerror = () => resolve();
  });
}

/**
 * Drop bytes no document references. Refuses to empty the store: being asked to
 * keep nothing means the caller failed to load the document, not that the user
 * deleted every photo, and deleting here is unrecoverable.
 */
export async function pruneExcept(keepIds) {
  const keep = new Set(keepIds);
  if (!keep.size) return;
  try {
    const db = await openDB();
    const store = tx(db, 'readwrite');
    const req = store.getAllKeys();
    req.onsuccess = () => req.result.forEach(k => { if (!keep.has(k)) store.delete(k); });
  } catch {}
}

export function targetSize(w, h, maxEdge) {
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { w, h };
  const s = maxEdge / longEdge;
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

function encode(img, maxEdge, quality) {
  const { w, h } = targetSize(img.naturalWidth, img.naturalHeight, maxEdge);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise(resolve => c.toBlob(b => resolve(b), 'image/jpeg', quality));
}

export async function makeVariants(img) {
  const [full, preview] = await Promise.all([
    encode(img, FULL_MAX_EDGE, 0.92),
    encode(img, PREVIEW_MAX_EDGE, 0.86),
  ]);
  return { full, preview };
}

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

export function fileToImage(file) {
  return blobToImage(file);
}
