// Electron smoke test for OCR: builds an image-only (scanned) PDF, runs OCR, then searches for recognized text
const { spawn } = require('child_process'); const http = require('http'); const path = require('path');
const exe = process.argv[2] || path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const p = spawn(exe, process.argv[2] ? ['--remote-debugging-port=9334'] : ['.', '--remote-debugging-port=9334'], { cwd: process.argv[2] ? undefined : path.join(__dirname, '..'), stdio: 'ignore' });
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
(async () => {
  let t; for (let i = 0; i < 40; i++) { try { t = await get('http://127.0.0.1:9334/json'); if (t.some((x) => x.type === 'page')) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); };
  await new Promise((r) => (ws.onopen = r));
  const ev = (expr) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await ev(`(async()=>{
    const c=document.createElement('canvas'); c.width=1224; c.height=1584; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,1224,1584); x.fillStyle='#111'; x.font='48px Arial';
    x.fillText('Invoice Number 48213 for Acme Corporation',80,200); x.fillText('Payment is due within thirty days',80,300); x.fillText('Thank you for your business',80,400);
    const jpg=await new Promise(r=>c.toBlob(r,'image/jpeg',0.9)); const pdf=await PDFLib.PDFDocument.create(); const img=await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer())); pdf.addPage([612,792]).drawImage(img,{x:0,y:0,width:612,height:792});
    const doc=await window.pdfStudio.openBytes(await pdf.save(),'scan.pdf');
    const before=(await window.pdfStudio.T.getPageTextLen?.(doc))??null;
    window.pdfStudio.T.ocrDialog(doc);
    await new Promise(r=>setTimeout(r,500)); document.querySelector('.modal .foot .primary').click();
    const t0=Date.now(); while(Date.now()-t0<120000){ await new Promise(r=>setTimeout(r,1000)); if(!document.querySelector('.modal-bg')) break; }
    await new Promise(r=>setTimeout(r,1500));
    const pg=await doc.pdf.getPage(1); const tc=await pg.getTextContent();
    return {secs:(Date.now()-t0)/1000, text: tc.items.map(i=>i.str).join(' ')};
  })()`);
  console.log(JSON.stringify(r.result.result.value ?? r.result));
  p.kill(); process.exit(0);
})();
