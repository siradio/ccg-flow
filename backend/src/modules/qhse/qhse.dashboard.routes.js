// Module QHSE — Lot 4. Route du tableau de bord (lecture seule, gatée sur `qhse.dashboard`).
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const service = require('./qhse.dashboard.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireSubModule('qhse.dashboard'), async (req, res, next) => {
  try { res.json(await service.getDashboard()); } catch (e) { next(e); }
});

module.exports = router;
