const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite, canWriteBusinessUnit } = require('../../middleware/permissions');

// Affectations commerciales (historisées) : commercial × BU × produit × zone, avec période.
// L'historique est conservé — les versements passés gardent leur BU d'origine (jamais recalculée).
const router = express.Router();
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('commerce.commerciaux');

const BASE_SELECT = `
  SELECT a.*, bu.code AS business_unit_code, bu.nom AS business_unit_nom,
         p.designation AS product_nom, z.nom AS zone_nom
    FROM commercial_assignments a
    LEFT JOIN business_units bu    ON bu.id = a.business_unit_id
    LEFT JOIN products p           ON p.id = a.product_id
    LEFT JOIN zones_commerciales z ON z.id = a.zone_id`;

const EDITABLE = ['commercial_id', 'business_unit_id', 'product_id', 'zone_id', 'date_debut', 'date_fin', 'actif'];
const emptyToNull = v => (v === '' || v === undefined ? null : v);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.commercial_id) { params.push(Number(req.query.commercial_id)); where.push(`a.commercial_id = $${params.length}`); }
    const sql = BASE_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY a.actif DESC, a.date_debut DESC';
    res.json(await all(sql, params));
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.commercial_id || !b.business_unit_id) return res.status(400).json({ error: 'Commercial et BU obligatoires.' });
    if (!canWriteBusinessUnit(req.user, Number(b.business_unit_id))) return res.status(403).json({ error: 'BU non autorisée.' });
    const vals = EDITABLE.map(c => emptyToNull(b[c]));
    const ph = EDITABLE.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(`INSERT INTO commercial_assignments (${EDITABLE.join(', ')}) VALUES (${ph}) RETURNING id`, vals);
    res.status(201).json(await one(BASE_SELECT + ' WHERE a.id = $1', [row.id]));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT id FROM commercial_assignments WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Affectation introuvable.' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    for (const c of EDITABLE) { if (c in b) { params.push(emptyToNull(b[c])); sets.push(`${c} = $${params.length}`); } }
    if (!sets.length) return res.json(await one(BASE_SELECT + ' WHERE a.id = $1', [id]));
    params.push(id);
    await run(`UPDATE commercial_assignments SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    res.json(await one(BASE_SELECT + ' WHERE a.id = $1', [id]));
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await run('DELETE FROM commercial_assignments WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
