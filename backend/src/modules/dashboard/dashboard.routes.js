const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const service = require('./dashboard.service');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json(await service.getDashboard(req.user));
  } catch (e) { next(e); }
});

module.exports = router;
