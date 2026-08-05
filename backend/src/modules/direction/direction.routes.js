const express = require('express');
const { all, one } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Tableau de bord Direction (vue exécutive DG). Agrège en un appel : stock produits finis du jour,
// production de la veille, logistique, achats (ventes à venir). Scoping BU sur stock/production.
const router = express.Router();
router.use(requireAuth);

router.get('/dashboard', requireSubModule('direction'), async (req, res, next) => {
  try {
    const visible = visibleBusinessUnitIds(req.user);
    // Clause + param de scope BU réutilisable (produit p). $1 = tableau d'ids ou null.
    const buScope = visible !== null ? 'AND p.business_unit_id = ANY($1)' : '';
    const P = visible !== null ? [visible] : [];

    // ---- STOCK : valeur par BU, ruptures/alertes, relevés du jour ----
    const balCte = `SELECT product_id, SUM(stock_actuel) AS qty FROM v_stock_balances GROUP BY product_id`;
    const stockParBu = await all(
      `WITH bal AS (${balCte})
       SELECT bu.nom AS bu_nom, COALESCE(SUM(bal.qty),0)::float AS quantite,
              COALESCE(SUM(bal.qty * COALESCE(p.cout_moyen_pondere, p.cout_standard, p.prix_suggere_gnf, 0)),0)::float AS valeur
       FROM bal JOIN products p ON p.id = bal.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       WHERE p.actif = true ${buScope}
       GROUP BY bu.nom ORDER BY valeur DESC NULLS LAST`, P);
    const stockStatuts = await one(
      `WITH bal AS (${balCte})
       SELECT COUNT(*) FILTER (WHERE bal.qty <= 0)::int AS rupture,
              COUNT(*) FILTER (WHERE bal.qty > 0 AND p.seuil_alerte_stock IS NOT NULL AND bal.qty < p.seuil_alerte_stock)::int AS alerte,
              COUNT(*)::int AS nb
       FROM bal JOIN products p ON p.id = bal.product_id WHERE p.actif = true ${buScope}`, P);
    const releves = await one(
      `SELECT COUNT(*)::int AS nb, COALESCE(SUM(se.quantite),0)::float AS total
       FROM stock_entries se JOIN products p ON p.id = se.product_id
       WHERE se.date_stock = CURRENT_DATE AND p.type_article IS DISTINCT FROM 'matiere_premiere' ${buScope}`, P);
    const valeurTotale = stockParBu.reduce((s, r) => s + Number(r.valeur), 0);

    // ---- PRODUCTION : veille, avant-veille (delta), série 7 jours ----
    const prodHierParBu = await all(
      `SELECT bu.nom AS bu_nom, COALESCE(SUM(pe.quantite),0)::float AS total
       FROM production_entries pe JOIN products p ON p.id = pe.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       WHERE pe.date_production = CURRENT_DATE - 1 ${buScope}
       GROUP BY bu.nom ORDER BY total DESC`, P);
    const prodHier = prodHierParBu.reduce((s, r) => s + Number(r.total), 0);
    const prodAvantHier = Number((await one(
      `SELECT COALESCE(SUM(pe.quantite),0)::float AS total FROM production_entries pe JOIN products p ON p.id = pe.product_id
       WHERE pe.date_production = CURRENT_DATE - 2 ${buScope}`, P)).total);
    const prodSerie = await all(
      `SELECT pe.date_production AS jour, COALESCE(SUM(pe.quantite),0)::float AS total
       FROM production_entries pe JOIN products p ON p.id = pe.product_id
       WHERE pe.date_production >= CURRENT_DATE - 7 ${buScope}
       GROUP BY pe.date_production ORDER BY pe.date_production`, P);

    // ---- DÉTAIL PAR PRODUIT (le DG veut tout sur un écran) ----
    // Stock : dernier relevé par produit + théorique (grand livre) + écart.
    const stockProduits = (await all(
      `SELECT DISTINCT ON (se.product_id) se.product_id, se.quantite AS releve, se.date_stock,
              p.code, p.designation, bu.nom AS bu_nom, COALESCE(bal.qty, 0) AS theorique
       FROM stock_entries se JOIN products p ON p.id = se.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       LEFT JOIN (SELECT product_id, SUM(stock_actuel) AS qty FROM v_stock_balances GROUP BY product_id) bal ON bal.product_id = se.product_id
       WHERE se.date_stock <= CURRENT_DATE AND p.type_article IS DISTINCT FROM 'matiere_premiere' ${buScope}
       ORDER BY se.product_id, se.date_stock DESC`, P))
      .map(r => ({ ...r, ecart: Number(r.releve) - Number(r.theorique) }))
      .sort((a, b) => (a.bu_nom || '').localeCompare(b.bu_nom || '') || (a.designation || '').localeCompare(b.designation || ''));
    // Production : production de la veille par produit.
    const prodProduits = await all(
      `SELECT p.code, p.designation, bu.nom AS bu_nom, COALESCE(SUM(pe.quantite),0)::float AS total
       FROM production_entries pe JOIN products p ON p.id = pe.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       WHERE pe.date_production = CURRENT_DATE - 1 ${buScope}
       GROUP BY p.code, p.designation, bu.nom ORDER BY total DESC`, P);

    // ---- ÉVOLUTIONS (12 semaines) pour affichage direct sur le dashboard (le DG ne navigue pas) ----
    const stockEvo = await all(
      `WITH lpb AS (
         SELECT DISTINCT ON (se.product_id, date_trunc('week', se.date_stock))
                se.product_id, date_trunc('week', se.date_stock) AS bucket, se.quantite
         FROM stock_entries se JOIN products p ON p.id = se.product_id
         WHERE se.date_stock >= CURRENT_DATE - 84 AND p.type_article IS DISTINCT FROM 'matiere_premiere' ${buScope}
         ORDER BY se.product_id, date_trunc('week', se.date_stock), se.date_stock DESC
       )
       SELECT bucket, SUM(quantite)::float AS valeur FROM lpb GROUP BY bucket ORDER BY bucket`, P);
    const prodEvo = await all(
      `SELECT date_trunc('week', pe.date_production) AS bucket, SUM(pe.quantite)::float AS valeur
       FROM production_entries pe JOIN products p ON p.id = pe.product_id
       WHERE pe.date_production >= CURRENT_DATE - 84 ${buScope}
       GROUP BY bucket ORDER BY bucket`, P);

    // ---- LOGISTIQUE (global) ----
    const logi = await one(
      `SELECT
        (SELECT COUNT(*) FROM vehicles)::int AS veh_total,
        (SELECT COUNT(*) FROM vehicles WHERE statut = 'Disponible')::int AS veh_dispo,
        (SELECT COUNT(*) FROM vehicles WHERE statut = 'En mission')::int AS veh_mission,
        (SELECT COUNT(*) FROM vehicles WHERE statut = 'Maintenance')::int AS veh_maint,
        (SELECT COUNT(*) FROM missions WHERE date_fin IS NULL)::int AS missions_actives,
        (SELECT COUNT(*) FROM pannes WHERE statut IN ('Déclarée','En réparation'))::int AS pannes_ouvertes,
        (SELECT COUNT(*) FROM accidents WHERE statut IN ('Déclaré','En cours'))::int AS accidents_ouverts`);

    // ---- ACHATS (global) ----
    const achatsRows = await all(
      `SELECT status, COUNT(*)::int AS c, COALESCE(SUM(montant_final),0)::float AS mf
       FROM purchase_requests GROUP BY status`);
    const parStatut = Object.fromEntries(achatsRows.map(r => [r.status, r.c]));
    const enCours = achatsRows.filter(r => !['brouillon', 'bon_commande_genere', 'rejetee', 'annulee'].includes(r.status)).reduce((s, r) => s + r.c, 0);
    const bcGeneres = parStatut['bon_commande_genere'] || 0;
    const montantEngage = achatsRows.filter(r => r.status === 'bon_commande_genere').reduce((s, r) => s + Number(r.mf), 0);

    // ---- RH (global) ----
    const rhTotals = await one(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE statut = 'actif')::int AS actifs,
              COUNT(*) FILTER (WHERE statut = 'inactif')::int AS inactifs,
              COUNT(*) FILTER (WHERE statut = 'sorti')::int AS sortis
       FROM employees`);
    const rhParBu = await all(
      `SELECT COALESCE(bu.nom, 'Sans BU') AS bu_nom, COUNT(*)::int AS c
       FROM employees e LEFT JOIN business_units bu ON bu.id = e.business_unit_id
       WHERE e.statut = 'actif' GROUP BY bu.nom ORDER BY c DESC`);

    res.json({
      rh: { ...rhTotals, parBu: rhParBu },
      stock: {
        valeurTotale, parBu: stockParBu,
        rupture: stockStatuts.rupture, alerte: stockStatuts.alerte, nbProduits: stockStatuts.nb,
        relevesDuJour: { nb: releves.nb, total: releves.total }, evolution: stockEvo, produits: stockProduits,
      },
      production: {
        hier: prodHier, avantHier: prodAvantHier, parBu: prodHierParBu, serie7j: prodSerie, evolution: prodEvo, produits: prodProduits,
      },
      ventes: null, // module Ventes à venir
      logistique: logi,
      achats: { parStatut, enCours, bcGeneres, montantEngage },
    });
  } catch (e) { next(e); }
});

// Évolution paramétrable par rubrique (jour/semaine/mois/personnalisé) pour les onglets du dashboard.
// rubrique : stock (quantité relevée), production (quantité produite), rh (embauches).
router.get('/evolution', requireSubModule('direction'), async (req, res, next) => {
  try {
    const rub = req.query.rubrique;
    const unit = ({ jour: 'day', semaine: 'week', mois: 'month' })[req.query.granularity] || 'week';
    const isDate = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : null;
    if (!from) return res.status(400).json({ error: 'date_from requis.' });

    if (rub === 'rh') {
      return res.json(await all(
        `SELECT date_trunc('${unit}', date_embauche) AS bucket, COUNT(*)::int AS valeur
         FROM employees WHERE date_embauche BETWEEN $1 AND $2
         GROUP BY bucket ORDER BY bucket`, [from, to]));
    }

    const visible = visibleBusinessUnitIds(req.user);
    const params = [from, to];
    let buScope = '';
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); buScope += ` AND p.business_unit_id = $${params.length}`; }
    if (visible !== null) { if (!visible.length) return res.json([]); params.push(visible); buScope += ` AND p.business_unit_id = ANY($${params.length})`; }

    if (rub === 'stock') {
      return res.json(await all(
        `WITH lpb AS (
           SELECT DISTINCT ON (se.product_id, date_trunc('${unit}', se.date_stock))
                  se.product_id, date_trunc('${unit}', se.date_stock) AS bucket, se.quantite
           FROM stock_entries se JOIN products p ON p.id = se.product_id
           WHERE se.date_stock BETWEEN $1 AND $2 AND p.type_article IS DISTINCT FROM 'matiere_premiere' ${buScope}
           ORDER BY se.product_id, date_trunc('${unit}', se.date_stock), se.date_stock DESC
         )
         SELECT bucket, SUM(quantite)::float AS valeur FROM lpb GROUP BY bucket ORDER BY bucket`, params));
    }
    if (rub === 'production') {
      return res.json(await all(
        `SELECT date_trunc('${unit}', pe.date_production) AS bucket, SUM(pe.quantite)::float AS valeur
         FROM production_entries pe JOIN products p ON p.id = pe.product_id
         WHERE pe.date_production BETWEEN $1 AND $2 ${buScope}
         GROUP BY bucket ORDER BY bucket`, params));
    }
    return res.status(400).json({ error: 'rubrique invalide (stock | production | rh).' });
  } catch (e) { next(e); }
});

module.exports = router;
