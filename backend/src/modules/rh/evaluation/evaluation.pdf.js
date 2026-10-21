const { all, one, run } = require('../../../db');
const { generateEvaluationPdf } = require('../../../utils/pdf');

// Génération + archivage du PDF de la fiche d'évaluation (à la finalisation, ou au téléchargement
// si l'archive n'existe pas encore). Document en français.

async function buildBuffer(evaluationId) {
  const e = await one(`
    SELECT ev.*, emp.poste,
           TRIM(CONCAT(emp.prenom,' ',emp.nom)) AS employe_nom,
           TRIM(CONCAT(mu.prenom,' ',mu.nom)) AS manager_nom,
           camp.libelle AS campagne_libelle
      FROM rh_evaluations ev
      LEFT JOIN employees emp ON emp.id = ev.employee_id
      LEFT JOIN users mu ON mu.id = ev.manager_user_id
      LEFT JOIN rh_eval_campaigns camp ON camp.id = ev.campaign_id
     WHERE ev.id = $1`, [evaluationId]);
  if (!e) return null;
  const lignes = await all('SELECT * FROM rh_evaluation_lignes WHERE evaluation_id = $1 ORDER BY ordre, id', [evaluationId]);
  return generateEvaluationPdf({ evaluation: e, lignes, employeNom: e.employe_nom, managerNom: e.manager_nom, campagne: e.campagne_libelle });
}

async function generateAndStore(evaluationId, userId) {
  const buf = await buildBuffer(evaluationId);
  if (!buf) return null;
  await run(
    `INSERT INTO rh_evaluation_documents (evaluation_id, type, contenu, mime, genere_par)
     VALUES ($1, 'fiche', $2, 'application/pdf', $3)
     ON CONFLICT (evaluation_id, type)
       DO UPDATE SET contenu = EXCLUDED.contenu, genere_par = EXCLUDED.genere_par, genere_at = now()`,
    [evaluationId, buf, userId || null]);
  return buf;
}

async function getStored(evaluationId) {
  return one(`SELECT contenu, mime FROM rh_evaluation_documents WHERE evaluation_id = $1 AND type = 'fiche'`, [evaluationId]);
}

module.exports = { buildBuffer, generateAndStore, getStored };
