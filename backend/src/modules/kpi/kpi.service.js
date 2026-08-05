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

  // Performance par étape de validation vs SLA configuré : temps réel passé = decided_at − created_at
  // (voir migration 034). Le respect du SLA est calculé ligne par ligne contre le SLA de la version
  // d'étape concernée ; on n'agrège que les validations réellement décidées.
  const slaRows = await all(
    `SELECT ws.code, ws.nom, MIN(ws.ordre) AS ordre, MAX(ws.sla_jours)::int AS sla_jours,
            COUNT(*)::int AS n,
            AVG(EXTRACT(EPOCH FROM (a.decided_at - a.created_at)) / 86400.0)::float AS delai_moyen_jours,
            COUNT(*) FILTER (
              WHERE ws.sla_jours IS NOT NULL AND (a.decided_at - a.created_at) <= (ws.sla_jours * INTERVAL '1 day')
            )::int AS n_dans_sla,
            COUNT(*) FILTER (WHERE ws.sla_jours IS NOT NULL)::int AS n_avec_sla
     FROM approvals a
     JOIN workflow_steps ws ON ws.id = a.workflow_step_id
     WHERE a.decided_at IS NOT NULL AND a.statut <> 'en_attente'
       -- Exclut les validations d'avant la mise en service du SLA : leur created_at a été posé par
       -- défaut à la date de migration (postérieure à leur decided_at), ce qui donnerait un délai
       -- négatif. On ne mesure que les validations dont le cycle complet est postérieur.
       AND a.decided_at >= a.created_at
     GROUP BY ws.code, ws.nom
     ORDER BY ordre`
  );
  const slaParEtape = slaRows.map(r => ({
    code: r.code,
    nom: r.nom,
    sla_jours: r.sla_jours,
    n: r.n,
    delaiMoyenJours: r.delai_moyen_jours,
    tauxRespectSla: r.n_avec_sla > 0 ? r.n_dans_sla / r.n_avec_sla : null,
  }));

  return {
    prByStatus,
    prByEntity,
    montantParDevise,
    tauxRefus,
    delaiMoyenJours: delai.jours,
    topFournisseurs,
    slaParEtape,
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

async function getStockKpi() {
  // Refonte Stock : le stock actuel se DÉRIVE du grand livre de mouvements (source de vérité),
  // Σ entrées − Σ sorties par produit sur les mouvements validés. `date_stock` = date du dernier
  // mouvement du produit (pour l'affichage). Remplace l'ancienne lecture de stock_entries.
  const balCte = `
    SELECT ml.product_id,
           SUM(CASE t.sens WHEN 'entree' THEN ml.quantite WHEN 'sortie' THEN -ml.quantite ELSE 0 END)::float AS qty,
           MAX(m.date_mouvement) AS last_date
    FROM stock_ledger_lines ml
    JOIN stock_ledger m ON m.id = ml.movement_id
    JOIN stock_movement_types t ON t.id = m.type_id
    WHERE m.statut = 'valide'
    GROUP BY ml.product_id
  `;

  const stockParBu = await all(
    `WITH bal AS (${balCte})
     SELECT bu.id AS business_unit_id, bu.nom AS business_unit, COALESCE(SUM(bal.qty), 0)::float AS total
     FROM business_units bu
     JOIN products p ON p.business_unit_id = bu.id AND p.actif = true
     LEFT JOIN bal ON bal.product_id = p.id
     GROUP BY bu.id, bu.nom
     ORDER BY bu.nom`
  );

  const stockGlobal = stockParBu.reduce((sum, r) => sum + r.total, 0);

  const produitsSuivis = await one(`SELECT COUNT(*)::int AS n FROM (${balCte}) bal`);

  const rupture = await all(
    `WITH bal AS (${balCte})
     SELECT p.id AS product_id, p.code, p.designation, bu.nom AS business_unit, bal.last_date AS date_stock
     FROM bal
     JOIN products p ON p.id = bal.product_id
     JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE bal.qty <= 0
     ORDER BY bu.nom, p.designation`
  );

  const seuilBas = await all(
    `WITH bal AS (${balCte})
     SELECT p.id AS product_id, p.code, p.designation, bu.nom AS business_unit,
            bal.qty AS quantite, p.seuil_alerte_stock, bal.last_date AS date_stock
     FROM bal
     JOIN products p ON p.id = bal.product_id
     JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE p.seuil_alerte_stock IS NOT NULL AND bal.qty > 0 AND bal.qty < p.seuil_alerte_stock
     ORDER BY bu.nom, p.designation`
  );

  return {
    stockParBu,
    stockGlobal,
    produitsSuivis: produitsSuivis.n,
    rupture,
    seuilBas,
  };
}

module.exports = { getAchatsKpi, getRhKpi, getStockKpi };
