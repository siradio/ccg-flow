const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const service = require('./accounting.service');
const poRepo = require('../purchase-orders/purchase-orders.repository');
const prRepo = require('../purchase-requests/purchase-requests.repository');
const pdf = require('../../utils/pdf');
const branding = require('../referentials/entity-branding.service');

const router = express.Router();
router.use(requireAuth);

// ─── Comptabilité > Traitement > Achats (BDC fournisseur) ──────────────────────
const canView = requireSubModule('comptabilite.achats', 'consultation');
const canProcess = requireSubModule('comptabilite.achats', 'edition');

function parseFilters(q) {
  return {
    from: q.from || null, to: q.to || null,
    status: q.status || null,
    mine: q.mine === 'true', unassigned: q.unassigned === 'true',
    assignedTo: q.assigned_to || null,
    entityId: q.entity_id || null, supplierId: q.supplier_id || null, devise: q.devise || null,
    numero: q.numero || null, daNumero: q.da_numero || null, q: q.q || null,
    page: q.page ? Number(q.page) : 1, pageSize: q.pageSize ? Number(q.pageSize) : 20,
  };
}

// Indicateurs de la file (déclaré AVANT '/:id' pour ne pas être capturé comme un id).
router.get('/purchase-orders/stats', canView, async (req, res, next) => {
  try { res.json(await service.stats(req.user, parseFilters(req.query))); }
  catch (e) { next(e); }
});

router.get('/purchase-orders', canView, async (req, res, next) => {
  try { res.json(await service.listPurchaseOrders(req.user, parseFilters(req.query))); }
  catch (e) { next(e); }
});

router.get('/purchase-orders/:id', canView, async (req, res, next) => {
  try { res.json(await service.getPurchaseOrder(req.user, Number(req.params.id))); }
  catch (e) { next(e); }
});

// PDF du bon de commande (le document métier réel), servi sous le droit comptabilité pour que
// l'agent comptable puisse le consulter sans nécessiter le module Achats.
router.get('/purchase-orders/:id/pdf', canView, async (req, res, next) => {
  try {
    const po = await poRepo.getById(Number(req.params.id));
    if (!po) return res.status(404).json({ error: 'Bon de commande introuvable.' });
    const lines = await prRepo.getLines(po.purchase_request_id);
    const images = await branding.getEntityImages(po.entity_id);
    const buf = await pdf.generatePurchaseOrderPdf({
      purchaseOrder: po, purchaseRequest: { numero: po.purchase_request_numero }, lines,
      entityNom: po.entity_nom, entityCode: po.entity_code, businessUnitNom: po.business_unit_nom,
      supplierNom: po.supplier_nom, logoBuffer: images.logo, signatureBuffer: images.signature, stampBuffer: images.stamp,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="BC_${po.numero}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

// Prise en charge (ouverture = prise en charge). Nécessite le niveau « edition ».
router.post('/purchase-orders/:id/take', canProcess, async (req, res, next) => {
  try { res.json(await service.takeOver(req.user, Number(req.params.id))); }
  catch (e) { next(e); }
});

// Marquer comme traité (uniquement l'agent en charge).
router.post('/purchase-orders/:id/complete', canProcess, async (req, res, next) => {
  try { res.json(await service.complete(req.user, Number(req.params.id))); }
  catch (e) { next(e); }
});

// ─── Comptabilité > Traitement > Bons de commande (commercial) ─────────────────
// Aucune source de BDC commerciaux dans CCG Flow pour l'instant (flux encore hors application) :
// on renvoie une liste vide propre, sans donnée fictive. Le futur module Commercial branchera ici.
router.get('/sales-orders', requireSubModule('comptabilite.bdc', 'consultation'), async (req, res) => {
  res.json({ items: [], total: 0, page: 1, pageSize: 20 });
});

module.exports = router;
