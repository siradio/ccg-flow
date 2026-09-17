const { all, one } = require('../../db');

const T_SELECT = `
  SELECT t.*, tc.libelle AS categorie, tt.libelle AS type_libelle,
         p.libelle AS priorite, p.code AS priorite_code, p.couleur AS priorite_couleur,
         sla.seuil_risque_pct,
         e.numero_inventaire AS equipement_numero, e.designation AS equipement_designation,
         ent.code AS entity_code, ent.nom AS entity_nom, s.nom AS site_nom,
         TRIM(CONCAT(du.prenom,' ',du.nom)) AS demandeur_nom, du.email AS demandeur_email,
         TRIM(CONCAT(tu.prenom,' ',tu.nom)) AS technician_nom
  FROM dsi_tickets t
  LEFT JOIN dsi_ticket_categories tc ON tc.id = t.category_id
  LEFT JOIN dsi_ticket_types tt ON tt.id = t.type_id
  LEFT JOIN dsi_priorities p ON p.id = t.priority_id
  LEFT JOIN dsi_sla sla ON sla.priority_id = t.priority_id
  LEFT JOIN dsi_equipment e ON e.id = t.equipment_id
  LEFT JOIN entities ent ON ent.id = t.entity_id
  LEFT JOIN sites s ON s.id = t.site_id
  LEFT JOIN users du ON du.id = t.demandeur_id
  LEFT JOIN users tu ON tu.id = t.technician_id`;

function buildWhere(f) {
  const where = [];
  const params = [];
  const P = (v) => { params.push(v); return `$${params.length}`; };
  if (f.statut) where.push(`t.statut = ${P(f.statut)}`);
  if (f.open) where.push(`t.statut NOT IN ('resolu','cloture','annule')`);
  if (f.priorityId) where.push(`t.priority_id = ${P(Number(f.priorityId))}`);
  if (f.categoryId) where.push(`t.category_id = ${P(Number(f.categoryId))}`);
  if (f.technicianId) where.push(`t.technician_id = ${P(Number(f.technicianId))}`);
  if (f.demandeurId) where.push(`t.demandeur_id = ${P(Number(f.demandeurId))}`);
  if (f.entityId) where.push(`t.entity_id = ${P(Number(f.entityId))}`);
  if (f.equipmentId) where.push(`t.equipment_id = ${P(Number(f.equipmentId))}`);
  if (f.q) {
    const like = P('%' + f.q.toLowerCase() + '%');
    where.push(`(LOWER(t.reference) LIKE ${like} OR LOWER(t.objet) LIKE ${like} OR LOWER(COALESCE(t.description,'')) LIKE ${like})`);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

async function list(f) {
  const { sql, params } = buildWhere(f);
  const total = Number((await one(`SELECT COUNT(*)::int AS n FROM dsi_tickets t ${sql}`, params)).n);
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
  const p2 = [...params, pageSize, (page - 1) * pageSize];
  const items = await all(`${T_SELECT} ${sql} ORDER BY t.created_at DESC LIMIT $${p2.length - 1} OFFSET $${p2.length}`, p2);
  return { items, total, page, pageSize };
}

async function getById(id) { return one(`${T_SELECT} WHERE t.id = $1`, [id]); }

async function events(ticketId, visibleOnly = false) {
  return all(
    `SELECT ev.*, TRIM(CONCAT(u.prenom,' ',u.nom)) AS user_nom
     FROM dsi_ticket_events ev LEFT JOIN users u ON u.id = ev.user_id
     WHERE ev.ticket_id = $1 ${visibleOnly ? "AND ev.visibilite = 'public'" : ''}
     ORDER BY ev.created_at ASC, ev.id ASC`, [ticketId]);
}

async function stats(f) {
  const { sql, params } = buildWhere({ ...f, statut: null, open: false, q: null });
  return one(
    `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE t.statut NOT IN ('resolu','cloture','annule'))::int AS ouverts,
       COUNT(*) FILTER (WHERE t.statut='en_cours')::int AS en_cours,
       COUNT(*) FILTER (WHERE t.statut='en_attente')::int AS en_attente,
       COUNT(*) FILTER (WHERE t.statut='resolu')::int AS resolus,
       COUNT(*) FILTER (WHERE t.created_at::date = CURRENT_DATE)::int AS crees_aujourdhui,
       COUNT(*) FILTER (WHERE t.resolved_at::date = CURRENT_DATE)::int AS resolus_aujourdhui,
       COUNT(*) FILTER (WHERE p.code='critique' AND t.statut NOT IN ('resolu','cloture','annule'))::int AS critiques
     FROM dsi_tickets t LEFT JOIN dsi_priorities p ON p.id = t.priority_id ${sql}`, params);
}

module.exports = { list, getById, events, stats, T_SELECT };
