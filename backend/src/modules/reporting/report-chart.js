// Dessin de graphiques dans un PDF pdfkit — sans dépendance externe (traits/axes natifs).
const MUTED = '#6b7280';
const GRID = '#e5e7eb';
const AXIS = '#9ca3af';

// Palette pour les séries (par BU) — lisible en impression.
const PALETTE = ['#2554e0', '#128a54', '#b45309', '#7c3aed', '#dc2626', '#0891b2', '#ca8a04', '#db2777'];
const colorAt = (i) => PALETTE[i % PALETTE.length];

const short = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' Md';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + ' k';
  return String(Math.round(n));
};

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * p;
}

// Courbe multi-séries. series = [{ name, points: number[] }], labels = string[] (axe X).
function drawLineChart(doc, { series, labels, width = 495, height = 210 }) {
  const left = 50;
  const y0 = doc.y;
  const padL = 60, padB = 26, padT = 8, padR = 12;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const ox = left + padL, oy = y0 + padT + plotH;
  const allVals = series.flatMap(s => s.points.map(v => Number(v) || 0));
  const maxV = niceMax(Math.max(1, ...allVals));
  const n = labels.length;
  const xAt = (i) => ox + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v) => oy - plotH * ((Number(v) || 0) / maxV);

  doc.lineWidth(0.5).font('Helvetica').fontSize(8);
  for (let g = 0; g <= 4; g++) {
    const v = (maxV * g) / 4, yy = yAt(v);
    doc.strokeColor(GRID).moveTo(ox, yy).lineTo(ox + plotW, yy).stroke();
    doc.fillColor(MUTED).text(short(v), left, yy - 4, { width: padL - 6, align: 'right' });
  }
  doc.strokeColor(AXIS).lineWidth(1).moveTo(ox, y0 + padT).lineTo(ox, oy).lineTo(ox + plotW, oy).stroke();

  doc.fillColor(MUTED).fontSize(7);
  const stepLbl = Math.ceil(n / 12); // évite le chevauchement des libellés
  labels.forEach((lb, i) => { if (i % stepLbl === 0 || i === n - 1) doc.text(String(lb), xAt(i) - 18, oy + 4, { width: 36, align: 'center' }); });

  series.forEach((s, si) => {
    const col = colorAt(si);
    doc.strokeColor(col).lineWidth(1.5);
    s.points.forEach((v, i) => { const X = xAt(i), Y = yAt(v); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y); });
    doc.stroke();
    s.points.forEach((v, i) => { doc.circle(xAt(i), yAt(v), 1.6).fill(col); });
  });

  // Légende
  let lx = ox; const ly = y0 + height + 2;
  doc.fontSize(8).font('Helvetica');
  series.forEach((s, si) => {
    doc.rect(lx, ly + 1, 8, 8).fill(colorAt(si));
    doc.fillColor('black').text(s.name, lx + 11, ly);
    lx += 11 + doc.widthOfString(s.name) + 22;
    if (lx > left + width - 80) { lx = ox; }
  });
  doc.y = ly + 18; doc.x = left;
}

// Barres verticales. items = [{ label, value }].
function drawBarChart(doc, { items, width = 495, height = 190 }) {
  const left = 50;
  const y0 = doc.y;
  const padL = 60, padB = 40, padT = 8, padR = 12;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const ox = left + padL, oy = y0 + padT + plotH;
  const maxV = niceMax(Math.max(1, ...items.map(i => Number(i.value) || 0)));
  const yAt = (v) => oy - plotH * ((Number(v) || 0) / maxV);

  doc.lineWidth(0.5).font('Helvetica').fontSize(8);
  for (let g = 0; g <= 4; g++) {
    const v = (maxV * g) / 4, yy = yAt(v);
    doc.strokeColor(GRID).moveTo(ox, yy).lineTo(ox + plotW, yy).stroke();
    doc.fillColor(MUTED).text(short(v), left, yy - 4, { width: padL - 6, align: 'right' });
  }
  doc.strokeColor(AXIS).lineWidth(1).moveTo(ox, y0 + padT).lineTo(ox, oy).lineTo(ox + plotW, oy).stroke();

  const n = items.length || 1;
  const bw = Math.min(48, (plotW / n) * 0.6);
  items.forEach((it, i) => {
    const cx = ox + (plotW * (i + 0.5)) / n;
    const Y = yAt(it.value);
    doc.rect(cx - bw / 2, Y, bw, oy - Y).fill(colorAt(i));
    doc.fillColor(MUTED).fontSize(7).text(String(it.label), cx - 40, oy + 4, { width: 80, align: 'center' });
    doc.fillColor('black').fontSize(7).text(short(it.value), cx - 40, Y - 10, { width: 80, align: 'center' });
  });
  doc.y = y0 + height + 6; doc.x = left;
}

module.exports = { drawLineChart, drawBarChart, colorAt, PALETTE, short };
