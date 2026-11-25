const express = require('express');
const { all, one, run } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { isSuperAdmin, hasRoleAnywhere } = require('../../../middleware/permissions');

// Sous-module RH « Tests de recrutement ». Monté sur /api/rh/recrutement. Gating PAR RÔLE (comme tout
// le RH) : consultation ouverte aux rôles RH/validation, administration réservée au RH. Lot 0 :
// catégories de compétence + tableau de bord (compteurs). Les lots suivants ajoutent questions,
// modèles, campagnes, candidats, portail, correction et reporting.
const router = express.Router();
router.use(requireAuth);

// Consultation : rôles RH / chaîne de validation. Administration : RH (ou super_admin).
function canView(user) { return isSuperAdmin(user) || ['rh', 'responsable', 'daf', 'dg'].some(r => hasRoleAnywhere(user, r)); }
function canManage(user) { return isSuperAdmin(user) || hasRoleAnywhere(user, 'rh'); }
function requireView(req, res, next) { if (!canView(req.user)) return res.status(403).json({ error: 'Accès réservé au personnel RH.' }); next(); }
function requireManage(req, res, next) { if (!canManage(req.user)) return res.status(403).json({ error: 'Administration réservée au RH.' }); next(); }

// ── Tableau de bord (compteurs) — s'enrichira au fil des lots (candidats, tentatives, corrections…) ──
router.get('/dashboard', requireView, async (req, res, next) => {
  try {
    const [campaigns, questions, templates, categories] = await Promise.all([
      all("SELECT statut, COUNT(*)::int AS n FROM rh_recrutement_campaigns GROUP BY statut"),
      one('SELECT COUNT(*)::int AS n FROM rh_recrutement_questions WHERE actif = true'),
      one("SELECT COUNT(*)::int AS n FROM rh_recrutement_templates WHERE statut = 'publie'"),
      one('SELECT COUNT(*)::int AS n FROM rh_recrutement_categories WHERE actif = true'),
    ]);
    const byStatut = Object.fromEntries(campaigns.map(r => [r.statut, r.n]));
    res.json({
      campagnes_actives: byStatut.active || 0,
      campagnes_total: campaigns.reduce((s, r) => s + r.n, 0),
      questions: questions.n,
      modeles_publies: templates.n,
      categories: categories.n,
    });
  } catch (e) { next(e); }
});

// ── Catégories / domaines de compétence (CRUD générique, compatible ReferentialPage) ──────────────
router.get('/categories', requireView, async (req, res, next) => {
  try { res.json(await all('SELECT * FROM rh_recrutement_categories ORDER BY ordre, nom')); }
  catch (e) { next(e); }
});

function parseCategorie(b) {
  const nom = String(b.nom || '').trim();
  if (!nom) return { error: 'Le nom est obligatoire.' };
  return {
    nom,
    code: String(b.code || '').trim() || null,
    description: String(b.description || '').trim() || null,
    ordre: Number.isFinite(Number(b.ordre)) ? Number(b.ordre) : 100,
    actif: b.actif == null ? true : !!b.actif,
  };
}

router.post('/categories', requireManage, async (req, res, next) => {
  try {
    const c = parseCategorie(req.body || {});
    if (c.error) return res.status(400).json({ error: c.error });
    const row = await one(
      `INSERT INTO rh_recrutement_categories (nom, code, description, ordre, actif)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [c.nom, c.code, c.description, c.ordre, c.actif]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/categories/:id', requireManage, async (req, res, next) => {
  try {
    const c = parseCategorie(req.body || {});
    if (c.error) return res.status(400).json({ error: c.error });
    const row = await one(
      `UPDATE rh_recrutement_categories SET nom=$1, code=$2, description=$3, ordre=$4, actif=$5, updated_at=now()
       WHERE id=$6 RETURNING *`,
      [c.nom, c.code, c.description, c.ordre, c.actif, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/categories/:id', requireManage, async (req, res, next) => {
  try {
    await run('DELETE FROM rh_recrutement_categories WHERE id=$1', [Number(req.params.id)]);
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Catégorie utilisée par des questions : désactivez-la au lieu de la supprimer.' });
    next(e);
  }
});

module.exports = router;
