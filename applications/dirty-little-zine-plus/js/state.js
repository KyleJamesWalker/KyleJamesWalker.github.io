// Document model and mutation helpers.

import { PANELS, SPREADS } from './geometry.js';
import { defaultFx } from './filters.js';
import { slotsFor } from './layouts.js';

export const FONTS = [
  { id: 'archivo',  label: 'Archivo Black',    family: '"Archivo Black", sans-serif',    leading: 1.02, cap: 0.20, subScale: 0.34, tracking: 0.10 },
  { id: 'barlow',   label: 'Barlow Condensed', family: '"Barlow Condensed", sans-serif', leading: 1.00, cap: 0.28, subScale: 0.44, tracking: 0.08 },
  { id: 'bebas',    label: 'Bebas Neue',       family: '"Bebas Neue", sans-serif',       leading: 0.96, cap: 0.30, subScale: 0.40, tracking: 0.10 },
  { id: 'courier',  label: 'Courier Prime',    family: '"Courier Prime", monospace',     leading: 1.06, cap: 0.19, subScale: 0.38, tracking: 0.03 },
  { id: 'elite',    label: 'Special Elite',    family: '"Special Elite", monospace',     leading: 1.10, cap: 0.20, subScale: 0.38, tracking: 0.03 },
  { id: 'jost',     label: 'Jost',             family: '"Jost", sans-serif',             leading: 1.02, cap: 0.21, subScale: 0.40, tracking: 0.12 },
  { id: 'oswald',   label: 'Oswald',           family: '"Oswald", sans-serif',           leading: 1.00, cap: 0.25, subScale: 0.38, tracking: 0.10 },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", serif',      leading: 1.00, cap: 0.22, subScale: 0.42, tracking: 0.10 },
  { id: 'press',    label: 'Press Start 2P',   family: '"Press Start 2P", monospace',    leading: 1.30, cap: 0.14, subScale: 0.34, tracking: 0.05 },
  { id: 'syncopate',label: 'Syncopate',        family: '"Syncopate", sans-serif',        leading: 1.06, cap: 0.21, subScale: 0.32, tracking: 0.04 },
];

// Fonts the user added at runtime. fonts.js owns the contents; everything else
// reads through allFonts() so a custom face is indistinguishable from a built-in.
export const CUSTOM_FONTS = [];

export const allFonts = () => [...FONTS, ...CUSTOM_FONTS];

export const fontById = id => allFonts().find(f => f.id === id) || FONTS[0];

export const TITLE_SCALE = { small: 0.72, medium: 1, big: 1.28 };
export const CAPTION_SCALE = { small: 0.030, medium: 0.042, big: 0.058 };

let photoSeq = 0;
export function newPhotoId() {
  photoSeq += 1;
  return `p${Date.now().toString(36)}${photoSeq.toString(36)}`;
}

export function makePhoto(img, file) {
  return {
    photoId: newPhotoId(),
    img,
    file,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    fx: defaultFx(),
  };
}

function makeCaption() {
  return {
    text: '', font: 'elite', align: 'center', valign: 'bottom', size: 'medium',
    color: 'white', inkColor: '#ffffff', shadowColor: '#000000', shadow: true,
  };
}

export function makePanelContent() {
  return {
    layout: 'single',
    fit: 'cover',
    gutterMM: 2,
    marginMM: 0,
    bg: '#ffffff',
    photos: [],
    caption: makeCaption(),
  };
}

export function createState() {
  return {
    paperSize: 'letter',
    guides: true,
    guidesInExport: false,
    cover: {
      title: 'DIRTY LITTLE ZINE',
      subtitle: '',
      author: '',
      font: 'archivo',
      titleSize: 'medium',
      color: 'white',
      inkColor: '#ffffff',
      shadowColor: '#000000',
      align: 'center',
      valign: 'bottom',
      shadow: true,
    },
    back: {
      title: '',
      subtitle: '',
      author: '',
      font: 'courier',
      titleSize: 'small',
      color: 'white',
      inkColor: '#ffffff',
      shadowColor: '#000000',
      align: 'center',
      valign: 'bottom',
      shadow: true,
    },
    panels: PANELS.map(() => makePanelContent()),
    spreads: SPREADS.map(() => ({ merged: false, panel: makePanelContent() })),
  };
}

/** The editable content behind a reading-order page, spread merge respected. */
export function contentFor(state, panelIndex) {
  const sIdx = SPREADS.findIndex(s => s.left === panelIndex || s.right === panelIndex);
  if (sIdx >= 0 && state.spreads[sIdx].merged) {
    return { content: state.spreads[sIdx].panel, spreadId: sIdx, merged: true };
  }
  return { content: state.panels[panelIndex], spreadId: sIdx, merged: false };
}

export function spreadOf(panelIndex) {
  return SPREADS.findIndex(s => s.left === panelIndex || s.right === panelIndex);
}

export function capacity(content) {
  return slotsFor(content.layout);
}

export function addPhoto(content, photo) {
  const max = capacity(content);
  if (content.photos.length >= max) {
    content.photos[max - 1] = photo;
  } else {
    content.photos.push(photo);
  }
}

export function removePhoto(content, i) {
  content.photos.splice(i, 1);
}

export function movePhoto(content, from, to) {
  if (to < 0 || to >= content.photos.length) return;
  const [p] = content.photos.splice(from, 1);
  content.photos.splice(to, 0, p);
}

/** Growing the layout keeps photos; shrinking drops the overflow. */
export function setLayout(content, layoutId) {
  content.layout = layoutId;
  const max = slotsFor(layoutId);
  if (content.photos.length > max) content.photos.length = max;
}

export function resetView(photo) {
  photo.offsetX = 0;
  photo.offsetY = 0;
  photo.zoom = 1;
}
