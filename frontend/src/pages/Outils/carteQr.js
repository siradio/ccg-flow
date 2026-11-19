import qrcode from '../../vendor/qrcode-generator';

const QR_DARK = '#0F2C4C';

// Corrige la casse d'un nom/prénom (« SIRADIO » → « Siradio », noms composés respectés).
export const cap = s => (s || '').toLocaleLowerCase('fr')
  .replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toLocaleUpperCase('fr'));

const escV = s => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// Fiche vCard 3.0 : un scan du QR enregistre le contact directement dans le téléphone.
export function vcard(d) {
  const L = ['BEGIN:VCARD', 'VERSION:3.0'];
  L.push('N:' + escV(d.nom) + ';' + escV(d.prenom) + ';;;');
  L.push('FN:' + escV((d.prenom + ' ' + d.nom).trim()));
  if (d.org) L.push('ORG:' + escV(d.org));
  if (d.fonction) L.push('TITLE:' + escV(d.fonction));
  if (d.tel) L.push('TEL;TYPE=WORK,VOICE:' + d.tel);
  if (d.mobile) L.push('TEL;TYPE=CELL:' + d.mobile);
  if (d.email) L.push('EMAIL;TYPE=WORK:' + d.email);
  if (d.site) { const u = d.site.replace(/^https?:\/\//i, ''); L.push('URL:https://' + u); }
  if (d.adresse) L.push('ADR;TYPE=WORK:;;' + escV(d.adresse) + ';;;;');
  L.push('END:VCARD');
  return L.join('\n');
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Rendu « design » du QR (points + yeux arrondis), pastille logo centrale optionnelle. Porté
// fidèlement du générateur d'origine.
export function drawQR(canvas, text, px, opt) {
  opt = opt || {};
  const qr = qrcode(0, opt.ec || 'M');
  qr.addData(unescape(encodeURIComponent(text)), 'Byte'); // UTF-8 safe
  qr.make();
  const n = qr.getModuleCount(), m = opt.quiet || 3, total = n + m * 2;
  const cell = Math.max(3, Math.round(px / total)), dim = cell * total;
  canvas.width = dim; canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, dim, dim);
  const fin = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  ctx.fillStyle = QR_DARK;
  if (opt.style === 'doux') {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || fin(r, c)) continue;
      rr(ctx, (c + m) * cell, (r + m) * cell, cell, cell, cell * 0.3); ctx.fill();
    }
  } else {
    const rad = cell * 0.44;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || fin(r, c)) continue;
      ctx.beginPath();
      ctx.arc((c + m + 0.5) * cell, (r + m + 0.5) * cell, rad, 0, 6.2832); ctx.fill();
    }
  }
  const eye = (er, ec) => {
    const x = (ec + m) * cell, y = (er + m) * cell;
    ctx.fillStyle = QR_DARK; rr(ctx, x, y, 7 * cell, 7 * cell, cell * 2.2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; rr(ctx, x + cell, y + cell, 5 * cell, 5 * cell, cell * 1.6); ctx.fill();
    ctx.fillStyle = QR_DARK; rr(ctx, x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell, cell * 1.05); ctx.fill();
  };
  eye(0, 0); eye(0, n - 7); eye(n - 7, 0);

  if (opt.logo && opt.logo.complete && opt.logo.naturalWidth) {
    const lw = dim * 0.235, lh = lw * opt.logo.naturalHeight / opt.logo.naturalWidth;
    const pad = dim * 0.028, tw = lw + pad * 2, th = lh + pad * 2;
    const tx = (dim - tw) / 2, ty = (dim - th) / 2;
    ctx.fillStyle = '#FFFFFF'; rr(ctx, tx, ty, tw, th, dim * 0.035); ctx.fill();
    ctx.strokeStyle = '#F4B41A'; ctx.lineWidth = Math.max(2, dim * 0.006);
    rr(ctx, tx, ty, tw, th, dim * 0.035); ctx.stroke();
    ctx.drawImage(opt.logo, tx + pad, ty + pad, lw, lh);
  }
}

// Ajoute sous le QR téléchargé la même légende que la carte (nom), sous la zone de silence.
export function legender(qr, nomComplet) {
  const dim = qr.width, bandeau = Math.round(dim * 0.145);
  const out = document.createElement('canvas');
  out.width = dim; out.height = dim + bandeau;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qr, 0, 0);
  const police = "'Segoe UI', system-ui, Arial, sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#6B7A8D';
  ctx.font = '700 ' + Math.round(dim * 0.030) + 'px ' + police;
  ctx.fillText("Scannez pour m'enregistrer", dim / 2, dim + Math.round(bandeau * 0.33));
  const pn = nomComplet || 'Prénom Nom';
  let taille = Math.round(dim * 0.055);
  const large = dim * 0.88;
  ctx.fillStyle = '#0F2C4C';
  do { ctx.font = '800 ' + taille + 'px ' + police; taille -= 2; }
  while (ctx.measureText(pn).width > large && taille > Math.round(dim * 0.028));
  ctx.fillText(pn, dim / 2, dim + Math.round(bandeau * 0.80));
  return out;
}
