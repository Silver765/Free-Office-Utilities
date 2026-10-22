// Generates sample PDFs for testing: samples/report.pdf (text, shapes) and samples/form.pdf (fillable form)
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs'), path = require('path');
(async () => {
  fs.mkdirSync(path.join(__dirname, '..', 'samples'), { recursive: true });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lorem = 'Silver PDF Pro is a full featured document tool. You can highlight text, add comments, draw shapes, sign documents, fill forms, merge and split files, redact sensitive information and much more. This paragraph exists so that there is plenty of text to search and select.';
  for (let p = 1; p <= 5; p++) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: rgb(0.9, 0.15, 0.17) });
    page.drawText(`Quarterly Report — Section ${p}`, { x: 40, y: 758, size: 22, font: bold, color: rgb(1, 1, 1) });
    let y = 700;
    for (let l = 0; l < 14; l++) {
      page.drawText(lorem.slice((l * 23) % 80, (l * 23) % 80 + 78), { x: 50, y, size: 12, font }); y -= 20;
    }
    page.drawText('Confidential figure: 4,812,903 USD', { x: 50, y: y - 20, size: 14, font: bold });
    page.drawRectangle({ x: 50, y: 160, width: 200, height: 100, borderColor: rgb(0.1, 0.4, 0.8), borderWidth: 2 });
    page.drawText(`Page ${p} of 5`, { x: 270, y: 30, size: 10, font });
  }
  fs.writeFileSync(path.join(__dirname, '..', 'samples', 'report.pdf'), await pdf.save());

  const f = await PDFDocument.create(); const page = f.addPage([612, 792]);
  const fb = await f.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Employee Registration Form', { x: 50, y: 730, size: 22, font: fb });
  const form = f.getForm();
  const fields = [['Full name', 'fullName'], ['Email', 'email']];
  let y = 680;
  for (const [label, name] of fields) { page.drawText(label, { x: 50, y: y + 6, size: 12 }); const t = form.createTextField(name); t.addToPage(page, { x: 160, y, width: 300, height: 22 }); y -= 40; }
  page.drawText('Department', { x: 50, y: y + 6, size: 12 });
  const dd = form.createDropdown('dept'); dd.addOptions(['Engineering', 'Sales', 'Support']); dd.addToPage(page, { x: 160, y, width: 200, height: 22 }); y -= 40;
  page.drawText('Subscribe to newsletter', { x: 80, y: y + 4, size: 12 });
  const cb = form.createCheckBox('news'); cb.addToPage(page, { x: 50, y, width: 18, height: 18 });
  fs.writeFileSync(path.join(__dirname, '..', 'samples', 'form.pdf'), await f.save());
  console.log('samples written');
})();
