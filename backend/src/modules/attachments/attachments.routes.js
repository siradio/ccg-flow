const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { setSafeDownloadHeaders } = require('../../utils/safeDownload');
const service = require('./attachments.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('achats'));

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const attachment = await service.download(req.user, Number(req.params.id));
    // Durcissement anti-XSS : type sûr + nosniff (un .html/.svg uploadé ne s'exécutera pas).
    setSafeDownloadHeaders(res, attachment.mimetype, attachment.filename);
    res.send(attachment.content);
  } catch (e) { next(e); }
});

module.exports = router;
