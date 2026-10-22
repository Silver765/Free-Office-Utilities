// Document-level operations: page organization, combine/split, header/footer, watermark, crop, compress, export...
import { state, PDFLib, openBytes, snapshot, replaceBytes, guardEditable, emit, dropSnapshot, imageStore } from './core.js';
import { bakeAnnots, renderPageToCanvas } from './export.js';
import { platform } from './platform.js';
import { modal, confirmBox, h, row, field, select, checkRow, toast, fmtBytes, progressModal, esc, $ } from './ui.js';
import { getPageText } from './viewer.js';
import { hexToRgb01 } from './geom.js';

const { PDFDocument, rgb, degrees, StandardFonts, PDFName } = PDFLib;
const baseName = (n) => n.replace(/\.pdf$/i, '');

/** parse "1-3, 5, 8-" into zero-based indices */
export function parseRanges(str, n) {
  const s = (str || '').trim().toLowerCase();
  if (!s || s === 'all') return [...Array(n).keys()];
  const out = [];
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)(?:-(\d*))?$/);
    if (!m) return null;
    let a = m[1] === '' ? 1 : +m[1], b = m[2] === undefined ? a : m[2] === '' ? n : +m[2];
    if (m[1] === '' && m[2] === undefined) return null;
    if (a < 1 || b < 1 || a > n || b > n) return null;
    if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1); else for (let i = a; i >= b; i--) out.push(i - 1);
  }
  return out;
}

/** Run a pdf-lib edit. keep=true retains in-memory annotations (fn must return {map}); otherwise they're baked first. */
export async function editPdf(doc, fn, { keep = false } = {}) {
  if (!guardEditable(doc)) return false;
  snapshot(doc);
  try {
    const src = !keep && doc.annots.length ? await bakeAnnots(doc) : doc.bytes;
    const pdf = await PDFDocument.load(src, { ignoreEncryption: true, updateMetadata: false });
    const r = (await fn(pdf)) || {};
    const out = await pdf.save();
    await replaceBytes(doc, out, keep ? r.map || doc.pages.map((_, i) => i) : null);
    return true;
  } catch (e) {
    console.error(e); dropSnapshot(doc);
    toast('Operation failed: ' + (e.message || e), true);
    return false;
  }
}

const sortedUnique = (a) => [...new Set(a)].sort((x, y) => x - y);

export async function rotatePages(doc, idxs, delta) {
  idxs = sortedUnique(idxs);
  await editPdf(doc, (pdf) => {
    for (const i of idxs) { const p = pdf.getPage(i); p.setRotation(degrees((((p.getRotation().angle + delta) % 360) + 360) % 360)); }
  });
}

export async function deletePages(doc, idxs) {
  idxs = sortedUnique(idxs);
  if (idxs.length >= doc.pages.length) return toast('A document must keep at least one page', true);
  await editPdf(doc, (pdf) => {
    [...idxs].reverse().forEach((i) => pdf.removePage(i));
    return { map: doc.pages.map((_, i) => i).filter((i) => !idxs.includes(i)) };
  }, { keep: true });
}

export async function movePages(doc, idxs, before) {
  idxs = sortedUnique(idxs);
  const n = doc.pages.length;
  const rest = [...Array(n).keys()].filter((i) => !idxs.includes(i));
  const insertAt = rest.filter((i) => i < before).length;
  const order = [...rest.slice(0, insertAt), ...idxs, ...rest.slice(insertAt)];
  if (order.every((v, i) => v === i)) return;
  await editPdf(doc, (pdf) => {
    const pages = pdf.getPages();
    for (let i = n - 1; i >= 0; i--) pdf.removePage(i);
    order.forEach((o) => pdf.addPage(pages[o]));
    return { map: order };
  }, { keep: true });
  doc.thumbSel = new Set(idxs.map((i) => order.indexOf(i)));
  emit('thumbs', doc);
}

export async function duplicatePages(doc, idxs) {
  idxs = sortedUnique(idxs);
  await editPdf(doc, async (pdf) => {
    const map = doc.pages.map((_, i) => i);
    let off = 0;
    for (const i of idxs) {
      const [copy] = await pdf.copyPages(pdf, [i]);
      pdf.insertPage(i + 1 + off, copy);
      map.splice(i + 1 + off, 0, null); off++;
    }
    return { map };
  }, { keep: true });
}

export async function insertBlank(doc, after) {
  const ref = doc.pages[Math.max(0, Math.min(after, doc.pages.length - 1))].vp;
  await editPdf(doc, (pdf) => {
    pdf.insertPage(after + 1, [ref.width, ref.height]);
    const map = doc.pages.map((_, i) => i); map.splice(after + 1, 0, null);
    return { map };
  }, { keep: true });
}

export async function insertFromFile(doc, after) {
  const files = await platform.openDialog({ multi: false });
  if (!files.length) return;
  const src = await PDFDocument.load(files[0].data, { ignoreEncryption: false }).catch(() => null);
  if (!src) return toast('Could not read that PDF (is it encrypted?)', true);
  const res = await modal('Insert pages', (b) => {
    b.append(h('p', { class: 'msg' }, `${files[0].name} has ${src.getPageCount()} pages.`));
    const r = field('text', 'all', { placeholder: 'e.g. 1-3, 5' });
    b.append(row('Pages to insert', r), row('Insert', select([['after', 'After page ' + (after + 1)], ['before', 'Before page ' + (after + 1)], ['end', 'At end'], ['start', 'At start']], 'after')));
    return () => ({ r: r.value, pos: b.querySelector('select').value });
  });
  if (!res) return;
  const idxs = parseRanges(res.values.r, src.getPageCount());
  if (!idxs?.length) return toast('Invalid page range', true);
  const at = { after: after + 1, before: after, end: doc.pages.length, start: 0 }[res.values.pos];
  await editPdf(doc, async (pdf) => {
    const copies = await pdf.copyPages(src, idxs);
    copies.forEach((p, k) => pdf.insertPage(at + k, p));
    const map = doc.pages.map((_, i) => i); map.splice(at, 0, ...copies.map(() => null));
    return { map };
  }, { keep: true });
}

export async function extractPages(doc, idxs, { openTab = true } = {}) {
  idxs = sortedUnique(idxs);
  const src = await PDFDocument.load(doc.annots.length ? await bakeAnnots(doc) : doc.bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  (await out.copyPages(src, idxs)).forEach((p) => out.addPage(p));
  const bytes = await out.save();
  if (openTab) { await openBytes(bytes, baseName(doc.name) + ' (extract).pdf'); toast(`Extracted ${idxs.length} page${idxs.length > 1 ? 's' : ''} into a new tab`); }
  return bytes;
}

/* ---------------- combine ---------------- */
export async function combineDialog(initialDocs = []) {
  const items = initialDocs.map((d) => ({ name: d.name, getBytes: async () => (d.annots.length ? bakeAnnots(d) : d.bytes), pages: d.pages.length, range: 'all' }));
  const res = await modal('Combine files', (b) => {
    const list = h('div', { class: 'file-list' });
    const draw = () => {
      list.replaceChildren();
      if (!items.length) list.append(h('div', { class: 'empty' }, 'Add PDF files to combine'));
      items.forEach((it, i) => {
        const range = h('input', { class: 'field', style: 'width:90px;flex:none', value: it.range, title: 'Page range, e.g. 1-3, 5' });
        range.oninput = () => (it.range = range.value);
        list.append(h('div', { class: 'file-row' },
          h('span', { class: 'sz' }, i + 1 + '.'), h('span', { class: 'nm', title: it.name }, it.name), h('span', { class: 'sz' }, it.pages + ' pg'), range,
          h('button', { class: 'mini-btn', onclick: () => { if (i) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } } }, '↑'),
          h('button', { class: 'mini-btn', onclick: () => { if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } } }, '↓'),
          h('button', { class: 'mini-btn', onclick: () => { items.splice(i, 1); draw(); } }, '✕')));
      });
    };
    draw();
    const add = h('button', { class: 'btn', onclick: async () => {
      for (const f of await platform.openDialog({ multi: true })) {
        try { const p = await PDFDocument.load(f.data); items.push({ name: f.name, getBytes: async () => f.data, pages: p.getPageCount(), range: 'all' }); }
        catch { toast(`Skipped ${f.name}: unreadable or encrypted`, true); }
      }
      draw();
    } }, 'Add files…');
    const open = state.docs.filter((d) => !initialDocs.includes(d));
    const addOpen = open.length ? h('button', { class: 'btn', onclick: async () => {
      const r = await modal('Add open document', (bb) => { const s = select(open.map((d) => [d.id, d.name]), open[0].id); bb.append(s); return () => s.value; });
      if (r) { const d = open.find((x) => x.id == r.values); items.push({ name: d.name, getBytes: async () => (d.annots.length ? bakeAnnots(d) : d.bytes), pages: d.pages.length, range: 'all' }); draw(); }
    } }, 'Add open tab…') : '';
    b.append(h('p', { class: 'msg' }, 'Files are merged in the order shown. Use a page range to include only some pages of a file.'), list, h('div', { style: 'display:flex;gap:8px' }, add, addOpen));
    return () => items;
  }, [{ label: 'Cancel', value: null }, { label: 'Combine', primary: true, value: 'ok', validate: () => (items.length >= 2 ? true : (toast('Add at least two files', true), false)) }], { width: 640 });
  if (!res) return;
  const pm = progressModal('Combining files…');
  try {
    const out = await PDFDocument.create();
    for (let k = 0; k < items.length; k++) {
      pm.update(k / items.length, items[k].name);
      const src = await PDFDocument.load(await items[k].getBytes(), { ignoreEncryption: true });
      const idxs = parseRanges(items[k].range, src.getPageCount());
      if (!idxs?.length) throw new Error(`Invalid page range for ${items[k].name}`);
      (await out.copyPages(src, idxs)).forEach((p) => out.addPage(p));
    }
    const bytes = await out.save();
    pm.close();
    await openBytes(bytes, 'Combined.pdf');
    toast(`Combined ${items.length} files`);
  } catch (e) { pm.close(); toast(e.message, true); }
}

/* ---------------- split ---------------- */
export async function splitDialog(doc) {
  const n = doc.pages.length;
  const res = await modal('Split document', (b) => {
    const mode = select([['every', 'Every N pages'], ['ranges', 'Custom page ranges'], ['each', 'Each page separately']], 'every');
    const val = field('text', '1', { type: 'number', min: 1 });
    const hint = h('p', { class: 'msg' }, '');
    const upd = () => {
      val.style.display = mode.value === 'each' ? 'none' : '';
      val.type = mode.value === 'every' ? 'number' : 'text';
      if (mode.value === 'every') val.value = Math.max(1, Math.ceil(n / 2));
      if (mode.value === 'ranges') val.value = `1-${Math.ceil(n / 2)}; ${Math.ceil(n / 2) + 1}-${n}`;
      hint.textContent = mode.value === 'ranges' ? 'Separate each output file with a semicolon, e.g. 1-3; 4-6; 7' : `${n} pages in this document.`;
    };
    mode.onchange = upd; upd();
    b.append(row('Split by', mode), row('Value', val), hint);
    return () => ({ mode: mode.value, val: val.value });
  });
  if (!res) return;
  const { mode, val } = res.values;
  let groups = [];
  if (mode === 'each') groups = [...Array(n).keys()].map((i) => [i]);
  else if (mode === 'every') { const k = Math.max(1, parseInt(val) || 1); for (let i = 0; i < n; i += k) groups.push([...Array(Math.min(k, n - i)).keys()].map((j) => i + j)); }
  else { for (const part of val.split(';')) { const g = parseRanges(part, n); if (!g?.length) return toast('Invalid range: ' + part, true); groups.push(g); } }
  const src = await PDFDocument.load(doc.annots.length ? await bakeAnnots(doc) : doc.bytes, { ignoreEncryption: true });
  const files = [];
  for (let g = 0; g < groups.length; g++) {
    const out = await PDFDocument.create();
    (await out.copyPages(src, groups[g])).forEach((p) => out.addPage(p));
    files.push({ name: `${baseName(doc.name)}_part${String(g + 1).padStart(2, '0')}.pdf`, data: await out.save() });
  }
  const dir = await platform.saveMany(files);
  if (dir) toast(`Saved ${files.length} files to ${dir}`);
}

/* ---------------- header / footer / page numbers ---------------- */
function tokens(s, i, n, doc) {
  const d = new Date();
  return s.replaceAll('{page}', i + 1).replaceAll('{pages}', n).replaceAll('{date}', d.toLocaleDateString()).replaceAll('{file}', baseName(doc.name))
    .replace(/\{bates:(\d+)\}/g, (_, w) => String(i + 1).padStart(+w, '0'));
}
export async function headerFooterDialog(doc) {
  const res = await modal('Header, footer & page numbers', (b) => {
    b.append(h('p', { class: 'msg' }, 'Tokens: {page}  {pages}  {date}  {file}  {bates:6}'));
    const f = (v, ph) => field('text', v, { placeholder: ph });
    const hl = f('', 'Header left'), hc = f('', 'Header center'), hr = f('', 'Header right');
    const fl = f('', 'Footer left'), fc = f('Page {page} of {pages}', 'Footer center'), fr = f('', 'Footer right');
    const size = field('number', 10, { min: 5, max: 48 }), margin = field('number', 28, { min: 0, max: 200 });
    const color = field('color', '#333333'), pr = field('text', 'all');
    b.append(row('Header', h('div', { style: 'display:flex;gap:6px;flex:1' }, hl, hc, hr)), row('Footer', h('div', { style: 'display:flex;gap:6px;flex:1' }, fl, fc, fr)),
      row('Font size', size), row('Margin (pt)', margin), row('Color', color), row('Pages', pr));
    return () => ({ t: [hl, hc, hr, fl, fc, fr].map((x) => x.value), size: +size.value || 10, margin: +margin.value, color: color.value, pr: pr.value });
  }, undefined, { width: 640 });
  if (!res) return;
  const v = res.values, idxs = parseRanges(v.pr, doc.pages.length);
  if (!idxs) return toast('Invalid page range', true);
  await editPdf(doc, async (pdf) => {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const [r, g, bl] = hexToRgb01(v.color), n = pdf.getPageCount();
    for (const i of idxs) {
      const page = pdf.getPage(i), { width: W, height: H } = page.getSize();
      v.t.forEach((txt, k) => {
        if (!txt) return;
        const s = tokens(txt, i, n, doc), w = font.widthOfTextAtSize(s, v.size), col = k % 3;
        const x = col === 0 ? v.margin : col === 1 ? (W - w) / 2 : W - v.margin - w;
        const y = k < 3 ? H - v.margin - v.size * 0.8 : v.margin;
        page.drawText(s, { x, y, size: v.size, font, color: rgb(r, g, bl) });
      });
    }
  });
  toast('Header/footer added');
}

/* ---------------- watermark ---------------- */
export async function watermarkDialog(doc) {
  const res = await modal('Add watermark', (b) => {
    const text = field('text', 'CONFIDENTIAL'), size = field('number', 72, { min: 8, max: 400 }), op = field('number', 20, { min: 1, max: 100 });
    const rot = field('number', 45, { min: -180, max: 180 }), color = field('color', '#cc0000'), pr = field('text', 'all');
    b.append(row('Text', text), row('Font size', size), row('Opacity %', op), row('Rotation °', rot), row('Color', color), row('Pages', pr));
    return () => ({ text: text.value, size: +size.value, op: +op.value / 100, rot: +rot.value, color: color.value, pr: pr.value });
  });
  if (!res) return;
  const v = res.values, idxs = parseRanges(v.pr, doc.pages.length);
  if (!idxs || !v.text) return toast('Check the watermark settings', true);
  await editPdf(doc, async (pdf) => {
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const [r, g, bl] = hexToRgb01(v.color);
    for (const i of idxs) {
      const page = pdf.getPage(i), { width: W, height: H } = page.getSize();
      const tw = font.widthOfTextAtSize(v.text, v.size), a = (v.rot * Math.PI) / 180;
      // center the text block on the page after rotating around its own start point
      const cx = W / 2 - (tw / 2) * Math.cos(a) + (v.size * 0.35) * Math.sin(a), cy = H / 2 - (tw / 2) * Math.sin(a) - (v.size * 0.35) * Math.cos(a);
      page.drawText(v.text, { x: cx, y: cy, size: v.size, font, color: rgb(r, g, bl), opacity: v.op, rotate: degrees(v.rot) });
    }
  });
  toast('Watermark added');
}

/* ---------------- crop ---------------- */
export async function cropDialog(doc, selected) {
  const res = await modal('Crop pages', (b) => {
    b.append(h('p', { class: 'msg' }, 'Trim margins (points, 72 pt = 1 inch). Content outside is hidden but not deleted.'));
    const t = field('number', 0, { min: 0 }), r = field('number', 0, { min: 0 }), bo = field('number', 0, { min: 0 }), l = field('number', 0, { min: 0 });
    const pr = field('text', selected?.length ? selected.map((i) => i + 1).join(',') : 'all');
    b.append(row('Top', t), row('Right', r), row('Bottom', bo), row('Left', l), row('Pages', pr));
    return () => ({ t: +t.value, r: +r.value, b: +bo.value, l: +l.value, pr: pr.value });
  });
  if (!res) return;
  const v = res.values, idxs = parseRanges(v.pr, doc.pages.length);
  if (!idxs) return toast('Invalid page range', true);
  await editPdf(doc, (pdf) => {
    for (const i of idxs) {
      const p = pdf.getPage(i), mb = p.getMediaBox(), rot = p.getRotation().angle;
      // margins are given as displayed (top/right/bottom/left); map into unrotated space
      let { t, r, b, l } = v;
      for (let k = 0; k < rot / 90; k++) { [t, r, b, l] = [l, t, r, b]; }
      const w = mb.width - l - r, hh = mb.height - t - b;
      if (w < 10 || hh < 10) throw new Error('Crop is larger than the page');
      p.setCropBox(mb.x + l, mb.y + b, w, hh);
    }
  }, { keep: true });
  toast('Pages cropped');
}

/* ---------------- metadata / properties ---------------- */
export async function propertiesDialog(doc) {
  let info = {}, md = null;
  try { const m = await doc.pdf.getMetadata(); info = m.info || {}; md = m.metadata; } catch {}
  const vp = doc.pages[0].vp;
  const res = await modal('Document properties', (b) => {
    const t = field('text', info.Title || ''), a = field('text', info.Author || ''), s = field('text', info.Subject || ''), k = field('text', info.Keywords || '');
    b.append(row('Title', t), row('Author', a), row('Subject', s), row('Keywords', k));
    const rows = [
      ['File name', doc.name], ['Location', doc.path || '—'], ['File size', fmtBytes(doc.bytes.length)], ['Pages', doc.pages.length],
      ['Page size', `${(vp.width / 72).toFixed(2)} × ${(vp.height / 72).toFixed(2)} in (${(vp.width * 0.3528).toFixed(0)} × ${(vp.height * 0.3528).toFixed(0)} mm)`],
      ['PDF version', info.PDFFormatVersion || '—'], ['Creator', info.Creator || '—'], ['Producer', info.Producer || '—'],
      ['Created', info.CreationDate ? fmtPdfDate(info.CreationDate) : '—'], ['Modified', info.ModDate ? fmtPdfDate(info.ModDate) : '—'],
      ['Tagged', info.IsAcroFormPresent ? 'Contains form fields' : 'No form fields'],
    ];
    b.append(h('table', { class: 'props', style: 'margin-top:12px', html: rows.map(([a, b2]) => `<tr><td>${esc(a)}</td><td>${esc(b2)}</td></tr>`).join('') }));
    return () => ({ t: t.value, a: a.value, s: s.value, k: k.value });
  }, [{ label: 'Close', value: null }, { label: 'Apply metadata', primary: true, value: 'ok' }], { width: 560 });
  if (!res) return;
  const v = res.values;
  await editPdf(doc, (pdf) => {
    pdf.setTitle(v.t); pdf.setAuthor(v.a); pdf.setSubject(v.s); pdf.setKeywords(v.k.split(/[,;]\s*/).filter(Boolean));
    pdf.setModificationDate(new Date());
  }, { keep: true });
  toast('Properties updated');
}
function fmtPdfDate(s) {
  const m = String(s).match(/D:(\d{4})(\d\d)(\d\d)(\d\d)?(\d\d)?/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4] || '00'}:${m[5] || '00'}` : s;
}

/* ---------------- flatten / compress ---------------- */
export async function flattenForm(doc) {
  const ok = await editPdf(doc, (pdf) => { pdf.getForm().flatten(); }, { keep: true });
  if (ok) toast('Form fields flattened');
}
export async function flattenAll(doc) {
  if (!guardEditable(doc)) return;
  snapshot(doc);
  try {
    const bytes = await bakeAnnots(doc);
    const pdf = await PDFDocument.load(bytes);
    try { pdf.getForm().flatten(); } catch {}
    await replaceBytes(doc, await pdf.save(), null);
    toast('All annotations and form fields flattened into the page');
  } catch (e) { dropSnapshot(doc); toast(e.message, true); }
}

export async function compressDialog(doc) {
  const res = await modal('Reduce file size', (b) => {
    b.append(h('p', { class: 'msg' }, `Current size: ${fmtBytes(doc.bytes.length)}`));
    const mode = select([['lossless', 'Optimize structure (keeps text & quality)'], ['medium', 'Medium — rasterize at 150 dpi'], ['high', 'Maximum — rasterize at 96 dpi']], 'lossless');
    b.append(row('Method', mode), h('p', { class: 'msg' }, 'Rasterizing converts pages to images: smallest files, but text is no longer selectable or searchable.'));
    return () => mode.value;
  });
  if (!res) return;
  const mode = res.values;
  if (!guardEditable(doc)) return;
  const pm = progressModal('Reducing file size…');
  snapshot(doc);
  try {
    let src = doc.annots.length ? await bakeAnnots(doc) : doc.bytes, out;
    if (mode === 'lossless') {
      const pdf = await PDFDocument.load(src, { ignoreEncryption: true, updateMetadata: false });
      out = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    } else {
      const dpi = mode === 'medium' ? 150 : 96, q = mode === 'medium' ? 0.72 : 0.55;
      const tmp = { bytes: src, annots: [], pdf: null, password: doc.password };
      const { loadPdfjs } = await import('./core.js'); await loadPdfjs(tmp);
      const pdf = await PDFDocument.create();
      for (let i = 0; i < tmp.pages.length; i++) {
        pm.update(i / tmp.pages.length, `Page ${i + 1} of ${tmp.pages.length}`);
        const c = await renderPageToCanvas(tmp.pages[i], dpi / 72);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
        const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const { width: W, height: H } = tmp.pages[i].vp;
        pdf.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
      }
      out = await pdf.save();
      await tmp.pdf.destroy();
    }
    pm.close();
    if (out.length >= doc.bytes.length && mode === 'lossless') { dropSnapshot(doc); return toast('Already optimized — no smaller version possible'); }
    await replaceBytes(doc, out, null);
    toast(`Reduced from ${fmtBytes(src.length)} to ${fmtBytes(out.length)}`);
  } catch (e) { pm.close(); dropSnapshot(doc); console.error(e); toast('Failed: ' + e.message, true); }
}

/* ---------------- export ---------------- */
export async function exportImages(doc) {
  const res = await modal('Export pages as images', (b) => {
    const fmt = select([['png', 'PNG'], ['jpeg', 'JPEG']], 'png'), dpi = select([['72', '72 dpi (screen)'], ['150', '150 dpi'], ['300', '300 dpi (print)']], '150');
    const pr = field('text', 'all');
    b.append(row('Format', fmt), row('Resolution', dpi), row('Pages', pr));
    return () => ({ fmt: fmt.value, dpi: +dpi.value, pr: pr.value });
  });
  if (!res) return;
  const v = res.values, idxs = parseRanges(v.pr, doc.pages.length);
  if (!idxs?.length) return toast('Invalid page range', true);
  const src = doc.annots.length ? await bakeAnnots(doc) : doc.bytes;
  const tmp = { bytes: src, annots: [], pdf: null, password: doc.password };
  const { loadPdfjs } = await import('./core.js'); await loadPdfjs(tmp);
  const pm = progressModal('Rendering pages…'), files = [];
  for (let k = 0; k < idxs.length; k++) {
    pm.update(k / idxs.length, `Page ${idxs[k] + 1}`);
    const c = await renderPageToCanvas(tmp.pages[idxs[k]], v.dpi / 72);
    const blob = await new Promise((r) => c.toBlob(r, 'image/' + v.fmt, 0.92));
    files.push({ name: `${baseName(doc.name)}_p${String(idxs[k] + 1).padStart(3, '0')}.${v.fmt === 'jpeg' ? 'jpg' : 'png'}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  pm.close(); await tmp.pdf.destroy();
  const dir = await platform.saveMany(files);
  if (dir) toast(`Saved ${files.length} image${files.length > 1 ? 's' : ''} to ${dir}`);
}

export async function exportText(doc) {
  const parts = [];
  for (let i = 0; i < doc.pages.length; i++) {
    const t = (await getPageText(doc, i)).text;
    parts.push(`--- Page ${i + 1} ---\n${t.replace(/ {2,}/g, ' ')}`);
  }
  const data = new TextEncoder().encode(parts.join('\n\n'));
  const r = await platform.save(baseName(doc.name) + '.txt', data, [{ name: 'Text', extensions: ['txt'] }]);
  if (r) toast('Text exported');
}

/* ---------------- print ---------------- */
export async function printDoc(doc) {
  const pm = progressModal('Preparing to print…');
  try {
    const src = doc.annots.length ? await bakeAnnots(doc) : doc.bytes;
    const tmp = { bytes: src, annots: [], pdf: null, password: doc.password };
    const { loadPdfjs } = await import('./core.js'); await loadPdfjs(tmp);
    const root = $('#printRoot'); root.replaceChildren();
    for (let i = 0; i < tmp.pages.length; i++) {
      pm.update(i / tmp.pages.length, `Page ${i + 1} of ${tmp.pages.length}`);
      const c = await renderPageToCanvas(tmp.pages[i], 150 / 72);
      const img = new Image(); img.src = c.toDataURL('image/jpeg', 0.9);
      await img.decode().catch(() => {});
      root.append(img);
    }
    pm.close();
    await tmp.pdf.destroy();
    const cleanup = () => { root.replaceChildren(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
  } catch (e) { pm.close(); toast('Print failed: ' + e.message, true); }
}

/* ---------------- forms ---------------- */
const fieldType = (f) => ['PDFTextField', 'PDFCheckBox', 'PDFRadioGroup', 'PDFDropdown', 'PDFOptionList'].find((n) => f instanceof PDFLib[n]);
export async function readFormFields(doc) {
  try {
    const pdf = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
    const form = pdf.getForm();
    return form.getFields().map((f) => {
      const t = fieldType(f), name = f.getName();
      if (t === 'PDFTextField') return { name, kind: 'text', value: f.getText() || '', multi: f.isMultiline() };
      if (t === 'PDFCheckBox') return { name, kind: 'check', value: f.isChecked() };
      if (t === 'PDFRadioGroup') return { name, kind: 'radio', options: f.getOptions(), value: f.getSelected() || '' };
      if (t === 'PDFDropdown') return { name, kind: 'select', options: f.getOptions(), value: f.getSelected()[0] || '' };
      if (t === 'PDFOptionList') return { name, kind: 'select', options: f.getOptions(), value: f.getSelected()[0] || '' };
      return null;
    }).filter(Boolean);
  } catch { return []; }
}
export async function applyFormValues(doc, values) {
  const ok = await editPdf(doc, async (pdf) => {
    const form = pdf.getForm();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const [name, val] of Object.entries(values)) {
      try {
        const f = form.getField(name), t = fieldType(f);
        if (t === 'PDFTextField') f.setText(String(val));
        else if (t === 'PDFCheckBox') val ? f.check() : f.uncheck();
        else if (t === 'PDFRadioGroup') { if (val) f.select(val); }
        else if (t === 'PDFDropdown' || t === 'PDFOptionList') { if (val) f.select(val); }
      } catch (e) { console.warn('field', name, e); }
    }
    form.updateFieldAppearances(font);
  }, { keep: true });
  if (ok) toast('Form updated');
}

/* ---------------- OCR ---------------- */
let ocrWorker = null;
async function getOcrWorker(logger) {
  if (ocrWorker) { ocrWorker._logger = logger; return ocrWorker; }
  const base = new URL('./vendor/tesseract/', import.meta.url).href;
  const w = await window.Tesseract.createWorker('eng', 1, {
    workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', gzip: true, workerBlobURL: false, cacheMethod: 'none',
    logger: (m) => w._logger?.(m),
  });
  w._logger = logger; ocrWorker = w; return w;
}

export async function ocrDialog(doc) {
  if (!guardEditable(doc)) return;
  if (!window.Tesseract) return toast('OCR engine is not available', true);
  const res = await modal('Recognize text (OCR)', (b) => {
    b.append(h('p', { class: 'msg' }, 'Reads scanned pages and adds an invisible text layer so they become searchable and selectable. Language: English.'));
    const pr = field('text', 'all');
    const [rowEl, skip] = checkRow('Skip pages that already contain text', true);
    const q = select([['2', 'Standard (2× render)'], ['3', 'High accuracy (3× render, slower)']], '2');
    b.append(row('Pages', pr), row('Quality', q), rowEl);
    return () => ({ pr: pr.value, skip: skip.checked, scale: +q.value });
  }, [{ label: 'Cancel', value: null }, { label: 'Start OCR', primary: true, value: 'ok' }]);
  if (!res) return;
  const v = res.values, idxs = parseRanges(v.pr, doc.pages.length);
  if (!idxs?.length) return toast('Invalid page range', true);
  const pm = progressModal('Recognizing text…');
  const results = []; // {page, words:[{text,x0,y0,x1,y1}], S}
  try {
    pm.update(0, 'Loading OCR engine…');
    let cur = 0;
    const worker = await getOcrWorker((m) => { if (m.status === 'recognizing text') pm.update((cur + m.progress) / idxs.length, `Page ${idxs[cur] + 1} (${idxs.indexOf(idxs[cur]) + 1}/${idxs.length})`); });
    for (cur = 0; cur < idxs.length; cur++) {
      const i = idxs[cur];
      if (v.skip && ((await getPageText(doc, i)).text.trim().length > 20)) continue;
      pm.update(cur / idxs.length, `Rendering page ${i + 1}…`);
      const canvas = await renderPageToCanvas(doc.pages[i], v.scale);
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const words = [];
      for (const bl of data.blocks || []) for (const p of bl.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
        if (w.text?.trim() && w.confidence > 30) words.push({ text: w.text, ...w.bbox });
      }
      results.push({ page: i, words, S: v.scale });
    }
  } catch (e) { pm.close(); console.error(e); return toast('OCR failed: ' + (e.message || e), true); }
  pm.close();
  const total = results.reduce((n, r) => n + r.words.length, 0);
  if (!total) return toast(results.length ? 'No text was recognized' : 'Nothing to do — all selected pages already have text');
  const ok = await editPdf(doc, async (pdf) => {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const r of results) {
      const page = pdf.getPage(r.page), info = doc.pages[r.page];
      const rot = info.vp.rotation || 0;
      for (const w of r.words) {
        const text = [...w.text].map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
        const hgt = (w.y1 - w.y0) / r.S, wid = (w.x1 - w.x0) / r.S;
        const w1 = font.widthOfTextAtSize(text, 1) || 1;
        const size = Math.max(hgt * 0.5, Math.min(hgt * 1.6, wid / w1));
        const [px, py] = info.vp.convertToPdfPoint(w.x0 / r.S, w.y1 / r.S - hgt * 0.18);
        page.drawText(text, { x: px, y: py, size, font, opacity: 0, rotate: degrees(rot) });
      }
    }
  });
  if (ok) toast(`Recognized ${total} words on ${results.length} page${results.length > 1 ? 's' : ''} — text is now searchable`);
}
