// Document model, history and pdf.js loading
import * as pdfjsLib from './vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
export { pdfjsLib };
export const PDFLib = window.PDFLib;

export const state = {
  docs: [],
  cur: null,
  tool: 'select',
  askPassword: null,
};
export const imageStore = new Map(); // imgId -> dataUrl

/* tiny pub/sub */
const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

let idc = 0;
export const uid = (p = 'a') => p + ++idc + Math.random().toString(36).slice(2, 5);
export const clone = (o) => JSON.parse(JSON.stringify(o));

const base = new URL('./vendor/', import.meta.url).href;
const pdfOpts = { cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/', iccUrl: base + 'iccs/' };

export async function loadPdfjs(doc) {
  try { await doc.pdf?.destroy(); } catch {}
  const task = pdfjsLib.getDocument({ data: doc.bytes.slice(), ...pdfOpts, password: doc.password || undefined });
  task.onPassword = async (update, reason) => {
    const pw = await state.askPassword?.(reason === 2);
    if (pw == null) { task.destroy(); return; }
    doc.password = pw; doc.readOnly = true; update(pw);
  };
  doc.pdf = await task.promise;
  doc.pages = [];
  for (let i = 1; i <= doc.pdf.numPages; i++) {
    const page = await doc.pdf.getPage(i);
    doc.pages.push({ page, vp: page.getViewport({ scale: 1 }) });
  }
  doc.textCache = new Map();
  doc.outline = undefined;
}

let docSeq = 0;
export async function openBytes(bytes, name, path) {
  const doc = {
    id: ++docSeq, name: name || 'Untitled.pdf', path: path || null, bytes: new Uint8Array(bytes),
    annots: [], undo: [], redo: [], dirty: false, zoom: 1, fit: 'width', page: 0, scrollTop: 0, sel: null,
    readOnly: false, password: null, search: { q: '', hits: [], idx: -1 }, formValues: null, thumbSel: new Set(),
  };
  await loadPdfjs(doc);
  state.docs.push(doc);
  setCurrent(doc);
  return doc;
}

export function setCurrent(doc) {
  state.cur = doc;
  emit('current', doc);
}

export function closeDoc(doc) {
  const i = state.docs.indexOf(doc);
  if (i < 0) return;
  state.docs.splice(i, 1);
  try { doc.pdf?.destroy(); } catch {}
  if (state.cur === doc) setCurrent(state.docs[Math.min(i, state.docs.length - 1)] || null);
  else emit('tabs');
}

export function markDirty(doc, v = true) { doc.dirty = v; emit('tabs'); }

/* ---- history ---- */
export function snapshot(doc) {
  doc.undo.push({ bytes: doc.bytes, annots: clone(doc.annots) });
  if (doc.undo.length > 60) doc.undo.shift();
  doc.redo = [];
  markDirty(doc);
}
export function dropSnapshot(doc) { doc.undo.pop(); }

async function restore(doc, entry) {
  const bytesChanged = entry.bytes !== doc.bytes;
  doc.annots = entry.annots; doc.sel = null;
  if (bytesChanged) { doc.bytes = entry.bytes; await loadPdfjs(doc); emit('reload', doc); }
  else emit('annots-all', doc);
  markDirty(doc);
}
export async function undo(doc) {
  if (!doc?.undo.length) return;
  doc.redo.push({ bytes: doc.bytes, annots: clone(doc.annots) });
  await restore(doc, doc.undo.pop());
}
export async function redo(doc) {
  if (!doc?.redo.length) return;
  doc.undo.push({ bytes: doc.bytes, annots: clone(doc.annots) });
  await restore(doc, doc.redo.pop());
}

/**
 * Replace document bytes (after a pdf-lib edit). annotMap: array newIndex -> oldIndex (or null).
 * When omitted, annotations must already have been baked into the bytes.
 */
export async function replaceBytes(doc, bytes, annotMap) {
  if (annotMap) {
    const next = [];
    for (const a of doc.annots) {
      const ni = annotMap.indexOf(a.page);
      if (ni >= 0) next.push({ ...a, page: ni });
    }
    doc.annots = next;
  } else doc.annots = [];
  doc.sel = null;
  doc.bytes = bytes;
  await loadPdfjs(doc);
  emit('reload', doc);
}

export function guardEditable(doc) {
  if (!doc) return false;
  if (doc.readOnly) { emit('toast', ['This document is password protected and can only be viewed.', true]); return false; }
  return true;
}

export const annotsOn = (doc, i) => doc.annots.filter((a) => a.page === i);
