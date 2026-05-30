const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PDF generation endpoint
app.post('/generate-pdf', (req, res) => {
  const data = req.body;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: `Invoice ${data.invoiceNumber}`, Author: 'Web Pro Creations' }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice_${data.invoiceNumber}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 100; // content width
  const GOLD = '#B8860B';
  const DARK = '#1A1A1A';
  const LIGHT_GOLD = '#F5F0E8';
  const WHITE = '#FFFFFF';
  const GRAY = '#777777';

  // ── HEADER ──
  // Company name
  doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK)
     .text('WEB PRO CREATIONS', 50, 50, { align: 'right' });
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(GRAY)
     .text('From Zeesha | CEO', 50, 76, { align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GOLD)
     .text('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', 50, 92, { align: 'right' });

  // Gold line
  doc.moveTo(50, 115).lineTo(50 + W, 115).lineWidth(2).strokeColor(GOLD).stroke();

  // ── INVOICE TITLE + META ──
  doc.font('Helvetica-Bold').fontSize(40).fillColor(DARK).text('INVOICE', 50, 130);

  // Meta box (right side)
  const metaX = 370, metaY = 128, metaW = 180;
  const metaRows = [
    ['Invoice #', data.invoiceNumber || '#0000'],
    ['Invoice Date', data.invoiceDate || '—'],
    ['Due Date', data.dueDate || '—'],
    ['Status', data.status || 'UNPAID'],
  ];
  metaRows.forEach(([label, value], i) => {
    const rowY = metaY + i * 24;
    doc.rect(metaX, rowY, 85, 22).fill(LIGHT_GOLD);
    doc.rect(metaX + 85, rowY, metaW - 85, 22).fill(WHITE);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD)
       .text(label, metaX + 4, rowY + 7, { width: 80 });
    const valColor = label === 'Status' ? '#CC0000' : DARK;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(valColor)
       .text(value, metaX + 90, rowY + 7, { width: 85 });
  });

  // ── BILL TO ──
  const billY = 210;
  doc.rect(50, billY, W, 22).fill(DARK);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE)
     .text('BILL TO', 62, billY + 6);

  doc.rect(50, billY + 22, W, 88).fill('#111111');
  const billFields = [
    ['Client Name', data.clientName],
    ['Company', data.company],
    ['Email', data.email],
    ['Phone', data.phone],
  ];
  billFields.forEach(([label, value], i) => {
    const fy = billY + 28 + i * 20;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD).text(label + ':', 65, fy);
    doc.font('Helvetica').fontSize(9).fillColor('#CCCCCC').text(value || '—', 160, fy);
  });

  // ── SERVICES TABLE ──
  const tableY = billY + 130;
  const cols = [280, 70, 90, 110]; // widths
  const colX = [50, 330, 400, 490];
  const headers = ['SERVICE DESCRIPTION', 'QTY', 'UNIT PRICE', 'TOTAL'];

  // Header row
  doc.rect(50, tableY, W, 22).fill(DARK);
  headers.forEach((h, i) => {
    const align = i === 0 ? 'left' : 'center';
    doc.font('Helvetica-Bold').fontSize(8).fillColor(i === 3 ? GOLD : WHITE)
       .text(h, colX[i] + (i === 0 ? 6 : 0), tableY + 7, { width: cols[i], align });
  });

  // Service rows
  const services = data.services || [];
  let subtotal = 0;
  services.forEach((svc, i) => {
    const rowY = tableY + 22 + i * 24;
    const fill = i % 2 === 0 ? WHITE : '#F8F8F8';
    doc.rect(50, rowY, W, 24).fill(fill);

    const qty = parseFloat(svc.qty) || 0;
    const price = parseFloat(svc.unitPrice) || 0;
    const total = qty * price;
    subtotal += total;

    doc.font('Helvetica').fontSize(9).fillColor(DARK)
       .text(svc.description || '', colX[0] + 6, rowY + 7, { width: cols[0] - 10 });
    doc.text(qty.toString(), colX[1], rowY + 7, { width: cols[1], align: 'center' });
    doc.text('$' + price.toFixed(2), colX[2], rowY + 7, { width: cols[2], align: 'center' });
    doc.text('$' + total.toFixed(2), colX[3], rowY + 7, { width: cols[3], align: 'center' });
  });

  // ── TOTALS ──
  const discount = parseFloat(data.discount) || 0;
  const tax = parseFloat(data.tax) || 0;
  const taxAmt = subtotal * (tax / 100);
  const grandTotal = subtotal - discount + taxAmt;

  const totalsY = tableY + 22 + services.length * 24 + 20;
  const totalsX = 370;
  const totalsW = 230;

  const totalsRows = [
    ['Subtotal', '$' + subtotal.toFixed(2), false],
    ['Discount', '-$' + discount.toFixed(2), false],
    ['Tax (' + tax + '%)', '$' + taxAmt.toFixed(2), false],
  ];
  totalsRows.forEach(([label, value], i) => {
    const ry = totalsY + i * 22;
    doc.rect(totalsX, ry, 110, 20).fill('#F8F8F8');
    doc.rect(totalsX + 110, ry, 120, 20).fill(WHITE);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(label, totalsX + 5, ry + 5, { width: 105, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(value, totalsX + 115, ry + 5, { width: 110, align: 'right' });
  });

  // Grand total
  const gtY = totalsY + totalsRows.length * 22 + 4;
  doc.rect(totalsX, gtY, 110, 26).fill(DARK);
  doc.rect(totalsX + 110, gtY, 120, 26).fill(GOLD);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(WHITE).text('GRAND TOTAL', totalsX + 5, gtY + 8, { width: 105, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(WHITE).text('$' + grandTotal.toFixed(2), totalsX + 112, gtY + 6, { width: 114, align: 'right' });

  // Notes
  if (data.notes) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(GRAY)
       .text(data.notes, 50, totalsY, { width: 290 });
  }

  // ── FOOTER ──
  const footerY = doc.page.height - 80;
  doc.moveTo(50, footerY).lineTo(50 + W, footerY).lineWidth(1.5).strokeColor(GOLD).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD)
     .text('London  |  USA  |  Pakistan', 50, footerY + 10, { align: 'center', width: W });
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
     .text('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', 50, footerY + 26, { align: 'center', width: W });

  doc.end();
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Invoice app running at http://localhost:${PORT}`));
