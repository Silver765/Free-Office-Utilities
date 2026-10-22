# Silver PDF Pro

An offline, Acrobat‑style PDF viewer / editor built with Electron, [pdf.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/).

## Run

```
npm install
npm start          # desktop app
npm run web        # same UI in a browser at http://localhost:5178/renderer/index.html
npm run package    # Windows build in dist/
```

## Features

**View** – tabs, continuous scroll, zoom/fit width/fit page, thumbnails, bookmarks, links, text search (case / whole word), dark & light themes, drag‑and‑drop, recent files, print.

**Comment & markup** – highlight / underline / strikethrough (select text, or use the floating bar), sticky notes (saved as native PDF note annotations), text boxes, freehand pen, rectangle, ellipse, line, arrow, stamps, comment list. Move, resize, restyle, nudge with arrow keys, delete, full undo/redo.

**Fill & sign** – fill AcroForm fields from a side panel and flatten them, draw / type / upload signatures (saved locally), insert images, check and cross marks, white‑out.

**Organize** – drag‑and‑drop page reorder, rotate, delete, duplicate, extract, insert blank pages or pages from another PDF, crop, combine files (with page ranges), split by N pages / ranges / each page.

**Edit & protect** – headers, footers, Bates & page numbers, text watermark, true redaction (content under the black box is rasterised away), flatten, reduce file size (lossless optimise or rasterise at 150/96 dpi), document properties & metadata.

**Scan & OCR** – offline English text recognition (bundled tesseract.js) adds an invisible, searchable text layer to scanned pages.

**Export** – pages to PNG/JPEG, text to .txt.

## Notes

* Annotations stay editable in the session; **Save** writes them into the PDF (flattened into page content, sticky notes also as native annotations).
* Password‑protected PDFs open in view‑only mode (pdf-lib cannot re‑encrypt).
* Not included: editing existing page text/images in place, digital certificate signatures, password encryption.

## Installers

| Platform | Output (in `release/`) | Build on |
|---|---|---|
| Windows | `Silver PDF Pro-Setup-<v>-x64.exe` (installer), `Silver PDF Pro-<v>-win-x64.exe` (portable) | Windows |
| macOS | `Silver PDF Pro-<v>-mac-x64.dmg` (Intel), `Silver PDF Pro-<v>-mac-arm64.dmg` (Apple Silicon) | a Mac |
| Linux | `.AppImage`, `.deb`, `.rpm` (x64) | Linux |

```
npm run dist:win     # on Windows
npm run dist:mac     # on macOS (builds Intel + Apple Silicon)
npm run dist:linux   # on Linux
```

macOS installers can only be built on a Mac, so `.github/workflows/release.yml` builds all three platforms on GitHub's runners: push the project to GitHub, then either run the workflow manually (Actions tab) or push a tag like `v1.0.0` to get a Release with every installer attached.

Builds are unsigned: Windows SmartScreen shows "unknown publisher" (More info → Run anyway) and macOS needs right‑click → Open the first time. Removing those warnings requires a code‑signing certificate / Apple Developer account.
