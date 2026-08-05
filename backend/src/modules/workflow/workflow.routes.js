const express = require('express');
const { pool, one, all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin, requireSubModule } = require('../../middleware/permissions');

const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('achats'));

// SLA (délai cible de l'étape) en jours : entier positif, ou NULL si non défini (« pas de SLA »).
function slaJours(s) {
  const v = s.sla_jours;
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// Un template par module_code peut être "archivé" (actif = false) lors d'un versionnement (voir
// PUT ci-dessous) — au-delà de ce cas, il n'y en a jamais qu'un seul actif à la fois (contrainte
// partielle en base, migration 016), donc ce lookup reste sans ambiguïté.
router.get('/:moduleCode', requireAuth, async (req, res, next) => {
  try {
    const template = await one('SELECT * FROM workflow_templates WHERE module_code = $1 AND actif = true', [req.params.moduleCode]);
    if (!template) return res.status(404).json({ error: 'Workflow introuvable.' });
    const steps = await all('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [template.id]);
    res.json({ ...template, steps });
  } catch (e) { next(e); }
});

// Pour afficher le circuit exact suivi par UNE demande précise (purchase_requests.workflow_template_id) :
// une fois une nouvelle version créée, le template actif n'est plus forcément celui de cette demande,
// et le circuit affiché doit rester celui qu'elle suit réellement, pas le circuit courant.
router.get('/by-id/:templateId', requireAuth, async (req, res, next) => {
  try {
    const template = await one('SELECT * FROM workflow_templates WHERE id = $1', [Number(req.params.templateId)]);
    if (!template) return res.status(404).json({ error: 'Workflow introuvable.' });
    const steps = await all('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [template.id]);
    res.json({ ...template, steps });
  } catch (e) { next(e); }
});

// Met à jour la définition des étapes d'un workflow (admin uniquement) : diff avec l'existant
// plutôt qu'un "tout supprimer puis tout réinsérer" — les demandes d'achat déjà passées par une
// étape gardée/éditée y sont encore rattachées via FK (purchase_requests.current_step_id,
// approvals.workflow_step_id), et Postgres refuse la suppression d'une ligne encore référencée.
// Recréer systématiquement toutes les lignes (donc avec de nouveaux id) cassait cette référence
// dès qu'une seule demande avait déjà transité par le workflow — ce qui arrive en pratique presque
// tout de suite. On ne supprime donc que les étapes réellement retirées par l'utilisateur, en
// gardant l'id stable pour celles qui restent (même simplement réordonnées ou renommées).
//
// Si une étape à supprimer est déjà référencée par au moins une demande (en cours ou terminée), la
// suppression "en place" est impossible sans casser cette référence — au lieu de bloquer, on
// VERSIONNE : l'ancien template est figé (actif = false, ses étapes ne bougent plus jamais) et une
// nouvelle version active est créée avec le circuit désiré. Les demandes déjà engagées restent sur
// l'ancien circuit jusqu'à leur terme ; les nouvelles utilisent le nouveau (workflowEngine.getTemplate
// filtre déjà sur actif = true, donc rien d'autre à changer côté création de demande).
//
// Les UPDATE "en place" passent par une phase intermédiaire avec des ordre/code temporaires
// uniques (au lieu des valeurs finales directement) : `UNIQUE(workflow_template_id, ordre|code)`
// rejetterait sinon une réécriture en une seule passe dès qu'un glisser-déposer permute deux étapes.
//
// Toute la fonction tourne dans une seule transaction (client dédié, pas le pool partagé) : sans
// ça, un échec à mi-chemin laisserait les étapes (ou les templates, en cas de versionnement) dans
// un état incohérent.
// Body: { steps: [{ id?, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code }, ...] }
router.put('/:moduleCode', requireAuth, requireSuperAdmin, async (req, res, next) => {
  const template = await one('SELECT * FROM workflow_templates WHERE module_code = $1 AND actif = true', [req.params.moduleCode]);
  if (!template) return res.status(404).json({ error: 'Workflow introuvable.' });
  const { steps } = req.body || {};
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'steps (tableau non vide) requis.' });
  }
  const codes = steps.map(s => s.code);
  if (codes.some(c => !c) || new Set(codes).size !== codes.length) {
    return res.status(400).json({ error: 'Chaque étape doit avoir un code non vide et unique.' });
  }
  // Une seule étape "système" (role_code_requis vide) est autorisée : c'est elle que le moteur
  // générique traite comme le terminus du circuit (génération auto du BC dès qu'il n'y a plus de
  // rôle à valider, purchase-requests.service.js#validateStep) — vérifié aussi côté serveur, pas
  // seulement dans l'éditeur (frontend/.../WorkflowConfig.jsx), qui bloque déjà ce cas en amont.
  if (steps.filter(s => !s.role_code_requis).length > 1) {
    return res.status(400).json({ error: "Une seule étape système (sans rôle requis) est autorisée dans le circuit." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Si un code est renommé, on répercute le changement sur les "retour_step_code" qui le
    // référençaient ailleurs, pour ne jamais casser silencieusement le circuit de refus.
    const { rows: existing } = await client.query('SELECT id, code FROM workflow_steps WHERE workflow_template_id = $1', [template.id]);
    const existingIds = new Set(existing.map(s => s.id));
    const oldCodeById = new Map(existing.map(s => [s.id, s.code]));
    const codeRenames = new Map();
    for (const s of steps) {
      const oldCode = oldCodeById.get(s.id);
      if (oldCode && oldCode !== s.code) codeRenames.set(oldCode, s.code);
    }
    const resolveRetourCode = code => codeRenames.get(code) || code;

    const keptIds = new Set(steps.filter(s => existingIds.has(s.id)).map(s => s.id));
    const removedIds = existing.map(s => s.id).filter(id => !keptIds.has(id));

    let needsVersioning = false;
    if (removedIds.length > 0) {
      const { rows: refs } = await client.query(
        `SELECT 1 FROM approvals WHERE workflow_step_id = ANY($1::int[])
         UNION ALL
         SELECT 1 FROM purchase_requests WHERE current_step_id = ANY($1::int[])
         LIMIT 1`,
        [removedIds]
      );
      needsVersioning = refs.length > 0;
    }

    let resultTemplate = template;
    if (needsVersioning) {
      await client.query('UPDATE workflow_templates SET actif = false WHERE id = $1', [template.id]);
      const { rows: [newTemplate] } = await client.query(
        'INSERT INTO workflow_templates (module_code, nom, actif) VALUES ($1,$2,true) RETURNING *',
        [template.module_code, template.nom]
      );
      resultTemplate = newTemplate;
      for (const s of steps) {
        const retourStepCode = resolveRetourCode(s.retour_step_code || null);
        await client.query(
          `INSERT INTO workflow_steps
             (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code, sla_jours)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            newTemplate.id, s.ordre, s.code, s.nom, s.role_code_requis || null,
            !!s.commentaire_obligatoire_si_refus, s.comportement_si_refus || null, retourStepCode, slaJours(s),
          ]
        );
      }
    } else {
      if (removedIds.length > 0) {
        await client.query('DELETE FROM workflow_steps WHERE id = ANY($1::int[])', [removedIds]);
      }

      const toUpdate = steps.filter(s => existingIds.has(s.id));
      const toInsert = steps.filter(s => !existingIds.has(s.id));

      // Phase 1 : valeurs temporaires uniques (dérivées de l'id, donc déjà uniques entre elles).
      for (const s of toUpdate) {
        await client.query(
          'UPDATE workflow_steps SET ordre = $1, code = $2 WHERE id = $3',
          [-s.id, `__tmp_${s.id}__`, s.id]
        );
      }
      // Phase 2 : valeurs réelles, plus aucune collision possible entre lignes existantes.
      for (const s of toUpdate) {
        const retourStepCode = resolveRetourCode(s.retour_step_code || null);
        await client.query(
          `UPDATE workflow_steps SET
             ordre = $1, code = $2, nom = $3, role_code_requis = $4,
             commentaire_obligatoire_si_refus = $5, comportement_si_refus = $6, retour_step_code = $7, sla_jours = $8
           WHERE id = $9`,
          [
            s.ordre, s.code, s.nom, s.role_code_requis || null,
            !!s.commentaire_obligatoire_si_refus, s.comportement_si_refus || null, retourStepCode, slaJours(s), s.id,
          ]
        );
      }
      for (const s of toInsert) {
        const retourStepCode = resolveRetourCode(s.retour_step_code || null);
        await client.query(
          `INSERT INTO workflow_steps
             (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code, sla_jours)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            template.id, s.ordre, s.code, s.nom, s.role_code_requis || null,
            !!s.commentaire_obligatoire_si_refus, s.comportement_si_refus || null, retourStepCode, slaJours(s),
          ]
        );
      }
    }

    const { rows: updatedSteps } = await client.query('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [resultTemplate.id]);
    await client.query('COMMIT');
    res.json({ ...resultTemplate, steps: updatedSteps, versioned: needsVersioning });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
