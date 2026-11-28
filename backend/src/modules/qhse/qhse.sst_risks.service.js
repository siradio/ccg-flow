// Module QHSE — Volet SST (SST-02). Évaluation des risques professionnels. Score = G×P×E (1→64) et
// niveau calculés côté serveur (seuils = proposition du doc de cadrage, à valider par l'entreprise).
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// Seuils par défaut (proposition) : 1-8 faible, 9-16 modéré, 17-32 élevé, 33-64 critique.
function niveauFromScore(score) {
  if (score == null) return null;
  if (score <= 8) return 'faible';
  if (score <= 16) return 'modere';
  if (score <= 32) return 'eleve';
  return 'critique';
}
function f1a4(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null; }

async function listRisks() {
  return all(`SELECT r.*, bu.nom AS bu_nom FROM qhse_sst_risks r LEFT JOIN business_units bu ON bu.id = r.business_unit_id ORDER BY r.score DESC NULLS LAST, r.id DESC`);
}

function clean(b) {
  const g = f1a4(b.gravite), p = f1a4(b.probabilite), e = f1a4(b.exposition);
  const score = (g != null && p != null && e != null) ? g * p * e : null;
  return {
    unite_travail: b.unite_travail || null, business_unit_id: b.business_unit_id ? Number(b.business_unit_id) : null,
    danger: b.danger || null, risque: b.risque || null,
    personnes_exposees: b.personnes_exposees === '' || b.personnes_exposees == null ? null : Number(b.personnes_exposees),
    gravite: g, probabilite: p, exposition: e, score, niveau: niveauFromScore(score),
    mesures_existantes: b.mesures_existantes || null, mesures_prevues: b.mesures_prevues || null,
    responsable: b.responsable || null, echeance: b.echeance || null,
    statut: b.statut === 'maitrise' ? 'maitrise' : 'ouvert',
  };
}

async function createRisk(user, b) {
  const c = clean(b);
  return one(
    `INSERT INTO qhse_sst_risks (unite_travail, business_unit_id, danger, risque, personnes_exposees, gravite, probabilite, exposition, score, niveau, mesures_existantes, mesures_prevues, responsable, echeance, statut, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [c.unite_travail, c.business_unit_id, c.danger, c.risque, c.personnes_exposees, c.gravite, c.probabilite, c.exposition, c.score, c.niveau, c.mesures_existantes, c.mesures_prevues, c.responsable, c.echeance, c.statut, user.id]
  );
}

async function updateRisk(user, id, b) {
  const c = clean(b);
  const row = await one(
    `UPDATE qhse_sst_risks SET unite_travail=$1, business_unit_id=$2, danger=$3, risque=$4, personnes_exposees=$5,
            gravite=$6, probabilite=$7, exposition=$8, score=$9, niveau=$10, mesures_existantes=$11, mesures_prevues=$12,
            responsable=$13, echeance=$14, statut=$15, updated_at=now() WHERE id=$16 RETURNING *`,
    [c.unite_travail, c.business_unit_id, c.danger, c.risque, c.personnes_exposees, c.gravite, c.probabilite, c.exposition, c.score, c.niveau, c.mesures_existantes, c.mesures_prevues, c.responsable, c.echeance, c.statut, id]
  );
  if (!row) throw httpError(404, 'Risque introuvable.');
  return row;
}

async function removeRisk(id) { await run('DELETE FROM qhse_sst_risks WHERE id = $1', [id]); }

module.exports = { listRisks, createRisk, updateRisk, removeRisk };
