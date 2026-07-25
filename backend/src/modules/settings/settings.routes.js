const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const service = require('./settings.service');

const router = express.Router();

// Lecture ouverte à tout utilisateur authentifié : le frontend a besoin de connaître, par
// exemple, le nombre minimum de fournisseurs à consulter avant même d'être admin.
router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await service.getAll()); }
  catch (e) { next(e); }
});

router.put('/:key', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { value } = req.body || {};
    if (value === undefined || value === null || value === '') {
      return res.status(400).json({ error: 'value requis.' });
    }
    res.json({ key: req.params.key, value: await service.setValue(req.params.key, value) });
  } catch (e) { next(e); }
});

module.exports = router;
