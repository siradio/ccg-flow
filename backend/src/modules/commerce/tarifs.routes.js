const express = require('express');
const { all, one, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');
const { logAction } = require('../audit/audit.service');

// Tarifs produit — deux catégories : Commercial et Grossiste. Journal historisé (on n'écrase
// jamais) : ajouter un tarif clôt le précédent et devient le tarif ACTIF. Un seul tarif actif par
// (produit, catégorie), garanti par l'index unique partiel (migration 095). Le prix d'une commande
// est FIGÉ à la soumission : un changement de tarif ne modifie jamais rétroactivement un bon.
const router = express.Router();
const CATEGORIES = ['commercial', 'grossiste'];
const { edit: requireEdit } = requireSubModuleWrite('commerce.parametres');

// Vue produit-centrée : chaque produit fini avec son tarif ACTIF Commercial et Grossiste.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const where = [`p.type_article = 'produit_fini'`];
    const params = [];
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`p.business_unit_id = $${params.length}`); }
    if (req.query.q) {
      params.push('%' + req.query.q.toLowerCase() + '%');
      where.push(`(LOWER(p.designation) LIKE $${params.length} OR LOWER(COALESCE(p.code,'')) LIKE $${params.length})`);
    }
    const rows = await all(`
      SELECT p.id AS product_id, p.code, p.designation, p.business_unit_id, p.unite, p.unite_vente,
             bu.nom AS business_unit_nom,
             tc.prix AS prix_commercial, TO_CHAR(tc.date_effet,'YYYY-MM-DD') AS date_effet_commercial,
             tg.prix AS prix_grossiste,  TO_CHAR(tg.date_effet,'YYYY-MM-DD') AS date_effet_grossiste
        FROM products p
        LEFT JOIN business_units bu ON bu.id = p.business_unit_id
        LEFT JOIN commande_tarifs tc ON tc.product_id = p.id AND tc.categorie_tarif = 'commercial' AND tc.actif
        LEFT JOIN commande_tarifs tg ON tg.product_id = p.id AND tg.categorie_tarif = 'grossiste'  AND tg.actif
       WHERE ${where.join(' AND ')}
       ORDER BY bu.nom NULLS LAST, p.designation`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Historique d'un produit pour une catégorie (du plus récent au plus ancien).
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const productId = Number(req.query.product_id);
    const categorie = String(req.query.categorie || '');
    if (!productId || !CATEGORIES.includes(categorie)) return res.status(400).json({ error: 'Paramètres invalides.' });
    const rows = await all(`
      SELECT t.id, t.prix, t.devise, TO_CHAR(t.date_effet,'YYYY-MM-DD') AS date_effet,
             TO_CHAR(t.date_fin,'YYYY-MM-DD') AS date_fin, t.actif, t.commentaire,
             TO_CHAR(t.created_at,'YYYY-MM-DD') AS created_at,
             TRIM(CONCAT(u.prenom,' ',u.nom)) AS created_by_nom
        FROM commande_tarifs t
        LEFT JOIN users u ON u.id = t.created_by
       WHERE t.product_id = $1 AND t.categorie_tarif = $2
       ORDER BY t.date_effet DESC, t.id DESC`, [productId, categorie]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Ajoute un tarif : clôt le précédent (date_fin = veille de la date d'effet, actif=false) puis
// insère le nouveau tarif actif. Transaction pour respecter l'unicité « un seul actif par couple ».
router.post('/', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const b = req.body || {};
    const productId = Number(b.product_id);
    const categorie = String(b.categorie_tarif || '');
    const prix = Number(b.prix);
    const dateEffet = /^\d{4}-\d{2}-\d{2}$/.test(b.date_effet || '') ? b.date_effet : new Date().toISOString().slice(0, 10);

    if (!productId) return res.status(400).json({ error: 'Produit obligatoire.' });
    if (!CATEGORIES.includes(categorie)) return res.status(400).json({ error: 'Catégorie invalide.' });
    if (!Number.isFinite(prix) || prix < 0) return res.status(400).json({ error: 'Prix invalide.' });

    const prod = await one(`SELECT id FROM products WHERE id = $1 AND type_article = 'produit_fini'`, [productId]);
    if (!prod) return res.status(400).json({ error: 'Produit fini introuvable.' });

    const result = await withTransaction(async (tx) => {
      const current = await tx.one(
        `SELECT id, TO_CHAR(date_effet,'YYYY-MM-DD') AS date_effet FROM commande_tarifs
          WHERE product_id = $1 AND categorie_tarif = $2 AND actif`, [productId, categorie]);
      if (current && dateEffet < current.date_effet) {
        const err = new Error(`La date d'effet doit être postérieure ou égale au tarif courant (${current.date_effet}).`);
        err.status = 400; throw err;
      }
      if (current) {
        // Clôt le tarif courant la veille de la nouvelle date d'effet (chevauchement évité).
        await tx.run(
          `UPDATE commande_tarifs SET actif = false, date_fin = ($1::date - INTERVAL '1 day')::date
            WHERE id = $2`, [dateEffet, current.id]);
      }
      const row = await tx.one(
        `INSERT INTO commande_tarifs (product_id, categorie_tarif, prix, date_effet, commentaire, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [productId, categorie, prix, dateEffet, b.commentaire || null, req.user.id]);
      return row.id;
    });

    await logAction({ tableName: 'commande_tarifs', recordId: result, action: 'creation', userId: req.user.id, details: { product_id: productId, categorie, prix, date_effet: dateEffet } });
    res.status(201).json({ id: result });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
