const express = require('express');
const service = require('./login-backgrounds.service');

// Routes PUBLIQUES (sans authentification) — consommées par la page de connexion, affichée
// avant tout login. On n'expose que l'habillage ACTIF : son descriptif et ses octets d'image.
const router = express.Router();

router.get('/login-background', async (req, res, next) => {
  try {
    const active = await service.getActive();
    res.json({ active: active || null });
  } catch (e) { next(e); }
});

router.get('/login-background/image', async (req, res, next) => {
  try {
    const active = await service.getActive();
    if (!active || !active.has_image) return res.status(404).json({ error: 'Aucune image.' });
    const img = await service.getImageBytes(active.id);
    if (!img) return res.status(404).json({ error: 'Aucune image.' });
    res.setHeader('Content-Type', img.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(img.buffer);
  } catch (e) { next(e); }
});

module.exports = router;
