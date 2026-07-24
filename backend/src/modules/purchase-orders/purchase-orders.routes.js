const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { hasAnyRoleOnEntity } = require('../../middleware/permissions');
const repo = require('./purchase-orders.repository');
const prRepo = require('../purchase-requests/purchase-requests.repository');
const pdf = require('../../utils/pdf');

const router = express.Router();

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
    const lines = await prRepo.getLines(po.purchase_request_id);
    const buffer = await pdf.generatePurchaseOrderPdf({
      purchaseOrder: po,
      purchaseRequest: { numero: po.purchase_request_numero },
      lines,
      entityNom: po.entity_nom,
      supplierNom: po.supplier_nom,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${po.numero}.pdf"`);
    res.send(buffer);
  } catch (e) { next(e); }
});

module.exports = router;
