const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post('/generate-pdf', (req, res) => {
  const data = req.body;
  const services = (data.services || []).filter(s => s.description || parseFloat(s.unitPrice));

  // Currency
  const currencyRaw = data.currency || 'USD|$';
  const currencyCode = currencyRaw.split('|')[0];
  const currencySym  = currencyRaw.split('|')[1] || '$';
  const fmt = (n) => currencySym + ' ' + n.toFixed(2);

  // ── Calculate totals first ──
  let subtotal = 0;
  services.forEach(s => {
    subtotal += (parseFloat(s.qty) || 0) * (parseFloat(s.unitPrice) || 0);
  });
  const discount  = parseFloat(data.discount) || 0;
  const taxPct    = parseFloat(data.tax) || 0;
  const taxAmt    = subtotal * (taxPct / 100);
  const grandTotal = subtotal - discount + taxAmt;

  // ── Estimate height needed ──
  const PAGE_H   = 841.89;  // A4
  const MARGIN   = 50;
  const FIXED_H  = 115 + 100 + 110 + 22 + (services.length * 24) + 22 + 80 + 30 + 80 + 60; // rough
  const autoSize = FIXED_H > PAGE_H - 100;

  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    autoFirstPage: true,
    info: { Title: `Invoice ${data.invoiceNumber}`, Author: 'Web Pro Creations' }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice_${data.invoiceNumber}.pdf"`);
  doc.pipe(res);

  // Constants
  const L       = MARGIN;           // left edge  = 50
  const PW      = doc.page.width;   // 595.28
  const W       = PW - MARGIN * 2;  // 495.28  — full content width
  const R       = L + W;            // right edge = 545.28

  const GOLD      = '#B8860B';
  const DARK      = '#1A1A1A';
  const LGOLD     = '#F5F0E8';
  const WHITE     = '#FFFFFF';
  const GRAY      = '#777777';
  const LGRAY     = '#F4F4F4';
  const BLACK111  = '#111111';

  // ── Column definitions (absolute X, width) ──
  // Description | QTY | UNIT PRICE | TOTAL
  const C = {
    desc:  { x: L,       w: 240 },
    qty:   { x: L+240,   w: 65  },
    price: { x: L+305,   w: 105 },
    total: { x: L+410,   w: W-410 }, // fills to right edge
  };

  let y = MARGIN; // current Y cursor

  // ── Helper: filled rect ──
  function rect(x, ry, w, h, color) {
    doc.rect(x, ry, w, h).fill(color);
  }

  // ── Helper: text with no overflow ──
  function txt(str, x, ry, opts = {}) {
    doc.font(opts.font || 'Helvetica')
       .fontSize(opts.size || 9)
       .fillColor(opts.color || DARK)
       .text(String(str || ''), x, ry, {
         width:    opts.w || 200,
         align:    opts.align || 'left',
         lineBreak: false,
       });
  }

  // ═══════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════
  txt('WEB PRO CREATIONS', L, y, { font:'Helvetica-Bold', size:22, color:DARK, w:W, align:'right' });
  y += 24;
  txt('From Zeesha | CEO', L, y, { font:'Helvetica-Oblique', size:10, color:GRAY, w:W, align:'right' });
  y += 14;
  txt('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', L, y, { size:8, color:GOLD, w:W, align:'right' });
  y += 16;

  // Gold divider
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(GOLD).stroke();
  y += 14;

  // ═══════════════════════════════════════
  // INVOICE TITLE  +  META BOX
  // ═══════════════════════════════════════
  const titleY = y;
  txt('INVOICE', L, titleY, { font:'Helvetica-Bold', size:36, color:DARK, w:200 });

  // Meta box — right side, aligned to right edge
  const metaRows = [
    ['Invoice #',     data.invoiceNumber || '—'],
    ['Invoice Date',  data.invoiceDate   || '—'],
    ['Due Date',      data.dueDate       || '—'],
    ['Status',        data.status        || 'UNPAID'],
  ];
  const metaW   = 180;
  const metaX   = R - metaW;   // flush to right edge
  const labelW  = 80;
  const valueW  = metaW - labelW;

  metaRows.forEach(([label, value], i) => {
    const ry = titleY + i * 22;
    rect(metaX,          ry, labelW, 20, LGOLD);
    rect(metaX + labelW, ry, valueW, 20, WHITE);
    txt(label, metaX + 4,          ry + 5, { font:'Helvetica-Bold', size:7.5, color:GOLD, w: labelW - 6 });
    const valColor = label === 'Status' ? '#CC0000' : DARK;
    txt(value, metaX + labelW + 4, ry + 5, { font:'Helvetica-Bold', size:7.5, color: valColor, w: valueW - 6 });
  });

  y = titleY + 82;  // fixed gap after title block

  // ═══════════════════════════════════════
  // BILL TO
  // ═══════════════════════════════════════
  rect(L, y, W, 20, DARK);
  txt('BILL TO', L + 10, y + 5, { font:'Helvetica-Bold', size:9, color:WHITE, w:100 });
  y += 20;

  const billFields = [
    ['Client Name', data.clientName],
    ['Company',     data.company],
    ['Email',       data.email],
    ['Phone',       data.phone],
  ];
  const billH = billFields.length * 20 + 8;
  rect(L, y, W, billH, BLACK111);

  billFields.forEach(([label, value], i) => {
    const fy = y + 6 + i * 20;
    txt(label + ':', L + 12, fy, { font:'Helvetica-Bold', size:8.5, color:GOLD, w:90 });
    txt(value || '—', L + 110, fy, { size:8.5, color:'#CCCCCC', w: W - 120 });
  });
  y += billH + 18;

  // ═══════════════════════════════════════
  // SERVICES TABLE
  // ═══════════════════════════════════════
  // Header
  rect(L, y, W, 20, DARK);
  txt('SERVICE DESCRIPTION', C.desc.x  + 6, y + 6, { font:'Helvetica-Bold', size:8, color:WHITE,  w: C.desc.w });
  txt('QTY',                 C.qty.x,        y + 6, { font:'Helvetica-Bold', size:8, color:WHITE,  w: C.qty.w,   align:'center' });
  txt('UNIT PRICE',          C.price.x,      y + 6, { font:'Helvetica-Bold', size:8, color:WHITE,  w: C.price.w, align:'center' });
  txt('TOTAL',               C.total.x,      y + 6, { font:'Helvetica-Bold', size:8, color:GOLD,   w: C.total.w, align:'right'  });
  y += 20;

  // Rows
  services.forEach((svc, i) => {
    const qty   = parseFloat(svc.qty)       || 0;
    const price = parseFloat(svc.unitPrice) || 0;
    const total = qty * price;
    const fill  = i % 2 === 0 ? WHITE : LGRAY;
    const rowH  = 22;
    rect(L, y, W, rowH, fill);

    txt(svc.description || '',    C.desc.x  + 6, y + 6, { size:8.5, color:DARK,  w: C.desc.w  - 10 });
    txt(qty,                       C.qty.x,        y + 6, { size:8.5, color:DARK,  w: C.qty.w,        align:'center' });
    txt(fmt(price),   C.price.x,      y + 6, { size:8.5, color:DARK,  w: C.price.w,      align:'center' });
    txt(fmt(total),   C.total.x,      y + 6, { size:8.5, color:DARK,  w: C.total.w - 4,  align:'right'  });
    y += rowH;
  });

  y += 16;

  // ═══════════════════════════════════════
  // NOTES  +  TOTALS  (side by side)
  // ═══════════════════════════════════════
  const totalsX  = R - 220;          // totals block starts here
  const totalsLW = 110;              // label column width
  const totalsVW = 110;              // value column width
  const notesW   = totalsX - L - 12;
  const notesY   = y;

  // Notes (left)
  if (data.notes) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(GRAY)
       .text(data.notes, L, notesY, { width: notesW });
  }

  // Totals rows (right)
  const tRows = [
    ['Subtotal',          fmt(subtotal)],
    ['Discount',          '-' + fmt(discount)],
    ['Tax (' + taxPct + '%)', fmt(taxAmt)],
  ];
  tRows.forEach(([label, value], i) => {
    const ry = y + i * 22;
    rect(totalsX,             ry, totalsLW, 20, LGRAY);
    rect(totalsX + totalsLW,  ry, totalsVW, 20, WHITE);
    doc.moveTo(totalsX, ry).lineTo(totalsX + totalsLW + totalsVW, ry).lineWidth(0.5).strokeColor('#DDDDDD').stroke();
    txt(label, totalsX + 4,              ry + 5, { size:8, color:GRAY,  w: totalsLW - 8, align:'right' });
    txt(value, totalsX + totalsLW + 4,   ry + 5, { font:'Helvetica-Bold', size:8, color:DARK,  w: totalsVW - 8, align:'right' });
  });

  // Grand Total
  const gtY = y + tRows.length * 22 + 4;
  rect(totalsX,            gtY, totalsLW, 26, DARK);
  rect(totalsX + totalsLW, gtY, totalsVW, 26, GOLD);
  txt('GRAND TOTAL', totalsX + 4,             gtY + 8, { font:'Helvetica-Bold', size:8,  color:WHITE, w: totalsLW - 8, align:'right' });
  txt(fmt(grandTotal), totalsX + totalsLW + 4, gtY + 6, { font:'Helvetica-Bold', size:12, color:WHITE, w: totalsVW - 8, align:'right' });

  // Move y below totals block
  y = gtY + 26 + 20;

  // ═══════════════════════════════════════
  // FOOTER — pinned to bottom of page
  // ═══════════════════════════════════════
  const PAGE_HEIGHT = doc.page.height;
  const footerY = PAGE_HEIGHT - 55;

  // Only draw footer if it won't collide with content
  if (y < footerY - 10) {
    doc.moveTo(L, footerY).lineTo(R, footerY).lineWidth(1).strokeColor(GOLD).stroke();
    txt('London  |  USA  |  Pakistan', L, footerY + 8, { font:'Helvetica-Bold', size:9, color:GOLD, w:W, align:'center' });
    txt('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', L, footerY + 22, { size:7.5, color:GRAY, w:W, align:'center' });
  } else {
    // Content too long — add footer right after content
    y += 6;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(GOLD).stroke();
    y += 8;
    txt('London  |  USA  |  Pakistan', L, y, { font:'Helvetica-Bold', size:9, color:GOLD, w:W, align:'center' });
    y += 14;
    txt('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', L, y, { size:7.5, color:GRAY, w:W, align:'center' });
  }

  doc.end();
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Invoice app running at http://localhost:${PORT}`));
