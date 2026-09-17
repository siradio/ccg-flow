const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const audit = require('../audit/audit.service');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.activites', 'consultation');
const canEdit = requireSubModule('dsi.activites', 'edition');

const A_SELECT = `
  SELECT a.*, at.libelle AS type_libelle, TRIM(CONCAT(u.prenom,' ',u.nom)) AS technician_nom,
         ent.code AS entity_code, s.nom AS site_nom,
         e.numero_inventaire AS equipement_numero,
         TRIM(CONCAT(uc.prenom,' ',uc.nom)) AS user_concerne_nom, tk.reference AS ticket_reference
  FROM dsi_activities a
  LEFT JOIN dsi_activity_types at ON at.id = a.type_id
  LEFT JOIN users u ON u.id = a.technician_id
  LEFT JOIN entities ent ON ent.id = a.entity_id
  LEFT JOIN sites s ON s.id = a.site_id
  LEFT JOIN dsi_equipment e ON e.id = a.equipment_id
  LEFT JOIN users uc ON uc.id = a.user_concerne_id
  LEFT JOIN dsi_tickets tk ON tk.id = a.ticket_id`;

const FIELDS = ['date', 'type_id', 'technician_id', 'entity_id', 'site_id', 'description', 'duree_min',
  'equipment_id', 'user_concerne_id', 'project_id', 'ticket_id', 'resultat', 'fait_marquant', 'commentaire'];
const nn = v => (v === '' || v === undefined ? null : v);

function buildWhere(q) {
  const w = []; const p = [];
  const P = v => { p.push(v); return `$${p.length}`; };
  if (q.type_id) w.push(`a.type_id = ${P(Number(q.type_id))}`);
  if (q.technician_id) w.push(`a.technician_id = ${P(Number(q.technician_id))}`);
  if (q.entity_id) w.push(`a.entity_id = ${P(Number(q.entity_id))}`);
  if (q.equipment_id) w.push(`a.equipment_id = ${P(Number(q.equipment_id))}`);
  if (q.ticket_id) w.push(`a.ticket_id = ${P(Number(q.ticket_id))}`);
  if (q.project_id) w.push(`a.project_id = ${P(Number(q.project_id))}`);
  if (q.fait_marquant === 'true') w.push(`a.fait_marquant = true`);
  if (q.from) w.push(`a.date >= ${P(q.from)}`);
  if (q.to) w.push(`a.date <= ${P(q.to)}`);
  if (q.q) { const like = P('%' + q.q.toLowerCase() + '%'); w.push(`LOWER(a.description) LIKE ${like}`); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

router.get('/users', canView, async (req, res, next) => {
  try { res.json(await all(`SELECT id, TRIM(CONCAT(prenom,' ',nom)) AS nom FROM users WHERE actif = true ORDER BY nom, prenom`)); } catch (e) { next(e); }
});

// Synthèse par type sur une période (utilisée par le rapport mensuel plus tard).
router.get('/summary', canView, async (req, res, next) => {
  try {
    const { sql, params } = buildWhere(req.query);
    res.json(await all(`SELECT at.libelle AS type, COUNT(*)::int AS n, COALESCE(SUM(a.duree_min),0)::int AS duree
      FROM dsi_activities a LEFT JOIN dsi_activity_types at ON at.id=a.type_id ${sql}
      GROUP BY at.libelle ORDER BY n DESC`, params));
  } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try {
    const { sql, params } = buildWhere(req.query);
    const total = Number((await one(`SELECT COUNT(*)::int AS n FROM dsi_activities a ${sql}`, params)).n);
    const page = Math.max(1, Number(req.query.page) || 1), pageSize = 20;
    const p2 = [...params, pageSize, (page - 1) * pageSize];
    const items = await all(`${A_SELECT} ${sql} ORDER BY a.date DESC, a.id DESC LIMIT $${p2.length - 1} OFFSET $${p2.length}`, p2);
    res.json({ items, total, page, pageSize });
  } catch (e) { next(e); }
});

router.post('/', canEdit, async (req, res, next) => {
  try {
    if (!req.body?.description) return res.status(400).json({ error: 'Description requise.' });
    const body = { ...req.body, technician_id: req.body.technician_id || req.user.id };
    const vals = FIELDS.map(f => (f === 'fait_marquant' ? !!body[f] : nn(body[f])));
    const ph = FIELDS.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(`INSERT INTO dsi_activities (${FIELDS.join(', ')}, created_by) VALUES (${ph}, $${FIELDS.length + 1}) RETURNING *`, [...vals, req.user.id]);
    await audit.logAction({ tableName: 'dsi_activities', recordId: row.id, action: 'dsi_activity_create', userId: req.user.id, details: {} });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM dsi_activities WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const cols = FIELDS.filter(f => req.body[f] !== undefined);
    if (cols.length) {
      const vals = cols.map(c => (c === 'fait_marquant' ? !!req.body[c] : nn(req.body[c])));
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await run(`UPDATE dsi_activities SET ${setClause}, updated_at=now() WHERE id=$${cols.length + 1}`, [...vals, req.params.id]);
    }
    res.json(await one(`${A_SELECT} WHERE a.id = $1`, [req.params.id]));
  } catch (e) { next(e); }
});

router.delete('/:id', canEdit, async (req, res, next) => {
  try { await run('DELETE FROM dsi_activities WHERE id = $1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
