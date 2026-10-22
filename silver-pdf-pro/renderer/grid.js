// "All pages" grid view (like Acrobat's Organize Pages): big thumbnails, zoom slider, select, drag to reorder
import { state, on, emit } from './core.js';
import { goToPage } from './viewer.js';
import { $, h, icon, showMenu } from './ui.js';
import * as T from './tools.js';

let open = false, observer = null, size = 170, lastIdx = 0;
const view = () => $('#gridview');

export const isGridOpen = () => open;

export function toggleGrid(force) {
  const doc = state.cur;
  open = force ?? !open;
  if (!doc) open = false;
  view().hidden = !open;
  $('#scroller').style.visibility = open ? 'hidden' : '';
  document.body.classList.toggle('grid-open', open);
  if (open) renderGrid(doc); else { observer?.disconnect(); view().replaceChildren(); }
  emit('grid', open);
}

function renderGrid(doc) {
  const root = view(); root.replaceChildren();
  observer?.disconnect();
  const sel = doc.thumbSel;
  const picked = () => (sel.size ? [...sel].sort((a, b) => a - b) : [doc.page]);
  const act = (ic, label, fn) => h('button', { class: 'tb-btn', title: label, html: icon(ic) + `<span class="lbl">${label}</span>`, onclick: fn });
  const slider = h('input', { type: 'range', min: 90, max: 420, value: size, title: 'Thumbnail size' });
  const count = h('span', { class: 'tb-text' }, '');
  const upd = () => (count.textContent = `${doc.pages.length} pages${sel.size ? ` · ${sel.size} selected` : ''}`);
  upd();

  const bar = h('div', { class: 'grid-bar' },
    act('rotateL', 'Rotate left', () => T.rotatePages(doc, picked(), -90)), act('rotate', 'Rotate right', () => T.rotatePages(doc, picked(), 90)),
    act('trash', 'Delete', () => T.deletePages(doc, picked())), act('copy', 'Duplicate', () => T.duplicatePages(doc, picked())),
    act('extract', 'Extract', () => T.extractPages(doc, picked())), act('insert', 'Insert blank', () => T.insertBlank(doc, Math.max(...picked()))),
    act('file', 'Insert from file', () => T.insertFromFile(doc, Math.max(...picked()))),
    h('div', { class: 'spacer' }), count,
    h('span', { html: icon('zoomout'), style: 'margin-left:10px' }), slider, h('span', { html: icon('zoomin') }),
    h('button', { class: 'btn primary', style: 'margin-left:12px', onclick: () => toggleGrid(false) }, 'Done'));
  const body = h('div', { class: 'grid-body' });
  root.append(bar, body);

  const resize = () => body.style.setProperty('--tw', size + 'px');
  resize();
  slider.oninput = () => {
    size = +slider.value; resize();
    body.querySelectorAll('canvas').forEach((c) => { const info = doc.pages[c._i]; c.style.width = size + 'px'; c.style.height = Math.round((info.vp.height / info.vp.width) * size) + 'px'; c._done = false; });
    clearTimeout(slider._t); slider._t = setTimeout(() => body.querySelectorAll('canvas').forEach((c) => { if (c._vis) draw(doc, c); }), 150);
  };

  observer = new IntersectionObserver((entries) => {
    for (const en of entries) { en.target._vis = en.isIntersecting; if (en.isIntersecting && !en.target._done) draw(doc, en.target); }
  }, { root: body, rootMargin: '400px' });

  doc.pages.forEach((info, i) => {
    const c = h('canvas', { style: `width:${size}px;height:${Math.round((info.vp.height / info.vp.width) * size)}px` });
    c._i = i;
    const el = h('div', { class: 'gthumb' + (sel.has(i) ? ' sel' : '') + (i === doc.page ? ' cur' : ''), draggable: 'true', 'data-i': i }, c, h('span', { class: 'n' }, i + 1));
    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) sel.has(i) ? sel.delete(i) : sel.add(i);
      else if (e.shiftKey) { sel.clear(); for (let k = Math.min(lastIdx, i); k <= Math.max(lastIdx, i); k++) sel.add(k); }
      else { sel.clear(); sel.add(i); }
      lastIdx = i; doc.page = i;
      body.querySelectorAll('.gthumb').forEach((t) => { const k = +t.dataset.i; t.classList.toggle('sel', sel.has(k)); t.classList.toggle('cur', k === i); });
      upd();
    });
    el.addEventListener('dblclick', () => { toggleGrid(false); goToPage(doc, i); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!sel.has(i)) { sel.clear(); sel.add(i); body.querySelectorAll('.gthumb').forEach((t) => t.classList.toggle('sel', +t.dataset.i === i)); upd(); }
      const s = () => [...sel];
      showMenu([
        { label: 'Open page', icon: 'eye', action: () => { toggleGrid(false); goToPage(doc, i); } }, '-',
        { label: 'Rotate left', icon: 'rotateL', action: () => T.rotatePages(doc, s(), -90) }, { label: 'Rotate right', icon: 'rotate', action: () => T.rotatePages(doc, s(), 90) },
        { label: 'Delete', icon: 'trash', action: () => T.deletePages(doc, s()) }, { label: 'Duplicate', icon: 'copy', action: () => T.duplicatePages(doc, s()) },
        { label: 'Extract to new document', icon: 'extract', action: () => T.extractPages(doc, s()) }, '-',
        { label: 'Insert blank page after', icon: 'insert', action: () => T.insertBlank(doc, i) }, { label: 'Insert pages from file…', icon: 'file', action: () => T.insertFromFile(doc, i) },
      ], e.clientX, e.clientY);
    });
    el.addEventListener('dragstart', (e) => {
      if (!sel.has(i)) { sel.clear(); sel.add(i); body.querySelectorAll('.gthumb').forEach((t) => t.classList.toggle('sel', +t.dataset.i === i)); }
      e.dataTransfer.setData('text/x-pages', JSON.stringify([...sel])); e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/x-pages')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
      el.classList.toggle('drop-before', !after); el.classList.toggle('drop-after', after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      const after = el.classList.contains('drop-after');
      el.classList.remove('drop-before', 'drop-after');
      const raw = e.dataTransfer.getData('text/x-pages'); if (!raw) return;
      e.preventDefault();
      T.movePages(doc, JSON.parse(raw), after ? i + 1 : i);
    });
    body.append(el);
    observer.observe(c);
  });
  // start with the current page in view
  requestAnimationFrame(() => body.querySelector('.gthumb.cur')?.scrollIntoView({ block: 'center' }));
}

async function draw(doc, canvas) {
  const info = doc.pages[canvas._i]; if (!info) return;
  canvas._done = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = info.page.getViewport({ scale: (size / info.vp.width) * dpr });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  try {
    await info.page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'white' }).promise;
    canvas.width = c.width; canvas.height = c.height;
    canvas.getContext('2d').drawImage(c, 0, 0);
  } catch { canvas._done = false; }
}

export function initGrid() {
  on('current', () => { if (open) { state.cur ? renderGrid(state.cur) : toggleGrid(false); } });
  on('reload', (d) => { if (open && d === state.cur) renderGrid(d); });
  window.addEventListener('keydown', (e) => { if (open && e.key === 'Escape' && !document.querySelector('.modal-bg')) toggleGrid(false); });
}
