// Module QHSE — Lot 3. Routes de la libération des lots. Lecture gatée sur `qhse.liberation` ;
// la décision (qui modifie le statut qualité du lot) exige le niveau edition (habilitation).
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.liberation.service');

const router = express.Router();
const SUB = 'qhse.liberation';
const { edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/lots', requireRead, async (req, res, next) => {
  try { res.json(await service.listLots(req.query.q || '', req.query.product_id || null)); } catch (e) { next(e); }
});
router.get('/lots/:id', requireRead, async (req, res, next) => {
  try {
    const l = await service.getLotDetail(Number(req.params.id));
    if (!l) return res.status(404).json({ error: 'Introuvable.' });
    res.json(l);
  } catch (e) { next(e); }
});
router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listReleases()); } catch (e) { next(e); }
});
router.post('/', requireEdit, async (req, res, next) => {
  try { res.status(201).json(await service.createRelease(req.user, req.body || {})); } catch (e) { next(e); }
});

module.exports = router;
