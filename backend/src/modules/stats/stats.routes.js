const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireUserAdmin } = require('../../middleware/permissions');
const service = require('./stats.service');

const router = express.Router();

// Statistiques d'utilisation réservées aux administrateurs de comptes (super_admin ou support_it),
// comme la page Utilisateurs — ce sont des données de gestion des comptes.
router.use(requireAuth);

router.get('/logins', requireUserAdmin, async (req, res, next) => {
  try { res.json(await service.getLoginStats()); }
  catch (e) { next(e); }
});

router.get('/logins/daily', requireUserAdmin, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 365);
    res.json(await service.getDailyLogins(days));
  } catch (e) { next(e); }
});

module.exports = router;
