const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const service = require('./notifications.service');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await service.listForUser(req.user.id, req.query.unread === 'true')); }
  catch (e) { next(e); }
});

router.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    await service.markRead(req.user.id, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
