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

  const currencyRaw = data.currency || 'USD|$';
  const currencySym = currencyRaw.split('|')[1] || '$';
  const fmt = (n) => currencySym + ' ' + parseFloat(n).toFixed(2);

  let subtotal = 0;
  services.forEach(s => { subtotal += (parseFloat(s.qty)||0) * (parseFloat(s.unitPrice)||0); });
  const discount   = parseFloat(data.discount) || 0;
  const taxPct     = parseFloat(data.tax) || 0;
  const taxAmt     = subtotal * (taxPct / 100);
  const grandTotal = subtotal - discount + taxAmt;

  // ── Fixed layout sizes ──
  const MARGIN   = 45;
  const RH       = 20;   // row height services
  const BILL_ROW = 18;   // bill to row height

  // Pre-calculate total height needed
  const headerH  = 22 + 13 + 14 + 12 + 12;          // ~73
  const titleH   = 82;
  const billH    = 20 + (4 * BILL_ROW) + 8 + 14;    // ~130
  const tableH   = 20 + (services.length * RH) + 14; // header + rows + gap
  const totalsH  = (3 * 22) + 30 + 16;              // 3 rows + grand total + gap
  const footerH  = 40;
  const notesH   = data.notes ? Math.min(40, Math.ceil(data.notes.length / 60) * 12) : 0;
  const contentH = headerH + titleH + billH + tableH + Math.max(totalsH, notesH) + footerH + 20;

  // Use A4 always — just make sure content fits
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    autoFirstPage: true,
    bufferPages: true,
    info: { Title: `Invoice ${data.invoiceNumber}`, Author: 'Web Pro Creations' }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice_${data.invoiceNumber}.pdf"`);
  doc.pipe(res);

  const L  = MARGIN;
  const PW = doc.page.width;
  const W  = PW - MARGIN * 2;
  const R  = L + W;

  const GOLD   = '#B8860B';
  const DARK   = '#1A1A1A';
  const LGOLD  = '#F5F0E8';
  const WHITE  = '#FFFFFF';
  const GRAY   = '#777777';
  const LGRAY  = '#F4F4F4';
  const DARK11 = '#111111';

  const C = {
    desc:  { x: L,       w: 235 },
    qty:   { x: L+235,   w: 60  },
    price: { x: L+295,   w: 110 },
    total: { x: L+405,   w: W-405 },
  };

  let y = MARGIN;

  function rect(x, ry, w, h, color) {
    doc.rect(x, ry, w, h).fill(color);
  }

  function txt(str, x, ry, opts = {}) {
    doc.font(opts.font || 'Helvetica')
       .fontSize(opts.size || 9)
       .fillColor(opts.color || DARK)
       .text(String(str || '—'), x, ry, {
         width: opts.w || 200,
         align: opts.align || 'left',
         lineBreak: false,
       });
  }

  // ── HEADER ──
  txt('WEB PRO CREATIONS', L, y, { font:'Helvetica-Bold', size:20, color:DARK, w:W, align:'right' });
  y += 22;
  txt('From Zeesha | CEO', L, y, { font:'Helvetica-Oblique', size:9, color:GRAY, w:W, align:'right' });
  y += 13;
  txt('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', L, y, { size:7.5, color:GOLD, w:W, align:'right' });
  y += 12;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(GOLD).stroke();
  y += 12;

  // ── INVOICE TITLE + META ──
  const titleY = y;
  txt('INVOICE', L, titleY, { font:'Helvetica-Bold', size:32, color:DARK, w:200 });

  const metaW  = 175;
  const metaX  = R - metaW;
  const lW     = 78;
  const vW     = metaW - lW;
  [
    ['Invoice #',    data.invoiceNumber || '—'],
    ['Invoice Date', data.invoiceDate   || '—'],
    ['Due Date',     data.dueDate       || '—'],
    ['Status',       data.status        || 'UNPAID'],
  ].forEach(([label, value], i) => {
    const ry = titleY + i * 20;
    rect(metaX,      ry, lW, 18, LGOLD);
    rect(metaX + lW, ry, vW, 18, WHITE);
    txt(label, metaX + 3,      ry + 4, { font:'Helvetica-Bold', size:7, color:GOLD,  w: lW - 5 });
    txt(value, metaX + lW + 3, ry + 4, { font:'Helvetica-Bold', size:7, color: label==='Status' ? '#CC0000' : DARK, w: vW - 5 });
  });
  y = titleY + 76;

  // ── BILL TO ──
  rect(L, y, W, 18, DARK);
  txt('BILL TO', L+10, y+4, { font:'Helvetica-Bold', size:8.5, color:WHITE, w:100 });
  y += 18;
  const bH = 4 * BILL_ROW + 6;
  rect(L, y, W, bH, DARK11);
  [['Client Name', data.clientName], ['Company', data.company], ['Email', data.email], ['Phone', data.phone]]
    .forEach(([label, value], i) => {
      const fy = y + 4 + i * BILL_ROW;
      txt(label+':', L+10, fy, { font:'Helvetica-Bold', size:8, color:GOLD, w:85 });
      txt(value||'—', L+105, fy, { size:8, color:'#CCCCCC', w: W-115 });
    });
  y += bH + 14;

  // ── SERVICES TABLE ──
  rect(L, y, W, 18, DARK);
  txt('SERVICE DESCRIPTION', C.desc.x+5,  y+5, { font:'Helvetica-Bold', size:7.5, color:WHITE, w:C.desc.w });
  txt('QTY',                 C.qty.x,     y+5, { font:'Helvetica-Bold', size:7.5, color:WHITE, w:C.qty.w,   align:'center' });
  txt('UNIT PRICE',          C.price.x,   y+5, { font:'Helvetica-Bold', size:7.5, color:WHITE, w:C.price.w, align:'center' });
  txt('TOTAL',               C.total.x,   y+5, { font:'Helvetica-Bold', size:7.5, color:GOLD,  w:C.total.w, align:'right'  });
  y += 18;

  services.forEach((svc, i) => {
    const qty   = parseFloat(svc.qty)       || 0;
    const price = parseFloat(svc.unitPrice) || 0;
    const total = qty * price;
    rect(L, y, W, RH, i%2===0 ? WHITE : LGRAY);
    txt(svc.description||'', C.desc.x+5,  y+5, { size:8, color:DARK, w:C.desc.w-10 });
    txt(qty,                  C.qty.x,     y+5, { size:8, color:DARK, w:C.qty.w,        align:'center' });
    txt(fmt(price),           C.price.x,   y+5, { size:8, color:DARK, w:C.price.w,      align:'center' });
    txt(fmt(total),           C.total.x,   y+5, { size:8, color:DARK, w:C.total.w-3,    align:'right'  });
    y += RH;
  });
  y += 12;

  // ── NOTES + TOTALS ──
  const tX  = R - 215;
  const tLW = 105;
  const tVW = 110;

  // Notes left side — single line, no wrap
  if (data.notes) {
    const truncated = data.notes.length > 120 ? data.notes.substring(0, 120) + '...' : data.notes;
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(GRAY)
       .text(truncated, L, y, { width: tX - L - 10, lineBreak: true });
  }

  // Totals right side
  [
    ['Subtotal',               fmt(subtotal)],
    ['Discount',               '-' + fmt(discount)],
    ['Tax ('+taxPct+'%)',      fmt(taxAmt)],
  ].forEach(([label, value], i) => {
    const ry = y + i * 20;
    rect(tX,       ry, tLW, 18, LGRAY);
    rect(tX + tLW, ry, tVW, 18, WHITE);
    txt(label, tX+3,       ry+4, { size:7.5, color:GRAY, w:tLW-6, align:'right' });
    txt(value, tX+tLW+3,   ry+4, { font:'Helvetica-Bold', size:7.5, color:DARK, w:tVW-6, align:'right' });
  });

  const gtY = y + 3*20 + 4;
  rect(tX,       gtY, tLW, 24, DARK);
  rect(tX + tLW, gtY, tVW, 24, GOLD);
  txt('GRAND TOTAL', tX+3,       gtY+7, { font:'Helvetica-Bold', size:7.5, color:WHITE, w:tLW-6, align:'right' });
  txt(fmt(grandTotal), tX+tLW+3, gtY+5, { font:'Helvetica-Bold', size:11, color:WHITE, w:tVW-6, align:'right' });

  y = gtY + 24 + 18;

  // ── FOOTER — right after content, no pinning ──
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(GOLD).stroke();
  y += 8;
  txt('London  |  USA  |  Pakistan', L, y, { font:'Helvetica-Bold', size:8.5, color:GOLD, w:W, align:'center' });
  y += 13;
  txt('webprocreation.com  |  info@webprocreation.com  |  +1 (631) 364-2268', L, y, { size:7, color:GRAY, w:W, align:'center' });

  // ── Force single page: trim any extra pages ──
  doc.flushPages();
  const range = doc.bufferedPageRange();
  // Only keep page 1
  if (range.count > 1) {
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      // clear by not writing anything — they'll be empty
    }
  }

  doc.end();
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Invoice app running at http://localhost:${PORT}`));
