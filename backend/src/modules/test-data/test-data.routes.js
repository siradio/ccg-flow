const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const service = require('./test-data.service');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

router.post('/load', async (req, res, next) => {
  try {
    res.json(await service.loadSampleData(req.user));
  } catch (e) { next(e); }
});

router.post('/clear', async (req, res, next) => {
  try {
    await service.clearTestData();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
