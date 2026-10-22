const { app, BrowserWindow, ipcMain, dialog, protocol, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
const pendingOpen = [];
const isPdf = (p) => /\.pdf$/i.test(p);
const argFiles = (argv) => argv.slice(app.isPackaged ? 1 : 2).filter((a) => isPdf(a) && fs.existsSync(a));

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  for (const f of argFiles(argv)) win?.webContents.send('open-path', f);
});
app.on('open-file', (e, p) => { e.preventDefault(); win ? win.webContents.send('open-path', p) : pendingOpen.push(p); });

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
const readRecent = () => { try { return JSON.parse(fs.readFileSync(recentFile(), 'utf8')); } catch { return []; } };
const addRecent = (p) => {
  const list = [p, ...readRecent().filter((x) => x !== p)].slice(0, 12).filter((x) => fs.existsSync(x));
  try { fs.writeFileSync(recentFile(), JSON.stringify(list)); } catch {}
};

function createWindow() {
  // Windows/Linux use the in-app menu bar; macOS needs a native menu for Cmd+Q / copy / paste
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
    : null);
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#1e1f22', title: 'Silver PDF Pro', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL('app://pdfstudio/renderer/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.on('close', (e) => {
    if (win.forceClose) return;
    e.preventDefault();
    win.webContents.send('request-close');
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.icc': 'application/octet-stream' };
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    const f = path.normalize(path.join(__dirname, decodeURIComponent(u.pathname)));
    if (!f.startsWith(__dirname)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(f);
      return new Response(data, { headers: { 'content-type': mime[path.extname(f).toLowerCase()] || 'application/octet-stream' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
  createWindow();
  win.webContents.once('did-finish-load', () => {
    for (const f of [...pendingOpen, ...argFiles(process.argv)]) win.webContents.send('open-path', f);
  });
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win && app.isReady()) createWindow(); });

const readFile = (p) => { const b = fs.readFileSync(p); return { path: p, name: path.basename(p), data: new Uint8Array(b.buffer, b.byteOffset, b.byteLength) }; };

ipcMain.handle('open-dialog', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', ...(opts.multi ? ['multiSelections'] : [])],
    filters: opts.filters || [{ name: 'PDF documents', extensions: ['pdf'] }],
  });
  if (r.canceled) return [];
  const files = r.filePaths.map(readFile);
  if (!opts.filters) files.forEach((f) => addRecent(f.path));
  return files;
});
ipcMain.handle('read-path', (_e, p) => { const f = readFile(p); addRecent(p); return f; });
ipcMain.handle('save-dialog', async (_e, { name, data, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: filters || [{ name: 'PDF documents', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  if (isPdf(r.filePath)) addRecent(r.filePath);
  return { path: r.filePath, name: path.basename(r.filePath) };
});
ipcMain.handle('write-path', (_e, { path: p, data }) => { fs.writeFileSync(p, Buffer.from(data)); addRecent(p); return true; });
ipcMain.handle('save-many', async (_e, files) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Choose output folder' });
  if (r.canceled) return null;
  for (const f of files) fs.writeFileSync(path.join(r.filePaths[0], f.name), Buffer.from(f.data));
  return r.filePaths[0];
});
ipcMain.handle('recent', () => readRecent().filter((p) => fs.existsSync(p)).map((p) => ({ path: p, name: path.basename(p), mtime: fs.statSync(p).mtimeMs })));
ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('read-font', (_e, name) => {
  const dirs = [process.env.WINDIR && path.join(process.env.WINDIR, 'Fonts'), '/usr/share/fonts/truetype/dejavu', '/Library/Fonts'].filter(Boolean);
  for (const d of dirs) { const f = path.join(d, name); if (fs.existsSync(f)) { const b = fs.readFileSync(f); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); } }
  return null;
});
ipcMain.on('set-title', (_e, t) => win?.setTitle(t));
ipcMain.on('confirm-close', () => { if (win) { win.forceClose = true; win.close(); } });
