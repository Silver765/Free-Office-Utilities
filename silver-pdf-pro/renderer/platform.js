// Bridges to Electron when available, falls back to browser APIs otherwise.
const n = window.native;
export const isElectron = !!n;

function pickFiles(accept, multi) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = !!multi;
    inp.onchange = async () => {
      const out = [];
      for (const f of inp.files) out.push({ path: null, name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      resolve(out);
    };
    inp.oncancel = () => resolve([]);
    inp.click();
  });
}
function download(name, data, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const platform = {
  async openDialog(opts = {}) {
    if (n) return n.openDialog(opts);
    return pickFiles(opts.filters ? opts.accept || '*' : 'application/pdf,.pdf', opts.multi);
  },
  async readPath(p) { return n.readPath(p); },
  async save(name, data, filters) {
    if (n) return n.saveDialog({ name, data, filters });
    download(name, data); return { path: null, name };
  },
  async writePath(p, data) { if (n && p) return n.writePath(p, data); return false; },
  async saveMany(files) {
    if (n) return n.saveMany(files);
    for (const f of files) download(f.name, f.data);
    return 'Downloads';
  },
  async recent() { return n ? n.recent() : []; },
  reveal(p) { n?.reveal(p); },
  async readFont(name) { return n ? n.readFont(name) : null; },
  setTitle(t) { document.title = t; n?.setTitle(t); },
  onOpenPath(cb) { n?.onOpenPath(cb); },
  onRequestClose(cb) { n?.onRequestClose(cb); },
  confirmClose() { n?.confirmClose(); },
};
