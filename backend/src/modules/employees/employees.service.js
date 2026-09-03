const { all, one, run } = require('../../db');

const BASE_SELECT = `
  SELECT e.*,
         ent.code AS entity_code, ent.nom AS entity_nom,
         bu.code AS business_unit_code, bu.nom AS business_unit_nom,
         s.nom AS site_nom,
         DATE_PART('year', AGE(CURRENT_DATE, e.date_embauche)) AS anciennete_annees
  FROM employees e
  JOIN entities ent ON ent.id = e.entity_id
  LEFT JOIN business_units bu ON bu.id = e.business_unit_id
  LEFT JOIN sites s ON s.id = e.site_id
`;

async function list({ q, entityId, businessUnitId, statut, departement }) {
  const clauses = [];
  const params = [];

  if (entityId) { params.push(entityId); clauses.push(`e.entity_id = $${params.length}`); }
  if (businessUnitId) { params.push(businessUnitId); clauses.push(`e.business_unit_id = $${params.length}`); }
  if (statut) { params.push(statut); clauses.push(`e.statut = $${params.length}`); }
  if (departement) { params.push(departement); clauses.push(`e.departement = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(e.nom ILIKE $${params.length} OR e.prenom ILIKE $${params.length} OR e.matricule ILIKE $${params.length} OR e.poste ILIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(`${BASE_SELECT} ${where} ORDER BY e.nom, e.prenom`, params);
}

async function getById(id) {
  return one(`${BASE_SELECT} WHERE e.id = $1`, [id]);
}

const WRITABLE_FIELDS = [
  'matricule', 'nom', 'prenom', 'poste', 'departement', 'entity_id', 'site_id', 'business_unit_id',
  'manager', 'date_embauche', 'type_contrat', 'statut', 'salaire_mensuel', 'telephone', 'email',
  // RH complémentaires (migration 067)
  'date_naissance', 'nationalite', 'numero_cnss', 'situation_familiale',
  'contact_urgence_nom', 'contact_urgence_tel', 'permis_travail', 'permis_travail_expiration',
  // Responsable hiérarchique (module RH, Lot 0)
  'manager_employee_id',
];

async function create(body) {
  const cols = WRITABLE_FIELDS.filter(f => body[f] !== undefined);
  const values = cols.map(f => body[f]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const row = await one(
    `INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    values
  );
  return getById(row.id);
}

async function update(id, body) {
  const existing = await one('SELECT id FROM employees WHERE id = $1', [id]);
  if (!existing) return null;
  const cols = WRITABLE_FIELDS.filter(f => body[f] !== undefined);
  if (cols.length === 0) return getById(id);
  const setClause = cols.map((f, i) => `${f} = $${i + 1}`).join(', ');
  await run(`UPDATE employees SET ${setClause} WHERE id = $${cols.length + 1}`, [...cols.map(f => body[f]), id]);
  return getById(id);
}

async function remove(id) {
  await run('DELETE FROM employees WHERE id = $1', [id]);
}

module.exports = { list, getById, create, update, remove };
