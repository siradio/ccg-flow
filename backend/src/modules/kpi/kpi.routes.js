const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireModule } = require('../../middleware/permissions');
const service = require('./kpi.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireModule('kpi'));

router.get('/achats', async (req, res, next) => {
  try { res.json(await service.getAchatsKpi()); }
  catch (e) { next(e); }
});

router.get('/rh', async (req, res, next) => {
  try { res.json(await service.getRhKpi()); }
  catch (e) { next(e); }
});

module.exports = router;
