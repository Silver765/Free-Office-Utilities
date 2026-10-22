// Signature creation dialog (draw / type / upload) with saved signatures
import { modal, h, field, select } from './ui.js';

const KEY = 'pdfstudio.signatures';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8))); } catch {} };

function trim(canvas) {
  const ctx = canvas.getContext('2d'), { width: w, height: hh } = canvas;
  const d = ctx.getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = 0, y1 = 0;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 6, out = document.createElement('canvas');
  out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
  out.getContext('2d').drawImage(canvas, x0, y0, x1 - x0, y1 - y0, pad, pad, x1 - x0, y1 - y0);
  return out;
}

const SCRIPTS = ['"Segoe Script","Brush Script MT",cursive', '"Lucida Handwriting","Apple Chancery",cursive', '"Ink Free","Comic Sans MS",cursive', 'Georgia,serif'];

/** resolves to {dataUrl, ratio} or null */
export async function signatureDialog() {
  let mode = 'draw', uploaded = null, chosenSaved = null;
  const res = await modal('Create your signature', (b) => {
    const tabs = h('div', { class: 'tabs-s' });
    const area = h('div');
    const color = field('color', '#0b2a8a', { style: 'width:44px;flex:none;padding:0;height:28px' });
    const draw = h('canvas', { class: 'sigpad', width: 600, height: 200 });
    const dctx = draw.getContext('2d'); dctx.lineWidth = 3.2; dctx.lineCap = 'round'; dctx.lineJoin = 'round';
    let down = false, last = null;
    const pos = (e) => { const r = draw.getBoundingClientRect(); return [(e.clientX - r.left) * (draw.width / r.width), (e.clientY - r.top) * (draw.height / r.height)]; };
    draw.addEventListener('pointerdown', (e) => { down = true; last = pos(e); draw.setPointerCapture(e.pointerId); dctx.strokeStyle = color.value; dctx.beginPath(); dctx.moveTo(...last); dctx.lineTo(last[0] + 0.1, last[1]); dctx.stroke(); });
    draw.addEventListener('pointermove', (e) => { if (!down) return; const p = pos(e); dctx.beginPath(); dctx.moveTo(...last); dctx.lineTo(...p); dctx.stroke(); last = p; });
    draw.addEventListener('pointerup', () => (down = false));
    const typed = field('text', '', { placeholder: 'Type your name' });
    const fontSel = select(SCRIPTS.map((s, i) => [i, 'Style ' + (i + 1)]), 0);
    const preview = h('canvas', { class: 'sigpad', width: 600, height: 200, style: 'cursor:default' });
    const paintTyped = () => {
      const c = preview.getContext('2d'); c.clearRect(0, 0, 600, 200);
      c.fillStyle = color.value; c.font = `80px ${SCRIPTS[+fontSel.value]}`; c.textBaseline = 'middle'; c.fillText(typed.value || '', 20, 100, 560);
    };
    typed.oninput = paintTyped; fontSel.onchange = paintTyped; color.oninput = paintTyped;
    const file = h('input', { type: 'file', accept: 'image/*' });
    const up = h('img', { style: 'max-width:100%;max-height:160px;margin-top:8px;display:none' });
    file.onchange = () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { uploaded = r.result; up.src = uploaded; up.style.display = 'block'; }; r.readAsDataURL(f); };
    const save = h('input', { type: 'checkbox' }); save.checked = true;
    const saved = h('div', { class: 'saved-sigs' });
    const drawSaved = () => {
      saved.replaceChildren();
      for (const s of load()) {
        saved.append(h('div', { class: 's', title: 'Use this signature', onclick: () => { chosenSaved = s; b.closest('.modal').querySelector('.foot .primary').click(); } }, h('img', { src: s })));
      }
      if (saved.children.length) saved.prepend(h('div', { style: 'width:100%;color:var(--muted);font-size:11.5px' }, 'Saved signatures — click to use'));
    };
    const show = () => {
      area.replaceChildren();
      [...tabs.children].forEach((t) => t.classList.toggle('on', t.dataset.m === mode));
      if (mode === 'draw') area.append(draw, h('div', { style: 'margin-top:6px' }, h('button', { class: 'btn', onclick: () => dctx.clearRect(0, 0, 600, 200) }, 'Clear')));
      if (mode === 'type') { area.append(h('div', { class: 'mrow' }, typed, fontSel), preview); paintTyped(); }
      if (mode === 'image') area.append(file, up);
    };
    for (const [m, l] of [['draw', 'Draw'], ['type', 'Type'], ['image', 'Image']]) tabs.append(h('button', { 'data-m': m, onclick: () => { mode = m; show(); } }, l));
    b.append(tabs, h('div', { class: 'mrow' }, h('label', { style: 'width:auto' }, 'Ink color'), color), area,
      h('label', { class: 'mrow check', style: 'margin-top:10px' }, save, 'Remember this signature on this computer'), saved);
    show(); drawSaved();
    return () => ({
      get: () => {
        if (chosenSaved) return Promise.resolve(chosenSaved);
        if (mode === 'image') return uploaded ? normalizeImage(uploaded).then((r) => r.dataUrl) : Promise.resolve(null);
        const t = trim(mode === 'draw' ? draw : preview);
        return Promise.resolve(t ? t.toDataURL('image/png') : null);
      }, save: save.checked,
    });
  }, [{ label: 'Cancel', value: null }, { label: 'Use signature', primary: true, value: 'ok' }], { width: 640 });
  if (!res) return null;
  const url = await res.values.get();
  if (!url) return null;
  if (res.values.save && !load().includes(url)) store([url, ...load()]);
  const img = new Image(); img.src = url; await img.decode();
  return { dataUrl: url, ratio: img.naturalWidth / img.naturalHeight };
}

export async function imageInfo(dataUrl) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  return { ratio: img.naturalWidth / img.naturalHeight };
}

/** Re-encode any image (png/jpg/webp/gif/svg) to a PNG or JPEG data URL pdf-lib can embed, capping its size. */
export async function normalizeImage(dataUrl, maxDim = 2400) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const k = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const jpeg = /^data:image\/jpe?g/.test(dataUrl);
  return { dataUrl: c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92), ratio: c.width / c.height };
}
