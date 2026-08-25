const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const {
  requireSubModuleWrite, visibleBusinessUnitIds, canWriteBusinessUnit,
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

module.exports = router;
