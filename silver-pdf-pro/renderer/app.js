// Silver PDF Pro — application shell: menus, toolbar, tabs, files, shortcuts
import { state, on, emit, openBytes, setCurrent, closeDoc, markDirty, undo, redo, imageStore, uid, PDFLib, guardEditable } from './core.js';
import { buildView, setZoom, computeFit, goToPage, quality, setQuality, initViewerEvents, runSearch, gotoHit, getPageEls, drawSearch } from './viewer.js';
import { initEditor, setTool, setPendingImage, renderPropbar, defaults, deleteAnnot, applyRedactions } from './editor.js';
import { initGrid, toggleGrid, isGridOpen } from './grid.js';
import { initSidebar, togglePanel, renderPanel, panel, buildRail } from './sidebar.js';
import * as T from './tools.js';
import { bakeAnnots } from './export.js';
import { platform } from './platform.js';
import { signatureDialog, normalizeImage } from './sign.js';
import { $, $$, h, icon, toast, modal, confirmBox, showMenu, closeMenus, row, field, fmtBytes, select } from './ui.js';

const base = (n) => n.replace(/\.pdf$/i, '');

/* ================= files ================= */
async function openFiles(files) {
  for (const f of files) {
    if (f.path) { const ex = state.docs.find((d) => d.path === f.path); if (ex) { setCurrent(ex); continue; } }
    try { await openBytes(f.data, f.name, f.path); }
    catch (e) { console.error(e); if (e?.name !== 'PasswordException') toast(`Could not open ${f.name}: ${e.message || e}`, true); }
  }
}
const doOpen = async () => openFiles(await platform.openDialog({ multi: true }));

async function newBlank() {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.addPage([612, 792]);
  await openBytes(await pdf.save(), 'Untitled.pdf');
}

async function saveDoc(doc, as = false) {
  if (!doc) return false;
  try {
    const bytes = doc.annots.length && !doc.readOnly ? await bakeAnnots(doc) : doc.bytes;
    if (doc.path && !as) await platform.writePath(doc.path, bytes);
    else {
      const r = await platform.save(as ? 'Copy of ' + doc.name : doc.name, bytes);
      if (!r) return false;
      if (r.path) doc.path = r.path;
      doc.name = r.name;
    }
    markDirty(doc, false);
    toast('Saved ' + doc.name);
    updateAll();
    return true;
  } catch (e) { console.error(e); toast('Save failed: ' + e.message, true); return false; }
}

async function requestClose(doc) {
  if (doc.dirty) {
    const r = await modal('Unsaved changes', (b) => b.append(h('p', { class: 'msg', style: 'color:var(--text);margin:0' }, `Save changes to “${doc.name}” before closing?`)),
      [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no', danger: true }, { label: 'Save', primary: true, value: 'yes' }]);
    if (!r) return false;
    if (r.button === 'yes' && !(await saveDoc(doc))) return false;
  }
  closeDoc(doc);
  return true;
}

/* ================= toolbar ================= */
const TOOLS = [
  ['select', 'cursor', 'Select (V)'], ['hand', 'hand', 'Hand / pan (H)'], '|',
  ['highlight', 'highlight', 'Highlight text'], ['underline', 'underline', 'Underline text'], ['strike', 'strike', 'Strikethrough text'], '|',
  ['text', 'text', 'Add text box (T)'], ['note', 'note', 'Sticky note comment'], ['ink', 'pen', 'Draw freehand'], '|',
  ['rect', 'rect', 'Rectangle'], ['ellipse', 'ellipse', 'Ellipse'], ['line', 'line', 'Line (Shift = 45°)'], ['arrow', 'arrow', 'Arrow'], '|',
  ['stamp', 'stamp', 'Stamp'], ['sign', 'sign', 'Sign'], ['image', 'image', 'Insert image'], ['check', 'check', 'Check mark'], ['cross', 'cross', 'Cross mark'], '|',
  ['whiteout', 'whiteout', 'White-out'], ['redact', 'redact', 'Redact (permanently remove content)'],
];
const SHORTCUT_TOOLS = { v: 'select', h: 'hand', t: 'text', n: 'note', d: 'ink', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow' };

function btn(ic, title, fn, label) {
  return h('button', { class: 'tb-btn', title, html: icon(ic) + (label ? `<span class="lbl">${label}</span>` : ''), onclick: fn });
}

let refs = {};
function buildToolbar() {
  const f = $('#tbFile'); f.replaceChildren(
    btn('open', 'Open (Ctrl+O)', doOpen), refs.save = btn('save', 'Save (Ctrl+S)', () => saveDoc(state.cur)),
    btn('print', 'Print (Ctrl+P)', () => state.cur && T.printDoc(state.cur)),
    refs.undo = btn('undo', 'Undo (Ctrl+Z)', () => undo(state.cur)), refs.redo = btn('redo', 'Redo (Ctrl+Y)', () => redo(state.cur)));

  const pg = refs.pageIn = h('input', { class: 'tb-input', value: '1', title: 'Go to page' });
  pg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && state.cur) { goToPage(state.cur, (parseInt(pg.value) || 1) - 1); pg.blur(); } });
  pg.addEventListener('focus', () => pg.select());
  refs.pageTot = h('span', { class: 'tb-text' }, '/ 0');
  $('#tbNav').replaceChildren(btn('up', 'Previous page', () => state.cur && goToPage(state.cur, state.cur.page - 1)), pg, refs.pageTot,
    btn('down', 'Next page', () => state.cur && goToPage(state.cur, state.cur.page + 1)),
    refs.grid = btn('grid', 'Show all pages (Ctrl+Shift+G)', () => toggleGrid()));

  const zs = refs.zoomSel = h('select', { class: 'tb-select', title: 'Zoom' });
  for (const z of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]) zs.append(h('option', { value: z }, Math.round(z * 100) + '%'));
  zs.append(h('option', { value: 'width' }, 'Fit width'), h('option', { value: 'page' }, 'Fit page'));
  zs.onchange = () => { const d = state.cur; if (!d) return; zs.value === 'width' || zs.value === 'page' ? setZoom(d, computeFit(d, zs.value), zs.value) : setZoom(d, +zs.value); };
  $('#tbZoom').replaceChildren(btn('zoomout', 'Zoom out (Ctrl+-)', () => zoomBy(1 / 1.15)), zs, btn('zoomin', 'Zoom in (Ctrl+=)', () => zoomBy(1.15)),
    btn('fitw', 'Fit width', () => state.cur && setZoom(state.cur, computeFit(state.cur, 'width'), 'width')),
    btn('fitp', 'Fit page', () => state.cur && setZoom(state.cur, computeFit(state.cur, 'page'), 'page')));

  refs.tools = {};
  const tg = $('#tbTools'); tg.replaceChildren();
  for (const t of TOOLS) {
    if (t === '|') { tg.append(h('div', { style: 'width:1px;height:20px;background:var(--line);margin:0 4px' })); continue; }
    const b = btn(t[1], t[2], () => setTool(state.tool === t[0] && t[0] !== 'select' ? 'select' : t[0]));
    refs.tools[t[0]] = b; tg.append(b);
  }
  tg.style.borderRight = '0';

  const sb = h('div', { class: 'search-box' }, h('span', { html: icon('search') }), refs.searchIn = h('input', { placeholder: 'Find in document', title: 'Ctrl+F' }));
  refs.searchIn.addEventListener('focus', () => { openFind(); refs.searchIn.blur(); });
  $('#tbSearch').replaceChildren(sb,
    btn('sidebar', 'Toggle left panel', () => { panel.open = !panel.open; buildRail(); renderPanel(); }),
    btn('sidebarR', 'Toggle tools panel', () => $('#toolspane').classList.toggle('collapsed')));
}

function zoomBy(f) { const d = state.cur; if (d) setZoom(d, d.zoom * f); }

function refreshToolbar() {
  const d = state.cur;
  const has = !!d;
  $$('#toolbar .tb-btn').forEach((b) => (b.disabled = !has && !['Open (Ctrl+O)', 'Menu'].includes(b.title)));
  if (refs.undo) { refs.undo.disabled = !d || !d.undo.length; refs.redo.disabled = !d || !d.redo.length; }
  if (refs.save) refs.save.disabled = !d;
  refs.grid?.classList.toggle('active', isGridOpen());
  for (const [k, b] of Object.entries(refs.tools || {})) b.classList.toggle('active', state.tool === k);
  refs.pageIn.disabled = refs.zoomSel.disabled = !has;
  if (d) {
    refs.pageIn.value = d.page + 1; refs.pageTot.textContent = '/ ' + d.pages.length;
    const z = d.fit === 'width' || d.fit === 'page' ? d.fit : null;
    const pct = Math.round(d.zoom * 100) + '%';
    let opt = [...refs.zoomSel.options].find((o) => o.dataset.custom);
    if (z) { refs.zoomSel.value = z; }
    else {
      const match = [...refs.zoomSel.options].find((o) => o.value !== 'width' && o.value !== 'page' && Math.abs(+o.value - d.zoom) < 0.005);
      if (match) refs.zoomSel.value = match.value;
      else { if (!opt) { opt = h('option', { 'data-custom': 1 }); refs.zoomSel.append(opt); } opt.value = d.zoom; opt.textContent = pct; refs.zoomSel.value = d.zoom; }
    }
  }
}

/* ================= tabs & welcome ================= */
function renderTabs() {
  const tabs = $('#tabs'); tabs.replaceChildren();
  for (const d of state.docs) {
    const t = h('div', { class: 'tab' + (d === state.cur ? ' active' : ''), title: d.path || d.name, onclick: () => setCurrent(d), onauxclick: (e) => e.button === 1 && requestClose(d) },
      h('span', { class: 't' }, d.name), d.dirty ? h('span', { class: 'dirty' }) : null,
      h('button', { class: 'x', html: icon('x'), title: 'Close', onclick: (e) => { e.stopPropagation(); requestClose(d); } }));
    tabs.append(t);
  }
  tabs.append(h('button', { class: 'icon-btn tab-add', html: icon('plus'), title: 'Open file', onclick: doOpen }));
}

async function renderWelcome() {
  const w = $('#welcome');
  w.hidden = !!state.cur;
  if (state.cur) return;
  const recent = await platform.recent();
  w.replaceChildren(h('div', { class: 'hero' },
    h('h1', {}, 'Silver PDF Pro'), h('p', { class: 'sub' }, 'View, annotate, sign, organize and edit PDF documents — everything stays on your computer.'),
    h('div', { class: 'drop', onclick: doOpen }, h('div', { html: icon('open').replace('class="i "', 'class="i" style="width:36px;height:36px"') }), h('div', { class: 'big' }, 'Drag a PDF here, or click to open'), h('div', { style: 'color:var(--muted)' }, 'Ctrl+O')),
    h('h3', { class: 'sec' }, 'Quick actions'),
    h('div', { class: 'tiles' }, ...[
      ['open', 'Open a PDF', doOpen], ['merge', 'Combine files', () => T.combineDialog()], ['file', 'Create blank PDF', newBlank],
    ].map(([ic, l, fn]) => h('div', { class: 'tile', onclick: fn }, h('span', { class: 'ic', html: icon(ic) }), l))),
    recent.length ? h('h3', { class: 'sec' }, 'Recent') : '',
    ...recent.map((r) => h('div', { class: 'recent-row', onclick: async () => openFiles([await platform.readPath(r.path)]) },
      h('span', { html: icon('file'), style: 'color:var(--accent2)' }), h('span', {}, r.name), h('span', { class: 'm' }, r.path.replace(/[^\\/]+$/, ''))))));
}

/* ================= tools pane ================= */
async function askPages(doc, title, def) {
  const res = await modal(title, (b) => {
    const pr = field('text', def ?? String(doc.page + 1), { placeholder: 'e.g. 1-3, 5, 8-' });
    b.append(row('Pages', pr), h('p', { class: 'msg' }, `This document has ${doc.pages.length} pages. Use commas and ranges.`));
    return () => pr.value;
  });
  if (!res) return null;
  const idx = T.parseRanges(res.values, doc.pages.length);
  if (!idx?.length) { toast('Invalid page range', true); return null; }
  return idx;
}
const sel = (d) => (d.thumbSel.size ? [...d.thumbSel].sort((a, b) => a - b).map((i) => i + 1).join(',') : String(d.page + 1));

function toolItems() {
  const D = () => state.cur;
  return [
    ['Comment & markup', [
      ['highlight', 'Highlight text', 'Mark up selected text', () => setTool('highlight')], ['note', 'Sticky note', 'Add a comment', () => setTool('note')],
      ['pen', 'Draw', 'Freehand pen', () => setTool('ink')], ['stamp', 'Stamps', 'Approved, Draft, Confidential…', () => setTool('stamp')],
    ]],
    ['Fill & sign', [
      ['sign', 'Sign document', 'Draw, type or upload', () => setTool('sign')], ['text', 'Add text', 'Type anywhere on the page', () => setTool('text')],
      ['form', 'Fill form fields', 'Interactive form panel', () => { panel.name = 'forms'; panel.open = true; buildRail(); renderPanel(); }],
    ]],
    ['Organize pages', [
      ['grid', 'All pages grid', 'See every page at once', () => toggleGrid(true)],
      ['pages', 'Page thumbnails', 'Reorder by drag & drop', () => { panel.name = 'thumbs'; panel.open = true; buildRail(); renderPanel(); }],
      ['rotate', 'Rotate pages', '', async () => { const i = await askPages(D(), 'Rotate pages', sel(D())); if (!i) return; const r = await modal('Direction', (b) => { const s = select([['90', '90° clockwise'], ['-90', '90° counter-clockwise'], ['180', '180°']], '90'); b.append(row('Rotate', s)); return () => +s.value; }); if (r) T.rotatePages(D(), i, r.values); }],
      ['trash', 'Delete pages', '', async () => { const i = await askPages(D(), 'Delete pages', sel(D())); if (i && await confirmBox('Delete pages', `Delete ${i.length} page(s)?`, 'Delete', true)) T.deletePages(D(), i); }],
      ['extract', 'Extract pages', 'Into a new document', async () => { const i = await askPages(D(), 'Extract pages', sel(D())); if (i) T.extractPages(D(), i); }],
      ['insert', 'Insert blank page', '', () => T.insertBlank(D(), D().page)],
      ['file', 'Insert from file…', '', () => T.insertFromFile(D(), D().page)],
      ['crop', 'Crop pages', '', () => T.cropDialog(D(), [...D().thumbSel])],
    ]],
    ['Combine & split', [
      ['merge', 'Combine files', 'Merge PDFs into one', () => T.combineDialog(state.docs.length ? [D()] : [])],
      ['split', 'Split document', 'By pages or ranges', () => T.splitDialog(D())],
    ]],
    ['Edit page content', [
      ['hf', 'Header, footer & page numbers', '', () => T.headerFooterDialog(D())], ['water', 'Add watermark', '', () => T.watermarkDialog(D())],
      ['whiteout', 'White-out', 'Cover content', () => setTool('whiteout')],
    ]],
    ['Scan & OCR', [
      ['eye', 'Recognize text (OCR)', 'Make scans searchable', () => T.ocrDialog(D())],
    ]],
    ['Protect & optimize', [
      ['redact', 'Redact', 'Permanently remove content', () => setTool('redact')],
      ['compress', 'Reduce file size', '', () => T.compressDialog(D())], ['flatten', 'Flatten annotations', 'Bake everything into the page', () => T.flattenAll(D())],
    ]],
    ['Export', [
      ['image', 'Export as images', 'PNG or JPEG', () => T.exportImages(D())], ['list', 'Export as text', '.txt', () => T.exportText(D())],
      ['info', 'Document properties', 'Info & metadata', () => T.propertiesDialog(D())],
    ]],
  ];
}
function renderToolsPane() {
  const p = $('#toolspane'); p.replaceChildren(h('div', { class: 'tp-head' }, 'Tools'));
  const has = !!state.cur;
  for (const [sec, items] of toolItems()) {
    p.append(h('div', { class: 'tp-sec' }, sec));
    for (const [ic, name, desc, fn] of items) {
      const off = !has && !/Combine/.test(name);
      p.append(h('div', { class: 'tp-item' + (off ? ' off' : ''), onclick: fn }, h('span', { class: 'ic', html: icon(ic) }), h('div', {}, h('div', {}, name), desc ? h('div', { class: 'd' }, desc) : '')));
    }
  }
}

/* ================= menus ================= */
function buildMenus() {
  const D = () => state.cur;
  const defs = {
    File: () => [
      { label: 'Open…', icon: 'open', key: 'Ctrl+O', action: doOpen }, { label: 'Create blank PDF', icon: 'file', action: newBlank },
      { label: 'Combine files…', icon: 'merge', action: () => T.combineDialog() }, '-',
      { label: 'Save', icon: 'save', key: 'Ctrl+S', action: () => saveDoc(D()), disabled: !D() }, { label: 'Save as…', key: 'Ctrl+Shift+S', action: () => saveDoc(D(), true), disabled: !D() }, '-',
      { label: 'Export pages as images…', icon: 'image', action: () => T.exportImages(D()), disabled: !D() }, { label: 'Export as text…', icon: 'list', action: () => T.exportText(D()), disabled: !D() },
      { label: 'Document properties…', icon: 'info', action: () => T.propertiesDialog(D()), disabled: !D() }, '-',
      { label: 'Print…', icon: 'print', key: 'Ctrl+P', action: () => T.printDoc(D()), disabled: !D() }, { label: 'Close tab', key: 'Ctrl+W', action: () => requestClose(D()), disabled: !D() },
    ],
    Edit: () => [
      { label: 'Undo', icon: 'undo', key: 'Ctrl+Z', action: () => undo(D()), disabled: !D()?.undo.length }, { label: 'Redo', icon: 'redo', key: 'Ctrl+Y', action: () => redo(D()), disabled: !D()?.redo.length }, '-',
      { label: 'Delete selected annotation', icon: 'trash', key: 'Del', action: () => D()?.sel && deleteAnnot(D(), D().sel), disabled: !D()?.sel },
      { label: 'Find…', icon: 'search', key: 'Ctrl+F', action: openFind, disabled: !D() },
    ],
    View: () => [
      { label: 'Zoom in', icon: 'zoomin', key: 'Ctrl +', action: () => zoomBy(1.15), disabled: !D() }, { label: 'Zoom out', icon: 'zoomout', key: 'Ctrl -', action: () => zoomBy(1 / 1.15), disabled: !D() },
      { label: 'Actual size', key: 'Ctrl+0', action: () => setZoom(D(), 1), disabled: !D() },
      { label: 'Fit width', icon: 'fitw', action: () => setZoom(D(), computeFit(D(), 'width'), 'width'), disabled: !D() }, { label: 'Fit page', icon: 'fitp', action: () => setZoom(D(), computeFit(D(), 'page'), 'page'), disabled: !D() }, '-',
      { label: 'Show all pages (grid)', icon: 'grid', key: 'Ctrl+Shift+G', action: () => toggleGrid(), disabled: !D() },
      { label: 'Page thumbnails', icon: 'pages', action: () => togglePanel('thumbs') }, { label: 'Bookmarks', icon: 'bookmark', action: () => togglePanel('bookmarks') },
      { label: 'Comments', icon: 'comment', action: () => togglePanel('comments') }, { label: 'Form fields', icon: 'form', action: () => togglePanel('forms') }, '-',
      { label: `${quality.min === 1 ? '● ' : ''}Render quality: Fast`, action: () => setQuality(1) },
      { label: `${quality.min === 2 ? '● ' : ''}Render quality: High (default)`, action: () => setQuality(2) },
      { label: `${quality.min === 3 ? '● ' : ''}Render quality: Ultra (sharpest, uses more memory)`, action: () => setQuality(3) }, '-',
      { label: 'Toggle tools panel', icon: 'sidebarR', action: () => $('#toolspane').classList.toggle('collapsed') },
      { label: 'Toggle light / dark theme', icon: 'sun', action: toggleTheme },
    ],
    Tools: () => toolItems().flatMap(([, items], k) => [...(k ? ['-'] : []), ...items.map(([ic, name, , fn]) => ({ label: name, icon: ic, action: fn, disabled: !D() && !/Combine/.test(name) }))]),
    Help: () => [
      { label: 'Keyboard shortcuts', icon: 'info', action: showShortcuts }, { label: 'About Silver PDF Pro', action: () => modal('About Silver PDF Pro', (b) => b.append(h('p', { class: 'msg', style: 'color:var(--text)' }, 'Silver PDF Pro 1.0 — an offline PDF viewer, annotator, form filler, signer and page organizer.'), h('p', { class: 'msg' }, 'Powered by pdf.js and pdf-lib. Your documents never leave your computer.')), [{ label: 'Close', primary: true, value: 'ok' }]) },
    ],
  };
  const mb = $('#tbMenu'); mb.replaceChildren();
  const SUB_ICON = { File: 'file', Edit: 'undo', View: 'eye', Tools: 'tools', Help: 'info' };
  const b = h('button', { class: 'tb-btn menu-btn', title: 'Menu', html: icon('menu') });
  b.onclick = () => {
    if (b.classList.contains('open')) return closeMenus();
    const r = b.getBoundingClientRect();
    showMenu(Object.keys(defs).map((name) => ({ label: name, icon: SUB_ICON[name], submenu: () => defs[name]() })), r.left, r.bottom + 2, b);
  };
  mb.append(b);
}

function showShortcuts() {
  const rows = [['Open / Save / Print', 'Ctrl+O / Ctrl+S / Ctrl+P'], ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Find', 'Ctrl+F'], ['Zoom', 'Ctrl + / Ctrl − / Ctrl+0 / Ctrl+wheel'],
    ['Tools', 'V select · H hand · T text · N note · D draw · R rect · O ellipse · L line · A arrow'], ['Delete annotation', 'Del'], ['Nudge annotation', 'Arrow keys (Shift = 10×)'], ['Cancel tool', 'Esc'],
    ['Next / previous page', 'PageDown / PageUp'], ['Close tab', 'Ctrl+W']];
  modal('Keyboard shortcuts', (b) => b.append(h('table', { class: 'props', html: rows.map(([a, c]) => `<tr><td>${a}</td><td>${c}</td></tr>`).join('') })), [{ label: 'Close', primary: true, value: 'ok' }], { width: 620 });
}

/* ================= find ================= */
function openFind() {
  const d = state.cur; if (!d) return;
  const fb = $('#findbar'); fb.hidden = false; fb.replaceChildren();
  const inp = h('input', { type: 'text', placeholder: 'Find…', value: d.search.q || '' });
  const cs = h('input', { type: 'checkbox', id: 'fcs' }), ww = h('input', { type: 'checkbox', id: 'fww' });
  const cnt = h('span', { class: 'cnt' }, '');
  const upd = () => { const s = d.search; cnt.textContent = !s.q ? '' : s.hits.length ? `${s.idx + 1} of ${s.hits.length}` : 'No results'; };
  const go = async () => { await runSearch(d, inp.value, { caseSensitive: cs.checked, whole: ww.checked }); if (d.search.hits.length) gotoHit(d, 0); upd(); };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { if (inp.value !== d.search.q) go(); else gotoHit(d, d.search.idx + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') closeFind();
  });
  cs.onchange = ww.onchange = go;
  fb.append(inp, cnt, h('button', { class: 'icon-btn', title: 'Previous (Shift+Enter)', html: icon('up'), onclick: () => gotoHit(d, d.search.idx - 1) }),
    h('button', { class: 'icon-btn', title: 'Next (Enter)', html: icon('down'), onclick: () => gotoHit(d, d.search.idx + 1) }),
    h('label', { style: 'display:flex;gap:3px;align-items:center;color:var(--muted)' }, cs, 'Aa'), h('label', { style: 'display:flex;gap:3px;align-items:center;color:var(--muted)' }, ww, 'Word'),
    h('button', { class: 'icon-btn', html: icon('x'), onclick: closeFind }));
  on('search', upd);
  inp.focus(); inp.select();
  if (inp.value) upd();
}
function closeFind() {
  $('#findbar').hidden = true;
  const d = state.cur; if (d) { d.search = { q: '', hits: [], idx: -1 }; getPageEls().forEach((_, i) => drawSearch(d, i)); }
}

/* ================= theme ================= */
function applyTheme(t) {
  document.body.dataset.theme = t;
  try { localStorage.setItem('pdfstudio.theme', t); } catch {}
}
function toggleTheme() { applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'); }

/* ================= status ================= */
function updateStatus() {
  const d = state.cur;
  $('#stDoc').textContent = d ? `${d.name}${d.dirty ? ' •' : ''}  ·  ${fmtBytes(d.bytes.length)}${d.readOnly ? '  ·  view only (encrypted)' : ''}` : 'No document open';
  const vp = d?.pages[d.page]?.vp;
  $('#stInfo').textContent = d ? `Page ${d.page + 1} of ${d.pages.length}  ·  ${vp ? (vp.width / 72).toFixed(1) + ' × ' + (vp.height / 72).toFixed(1) + ' in  ·  ' : ''}${Math.round(d.zoom * 100)}%${d.annots.length ? '  ·  ' + d.annots.length + ' annotation' + (d.annots.length > 1 ? 's' : '') : ''}` : '';
  platform.setTitle(d ? `${d.dirty ? '* ' : ''}${d.name} — Silver PDF Pro` : 'Silver PDF Pro');
}

function updateAll() { renderTabs(); refreshToolbar(); updateStatus(); }

/* ================= init ================= */
function init() {
  try { applyTheme(localStorage.getItem('pdfstudio.theme') || 'dark'); } catch { applyTheme('dark'); }
  state.askPassword = (wrong) => new Promise((res) => {
    modal(wrong ? 'Incorrect password' : 'Password required', (b) => { const p = field('password', ''); b.append(h('p', { class: 'msg' }, 'This document is password protected. It will open in view-only mode.'), row('Password', p)); return () => p.value; },
      [{ label: 'Cancel', value: null }, { label: 'Open', primary: true, value: 'ok' }]).then((r) => res(r ? r.values : null));
  });
  buildMenus(); buildToolbar(); renderToolsPane();
  initViewerEvents(); initEditor(); initSidebar(); initGrid();

  on('current', (d) => {
    document.body.classList.toggle('has-doc', !!d);
    buildView(d);
    $('#welcome').hidden = !!d; if (!d) renderWelcome();
    $('#findbar').hidden = true;
    renderPropbar(); renderToolsPane(); updateAll();
  });
  on('tabs', updateAll);
  on('tool', () => { refreshToolbar(); });
  on('grid', () => refreshToolbar());
  on('page', () => { refreshToolbar(); updateStatus(); });
  on('zoom', () => { refreshToolbar(); updateStatus(); });
  on('annots', () => { refreshToolbar(); updateStatus(); });
  on('annots-all', () => { refreshToolbar(); updateStatus(); });
  on('reload', () => { refreshToolbar(); updateStatus(); });
  on('selection', () => {});
  on('toast', ([m, e]) => toast(m, e));
  on('need-image', async (kind) => {
    const doc = state.cur; if (!doc || !guardEditable(doc)) return;
    if (kind === 'sign') {
      const r = await signatureDialog(); if (!r) return;
      const id = uid('img'); imageStore.set(id, r.dataUrl); setPendingImage(id, r.ratio, 'sign');
    } else {
      const inp = $('#imagePicker'); inp.value = '';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
        try { const n = await normalizeImage(url); const id = uid('img'); imageStore.set(id, n.dataUrl); setPendingImage(id, n.ratio, 'image'); }
        catch { toast('That image could not be read', true); }
      };
      inp.click();
    }
  });

  // hand tool
  const sc = $('#scroller');
  sc.addEventListener('pointerdown', (e) => {
    if (state.tool !== 'hand' || e.button !== 0) return;
    sc.classList.add('grabbing'); sc.setPointerCapture(e.pointerId);
    let x = e.clientX, y = e.clientY;
    const mv = (ev) => { sc.scrollLeft -= ev.clientX - x; sc.scrollTop -= ev.clientY - y; x = ev.clientX; y = ev.clientY; };
    const up = () => { sc.classList.remove('grabbing'); sc.removeEventListener('pointermove', mv); sc.removeEventListener('pointerup', up); };
    sc.addEventListener('pointermove', mv); sc.addEventListener('pointerup', up);
  });
  sc.addEventListener('wheel', (e) => { if (e.ctrlKey && state.cur) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); } }, { passive: false });

  // drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#dropveil').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropveil').hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; $('#dropveil').hidden = true;
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (files.length) openFiles(await Promise.all(files.map(async (f) => ({ path: f.path || null, name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
  });

  // shortcuts
  window.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input,textarea,select');
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (document.querySelector('.modal-bg')) return;
    if (mod && k === 'c' && !typing) {
      const txt = window.getSelection()?.toString();
      if (txt) { e.preventDefault(); (navigator.clipboard?.writeText(txt) ?? Promise.reject()).catch(() => document.execCommand('copy')); toast('Copied'); }
    }
    else if (mod && e.shiftKey && k === 'g') { e.preventDefault(); toggleGrid(); }
    else if (mod && k === 'o') { e.preventDefault(); doOpen(); }
    else if (mod && k === 's') { e.preventDefault(); saveDoc(state.cur, e.shiftKey); }
    else if (mod && k === 'p') { e.preventDefault(); state.cur && T.printDoc(state.cur); }
    else if (mod && k === 'w') { e.preventDefault(); state.cur && requestClose(state.cur); }
    else if (mod && k === 'f') { e.preventDefault(); openFind(); }
    else if (mod && !typing && k === 'z') { e.preventDefault(); e.shiftKey ? redo(state.cur) : undo(state.cur); }
    else if (mod && !typing && k === 'y') { e.preventDefault(); redo(state.cur); }
    else if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomBy(1.15); }
    else if (mod && k === '-') { e.preventDefault(); zoomBy(1 / 1.15); }
    else if (mod && k === '0') { e.preventDefault(); state.cur && setZoom(state.cur, 1); }
    else if (mod && e.key === 'Tab') { e.preventDefault(); const i = state.docs.indexOf(state.cur); if (state.docs.length > 1) setCurrent(state.docs[(i + (e.shiftKey ? -1 : 1) + state.docs.length) % state.docs.length]); }
    else if (!mod && !typing && state.cur && SHORTCUT_TOOLS[k] && !e.altKey) setTool(SHORTCUT_TOOLS[k]);
    else if (!typing && state.cur && e.key === 'PageDown' && state.tool !== 'xx') { /* native scroll */ }
  });

  platform.onOpenPath(async (p) => openFiles([await platform.readPath(p)]));
  platform.onRequestClose(async () => {
    for (const d of [...state.docs]) if (d.dirty) { setCurrent(d); if (!(await requestClose(d))) return; }
    platform.confirmClose();
  });
  window.addEventListener('beforeunload', (e) => { if (!platform.onRequestClose || state.docs.some((d) => d.dirty)) { if (!window.native) { e.preventDefault(); e.returnValue = ''; } } });

  renderWelcome(); updateAll();
  window.pdfStudio = { state, openBytes, openFiles, setTool, T, bakeAnnots, defaults };
}
init();
