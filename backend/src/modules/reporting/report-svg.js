// Graphiques SVG → PNG (via sharp) pour intégration dans le CORPS de l'e-mail (les clients mail
// ne rendent pas le SVG ; on envoie une image PNG inline en CID). Même palette que le PDF.
const { colorAt, short } = require('./report-chart');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p; const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * p;
}

function svgLineChart({ series, labels, width = 760, height = 320 }) {
  const padL = 64, padB = 44, padT = 16, padR = 16;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const ox = padL, oy = padT + plotH;
  const maxV = niceMax(Math.max(1, ...series.flatMap(s => s.points.map(v => Number(v) || 0))));
  const n = labels.length;
  const xAt = (i) => ox + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v) => oy - plotH * ((Number(v) || 0) / maxV);
  let s = `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;
  for (let g = 0; g <= 4; g++) {
    const v = (maxV * g) / 4, y = yAt(v);
    s += `<line x1="${ox}" y1="${y}" x2="${ox + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    s += `<text x="${ox - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#6b7280" font-family="Arial">${short(v)}</text>`;
  }
  s += `<polyline points="${ox},${padT} ${ox},${oy} ${ox + plotW},${oy}" fill="none" stroke="#9ca3af" stroke-width="1"/>`;
  const step = Math.ceil(n / 12);
  labels.forEach((lb, i) => { if (i % step === 0 || i === n - 1) s += `<text x="${xAt(i)}" y="${oy + 14}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="Arial">${esc(lb)}</text>`; });
  series.forEach((se, si) => {
    const c = colorAt(si);
    const pts = se.points.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2"/>`;
    se.points.forEach((v, i) => { s += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="2" fill="${c}"/>`; });
  });
  let lx = ox; const ly = height - 12;
  series.forEach((se, si) => {
    s += `<rect x="${lx}" y="${ly - 9}" width="9" height="9" fill="${colorAt(si)}"/>`;
    s += `<text x="${lx + 13}" y="${ly}" font-size="10" fill="#111827" font-family="Arial">${esc(se.name)}</text>`;
    lx += 13 + se.name.length * 6 + 18;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${s}</svg>`;
}

function svgBarChart({ items, width = 760, height = 300 }) {
  const padL = 64, padB = 46, padT = 16, padR = 16;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const ox = padL, oy = padT + plotH;
  const maxV = niceMax(Math.max(1, ...items.map(i => Number(i.value) || 0)));
  const yAt = (v) => oy - plotH * ((Number(v) || 0) / maxV);
  let s = `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;
  for (let g = 0; g <= 4; g++) {
    const v = (maxV * g) / 4, y = yAt(v);
    s += `<line x1="${ox}" y1="${y}" x2="${ox + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    s += `<text x="${ox - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#6b7280" font-family="Arial">${short(v)}</text>`;
  }
  s += `<polyline points="${ox},${padT} ${ox},${oy} ${ox + plotW},${oy}" fill="none" stroke="#9ca3af" stroke-width="1"/>`;
  const n = items.length || 1;
  const bw = Math.min(56, (plotW / n) * 0.6);
  items.forEach((it, i) => {
    const cx = ox + (plotW * (i + 0.5)) / n, y = yAt(it.value);
    s += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(oy - y).toFixed(1)}" fill="${colorAt(i)}"/>`;
    s += `<text x="${cx}" y="${oy + 14}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="Arial">${esc(it.label)}</text>`;
    s += `<text x="${cx}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#111827" font-family="Arial">${short(it.value)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${s}</svg>`;
}

// Rasterise en PNG. Dégradé gracieux : renvoie null si sharp échoue (le mail garde tableau + PDF).
async function toPng(svg) {
  try { const sharp = require('sharp'); return await sharp(Buffer.from(svg)).png().toBuffer(); }
  catch (e) { console.error('sharp rasterize failed:', e.message); return null; }
}
const chartLinePng = (opts) => toPng(svgLineChart(opts));
const chartBarPng = (opts) => toPng(svgBarChart(opts));

module.exports = { chartLinePng, chartBarPng, svgLineChart, svgBarChart };
