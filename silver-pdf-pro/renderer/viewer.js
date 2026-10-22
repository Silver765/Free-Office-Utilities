// Continuous-scroll page viewer: rendering, text layer, links, zoom, search highlights
import { pdfjsLib, state, emit, on } from './core.js';
import { $, h } from './ui.js';

/** PDF-space rect [x1,y1,x2,y2] -> viewport-space [x1,y1,x2,y2] (pdf.js removed convertToViewportRectangle) */
export function vpRect(vp, r) {
  const [ax, ay] = vp.convertToViewportPoint(r[0], r[1]), [bx, by] = vp.convertToViewportPoint(r[2], r[3]);
  return [ax, ay, bx, by];
}
export const quality = { min: 2 };
try { quality.min = +localStorage.getItem('silverpdf.quality') || 2; } catch {}
export function setQuality(v) {
  quality.min = v;
  try { localStorage.setItem('silverpdf.quality', v); } catch {}
  const doc = state.cur; if (!doc) return;
  pageEls.forEach((el, i) => { if (isNear(el)) renderPage(doc, i); });
}
export const hooks = { renderOverlay: null };
const scroller = () => $('#scroller');
const pagesEl = () => $('#pages');

let observer = null;
let pageEls = [];
const NS = 'http://www.w3.org/2000/svg';

export const getPageEls = () => pageEls;
export const pageEl = (i) => pageEls[i];

export function buildView(doc) {
  observer?.disconnect();
  pagesEl().replaceChildren();
  pageEls = [];
  if (!doc) return;
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const i = +en.target.dataset.i;
      if (en.isIntersecting) renderPage(doc, i);
      else releasePage(en.target);
    }
  }, { root: scroller(), rootMargin: '900px 0px' });
  if (doc.fit && doc.fit !== 'custom') doc.zoom = computeFit(doc, doc.fit);
  doc.pages.forEach((info, i) => {
    const el = h('div', { class: 'page', 'data-i': i });
    el.append(h('canvas', { class: 'pcanvas' }));
    const hl = document.createElementNS(NS, 'svg');
    hl.setAttribute('class', 'hl');
    hl.setAttribute('viewBox', `0 0 ${info.vp.width} ${info.vp.height}`);
    hl.setAttribute('preserveAspectRatio', 'none');
    el.append(hl, h('div', { class: 'searchLayer' }), h('div', { class: 'textLayer' }), h('div', { class: 'linkLayer' }));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'overlay');
    svg.setAttribute('viewBox', `0 0 ${info.vp.width} ${info.vp.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    el.append(svg);
    sizePage(doc, el, info);
    pagesEl().append(el);
    pageEls.push(el);
    observer.observe(el);
    hooks.renderOverlay?.(doc, i);
  });
  scroller().scrollTop = doc.scrollTop || 0;
  updateCurrentPage(doc);
}

function sizePage(doc, el, info) {
  el.style.width = info.vp.width * doc.zoom + 'px';
  el.style.height = info.vp.height * doc.zoom + 'px';
  el.style.setProperty('--scale-factor', doc.zoom);
  el.style.setProperty('--total-scale-factor', doc.zoom);
}

function releasePage(el) {
  if (!el._rendered) return;
  el._token = (el._token || 0) + 1;
  el._task?.cancel();
  el._rendered = false;
  const c = el.querySelector('.pcanvas'); c.width = 0; c.height = 0;
  el.querySelector('.textLayer').replaceChildren();
  el.querySelector('.linkLayer').replaceChildren();
  el.querySelector('.searchLayer').replaceChildren();
}

export async function renderPage(doc, i) {
  const el = pageEls[i];
  if (!el || doc !== state.cur) return;
  const token = el._token = (el._token || 0) + 1;
  el._task?.cancel();
  el._rendered = true;
  const info = doc.pages[i];
  const zoom = doc.zoom;
  // supersample: never render below `quality.min`x the screen resolution, then let the browser downscale smoothly
  let px = Math.max(window.devicePixelRatio || 1, quality.min);
  const base = info.page.getViewport({ scale: zoom });
  const maxPixels = 40e6;
  px = Math.min(px, Math.sqrt(maxPixels / (base.width * base.height)));
  const vp = info.page.getViewport({ scale: zoom * px });
  const fresh = document.createElement('canvas');
  fresh.className = 'pcanvas';
  fresh.width = Math.ceil(vp.width); fresh.height = Math.ceil(vp.height);
  const task = info.page.render({ canvasContext: fresh.getContext('2d'), viewport: vp, background: 'rgb(255,255,255)' });
  el._task = task;
  try { await task.promise; } catch { return; }
  if (token !== el._token) return;
  el.querySelector('.pcanvas').replaceWith(fresh);

  // text layer
  const tdiv = el.querySelector('.textLayer');
  tdiv.replaceChildren();
  try {
    const tl = new pdfjsLib.TextLayer({ textContentSource: info.page.streamTextContent(), container: tdiv, viewport: info.page.getViewport({ scale: zoom }) });
    await tl.render();
  } catch {}
  if (token !== el._token) return;
  buildLinks(doc, i, el);
  drawSearch(doc, i);
}

async function buildLinks(doc, i, el) {
  const layer = el.querySelector('.linkLayer');
  layer.replaceChildren();
  let annots = [];
  try { annots = await doc.pages[i].page.getAnnotations({ intent: 'display' }); } catch {}
  const z = doc.zoom, vp = doc.pages[i].vp;
  for (const a of annots) {
    if (a.subtype !== 'Link' || !(a.url || a.dest || a.unsafeUrl)) continue;
    const [x1, y1, x2, y2] = vpRect(vp, a.rect);
    const link = h('a', {
      style: `position:absolute;left:${Math.min(x1, x2) * z}px;top:${Math.min(y1, y2) * z}px;width:${Math.abs(x2 - x1) * z}px;height:${Math.abs(y2 - y1) * z}px;z-index:2;cursor:pointer`,
      title: a.url || 'Go to destination',
    });
    link.addEventListener('click', async (e) => {
      if (state.tool !== 'select' && state.tool !== 'hand') return;
      e.preventDefault();
      if (a.url || a.unsafeUrl) window.open(a.url || a.unsafeUrl, '_blank');
      else await goToDest(doc, a.dest);
    });
    layer.append(link);
  }
}
const linkLayerCSS = document.createElement('style');
linkLayerCSS.textContent = `.page .linkLayer{position:absolute;inset:0;z-index:2}body[data-tool=ink] .linkLayer,body[data-tool=rect] .linkLayer,body[data-tool=ellipse] .linkLayer,body[data-tool=line] .linkLayer,body[data-tool=arrow] .linkLayer,body[data-tool=text] .linkLayer,body[data-tool=note] .linkLayer,body[data-tool=redact] .linkLayer,body[data-tool=whiteout] .linkLayer,body[data-tool=stamp] .linkLayer,body[data-tool=image] .linkLayer,body[data-tool=sign] .linkLayer,body[data-tool=check] .linkLayer,body[data-tool=cross] .linkLayer,body[data-tool=highlight] .linkLayer,body[data-tool=underline] .linkLayer,body[data-tool=strike] .linkLayer{pointer-events:none}`;
document.head.append(linkLayerCSS);

export async function goToDest(doc, dest) {
  try {
    const d = typeof dest === 'string' ? await doc.pdf.getDestination(dest) : dest;
    if (!d) return;
    const idx = typeof d[0] === 'object' ? await doc.pdf.getPageIndex(d[0]) : d[0];
    let y = null;
    if (d[1]?.name === 'XYZ' && d[3] != null) y = doc.pages[idx].vp.convertToViewportPoint(0, d[3])[1];
    goToPage(doc, idx, y);
  } catch (e) { console.warn(e); }
}

export function goToPage(doc, i, yPt = null) {
  i = Math.max(0, Math.min(doc.pages.length - 1, i));
  const el = pageEls[i]; if (!el) return;
  scroller().scrollTop = el.offsetTop - 14 + (yPt ? yPt * doc.zoom : 0);
  doc.page = i;
  emit('page', doc);
}

export function computeFit(doc, mode) {
  const info = doc.pages[doc.page] || doc.pages[0];
  const sc = scroller();
  const availW = sc.clientWidth - 48, availH = sc.clientHeight - 34;
  const zw = availW / info.vp.width, zh = availH / info.vp.height;
  return Math.max(0.1, Math.min(8, mode === 'page' ? Math.min(zw, zh) : zw));
}

export function setZoom(doc, zoom, fit = 'custom') {
  zoom = Math.max(0.1, Math.min(8, zoom));
  const sc = scroller();
  const top = currentPageIndex(doc);
  const el0 = pageEls[top];
  const frac = el0 ? (sc.scrollTop - el0.offsetTop) / el0.offsetHeight : 0;
  doc.zoom = zoom; doc.fit = fit;
  pageEls.forEach((el, i) => {
    sizePage(doc, el, doc.pages[i]);
  });
  if (el0) sc.scrollTop = el0.offsetTop + frac * el0.offsetHeight;
  // re-render what's visible, free the rest
  pageEls.forEach((el, i) => { if (isNear(el)) renderPage(doc, i); else releasePage(el); });
  emit('zoom', doc);
}

function isNear(el) {
  const sc = scroller(), r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
  return r.bottom > s.top - 900 && r.top < s.bottom + 900;
}

export function currentPageIndex(doc) {
  const sc = scroller();
  const y = sc.scrollTop + sc.clientHeight * 0.35;
  let best = 0;
  for (let i = 0; i < pageEls.length; i++) { if (pageEls[i].offsetTop <= y) best = i; else break; }
  return best;
}

export function updateCurrentPage(doc) {
  const i = currentPageIndex(doc);
  if (i !== doc.page) { doc.page = i; emit('page', doc); }
  else emit('page', doc);
}

let ticking = false;
export function initViewerEvents() {
  scroller().addEventListener('scroll', () => {
    const doc = state.cur; if (!doc) return;
    doc.scrollTop = scroller().scrollTop;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; updateCurrentPage(doc); });
  });
  new ResizeObserver(() => {
    const doc = state.cur;
    if (doc && doc.fit && doc.fit !== 'custom' && pageEls.length) {
      const z = computeFit(doc, doc.fit);
      if (Math.abs(z - doc.zoom) > 0.002) setZoom(doc, z, doc.fit);
    }
  }).observe(scroller());
  on('reload', (doc) => { if (doc === state.cur) { doc.page = Math.min(doc.page, doc.pages.length - 1); const st = scroller().scrollTop; buildView(doc); scroller().scrollTop = st; } });
}

/* ---------------- search ---------------- */
async function pageText(doc, i) {
  if (doc.textCache.has(i)) return doc.textCache.get(i);
  const tc = await doc.pages[i].page.getTextContent();
  let text = '';
  const segs = [];
  for (const it of tc.items) {
    if (!it.str && !it.hasEOL) continue;
    segs.push({ it, start: text.length, end: text.length + it.str.length });
    text += it.str + (it.hasEOL ? ' ' : '');
  }
  const out = { text, segs };
  doc.textCache.set(i, out);
  return out;
}
export const getPageText = pageText;

export async function runSearch(doc, q, { caseSensitive = false, whole = false, progress } = {}) {
  doc.search = { q, hits: [], idx: -1, caseSensitive, whole };
  if (!q) { clearSearchLayers(); return doc.search; }
  const needle = caseSensitive ? q : q.toLowerCase();
  for (let i = 0; i < doc.pages.length; i++) {
    const { text, segs } = await pageText(doc, i);
    const hay = caseSensitive ? text : text.toLowerCase();
    let pos = 0;
    while ((pos = hay.indexOf(needle, pos)) >= 0) {
      const end = pos + needle.length;
      const okW = !whole || (!/\w/.test(hay[pos - 1] || ' ') && !/\w/.test(hay[end] || ' '));
      if (okW) doc.search.hits.push({ page: i, rects: hitRects(doc, i, segs, pos, end), snippet: text.slice(Math.max(0, pos - 24), end + 30) });
      pos = end;
    }
    if (i % 20 === 0) progress?.(i / doc.pages.length);
  }
  pageEls.forEach((_, i) => drawSearch(doc, i));
  return doc.search;
}

function hitRects(doc, pi, segs, s, e) {
  const vp = doc.pages[pi].vp, rects = [];
  for (const sg of segs) {
    if (sg.end <= s || sg.start >= e || !sg.it.str) continue;
    const it = sg.it, len = it.str.length;
    const a = Math.max(s, sg.start) - sg.start, b = Math.min(e, sg.end) - sg.start;
    const [sx, , , sy, tx, ty] = it.transform;
    const w = it.width, hgt = it.height || Math.abs(sy);
    const x1 = tx + (w * a) / len, x2 = tx + (w * b) / len;
    const r = vpRect(vp, [x1, ty - hgt * 0.2, x2, ty + hgt * 0.9]);
    rects.push([Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])]);
  }
  return rects;
}

function clearSearchLayers() { pageEls.forEach((el) => el.querySelector('.searchLayer').replaceChildren()); }

export function drawSearch(doc, i) {
  const el = pageEls[i]; if (!el) return;
  const layer = el.querySelector('.searchLayer');
  layer.replaceChildren();
  const z = doc.zoom;
  doc.search.hits.forEach((hit, hi) => {
    if (hit.page !== i) return;
    for (const [x, y, w, hgt] of hit.rects) {
      layer.append(h('div', { class: 'sh' + (hi === doc.search.idx ? ' cur' : ''), style: `left:${x * z}px;top:${y * z}px;width:${w * z}px;height:${hgt * z}px` }));
    }
  });
}

export function gotoHit(doc, idx) {
  const s = doc.search;
  if (!s.hits.length) return;
  const prev = s.hits[s.idx];
  s.idx = (idx + s.hits.length) % s.hits.length;
  if (prev) drawSearch(doc, prev.page);
  const hit = s.hits[s.idx];
  drawSearch(doc, hit.page);
  const el = pageEls[hit.page], r = hit.rects[0];
  if (r) scroller().scrollTop = el.offsetTop + r[1] * doc.zoom - scroller().clientHeight * 0.35;
  emit('search', doc);
}
