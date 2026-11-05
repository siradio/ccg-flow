const { all, one } = require('../../../db');
const { isSuperAdmin, hasSubModuleLevel } = require('../../../middleware/permissions');

// Tableau de bord des autorisations de dépense (Logistique). Respecte la même visibilité que la
// liste : tout pour super_admin / consultation du sous-module ; sinon les entités où l'utilisateur
// détient un rôle (plus ses propres fiches).
const SUB_MODULE = 'logistique.depenses';

function buildScope({ user, from, to, entityId, businessUnitId, expenseTypeId }) {
  const where = [];
  const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('$?', `$${params.length}`)); };
  if (from) add('a.created_at >= $?', from);
  if (to) add("a.created_at < ($?::date + INTERVAL '1 day')", to);
  if (entityId) add('a.entity_id = $?', Number(entityId));
  if (businessUnitId) add('a.business_unit_id = $?', Number(businessUnitId));
  if (expenseTypeId) add('a.expense_type_id = $?', Number(expenseTypeId));

  const seeAll = isSuperAdmin(user) || hasSubModuleLevel(user, SUB_MODULE, 'consultation');
  if (!seeAll) {
    const ids = [...new Set((user.roles || []).map(r => r.entity_id).filter(Boolean))];
    params.push(ids.length ? ids : [-1]); const pIds = `$${params.length}`;
    params.push(user.id); const pCreated = `$${params.length}`;
    where.push(`(a.entity_id = ANY(${pIds}::int[]) OR a.created_by = ${pCreated})`);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function getDashboard(user, filters) {
  const { clause, params } = buildScope({ user, ...filters });

  const kpi = await one(
    `SELECT
       COUNT(*)::int AS nb_total,
       COUNT(*) FILTER (WHERE a.statut = 'en_validation')::int AS nb_en_validation,
       COUNT(*) FILTER (WHERE a.statut = 'validee')::int AS nb_validees,
       COUNT(*) FILTER (WHERE a.statut = 'rejetee')::int AS nb_rejetees,
       COUNT(*) FILTER (WHERE a.statut = 'brouillon')::int AS nb_brouillons,
       COALESCE(SUM(a.montant_total) FILTER (WHERE a.statut = 'validee'),0) AS montant_autorise,
       COALESCE(SUM(a.reste_a_payer) FILTER (WHERE a.statut = 'validee'),0) AS reste_autorise,
       COALESCE(SUM(a.montant_total) FILTER (WHERE a.statut = 'en_validation'),0) AS montant_en_attente
     FROM expense_authorizations a ${clause}`,
    params
  );

  const evolution = await all(
    `SELECT to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS mois,
            COUNT(*)::int AS nb,
            COALESCE(SUM(a.montant_total),0) AS montant
     FROM expense_authorizations a ${clause}
     GROUP BY 1 ORDER BY 1`,
    params
  );

  const parType = await all(
    `SELECT COALESCE(t.libelle, 'Non précisé') AS libelle,
            COUNT(*)::int AS nb,
            COALESCE(SUM(a.montant_total),0) AS montant
     FROM expense_authorizations a
     LEFT JOIN logistique_expense_types t ON t.id = a.expense_type_id
     ${clause}
     GROUP BY 1 ORDER BY montant DESC`,
    params
  );

  const parStatut = await all(
    `SELECT a.statut, COUNT(*)::int AS nb, COALESCE(SUM(a.montant_total),0) AS montant
     FROM expense_authorizations a ${clause}
     GROUP BY a.statut`,
    params
  );

  const parBu = await all(
    `SELECT COALESCE(bu.nom, '—') AS bu, COUNT(*)::int AS nb, COALESCE(SUM(a.montant_total),0) AS montant
     FROM expense_authorizations a
     LEFT JOIN business_units bu ON bu.id = a.business_unit_id
     ${clause}
     GROUP BY 1 ORDER BY montant DESC`,
    params
  );

  // Fiches qui attendent concrètement une action de CET utilisateur (étape courante = un rôle qu'il
  // détient sur l'entité de la fiche). Les super_admin ne sont pas visés (pas d'action « due »).
  let aValider = [];
  const roleEntityPairs = (user.roles || []).filter(r => r.entity_id).map(r => ({ role: r.role_code, entity: r.entity_id }));
  if (roleEntityPairs.length) {
    const conds = roleEntityPairs.map((_, i) => `(a.entity_id = $${i * 2 + 1} AND s.role_code_requis = $${i * 2 + 2})`);
    const p = roleEntityPairs.flatMap(x => [x.entity, x.role]);
    aValider = await all(
      `SELECT a.id, a.numero, a.objet, a.montant_total, a.devise, e.nom AS entity_nom, s.nom AS step_nom
       FROM expense_authorizations a
       JOIN entities e ON e.id = a.entity_id
       JOIN workflow_steps s ON s.id = a.current_step_id
       WHERE a.statut = 'en_validation' AND (${conds.join(' OR ')})
       ORDER BY a.created_at ASC LIMIT 50`,
      p
    );
  }

  return { kpi, evolution, parType, parStatut, parBu, aValider };
}

module.exports = { getDashboard };
