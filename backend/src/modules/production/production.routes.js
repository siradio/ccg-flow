const express = require('express');
const { all, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Module Production — relevé de production journalière (flux). Grille rapide : par BU et par jour, une
// quantité produite par produit (produit fini). Le suivi cumule sur une période (jour/semaine/mois).
// Socle du module ; planification, ordres de fabrication, rendement… viendront ensuite.
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate } = requireSubModuleWrite('production.releve');
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
const isDate = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));

// Grille d'un jour pour une BU : produits finis + quantité produite saisie ce jour.
router.get('/grid', requireSubModule('production.releve'), async (req, res, next) => {
  try {
    const buId = Number(req.query.business_unit_id);
    const date = isDate(req.query.date) ? String(req.query.date).slice(0, 10) : null;
    if (!buId || !date) return res.status(400).json({ error: 'business_unit_id et date requis.' });
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null && !visible.includes(buId)) return res.json([]);
    res.json(await all(
      `SELECT p.id AS product_id, p.code, p.designation, p.unite,
              pe.quantite AS produit, pe.commentaire
       FROM products p
       LEFT JOIN production_entries pe ON pe.product_id = p.id AND pe.date_production = $2
       WHERE p.business_unit_id = $1 AND p.actif = true AND p.type_article IS DISTINCT FROM 'matiere_premiere'
       ORDER BY p.designation`, [buId, date]));
  } catch (e) { next(e); }
});

// Enregistrement groupé de la production du jour (upsert par produit).
router.put('/grid', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    const buId = Number(b.business_unit_id);
    const date = isDate(b.date) ? String(b.date).slice(0, 10) : null;
    if (!buId || !date) return res.status(400).json({ error: 'business_unit_id et date requis.' });
    if (!canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: 'Accès BU refusé.' });
    let saved = 0;
    for (const l of (b.lines || [])) {
      const q = num(l.quantite);
      if (q == null || Number.isNaN(q) || q < 0) continue;
      await run(
        `INSERT INTO production_entries (date_production, product_id, quantite, commentaire, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)
         ON CONFLICT (date_production, product_id)
         DO UPDATE SET quantite = EXCLUDED.quantite, commentaire = EXCLUDED.commentaire, updated_by = $5, updated_at = now()`,
        [date, Number(l.product_id), q, l.commentaire || null, req.user.id]);
      saved++;
    }
    res.json({ ok: true, saved });
  } catch (e) { next(e); }
});

// Suivi : production CUMULÉE par produit sur une période, scopée BU.
router.get('/dashboard', requireSubModule('production.suivi'), async (req, res, next) => {
  try {
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : new Date().toISOString().slice(0, 8) + '01';
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const where = ['pe.date_production BETWEEN $1 AND $2', "p.type_article IS DISTINCT FROM 'matiere_premiere'"];
    const params = [from, to];
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`p.business_unit_id = $${params.length}`); }
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); params.push(visible); where.push(`p.business_unit_id = ANY($${params.length})`); }
    res.json(await all(
      `SELECT p.id AS product_id, p.code, p.designation, p.unite, p.business_unit_id, bu.nom AS bu_nom,
              SUM(pe.quantite) AS total_produit, COUNT(*)::int AS jours_saisis,
              MAX(pe.date_production) AS dernier_jour
       FROM production_entries pe
       JOIN products p ON p.id = pe.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.id, p.code, p.designation, p.unite, p.business_unit_id, bu.nom
       ORDER BY total_produit DESC`, params));
  } catch (e) { next(e); }
});

// Évolution de la production d'un produit (pour un graphique).
router.get('/series', requireSubModule('production.suivi'), async (req, res, next) => {
  try {
    if (!req.query.product_id) return res.status(400).json({ error: 'product_id requis.' });
    res.json(await all(
      `SELECT date_production, quantite FROM production_entries WHERE product_id = $1 ORDER BY date_production ASC LIMIT 180`,
      [Number(req.query.product_id)]));
  } catch (e) { next(e); }
});

module.exports = router;
