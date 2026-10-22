const express = require('express');
const { all, one, withTransaction } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { isSuperAdmin } = require('../../../middleware/permissions');
const { logAction } = require('../../audit/audit.service');

// Modèles d'évaluation réutilisables : en-tête + liste de compétences piochées dans le référentiel.
// Créables par les RH OU les managers (rôle responsable) ; édition/suppression = créateur ou RH.
const router = express.Router();
router.use(requireAuth);

const MANAGE_ROLES = ['rh', 'responsable', 'daf', 'dg'];
const canManage = (u) => isSuperAdmin(u) || (u.roles || []).some(r => MANAGE_ROLES.includes(r.role_code));
const isRh = (u) => isSuperAdmin(u) || (u.roles || []).some(r => r.role_code === 'rh');
function requireManage(req, res, next) {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Réservé aux RH et aux managers.' });
  next();
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT t.*, TRIM(CONCAT(u.prenom,' ',u.nom)) AS created_by_nom,
             (SELECT COUNT(*)::int FROM rh_eval_template_items i WHERE i.template_id = t.id) AS nb_items
        FROM rh_eval_templates t LEFT JOIN users u ON u.id = t.created_by
       ${req.query.actif === '1' ? 'WHERE t.actif' : ''}
       ORDER BY t.nom`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const t = await one('SELECT * FROM rh_eval_templates WHERE id = $1', [Number(req.params.id)]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    t.items = await all(`
      SELECT i.id, i.competence_id, i.categorie_libelle, i.libelle, i.ordre,
             c.libelle AS competence_libelle, c.category_id
        FROM rh_eval_template_items i
        LEFT JOIN rh_competences c ON c.id = i.competence_id
       WHERE i.template_id = $1 ORDER BY i.ordre, i.id`, [t.id]);
    res.json(t);
  } catch (e) { next(e); }
});

async function writeItems(tx, templateId, items) {
  await tx.run('DELETE FROM rh_eval_template_items WHERE template_id = $1', [templateId]);
  let ordre = 0;
  for (const it of (items || [])) {
    ordre += 1;
    await tx.run(
      `INSERT INTO rh_eval_template_items (template_id, competence_id, categorie_libelle, libelle, ordre)
       VALUES ($1,$2,$3,$4,$5)`,
      [templateId, it.competence_id || null, it.categorie_libelle || null, it.libelle || null, ordre]);
  }
}

router.post('/', requireManage, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.nom || !b.nom.trim()) return res.status(400).json({ error: 'Le nom du modèle est obligatoire.' });
    const id = await withTransaction(async (tx) => {
      const row = await tx.one(
        `INSERT INTO rh_eval_templates (nom, description, poste_cible, echelle_max, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [b.nom.trim(), b.description || null, b.poste_cible || null, Number(b.echelle_max) || 5, req.user.id]);
      await writeItems(tx, row.id, b.items);
      return row.id;
    });
    await logAction({ tableName: 'rh_eval_templates', recordId: id, action: 'creation', userId: req.user.id, details: { nom: b.nom } });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

function canEdit(user, template) {
  return isRh(user) || template.created_by === user.id;
}

router.put('/:id', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const t = await one('SELECT * FROM rh_eval_templates WHERE id = $1', [id]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (!canEdit(req.user, t)) return res.status(403).json({ error: 'Seul le créateur ou un RH peut modifier ce modèle.' });
    const b = req.body || {};
    await withTransaction(async (tx) => {
      await tx.run(
        `UPDATE rh_eval_templates SET nom=$1, description=$2, poste_cible=$3, echelle_max=$4, actif=$5, updated_at=now() WHERE id=$6`,
        [(b.nom && b.nom.trim()) || t.nom, b.description ?? t.description, b.poste_cible ?? t.poste_cible,
         Number(b.echelle_max) || t.echelle_max, b.actif !== undefined ? !!b.actif : t.actif, id]);
      if ('items' in b) await writeItems(tx, id, b.items);
    });
    await logAction({ tableName: 'rh_eval_templates', recordId: id, action: 'modification', userId: req.user.id, details: {} });
    res.json({ id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const t = await one('SELECT created_by FROM rh_eval_templates WHERE id = $1', [id]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (!canEdit(req.user, t)) return res.status(403).json({ error: 'Seul le créateur ou un RH peut supprimer ce modèle.' });
    await withTransaction(async (tx) => { await tx.run('DELETE FROM rh_eval_templates WHERE id = $1', [id]); });
    await logAction({ tableName: 'rh_eval_templates', recordId: id, action: 'suppression', userId: req.user.id, details: {} });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Impossible : des fiches/campagnes utilisent ce modèle.' });
    next(e);
  }
});

module.exports = router;
