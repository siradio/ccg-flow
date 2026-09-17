const express = require('express');
const { all, one, run, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const audit = require('../audit/audit.service');
const { nextRef } = require('./dsi.numbering');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.risques', 'consultation');
const canEdit = requireSubModule('dsi.risques', 'edition');

// Criticité dérivée de probabilité × impact (matrice 4×4) — jamais saisie à la main.
function criticite(p, i) {
  const s = (Number(p) || 1) * (Number(i) || 1);
  if (s >= 10) return 'critique';
  if (s >= 7) return 'eleve';
  if (s >= 3) return 'moyen';
  return 'faible';
}

const R_SELECT = `
  SELECT r.*, rc.libelle AS categorie, TRIM(CONCAT(u.prenom,' ',u.nom)) AS responsable_nom,
         p.code AS projet_code, p.nom AS projet_nom
  FROM dsi_risks r
  LEFT JOIN dsi_risk_categories rc ON rc.id = r.category_id
  LEFT JOIN users u ON u.id = r.responsable_id
  LEFT JOIN dsi_projects p ON p.id = r.project_id`;

const FIELDS = ['sujet', 'description', 'category_id', 'probabilite', 'impact', 'responsable_id',
  'mitigation', 'echeance', 'statut', 'project_id', 'commentaire'];
const nn = v => (v === '' || v === undefined ? null : v);

router.get('/users', canView, async (req, res, next) => {
  try { res.json(await all(`SELECT id, TRIM(CONCAT(prenom,' ',nom)) AS nom FROM users WHERE actif=true ORDER BY nom, prenom`)); } catch (e) { next(e); }
});

router.get('/stats', canView, async (req, res, next) => {
  try {
    res.json(await one(
      `SELECT COUNT(*) FILTER (WHERE statut NOT IN ('clos'))::int AS ouverts,
              COUNT(*) FILTER (WHERE criticite='critique' AND statut<>'clos')::int AS critiques,
              COUNT(*) FILTER (WHERE criticite='eleve' AND statut<>'clos')::int AS eleves,
              COUNT(*) FILTER (WHERE statut<>'clos' AND echeance IS NOT NULL AND echeance < CURRENT_DATE)::int AS en_retard
       FROM dsi_risks`));
  } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try {
    const w = []; const p = [];
    const P = v => { p.push(v); return `$${p.length}`; };
    if (req.query.statut) w.push(`r.statut = ${P(req.query.statut)}`);
    if (req.query.criticite) w.push(`r.criticite = ${P(req.query.criticite)}`);
    if (req.query.project_id) w.push(`r.project_id = ${P(Number(req.query.project_id))}`);
    if (req.query.q) { const like = P('%' + req.query.q.toLowerCase() + '%'); w.push(`(LOWER(r.sujet) LIKE ${like} OR LOWER(r.reference) LIKE ${like})`); }
    const sql = w.length ? 'WHERE ' + w.join(' AND ') : '';
    res.json(await all(`${R_SELECT} ${sql} ORDER BY CASE r.criticite WHEN 'critique' THEN 1 WHEN 'eleve' THEN 2 WHEN 'moyen' THEN 3 ELSE 4 END, r.created_at DESC`, p));
  } catch (e) { next(e); }
});

router.get('/:id', canView, async (req, res, next) => {
  try { const r = await one(`${R_SELECT} WHERE r.id=$1`, [req.params.id]); if (!r) return res.status(404).json({ error: 'Introuvable.' }); res.json(r); } catch (e) { next(e); }
});

router.post('/', canEdit, async (req, res, next) => {
  try {
    if (!req.body?.sujet) return res.status(400).json({ error: 'Sujet requis.' });
    const crit = criticite(req.body.probabilite, req.body.impact);
    const row = await withTransaction(async (tx) => {
      const reference = await nextRef(tx, { scope: 'RISK', prefix: 'RSK', pad: 4 });
      const vals = FIELDS.map(f => nn(req.body[f]));
      const ph = FIELDS.map((_, i) => `$${i + 2}`).join(', ');
      return tx.one(`INSERT INTO dsi_risks (reference, ${FIELDS.join(', ')}, criticite, created_by)
        VALUES ($1, ${ph}, $${FIELDS.length + 2}, $${FIELDS.length + 3}) RETURNING *`, [reference, ...vals, crit, req.user.id]);
    });
    await audit.logAction({ tableName: 'dsi_risks', recordId: row.id, action: 'dsi_risk_create', userId: req.user.id, details: { reference: row.reference, criticite: crit } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM dsi_risks WHERE id=$1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const cols = FIELDS.filter(f => req.body[f] !== undefined);
    const prob = req.body.probabilite !== undefined ? req.body.probabilite : existing.probabilite;
    const imp = req.body.impact !== undefined ? req.body.impact : existing.impact;
    const crit = criticite(prob, imp);
    const vals = cols.map(c => nn(req.body[c]));
    const setParts = [...cols.map((c, i) => `${c} = $${i + 1}`), `criticite = $${cols.length + 1}`];
    await run(`UPDATE dsi_risks SET ${setParts.join(', ')}, updated_at=now() WHERE id=$${cols.length + 2}`, [...vals, crit, req.params.id]);
    res.json(await one(`${R_SELECT} WHERE r.id=$1`, [req.params.id]));
  } catch (e) { next(e); }
});

module.exports = router;
