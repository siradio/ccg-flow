const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const {
  requireSubModule, requireSubModuleWrite, visibleBusinessUnitIds, canWriteBusinessUnit,
} = require('../../middleware/permissions');

// Objectifs commerciaux — saisis par mois × commercial (produit optionnel, non géré dans la grille).
// La grille liste tous les commerciaux visibles avec leur objectif du mois (0 si absent).
const router = express.Router();
const { edit: requireEdit } = requireSubModuleWrite('commerce.objectifs');

const firstOfMonth = (mois) => (mois && /^\d{4}-\d{2}$/.test(mois) ? mois + '-01' : null);

router.get('/grid', requireAuth, requireSubModule('commerce.objectifs'), async (req, res, next) => {
  try {
    const periode = firstOfMonth(req.query.mois);
    if (!periode) return res.status(400).json({ error: 'Mois invalide (AAAA-MM).' });
    const where = ['c.statut = $2'];
    const params = [periode, 'actif'];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible) { params.push(visible); where.push(`c.business_unit_id = ANY($${params.length})`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`c.business_unit_id = $${params.length}`); }
    const rows = await all(`
      SELECT c.id AS commercial_id, c.code, c.business_unit_id,
             COALESCE(e.nom, c.nom) AS nom_affiche, COALESCE(e.prenom, c.prenom) AS prenom_affiche,
             bu.nom AS business_unit_nom,
             COALESCE(o.objectif_montant, 0) AS objectif_montant
        FROM commerciaux c
        LEFT JOIN employees e       ON e.id = c.employee_id
        LEFT JOIN business_units bu ON bu.id = c.business_unit_id
        LEFT JOIN commercial_objectifs o
               ON o.commercial_id = c.id AND o.periode = $1 AND o.product_id IS NULL
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(e.nom, c.nom), c.code`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/grid', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const periode = firstOfMonth((req.body || {}).mois);
    if (!periode) return res.status(400).json({ error: 'Mois invalide (AAAA-MM).' });
    for (const l of (req.body.lines || [])) {
      const buId = l.business_unit_id ? Number(l.business_unit_id) : null;
      if (buId && !canWriteBusinessUnit(req.user, buId)) continue; // ignore silencieusement hors périmètre
      const montant = Number(l.objectif_montant) || 0;
      await run(`
        INSERT INTO commercial_objectifs (periode, commercial_id, business_unit_id, objectif_montant, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (periode, commercial_id) WHERE product_id IS NULL
        DO UPDATE SET objectif_montant = EXCLUDED.objectif_montant, business_unit_id = EXCLUDED.business_unit_id,
                      updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [periode, Number(l.commercial_id), buId, montant, req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
