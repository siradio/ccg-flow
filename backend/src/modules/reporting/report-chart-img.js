// Graphiques rastérisés (PNG) pour le CORPS de l'e-mail — les clients mail ne rendent pas le SVG.
// Rendu via @napi-rs/canvas avec une police TTF EMBARQUÉE (DejaVu Sans) : indépendant des polices
// système, donc identique en dev (Windows) et en prod (conteneur Linux Azure, sans police système).
const { colorAt, short } = require('./report-chart');

// Chargement DÉFENSIF du moteur natif : si @napi-rs/canvas ne se charge pas (binaire absent
// pour la plateforme), on désactive seulement l'image du mail — jamais de crash de la route.
let createCanvas = null;
try {
  const canvas = require('@napi-rs/canvas');
  createCanvas = canvas.createCanvas;
  canvas.GlobalFonts.registerFromPath(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'), 'CCGChart');
} catch (e) { console.error('canvas indisponible, images de rapport désactivées:', e.message); }
const FONT = 'CCGChart';
const f = (size, weight) => `${weight ? weight + ' ' : ''}${size}px ${FONT}`;

const SCALE = 2; // rendu 2× pour un PNG net (l'e-mail l'affiche en max-width:100%)
const AXIS = '#9ca3af', GRID = '#e5e7eb', MUTED = '#6b7280', INK = '#111827';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p, s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * p;
}
function newCanvas(w, h) {
  const cv = createCanvas(w * SCALE, h * SCALE);
  const ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  return { cv, ctx };
}
function ellipsize(ctx, s, maxW) {
  s = String(s);
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

// Courbe multi-séries (production par BU).
function lineChart({ series, labels, width = 760, height = 340 }) {
  const padL = 58, padR = 18, padT = 18, legendH = 34, padB = 30 + legendH;
  const { cv, ctx } = newCanvas(width, height);
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const ox = padL, oy = padT + plotH;
  const maxV = niceMax(Math.max(1, ...series.flatMap(s => s.points.map(v => Number(v) || 0))));
  const n = labels.length;
  const xAt = i => ox + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = v => oy - plotH * ((Number(v) || 0) / maxV);

  // grille + graduations Y
  ctx.font = f(10); ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const v = (maxV * g) / 4, y = yAt(v);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, y + 0.5); ctx.lineTo(ox + plotW, y + 0.5); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.fillText(short(v), ox - 8, y + 3);
  }
  // axes
  ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox + 0.5, padT); ctx.lineTo(ox + 0.5, oy + 0.5); ctx.lineTo(ox + plotW, oy + 0.5); ctx.stroke();
  // labels X (sous-échantillonnés)
  ctx.fillStyle = MUTED; ctx.font = f(9); ctx.textAlign = 'center';
  const step = Math.ceil(n / 12);
  labels.forEach((lb, i) => { if (i % step === 0 || i === n - 1) ctx.fillText(String(lb), xAt(i), oy + 14); });
  // séries
  series.forEach((se, si) => {
    const c = colorAt(si);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    se.points.forEach((v, i) => { const x = xAt(i), y = yAt(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = c;
    se.points.forEach((v, i) => { ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 2.2, 0, Math.PI * 2); ctx.fill(); });
  });
  // légende (peut passer sur 2 lignes)
  ctx.font = f(10); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let lx = ox, ly = oy + 30;
  series.forEach((se, si) => {
    const w = 13 + ctx.measureText(se.name).width + 18;
    if (lx + w > ox + plotW && lx > ox) { lx = ox; ly += 16; }
    ctx.fillStyle = colorAt(si); ctx.fillRect(lx, ly - 5, 10, 10);
    ctx.fillStyle = INK; ctx.fillText(se.name, lx + 14, ly);
    lx += w;
  });
  return cv.toBuffer('image/png');
}

// Histogramme (stock par BU, achats par statut).
function barChart({ items, width = 760, height = 320 }) {
  const padL = 58, padR = 18, padT = 22, padB = 44;
  const { cv, ctx } = newCanvas(width, height);
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const ox = padL, oy = padT + plotH;
  const maxV = niceMax(Math.max(1, ...items.map(i => Number(i.value) || 0)));
  const yAt = v => oy - plotH * ((Number(v) || 0) / maxV);

  ctx.font = f(10); ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const v = (maxV * g) / 4, y = yAt(v);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, y + 0.5); ctx.lineTo(ox + plotW, y + 0.5); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.fillText(short(v), ox - 8, y + 3);
  }
  ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox + 0.5, padT); ctx.lineTo(ox + 0.5, oy + 0.5); ctx.lineTo(ox + plotW, oy + 0.5); ctx.stroke();

  const n = items.length || 1;
  const slot = plotW / n, bw = Math.min(56, slot * 0.6);
  items.forEach((it, i) => {
    const cx = ox + slot * (i + 0.5), y = yAt(it.value);
    ctx.fillStyle = colorAt(i);
    ctx.fillRect(cx - bw / 2, y, bw, oy - y);
    ctx.fillStyle = INK; ctx.font = f(9); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(short(it.value), cx, y - 5);
    ctx.fillStyle = MUTED;
    ctx.fillText(ellipsize(ctx, it.label, slot - 4), cx, oy + 14);
  });
  return cv.toBuffer('image/png');
}

// Signatures async (await conservé côté générateurs) ; renvoie null si le rendu échoue → mail sans image.
const chartLinePng = async (opts) => { if (!createCanvas) return null; try { return lineChart(opts); } catch (e) { console.error('lineChart failed:', e.message); return null; } };
const chartBarPng = async (opts) => { if (!createCanvas) return null; try { return barChart(opts); } catch (e) { console.error('barChart failed:', e.message); return null; } };

module.exports = { chartLinePng, chartBarPng };
