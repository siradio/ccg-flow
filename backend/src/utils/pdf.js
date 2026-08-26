const path = require('path');
const PDFDocument = require('pdfkit');

const BRAND_BLUE = '#1d4ed8';
const BRAND_NAVY = '#0f1b33';
const MUTED_GRAY = '#6b7280';
const LOGO_PATH = path.join(__dirname, '../assets/logo-ccg.png');

const PAGE_WIDTH = 495; // largeur utile en A4 avec des marges de 50pt de chaque côté

// Coordonnées réelles de l'entreprise — à compléter (téléphone/email/NIF) quand disponibles.
const COMPANY = {
  nom: 'CCG',
  raisonSociale: 'Comptoir Commercial Général',
  adresse: 'Sanoyah km 38, Conakry, République de Guinée',
  telephone: null,
  email: null,
  rccm: 'GN.TCC.2022.M2.13989',
  nif: null,
};

// Formatage manuel plutôt que toLocaleString('fr-FR') : Node/ICU utilise une espace fine
// insécable (U+202F) comme séparateur de milliers, un caractère absent de l'encodage WinAnsi des
// polices standard de pdfkit (Helvetica) — le rendu produisait des "/" à la place des espaces.
function money(n) {
  const [intPart, decPart] = Number(n || 0).toFixed(2).split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSpaces},${decPart}`;
}

function renderPdf(drawFn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawFn(doc);
    renderFooters(doc);
    doc.end();
  });
}

// En-tête commun (logo + identité entreprise + titre du document) — partagé par les deux documents
// pour que toute évolution de l'identité visuelle s'applique aux deux à la fois.
function renderLetterhead(doc, title, logoBuffer) {
  const top = doc.y;
  try {
    // Logo propre à l'entité s'il est configuré (Admin -> Documents), sinon le logo CCG par défaut.
    doc.image(logoBuffer || LOGO_PATH, 50, top, { fit: [60, 55] });
  } catch (e) {
    // Le logo est un plus visuel, jamais bloquant : un fichier manquant/corrompu (ou une image
    // d'entité invalide) ne doit pas empêcher la génération du document — on retombe sur le défaut.
    try { doc.image(LOGO_PATH, 50, top, { width: 55 }); } catch (_) { /* ni l'un ni l'autre : on continue sans logo */ }
  }

  const textX = 115;
  doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_NAVY).text(COMPANY.nom, textX, top);
  doc.fontSize(9).font('Helvetica').fillColor(MUTED_GRAY);
  doc.text(COMPANY.raisonSociale, textX);
  if (COMPANY.adresse) doc.text(COMPANY.adresse, textX);
  const contact = [COMPANY.telephone, COMPANY.email].filter(Boolean).join(' — ');
  if (contact) doc.text(contact, textX);
  const legal = [COMPANY.rccm && `RCCM ${COMPANY.rccm}`, COMPANY.nif && `NIF ${COMPANY.nif}`].filter(Boolean).join(' — ');
  if (legal) doc.text(legal, textX);

  doc.y = Math.max(doc.y, top + 55) + 12;
  doc.x = 50;
  doc.moveTo(50, doc.y).lineTo(50 + PAGE_WIDTH, doc.y).lineWidth(2).strokeColor(BRAND_BLUE).stroke();
  doc.moveDown(1.2);

  doc.fillColor(BRAND_NAVY).fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fillColor('black');
  doc.moveDown();
}

// Tableau des lignes, partagé par les deux documents. `showPrices` ajoute Prix unitaire/Montant —
// pertinent sur un bon de commande (prix négocié acté), pas sur une demande de devis (on demande
// justement un prix : y afficher notre estimation interne désavantagerait la négociation).
function linesTable(doc, lines, { showPrices = false } = {}) {
  const cols = showPrices
    ? [
        { key: 'designation', label: 'Désignation', width: 180 },
        { key: 'quantite', label: 'Quantité', width: 55, align: 'right' },
        { key: 'unite', label: 'Unité', width: 55 },
        { key: 'prix', label: 'Prix unitaire', width: 95, align: 'right' },
        { key: 'montant', label: 'Montant', width: 110, align: 'right' },
      ]
    : [
        { key: 'designation', label: 'Désignation', width: 300 },
        { key: 'quantite', label: 'Quantité', width: 100, align: 'right' },
        { key: 'unite', label: 'Unité', width: 95 },
      ];

  doc.moveDown();
  const headerY = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('white');
  doc.rect(50, headerY - 4, PAGE_WIDTH, 20).fill(BRAND_BLUE);
  doc.fillColor('white');
  let x = 50;
  for (const col of cols) {
    doc.text(col.label, x + 6, headerY, { width: col.width - 8, align: col.align || 'left' });
    x += col.width;
  }
  doc.y = headerY + 20;
  doc.fillColor('black').font('Helvetica').fontSize(9);

  let total = 0;
  let rowIndex = 0;
  for (const line of lines) {
    const rowY = doc.y;
    if (rowIndex % 2 === 1) {
      doc.rect(50, rowY - 3, PAGE_WIDTH, 18).fill('#f3f4f6');
      doc.fillColor('black');
    }
    const prixUnitaire = line.prix_unitaire_final ?? line.prix_unitaire_estime ?? 0;
    const montantLigne = Number(line.quantite) * Number(prixUnitaire);
    total += montantLigne;

    const values = {
      designation: line.description_libre || line.designation || '—',
      quantite: String(line.quantite),
      unite: line.unite || '',
      prix: money(prixUnitaire),
      montant: money(montantLigne),
    };
    x = 50;
    for (const col of cols) {
      doc.text(values[col.key], x + 6, rowY, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    doc.y = rowY + 18;
    rowIndex += 1;
  }
  doc.moveTo(50, doc.y).lineTo(50 + PAGE_WIDTH, doc.y).lineWidth(0.5).strokeColor('#d1d5db').stroke();
  doc.moveDown(0.5);
  // Les cellules ci-dessus positionnent le texte à des x explicites ; sans ce reset, doc.x reste
  // sur la position de la dernière cellule et fausse le calcul de largeur des textes suivants
  // (ex. "Montant total" qui se retrouvait à retourner à la ligne au milieu du nombre).
  doc.x = 50;
  return total;
}

// Bloc de signature unique + cachet, propres à l'entité (configurés en Admin -> Documents). Si les
// images ne sont pas définies, on laisse une zone vierge au-dessus du trait pour une signature
// manuscrite. Aligné à droite du document.
function renderSignatureBlock(doc, { signatureBuffer, stampBuffer, entityNom }) {
  doc.moveDown(3);
  const blockW = 240;
  const x = 50 + PAGE_WIDTH - blockW;
  const half = blockW / 2;
  let y = doc.y;

  doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND_NAVY)
    .text(`Pour ${entityNom || COMPANY.nom}`, x, y, { width: blockW, align: 'center' });

  y = doc.y + 6;
  const imgAreaH = 85;
  if (signatureBuffer) {
    try { doc.image(signatureBuffer, x + 6, y, { fit: [half - 10, imgAreaH] }); } catch (e) { /* image invalide : ignorée */ }
  }
  if (stampBuffer) {
    try { doc.image(stampBuffer, x + half + 4, y, { fit: [half - 10, imgAreaH] }); } catch (e) { /* idem */ }
  }

  y += imgAreaH + 4;
  doc.moveTo(x, y).lineTo(x + blockW, y).strokeColor('#9ca3af').lineWidth(0.5).stroke();
  doc.fontSize(8).font('Helvetica').fillColor(MUTED_GRAY).text('Signature et cachet', x, y + 3, { width: blockW, align: 'center' });
  doc.fillColor('black');
}

// Pied de page (mentions + numérotation), identique sur chaque page — posé une fois le document
// entièrement dessiné, via bufferPages, pour connaître le nombre total de pages à l'avance.
function renderFooters(doc) {
  const range = doc.bufferedPageRange();
  const legal = [COMPANY.raisonSociale, COMPANY.rccm && `RCCM ${COMPANY.rccm}`].filter(Boolean).join(' — ');
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Le pied de page s'écrit délibérément DANS la marge basse (sous la zone de contenu) : avec
    // la marge normale, pdfkit considère un texte écrit au-delà de page.maxY() comme dépassant la
    // page et ajoute automatiquement une page supplémentaire, même pour un .text() positionné en
    // coordonnées absolues — d'où deux pages blanches en trop (une par ligne de pied de page) à
    // chaque document généré. On désactive temporairement la marge basse le temps d'écrire.
    const originalBottomMargin = doc.page.margins.bottom;
    const bottom = doc.page.height - originalBottomMargin + 15;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).font('Helvetica').fillColor(MUTED_GRAY);
    doc.text(legal, 50, bottom, { width: PAGE_WIDTH, align: 'center' });
    doc.text(`Document généré automatiquement — Page ${i - range.start + 1}/${range.count}`, 50, bottom + 11, { width: PAGE_WIDTH, align: 'center' });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

async function generateQuoteRequestPdf({ purchaseRequest, lines, entityNom, supplierNom, logoBuffer }) {
  return renderPdf(doc => {
    renderLetterhead(doc, 'Demande de devis', logoBuffer);
    doc.fontSize(11).font('Helvetica').fillColor('black');
    doc.text(`Entité : ${entityNom}`);
    doc.text(`Référence demande d'achat : ${purchaseRequest.numero}`);
    doc.text(`Objet : ${purchaseRequest.objet}`);
    doc.text(`Fournisseur sollicité : ${supplierNom}`);
    doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`);
    linesTable(doc, lines, { showPrices: false });
    doc.moveDown(1.5);
    doc.text('Merci de nous faire parvenir votre meilleure offre de prix pour les articles ci-dessus.');
  });
}

async function generatePurchaseOrderPdf({ purchaseOrder, purchaseRequest, lines, entityNom, supplierNom, logoBuffer, signatureBuffer, stampBuffer }) {
  return renderPdf(doc => {
    renderLetterhead(doc, 'Bon de commande', logoBuffer);
    doc.fontSize(11).font('Helvetica').fillColor('black');
    doc.text(`Numéro : ${purchaseOrder.numero}`);
    doc.text(`Entité : ${entityNom}`);
    doc.text(`Fournisseur : ${supplierNom}`);
    doc.text(`Référence demande d'achat : ${purchaseRequest.numero}`);
    doc.text(`Date : ${new Date(purchaseOrder.generated_at).toLocaleDateString('fr-FR')}`);
    linesTable(doc, lines, { showPrices: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_NAVY)
      .text(`Montant total : ${money(purchaseOrder.montant)} ${purchaseOrder.devise}`, 50, doc.y, { width: PAGE_WIDTH, align: 'right' });
    doc.fillColor('black');
    renderSignatureBlock(doc, { signatureBuffer, stampBuffer, entityNom });
  });
}

// Petit tableau générique (en-tête bleu + lignes zébrées) pour les documents de synthèse.
function simpleTable(doc, columns, rows) {
  const startX = 50;
  const rowH = 18;
  let y = doc.y;
  const drawHeader = () => {
    doc.rect(startX, y, PAGE_WIDTH, rowH).fill(BRAND_BLUE);
    let x = startX;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('white');
    columns.forEach(c => { doc.text(c.label, x + 4, y + 5, { width: c.width - 8, align: c.align || 'left' }); x += c.width; });
    y += rowH;
  };
  drawHeader();
  doc.font('Helvetica').fontSize(9);
  rows.forEach((r, i) => {
    if (y > doc.page.height - 90) { doc.addPage(); y = 50; drawHeader(); doc.font('Helvetica').fontSize(9); }
    if (i % 2 === 1) doc.rect(startX, y, PAGE_WIDTH, rowH).fill('#f3f4f6');
    let x = startX;
    doc.fillColor('black');
    columns.forEach(c => { doc.text(String(r[c.key] ?? ''), x + 4, y + 5, { width: c.width - 8, align: c.align || 'left' }); x += c.width; });
    y += rowH;
  });
  if (!rows.length) { doc.fillColor(MUTED_GRAY).text('Aucune donnée.', startX + 4, y + 5); y += rowH; }
  doc.y = y + 8; doc.x = 50;
}

// Situation d'un commercial (fiche) — identité, indicateurs du mois, historiques mensuel et journalier.
async function generateCommercialFichePdf({ commercial, metrics, mensuel, journalier, moisLabel }) {
  return renderPdf(doc => {
    renderLetterhead(doc, 'Situation commerciale', null);
    doc.fontSize(13).font('Helvetica-Bold').fillColor(BRAND_NAVY)
      .text(`${commercial.code} — ${commercial.prenom_affiche || ''} ${commercial.nom_affiche || ''}`.trim());
    doc.fontSize(10).font('Helvetica').fillColor('black');
    doc.text(`Type : ${commercial.type === 'interne' ? 'Interne' : 'Externe'}${commercial.matricule ? '     Matricule : ' + commercial.matricule : ''}`);
    doc.text(`BU : ${commercial.business_unit_nom || '—'}     Zone : ${commercial.zone_nom || '—'}`);
    doc.text(`Période analysée : ${moisLabel}`);
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Indicateurs du mois');
    doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('black');
    doc.text(`Objectif : ${money(metrics.objectif)} GNF        Réalisé : ${money(metrics.realise)} GNF        Taux : ${metrics.taux == null ? '—' : metrics.taux + ' %'}`);
    doc.text(`Écart : ${money(metrics.ecart)} GNF        Moyenne/jour : ${money(metrics.moyenne_jour)} GNF        Projection : ${money(metrics.projection)} GNF`);
    doc.text(`Rang du mois : ${metrics.rang ? '#' + metrics.rang : '—'}        Statut : ${metrics.statut}`);
    doc.moveDown(1);

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Historique mensuel');
    doc.moveDown(0.3).fillColor('black');
    simpleTable(doc, [
      { key: 'mois', label: 'Mois', width: 70 },
      { key: 'objectif', label: 'Objectif', width: 110, align: 'right' },
      { key: 'realise', label: 'Réalisé', width: 110, align: 'right' },
      { key: 'taux', label: '%', width: 55, align: 'right' },
      { key: 'ecart', label: 'Écart', width: 110, align: 'right' },
      { key: 'rang', label: 'Rang', width: 40, align: 'right' },
    ], mensuel);
    doc.moveDown(0.6);

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Historique journalier du mois');
    doc.moveDown(0.3).fillColor('black');
    simpleTable(doc, [
      { key: 'date', label: 'Date', width: 70 },
      { key: 'moyens', label: 'Moyens', width: 195, align: 'left' },
      { key: 'total', label: 'Total', width: 120, align: 'right' },
      { key: 'statut', label: 'Statut', width: 110 },
    ], journalier);
  });
}

module.exports = {
  generateQuoteRequestPdf, generatePurchaseOrderPdf, generateCommercialFichePdf,
  // Helpers réutilisables (ex. module Reporting) :
  renderPdf, renderLetterhead, simpleTable, money,
  BRAND_BLUE, BRAND_NAVY, MUTED_GRAY, PAGE_WIDTH,
};
