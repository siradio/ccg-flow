const PDFDocument = require('pdfkit');

function renderPdf(drawFn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawFn(doc);
    doc.end();
  });
}

function linesTable(doc, lines) {
  doc.moveDown();
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Désignation', 50, doc.y, { continued: true, width: 260 });
  doc.text('Quantité', 310, doc.y, { continued: true, width: 80 });
  doc.text('Unité', 390, doc.y);
  doc.moveDown(0.5);
  doc.font('Helvetica');
  for (const line of lines) {
    doc.text(line.description_libre || line.designation || '—', 50, doc.y, { continued: true, width: 260 });
    doc.text(String(line.quantite), 310, doc.y, { continued: true, width: 80 });
    doc.text(line.unite || '', 390, doc.y);
  }
}

async function generateQuoteRequestPdf({ purchaseRequest, lines, entityNom, supplierNom }) {
  return renderPdf(doc => {
    doc.fontSize(16).font('Helvetica-Bold').text('Demande de devis', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica');
    doc.text(`Entité : ${entityNom}`);
    doc.text(`Référence demande d'achat : ${purchaseRequest.numero}`);
    doc.text(`Objet : ${purchaseRequest.objet}`);
    doc.text(`Fournisseur sollicité : ${supplierNom}`);
    doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`);
    linesTable(doc, lines);
    doc.moveDown(2);
    doc.text('Merci de nous faire parvenir votre meilleure offre de prix pour les articles ci-dessus.');
  });
}

async function generatePurchaseOrderPdf({ purchaseOrder, purchaseRequest, lines, entityNom, supplierNom }) {
  return renderPdf(doc => {
    doc.fontSize(16).font('Helvetica-Bold').text('Bon de commande', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica');
    doc.text(`Numéro : ${purchaseOrder.numero}`);
    doc.text(`Entité : ${entityNom}`);
    doc.text(`Fournisseur : ${supplierNom}`);
    doc.text(`Référence demande d'achat : ${purchaseRequest.numero}`);
    doc.text(`Date : ${new Date(purchaseOrder.generated_at).toLocaleDateString('fr-FR')}`);
    linesTable(doc, lines);
    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Bold').text(`Montant total : ${purchaseOrder.montant} ${purchaseOrder.devise}`);
  });
}

module.exports = { generateQuoteRequestPdf, generatePurchaseOrderPdf };
