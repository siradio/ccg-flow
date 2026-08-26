const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const { runSchedule } = require('./reporting.service');
const { REPORT_TYPES } = require('./report-generators');

// Administration des rapports planifiés — réservé au super_admin.
const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

const EDITABLE = ['code', 'libelle', 'actif', 'frequence', 'jour_semaine', 'jour_mois', 'heure', 'business_unit_id', 'format', 'destinataires'];
const emptyToNull = v => (v === '' || v === undefined ? null : v);

router.get('/types', (req, res) => res.json(REPORT_TYPES));

router.get('/', async (req, res, next) => {
  try {
    res.json(await all(`SELECT s.*, bu.nom AS business_unit_nom FROM report_schedules s
      LEFT JOIN business_units bu ON bu.id = s.business_unit_id ORDER BY s.libelle`));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.code || !b.libelle) return res.status(400).json({ error: 'Type et libellé obligatoires.' });
    // N'insère que les colonnes fournies → les DEFAULT SQL (actif, frequence, heure, format) s'appliquent.
    const cols = EDITABLE.filter(c => c in b);
    const vals = cols.map(c => emptyToNull(b[c]));
    vals.push(req.user.id);
    const allCols = [...cols, 'created_by', 'updated_by'];
    const ph = cols.map((_, i) => `$${i + 1}`).concat([`$${cols.length + 1}`, `$${cols.length + 1}`]).join(', ');
    const row = await one(`INSERT INTO report_schedules (${allCols.join(', ')}) VALUES (${ph}) RETURNING id`, vals);
    res.status(201).json(await one('SELECT * FROM report_schedules WHERE id = $1', [row.id]));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT id FROM report_schedules WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Planification introuvable.' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    for (const c of EDITABLE) { if (c in b) { params.push(emptyToNull(b[c])); sets.push(`${c} = $${params.length}`); } }
    params.push(req.user.id); sets.push(`updated_by = $${params.length}`);
    sets.push('updated_at = now()');
    params.push(id);
    await run(`UPDATE report_schedules SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    res.json(await one('SELECT * FROM report_schedules WHERE id = $1', [id]));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await run('DELETE FROM report_schedules WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// Envoyer maintenant (test / envoi manuel).
router.post('/:id/run', async (req, res, next) => {
  try {
    const schedule = await one('SELECT * FROM report_schedules WHERE id = $1', [Number(req.params.id)]);
    if (!schedule) return res.status(404).json({ error: 'Planification introuvable.' });
    const result = await runSchedule(schedule, { userId: req.user.id, manual: true });
    res.json(result);
  } catch (e) { next(e); }
});

// Historique des exécutions d'une planification.
router.get('/:id/runs', async (req, res, next) => {
  try {
    res.json(await all(`SELECT id, run_at, statut, destinataires, message FROM report_runs
      WHERE schedule_id = $1 ORDER BY run_at DESC LIMIT 20`, [Number(req.params.id)]));
  } catch (e) { next(e); }
});

module.exports = router;
