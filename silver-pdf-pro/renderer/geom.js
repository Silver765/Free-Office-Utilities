// Annotation geometry helpers shared by the editor and the exporter
export const BOX_TYPES = new Set(['rect', 'ellipse', 'text', 'image', 'stamp', 'redact', 'whiteout', 'check', 'cross']);
export const FONT_CSS = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
export const TEXT_PAD = 3;

export function bbox(a) {
  switch (a.type) {
    case 'highlight': case 'underline': case 'strike': {
      const xs = a.rects.flatMap((r) => [r[0], r[0] + r[2]]), ys = a.rects.flatMap((r) => [r[1], r[1] + r[3]]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    }
    case 'ink': {
      const xs = a.points.map((p) => p[0]), ys = a.points.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    }
    case 'line': case 'arrow':
      return [Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1)];
    case 'note': return [a.x, a.y, 20, 20];
    default: return [a.x, a.y, a.w, a.h];
  }
}

export function translate(a, dx, dy) {
  switch (a.type) {
    case 'highlight': case 'underline': case 'strike': a.rects = a.rects.map((r) => [r[0] + dx, r[1] + dy, r[2], r[3]]); break;
    case 'ink': a.points = a.points.map((p) => [p[0] + dx, p[1] + dy]); break;
    case 'line': case 'arrow': a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy; break;
    default: a.x += dx; a.y += dy;
  }
}

/** Greedy word wrap. `measure(str) -> width` */
export function wrapLines(text, maxW, measure) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && measure(test.trimEnd()) > maxW) {
        out.push(line.trimEnd());
        line = word.trimStart();
        // break very long words
        while (measure(line) > maxW && line.length > 1) {
          let k = line.length - 1;
          while (k > 1 && measure(line.slice(0, k)) > maxW) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      } else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

let _ctx;
export function canvasMeasure(font, size, bold) {
  _ctx ??= document.createElement('canvas').getContext('2d');
  _ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_CSS[font] || FONT_CSS.Helvetica}`;
  return (s) => _ctx.measureText(s).width;
}

export const LINE_H = 1.2;

export const STAMPS = [
  { label: 'APPROVED', color: '#1b8a3a' }, { label: 'REJECTED', color: '#d12a2a' }, { label: 'DRAFT', color: '#6b6f78' },
  { label: 'CONFIDENTIAL', color: '#d12a2a' }, { label: 'FOR REVIEW', color: '#1d5fd1' }, { label: 'FINAL', color: '#1b8a3a' },
  { label: 'NOT APPROVED', color: '#d12a2a' }, { label: 'COMPLETED', color: '#1b8a3a' }, { label: 'VOID', color: '#d12a2a' },
];

export function hexToRgb01(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
