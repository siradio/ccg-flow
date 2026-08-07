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
              pe.quantite AS produit, pe.commentaire,
              NULLIF(TRIM(CONCAT(u.prenom, ' ', u.nom)), '') AS saisi_par,
              pe.updated_at AS saisi_le
       FROM products p
       LEFT JOIN production_entries pe ON pe.product_id = p.id AND pe.date_production = $2
       LEFT JOIN users u ON u.id = pe.updated_by
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
              MAX(pe.date_production) AS dernier_jour,
              la.saisi_par
       FROM production_entries pe
       JOIN products p ON p.id = pe.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(CONCAT(u.prenom, ' ', u.nom)), '') AS saisi_par
         FROM production_entries pe2 JOIN users u ON u.id = pe2.updated_by
         WHERE pe2.product_id = p.id AND pe2.date_production BETWEEN $1 AND $2
         ORDER BY pe2.date_production DESC, pe2.updated_at DESC NULLS LAST
         LIMIT 1
       ) la ON true
       WHERE ${where.join(' AND ')}
       GROUP BY p.id, p.code, p.designation, p.unite, p.business_unit_id, bu.nom, la.saisi_par
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

// Évolution de la production par période (jour/semaine/mois) : SOMME produite par bucket (la
// production est un flux). product_id optionnel → total de la BU. Pour le graphique d'évolution.
router.get('/evolution', requireSubModule('production.suivi'), async (req, res, next) => {
  try {
    const unit = ({ jour: 'day', semaine: 'week', mois: 'month' })[req.query.granularity] || 'semaine';
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : null;
    if (!from) return res.status(400).json({ error: 'date_from requis.' });
    const where = ['pe.date_production BETWEEN $1 AND $2', "p.type_article IS DISTINCT FROM 'matiere_premiere'", 'p.actif = true'];
    const params = [from, to];
    if (req.query.product_id) { params.push(Number(req.query.product_id)); where.push(`pe.product_id = $${params.length}`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`p.business_unit_id = $${params.length}`); }
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); params.push(visible); where.push(`p.business_unit_id = ANY($${params.length})`); }
    res.json(await all(
      `SELECT date_trunc('${unit}', pe.date_production) AS bucket, SUM(pe.quantite)::float AS valeur
       FROM production_entries pe JOIN products p ON p.id = pe.product_id
       WHERE ${where.join(' AND ')}
       GROUP BY bucket ORDER BY bucket`, params));
  } catch (e) { next(e); }
});

module.exports = router;
