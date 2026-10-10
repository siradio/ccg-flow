const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');
const { logAction } = require('../audit/audit.service');

// Référentiel Grossistes — bénéficiaires externes des bons de commande commerciaux.
// Pas de compte CCG en V1 : CRUD simple géré par la Direction commerciale / habilités.
const router = express.Router();
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('commerce.parametres');

const BASE_SELECT = `
  SELECT g.*, bu.nom AS business_unit_nom, z.nom AS zone_nom
    FROM grossistes g
    LEFT JOIN business_units bu     ON bu.id = g.business_unit_id
    LEFT JOIN zones_commerciales z  ON z.id = g.zone_id`;

const EDITABLE = [
  'code', 'raison_sociale', 'contact_nom', 'telephone', 'email', 'adresse',
  'zone_id', 'business_unit_id', 'statut', 'date_debut', 'observations',
];
const emptyToNull = v => (v === '' || v === undefined ? null : v);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`g.business_unit_id = $${params.length}`); }
    if (req.query.zone_id) { params.push(Number(req.query.zone_id)); where.push(`g.zone_id = $${params.length}`); }
    if (req.query.statut) { params.push(req.query.statut); where.push(`g.statut = $${params.length}`); }
    if (req.query.q) {
      params.push('%' + req.query.q.toLowerCase() + '%');
      where.push(`(LOWER(g.code) LIKE $${params.length} OR LOWER(g.raison_sociale) LIKE $${params.length}
                   OR LOWER(COALESCE(g.contact_nom,'')) LIKE $${params.length})`);
    }
    const sql = BASE_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY g.raison_sociale, g.code';
    res.json(await all(sql, params));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await one(BASE_SELECT + ' WHERE g.id = $1', [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Grossiste introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.code || !b.code.trim()) return res.status(400).json({ error: 'Le code est obligatoire.' });
    if (!b.raison_sociale || !b.raison_sociale.trim()) return res.status(400).json({ error: 'La raison sociale est obligatoire.' });
    const vals = EDITABLE.map(c => emptyToNull(b[c]));
    const cols = EDITABLE.join(', ');
    const ph = EDITABLE.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(
      `INSERT INTO grossistes (${cols}, created_by, updated_by) VALUES (${ph}, $${EDITABLE.length + 1}, $${EDITABLE.length + 1}) RETURNING id`,
      [...vals, req.user.id]
    );
    await logAction({ tableName: 'grossistes', recordId: row.id, action: 'creation', userId: req.user.id, details: { code: b.code } });
    res.status(201).json(await one(BASE_SELECT + ' WHERE g.id = $1', [row.id]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce code grossiste existe déjà.' });
    next(e);
  }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT id FROM grossistes WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Grossiste introuvable.' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    for (const c of EDITABLE) {
      if (c in b) { params.push(emptyToNull(b[c])); sets.push(`${c} = $${params.length}`); }
    }
    params.push(req.user.id); sets.push(`updated_by = $${params.length}`);
    sets.push('updated_at = now()');
    params.push(id);
    await run(`UPDATE grossistes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    await logAction({ tableName: 'grossistes', recordId: id, action: 'modification', userId: req.user.id, details: {} });
    res.json(await one(BASE_SELECT + ' WHERE g.id = $1', [id]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce code grossiste existe déjà.' });
    next(e);
  }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await run('DELETE FROM grossistes WHERE id = $1', [id]);
    await logAction({ tableName: 'grossistes', recordId: id, action: 'suppression', userId: req.user.id, details: {} });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Impossible : des bons de commande référencent ce grossiste.' });
    next(e);
  }
});

module.exports = router;
