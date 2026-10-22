// Left pane panels: thumbnails (page organizer), bookmarks, comments, form fields
import { state, on, emit, annotsOn } from './core.js';
import { goToPage, goToDest } from './viewer.js';
import { selectAnnot } from './editor.js';
import { $, h, icon, esc, showMenu, toast } from './ui.js';
import * as T from './tools.js';

export const panel = { name: 'thumbs', open: true };
const PANELS = [
  ['thumbs', 'pages', 'Page thumbnails'], ['bookmarks', 'bookmark', 'Bookmarks'], ['comments', 'comment', 'Comments'], ['forms', 'form', 'Form fields'],
];
let thumbObserver = null;
let lastIdx = 0;

export function buildRail() {
  const rail = $('#rail'); rail.replaceChildren();
  for (const [id, ic, title] of PANELS) {
    rail.append(h('button', { class: 'rail-btn' + (panel.open && panel.name === id ? ' active' : ''), title, html: icon(ic), onclick: () => togglePanel(id) }));
  }
}
export function togglePanel(id) {
  if (panel.name === id && panel.open) panel.open = false; else { panel.name = id; panel.open = true; }
  buildRail(); renderPanel();
}

export async function renderPanel() {
  const pane = $('#leftpane'); const doc = state.cur;
  pane.classList.toggle('collapsed', !panel.open || !doc);
  if (!panel.open || !doc) return;
  const title = PANELS.find((p) => p[0] === panel.name)[2];
  $('#leftpane-head').textContent = title;
  const body = $('#leftpane-body'); body.replaceChildren();
  thumbObserver?.disconnect();
  if (panel.name === 'thumbs') renderThumbs(doc, body);
  else if (panel.name === 'bookmarks') await renderBookmarks(doc, body);
  else if (panel.name === 'comments') renderComments(doc, body);
  else if (panel.name === 'forms') await renderForms(doc, body);
}

/* ---- thumbnails ---- */
function renderThumbs(doc, body) {
  const sel = doc.thumbSel;
  const act = (ic, label, fn) => h('button', { class: 'mini-btn', title: label, html: icon(ic), onclick: fn });
  const selected = () => (sel.size ? [...sel] : [doc.page]);
  body.append(h('div', { class: 'thumb-actions' },
    act('rotateL', 'Rotate left', () => T.rotatePages(doc, selected(), -90)), act('rotate', 'Rotate right', () => T.rotatePages(doc, selected(), 90)),
    act('trash', 'Delete pages', () => T.deletePages(doc, selected())), act('copy', 'Duplicate pages', () => T.duplicatePages(doc, selected())),
    act('insert', 'Insert blank page after', () => T.insertBlank(doc, Math.max(...selected()))), act('extract', 'Extract pages', () => T.extractPages(doc, selected()))));
  body.append(h('div', { class: 'msg', style: 'font-size:11px;color:var(--muted);margin:0 0 6px' }, 'Click to select (Ctrl/Shift for several). Drag to reorder.'));
  thumbObserver = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting && !en.target._done) { en.target._done = true; drawThumb(doc, en.target); }
  }, { root: $('#leftpane-body'), rootMargin: '300px' });
  doc.pages.forEach((info, i) => {
    const wpx = 140, hpx = Math.round((info.vp.height / info.vp.width) * wpx);
    const c = h('canvas', { width: wpx, height: hpx, style: `width:${wpx}px;height:${hpx}px` });
    c._i = i;
    const el = h('div', { class: 'thumb' + (i === doc.page ? ' cur' : '') + (sel.has(i) ? ' sel' : ''), draggable: 'true', 'data-i': i }, c, h('span', { class: 'n' }, i + 1));
    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) { sel.has(i) ? sel.delete(i) : sel.add(i); }
      else if (e.shiftKey) { sel.clear(); for (let k = Math.min(lastIdx, i); k <= Math.max(lastIdx, i); k++) sel.add(k); }
      else { sel.clear(); sel.add(i); }
      lastIdx = i;
      goToPage(doc, i); markThumbs(doc);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!sel.has(i)) { sel.clear(); sel.add(i); markThumbs(doc); }
      const s = () => [...sel];
      showMenu([
        { label: 'Rotate left', icon: 'rotateL', action: () => T.rotatePages(doc, s(), -90) }, { label: 'Rotate right', icon: 'rotate', action: () => T.rotatePages(doc, s(), 90) }, '-',
        { label: 'Delete', icon: 'trash', action: () => T.deletePages(doc, s()) }, { label: 'Duplicate', icon: 'copy', action: () => T.duplicatePages(doc, s()) },
        { label: 'Extract to new document', icon: 'extract', action: () => T.extractPages(doc, s()) }, '-',
        { label: 'Insert blank page after', icon: 'insert', action: () => T.insertBlank(doc, i) }, { label: 'Insert pages from file…', icon: 'file', action: () => T.insertFromFile(doc, i) },
      ], e.clientX, e.clientY);
    });
    el.addEventListener('dragstart', (e) => {
      if (!sel.has(i)) { sel.clear(); sel.add(i); markThumbs(doc); }
      e.dataTransfer.setData('text/x-pages', JSON.stringify([...sel])); e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-pages')) { e.preventDefault(); el.classList.add('dragover'); } });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('dragover');
      const raw = e.dataTransfer.getData('text/x-pages'); if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      T.movePages(doc, JSON.parse(raw), e.clientY > r.top + r.height / 2 ? i + 1 : i);
    });
    body.append(el);
    thumbObserver.observe(c);
  });
}

async function drawThumb(doc, canvas) {
  const info = doc.pages[canvas._i]; if (!info) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), wpx = 140;
  const vp = info.page.getViewport({ scale: (wpx / info.vp.width) * dpr });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  try {
    await info.page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'white' }).promise;
    canvas.width = c.width; canvas.height = c.height;
    canvas.getContext('2d').drawImage(c, 0, 0);
  } catch {}
}

function markThumbs(doc) {
  $('#leftpane-body').querySelectorAll('.thumb').forEach((el) => {
    const i = +el.dataset.i;
    el.classList.toggle('cur', i === doc.page); el.classList.toggle('sel', doc.thumbSel.has(i));
  });
}

/* ---- bookmarks ---- */
async function renderBookmarks(doc, body) {
  if (doc.outline === undefined) { try { doc.outline = await doc.pdf.getOutline(); } catch { doc.outline = null; } }
  if (!doc.outline?.length) return body.append(h('div', { class: 'empty' }, 'This document has no bookmarks.'));
  const build = (items, depth) => items.map((it) => {
    const wrap = h('div');
    const kids = it.items?.length ? h('div', { style: 'padding-left:14px', hidden: depth > 0 }, build(it.items, depth + 1)) : null;
    const tog = h('span', { class: 'ol-toggle' }, kids ? (kids.hidden ? '▸' : '▾') : '');
    const row = h('div', { class: 'ol-item' }, tog, h('span', {}, it.title));
    row.addEventListener('click', (e) => { if (e.target === tog && kids) { kids.hidden = !kids.hidden; tog.textContent = kids.hidden ? '▸' : '▾'; } else goToDest(doc, it.dest); });
    wrap.append(row); if (kids) wrap.append(kids);
    return wrap;
  });
  body.append(...build(doc.outline, 0));
}

/* ---- comments ---- */
const LABEL = { highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough', note: 'Sticky note', text: 'Text box', ink: 'Drawing', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', image: 'Image', stamp: 'Stamp', redact: 'Redaction', whiteout: 'White-out', check: 'Check mark', cross: 'Cross' };
function renderComments(doc, body) {
  const list = [...doc.annots].sort((a, b) => a.page - b.page);
  if (!list.length) return body.append(h('div', { class: 'empty' }, 'No annotations yet. Use the toolbar to highlight, comment or draw.'));
  for (const a of list) {
    const c = h('div', { class: 'cm', style: doc.sel === a.id ? 'border-color:var(--blue)' : '' },
      h('div', { class: 'h' }, h('span', {}, LABEL[a.type] || a.type), h('span', {}, 'Page ' + (a.page + 1))),
      h('div', { class: 'b' }, a.text || a.label || ''));
    c.addEventListener('click', () => { goToPage(doc, a.page, a.y ?? a.rects?.[0]?.[1] ?? null); selectAnnot(doc, a.id); });
    body.append(c);
  }
}

/* ---- forms ---- */
async function renderForms(doc, body) {
  body.append(h('div', { class: 'empty' }, 'Reading form fields…'));
  const fields = await T.readFormFields(doc);
  body.replaceChildren();
  if (!fields.length) return body.append(h('div', { class: 'empty' }, 'This document has no fillable form fields.'));
  const inputs = {};
  for (const f of fields) {
    let inp;
    if (f.kind === 'text') { inp = f.multi ? h('textarea', { class: 'field' }) : h('input', { class: 'field', type: 'text' }); inp.value = f.value; inp.get = () => inp.value; }
    else if (f.kind === 'check') { inp = h('input', { type: 'checkbox' }); inp.checked = f.value; inp.get = () => inp.checked; }
    else { inp = h('select', { class: 'field' }, [h('option', { value: '' }, '—'), ...f.options.map((o) => h('option', { value: o }, o))]); inp.value = f.value; inp.get = () => inp.value; }
    inputs[f.name] = inp;
    body.append(h('div', { class: 'form-row' }, h('label', {}, f.name), inp));
  }
  body.append(h('button', { class: 'btn primary', style: 'width:100%', onclick: async () => {
    const vals = {}; for (const [k, v] of Object.entries(inputs)) vals[k] = v.get();
    await T.applyFormValues(doc, vals);
  } }, 'Apply to document'));
  body.append(h('button', { class: 'btn', style: 'width:100%;margin-top:6px', onclick: () => T.flattenForm(doc) }, 'Flatten form (make non-editable)'));
}

export function initSidebar() {
  buildRail();
  on('current', () => renderPanel());
  on('reload', (d) => { if (d === state.cur) renderPanel(); });
  on('page', (d) => { if (d === state.cur && panel.name === 'thumbs' && panel.open) markThumbs(d); });
  on('thumbs', (d) => { if (d === state.cur && panel.name === 'thumbs') markThumbs(d); });
  on('annots', (d) => { if (d === state.cur && panel.name === 'comments' && panel.open) renderPanel(); });
  on('selection', (d) => { if (d === state.cur && panel.name === 'comments' && panel.open) renderPanel(); });
  on('annots-all', (d) => { if (d === state.cur && panel.name === 'comments' && panel.open) renderPanel(); });
}
