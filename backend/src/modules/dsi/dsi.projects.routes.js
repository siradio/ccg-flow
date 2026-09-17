const express = require('express');
const { all, one, run, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const audit = require('../audit/audit.service');
const { nextRef } = require('./dsi.numbering');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.projets', 'consultation');
const canEdit = requireSubModule('dsi.projets', 'edition');

const P_SELECT = `
  SELECT p.*, TRIM(CONCAT(r.prenom,' ',r.nom)) AS responsable_nom,
         TRIM(CONCAT(sp.prenom,' ',sp.nom)) AS sponsor_nom,
         ent.code AS entity_code, pr.libelle AS priorite, pr.couleur AS priorite_couleur
  FROM dsi_projects p
  LEFT JOIN users r ON r.id = p.responsable_id
  LEFT JOIN users sp ON sp.id = p.sponsor_id
  LEFT JOIN entities ent ON ent.id = p.entity_id
  LEFT JOIN dsi_priorities pr ON pr.id = p.priority_id`;

const FIELDS = ['nom', 'description', 'responsable_id', 'sponsor_id', 'entity_id', 'date_debut',
  'date_fin_prevue', 'date_fin_reelle', 'budget_prevu', 'budget_consomme', 'avancement_pct',
  'priority_id', 'statut', 'risques', 'commentaire'];
const nn = v => (v === '' || v === undefined ? null : v);

router.get('/users', canView, async (req, res, next) => {
  try { res.json(await all(`SELECT id, TRIM(CONCAT(prenom,' ',nom)) AS nom FROM users WHERE actif=true ORDER BY nom, prenom`)); } catch (e) { next(e); }
});

router.get('/stats', canView, async (req, res, next) => {
  try {
    res.json(await one(
      `SELECT COUNT(*) FILTER (WHERE statut='en_cours')::int AS actifs,
              COUNT(*) FILTER (WHERE statut='termine')::int AS termines,
              COUNT(*) FILTER (WHERE statut NOT IN ('termine','annule') AND date_fin_prevue < CURRENT_DATE)::int AS en_retard,
              COALESCE(ROUND(AVG(avancement_pct) FILTER (WHERE statut='en_cours')),0)::int AS avancement_moyen,
              COALESCE(SUM(budget_prevu),0) AS budget_prevu, COALESCE(SUM(budget_consomme),0) AS budget_consomme
       FROM dsi_projects WHERE deleted_at IS NULL`));
  } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try {
    const w = ['p.deleted_at IS NULL']; const p = [];
    const P = v => { p.push(v); return `$${p.length}`; };
    if (req.query.statut) w.push(`p.statut = ${P(req.query.statut)}`);
    if (req.query.entity_id) w.push(`p.entity_id = ${P(Number(req.query.entity_id))}`);
    if (req.query.q) { const like = P('%' + req.query.q.toLowerCase() + '%'); w.push(`(LOWER(p.nom) LIKE ${like} OR LOWER(p.code) LIKE ${like})`); }
    const sql = 'WHERE ' + w.join(' AND ');
    res.json(await all(`${P_SELECT} ${sql} ORDER BY p.created_at DESC`, p));
  } catch (e) { next(e); }
});

router.get('/:id', canView, async (req, res, next) => {
  try {
    const p = await one(`${P_SELECT} WHERE p.id = $1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Introuvable.' });
    const tasks = await all(`SELECT t.*, TRIM(CONCAT(u.prenom,' ',u.nom)) AS responsable_nom, pr.libelle AS priorite
      FROM dsi_project_tasks t LEFT JOIN users u ON u.id=t.responsable_id LEFT JOIN dsi_priorities pr ON pr.id=t.priority_id
      WHERE t.project_id=$1 ORDER BY t.ordre, t.id`, [req.params.id]);
    const members = await all(`SELECT m.*, TRIM(CONCAT(u.prenom,' ',u.nom)) AS nom FROM dsi_project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1`, [req.params.id]);
    res.json({ ...p, tasks, members });
  } catch (e) { next(e); }
});

router.post('/', canEdit, async (req, res, next) => {
  try {
    if (!req.body?.nom) return res.status(400).json({ error: 'Nom requis.' });
    const row = await withTransaction(async (tx) => {
      let code = (req.body.code || '').trim();
      if (!code) code = await nextRef(tx, { scope: 'PROJECT', prefix: 'PRJ', pad: 4 });
      // Seuls les champs renseignés sont insérés (les colonnes NOT NULL à défaut — statut,
      // avancement_pct — gardent leur défaut si absentes).
      const entries = FIELDS.map(f => [f, nn(req.body[f])]).filter(([, v]) => v !== null);
      const cols = ['code', ...entries.map(([c]) => c), 'created_by'];
      const vals = [code, ...entries.map(([, v]) => v), req.user.id];
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      return tx.one(`INSERT INTO dsi_projects (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
    });
    await audit.logAction({ tableName: 'dsi_projects', recordId: row.id, action: 'dsi_project_create', userId: req.user.id, details: { code: row.code } });
    res.status(201).json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce code projet existe déjà.' }); next(e); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM dsi_projects WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const allF = req.body.code !== undefined ? ['code', ...FIELDS] : FIELDS;
    const cols = allF.filter(f => req.body[f] !== undefined);
    if (cols.length) {
      const vals = cols.map(c => nn(req.body[c]));
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await run(`UPDATE dsi_projects SET ${setClause}, updated_at=now() WHERE id=$${cols.length + 1}`, [...vals, req.params.id]);
    }
    res.json(await one(`${P_SELECT} WHERE p.id=$1`, [req.params.id]));
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce code projet existe déjà.' }); next(e); }
});

router.delete('/:id', canEdit, async (req, res, next) => {
  try { await run('UPDATE dsi_projects SET deleted_at=now() WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// ── Tâches ──────────────────────────────────────────────────────────────────
const TASK_FIELDS = ['libelle', 'responsable_id', 'echeance', 'priority_id', 'statut', 'avancement_pct', 'ordre'];
router.post('/:id/tasks', canEdit, async (req, res, next) => {
  try {
    if (!req.body?.libelle) return res.status(400).json({ error: 'Libellé requis.' });
    const entries = TASK_FIELDS.map(f => [f, nn(req.body[f])]).filter(([, v]) => v !== null);
    const cols = ['project_id', ...entries.map(([c]) => c)];
    const vals = [req.params.id, ...entries.map(([, v]) => v)];
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    res.status(201).json(await one(`INSERT INTO dsi_project_tasks (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals));
  } catch (e) { next(e); }
});
router.put('/tasks/:taskId', canEdit, async (req, res, next) => {
  try {
    const cols = TASK_FIELDS.filter(f => req.body[f] !== undefined);
    if (!cols.length) return res.json(await one('SELECT * FROM dsi_project_tasks WHERE id=$1', [req.params.taskId]));
    const vals = cols.map(c => nn(req.body[c]));
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    res.json(await one(`UPDATE dsi_project_tasks SET ${setClause} WHERE id=$${cols.length + 1} RETURNING *`, [...vals, req.params.taskId]));
  } catch (e) { next(e); }
});
router.delete('/tasks/:taskId', canEdit, async (req, res, next) => {
  try { await run('DELETE FROM dsi_project_tasks WHERE id=$1', [req.params.taskId]); res.json({ ok: true }); } catch (e) { next(e); }
});

// ── Membres ─────────────────────────────────────────────────────────────────
router.post('/:id/members', canEdit, async (req, res, next) => {
  try {
    if (!req.body?.user_id) return res.status(400).json({ error: 'Utilisateur requis.' });
    await run('INSERT INTO dsi_project_members (project_id, user_id, role_projet) VALUES ($1,$2,$3) ON CONFLICT (project_id, user_id) DO UPDATE SET role_projet=EXCLUDED.role_projet', [req.params.id, req.body.user_id, req.body.role_projet || null]);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});
router.delete('/members/:memberId', canEdit, async (req, res, next) => {
  try { await run('DELETE FROM dsi_project_members WHERE id=$1', [req.params.memberId]); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
