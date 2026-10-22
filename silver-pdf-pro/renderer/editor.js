// Annotation editing: overlay rendering, drawing tools, selection, move/resize, property bar
import { state, emit, on, snapshot, dropSnapshot, uid, imageStore, markDirty, guardEditable, clone, replaceBytes } from './core.js';
import { hooks, pageEl, getPageEls, goToPage } from './viewer.js';
import { bbox, translate, BOX_TYPES, wrapLines, canvasMeasure, LINE_H, TEXT_PAD, STAMPS, FONT_CSS } from './geom.js';
import { $, h, icon, toast } from './ui.js';
import { bakeAnnots } from './export.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export const defaults = {
  highlight: { color: '#ffe600' }, underline: { color: '#e5252a' }, strike: { color: '#e5252a' },
  ink: { color: '#e5252a', width: 2.5, opacity: 1 },
  rect: { color: '#e5252a', fill: null, width: 2, opacity: 1 }, ellipse: { color: '#e5252a', fill: null, width: 2, opacity: 1 },
  line: { color: '#e5252a', width: 2, opacity: 1 }, arrow: { color: '#e5252a', width: 2, opacity: 1 },
  text: { color: '#000000', size: 14, font: 'Helvetica', fill: null },
  note: { color: '#ffd633' }, check: { color: '#000000' }, cross: { color: '#000000' },
  stamp: { label: 'APPROVED', color: '#1b8a3a' }, image: { opacity: 1 }, sign: {}, redact: {}, whiteout: {},
};
const MARKUP = new Set(['highlight', 'underline', 'strike']);
const STICKY_TOOLS = new Set(['ink', 'highlight', 'underline', 'strike']);
state.pending = null; // pending image placement { img, ratio }

/* ---------------- overlay rendering ---------------- */
let editingId = null;

export function renderOverlay(doc, i) {
  const el = pageEl(i); if (!el) return;
  const svg = el.querySelector('svg.overlay'), hl = el.querySelector('svg.hl');
  svg.replaceChildren(); hl.replaceChildren();
  for (const a of doc.annots) {
    if (a.page !== i) continue;
    const g = drawAnnot(a, doc);
    if (!g) continue;
    g.dataset.id = a.id;
    (MARKUP.has(a.type) ? hl : svg).append(g);
  }
  const sel = doc.annots.find((a) => a.id === doc.sel && a.page === i);
  if (sel) drawSelection(svg, sel, doc);
}
hooks.renderOverlay = renderOverlay;
export const renderAll = (doc) => doc.pages.forEach((_, i) => renderOverlay(doc, i));

function drawAnnot(a, doc) {
  const g = svgEl('g', { class: 'annot' });
  const op = a.opacity ?? 1;
  switch (a.type) {
    case 'highlight':
      for (const [x, y, w, hh] of a.rects) g.append(svgEl('rect', { x, y, width: w, height: hh, fill: a.color }));
      break;
    case 'underline': case 'strike':
      for (const [x, y, w, hh] of a.rects) {
        const yy = a.type === 'underline' ? y + hh - 0.5 : y + hh * 0.55;
        g.append(svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: a.color, 'stroke-width': Math.max(0.8, hh / 14), 'stroke-linecap': 'round' }));
      }
      break;
    case 'ink':
      g.append(svgEl('path', { d: 'M' + a.points.map((p) => p.join(' ')).join(' L'), fill: 'none', stroke: a.color, 'stroke-width': a.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: op }));
      break;
    case 'rect': case 'whiteout': case 'redact':
      g.append(svgEl('rect', {
        x: a.x, y: a.y, width: a.w, height: a.h, opacity: op,
        fill: a.type === 'whiteout' ? '#fff' : a.type === 'redact' ? 'rgba(0,0,0,.42)' : a.fill || 'transparent',
        stroke: a.type === 'redact' ? '#e5252a' : a.type === 'whiteout' ? 'none' : a.width > 0 ? a.color : 'none',
        'stroke-width': a.type === 'redact' ? 1.5 : a.width, 'stroke-dasharray': a.type === 'redact' ? '5 3' : '',
      }));
      if (a.type === 'redact') {
        const t = svgEl('text', { x: a.x + a.w / 2, y: a.y + a.h / 2 + 4, 'text-anchor': 'middle', fill: '#fff', 'font-size': Math.min(11, a.h * 0.6), 'font-family': 'Arial', 'pointer-events': 'none' });
        t.textContent = a.w > 50 ? 'REDACT' : ''; g.append(t);
      }
      break;
    case 'ellipse':
      g.append(svgEl('ellipse', { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2, fill: a.fill || 'transparent', stroke: a.width > 0 ? a.color : 'none', 'stroke-width': a.width, opacity: op }));
      break;
    case 'line': case 'arrow': {
      g.append(svgEl('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: a.color, 'stroke-width': a.width, 'stroke-linecap': 'round', opacity: op }));
      g.append(svgEl('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: 'transparent', 'stroke-width': Math.max(10, a.width + 6) }));
      if (a.type === 'arrow') {
        const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = 4 + a.width * 3.2, sp = 0.45;
        g.append(svgEl('polygon', { points: `${a.x2},${a.y2} ${a.x2 - L * Math.cos(ang - sp)},${a.y2 - L * Math.sin(ang - sp)} ${a.x2 - L * Math.cos(ang + sp)},${a.y2 - L * Math.sin(ang + sp)}`, fill: a.color, opacity: op }));
      }
      break;
    }
    case 'check':
      g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'transparent' }));
      g.append(svgEl('polyline', { points: `${a.x + a.w * 0.12},${a.y + a.h * 0.55} ${a.x + a.w * 0.4},${a.y + a.h * 0.85} ${a.x + a.w * 0.9},${a.y + a.h * 0.15}`, fill: 'none', stroke: a.color, 'stroke-width': Math.max(1.5, a.h / 7), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      break;
    case 'cross': {
      g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'transparent' }));
      const sw = Math.max(1.5, a.h / 7);
      g.append(svgEl('path', { d: `M${a.x + a.w * 0.15} ${a.y + a.h * 0.15}L${a.x + a.w * 0.85} ${a.y + a.h * 0.85}M${a.x + a.w * 0.85} ${a.y + a.h * 0.15}L${a.x + a.w * 0.15} ${a.y + a.h * 0.85}`, fill: 'none', stroke: a.color, 'stroke-width': sw, 'stroke-linecap': 'round' }));
      break;
    }
    case 'text': {
      g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.fill || 'transparent' }));
      if (editingId === a.id) break;
      const lines = wrapLines(a.text || '', a.w - TEXT_PAD * 2, canvasMeasure(a.font, a.size));
      const t = svgEl('text', { fill: a.color, 'font-size': a.size, 'font-family': FONT_CSS[a.font] || FONT_CSS.Helvetica, 'xml:space': 'preserve' });
      lines.forEach((ln, i) => {
        const ts = svgEl('tspan', { x: a.x + TEXT_PAD, y: a.y + TEXT_PAD + a.size * (LINE_H * i + 0.95), style: 'white-space:pre' });
        ts.textContent = ln || ' '; t.append(ts);
      });
      g.append(t);
      break;
    }
    case 'stamp': {
      const mw = canvasMeasure('Helvetica', 10, true)(a.label);
      const size = Math.min((a.h - 8) * 0.62, ((a.w - 16) / mw) * 10);
      g.append(svgEl('rect', { x: a.x + 1.5, y: a.y + 1.5, width: a.w - 3, height: a.h - 3, fill: 'transparent', stroke: a.color, 'stroke-width': 2.5 }));
      const t = svgEl('text', { x: a.x + a.w / 2, y: a.y + a.h / 2 + size * 0.34, 'text-anchor': 'middle', fill: a.color, 'font-size': size, 'font-weight': 'bold', 'font-family': 'Helvetica, Arial, sans-serif' });
      t.textContent = a.label; g.append(t);
      break;
    }
    case 'image': {
      const im = svgEl('image', { x: a.x, y: a.y, width: a.w, height: a.h, preserveAspectRatio: 'none', opacity: op });
      im.setAttribute('href', imageStore.get(a.img) || '');
      g.append(im);
      break;
    }
    case 'note': {
      g.append(svgEl('rect', { x: a.x, y: a.y, width: 18, height: 18, fill: '#ffd633', stroke: '#8c7300', 'stroke-width': 0.8 }));
      g.append(svgEl('path', { d: `M${a.x + 4} ${a.y + 6}h10M${a.x + 4} ${a.y + 10}h10M${a.x + 4} ${a.y + 14}h6`, stroke: '#665200', 'stroke-width': 0.9 }));
      const t = svgEl('title'); t.textContent = a.text || ''; g.append(t);
      break;
    }
    default: return null;
  }
  return g;
}

function drawSelection(svg, a, doc) {
  const z = doc.zoom, pad = 2;
  const [x, y, w, hh] = bbox(a);
  const g = svgEl('g', { class: 'sel' });
  g.append(svgEl('rect', { class: 'selbox', x: x - pad, y: y - pad, width: w + pad * 2, height: hh + pad * 2, 'vector-effect': 'non-scaling-stroke' }));
  const s = 8 / z;
  const hnd = (cx, cy, name, cursor) => g.append(svgEl('rect', { class: 'handle', x: cx - s / 2, y: cy - s / 2, width: s, height: s, 'data-h': name, style: `cursor:${cursor}`, 'vector-effect': 'non-scaling-stroke' }));
  if (BOX_TYPES.has(a.type)) {
    hnd(a.x, a.y, 'nw', 'nwse-resize'); hnd(a.x + a.w, a.y, 'ne', 'nesw-resize');
    hnd(a.x, a.y + a.h, 'sw', 'nesw-resize'); hnd(a.x + a.w, a.y + a.h, 'se', 'nwse-resize');
  } else if (a.type === 'line' || a.type === 'arrow') {
    hnd(a.x1, a.y1, 'p1', 'move'); hnd(a.x2, a.y2, 'p2', 'move');
  }
  svg.append(g);
}

/* ---------------- selection ---------------- */
export function selectAnnot(doc, id) {
  const prev = doc.annots.find((a) => a.id === doc.sel);
  doc.sel = id;
  if (prev) renderOverlay(doc, prev.page);
  const cur = doc.annots.find((a) => a.id === id);
  if (cur) renderOverlay(doc, cur.page);
  renderPropbar();
  emit('selection', doc);
}

export function deleteAnnot(doc, id) {
  const a = doc.annots.find((x) => x.id === id); if (!a) return;
  if (!guardEditable(doc)) return;
  snapshot(doc);
  doc.annots = doc.annots.filter((x) => x.id !== id);
  if (doc.sel === id) doc.sel = null;
  renderOverlay(doc, a.page); renderPropbar(); emit('annots', doc);
}

const toPt = (e, pe, doc) => { const r = pe.getBoundingClientRect(); return [(e.clientX - r.left) / doc.zoom, (e.clientY - r.top) / doc.zoom]; };
const norm = (x1, y1, x2, y2) => [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];

function hitMarkup(doc, i, x, y) {
  for (let k = doc.annots.length - 1; k >= 0; k--) {
    const a = doc.annots[k];
    if (a.page !== i || !MARKUP.has(a.type)) continue;
    if (a.rects.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh)) return a;
  }
  return null;
}

/* ---------------- tool state ---------------- */
export function setTool(name) {
  const doc = state.cur;
  closeSelBar();
  if (name === 'image' || name === 'sign') { emit('need-image', name); return; }
  state.tool = name;
  document.body.dataset.tool = name;
  $('#scroller').classList.toggle('hand', name === 'hand');
  if (name !== 'select' && doc?.sel) selectAnnot(doc, null);
  renderPropbar();
  emit('tool', name);
}

export function setPendingImage(imgId, ratio, tool) {
  state.pending = { img: imgId, ratio };
  state.tool = tool; document.body.dataset.tool = tool;
  renderPropbar(); emit('tool', tool);
  toast('Click on the page to place it');
}

/* ---------------- pointer handling ---------------- */
function initPointer() {
  const pages = $('#pages');
  pages.addEventListener('pointerdown', onDown);
  pages.addEventListener('dblclick', (e) => {
    const doc = state.cur; if (!doc || state.tool !== 'select') return;
    const g = e.target.closest('.annot'); if (!g) return;
    const a = doc.annots.find((x) => x.id === g.dataset.id);
    if (a && (a.type === 'text' || a.type === 'note')) openTextEdit(doc, a, false);
  });
  window.addEventListener('pointerup', onSelectionEnd);
}

function onDown(e) {
  const doc = state.cur; if (!doc || e.button !== 0) return;
  const pe = e.target.closest('.page'); if (!pe) return;
  if (e.target.closest('.text-edit')) return;
  const i = +pe.dataset.i, tool = state.tool;
  closeSelBar();
  if (doc.page !== i) { doc.page = i; emit('page', doc); }
  if (tool === 'hand') return;

  if (tool === 'select') {
    const [x, y] = toPt(e, pe, doc);
    const handle = e.target.closest('.handle');
    const g = e.target.closest('.annot');
    if (handle && doc.sel) { e.preventDefault(); return startResize(e, doc, handle.dataset.h, pe); }
    if (g) { e.preventDefault(); selectAnnot(doc, g.dataset.id); return startMove(e, doc, pe); }
    const mk = hitMarkup(doc, i, x, y);
    if (mk) {
      // let text selection start natively; only a plain click (no drag, no selection) selects the highlight
      const sx = e.clientX, sy = e.clientY;
      const up = (ev) => {
        window.removeEventListener('pointerup', up);
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4 && window.getSelection()?.isCollapsed !== false) selectAnnot(doc, mk.id);
      };
      window.addEventListener('pointerup', up);
      return;
    }
    if (doc.sel) selectAnnot(doc, null);
    return; // text selection proceeds natively
  }
  if (MARKUP.has(tool)) return; // handled on pointerup via text selection
  if (!guardEditable(doc)) return;
  e.preventDefault();
  if (e.target.closest('.handle')) return;
  const [x, y] = toPt(e, pe, doc);
  startCreate(e, doc, i, pe, tool, x, y);
}

function newAnnot(tool, page, props) {
  const d = defaults[tool] || {};
  return { id: uid(), page, type: tool, ...clone(d), ...props };
}

function startCreate(e, doc, i, pe, tool, x0, y0) {
  snapshot(doc);
  let a, drag = true;
  const finish = (keepTool) => {
    doc.sel = a.id;
    renderOverlay(doc, i); renderPropbar(); emit('annots', doc);
    if (!keepTool && !STICKY_TOOLS.has(tool)) setTool('select');
  };
  const centered = (w, hh, extra) => { a = newAnnot(tool, i, { x: x0 - w / 2, y: y0 - hh / 2, w, h: hh, ...extra }); doc.annots.push(a); finish(); };

  switch (tool) {
    case 'note':
      a = newAnnot('note', i, { x: x0, y: y0, text: '' }); doc.annots.push(a); finish(true); setTool('select');
      openTextEdit(doc, a, true); return;
    case 'check': case 'cross': return centered(22, 22);
    case 'stamp': {
      const label = defaults.stamp.label;
      const w = Math.max(110, Math.min(260, 30 + label.length * 13));
      return centered(w, 44, { label, color: defaults.stamp.color });
    }
    case 'image': case 'sign': {
      const p = state.pending; if (!p) { dropSnapshot(doc); return; }
      const w = tool === 'sign' ? 160 : Math.min(240, doc.pages[i].vp.width * 0.5);
      state.pending = null;
      return centered(w, w / p.ratio, { img: p.img, type: 'image' });
    }
    case 'ink':
      a = newAnnot('ink', i, { points: [[x0, y0]] }); break;
    case 'line': case 'arrow':
      a = newAnnot(tool, i, { x1: x0, y1: y0, x2: x0, y2: y0 }); break;
    case 'text': {
      const d = defaults.text;
      a = newAnnot('text', i, { x: x0, y: y0, w: 0, h: 0, text: '' });
      break;
    }
    default: // rect, ellipse, whiteout, redact
      a = newAnnot(tool, i, { x: x0, y: y0, w: 0, h: 0 });
  }
  doc.annots.push(a);
  let moved = false;
  const move = (ev) => {
    const [x, y] = toPt(ev, pe, doc);
    if (Math.abs(x - x0) + Math.abs(y - y0) > 2) moved = true;
    if (tool === 'ink') {
      const last = a.points[a.points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) > 1.2) a.points.push([x, y]);
    } else if (tool === 'line' || tool === 'arrow') {
      let X = x, Y = y;
      if (ev.shiftKey) { const ang = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(x - x0, y - y0); X = x0 + L * Math.cos(ang); Y = y0 + L * Math.sin(ang); }
      a.x2 = X; a.y2 = Y;
    } else {
      let [bx, by, bw, bh] = norm(x0, y0, x, y);
      if (ev.shiftKey && tool !== 'text') { const m = Math.max(bw, bh); bw = bh = m; bx = x < x0 ? x0 - m : x0; by = y < y0 ? y0 - m : y0; }
      Object.assign(a, { x: bx, y: by, w: bw, h: bh });
    }
    renderOverlay(doc, i);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    if (tool === 'ink') {
      if (a.points.length < 2) a.points.push([a.points[0][0] + 0.1, a.points[0][1]]);
    } else if (tool === 'line' || tool === 'arrow') {
      if (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 3) { doc.annots.pop(); dropSnapshot(doc); renderOverlay(doc, i); return; }
    } else if (tool === 'text') {
      const sz = a.size;
      if (a.w < 30) a.w = 200;
      if (a.h < sz * LINE_H + TEXT_PAD * 2) a.h = sz * LINE_H + TEXT_PAD * 2;
      a.x = Math.min(a.x, doc.pages[i].vp.width - a.w); a.y = Math.min(a.y, doc.pages[i].vp.height - a.h);
      finish(true); setTool('select'); openTextEdit(doc, a, false, true); return;
    } else if (a.w < 3 || a.h < 3) {
      if (!moved) { a.w = tool === 'redact' || tool === 'whiteout' ? 120 : 100; a.h = tool === 'redact' || tool === 'whiteout' ? 24 : 60; }
      else { doc.annots.pop(); dropSnapshot(doc); renderOverlay(doc, i); return; }
    }
    finish();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startMove(e, doc, pe) {
  const a = doc.annots.find((x) => x.id === doc.sel); if (!a) return;
  if (!guardEditable(doc)) return;
  const [sx, sy] = toPt(e, pe, doc);
  const orig = clone(a);
  let snapped = false;
  const move = (ev) => {
    const [x, y] = toPt(ev, pe, doc);
    const dx = x - sx, dy = y - sy;
    if (!snapped && Math.abs(dx) + Math.abs(dy) < 2 / doc.zoom) return;
    if (!snapped) { snapped = true; snapshotWith(doc, orig, a); }
    Object.assign(a, clone(orig)); translate(a, dx, dy);
    renderOverlay(doc, a.page);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    if (snapped) emit('annots', doc);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

/** snapshot where the changed annotation still has its original values */
function snapshotWith(doc, orig, a) {
  const cur = clone(a); Object.assign(a, clone(orig));
  snapshot(doc);
  Object.assign(a, cur);
}

function startResize(e, doc, which, pe) {
  const a = doc.annots.find((x) => x.id === doc.sel); if (!a) return;
  if (!guardEditable(doc)) return;
  const orig = clone(a);
  let snapped = false;
  const move = (ev) => {
    const [x, y] = toPt(ev, pe, doc);
    if (!snapped) { snapped = true; snapshotWith(doc, orig, a); }
    if (which === 'p1') { a.x1 = x; a.y1 = y; }
    else if (which === 'p2') { a.x2 = x; a.y2 = y; }
    else {
      const ax = which.includes('w') ? orig.x + orig.w : orig.x, ay = which.includes('n') ? orig.y + orig.h : orig.y;
      let w = Math.abs(x - ax), hh = Math.abs(y - ay);
      if (a.type === 'image' || a.type === 'check' || a.type === 'cross' || ev.shiftKey) { const r = orig.w / orig.h; if (w / hh > r) hh = w / r; else w = hh * r; }
      w = Math.max(6, w); hh = Math.max(6, hh);
      a.x = which.includes('w') ? ax - w : ax; a.y = which.includes('n') ? ay - hh : ay; a.w = w; a.h = hh;
      if (a.type === 'text') { const need = wrapLines(a.text, a.w - TEXT_PAD * 2, canvasMeasure(a.font, a.size)).length * a.size * LINE_H + TEXT_PAD * 2; if (a.h < need) a.h = need; }
    }
    renderOverlay(doc, a.page);
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (snapped) emit('annots', doc); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

/* ---------------- text editing ---------------- */
export function openTextEdit(doc, a, isNew, fresh = false) {
  if (!guardEditable(doc)) return;
  const pe = pageEl(a.page), z = doc.zoom;
  const isNote = a.type === 'note';
  const ta = h('textarea', { class: 'text-edit', spellcheck: 'false' });
  ta.value = a.text || '';
  const orig = a.text || '';
  let snapped = fresh || isNew;
  if (!snapped) { snapshot(doc); snapped = true; }
  if (isNote) {
    Object.assign(ta.style, { left: a.x * z + 'px', top: (a.y + 20) * z + 'px', width: '230px', height: '120px', background: '#fff7c2', fontSize: '13px', padding: '6px', fontFamily: FONT_CSS.Helvetica, color: '#000', overflow: 'auto', resize: 'both' });
    ta.placeholder = 'Type your comment…';
  } else {
    Object.assign(ta.style, {
      left: a.x * z + 'px', top: a.y * z + 'px', width: a.w * z + 'px', height: a.h * z + 'px', fontSize: a.size * z + 'px',
      fontFamily: FONT_CSS[a.font], color: a.color, padding: TEXT_PAD * z + 'px', lineHeight: LINE_H,
    });
    if (a.fill) ta.style.background = a.fill;
  }
  editingId = a.id;
  pe.append(ta); renderOverlay(doc, a.page);
  ta.focus();
  const grow = () => {
    if (isNote) return;
    const need = wrapLines(ta.value, a.w - TEXT_PAD * 2, canvasMeasure(a.font, a.size)).length * a.size * LINE_H + TEXT_PAD * 2;
    if (need > a.h) { a.h = need; ta.style.height = need * z + 'px'; }
  };
  ta.addEventListener('input', grow);
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    a.text = ta.value; editingId = null; ta.remove();
    if (!a.text.trim()) {
      doc.annots = doc.annots.filter((x) => x.id !== a.id); doc.sel = null; dropSnapshot(doc);
    } else if (a.text === orig && !fresh && !isNew) dropSnapshot(doc);
    else grow();
    renderOverlay(doc, a.page); renderPropbar(); emit('annots', doc);
  };
  ta.addEventListener('blur', commit);
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ta.blur(); }
  });
}

/* ---------------- text markup via selection ---------------- */
let selBar = null;
function closeSelBar() { selBar?.remove(); selBar = null; }

function selectionRects(doc) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const anchor = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!anchor?.closest?.('#pages')) return null;
  const byPage = new Map();
  const els = getPageEls();
  const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  // drop rects contained in a larger rect (duplicates from element boxes)
  const keep = rects.filter((r, i) => !rects.some((o, j) => j !== i && o.left <= r.left + 1 && o.right >= r.right - 1 && o.top <= r.top + 1 && o.bottom >= r.bottom - 1 && (o.width > r.width + 1 || o.height > r.height + 1 || j < i)));
  for (const r of keep) {
    let best = -1, bestArea = 0;
    els.forEach((pe, i) => {
      const pr = pe.getBoundingClientRect();
      const w = Math.min(pr.right, r.right) - Math.max(pr.left, r.left), hh = Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top);
      if (w > 0 && hh > 0 && w * hh > bestArea) { bestArea = w * hh; best = i; }
    });
    if (best < 0) continue;
    const pr = els[best].getBoundingClientRect();
    if (!byPage.has(best)) byPage.set(best, []);
    byPage.get(best).push([(r.left - pr.left) / doc.zoom, (r.top - pr.top) / doc.zoom, r.width / doc.zoom, r.height / doc.zoom]);
  }
  return { byPage, text: sel.toString(), last: keep[keep.length - 1] };
}

export function addMarkup(doc, type, info) {
  if (!guardEditable(doc)) return;
  snapshot(doc);
  for (const [page, rects] of info.byPage) doc.annots.push(newAnnot(type, page, { rects }));
  window.getSelection().removeAllRanges();
  info.byPage.forEach((_, p) => renderOverlay(doc, p));
  emit('annots', doc);
}

function onSelectionEnd(e) {
  const doc = state.cur; if (!doc) return;
  if (e.target.closest?.('#selbar')) return;
  const tool = state.tool;
  if (tool !== 'select' && !MARKUP.has(tool)) return;
  setTimeout(() => {
    const info = selectionRects(doc);
    if (!info || !info.byPage.size) return;
    if (MARKUP.has(tool)) return addMarkup(doc, tool, info);
    showSelBar(doc, info);
  }, 0);
}

function showSelBar(doc, info) {
  closeSelBar();
  const r = info.last;
  const btn = (ic, label, fn) => h('button', { class: 'icon-btn', title: label, html: icon(ic), onclick: () => { fn(); closeSelBar(); } });
  selBar = h('div', {
    id: 'selbar', class: 'dropdown', style: 'min-width:0;display:flex;padding:3px;gap:2px;',
  }, btn('highlight', 'Highlight', () => addMarkup(doc, 'highlight', info)), btn('underline', 'Underline', () => addMarkup(doc, 'underline', info)),
  btn('strike', 'Strikethrough', () => addMarkup(doc, 'strike', info)),
  btn('copy', 'Copy', () => navigator.clipboard?.writeText(info.text)));
  document.body.append(selBar);
  const w = selBar.offsetWidth;
  selBar.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.right - w / 2)) + 'px';
  selBar.style.top = r.bottom + 6 + 'px';
}
document.addEventListener('mousedown', (e) => { if (selBar && !selBar.contains(e.target)) closeSelBar(); });

/* ---------------- property bar ---------------- */
const SWATCHES = ['#e5252a', '#ff8a00', '#ffe600', '#1b8a3a', '#1d6ee5', '#8a2be2', '#000000', '#ffffff'];

export function renderPropbar() {
  const bar = $('#propbar'); const doc = state.cur;
  bar.replaceChildren();
  if (!doc) return;
  const sel = doc.annots.find((a) => a.id === doc.sel);
  const type = sel ? (sel.type) : state.tool;
  const target = sel || defaults[type];
  if (!target || !defaults[type]) {
    if (type === 'select') bar.append(h('span', { class: 'prop' }, 'Select text to highlight or comment · click an annotation to edit it · Del removes it'));
    else if (type === 'hand') bar.append(h('span', { class: 'prop' }, 'Drag to pan the document'));
    return;
  }
  const apply = (patch, final = true) => {
    if (sel) {
      if (!guardEditable(doc)) return;
      if (final) snapshot(doc);
      Object.assign(sel, patch); renderOverlay(doc, sel.page); emit('annots', doc);
    } else Object.assign(defaults[type], patch);
  };
  const prop = (label, el) => bar.append(h('label', { class: 'prop' }, label, el));
  const hasColor = !['image', 'redact', 'whiteout', 'sign'].includes(type);
  if (type === 'stamp') {
    const s = h('select', {}, STAMPS.map((st) => h('option', { value: st.label }, st.label)));
    s.value = target.label;
    s.onchange = () => { const st = STAMPS.find((x) => x.label === s.value); apply({ label: st.label, color: st.color }); };
    prop('Stamp', s);
  }
  if (hasColor && type !== 'stamp') {
    const c = h('input', { type: 'color', value: target.color || '#e5252a' });
    c.oninput = () => { if (sel) { Object.assign(sel, { color: c.value }); renderOverlay(doc, sel.page); } else defaults[type].color = c.value; };
    c.onchange = () => { if (sel) { const v = c.value; sel.color = target.color; apply({ color: v }); } };
    prop(type === 'text' ? 'Text color' : 'Color', c);
    const sw = h('div', { class: 'swatches' }, SWATCHES.map((col) => h('div', { class: 'sw' + (target.color === col ? ' on' : ''), style: `background:${col}`, onclick: () => { apply({ color: col }); renderPropbar(); } })));
    bar.append(sw);
  }
  if ('width' in (target || {}) && ['ink', 'rect', 'ellipse', 'line', 'arrow'].includes(type)) {
    const s = h('select', {}, [0, 1, 1.5, 2, 3, 4, 6, 8, 12].filter((v) => v || ['rect', 'ellipse'].includes(type)).map((v) => h('option', { value: v }, v + ' pt')));
    s.value = target.width; s.onchange = () => apply({ width: +s.value }); prop('Thickness', s);
  }
  if (['rect', 'ellipse', 'text'].includes(type)) {
    const on = h('input', { type: 'checkbox' }); on.checked = !!target.fill;
    const fc = h('input', { type: 'color', value: target.fill || (type === 'text' ? '#ffffff' : '#ffe600') });
    on.onchange = () => apply({ fill: on.checked ? fc.value : null });
    fc.onchange = () => { on.checked = true; apply({ fill: fc.value }); };
    prop('Fill', on); bar.append(fc);
  }
  if (type === 'text') {
    const f = h('select', {}, ['Helvetica', 'Times', 'Courier'].map((v) => h('option', { value: v }, v === 'Times' ? 'Times New Roman' : v === 'Courier' ? 'Courier New' : 'Arial / Helvetica')));
    f.value = target.font; f.onchange = () => apply({ font: f.value }); prop('Font', f);
    const s = h('input', { type: 'number', min: 6, max: 144, value: target.size, style: 'width:60px' });
    s.onchange = () => { apply({ size: Math.max(6, +s.value || 14) }); if (sel) { const need = wrapLines(sel.text, sel.w - TEXT_PAD * 2, canvasMeasure(sel.font, sel.size)).length * sel.size * LINE_H + TEXT_PAD * 2; if (sel.h < need) { sel.h = need; renderOverlay(doc, sel.page); } } };
    prop('Size', s);
  }
  if ('opacity' in (target || {}) && ['ink', 'rect', 'ellipse', 'line', 'arrow', 'image'].includes(type)) {
    const r = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: target.opacity ?? 1 });
    r.onchange = () => apply({ opacity: +r.value }); prop('Opacity', r);
  }
  if (type === 'redact') {
    bar.append(h('span', { class: 'prop' }, 'Draw boxes over content to remove, then'));
    bar.append(h('button', { class: 'btn primary', onclick: () => applyRedactions(doc) }, 'Apply redactions'));
  }
  if (type === 'image' && sel) bar.append(h('span', { class: 'prop' }, 'Drag corners to resize'));
  if (sel) {
    bar.append(h('div', { class: 'spacer' }));
    if (sel.type === 'text' || sel.type === 'note') bar.append(h('button', { class: 'btn', onclick: () => openTextEdit(doc, sel, false) }, 'Edit text'));
    bar.append(h('button', { class: 'btn danger', html: icon('trash') + ' Delete', style: 'display:flex;gap:6px;align-items:center', onclick: () => deleteAnnot(doc, sel.id) }));
  }
}

export async function applyRedactions(doc) {
  const marks = doc.annots.filter((a) => a.type === 'redact');
  if (!marks.length) return toast('No redaction marks to apply', true);
  if (!guardEditable(doc)) return;
  snapshot(doc);
  const tmp = { ...doc, annots: marks };
  try {
    const bytes = await bakeAnnots(tmp);
    doc.annots = doc.annots.filter((a) => a.type !== 'redact');
    await replaceBytes(doc, bytes, doc.pages.map((_, i) => i).map((i) => i)); // identity page map keeps other annotations
    toast(`Redacted ${marks.length} area${marks.length > 1 ? 's' : ''} — underlying content permanently removed`);
  } catch (e) { console.error(e); toast('Redaction failed: ' + e.message, true); }
}

/* ---------------- keyboard ---------------- */
function initKeys() {
  window.addEventListener('keydown', (e) => {
    const doc = state.cur;
    if (!doc || e.target.matches('input,textarea,select,[contenteditable]')) return;
    if (document.querySelector('.modal-bg')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && doc.sel) { e.preventDefault(); deleteAnnot(doc, doc.sel); }
    else if (e.key === 'Escape') { if (doc.sel) selectAnnot(doc, null); if (state.tool !== 'select') setTool('select'); }
    else if (doc.sel && e.key.startsWith('Arrow') && state.tool === 'select') {
      const a = doc.annots.find((x) => x.id === doc.sel); if (!a || !guardEditable(doc)) return;
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      snapshot(doc);
      translate(a, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
      renderOverlay(doc, a.page); emit('annots', doc);
    }
  });
}

export function initEditor() {
  initPointer(); initKeys();
  on('annots-all', (doc) => { if (doc === state.cur) { renderAll(doc); renderPropbar(); emit('annots', doc); } });
  on('selection', () => {});
}
