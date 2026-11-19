import { CARTE_CSS } from './carteStyles';

// Rend la carte (élément .cg-card) en image PNG, sans dépendance : la carte est sérialisée en
// XHTML dans un <foreignObject> SVG (toutes ses images sont déjà des data URI → canvas non « taint »,
// export autorisé), puis dessinée sur un canvas. Le QR (canvas vivant, non sérialisable) est
// remplacé par son image. `scale` augmente la résolution (3 = ~960×624 px pour une carte 85×55 mm).
export async function carteVersBlob(shellNode, scale = 3) {
  const card = shellNode.querySelector('.cg-card');
  if (!card) throw new Error('Carte introuvable');
  const clone = card.cloneNode(true);

  // Remplace le <canvas> du QR par une <img> (le canvas ne se sérialise pas en XHTML).
  const srcCanvas = shellNode.querySelector('canvas');
  const cloneCanvas = clone.querySelector('canvas');
  if (srcCanvas && cloneCanvas) {
    const img = document.createElement('img');
    img.setAttribute('src', srcCanvas.toDataURL('image/png'));
    img.setAttribute('width', '18mm');
    img.setAttribute('height', '18mm');
    cloneCanvas.replaceWith(img);
  }

  // Dimensions réelles de la carte : 85 × 55 mm convertis en px CSS (96 dpi).
  const w = Math.round(85 * 96 / 25.4);
  const h = Math.round(55 * 96 / 25.4);

  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">`
    + '<foreignObject x="0" y="0" width="100%" height="100%">'
    + '<div xmlns="http://www.w3.org/1999/xhtml">'
    + '<style>' + CARTE_CSS + '</style>' + xhtml
    + '</div></foreignObject></svg>';

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const image = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Échec du rendu de l'image"));
    i.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Export PNG impossible'))), 'image/png');
  });
}
