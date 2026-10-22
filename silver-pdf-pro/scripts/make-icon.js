// Renders build/icon.png (1024x1024) with Electron's offscreen renderer
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4a4f"/><stop offset="1" stop-color="#c81a20"/></linearGradient></defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>
  <path d="M300 200h300l160 160v464a40 40 0 0 1-40 40H300a40 40 0 0 1-40-40V240a40 40 0 0 1 40-40z" fill="#fff"/>
  <path d="M600 200v120a40 40 0 0 0 40 40h120z" fill="#f0b4b6"/>
  <text x="512" y="660" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="190" fill="#d81f26">PDF</text>
  <rect x="340" y="720" width="344" height="26" rx="13" fill="#d9d9de"/><rect x="340" y="776" width="244" height="26" rx="13" fill="#d9d9de"/></svg>`;
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.toPNG());
  app.quit();
});
