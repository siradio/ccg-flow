const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

// Paramètres Commerce — clé/valeur, global (business_unit_id NULL) ou par BU.
// Sert au workflow optionnel et aux seuils (pleinement exploités en Phase F).
const router = express.Router();

router.get('/', requireAuth, requireSubModule('commerce.parametres'), async (req, res, next) => {
  try {
    res.json(await all('SELECT id, business_unit_id, cle, valeur FROM commerce_settings ORDER BY business_unit_id NULLS FIRST, cle'));
  } catch (e) { next(e); }
});

// Upsert d'un paramètre (global si business_unit_id absent).
router.put('/', requireAuth, requireSubModule('commerce.parametres', 'edition'), async (req, res, next) => {
  try {
    const { cle } = req.body || {};
    const buId = req.body.business_unit_id ? Number(req.body.business_unit_id) : null;
    const valeur = req.body.valeur === undefined ? null : String(req.body.valeur);
    if (!cle) return res.status(400).json({ error: 'Clé obligatoire.' });
    const existing = await one(
      'SELECT id FROM commerce_settings WHERE cle = $1 AND business_unit_id IS NOT DISTINCT FROM $2',
      [cle, buId]
    );
    if (existing) {
      await run('UPDATE commerce_settings SET valeur = $1 WHERE id = $2', [valeur, existing.id]);
    } else {
      await run('INSERT INTO commerce_settings (business_unit_id, cle, valeur) VALUES ($1, $2, $3)', [buId, cle, valeur]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
