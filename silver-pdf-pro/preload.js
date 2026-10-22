const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  openDialog: (opts) => ipcRenderer.invoke('open-dialog', opts),
  readPath: (p) => ipcRenderer.invoke('read-path', p),
  saveDialog: (o) => ipcRenderer.invoke('save-dialog', o),
  writePath: (p, data) => ipcRenderer.invoke('write-path', { path: p, data }),
  saveMany: (files) => ipcRenderer.invoke('save-many', files),
  recent: () => ipcRenderer.invoke('recent'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  readFont: (n) => ipcRenderer.invoke('read-font', n),
  setTitle: (t) => ipcRenderer.send('set-title', t),
  confirmClose: () => ipcRenderer.send('confirm-close'),
  onOpenPath: (cb) => ipcRenderer.on('open-path', (_e, p) => cb(p)),
  onRequestClose: (cb) => ipcRenderer.on('request-close', () => cb()),
});
