// Writes in-memory annotations into PDF bytes with pdf-lib (incl. true redaction)
import { PDFLib, imageStore } from './core.js';
import { wrapLines, LINE_H, TEXT_PAD, hexToRgb01 } from './geom.js';

const { PDFDocument, rgb, degrees, StandardFonts, BlendMode, LineCapStyle, PDFName, PDFString, PDFNumber } = PDFLib;
const col = (hex) => { const [r, g, b] = hexToRgb01(hex); return rgb(r, g, b); };

const FONT_MAP = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold],
};

function dataUrlToBytes(url) {
  const b64 = url.split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function renderPageToCanvas(pageInfo, scale) {
  const vp = pageInfo.page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pageInfo.page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
const canvasToPng = (c) => new Promise((res) => c.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));

/** Returns new bytes with every annotation of `doc` drawn into the page content. */
export async function bakeAnnots(doc, progress) {
  const pdf = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
  const fontCache = new Map();
  const getFont = async (name, bold) => {
    const key = name + bold;
    if (!fontCache.has(key)) fontCache.set(key, await pdf.embedFont((FONT_MAP[name] || FONT_MAP.Helvetica)[bold ? 1 : 0]));
    return fontCache.get(key);
  };
  const imgCache = new Map();
  const getImage = async (id) => {
    if (!imgCache.has(id)) {
      const url = imageStore.get(id);
      imgCache.set(id, /image\/jpe?g/.test(url) ? await pdf.embedJpg(dataUrlToBytes(url)) : await pdf.embedPng(dataUrlToBytes(url)));
    }
    return imgCache.get(id);
  };

  const byPage = new Map();
  for (const a of doc.annots) { if (!byPage.has(a.page)) byPage.set(a.page, []); byPage.get(a.page).push(a); }
  const redacted = new Set([...byPage].filter(([, l]) => l.some((a) => a.type === 'redact')).map(([p]) => p));

  // 1) true redaction: replace the page with a flattened raster with black boxes burned in
  let n = 0;
  for (const pi of redacted) {
    progress?.(n++ / redacted.size, `Redacting page ${pi + 1}…`);
    const info = doc.pages[pi], S = 2.5;
    const c = await renderPageToCanvas(info, S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    for (const a of byPage.get(pi).filter((x) => x.type === 'redact')) ctx.fillRect(a.x * S, a.y * S, a.w * S, a.h * S);
    const png = await pdf.embedPng(await canvasToPng(c));
    const W = info.vp.width, H = info.vp.height;
    const np = pdf.insertPage(pi, [W, H]);
    pdf.removePage(pi + 1);
    np.drawImage(png, { x: 0, y: 0, width: W, height: H });
  }

  // 2) everything else
  for (const [pi, list] of byPage) {
    const page = pdf.getPage(pi);
    const info = doc.pages[pi];
    const H = info.vp.height;
    const rot = redacted.has(pi) ? 0 : info.vp.rotation || 0;
    const pt = redacted.has(pi) ? (x, y) => [x, H - y] : (x, y) => info.vp.convertToPdfPoint(x, y);
    const poly = (pts, o) => {
      const d = pts.map(([x, y], i) => { const [px, py] = pt(x, y); return `${i ? 'L' : 'M'}${px} ${-py}`; }).join(' ') + (o.close === false ? '' : ' Z');
      const { close, ...rest } = o;
      page.drawSvgPath(d, { x: 0, y: 0, ...rest });
    };

    for (const a of list) {
      if (a.type === 'redact') continue;
      const op = a.opacity ?? 1;
      try {
        switch (a.type) {
          case 'highlight':
            for (const [x, y, w, h] of a.rects) poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { color: col(a.color), opacity: 1, blendMode: BlendMode.Multiply });
            break;
          case 'underline': case 'strike':
            for (const [x, y, w, h] of a.rects) {
              const yy = a.type === 'underline' ? y + h - 0.5 : y + h * 0.55;
              poly([[x, yy], [x + w, yy]], { close: false, borderColor: col(a.color), borderWidth: Math.max(0.8, h / 14), borderLineCap: LineCapStyle.Round });
            }
            break;
          case 'ink':
            if (a.points.length > 1) poly(a.points, { close: false, borderColor: col(a.color), borderWidth: a.width, borderOpacity: op, borderLineCap: LineCapStyle.Round });
            break;
          case 'rect': case 'whiteout': {
            const o = {};
            if (a.fill || a.type === 'whiteout') { o.color = col(a.type === 'whiteout' ? '#ffffff' : a.fill); o.opacity = op; }
            if (a.type === 'rect' && a.width > 0) { o.borderColor = col(a.color); o.borderWidth = a.width; o.borderOpacity = op; }
            if (o.color || o.borderColor) poly([[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]], o);
            break;
          }
          case 'ellipse': {
            const pts = [], cx = a.x + a.w / 2, cy = a.y + a.h / 2;
            for (let i = 0; i < 72; i++) { const t = (i / 72) * Math.PI * 2; pts.push([cx + (a.w / 2) * Math.cos(t), cy + (a.h / 2) * Math.sin(t)]); }
            const o = {};
            if (a.fill) { o.color = col(a.fill); o.opacity = op; }
            if (a.width > 0) { o.borderColor = col(a.color); o.borderWidth = a.width; o.borderOpacity = op; }
            if (o.color || o.borderColor) poly(pts, o);
            break;
          }
          case 'line': case 'arrow': {
            poly([[a.x1, a.y1], [a.x2, a.y2]], { close: false, borderColor: col(a.color), borderWidth: a.width, borderOpacity: op, borderLineCap: LineCapStyle.Round });
            if (a.type === 'arrow') {
              const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = 4 + a.width * 3.2, sp = 0.45;
              poly([[a.x2, a.y2], [a.x2 - L * Math.cos(ang - sp), a.y2 - L * Math.sin(ang - sp)], [a.x2 - L * Math.cos(ang + sp), a.y2 - L * Math.sin(ang + sp)]], { color: col(a.color), opacity: op });
            }
            break;
          }
          case 'check':
            poly([[a.x + a.w * 0.12, a.y + a.h * 0.55], [a.x + a.w * 0.4, a.y + a.h * 0.85], [a.x + a.w * 0.9, a.y + a.h * 0.15]], { close: false, borderColor: col(a.color), borderWidth: Math.max(1.5, a.h / 7), borderLineCap: LineCapStyle.Round });
            break;
          case 'cross':
            poly([[a.x + a.w * 0.15, a.y + a.h * 0.15], [a.x + a.w * 0.85, a.y + a.h * 0.85]], { close: false, borderColor: col(a.color), borderWidth: Math.max(1.5, a.h / 7), borderLineCap: LineCapStyle.Round });
            poly([[a.x + a.w * 0.85, a.y + a.h * 0.15], [a.x + a.w * 0.15, a.y + a.h * 0.85]], { close: false, borderColor: col(a.color), borderWidth: Math.max(1.5, a.h / 7), borderLineCap: LineCapStyle.Round });
            break;
          case 'text': {
            const font = await getFont(a.font, false);
            const safe = (s) => [...s].map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
            const lines = wrapLines(safe(a.text || ''), a.w - TEXT_PAD * 2, (s) => font.widthOfTextAtSize(s, a.size));
            if (a.fill) poly([[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]], { color: col(a.fill), opacity: 1 });
            lines.forEach((ln, i) => {
              if (!ln) return;
              const [px, py] = pt(a.x + TEXT_PAD, a.y + TEXT_PAD + a.size * (LINE_H * i + 0.95));
              page.drawText(ln, { x: px, y: py, size: a.size, font, color: col(a.color), rotate: degrees(rot) });
            });
            break;
          }
          case 'stamp': {
            const font = await getFont('Helvetica', true);
            const tw = font.widthOfTextAtSize(a.label, 10);
            const size = Math.min((a.h - 8) * 0.62, ((a.w - 16) / tw) * 10);
            poly([[a.x + 1.5, a.y + 1.5], [a.x + a.w - 1.5, a.y + 1.5], [a.x + a.w - 1.5, a.y + a.h - 1.5], [a.x + 1.5, a.y + a.h - 1.5]], { borderColor: col(a.color), borderWidth: 2.5 });
            const w = font.widthOfTextAtSize(a.label, size);
            const [px, py] = pt(a.x + (a.w - w) / 2, a.y + a.h / 2 + size * 0.34);
            page.drawText(a.label, { x: px, y: py, size, font, color: col(a.color), rotate: degrees(rot) });
            break;
          }
          case 'image': {
            const img = await getImage(a.img);
            const [px, py] = pt(a.x, a.y + a.h);
            page.drawImage(img, { x: px, y: py, width: a.w, height: a.h, rotate: degrees(rot), opacity: op });
            break;
          }
          case 'note': {
            const [x, y, w, h] = [a.x, a.y, 18, 18];
            poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { color: rgb(1, 0.85, 0.2), borderColor: rgb(0.55, 0.45, 0), borderWidth: 0.8 });
            poly([[x + 4, y + 6], [x + w - 4, y + 6]], { close: false, borderColor: rgb(0.4, 0.3, 0), borderWidth: 0.9 });
            poly([[x + 4, y + 10], [x + w - 4, y + 10]], { close: false, borderColor: rgb(0.4, 0.3, 0), borderWidth: 0.9 });
            poly([[x + 4, y + 14], [x + w - 8, y + 14]], { close: false, borderColor: rgb(0.4, 0.3, 0), borderWidth: 0.9 });
            // native sticky-note annotation so the comment text survives in other viewers
            const c1 = pt(x, y), c2 = pt(x + w, y + h);
            const ctx = pdf.context;
            const ref = ctx.register(ctx.obj({
              Type: 'Annot', Subtype: 'Text', Name: 'Comment', Contents: PDFString.of(a.text || ''),
              Rect: [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1])],
              C: [1, 0.85, 0.2], F: 4, T: PDFString.of('Silver PDF Pro'),
            }));
            page.node.addAnnot(ref);
            break;
          }
        }
      } catch (e) { console.warn('annotation export failed', a.type, e); }
    }
  }
  return pdf.save({ useObjectStreams: false });
}
