const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireModule } = require('../../middleware/permissions');
const service = require('./attachments.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireModule('achats'));

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const attachment = await service.download(req.user, Number(req.params.id));
    res.setHeader('Content-Type', attachment.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    res.send(attachment.content);
  } catch (e) { next(e); }
});

module.exports = router;
