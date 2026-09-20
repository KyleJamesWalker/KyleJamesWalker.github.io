// Text and layout config in localStorage; photo pixels live in IndexedDB.

const KEY = 'dlzplus-v1';
const VERSION = 2;
const DEBOUNCE_MS = 400;

let timer = null;

export function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION) return null;
    return data.state;
  } catch {
    return null;
  }
}

export function scheduleSave(state) {
  clearTimeout(timer);
  timer = setTimeout(() => saveNow(state), DEBOUNCE_MS);
}

export function saveNow(state) {
  clearTimeout(timer);
  timer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, state: strip(state) }));
  } catch {
    // Private mode or quota exhausted. Nothing to do but keep working.
  }
}

export function clearSaved() {
  clearTimeout(timer);
  timer = null;
  try { localStorage.removeItem(KEY); } catch {}
}

// `img` is a live element and `file` is never read after upload, so neither is
// persisted; photoId is the handle back to the bytes in IndexedDB.
function photoMeta(p) {
  if (!p || !p.photoId) return null;
  const { photoId, offsetX, offsetY, zoom, fx } = p;
  return { photoId, offsetX, offsetY, zoom, fx };
}

function stripContent(c) {
  return { ...c, photos: c.photos.map(photoMeta).filter(Boolean) };
}

function strip(state) {
  return {
    ...state,
    panels: state.panels.map(stripContent),
    spreads: state.spreads.map(s => ({ ...s, panel: stripContent(s.panel) })),
  };
}
