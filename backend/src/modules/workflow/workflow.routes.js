const express = require('express');
const { one, all, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');

const router = express.Router();

router.get('/:moduleCode', requireAuth, async (req, res, next) => {
  try {
    const template = await one('SELECT * FROM workflow_templates WHERE module_code = $1', [req.params.moduleCode]);
    if (!template) return res.status(404).json({ error: 'Workflow introuvable.' });
    const steps = await all('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [template.id]);
    res.json({ ...template, steps });
  } catch (e) { next(e); }
});

// Remplace intégralement la définition des étapes d'un workflow (admin uniquement).
// Body: { steps: [{ ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code }, ...] }
router.put('/:moduleCode', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const template = await one('SELECT * FROM workflow_templates WHERE module_code = $1', [req.params.moduleCode]);
    if (!template) return res.status(404).json({ error: 'Workflow introuvable.' });
    const { steps } = req.body || {};
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'steps (tableau non vide) requis.' });
    }
    const codes = steps.map(s => s.code);
    if (codes.some(c => !c) || new Set(codes).size !== codes.length) {
      return res.status(400).json({ error: 'Chaque étape doit avoir un code non vide et unique.' });
    }

    // Si un code est renommé, on répercute le changement sur les "retour_step_code" qui le
    // référençaient ailleurs, pour ne jamais casser silencieusement le circuit de refus.
    const existing = await all('SELECT id, code FROM workflow_steps WHERE workflow_template_id = $1', [template.id]);
    const oldCodeById = new Map(existing.map(s => [s.id, s.code]));
    const codeRenames = new Map();
    for (const s of steps) {
      const oldCode = oldCodeById.get(s.id);
      if (oldCode && oldCode !== s.code) codeRenames.set(oldCode, s.code);
    }

    await run('DELETE FROM workflow_steps WHERE workflow_template_id = $1', [template.id]);
    for (const s of steps) {
      const retourStepCode = s.retour_step_code || null;
      await run(
        `INSERT INTO workflow_steps
           (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          template.id, s.ordre, s.code, s.nom, s.role_code_requis || null,
          !!s.commentaire_obligatoire_si_refus, s.comportement_si_refus || null,
          codeRenames.get(retourStepCode) || retourStepCode,
        ]
      );
    }
    const updatedSteps = await all('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [template.id]);
    res.json({ ...template, steps: updatedSteps });
  } catch (e) { next(e); }
});

module.exports = router;
