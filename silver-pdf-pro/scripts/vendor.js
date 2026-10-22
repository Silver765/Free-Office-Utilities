// Copies browser-ready third-party libs into renderer/vendor
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const out = path.join(root, 'renderer', 'vendor');
fs.mkdirSync(out, { recursive: true });
const copyFile = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
};
copyFile(nm('pdfjs-dist/build/pdf.min.mjs'), path.join(out, 'pdf.min.mjs'));
copyFile(nm('pdfjs-dist/build/pdf.worker.min.mjs'), path.join(out, 'pdf.worker.min.mjs'));
copyFile(nm('pdfjs-dist/web/pdf_viewer.css'), path.join(out, 'pdf_viewer.css'));
copyFile(nm('pdf-lib/dist/pdf-lib.min.js'), path.join(out, 'pdf-lib.min.js'));
copyFile(nm('@pdf-lib/fontkit/dist/fontkit.umd.min.js'), path.join(out, 'fontkit.umd.min.js'));
for (const d of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) copyDir(nm('pdfjs-dist', d), path.join(out, d));
// OCR (tesseract.js) — fully offline: worker, wasm core and English language data
copyFile(nm('tesseract.js/dist/tesseract.min.js'), path.join(out, 'tesseract', 'tesseract.min.js'));
copyFile(nm('tesseract.js/dist/worker.min.js'), path.join(out, 'tesseract', 'worker.min.js'));
for (const f of fs.readdirSync(nm('tesseract.js-core'))) if (/^tesseract-core.*\.(js|wasm)$/.test(f)) copyFile(nm('tesseract.js-core', f), path.join(out, 'tesseract', 'core', f));
copyFile(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), path.join(out, 'tesseract', 'lang', 'eng.traineddata.gz'));
console.log('vendor files copied');
