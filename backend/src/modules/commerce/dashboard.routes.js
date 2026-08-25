const express = require('express');
const { all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Tableau de bord Commerce : objectif vs réalisé du mois, par commercial, avec classement.
// Réalisé = somme des versements VALIDÉS du mois. Les indicateurs dérivés (taux, projection,
// objectif/jour, moyenne/jour, statut) sont calculés ici — jamais stockés.
const router = express.Router();

// Seuils de statut (configurables ultérieurement via commerce_settings).
function statut(taux) {
  if (taux == null) return 'Sans objectif';
  if (taux >= 100) return 'Objectif dépassé';
  if (taux >= 80) return 'Objectif atteint';
  if (taux >= 50) return 'À surveiller';
  return 'En retard';
}

router.get('/', requireAuth, requireSubModule('commerce.tableau_bord'), async (req, res, next) => {
  try {
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : null;
    if (!mois) return res.status(400).json({ error: 'Mois invalide (AAAA-MM).' });
    const [year, month] = mois.split('-').map(Number);
    const periode = `${mois}-01`;
    const joursMois = new Date(year, month, 0).getDate();
    const monthEnd = `${mois}-${String(joursMois).padStart(2, '0')}`;

    // Jours écoulés : mois en cours → jour du jour ; mois passé → tous ; mois futur → 0.
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    let joursEcoules = joursMois;
    if (year === curY && month === curM) joursEcoules = now.getDate();
    else if (year > curY || (year === curY && month > curM)) joursEcoules = 0;

    const where = ["c.statut = 'actif'"];
    const params = [periode, monthEnd];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible) { params.push(visible); where.push(`c.business_unit_id = ANY($${params.length})`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`c.business_unit_id = $${params.length}`); }
    if (req.query.commercial_id) { params.push(Number(req.query.commercial_id)); where.push(`c.id = $${params.length}`); }

    const rows = await all(`
      SELECT c.id, c.code, c.business_unit_id, bu.nom AS business_unit_nom,
             COALESCE(e.nom, c.nom) AS nom, COALESCE(e.prenom, c.prenom) AS prenom,
             COALESCE(o.obj, 0) AS objectif, COALESCE(r.rea, 0) AS realise
        FROM commerciaux c
        LEFT JOIN employees e       ON e.id = c.employee_id
        LEFT JOIN business_units bu ON bu.id = c.business_unit_id
        LEFT JOIN (SELECT commercial_id, SUM(objectif_montant) AS obj FROM commercial_objectifs
                    WHERE periode = $1 AND product_id IS NULL AND actif GROUP BY commercial_id) o ON o.commercial_id = c.id
        LEFT JOIN (SELECT commercial_id, SUM(total_amount) AS rea FROM commercial_payments
                    WHERE status = 'valide' AND payment_date >= $1 AND payment_date <= $2 GROUP BY commercial_id) r ON r.commercial_id = c.id
       WHERE ${where.join(' AND ')}`, params);

    const lignes = rows.map(x => {
      const objectif = Number(x.objectif);
      const realise = Number(x.realise);
      const taux = objectif > 0 ? (realise / objectif) * 100 : null;
      const objJour = objectif > 0 ? objectif / joursMois : 0;
      const moyJour = joursEcoules > 0 ? realise / joursEcoules : 0;
      const projection = moyJour * joursMois;
      return {
        commercial_id: x.id, code: x.code, nom: x.nom, prenom: x.prenom,
        business_unit_id: x.business_unit_id, business_unit_nom: x.business_unit_nom,
        objectif, realise, ecart: realise - objectif,
        taux: taux == null ? null : Math.round(taux * 10) / 10,
        objectif_jour: Math.round(objJour), moyenne_jour: Math.round(moyJour),
        projection: Math.round(projection), statut: statut(taux),
      };
    });
    // Classement par réalisé décroissant (rang seulement pour ceux qui ont un objectif ou du réalisé).
    lignes.sort((a, b) => b.realise - a.realise);
    lignes.forEach((l, i) => { l.rang = l.realise > 0 || l.objectif > 0 ? i + 1 : null; });

    const objectifTotal = lignes.reduce((s, l) => s + l.objectif, 0);
    const realiseTotal = lignes.reduce((s, l) => s + l.realise, 0);
    const projectionTotal = lignes.reduce((s, l) => s + l.projection, 0);
    res.json({
      mois, joursMois, joursEcoules,
      kpi: {
        objectif_total: objectifTotal,
        realise_total: realiseTotal,
        ecart: realiseTotal - objectifTotal,
        taux: objectifTotal > 0 ? Math.round((realiseTotal / objectifTotal) * 1000) / 10 : null,
        projection_total: projectionTotal,
        reste: Math.max(0, objectifTotal - realiseTotal),
        commerciaux_actifs: lignes.length,
      },
      lignes,
    });
  } catch (e) { next(e); }
});

module.exports = router;
