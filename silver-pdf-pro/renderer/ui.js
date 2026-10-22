// Icons, modal dialogs, toasts and dropdown menus
const P = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  save: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  cursor: '<path d="m5 3 14 7-6 2-2 6z"/>',
  hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V3.5a1.5 1.5 0 0 1 3 0V11M14 10V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7c-3 0-4-1.5-6-4.5-.7-1.2.5-2.3 1.6-1.6L8 14"/>',
  highlight: '<path d="m9 11-5 5v4h4l5-5"/><path d="m14 6 4 4-7 7-4-4z"/><path d="M3 21h18" stroke-width="2.4" opacity=".45"/>',
  underline: '<path d="M7 4v8a5 5 0 0 0 10 0V4M5 21h14"/>',
  strike: '<path d="M4 12h16M16 6.5C15.4 5 13.9 4 12 4c-2.4 0-4 1.3-4 3 0 4 8 2.5 8 7 0 1.8-1.8 3-4 3-2.2 0-3.8-1-4.4-2.6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  note: '<path d="M4 4h16v12H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  line: '<path d="M5 19 19 5"/>',
  arrow: '<path d="M5 19 19 5M10 5h9v9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m21 16-5-5-9 9"/>',
  sign: '<path d="M3 17c3 0 4-9 6-9s0 9 3 9 2-5 4-5 1 4 5 4"/><path d="M3 21h18"/>',
  stamp: '<path d="M8 14h8l-1-5a3 3 0 1 0-6 0z"/><path d="M5 14h14v3H5zM6 21h12"/>',
  redact: '<rect x="3" y="8" width="18" height="8" fill="currentColor"/>',
  whiteout: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="m4 18 16-12" opacity=".45"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>', cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  pages: '<rect x="4" y="3" width="11" height="14" rx="1"/><path d="M9 21h9a2 2 0 0 0 2-2V8"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.8A8 8 0 1 1 21 12z"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.2-.5-.5-2.2z"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  rotateL: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  extract: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  insert: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 9v6M9 12h6"/>',
  merge: '<path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V3M12 15v6"/>',
  split: '<path d="M12 3v7M12 10 5 21M12 10l7 11"/>',
  crop: '<path d="M6 2v16h16M2 6h16v16"/>',
  hf: '<path d="M4 5h16M4 19h16"/><rect x="7" y="9" width="10" height="6" rx="1"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  fitw: '<path d="M4 6v12M20 6v12M8 12h8M10 9l-3 3 3 3M14 9l3 3-3 3"/>',
  fitp: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  sidebarR: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  flatten: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  blank: '<rect x="5" y="3" width="14" height="18" rx="1"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
export const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n] || ''}</svg>`;

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export function toast(msg, err = false, ms = 3200) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  $('#toastRoot').append(t);
  setTimeout(() => t.remove(), ms);
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

/**
 * Generic modal. `build(body)` populates the body and may return a getter for values.
 * buttons: [{label, primary, value, danger}] -> resolves with {button, values} or null on cancel.
 */
export function modal(title, build, buttons = [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }], opts = {}) {
  return new Promise((resolve) => {
    const body = h('div', { class: 'body' });
    const getter = build(body);
    const done = (btn) => {
      const values = typeof getter === 'function' ? getter() : undefined;
      if (btn.validate && btn.validate(values) === false) return;
      bg.remove(); document.removeEventListener('keydown', onKey, true);
      resolve(btn.value === null ? null : { button: btn.value, values });
    };
    const foot = h('div', { class: 'foot' }, buttons.map((b) => h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), onclick: () => done(b) }, b.label)));
    const m = h('div', { class: 'modal', style: opts.width ? `width:${opts.width}px` : '' }, h('h2', {}, title), body, foot);
    const bg = h('div', { class: 'modal-bg' }, m);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg && opts.dismiss !== false) { bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(null); } });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(null); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !opts.noEnter) { e.stopPropagation(); const p = buttons.find((b) => b.primary); if (p) done(p); }
    };
    document.addEventListener('keydown', onKey, true);
    $('#modalRoot').append(bg);
    const first = body.querySelector('input:not([type=checkbox]):not([type=file]),textarea,select');
    first?.focus(); first?.select?.();
  });
}
export const confirmBox = async (title, message, okLabel = 'OK', danger = false) =>
  !!(await modal(title, (b) => { b.append(h('p', { class: 'msg', style: 'margin:0;color:var(--text)' }, message)); },
    [{ label: 'Cancel', value: null }, { label: okLabel, primary: true, danger, value: 'ok' }]));

export function progressModal(title) {
  const bar = h('div', {}); const msg = h('p', { class: 'msg' }, '');
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, h('h2', {}, title), h('div', { class: 'body', style: 'min-width:340px' }, msg, h('div', { class: 'progress' }, bar))));
  $('#modalRoot').append(bg);
  return { update(p, text) { bar.style.width = Math.round(p * 100) + '%'; if (text) msg.textContent = text; }, close() { bg.remove(); } };
}

/** form field helpers for dialogs */
export function row(label, input) { return h('div', { class: 'mrow' }, h('label', {}, label), input); }
export const field = (type, value, attrs = {}) => h('input', { class: 'field', type, value, ...attrs });
export const select = (opts, value) => {
  const s = h('select', { class: 'field' }, opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v }, l); }));
  s.value = value; return s;
};
export function checkRow(label, checked) {
  const c = h('input', { type: 'checkbox' }); c.checked = !!checked;
  return [h('label', { class: 'mrow check' }, c, label), c];
}

/* Dropdown menus */
let openDDs = [];
export function closeMenus() {
  openDDs.forEach((d) => d.remove()); openDDs = [];
  $$('.menu-btn.open').forEach((b) => b.classList.remove('open'));
}
function placeMenu(dd, x, y, rowRect) {
  const r = dd.getBoundingClientRect();
  let left = x;
  if (rowRect && left + r.width > innerWidth - 4) left = rowRect.left - r.width + 4; // flip flyout to the left edge
  dd.style.left = Math.max(4, Math.min(left, innerWidth - r.width - 4)) + 'px';
  dd.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
}
/** items: {label, icon, key, action, disabled, submenu: items | () => items} or '-'. depth > 0 builds a flyout. */
export function showMenu(items, x, y, anchor, depth = 0) {
  if (depth === 0) closeMenus();
  else { openDDs.slice(depth).forEach((d) => d.remove()); openDDs = openDDs.slice(0, depth); }
  const dd = h('div', { class: 'dropdown' });
  for (const it of items) {
    if (it === '-') { dd.append(h('div', { class: 'dd-sep' })); continue; }
    const row = h('div', { class: 'dd-item' + (it.disabled ? ' disabled' : '') },
      it.icon ? h('span', { html: icon(it.icon) }) : h('span', { style: 'width:18px' }), it.label,
      it.submenu ? h('span', { class: 'k', html: icon('right') }) : it.key ? h('span', { class: 'k' }, it.key) : null);
    if (it.submenu) {
      const open = () => { const r = row.getBoundingClientRect(); showMenu(typeof it.submenu === 'function' ? it.submenu() : it.submenu, r.right - 2, r.top - 4, null, depth + 1); row.classList.add('sub-open'); };
      row.addEventListener('mouseenter', open); row.addEventListener('click', open);
    } else {
      row.addEventListener('mouseenter', () => { openDDs.slice(depth + 1).forEach((d) => d.remove()); openDDs = openDDs.slice(0, depth + 1); });
      row.addEventListener('click', () => { closeMenus(); it.action?.(); });
    }
    dd.append(row);
  }
  document.body.append(dd);
  placeMenu(dd, x, y, depth ? { left: x - 2 - 230 } : null);
  openDDs.push(dd); anchor?.classList.add('open');
}
document.addEventListener('mousedown', (e) => { if (openDDs.length && !openDDs.some((d) => d.contains(e.target)) && !e.target.closest('.menu-btn')) closeMenus(); }, true);
