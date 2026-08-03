const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const service = require('./purchase-requests.service');
const auditService = require('../audit/audit.service');
const attachmentsService = require('../attachments/attachments.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('achats'));

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { entityId, siteId, objet, justification, devise } = req.body || {};
    res.status(201).json(await service.createDraft(req.user, { entityId, siteId, objet, justification, devise }));
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { entityId, status, mine, pendingAction, page, pageSize } = req.query;
    res.json(await service.listForUser(req.user, {
      entityId, status, mine: mine === 'true', pendingAction: pendingAction === 'true',
      page: page ? Number(page) : 1, pageSize: pageSize ? Number(pageSize) : 20,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const pr = await service.getFullDetailForUser(req.user, Number(req.params.id));
    if (!pr) return res.status(404).json({ error: 'Demande introuvable.' });
    res.json(pr);
  } catch (e) { next(e); }
});

router.post('/:id/submit', requireAuth, async (req, res, next) => {
  try { res.json(await service.submit(req.user, Number(req.params.id))); }
  catch (e) { next(e); }
});

router.post('/:id/lines', requireAuth, async (req, res, next) => {
  try {
    const { productId, descriptionLibre, quantite, unite, prixUnitaireEstime } = req.body || {};
    res.status(201).json(await service.addLine(req.user, Number(req.params.id), { productId, descriptionLibre, quantite, unite, prixUnitaireEstime }));
  } catch (e) { next(e); }
});

router.put('/:id/lines/:lineId', requireAuth, async (req, res, next) => {
  try { res.json(await service.updateLine(req.user, Number(req.params.id), Number(req.params.lineId), req.body || {})); }
  catch (e) { next(e); }
});

router.delete('/:id/lines/:lineId', requireAuth, async (req, res, next) => {
  try {
    await service.deleteLine(req.user, Number(req.params.id), Number(req.params.lineId));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Mêmes clés (snake_case) que le formulaire du référentiel Fournisseurs — voir
// suppliersService.createSupplier() et frontend/.../ReferentialsIndex.jsx (config `suppliers`).
router.post('/:id/quick-supplier', requireAuth, async (req, res, next) => {
  try {
    res.status(201).json(await service.quickAddSupplier(req.user, Number(req.params.id), req.body || {}));
  } catch (e) { next(e); }
});

router.post('/:id/quote-requests', requireAuth, async (req, res, next) => {
  try {
    const { supplierIds, message } = req.body || {};
    res.status(201).json(await service.createQuoteRequest(req.user, Number(req.params.id), { supplierIds, message }));
  } catch (e) { next(e); }
});

router.post('/:id/quote-requests/:qrId/send', requireAuth, async (req, res, next) => {
  try { res.json(await service.sendQuoteRequest(req.user, Number(req.params.id), Number(req.params.qrId))); }
  catch (e) { next(e); }
});

// Envoi ciblé de la demande de devis à UN fournisseur, avec une adresse email optionnelle dans le
// corps (`email`) quand le fournisseur n'en a pas de renseignée dans le référentiel.
router.post('/:id/quote-requests/suppliers/:qrsId/send', requireAuth, async (req, res, next) => {
  try { res.json(await service.sendQuoteRequestToSupplier(req.user, Number(req.params.id), Number(req.params.qrsId), req.body && req.body.email)); }
  catch (e) { next(e); }
});

// Repli manuel quand l'envoi automatique échoue (ex. SMTP tenant bloqué) : le PDF seul, à envoyer
// soi-même depuis sa messagerie habituelle avec le texte copié depuis l'écran.
router.get('/:id/quote-requests/suppliers/:qrsId/pdf', requireAuth, async (req, res, next) => {
  try {
    const buffer = await service.getQuoteRequestSupplierPdf(req.user, Number(req.params.id), Number(req.params.qrsId));
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (e) { next(e); }
});

// upload.single('file') n'exige pas de fichier (contrairement à /:id/attachments) : le devis peut
// être saisi sans PDF joint, le fichier n'est que optionnel ici.
router.post('/:id/quotes', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const { quoteRequestSupplierId, montant, devise, notes } = req.body || {};
    res.status(201).json(await service.addQuote(req.user, Number(req.params.id), { quoteRequestSupplierId, montant, devise, notes }, req.file));
  } catch (e) { next(e); }
});

router.post('/:id/quotes/:quoteId/select', requireAuth, async (req, res, next) => {
  try { res.json(await service.selectQuote(req.user, Number(req.params.id), Number(req.params.quoteId))); }
  catch (e) { next(e); }
});

router.post('/:id/validate-step', requireAuth, async (req, res, next) => {
  try { res.json(await service.validateStep(req.user, Number(req.params.id), (req.body || {}).comment)); }
  catch (e) { next(e); }
});

router.post('/:id/reject-step', requireAuth, async (req, res, next) => {
  try { res.json(await service.rejectStep(req.user, Number(req.params.id), (req.body || {}).comment)); }
  catch (e) { next(e); }
});

router.get('/:id/history', requireAuth, async (req, res, next) => {
  try { res.json(await auditService.getHistory(Number(req.params.id))); }
  catch (e) { next(e); }
});

router.post('/:id/attachments', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis (champ "file").' });
    const attachment = await attachmentsService.uploadForPurchaseRequest(req.user, Number(req.params.id), req.file);
    res.status(201).json(attachment);
  } catch (e) { next(e); }
});

module.exports = router;
