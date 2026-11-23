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

  return { analyses, production, expeditions, nc, capaRetard, ncOuvertes, lots, tendance };
}

module.exports = { getDashboard };
