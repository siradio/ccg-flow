const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Refonte Stock — « Relevé du jour » (produits finis). Grille rapide remplie chaque matin par les
// gestionnaires (remplace le partage WhatsApp). Réutilise la table stock_entries (1 relevé par
// produit et par jour, upsert). Chaque relevé est comparé au stock THÉORIQUE du grand livre → écart,
// pour un suivi Direction. Produits concernés : produits finis (hors matières premières).
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate } = requireSubModuleWrite('stock.releve_jour');
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
const isDate = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));

// Grille d'un jour pour une BU : tous les produits finis + relevé saisi + théorique + écart.
router.get('/grid', requireSubModule('stock.releve_jour'), async (req, res, next) => {
  try {
    const buId = Number(req.query.business_unit_id);
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(req.query.date || '')) ? String(req.query.date).slice(0, 10) : null;
    if (!buId || !date) return res.status(400).json({ error: 'business_unit_id et date requis.' });
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null && !visible.includes(buId)) return res.json([]);
    const rows = await all(
      `SELECT p.id AS product_id, p.code, p.designation, p.unite,
              se.quantite AS releve, se.commentaire,
              COALESCE(bal.qty, 0) AS theorique
       FROM products p
       LEFT JOIN stock_entries se ON se.product_id = p.id AND se.date_stock = $2
       LEFT JOIN (SELECT product_id, SUM(stock_actuel) AS qty FROM v_stock_balances GROUP BY product_id) bal ON bal.product_id = p.id
       WHERE p.business_unit_id = $1 AND p.actif = true AND p.type_article IS DISTINCT FROM 'matiere_premiere'
       ORDER BY p.designation`, [buId, date]);
    res.json(rows.map(r => ({
      ...r,
      ecart: r.releve == null ? null : Number(r.releve) - Number(r.theorique),
    })));
  } catch (e) { next(e); }
});

// Enregistrement groupé des relevés du jour (upsert par produit).
router.put('/grid', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    const buId = Number(b.business_unit_id);
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(b.date || '')) ? String(b.date).slice(0, 10) : null;
    if (!buId || !date) return res.status(400).json({ error: 'business_unit_id et date requis.' });
    if (!canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: 'Accès BU refusé.' });
    let saved = 0;
    for (const l of (b.lines || [])) {
      const q = num(l.quantite);
      if (q == null || Number.isNaN(q)) continue;
      await run(
        `INSERT INTO stock_entries (date_stock, product_id, quantite, commentaire, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)
         ON CONFLICT (date_stock, product_id)
         DO UPDATE SET quantite = EXCLUDED.quantite, commentaire = EXCLUDED.commentaire, updated_by = $5, updated_at = now()`,
        [date, Number(l.product_id), q, l.commentaire || null, req.user.id]);
      saved++;
    }
    res.json({ ok: true, saved });
  } catch (e) { next(e); }
});

// Évolution des relevés d'un produit (pour un graphique).
router.get('/series', requireSubModule('stock.releve_jour'), async (req, res, next) => {
  try {
    if (!req.query.product_id) return res.status(400).json({ error: 'product_id requis.' });
    res.json(await all(
      `SELECT date_stock, quantite FROM stock_entries WHERE product_id = $1 ORDER BY date_stock ASC LIMIT 180`,
      [Number(req.query.product_id)]));
  } catch (e) { next(e); }
});

// Évolution agrégée par période (jour/semaine/mois) : chaque point = dernier relevé de la période
// (le stock est un niveau). product_id optionnel → total de la BU (somme des derniers relevés par
// produit et par bucket). Sert au graphique d'évolution du Suivi Direction.
router.get('/evolution', requireSubModule('stock.releve_jour'), async (req, res, next) => {
  try {
    const unit = ({ jour: 'day', semaine: 'week', mois: 'month' })[req.query.granularity] || 'week';
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : null;
    if (!from) return res.status(400).json({ error: 'date_from requis.' });
    const where = ['se.date_stock BETWEEN $1 AND $2', "p.type_article IS DISTINCT FROM 'matiere_premiere'", 'p.actif = true'];
    const params = [from, to];
    if (req.query.product_id) { params.push(Number(req.query.product_id)); where.push(`se.product_id = $${params.length}`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`p.business_unit_id = $${params.length}`); }
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); params.push(visible); where.push(`p.business_unit_id = ANY($${params.length})`); }
    res.json(await all(
      `WITH lpb AS (
         SELECT DISTINCT ON (se.product_id, date_trunc('${unit}', se.date_stock))
                se.product_id, date_trunc('${unit}', se.date_stock) AS bucket, se.quantite
         FROM stock_entries se JOIN products p ON p.id = se.product_id
         WHERE ${where.join(' AND ')}
         ORDER BY se.product_id, date_trunc('${unit}', se.date_stock), se.date_stock DESC
       )
       SELECT bucket, SUM(quantite)::float AS valeur FROM lpb GROUP BY bucket ORDER BY bucket`, params));
  } catch (e) { next(e); }
});

// Tableau de bord Direction : dernier relevé par produit (≤ date) par BU + total + écart théorique.
router.get('/dashboard', requireSubModule('stock.releve_jour'), async (req, res, next) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(req.query.date || '')) ? String(req.query.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const where = ['se.date_stock <= $1', "p.type_article IS DISTINCT FROM 'matiere_premiere'", 'p.actif = true'];
    const params = [date];
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`p.business_unit_id = $${params.length}`); }
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); params.push(visible); where.push(`p.business_unit_id = ANY($${params.length})`); }
    const rows = await all(
      `SELECT DISTINCT ON (se.product_id) se.product_id, se.date_stock, se.quantite AS releve,
              p.code, p.designation, p.business_unit_id, bu.nom AS bu_nom,
              COALESCE(bal.qty, 0) AS theorique
       FROM stock_entries se
       JOIN products p ON p.id = se.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       LEFT JOIN (SELECT product_id, SUM(stock_actuel) AS qty FROM v_stock_balances GROUP BY product_id) bal ON bal.product_id = se.product_id
       WHERE ${where.join(' AND ')}
       ORDER BY se.product_id, se.date_stock DESC`, params);
    res.json(rows
      .map(r => ({ ...r, ecart: Number(r.releve) - Number(r.theorique) }))
      .sort((a, b) => (a.bu_nom || '').localeCompare(b.bu_nom || '') || (a.designation || '').localeCompare(b.designation || '')));
  } catch (e) { next(e); }
});

module.exports = router;
