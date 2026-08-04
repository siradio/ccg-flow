const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { hasAnyRoleOnEntity, requireSubModule } = require('../../middleware/permissions');
const repo = require('./purchase-orders.repository');
const prRepo = require('../purchase-requests/purchase-requests.repository');
const pdf = require('../../utils/pdf');
const mailer = require('../../utils/mailer');
const audit = require('../audit/audit.service');
const branding = require('../referentials/entity-branding.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('achats'));

async function loadAuthorized(req) {
  const po = await repo.getById(Number(req.params.id));
  if (!po) return null;
  if (!hasAnyRoleOnEntity(req.user, po.entity_id)) {
    const err = new Error("Vous n'avez pas accès à ce bon de commande.");
    err.status = 403;
    throw err;
  }
  return po;
}

// Génère le PDF du bon de commande (partagé par l'aperçu et l'envoi par email). Utilise le branding
// de l'entité (logo, signature, cachet) configuré en Admin -> Documents.
async function buildPoPdf(po) {
  const lines = await prRepo.getLines(po.purchase_request_id);
  const images = await branding.getEntityImages(po.entity_id);
  return pdf.generatePurchaseOrderPdf({
    purchaseOrder: po,
    purchaseRequest: { numero: po.purchase_request_numero },
    lines,
    entityNom: po.entity_nom,
    supplierNom: po.supplier_nom,
    logoBuffer: images.logo,
    signatureBuffer: images.signature,
    stampBuffer: images.stamp,
  });
}

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const po = await loadAuthorized(req);
    if (!po) return res.status(404).json({ error: 'Bon de commande introuvable.' });
    res.json(po);
  } catch (e) { next(e); }
});

router.get('/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const po = await loadAuthorized(req);
    if (!po) return res.status(404).json({ error: 'Bon de commande introuvable.' });
    const buffer = await buildPoPdf(po);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${po.numero}.pdf"`);
    res.send(buffer);
  } catch (e) { next(e); }
});

// Envoi du bon de commande au fournisseur par email, PDF joint. Adresse : celle du fournisseur, ou
// une adresse fournie (`email`) s'il n'en a pas de renseignée. Réservé aux rôles pouvant agir sur
// l'entité (déjà garanti par loadAuthorized + le sous-module achats).
router.post('/:id/send', requireAuth, async (req, res, next) => {
  try {
    const po = await loadAuthorized(req);
    if (!po) return res.status(404).json({ error: 'Bon de commande introuvable.' });
    const to = ((req.body && req.body.email) || '').trim() || po.supplier_email;
    if (!to) return res.status(400).json({ error: "Ce fournisseur n'a pas d'adresse email : saisissez-en une pour l'envoi." });

    const buffer = await buildPoPdf(po);
    const bodyText = `Bonjour,\n\nVeuillez trouver ci-joint notre bon de commande ${po.numero}.\n\nCordialement,`;
    try {
      await mailer.sendMail({
        to,
        subject: `Bon de commande — ${po.numero}`,
        text: bodyText,
        html: mailer.renderMailTemplate({
          title: 'Bon de commande',
          bodyHtml: `<p>Bonjour,</p><p>Veuillez trouver ci-joint notre bon de commande <strong>${po.numero}</strong>.</p><p>Cordialement,</p>`,
        }),
        attachments: [{ filename: `${po.numero}.pdf`, content: buffer }],
      });
    } catch (e) {
      console.error(`Échec envoi bon de commande ${po.numero} à ${to} :`, e.message);
      return res.status(502).json({ error: "Échec de l'envoi — le serveur de messagerie a refusé le message." });
    }
    await audit.logAction({ tableName: 'purchase_orders', recordId: po.id, purchaseRequestId: po.purchase_request_id, action: 'bon_commande_envoye', userId: req.user.id, details: { to } });
    res.json({ sent: true, to });
  } catch (e) { next(e); }
});

module.exports = router;
