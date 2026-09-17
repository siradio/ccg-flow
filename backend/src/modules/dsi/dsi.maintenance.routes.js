const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const audit = require('../audit/audit.service');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.maintenance', 'consultation');
const canEdit = requireSubModule('dsi.maintenance', 'edition');

const M_SELECT = `
  SELECT m.*, mt.libelle AS type_libelle, e.numero_inventaire AS equipement_numero,
         e.designation AS equipement_designation,
         TRIM(CONCAT(u.prenom,' ',u.nom)) AS technician_nom
  FROM dsi_maintenance m
  LEFT JOIN dsi_maintenance_types mt ON mt.id = m.type_id
  LEFT JOIN dsi_equipment e ON e.id = m.equipment_id
  LEFT JOIN users u ON u.id = m.technician_id`;

const FIELDS = ['equipment_id', 'type_id', 'probleme', 'diagnostic', 'intervention', 'technician_id',
  'prestataire', 'date_debut', 'date_fin', 'cout', 'pieces_remplacees', 'resultat', 'next_date', 'statut', 'commentaire'];
const nn = v => (v === '' || v === undefined ? null : v);

function buildWhere(q) {
  const w = []; const p = [];
  const P = v => { p.push(v); return `$${p.length}`; };
  if (q.statut) w.push(`m.statut = ${P(q.statut)}`);
  if (q.equipment_id) w.push(`m.equipment_id = ${P(Number(q.equipment_id))}`);
  if (q.technician_id) w.push(`m.technician_id = ${P(Number(q.technician_id))}`);
  if (q.type_id) w.push(`m.type_id = ${P(Number(q.type_id))}`);
  if (q.overdue === 'true') w.push(`m.statut = 'planifiee' AND m.date_debut < CURRENT_DATE`);
  if (q.upcoming === 'true') w.push(`m.statut = 'planifiee' AND m.date_debut >= CURRENT_DATE`);
  if (q.q) { const like = P('%' + q.q.toLowerCase() + '%'); w.push(`(LOWER(COALESCE(m.probleme,'')) LIKE ${like} OR LOWER(COALESCE(e.numero_inventaire,'')) LIKE ${like})`); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

router.get('/stats', canView, async (req, res, next) => {
  try {
    res.json(await one(
      `SELECT COUNT(*) FILTER (WHERE statut='planifiee')::int AS planifiees,
              COUNT(*) FILTER (WHERE statut='en_cours')::int AS en_cours,
              COUNT(*) FILTER (WHERE statut='terminee')::int AS terminees,
              COUNT(*) FILTER (WHERE statut='planifiee' AND date_debut < CURRENT_DATE)::int AS en_retard,
              COUNT(*) FILTER (WHERE statut='planifiee' AND date_debut >= CURRENT_DATE)::int AS a_venir,
              COALESCE(SUM(cout),0) AS cout_total
       FROM dsi_maintenance`));
  } catch (e) { next(e); }
});

router.get('/users', canView, async (req, res, next) => {
  try { res.json(await all(`SELECT u.id, TRIM(CONCAT(u.prenom,' ',u.nom)) AS nom, TRIM(CONCAT(u.prenom,' ',u.nom,' ',COALESCE(e.matricule,''))) AS search FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.actif = true ORDER BY u.nom, u.prenom`)); } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try {
    const { sql, params } = buildWhere(req.query);
    const total = Number((await one(`SELECT COUNT(*)::int AS n FROM dsi_maintenance m LEFT JOIN dsi_equipment e ON e.id=m.equipment_id ${sql}`, params)).n);
    const page = Math.max(1, Number(req.query.page) || 1), pageSize = 20;
    const p2 = [...params, pageSize, (page - 1) * pageSize];
    const items = await all(`${M_SELECT} ${sql} ORDER BY COALESCE(m.date_debut, m.created_at) DESC, m.id DESC LIMIT $${p2.length - 1} OFFSET $${p2.length}`, p2);
    res.json({ items, total, page, pageSize });
  } catch (e) { next(e); }
});

router.get('/:id', canView, async (req, res, next) => {
  try { const r = await one(`${M_SELECT} WHERE m.id = $1`, [req.params.id]); if (!r) return res.status(404).json({ error: 'Introuvable.' }); res.json(r); } catch (e) { next(e); }
});

router.post('/', canEdit, async (req, res, next) => {
  try {
    if (!req.body?.equipment_id) return res.status(400).json({ error: 'Équipement requis.' });
    const entries = FIELDS.map(f => [f, nn(req.body[f])]).filter(([, v]) => v !== null);
    const cols = [...entries.map(([c]) => c), 'created_by'];
    const vals = [...entries.map(([, v]) => v), req.user.id];
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(`INSERT INTO dsi_maintenance (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
    await audit.logAction({ tableName: 'dsi_maintenance', recordId: row.id, action: 'dsi_maintenance_create', userId: req.user.id, details: { equipment_id: row.equipment_id } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM dsi_maintenance WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const cols = FIELDS.filter(f => req.body[f] !== undefined);
    if (cols.length) {
      const vals = cols.map(c => nn(req.body[c]));
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await run(`UPDATE dsi_maintenance SET ${setClause}, updated_at=now() WHERE id=$${cols.length + 1}`, [...vals, req.params.id]);
      await audit.logAction({ tableName: 'dsi_maintenance', recordId: Number(req.params.id), action: 'dsi_maintenance_update', userId: req.user.id, details: {} });
    }
    res.json(await one(`${M_SELECT} WHERE m.id = $1`, [req.params.id]));
  } catch (e) { next(e); }
});

module.exports = router;
