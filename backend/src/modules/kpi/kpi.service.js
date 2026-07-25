const { all, one } = require('../../db');

async function getAchatsKpi() {
  const prByStatusRows = await all('SELECT status, COUNT(*)::int AS count FROM purchase_requests GROUP BY status');
  const prByStatus = Object.fromEntries(prByStatusRows.map(r => [r.status, r.count]));

  const prByEntity = await all(
    `SELECT e.code AS entity_code, COUNT(pr.id)::int AS count
     FROM entities e LEFT JOIN purchase_requests pr ON pr.entity_id = e.id
     GROUP BY e.code ORDER BY e.code`
  );

  const montantParDevise = await all(
    `SELECT devise, COALESCE(SUM(montant_final), 0)::float AS total
     FROM purchase_requests WHERE status = 'bon_commande_genere' GROUP BY devise`
  );

  // Taux de refus = part des demandes soumises ayant subi au moins un refus au cours de leur
  // circuit — plus parlant que le seul statut final "rejetee", qui ne survient que si une étape
  // est configurée en "annulation" (par défaut tout refus renvoie au service achat, cf. §3.1).
  const totalSoumises = await one(
    "SELECT COUNT(*)::int AS n FROM purchase_requests WHERE status != 'brouillon'"
  );
  const refusees = await one(
    "SELECT COUNT(DISTINCT purchase_request_id)::int AS n FROM approvals WHERE statut = 'refusee'"
  );
  const tauxRefus = {
    totalSoumises: totalSoumises.n,
    aSubiUnRefus: refusees.n,
    taux: totalSoumises.n > 0 ? refusees.n / totalSoumises.n : null,
  };

  const delai = await one(
    `SELECT AVG(EXTRACT(EPOCH FROM (po.generated_at - pr.created_at)) / 86400.0)::float AS jours
     FROM purchase_orders po JOIN purchase_requests pr ON pr.id = po.purchase_request_id`
  );

  const topFournisseurs = await all(
    `SELECT s.nom AS supplier_nom, po.devise, SUM(po.montant)::float AS total
     FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
     GROUP BY s.nom, po.devise
     ORDER BY total DESC
     LIMIT 5`
  );

  return {
    prByStatus,
    prByEntity,
    montantParDevise,
    tauxRefus,
    delaiMoyenJours: delai.jours,
    topFournisseurs,
  };
}

async function getRhKpi() {
  const effectifParStatutRows = await all('SELECT statut, COUNT(*)::int AS count FROM employees GROUP BY statut');
  const effectifParStatut = Object.fromEntries(effectifParStatutRows.map(r => [r.statut, r.count]));

  const effectifParBusinessUnit = await all(
    `SELECT COALESCE(bu.nom, 'Sans BU') AS business_unit, COUNT(e.id)::int AS count
     FROM employees e LEFT JOIN business_units bu ON bu.id = e.business_unit_id
     WHERE e.statut = 'actif'
     GROUP BY bu.nom ORDER BY count DESC`
  );

  const effectifParEntite = await all(
    `SELECT ent.code AS entity_code, COUNT(e.id)::int AS count
     FROM entities ent LEFT JOIN employees e ON e.entity_id = ent.id AND e.statut = 'actif'
     GROUP BY ent.code ORDER BY ent.code`
  );

  const effectifParContratRows = await all(
    `SELECT COALESCE(type_contrat, 'Non renseigné') AS type_contrat, COUNT(*)::int AS count
     FROM employees WHERE statut = 'actif' GROUP BY type_contrat`
  );
  const effectifParContrat = Object.fromEntries(effectifParContratRows.map(r => [r.type_contrat, r.count]));

  const anciennete = await one(
    `SELECT AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_embauche)))::float AS annees
     FROM employees WHERE statut = 'actif' AND date_embauche IS NOT NULL`
  );

  return {
    effectifParStatut,
    effectifParBusinessUnit,
    effectifParEntite,
    effectifParContrat,
    ancienneteMoyenne: anciennete.annees,
  };
}

module.exports = { getAchatsKpi, getRhKpi };
