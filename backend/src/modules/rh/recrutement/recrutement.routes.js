const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { all, one, run, withTransaction } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { isSuperAdmin, hasRoleAnywhere } = require('../../../middleware/permissions');
const env = require('../../../config/env');
const mailer = require('../../../utils/mailer');

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

// ── Banque de questions ───────────────────────────────────────────────────────────────────────────
const QUESTION_TYPES = ['qcm_unique', 'qcm_multiple', 'vrai_faux', 'texte_court', 'texte_long', 'numerique', 'mise_situation', 'fichier'];
const NIVEAUX = ['facile', 'moyen', 'difficile'];
// Types pour lesquels des « options » ont un sens : propositions (QCM/VF) ou réponses acceptées
// (numérique / texte court, pour l'auto-correction). Les autres types se corrigent manuellement.
const OPTION_TYPES = new Set(['qcm_unique', 'qcm_multiple', 'vrai_faux', 'numerique', 'texte_court']);

function parseQuestion(b) {
  const intitule = String(b.intitule || '').trim();
  if (!intitule) return { error: "L'intitulé est obligatoire." };
  const type = QUESTION_TYPES.includes(b.type) ? b.type : 'qcm_unique';
  const niveau = NIVEAUX.includes(b.niveau) ? b.niveau : 'moyen';
  const points = Number.isFinite(Number(b.points)) ? Number(b.points) : 1;
  const duree = (b.duree_sec === '' || b.duree_sec == null) ? null : Number(b.duree_sec);
  return {
    q: {
      intitule, type, niveau, points,
      code: String(b.code || '').trim() || null,
      description: String(b.description || '').trim() || null,
      category_id: b.category_id ? Number(b.category_id) : null,
      sous_categorie: String(b.sous_categorie || '').trim() || null,
      explication: String(b.explication || '').trim() || null,
      duree_sec: duree != null && Number.isFinite(duree) ? duree : null,
      entity_id: b.entity_id ? Number(b.entity_id) : null,
      departement: String(b.departement || '').trim() || null,
      actif: b.actif == null ? true : !!b.actif,
    },
    options: normalizeOptions(b.options, type),
  };
}

// Normalise les options : ne garde que celles au libellé non vide, réordonne. Vide hors OPTION_TYPES.
function normalizeOptions(options, type) {
  if (!OPTION_TYPES.has(type) || !Array.isArray(options)) return [];
  return options
    .map((o, i) => ({ libelle: String(o.libelle ?? '').trim(), bon: !!o.bon, ordre: Number.isFinite(Number(o.ordre)) ? Number(o.ordre) : i }))
    .filter(o => o.libelle !== '')
    .map((o, i) => ({ ...o, ordre: i }));
}

async function insertOptions(tx, questionId, options) {
  for (const o of options) {
    await tx.run('INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre) VALUES ($1,$2,$3,$4)',
      [questionId, o.libelle, o.bon, o.ordre]);
  }
}

// Liste (filtres : catégorie, type, niveau, actif, recherche texte). Renvoie le nom de catégorie et le
// nombre d'options pour l'affichage. Le corrigé/bonnes réponses restent côté serveur (écran RH).
router.get('/questions', requireView, async (req, res, next) => {
  try {
    const { category_id, type, niveau, actif, q } = req.query;
    const clauses = []; const params = [];
    if (category_id) { params.push(Number(category_id)); clauses.push(`qu.category_id = $${params.length}`); }
    if (type) { params.push(type); clauses.push(`qu.type = $${params.length}`); }
    if (niveau) { params.push(niveau); clauses.push(`qu.niveau = $${params.length}`); }
    if (actif === 'true' || actif === 'false') { params.push(actif === 'true'); clauses.push(`qu.actif = $${params.length}`); }
    if (q && q.trim()) { params.push(`%${q.trim().toLowerCase()}%`); clauses.push(`(LOWER(qu.intitule) LIKE $${params.length} OR LOWER(COALESCE(qu.code,'')) LIKE $${params.length})`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    res.json(await all(
      `SELECT qu.id, qu.code, qu.intitule, qu.type, qu.niveau, qu.points, qu.actif, qu.category_id,
              c.nom AS category_nom,
              (SELECT COUNT(*)::int FROM rh_recrutement_question_options o WHERE o.question_id = qu.id) AS nb_options
         FROM rh_recrutement_questions qu
         LEFT JOIN rh_recrutement_categories c ON c.id = qu.category_id
         ${where} ORDER BY qu.id DESC`, params));
  } catch (e) { next(e); }
});

router.get('/questions/:id', requireView, async (req, res, next) => {
  try {
    const qu = await one('SELECT * FROM rh_recrutement_questions WHERE id = $1', [Number(req.params.id)]);
    if (!qu) return res.status(404).json({ error: 'Question introuvable.' });
    qu.options = await all('SELECT id, libelle, bon, ordre FROM rh_recrutement_question_options WHERE question_id = $1 ORDER BY ordre, id', [qu.id]);
    res.json(qu);
  } catch (e) { next(e); }
});

router.post('/questions', requireManage, async (req, res, next) => {
  try {
    const p = parseQuestion(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const created = await withTransaction(async (tx) => {
      const row = await tx.one(
        `INSERT INTO rh_recrutement_questions
           (code, intitule, description, category_id, sous_categorie, niveau, type, explication, points, duree_sec, entity_id, departement, actif, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [p.q.code, p.q.intitule, p.q.description, p.q.category_id, p.q.sous_categorie, p.q.niveau, p.q.type,
         p.q.explication, p.q.points, p.q.duree_sec, p.q.entity_id, p.q.departement, p.q.actif, req.user.id]);
      await insertOptions(tx, row.id, p.options);
      return row;
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.put('/questions/:id', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const p = parseQuestion(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const updated = await withTransaction(async (tx) => {
      const row = await tx.one(
        `UPDATE rh_recrutement_questions SET code=$1, intitule=$2, description=$3, category_id=$4, sous_categorie=$5,
                niveau=$6, type=$7, explication=$8, points=$9, duree_sec=$10, entity_id=$11, departement=$12,
                actif=$13, version=version+1, updated_at=now() WHERE id=$14 RETURNING *`,
        [p.q.code, p.q.intitule, p.q.description, p.q.category_id, p.q.sous_categorie, p.q.niveau, p.q.type,
         p.q.explication, p.q.points, p.q.duree_sec, p.q.entity_id, p.q.departement, p.q.actif, id]);
      if (!row) return null;
      await tx.run('DELETE FROM rh_recrutement_question_options WHERE question_id = $1', [id]);
      await insertOptions(tx, id, p.options);
      return row;
    });
    if (!updated) return res.status(404).json({ error: 'Question introuvable.' });
    res.json(updated);
  } catch (e) { next(e); }
});

router.post('/questions/:id/duplicate', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const src = await one('SELECT * FROM rh_recrutement_questions WHERE id = $1', [id]);
    if (!src) return res.status(404).json({ error: 'Question introuvable.' });
    const opts = await all('SELECT libelle, bon, ordre FROM rh_recrutement_question_options WHERE question_id = $1 ORDER BY ordre, id', [id]);
    const copy = await withTransaction(async (tx) => {
      const row = await tx.one(
        `INSERT INTO rh_recrutement_questions
           (code, intitule, description, category_id, sous_categorie, niveau, type, explication, points, duree_sec, entity_id, departement, actif, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [src.code ? `${src.code}-copie` : null, `${src.intitule} (copie)`, src.description, src.category_id, src.sous_categorie,
         src.niveau, src.type, src.explication, src.points, src.duree_sec, src.entity_id, src.departement, src.actif, req.user.id]);
      await insertOptions(tx, row.id, opts);
      return row;
    });
    res.status(201).json(copy);
  } catch (e) { next(e); }
});

router.delete('/questions/:id', requireManage, async (req, res, next) => {
  try {
    await run('DELETE FROM rh_recrutement_questions WHERE id = $1', [Number(req.params.id)]); // options en cascade
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── Modèles de test + variantes ───────────────────────────────────────────────────────────────────
const CORRECTION_MODES = ['auto', 'mixte', 'manuel'];

function parseTemplate(b) {
  const titre = String(b.titre || '').trim();
  if (!titre) return { error: 'Le titre est obligatoire.' };
  const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
  return {
    t: {
      titre,
      description: String(b.description || '').trim() || null,
      poste: String(b.poste || '').trim() || null,
      entity_id: b.entity_id ? Number(b.entity_id) : null,
      departement: String(b.departement || '').trim() || null,
      consignes: String(b.consignes || '').trim() || null,
      duree_min: num(b.duree_min, 40),
      bareme_total: b.bareme_total === '' || b.bareme_total == null ? null : Number(b.bareme_total),
      seuil_reussite: b.seuil_reussite === '' || b.seuil_reussite == null ? null : Number(b.seuil_reussite),
      tentatives_autorisees: num(b.tentatives_autorisees, 1),
      mode_correction: CORRECTION_MODES.includes(b.mode_correction) ? b.mode_correction : 'auto',
      afficher_resultat_candidat: !!b.afficher_resultat_candidat,
      melange_questions: !!b.melange_questions,
      melange_reponses: !!b.melange_reponses,
    },
  };
}

// Snapshot immuable d'une question (intitulé, type, barème, options) pour figer le contenu dans une variante.
async function buildSnapshot(questionId) {
  const q = await one('SELECT * FROM rh_recrutement_questions WHERE id = $1', [questionId]);
  if (!q) return null;
  const options = await all('SELECT libelle, bon, ordre FROM rh_recrutement_question_options WHERE question_id = $1 ORDER BY ordre, id', [questionId]);
  return { question_id: q.id, intitule: q.intitule, description: q.description, type: q.type, points: Number(q.points), niveau: q.niveau, category_id: q.category_id, options };
}

router.get('/templates', requireView, async (req, res, next) => {
  try {
    const { statut, q } = req.query;
    const clauses = []; const params = [];
    if (statut) { params.push(statut); clauses.push(`statut = $${params.length}`); }
    if (q && q.trim()) { params.push(`%${q.trim().toLowerCase()}%`); clauses.push(`LOWER(titre) LIKE $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    res.json(await all(
      `SELECT t.*, (SELECT COUNT(*)::int FROM rh_recrutement_template_variants v WHERE v.template_id = t.id) AS nb_variantes
         FROM rh_recrutement_templates t ${where} ORDER BY t.id DESC`, params));
  } catch (e) { next(e); }
});

router.get('/templates/:id', requireView, async (req, res, next) => {
  try {
    const t = await one('SELECT * FROM rh_recrutement_templates WHERE id = $1', [Number(req.params.id)]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    t.variants = await all(
      `SELECT v.*,
              (SELECT COUNT(*)::int FROM rh_recrutement_variant_questions vq WHERE vq.variant_id = v.id) AS nb_questions,
              (SELECT COALESCE(SUM((vq.snapshot->>'points')::numeric),0) FROM rh_recrutement_variant_questions vq WHERE vq.variant_id = v.id) AS bareme
         FROM rh_recrutement_template_variants v WHERE v.template_id = t.id ORDER BY v.ordre, v.id`, [t.id]);
    res.json(t);
  } catch (e) { next(e); }
});

router.post('/templates', requireManage, async (req, res, next) => {
  try {
    const p = parseTemplate(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const t = p.t;
    const row = await one(
      `INSERT INTO rh_recrutement_templates
         (titre, description, poste, entity_id, departement, consignes, duree_min, bareme_total, seuil_reussite,
          tentatives_autorisees, mode_correction, afficher_resultat_candidat, melange_questions, melange_reponses, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [t.titre, t.description, t.poste, t.entity_id, t.departement, t.consignes, t.duree_min, t.bareme_total, t.seuil_reussite,
       t.tentatives_autorisees, t.mode_correction, t.afficher_resultat_candidat, t.melange_questions, t.melange_reponses, req.user.id]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/templates/:id', requireManage, async (req, res, next) => {
  try {
    const p = parseTemplate(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const t = p.t;
    const row = await one(
      `UPDATE rh_recrutement_templates SET titre=$1, description=$2, poste=$3, entity_id=$4, departement=$5, consignes=$6,
              duree_min=$7, bareme_total=$8, seuil_reussite=$9, tentatives_autorisees=$10, mode_correction=$11,
              afficher_resultat_candidat=$12, melange_questions=$13, melange_reponses=$14, version=version+1, updated_at=now()
        WHERE id=$15 RETURNING *`,
      [t.titre, t.description, t.poste, t.entity_id, t.departement, t.consignes, t.duree_min, t.bareme_total, t.seuil_reussite,
       t.tentatives_autorisees, t.mode_correction, t.afficher_resultat_candidat, t.melange_questions, t.melange_reponses, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Modèle introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

// Publication / archivage (statut).
router.post('/templates/:id/statut', requireManage, async (req, res, next) => {
  try {
    const statut = req.body && req.body.statut;
    if (!['brouillon', 'publie', 'archive'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
    const row = await one('UPDATE rh_recrutement_templates SET statut=$1, updated_at=now() WHERE id=$2 RETURNING *', [statut, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Modèle introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/templates/:id', requireManage, async (req, res, next) => {
  try { await run('DELETE FROM rh_recrutement_templates WHERE id=$1', [Number(req.params.id)]); res.status(204).end(); } // variantes + questions en cascade
  catch (e) { next(e); }
});

router.post('/templates/:id/duplicate', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const t = await one('SELECT * FROM rh_recrutement_templates WHERE id=$1', [id]);
    if (!t) return res.status(404).json({ error: 'Modèle introuvable.' });
    const variants = await all('SELECT * FROM rh_recrutement_template_variants WHERE template_id=$1 ORDER BY ordre,id', [id]);
    const copy = await withTransaction(async (tx) => {
      const nt = await tx.one(
        `INSERT INTO rh_recrutement_templates
           (titre, description, poste, entity_id, departement, consignes, duree_min, bareme_total, seuil_reussite,
            tentatives_autorisees, mode_correction, afficher_resultat_candidat, melange_questions, melange_reponses, statut, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'brouillon',$15) RETURNING *`,
        [`${t.titre} (copie)`, t.description, t.poste, t.entity_id, t.departement, t.consignes, t.duree_min, t.bareme_total,
         t.seuil_reussite, t.tentatives_autorisees, t.mode_correction, t.afficher_resultat_candidat, t.melange_questions, t.melange_reponses, req.user.id]);
      for (const v of variants) {
        const nv = await tx.one('INSERT INTO rh_recrutement_template_variants (template_id, code, libelle, ordre) VALUES ($1,$2,$3,$4) RETURNING id', [nt.id, v.code, v.libelle, v.ordre]);
        const vqs = await tx.all('SELECT question_id, ordre, snapshot FROM rh_recrutement_variant_questions WHERE variant_id=$1 ORDER BY ordre,id', [v.id]);
        for (const vq of vqs) await tx.run('INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot) VALUES ($1,$2,$3,$4)', [nv.id, vq.question_id, vq.ordre, vq.snapshot]);
      }
      return nt;
    });
    res.status(201).json(copy);
  } catch (e) { next(e); }
});

// Variantes
router.post('/templates/:id/variants', requireManage, async (req, res, next) => {
  try {
    const code = String((req.body || {}).code || '').trim();
    if (!code) return res.status(400).json({ error: 'Le code de variante est obligatoire (ex. A, B, C).' });
    const ord = await one('SELECT COALESCE(MAX(ordre),-1)+1 AS n FROM rh_recrutement_template_variants WHERE template_id=$1', [Number(req.params.id)]);
    const row = await one('INSERT INTO rh_recrutement_template_variants (template_id, code, libelle, ordre) VALUES ($1,$2,$3,$4) RETURNING *',
      [Number(req.params.id), code, String((req.body || {}).libelle || '').trim() || null, ord.n]);
    res.status(201).json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce code de variante existe déjà pour ce modèle.' }); next(e); }
});

router.put('/variants/:id', requireManage, async (req, res, next) => {
  try {
    const b = req.body || {};
    const row = await one('UPDATE rh_recrutement_template_variants SET code=COALESCE($1,code), libelle=$2 WHERE id=$3 RETURNING *',
      [b.code ? String(b.code).trim() : null, String(b.libelle || '').trim() || null, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Variante introuvable.' });
    res.json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce code de variante existe déjà.' }); next(e); }
});

router.delete('/variants/:id', requireManage, async (req, res, next) => {
  try { await run('DELETE FROM rh_recrutement_template_variants WHERE id=$1', [Number(req.params.id)]); res.status(204).end(); }
  catch (e) { next(e); }
});

// Questions d'une variante (snapshot). Vue RH : inclut les bonnes réponses.
router.get('/variants/:id/questions', requireView, async (req, res, next) => {
  try {
    res.json(await all('SELECT id, question_id, ordre, snapshot FROM rh_recrutement_variant_questions WHERE variant_id=$1 ORDER BY ordre, id', [Number(req.params.id)]));
  } catch (e) { next(e); }
});

// Ajout manuel de questions (depuis la banque) → snapshot figé + append.
router.post('/variants/:id/questions', requireManage, async (req, res, next) => {
  try {
    const variantId = Number(req.params.id);
    const ids = Array.isArray((req.body || {}).question_ids) ? req.body.question_ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Aucune question sélectionnée.' });
    const start = await one('SELECT COALESCE(MAX(ordre),-1)+1 AS n FROM rh_recrutement_variant_questions WHERE variant_id=$1', [variantId]);
    let ordre = start.n, added = 0;
    await withTransaction(async (tx) => {
      for (const qid of ids) {
        const snap = await buildSnapshot(qid);
        if (!snap) continue;
        await tx.run('INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot) VALUES ($1,$2,$3,$4)', [variantId, qid, ordre++, JSON.stringify(snap)]);
        added++;
      }
    });
    res.status(201).json({ added });
  } catch (e) { next(e); }
});

// Remplissage aléatoire depuis la banque (count, filtres catégorie/niveau), en évitant les doublons déjà présents.
router.post('/variants/:id/fill-random', requireManage, async (req, res, next) => {
  try {
    const variantId = Number(req.params.id);
    const b = req.body || {};
    const count = Math.max(1, Math.min(200, Number(b.count) || 0));
    if (!count) return res.status(400).json({ error: 'Nombre de questions invalide.' });
    const clauses = ['actif = true']; const params = [];
    if (b.category_id) { params.push(Number(b.category_id)); clauses.push(`category_id = $${params.length}`); }
    if (b.niveau) { params.push(b.niveau); clauses.push(`niveau = $${params.length}`); }
    params.push(variantId);
    const picked = await all(
      `SELECT id FROM rh_recrutement_questions
        WHERE ${clauses.join(' AND ')}
          AND id NOT IN (SELECT question_id FROM rh_recrutement_variant_questions WHERE variant_id = $${params.length} AND question_id IS NOT NULL)
        ORDER BY random() LIMIT ${count}`, params);
    const start = await one('SELECT COALESCE(MAX(ordre),-1)+1 AS n FROM rh_recrutement_variant_questions WHERE variant_id=$1', [variantId]);
    let ordre = start.n, added = 0;
    await withTransaction(async (tx) => {
      for (const r of picked) {
        const snap = await buildSnapshot(r.id);
        if (!snap) continue;
        await tx.run('INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot) VALUES ($1,$2,$3,$4)', [variantId, r.id, ordre++, JSON.stringify(snap)]);
        added++;
      }
    });
    res.status(201).json({ added, demande: count });
  } catch (e) { next(e); }
});

router.delete('/variant-questions/:id', requireManage, async (req, res, next) => {
  try { await run('DELETE FROM rh_recrutement_variant_questions WHERE id=$1', [Number(req.params.id)]); res.status(204).end(); }
  catch (e) { next(e); }
});

// Réordonne les questions d'une variante selon la liste d'ids fournie.
router.put('/variants/:id/reorder', requireManage, async (req, res, next) => {
  try {
    const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    await withTransaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) await tx.run('UPDATE rh_recrutement_variant_questions SET ordre=$1 WHERE id=$2 AND variant_id=$3', [i, ids[i], Number(req.params.id)]);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Utilisateurs assignables (responsable RH / responsable de service) ────────────────────────────
router.get('/assignable-users', requireManage, async (req, res, next) => {
  try { res.json(await all("SELECT id, nom, prenom, email FROM users WHERE actif = true ORDER BY nom, prenom")); }
  catch (e) { next(e); }
});

// ── Campagnes de recrutement ──────────────────────────────────────────────────────────────────────
const CAMPAIGN_STATUTS = ['brouillon', 'active', 'suspendue', 'cloturee', 'archivee'];

function parseCampaign(b) {
  const intitule = String(b.intitule || '').trim();
  if (!intitule) return { error: "L'intitulé est obligatoire." };
  const d = (v) => (v && String(v).trim() ? String(v).trim() : null);
  return {
    c: {
      intitule,
      description: d(b.description),
      entity_id: b.entity_id ? Number(b.entity_id) : null,
      departement: d(b.departement),
      poste: d(b.poste),
      type_contrat: d(b.type_contrat),
      nb_postes: b.nb_postes === '' || b.nb_postes == null ? null : Number(b.nb_postes),
      date_debut: d(b.date_debut),
      date_fin: d(b.date_fin),
      responsable_rh_user_id: b.responsable_rh_user_id ? Number(b.responsable_rh_user_id) : null,
      responsable_service_user_id: b.responsable_service_user_id ? Number(b.responsable_service_user_id) : null,
      template_id: b.template_id ? Number(b.template_id) : null,
    },
  };
}

router.get('/campaigns', requireView, async (req, res, next) => {
  try {
    const { statut, q } = req.query;
    const clauses = []; const params = [];
    if (statut) { params.push(statut); clauses.push(`statut = $${params.length}`); }
    if (q && q.trim()) { params.push(`%${q.trim().toLowerCase()}%`); clauses.push(`LOWER(intitule) LIKE $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    res.json(await all(
      `SELECT c.*, e.nom AS entity_nom, t.titre AS template_titre,
              (SELECT COUNT(*)::int FROM rh_recrutement_candidates ca WHERE ca.campaign_id = c.id) AS nb_candidats
         FROM rh_recrutement_campaigns c
         LEFT JOIN entities e ON e.id = c.entity_id
         LEFT JOIN rh_recrutement_templates t ON t.id = c.template_id
         ${where} ORDER BY c.id DESC`, params));
  } catch (e) { next(e); }
});

router.get('/campaigns/:id', requireView, async (req, res, next) => {
  try {
    const c = await one(
      `SELECT c.*, e.nom AS entity_nom, t.titre AS template_titre,
              rh.nom AS rh_nom, rh.prenom AS rh_prenom, rs.nom AS resp_nom, rs.prenom AS resp_prenom
         FROM rh_recrutement_campaigns c
         LEFT JOIN entities e ON e.id = c.entity_id
         LEFT JOIN rh_recrutement_templates t ON t.id = c.template_id
         LEFT JOIN users rh ON rh.id = c.responsable_rh_user_id
         LEFT JOIN users rs ON rs.id = c.responsable_service_user_id
        WHERE c.id = $1`, [Number(req.params.id)]);
    if (!c) return res.status(404).json({ error: 'Campagne introuvable.' });
    c.candidates = await all(
      `SELECT ca.*, v.code AS variant_code,
              (i.id IS NOT NULL) AS a_invitation, i.login AS invit_login, i.actif AS invit_actif, i.sent_at AS invit_sent_at, i.expires_at AS invit_expires_at
         FROM rh_recrutement_candidates ca
         LEFT JOIN rh_recrutement_template_variants v ON v.id = ca.variant_id
         LEFT JOIN rh_recrutement_invitations i ON i.candidate_id = ca.id
        WHERE ca.campaign_id = $1 ORDER BY ca.nom, ca.prenom`, [c.id]);
    // Variantes du modèle de la campagne (pour attribuer une variante au candidat).
    c.variants = c.template_id
      ? await all('SELECT id, code, libelle FROM rh_recrutement_template_variants WHERE template_id = $1 ORDER BY ordre, id', [c.template_id])
      : [];
    res.json(c);
  } catch (e) { next(e); }
});

router.post('/campaigns', requireManage, async (req, res, next) => {
  try {
    const p = parseCampaign(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const c = p.c;
    const row = await one(
      `INSERT INTO rh_recrutement_campaigns
         (intitule, description, entity_id, departement, poste, type_contrat, nb_postes, date_debut, date_fin,
          responsable_rh_user_id, responsable_service_user_id, template_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [c.intitule, c.description, c.entity_id, c.departement, c.poste, c.type_contrat, c.nb_postes, c.date_debut, c.date_fin,
       c.responsable_rh_user_id, c.responsable_service_user_id, c.template_id, req.user.id]);
    // Code lisible basé sur l'id (REC-AAAA-###).
    const code = `REC-${new Date().getFullYear()}-${String(row.id).padStart(3, '0')}`;
    const withCode = await one('UPDATE rh_recrutement_campaigns SET code = $1 WHERE id = $2 RETURNING *', [code, row.id]);
    res.status(201).json(withCode);
  } catch (e) { next(e); }
});

router.put('/campaigns/:id', requireManage, async (req, res, next) => {
  try {
    const p = parseCampaign(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const c = p.c;
    const row = await one(
      `UPDATE rh_recrutement_campaigns SET intitule=$1, description=$2, entity_id=$3, departement=$4, poste=$5,
              type_contrat=$6, nb_postes=$7, date_debut=$8, date_fin=$9, responsable_rh_user_id=$10,
              responsable_service_user_id=$11, template_id=$12, updated_at=now() WHERE id=$13 RETURNING *`,
      [c.intitule, c.description, c.entity_id, c.departement, c.poste, c.type_contrat, c.nb_postes, c.date_debut, c.date_fin,
       c.responsable_rh_user_id, c.responsable_service_user_id, c.template_id, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Campagne introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/statut', requireManage, async (req, res, next) => {
  try {
    const statut = req.body && req.body.statut;
    if (!CAMPAIGN_STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
    const row = await one('UPDATE rh_recrutement_campaigns SET statut=$1, updated_at=now() WHERE id=$2 RETURNING *', [statut, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Campagne introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/campaigns/:id', requireManage, async (req, res, next) => {
  try { await run('DELETE FROM rh_recrutement_campaigns WHERE id=$1', [Number(req.params.id)]); res.status(204).end(); } // candidats + invitations en cascade
  catch (e) { next(e); }
});

// ── Candidats ───────────────────────────────────────────────────────────────────────────────────
function parseCandidate(b) {
  const nom = String(b.nom || '').trim(), prenom = String(b.prenom || '').trim();
  if (!nom || !prenom) return { error: 'Nom et prénom sont obligatoires.' };
  const d = (v) => (v && String(v).trim() ? String(v).trim() : null);
  return { c: { nom, prenom, email: d(b.email), telephone: d(b.telephone), adresse: d(b.adresse), poste: d(b.poste), commentaire_interne: d(b.commentaire_interne) } };
}

router.post('/campaigns/:id/candidates', requireManage, async (req, res, next) => {
  try {
    const p = parseCandidate(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const camp = await one('SELECT id, template_id FROM rh_recrutement_campaigns WHERE id=$1', [Number(req.params.id)]);
    if (!camp) return res.status(404).json({ error: 'Campagne introuvable.' });
    const c = p.c;
    const row = await one(
      `INSERT INTO rh_recrutement_candidates (campaign_id, nom, prenom, email, telephone, adresse, poste, template_id, commentaire_interne, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [camp.id, c.nom, c.prenom, c.email, c.telephone, c.adresse, c.poste, camp.template_id, c.commentaire_interne, req.user.id]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/candidates/:id', requireManage, async (req, res, next) => {
  try {
    const p = parseCandidate(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    const c = p.c;
    const row = await one(
      `UPDATE rh_recrutement_candidates SET nom=$1, prenom=$2, email=$3, telephone=$4, adresse=$5, poste=$6,
              commentaire_interne=$7, updated_at=now() WHERE id=$8 RETURNING *`,
      [c.nom, c.prenom, c.email, c.telephone, c.adresse, c.poste, c.commentaire_interne, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Candidat introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/candidates/:id', requireManage, async (req, res, next) => {
  try { await run('DELETE FROM rh_recrutement_candidates WHERE id=$1', [Number(req.params.id)]); res.status(204).end(); }
  catch (e) { next(e); }
});

// ── Génération et administration des accès (invitations) ──────────────────────────────────────────
function genLogin(cand) {
  const base = `${(cand.prenom || '').charAt(0)}${cand.nom || ''}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 14) || 'candidat';
  return `${base}${Math.floor(10 + Math.random() * 89)}`;
}
function genPassword() {
  // 8 caractères lisibles (sans caractères ambigus).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  let p = ''; for (let i = 0; i < 8; i++) p += alphabet[crypto.randomInt(alphabet.length)];
  return p;
}
function testLink(token) {
  const base = (env.appUrl || '').replace(/\/$/, '');
  return `${base}/recrutement/test/${token}`;
}

async function loadCandidateWithCampaign(id) {
  return one(
    `SELECT ca.*, c.template_id AS campaign_template_id, c.date_fin AS campaign_date_fin
       FROM rh_recrutement_candidates ca JOIN rh_recrutement_campaigns c ON c.id = ca.campaign_id
      WHERE ca.id = $1`, [id]);
}

// Génère (ou régénère) l'accès : token + identifiant + mot de passe temporaire. Le mot de passe en
// clair n'est renvoyé qu'ici (et à la réinitialisation) — jamais stocké en clair.
router.post('/candidates/:id/generate-access', requireManage, async (req, res, next) => {
  try {
    const cand = await loadCandidateWithCampaign(Number(req.params.id));
    if (!cand) return res.status(404).json({ error: 'Candidat introuvable.' });
    const templateId = cand.template_id || cand.campaign_template_id;
    if (!templateId) return res.status(400).json({ error: "Aucun modèle de test n'est associé à la campagne." });
    const variantId = req.body && req.body.variant_id ? Number(req.body.variant_id) : (cand.variant_id || null);
    if (!variantId) return res.status(400).json({ error: 'Choisissez une variante à attribuer au candidat.' });
    const variant = await one('SELECT id FROM rh_recrutement_template_variants WHERE id=$1 AND template_id=$2', [variantId, templateId]);
    if (!variant) return res.status(400).json({ error: 'Variante invalide pour le modèle de la campagne.' });
    const tpl = await one('SELECT duree_min, tentatives_autorisees FROM rh_recrutement_templates WHERE id=$1', [templateId]);

    const token = crypto.randomBytes(24).toString('hex');
    const existing = await one('SELECT id, login FROM rh_recrutement_invitations WHERE candidate_id=$1', [cand.id]);
    const login = existing ? existing.login : genLogin(cand);
    const password = genPassword();
    const password_hash = await bcrypt.hash(password, 10);
    // Expiration : date de fin de campagne (fin de journée) sinon +7 jours.
    const expires = cand.campaign_date_fin ? new Date(`${cand.campaign_date_fin}T23:59:59`) : new Date(Date.now() + 7 * 864e5);

    await withTransaction(async (tx) => {
      if (existing) {
        await tx.run(
          `UPDATE rh_recrutement_invitations SET token=$1, password_hash=$2, template_id=$3, variant_id=$4,
                  expires_at=$5, duree_min=$6, tentatives_max=$7, actif=true, updated_at=now() WHERE candidate_id=$8`,
          [token, password_hash, templateId, variantId, expires, tpl.duree_min, tpl.tentatives_autorisees, cand.id]);
      } else {
        await tx.run(
          `INSERT INTO rh_recrutement_invitations (candidate_id, token, login, password_hash, template_id, variant_id, expires_at, duree_min, tentatives_max)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [cand.id, token, login, password_hash, templateId, variantId, expires, tpl.duree_min, tpl.tentatives_autorisees]);
      }
      await tx.run("UPDATE rh_recrutement_candidates SET template_id=$1, variant_id=$2, statut='invitation_generee', updated_at=now() WHERE id=$3", [templateId, variantId, cand.id]);
    });
    res.json({ login, password, link: testLink(token), expires_at: expires });
  } catch (e) { next(e); }
});

router.post('/candidates/:id/reset-password', requireManage, async (req, res, next) => {
  try {
    const inv = await one('SELECT id FROM rh_recrutement_invitations WHERE candidate_id=$1', [Number(req.params.id)]);
    if (!inv) return res.status(404).json({ error: "Aucun accès généré pour ce candidat." });
    const password = genPassword();
    await run('UPDATE rh_recrutement_invitations SET password_hash=$1, updated_at=now() WHERE candidate_id=$2', [await bcrypt.hash(password, 10), Number(req.params.id)]);
    res.json({ password });
  } catch (e) { next(e); }
});

router.post('/candidates/:id/revoke', requireManage, async (req, res, next) => {
  try {
    const r = await one('UPDATE rh_recrutement_invitations SET actif=false, updated_at=now() WHERE candidate_id=$1 RETURNING id', [Number(req.params.id)]);
    if (!r) return res.status(404).json({ error: 'Aucun accès à révoquer.' });
    await run("UPDATE rh_recrutement_candidates SET statut='acces_suspendu', updated_at=now() WHERE id=$1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/candidates/:id/reactivate', requireManage, async (req, res, next) => {
  try {
    const r = await one('UPDATE rh_recrutement_invitations SET actif=true, updated_at=now() WHERE candidate_id=$1 RETURNING id', [Number(req.params.id)]);
    if (!r) return res.status(404).json({ error: 'Aucun accès.' });
    await run("UPDATE rh_recrutement_candidates SET statut='invitation_generee', updated_at=now() WHERE id=$1 AND statut='acces_suspendu'", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Métadonnées d'accès (pour copier le lien / l'identifiant) — ne renvoie JAMAIS le mot de passe.
router.get('/candidates/:id/access', requireView, async (req, res, next) => {
  try {
    const inv = await one('SELECT login, token, actif, sent_at, expires_at, duree_min FROM rh_recrutement_invitations WHERE candidate_id=$1', [Number(req.params.id)]);
    if (!inv) return res.json(null);
    res.json({ login: inv.login, link: testLink(inv.token), actif: inv.actif, sent_at: inv.sent_at, expires_at: inv.expires_at, duree_min: inv.duree_min });
  } catch (e) { next(e); }
});

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Envoi de l'invitation par e-mail (lien + identifiant + durée + date limite). Le mot de passe est
// communiqué séparément par la RH (il n'est jamais mis dans cet e-mail).
router.post('/candidates/:id/send-invitation', requireManage, async (req, res, next) => {
  try {
    const cand = await one(
      `SELECT ca.*, c.intitule AS campagne, c.poste AS campagne_poste, i.login, i.token, i.expires_at, i.duree_min
         FROM rh_recrutement_candidates ca
         JOIN rh_recrutement_campaigns c ON c.id = ca.campaign_id
         JOIN rh_recrutement_invitations i ON i.candidate_id = ca.id
        WHERE ca.id = $1`, [Number(req.params.id)]);
    if (!cand) return res.status(404).json({ error: "Aucun accès généré pour ce candidat." });
    if (!cand.email) return res.status(400).json({ error: "Le candidat n'a pas d'adresse e-mail." });

    const poste = cand.poste || cand.campagne_poste || cand.campagne;
    const deadline = cand.expires_at ? new Date(cand.expires_at).toLocaleString('fr-FR') : '—';
    const link = testLink(cand.token);
    const bodyHtml = `
      <p>Bonjour ${esc(cand.prenom)} ${esc(cand.nom)},</p>
      <p>Dans le cadre de votre candidature au poste de <strong>${esc(poste)}</strong>, nous vous invitons à réaliser un test de recrutement en ligne.</p>
      <p><strong>Informations de connexion :</strong></p>
      <ul>
        <li>Lien du test : <a href="${esc(link)}">${esc(link)}</a></li>
        <li>Identifiant : <strong>${esc(cand.login)}</strong></li>
        <li>Durée du test : ${cand.duree_min} minutes</li>
        <li>Date limite : ${esc(deadline)}</li>
      </ul>
      <p>Votre mot de passe temporaire vous sera communiqué séparément.</p>
      <p>Installez-vous au calme avec une connexion Internet stable. Une fois le test commencé, le chronomètre ne pourra pas être réinitialisé.</p>
      <p>Cordialement,<br/>Service Ressources humaines — CCG Groupe</p>`;
    await mailer.sendMail({
      to: cand.email,
      subject: 'Invitation à un test de recrutement – CCG Groupe',
      text: `Bonjour ${cand.prenom} ${cand.nom}, test de recrutement : ${link} — identifiant ${cand.login} — durée ${cand.duree_min} min — date limite ${deadline}. Mot de passe communiqué séparément.`,
      html: mailer.renderMailTemplate({ title: 'Invitation à un test de recrutement', bodyHtml }),
    });
    await run("UPDATE rh_recrutement_invitations SET sent_at=now(), updated_at=now() WHERE candidate_id=$1", [cand.id]);
    await run("UPDATE rh_recrutement_candidates SET statut='invitation_envoyee', updated_at=now() WHERE id=$1 AND statut IN ('invitation_generee','acces_suspendu')", [cand.id]);
    res.json({ ok: true, to: cand.email });
  } catch (e) { next(e); }
});

module.exports = router;
