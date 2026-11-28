// Module QHSE — Lot 4. Tableau de bord : agrège l'existant (analyses, contrôles production &
// expéditions, non-conformités / CAPA, libération des lots). Lecture seule, aucun calcul inventé —
// de simples comptages sur les statuts / conformités déjà enregistrés.
const { all, one } = require('../../db');

// Répartition {valeur: compte} d'une colonne, en ignorant les NULL.
async function countBy(table, column, where) {
  const rows = await all(
    `SELECT ${column} AS k, COUNT(*)::int AS n FROM ${table}
      WHERE ${column} IS NOT NULL ${where ? 'AND ' + where : ''} GROUP BY ${column}`);
  const out = {};
  for (const r of rows) out[r.k] = r.n;
  return out;
}

async function getDashboard() {
  const analyses = {
    total: (await one('SELECT COUNT(*)::int AS n FROM qhse_analyses')).n,
    parStatut: await countBy('qhse_analyses', 'statut'),
    parConformite: await countBy('qhse_analyses', 'conformite'),
  };
  const production = {
    total: (await one('SELECT COUNT(*)::int AS n FROM qhse_production_controls')).n,
    parConformite: await countBy('qhse_production_controls', 'conformite'),
  };
  const expeditions = {
    total: (await one('SELECT COUNT(*)::int AS n FROM qhse_shipment_controls')).n,
    parConformite: await countBy('qhse_shipment_controls', 'conformite'),
  };
  const nc = {
    total: (await one('SELECT COUNT(*)::int AS n FROM qhse_nonconformities')).n,
    ouvertes: (await one(`SELECT COUNT(*)::int AS n FROM qhse_nonconformities WHERE statut <> 'cloturee'`)).n,
    parStatut: await countBy('qhse_nonconformities', 'statut'),
    parGravite: await all(
      `SELECT COALESCE(sv.libelle, '—') AS k, COUNT(*)::int AS n
         FROM qhse_nonconformities n LEFT JOIN qhse_nc_severities sv ON sv.id = n.severity_id
        WHERE n.statut <> 'cloturee' GROUP BY sv.libelle`),
  };
  // Actions CAPA en retard (échéance dépassée et non faites).
  const capaRetard = await all(
    `SELECT a.id, a.description, a.responsable, a.echeance, n.id AS nc_id, n.numero AS nc_numero
       FROM qhse_nc_actions a JOIN qhse_nonconformities n ON n.id = a.nc_id
      WHERE a.statut <> 'faite' AND a.echeance IS NOT NULL AND a.echeance < CURRENT_DATE
      ORDER BY a.echeance LIMIT 50`);
  // Non-conformités ouvertes (liste courte).
  const ncOuvertes = await all(
    `SELECT n.id, n.numero, n.date_detection, n.statut, n.product_nom, sv.libelle AS severity_libelle
       FROM (SELECT nn.*, p.designation AS product_nom FROM qhse_nonconformities nn
               LEFT JOIN products p ON p.id = nn.product_id) n
       LEFT JOIN qhse_nc_severities sv ON sv.id = n.severity_id
      WHERE n.statut <> 'cloturee' ORDER BY n.created_at DESC LIMIT 20`);
  // Lots sous statut qualité (répartition actuelle, lots statués uniquement).
  const lots = await countBy('stock_lots', 'statut_qualite');

  // --- Nouveaux modules (extension QHSE : réclamations, audits, métrologie, SST, GED, plan d'actions).
  // Lecture seule, simples comptages ; tables garanties par les migrations 132→140.
  const scalar = async (sql, params) => (await one(sql, params)).n;

  const complaints = {
    total: await scalar('SELECT COUNT(*)::int AS n FROM qhse_complaints'),
    ouvertes: await scalar(`SELECT COUNT(*)::int AS n FROM qhse_complaints WHERE statut <> 'cloturee'`),
  };
  const audits = {
    total: await scalar('SELECT COUNT(*)::int AS n FROM qhse_audits'),
    planifies: await scalar(`SELECT COUNT(*)::int AS n FROM qhse_audits WHERE statut = 'planifie'`),
  };
  const metrologie = {
    total: await scalar(`SELECT COUNT(*)::int AS n FROM qhse_equipment WHERE statut = 'en_service'`),
    aVerifier: await scalar(
      `SELECT COUNT(*)::int AS n FROM qhse_equipment
        WHERE statut = 'en_service' AND prochaine_verif IS NOT NULL AND prochaine_verif < CURRENT_DATE`),
  };
  const sstRisks = {
    total: await scalar('SELECT COUNT(*)::int AS n FROM qhse_sst_risks'),
    eleveCritique: await scalar(
      `SELECT COUNT(*)::int AS n FROM qhse_sst_risks WHERE statut = 'ouvert' AND niveau IN ('eleve', 'critique')`),
    parNiveau: await countBy('qhse_sst_risks', 'niveau', `statut = 'ouvert'`),
  };
  const sstAccidents = {
    total: await scalar('SELECT COUNT(*)::int AS n FROM qhse_sst_accidents'),
    avecArret: await scalar(`SELECT COUNT(*)::int AS n FROM qhse_sst_accidents WHERE type_evenement = 'accident_arret'`),
    parType: await countBy('qhse_sst_accidents', 'type_evenement'),
  };
  const documents = {
    total: await scalar('SELECT COUNT(*)::int AS n FROM qhse_documents'),
    aReviser: await scalar(
      `SELECT COUNT(*)::int AS n FROM qhse_documents
        WHERE statut = 'en_vigueur' AND date_revision IS NOT NULL AND date_revision < CURRENT_DATE`),
  };
  const actions = {
    total: await scalar('SELECT COUNT(*)::int AS n FROM qhse_actions'),
    ouvertes: await scalar(`SELECT COUNT(*)::int AS n FROM qhse_actions WHERE statut IN ('a_faire', 'en_cours')`),
    enRetard: await scalar(
      `SELECT COUNT(*)::int AS n FROM qhse_actions
        WHERE statut IN ('a_faire', 'en_cours') AND echeance IS NOT NULL AND echeance < CURRENT_DATE`),
  };
  // Listes de suivi des nouveaux modules.
  const equipementsAVerifier = await all(
    `SELECT id, code, libelle, prochaine_verif FROM qhse_equipment
      WHERE statut = 'en_service' AND prochaine_verif IS NOT NULL AND prochaine_verif < CURRENT_DATE
      ORDER BY prochaine_verif LIMIT 20`);
  const actionsRetard = await all(
    `SELECT a.id, a.numero, a.description, a.responsable, a.echeance, a.origine, bu.nom AS bu_nom
       FROM qhse_actions a LEFT JOIN business_units bu ON bu.id = a.business_unit_id
      WHERE a.statut IN ('a_faire', 'en_cours') AND a.echeance IS NOT NULL AND a.echeance < CURRENT_DATE
      ORDER BY a.echeance LIMIT 20`);
  const documentsAReviser = await all(
    `SELECT id, reference, titre, version, date_revision FROM qhse_documents
      WHERE statut = 'en_vigueur' AND date_revision IS NOT NULL AND date_revision < CURRENT_DATE
      ORDER BY date_revision LIMIT 20`);

  // Tendance sur 6 mois (mois vides inclus) : volume d'analyses, dont non conformes, et NC ouvertes.
  const tendance = await all(
    `SELECT to_char(m, 'YYYY-MM') AS mois,
       (SELECT COUNT(*)::int FROM qhse_analyses a
          WHERE date_trunc('month', a.created_at)::date = m::date) AS analyses,
       (SELECT COUNT(*)::int FROM qhse_analyses a
          WHERE date_trunc('month', a.created_at)::date = m::date AND a.conformite = 'non_conforme') AS analyses_nc,
       (SELECT COUNT(*)::int FROM qhse_nonconformities n
          WHERE date_trunc('month', n.created_at)::date = m::date) AS nc,
       (SELECT COUNT(*)::int FROM qhse_production_controls c
          WHERE date_trunc('month', c.created_at)::date = m::date) AS production,
       (SELECT COUNT(*)::int FROM qhse_shipment_controls c
          WHERE date_trunc('month', c.created_at)::date = m::date) AS expeditions
     FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                          date_trunc('month', CURRENT_DATE), interval '1 month') AS m
     ORDER BY m`);

  return {
    analyses, production, expeditions, nc, capaRetard, ncOuvertes, lots, tendance,
    complaints, audits, metrologie, sstRisks, sstAccidents, documents, actions,
    equipementsAVerifier, actionsRetard, documentsAReviser,
  };
}

module.exports = { getDashboard };
