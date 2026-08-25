const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const {
  requireSubModule, requireSubModuleWrite, visibleBusinessUnitIds, canWriteBusinessUnit,
} = require('../../middleware/permissions');
const { logAction } = require('../audit/audit.service');

// Référentiel Commerciaux. Un commercial INTERNE référence un employé existant (l'identité —
// matricule, nom, prénom, tél, email — provient du référentiel Employés) ; un commercial EXTERNE
// renseigne ses propres coordonnées. On expose des champs « affichés » qui prennent l'employé en
// priorité pour un interne, sinon les coordonnées propres.
const router = express.Router();
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('commerce.commerciaux');

// Identité affichée : employé (interne) sinon coordonnées propres (externe).
const BASE_SELECT = `
  SELECT c.*,
         COALESCE(e.nom, c.nom)             AS nom_affiche,
         COALESCE(e.prenom, c.prenom)       AS prenom_affiche,
         COALESCE(e.telephone, c.telephone) AS telephone_affiche,
         COALESCE(e.email, c.email)         AS email_affiche,
         e.matricule                        AS matricule,
         e.departement                      AS departement,
         bu.code AS business_unit_code, bu.nom AS business_unit_nom,
         z.nom  AS zone_nom
    FROM commerciaux c
    LEFT JOIN employees e        ON e.id = c.employee_id
    LEFT JOIN business_units bu  ON bu.id = c.business_unit_id
    LEFT JOIN zones_commerciales z ON z.id = c.zone_id`;

const EDITABLE = [
  'code', 'type', 'employee_id', 'nom', 'prenom', 'telephone', 'email', 'adresse',
  'business_unit_id', 'zone_id', 'responsable', 'date_debut', 'statut', 'observations',
];
const emptyToNull = v => (v === '' || v === undefined ? null : v);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible) { params.push(visible); where.push(`(c.business_unit_id = ANY($${params.length}) OR c.business_unit_id IS NULL)`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`c.business_unit_id = $${params.length}`); }
    if (req.query.statut) { params.push(req.query.statut); where.push(`c.statut = $${params.length}`); }
    if (req.query.type) { params.push(req.query.type); where.push(`c.type = $${params.length}`); }
    if (req.query.q) {
      params.push('%' + req.query.q.toLowerCase() + '%');
      where.push(`(LOWER(c.code) LIKE $${params.length} OR LOWER(COALESCE(e.nom, c.nom)) LIKE $${params.length}
                   OR LOWER(COALESCE(e.prenom, c.prenom)) LIKE $${params.length} OR e.matricule ILIKE $${params.length})`);
    }
    const sql = BASE_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY COALESCE(e.nom, c.nom), c.code';
    res.json(await all(sql, params));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await one(BASE_SELECT + ' WHERE c.id = $1', [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Commercial introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.code || !b.code.trim()) return res.status(400).json({ error: 'Le code est obligatoire.' });
    if (b.business_unit_id && !canWriteBusinessUnit(req.user, Number(b.business_unit_id))) {
      return res.status(403).json({ error: 'BU non autorisée.' });
    }
    if (b.type === 'externe' && (!b.nom || !b.nom.trim())) {
      return res.status(400).json({ error: 'Le nom est obligatoire pour un commercial externe.' });
    }
    if (b.type === 'interne' && !b.employee_id) {
      return res.status(400).json({ error: 'Sélectionnez un employé pour un commercial interne.' });
    }
    const vals = EDITABLE.map(c => emptyToNull(b[c]));
    const cols = EDITABLE.join(', ');
    const ph = EDITABLE.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(
      `INSERT INTO commerciaux (${cols}, created_by, updated_by) VALUES (${ph}, $${EDITABLE.length + 1}, $${EDITABLE.length + 1}) RETURNING id`,
      [...vals, req.user.id]
    );
    await logAction({ tableName: 'commerciaux', recordId: row.id, action: 'creation', userId: req.user.id, details: { code: b.code } });
    res.status(201).json(await one(BASE_SELECT + ' WHERE c.id = $1', [row.id]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce code commercial existe déjà.' });
    next(e);
  }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM commerciaux WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Commercial introuvable.' });
    const b = req.body || {};
    if (b.business_unit_id && !canWriteBusinessUnit(req.user, Number(b.business_unit_id))) {
      return res.status(403).json({ error: 'BU non autorisée.' });
    }
    const sets = [];
    const params = [];
    for (const c of EDITABLE) {
      if (c in b) { params.push(emptyToNull(b[c])); sets.push(`${c} = $${params.length}`); }
    }
    params.push(req.user.id); sets.push(`updated_by = $${params.length}`);
    sets.push('updated_at = now()');
    params.push(id);
    await run(`UPDATE commerciaux SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    await logAction({ tableName: 'commerciaux', recordId: id, action: 'modification', userId: req.user.id, details: {} });
    res.json(await one(BASE_SELECT + ' WHERE c.id = $1', [id]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce code commercial existe déjà.' });
    next(e);
  }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await run('DELETE FROM commerciaux WHERE id = $1', [id]);
    await logAction({ tableName: 'commerciaux', recordId: id, action: 'suppression', userId: req.user.id, details: {} });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Impossible : des données (versements/affectations) référencent ce commercial.' });
    next(e);
  }
});

// Fiche individuelle : identité + indicateurs du mois + classement + historiques (journalier, mensuel).
const statutDe = (taux) => (taux == null ? 'Sans objectif' : taux >= 100 ? 'Objectif dépassé' : taux >= 80 ? 'Objectif atteint' : taux >= 50 ? 'À surveiller' : 'En retard');

router.get('/:id/fiche', requireAuth, requireSubModule('commerce.commerciaux'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : new Date().toISOString().slice(0, 7);
    const [year, month] = mois.split('-').map(Number);
    const periode = `${mois}-01`;
    const joursMois = new Date(year, month, 0).getDate();
    const monthEnd = `${mois}-${String(joursMois).padStart(2, '0')}`;
    const now = new Date();
    let joursEcoules = joursMois;
    if (year === now.getFullYear() && month === now.getMonth() + 1) joursEcoules = now.getDate();
    else if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) joursEcoules = 0;

    const commercial = await one(BASE_SELECT + ' WHERE c.id = $1', [id]);
    if (!commercial) return res.status(404).json({ error: 'Commercial introuvable.' });
    const visible = visibleBusinessUnitIds(req.user);
    if (visible && commercial.business_unit_id && !visible.includes(commercial.business_unit_id)) {
      return res.status(404).json({ error: 'Commercial introuvable.' });
    }

    const affectations = await all(`
      SELECT a.*, bu.nom AS bu_nom, p.designation AS product_nom, z.nom AS zone_nom
        FROM commercial_assignments a
        LEFT JOIN business_units bu ON bu.id = a.business_unit_id
        LEFT JOIN products p ON p.id = a.product_id
        LEFT JOIN zones_commerciales z ON z.id = a.zone_id
       WHERE a.commercial_id = $1 ORDER BY a.actif DESC, a.date_debut DESC`, [id]);

    const obj = Number((await one(`SELECT COALESCE(SUM(objectif_montant),0) AS o FROM commercial_objectifs
        WHERE commercial_id = $1 AND periode = $2 AND product_id IS NULL AND actif`, [id, periode])).o);
    const rea = Number((await one(`SELECT COALESCE(SUM(total_amount),0) AS r FROM commercial_payments
        WHERE commercial_id = $1 AND status = 'valide' AND payment_date >= $2 AND payment_date <= $3`, [id, periode, monthEnd])).r);
    const taux = obj > 0 ? (rea / obj) * 100 : null;
    const moyJour = joursEcoules > 0 ? rea / joursEcoules : 0;
    const metrics = {
      mois, objectif: obj, realise: rea, ecart: rea - obj,
      taux: taux == null ? null : Math.round(taux * 10) / 10,
      objectif_jour: obj > 0 ? Math.round(obj / joursMois) : 0,
      moyenne_jour: Math.round(moyJour), projection: Math.round(moyJour * joursMois),
      statut: statutDe(taux), joursMois, joursEcoules, rang: null,
    };

    // Rang global du mois parmi les commerciaux visibles.
    const rangParams = [periode, monthEnd];
    let rangWhere = '';
    if (visible) { rangParams.push(visible); rangWhere = ' AND c.business_unit_id = ANY($3)'; }
    const board = await all(`SELECT c.id, COALESCE(r.rea, 0) AS rea FROM commerciaux c
        LEFT JOIN (SELECT commercial_id, SUM(total_amount) AS rea FROM commercial_payments
                    WHERE status = 'valide' AND payment_date >= $1 AND payment_date <= $2 GROUP BY 1) r ON r.commercial_id = c.id
       WHERE c.statut = 'actif'${rangWhere}`, rangParams);
    board.sort((a, b) => Number(b.rea) - Number(a.rea));
    const idx = board.findIndex(x => x.id === id);
    if (idx >= 0 && Number(board[idx].rea) > 0) metrics.rang = idx + 1;

    // Historique journalier (versements du mois) — moyens listés.
    const journalier = await all(`
      SELECT cp.id, TO_CHAR(cp.payment_date,'YYYY-MM-DD') AS payment_date, cp.reference, cp.total_amount, cp.status,
             STRING_AGG(pm.libelle, ', ' ORDER BY pm.ordre) AS moyens
        FROM commercial_payments cp
        LEFT JOIN commercial_payment_details d ON d.commercial_payment_id = cp.id
        LEFT JOIN payment_methods pm ON pm.id = d.payment_method_id
       WHERE cp.commercial_id = $1 AND cp.payment_date >= $2 AND cp.payment_date <= $3
       GROUP BY cp.id ORDER BY cp.payment_date DESC, cp.id DESC`, [id, periode, monthEnd]);

    // Historique mensuel de l'année (objectif, réalisé, taux, écart, rang mensuel).
    const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
    const realByMonth = await all(
      `SELECT cp.commercial_id, TO_CHAR(cp.payment_date,'YYYY-MM') AS mois, SUM(cp.total_amount) AS rea
         FROM commercial_payments cp ${visible ? 'JOIN commerciaux c ON c.id = cp.commercial_id' : ''}
        WHERE cp.status = 'valide' AND cp.payment_date >= $1 AND cp.payment_date <= $2
        ${visible ? 'AND c.business_unit_id = ANY($3)' : ''}
        GROUP BY 1, 2`, visible ? [yStart, yEnd, visible] : [yStart, yEnd]);
    const objByMonth = await all(
      `SELECT TO_CHAR(periode,'YYYY-MM') AS mois, SUM(objectif_montant) AS o FROM commercial_objectifs
        WHERE commercial_id = $1 AND product_id IS NULL AND actif AND periode >= $2 AND periode <= $3 GROUP BY 1`,
      [id, yStart, `${year}-12-01`]);
    const objMap = Object.fromEntries(objByMonth.map(r => [r.mois, Number(r.o)]));
    const perMonth = {};
    for (const row of realByMonth) { (perMonth[row.mois] ||= []).push({ id: row.commercial_id, rea: Number(row.rea) }); }
    const mensuel = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const arr = (perMonth[key] || []).sort((a, b) => b.rea - a.rea);
      const mine = arr.find(x => x.id === id);
      const r = mine ? mine.rea : 0;
      const o = objMap[key] || 0;
      if (r === 0 && o === 0) continue;
      mensuel.push({ mois: key, objectif: o, realise: r, taux: o > 0 ? Math.round((r / o) * 1000) / 10 : null, ecart: r - o, rang: mine && mine.rea > 0 ? arr.findIndex(x => x.id === id) + 1 : null });
    }

    res.json({ commercial, affectations, metrics, journalier, mensuel });
  } catch (e) { next(e); }
});

module.exports = router;
