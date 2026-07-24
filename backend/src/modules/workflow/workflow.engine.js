// Moteur de workflow générique : lit sa configuration en base (workflow_templates / workflow_steps),
// ne code JAMAIS en dur l'enchaînement des étapes d'un module précis. Réutilisable pour
// tout futur module (BC commerciaux, etc.) — voir SPEC.md §3.2.
const { all, one } = require('../../db');

async function getTemplate(moduleCode) {
  return one('SELECT * FROM workflow_templates WHERE module_code = $1 AND actif = true', [moduleCode]);
}

async function getSteps(templateId) {
  return all('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [templateId]);
}

async function getStepByCode(templateId, code) {
  return one('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 AND code = $2', [templateId, code]);
}

async function getFirstStep(templateId) {
  return one('SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre LIMIT 1', [templateId]);
}

// Étape suivante dans l'ordre défini, ou null si l'étape courante est la dernière.
async function getNextStep(templateId, currentOrdre) {
  return one(
    'SELECT * FROM workflow_steps WHERE workflow_template_id = $1 AND ordre > $2 ORDER BY ordre LIMIT 1',
    [templateId, currentOrdre]
  );
}

module.exports = { getTemplate, getSteps, getStepByCode, getFirstStep, getNextStep };
