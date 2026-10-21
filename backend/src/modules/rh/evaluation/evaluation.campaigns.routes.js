const express = require('express');
const { all, one, run } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { isSuperAdmin } = require('../../../middleware/permissions');
const { logAction } = require('../../audit/audit.service');

// Campagnes d'évaluation — ouvertes et clôturées par les RH. Les managers les consultent pour
// rattacher les fiches de leur équipe.
const router = express.Router();
router.use(requireAuth);
const isRh = (u) => isSuperAdmin(u) || (u.roles || []).some(r => r.role_code === 'rh');
function requireRh(req, res, next) { if (!isRh(req.user)) return res.status(403).json({ error: 'Réservé aux RH.' }); next(); }

router.get('/', async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.statut) { params.push(req.query.statut); where.push(`c.statut = $${params.length}`); }
    const rows = await all(`
      SELECT c.*, t.nom AS template_defaut_nom,
             (SELECT COUNT(*)::int FROM rh_evaluations e WHERE e.campaign_id = c.id) AS nb_fiches
        FROM rh_eval_campaigns c LEFT JOIN rh_eval_templates t ON t.id = c.template_defaut_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY c.annee DESC, c.id DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRh, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.libelle || !b.libelle.trim()) return res.status(400).json({ error: 'Le libellé est obligatoire.' });
    if (!b.annee) return res.status(400).json({ error: "L'année est obligatoire." });
    const row = await one(
      `INSERT INTO rh_eval_campaigns (libelle, annee, date_debut, date_fin, echelle_max, template_defaut_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.libelle.trim(), Number(b.annee), b.date_debut || null, b.date_fin || null, Number(b.echelle_max) || 5, b.template_defaut_id || null, req.user.id]);
    await logAction({ tableName: 'rh_eval_campaigns', recordId: row.id, action: 'creation', userId: req.user.id, details: { libelle: b.libelle } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireRh, async (req, res, next) => {
  try {
    const id = Number(req.params.id); const b = req.body || {};
    const ex = await one('SELECT * FROM rh_eval_campaigns WHERE id = $1', [id]);
    if (!ex) return res.status(404).json({ error: 'Campagne introuvable.' });
    await run(
      `UPDATE rh_eval_campaigns SET libelle=$1, annee=$2, date_debut=$3, date_fin=$4, echelle_max=$5, template_defaut_id=$6, statut=$7 WHERE id=$8`,
      [(b.libelle && b.libelle.trim()) || ex.libelle, Number(b.annee) || ex.annee, b.date_debut ?? ex.date_debut,
       b.date_fin ?? ex.date_fin, Number(b.echelle_max) || ex.echelle_max, b.template_defaut_id ?? ex.template_defaut_id,
       (b.statut === 'ouverte' || b.statut === 'close') ? b.statut : ex.statut, id]);
    res.json(await one('SELECT * FROM rh_eval_campaigns WHERE id = $1', [id]));
  } catch (e) { next(e); }
});

module.exports = router;
