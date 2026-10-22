// Smoke test: launches the app with a debug port, opens a sample PDF through the real Electron renderer, reports results
const { spawn } = require('child_process'); const http = require('http');
const exe = process.argv[2] || require('path').join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const args = process.argv[2] ? ['--remote-debugging-port=9333'] : ['.', '--remote-debugging-port=9333'];
const p = spawn(exe, args, { cwd: process.argv[2] ? undefined : require('path').join(__dirname, '..'), stdio: 'ignore' });
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
(async () => {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await get('http://127.0.0.1:9333/json'); if (targets.some((t) => t.type === 'page')) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); };
  await new Promise((r) => (ws.onopen = r));
  const ev = (expr) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('welcome:', JSON.stringify((await ev(`document.querySelector('#welcome h1')?.textContent`)).result.result.value));
  const r = await ev(`(async()=>{ const pdf = await PDFLib.PDFDocument.create(); const pg = pdf.addPage([612,792]); pg.drawText('Hello smoke test',{x:50,y:700,size:24}); const b = await pdf.save(); await window.pdfStudio.openBytes(b,'smoke.pdf'); await new Promise(r=>setTimeout(r,2500)); return {pages: window.pdfStudio.state.cur.pages.length, canvases: document.querySelectorAll('.pcanvas').length, nonBlank: (()=>{const c=document.querySelector('.pcanvas'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=40) if(d[i]<200) n++; return n})(), text: document.querySelectorAll('.textLayer span').length, native: typeof window.native}})()`);
  console.log('open:', JSON.stringify(r.result.result.value ?? r.result));
  p.kill(); process.exit(0);
})();
