const express = require('express');
const { all, one } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Rapports consolidés Commerce. Un endpoint unique renvoie { title, columns, rows } selon `type`,
// pour un rendu et un export génériques côté frontend. Réalisé = versements VALIDÉS.
const router = express.Router();

const statutDe = (t) => (t == null ? 'Sans objectif' : t >= 100 ? 'Objectif dépassé' : t >= 80 ? 'Objectif atteint' : t >= 50 ? 'À surveiller' : 'En retard');
const monthBounds = (mois) => {
  const [y, m] = mois.split('-').map(Number);
  const end = new Date(y, m, 0).getDate();
  return { start: `${mois}-01`, end: `${mois}-${String(end).padStart(2, '0')}` };
};

router.get('/', requireAuth, requireSubModule('commerce.rapports'), async (req, res, next) => {
  try {
    const type = req.query.type || 'versements_commercial';
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : new Date().toISOString().slice(0, 7);
    const df = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date_from || '') ? req.query.date_from : `${mois}-01`;
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date_to || '') ? req.query.date_to : monthBounds(mois).end;

    // Filtre BU commun (visibilité + sélection) — renvoie {clause, params} à partir d'un index de départ.
    const visible = visibleBusinessUnitIds(req.user);
    const buSel = req.query.business_unit_id ? Number(req.query.business_unit_id) : null;
    const buWhere = (col, params) => {
      const parts = [];
      if (visible) { params.push(visible); parts.push(`${col} = ANY($${params.length})`); }
      if (buSel) { params.push(buSel); parts.push(`${col} = $${params.length}`); }
      return parts.length ? ' AND ' + parts.join(' AND ') : '';
    };

    // Colonnes pivot dynamiques par moyen de versement actif (pas de valeurs codées en dur).
    const methods = await all('SELECT id, code, libelle FROM payment_methods WHERE actif ORDER BY ordre, libelle');
    const pivot = methods.map(m => `SUM(CASE WHEN d.payment_method_id = ${Number(m.id)} THEN d.amount ELSE 0 END) AS m_${m.id}`).join(', ');
    const methodCols = methods.map(m => ({ key: `m_${m.id}`, label: m.libelle, type: 'number' }));

    // Agrégat pivot par dimension (commercial / BU / produit / jour).
    async function pivotBy(selectExpr, groupByExpr, labelCols, joins, orderBy, title) {
      const params = [df, dt];
      const where = `cp.status = 'valide' AND cp.payment_date >= $1 AND cp.payment_date <= $2` + buWhere('cp.business_unit_id', params);
      const rows = await all(`
        SELECT ${selectExpr}, COUNT(DISTINCT cp.id) AS nb, ${pivot}, SUM(d.amount) AS total
          FROM commercial_payments cp
          JOIN commercial_payment_details d ON d.commercial_payment_id = cp.id
          ${joins}
         WHERE ${where}
         GROUP BY ${groupByExpr}
         ORDER BY ${orderBy}`, params);
      return { title, columns: [...labelCols, { key: 'nb', label: 'Nb versements', type: 'number' }, ...methodCols, { key: 'total', label: 'Total', type: 'number' }], rows };
    }

    let out;
    if (type === 'versements_commercial') {
      out = await pivotBy(
        `c.code AS code, COALESCE(e.nom, c.nom) AS nom, COALESCE(e.prenom, c.prenom) AS prenom`,
        `c.code, COALESCE(e.nom, c.nom), COALESCE(e.prenom, c.prenom)`,
        [{ key: 'code', label: 'Code' }, { key: 'prenom', label: 'Prénom' }, { key: 'nom', label: 'Nom' }],
        `JOIN commerciaux c ON c.id = cp.commercial_id LEFT JOIN employees e ON e.id = c.employee_id`,
        'total DESC', 'Versements par commercial');
    } else if (type === 'versements_bu') {
      out = await pivotBy(`bu.nom AS bu`, `bu.nom`, [{ key: 'bu', label: 'Business Unit' }],
        `LEFT JOIN business_units bu ON bu.id = cp.business_unit_id`, 'total DESC', 'Versements par BU');
    } else if (type === 'versements_produit') {
      out = await pivotBy(`COALESCE(p.designation, '— Sans produit —') AS produit`, `COALESCE(p.designation, '— Sans produit —')`,
        [{ key: 'produit', label: 'Produit' }], `LEFT JOIN products p ON p.id = cp.product_id`, 'total DESC', 'Versements par produit');
    } else if (type === 'versements_jour') {
      out = await pivotBy(`TO_CHAR(cp.payment_date, 'YYYY-MM-DD') AS jour`, `TO_CHAR(cp.payment_date, 'YYYY-MM-DD')`,
        [{ key: 'jour', label: 'Date', type: 'date' }], '', 'jour', 'Versements journaliers');
    } else if (type === 'objectifs_realise') {
      const { start, end } = monthBounds(mois);
      const params = [start, end];
      const rows = await all(`
        SELECT c.code, COALESCE(e.nom, c.nom) AS nom, COALESCE(e.prenom, c.prenom) AS prenom, bu.nom AS bu,
               COALESCE(o.obj, 0) AS objectif, COALESCE(r.rea, 0) AS realise
          FROM commerciaux c
          LEFT JOIN employees e ON e.id = c.employee_id
          LEFT JOIN business_units bu ON bu.id = c.business_unit_id
          LEFT JOIN (SELECT commercial_id, SUM(objectif_montant) obj FROM commercial_objectifs WHERE periode = $1 AND product_id IS NULL AND actif GROUP BY 1) o ON o.commercial_id = c.id
          LEFT JOIN (SELECT commercial_id, SUM(total_amount) rea FROM commercial_payments WHERE status = 'valide' AND payment_date >= $1 AND payment_date <= $2 GROUP BY 1) r ON r.commercial_id = c.id
         WHERE c.statut = 'actif'${buWhere('c.business_unit_id', params)}
         ORDER BY realise DESC`, params);
      const mapped = rows.map(x => {
        const objectif = Number(x.objectif), realise = Number(x.realise);
        const taux = objectif > 0 ? Math.round(realise / objectif * 1000) / 10 : null;
        return { code: x.code, prenom: x.prenom, nom: x.nom, bu: x.bu, objectif, realise, ecart: realise - objectif, taux, statut: statutDe(taux) };
      });
      out = {
        title: `Objectifs vs Réalisé — ${mois}`,
        columns: [{ key: 'code', label: 'Code' }, { key: 'prenom', label: 'Prénom' }, { key: 'nom', label: 'Nom' }, { key: 'bu', label: 'BU' },
          { key: 'objectif', label: 'Objectif', type: 'number' }, { key: 'realise', label: 'Réalisé', type: 'number' },
          { key: 'ecart', label: 'Écart', type: 'number' }, { key: 'taux', label: '%', type: 'number' }, { key: 'statut', label: 'Statut' }],
        rows: mapped,
      };
    } else if (type === 'commissions') {
      const { start } = monthBounds(mois);
      const params = [start];
      const rows = await all(`
        SELECT c.code, COALESCE(e.nom, c.nom) AS nom, COALESCE(e.prenom, c.prenom) AS prenom, bu.nom AS bu,
               co.base_montant, co.taux, co.montant, co.statut
          FROM commissions co
          JOIN commerciaux c ON c.id = co.commercial_id
          LEFT JOIN employees e ON e.id = c.employee_id
          LEFT JOIN business_units bu ON bu.id = co.business_unit_id
         WHERE co.periode = $1${buWhere('co.business_unit_id', params)}
         ORDER BY co.montant DESC`, params);
      out = {
        title: `Commissions — ${mois}`,
        columns: [{ key: 'code', label: 'Code' }, { key: 'prenom', label: 'Prénom' }, { key: 'nom', label: 'Nom' }, { key: 'bu', label: 'BU' },
          { key: 'base_montant', label: 'Base (CA)', type: 'number' }, { key: 'tauxPct', label: 'Taux %' },
          { key: 'montant', label: 'Commission', type: 'number' }, { key: 'statut', label: 'Statut' }],
        rows: rows.map(r => ({ ...r, tauxPct: (Number(r.taux) * 100).toString() })),
      };
    } else if (type === 'absence') {
      const params = [df, dt];
      const rows = await all(`
        SELECT c.code, COALESCE(e.nom, c.nom) AS nom, COALESCE(e.prenom, c.prenom) AS prenom, bu.nom AS bu
          FROM commerciaux c
          LEFT JOIN employees e ON e.id = c.employee_id
          LEFT JOIN business_units bu ON bu.id = c.business_unit_id
         WHERE c.statut = 'actif'${buWhere('c.business_unit_id', params)}
           AND NOT EXISTS (SELECT 1 FROM commercial_payments cp WHERE cp.commercial_id = c.id
                            AND cp.status = 'valide' AND cp.payment_date >= $1 AND cp.payment_date <= $2)
         ORDER BY COALESCE(e.nom, c.nom), c.code`, params);
      out = { title: 'Commerciaux sans versement sur la période', columns: [{ key: 'code', label: 'Code' }, { key: 'prenom', label: 'Prénom' }, { key: 'nom', label: 'Nom' }, { key: 'bu', label: 'BU' }], rows };
    } else if (type === 'consolide') {
      const { start, end } = monthBounds(mois);
      const params = [start, end];
      const rows = await all(`
        SELECT bu.nom AS bu,
               COALESCE(o.obj, 0) AS objectif, COALESCE(r.rea, 0) AS realise
          FROM business_units bu
          LEFT JOIN (SELECT c.business_unit_id, SUM(o.objectif_montant) obj FROM commercial_objectifs o JOIN commerciaux c ON c.id = o.commercial_id WHERE o.periode = $1 AND o.product_id IS NULL AND o.actif GROUP BY 1) o ON o.business_unit_id = bu.id
          LEFT JOIN (SELECT business_unit_id, SUM(total_amount) rea FROM commercial_payments WHERE status = 'valide' AND payment_date >= $1 AND payment_date <= $2 GROUP BY 1) r ON r.business_unit_id = bu.id
         WHERE (o.obj IS NOT NULL OR r.rea IS NOT NULL)${buWhere('bu.id', params)}
         ORDER BY realise DESC`, params);
      out = {
        title: `Consolidé Direction par BU — ${mois}`,
        columns: [{ key: 'bu', label: 'Business Unit' }, { key: 'objectif', label: 'Objectif', type: 'number' },
          { key: 'realise', label: 'Réalisé', type: 'number' }, { key: 'ecart', label: 'Écart', type: 'number' }, { key: 'taux', label: '%', type: 'number' }],
        rows: rows.map(x => {
          const objectif = Number(x.objectif), realise = Number(x.realise);
          return { bu: x.bu, objectif, realise, ecart: realise - objectif, taux: objectif > 0 ? Math.round(realise / objectif * 1000) / 10 : null };
        }),
      };
    } else {
      return res.status(400).json({ error: 'Type de rapport inconnu.' });
    }

    res.json(out);
  } catch (e) { next(e); }
});

module.exports = router;
