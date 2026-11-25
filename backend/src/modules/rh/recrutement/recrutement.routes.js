const express = require('express');
const { all, one, run, withTransaction } = require('../../../db');
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

module.exports = router;
