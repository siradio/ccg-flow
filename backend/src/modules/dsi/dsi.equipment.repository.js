const { all, one, run, withTransaction } = require('../../db');
const { nextRef } = require('./dsi.numbering');

// SELECT enrichi d'un équipement + son affectation active (bénéficiaire) et libellés référentiels.
const EQ_SELECT = `
  SELECT e.*, c.libelle AS categorie, ty.libelle AS type_libelle, b.nom AS marque,
         ent.code AS entity_code, ent.nom AS entity_nom, s.nom AS site_nom, sup.nom AS fournisseur,
         a.id AS assignment_id, a.beneficiaire_type, a.employee_id AS assigned_employee_id,
         a.business_unit_id AS assigned_bu_id, a.entity_id AS assigned_entity_id, a.site_id AS assigned_site_id,
         TRIM(CONCAT(emp.prenom, ' ', emp.nom)) AS assigned_employee_nom,
         abu.nom AS assigned_bu_nom, aent.code AS assigned_entity_code, asite.nom AS assigned_site_nom
  FROM dsi_equipment e
  LEFT JOIN dsi_categories c ON c.id = e.category_id
  LEFT JOIN dsi_types ty ON ty.id = e.type_id
  LEFT JOIN dsi_brands b ON b.id = e.brand_id
  LEFT JOIN entities ent ON ent.id = e.entity_id
  LEFT JOIN sites s ON s.id = e.site_id
  LEFT JOIN suppliers sup ON sup.id = e.supplier_id
  LEFT JOIN dsi_assignments a ON a.equipment_id = e.id AND a.statut = 'active'
  LEFT JOIN employees emp ON emp.id = a.employee_id
  LEFT JOIN business_units abu ON abu.id = a.business_unit_id
  LEFT JOIN entities aent ON aent.id = a.entity_id
  LEFT JOIN sites asite ON asite.id = a.site_id`;

const SORTABLE = {
  numero_inventaire: 'e.numero_inventaire', designation: 'e.designation', categorie: 'c.libelle',
  type: 'ty.libelle', marque: 'b.nom', statut: 'e.statut', entity: 'ent.code', site: 's.nom',
  date_achat: 'e.date_achat', fin_garantie: 'e.fin_garantie', created_at: 'e.created_at',
};

function buildWhere(f) {
  const where = ['e.deleted_at IS NULL'];
  const params = [];
  const P = (v) => { params.push(v); return `$${params.length}`; };
  if (f.categoryId) where.push(`e.category_id = ${P(Number(f.categoryId))}`);
  if (f.typeId) where.push(`e.type_id = ${P(Number(f.typeId))}`);
  if (f.brandId) where.push(`e.brand_id = ${P(Number(f.brandId))}`);
  if (f.statut) where.push(`e.statut = ${P(f.statut)}`);
  if (f.entityId) where.push(`e.entity_id = ${P(Number(f.entityId))}`);
  if (f.siteId) where.push(`e.site_id = ${P(Number(f.siteId))}`);
  if (f.etat) where.push(`e.etat = ${P(f.etat)}`);
  if (f.modele) where.push(`e.modele ILIKE ${P('%' + f.modele + '%')}`);
  if (f.employeeId) where.push(`a.employee_id = ${P(Number(f.employeeId))}`);
  if (f.q) {
    const like = P('%' + f.q.toLowerCase() + '%');
    where.push(`(LOWER(e.numero_inventaire) LIKE ${like} OR LOWER(e.designation) LIKE ${like}
      OR LOWER(COALESCE(e.num_serie,'')) LIKE ${like} OR LOWER(COALESCE(e.modele,'')) LIKE ${like}
      OR LOWER(COALESCE(emp.prenom || ' ' || emp.nom,'')) LIKE ${like})`);
  }
  return { sql: 'WHERE ' + where.join(' AND '), params };
}

async function list(f) {
  const { sql, params } = buildWhere(f);
  const total = Number((await one(
    `SELECT COUNT(*)::int AS n FROM dsi_equipment e
     LEFT JOIN dsi_assignments a ON a.equipment_id = e.id AND a.statut='active'
     LEFT JOIN employees emp ON emp.id = a.employee_id ${sql}`, params)).n);
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
  const orderCol = SORTABLE[f.sortKey] || 'e.created_at';
  const orderDir = f.sortDir === 'asc' ? 'ASC' : 'DESC';
  const p2 = [...params, pageSize, (page - 1) * pageSize];
  const items = await all(
    `${EQ_SELECT} ${sql} ORDER BY ${orderCol} ${orderDir} NULLS LAST, e.id DESC
     LIMIT $${p2.length - 1} OFFSET $${p2.length}`, p2);
  return { items, total, page, pageSize };
}

async function getById(id) {
  return one(`${EQ_SELECT} WHERE e.id = $1`, [id]);
}

async function stats(f) {
  const { sql, params } = buildWhere({ ...f, statut: null, q: null, employeeId: null });
  return one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE e.statut='disponible')::int AS disponibles,
            COUNT(*) FILTER (WHERE e.statut='affecte')::int AS affectes,
            COUNT(*) FILTER (WHERE e.statut='en_stock')::int AS en_stock,
            COUNT(*) FILTER (WHERE e.statut='en_maintenance')::int AS en_maintenance,
            COUNT(*) FILTER (WHERE e.statut='en_panne')::int AS en_panne,
            COUNT(*) FILTER (WHERE e.fin_garantie IS NOT NULL AND e.fin_garantie < CURRENT_DATE)::int AS hors_garantie,
            COALESCE(SUM(e.prix_achat) FILTER (WHERE e.statut <> 'reforme'),0) AS valeur
     FROM dsi_equipment e
     LEFT JOIN dsi_assignments a ON a.equipment_id = e.id AND a.statut='active'
     LEFT JOIN employees emp ON emp.id = a.employee_id ${sql}`, params);
}

const FIELDS = ['category_id', 'type_id', 'designation', 'brand_id', 'modele', 'num_serie', 'entity_id',
  'site_id', 'localisation', 'supplier_id', 'date_achat', 'prix_achat', 'date_mise_service',
  'fin_garantie', 'etat', 'statut', 'commentaire'];
const emptyToNull = v => (v === '' || v === undefined ? null : v);

async function create(body, userId) {
  return withTransaction(async (tx) => {
    let numero = (body.numero_inventaire || '').trim();
    if (!numero) numero = await nextRef(tx, { scope: 'EQUIP', prefix: 'INV' });
    const cols = ['numero_inventaire', ...FIELDS, 'created_by'];
    const vals = [numero, ...FIELDS.map(f => emptyToNull(body[f])), userId];
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    return tx.one(`INSERT INTO dsi_equipment (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
  });
}

async function update(id, body) {
  const existing = await one('SELECT * FROM dsi_equipment WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) return null;
  const cols = FIELDS.filter(f => body[f] !== undefined);
  if (body.numero_inventaire !== undefined && body.numero_inventaire !== '') cols.unshift('numero_inventaire');
  if (cols.length === 0) return getById(id);
  const vals = cols.map(c => (c === 'numero_inventaire' ? body[c] : emptyToNull(body[c])));
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await run(`UPDATE dsi_equipment SET ${setClause}, updated_at = now() WHERE id = $${cols.length + 1}`, [...vals, id]);
  return getById(id);
}

async function softDelete(id) {
  await run('UPDATE dsi_equipment SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
}

// Historique d'un équipement : affectations (L1). Incidents/maintenances/activités s'ajouteront
// aux lots suivants (les tables n'existent pas encore).
async function assignments(equipmentId) {
  return all(
    `SELECT a.*, TRIM(CONCAT(emp.prenom,' ',emp.nom)) AS employee_nom, bu.nom AS bu_nom,
            ent.code AS entity_code, s.nom AS site_nom,
            TRIM(CONCAT(u.prenom,' ',u.nom)) AS affecte_par_nom,
            TRIM(CONCAT(uc.prenom,' ',uc.nom)) AS closed_by_nom
     FROM dsi_assignments a
     LEFT JOIN employees emp ON emp.id = a.employee_id
     LEFT JOIN business_units bu ON bu.id = a.business_unit_id
     LEFT JOIN entities ent ON ent.id = a.entity_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN users u ON u.id = a.affecte_par
     LEFT JOIN users uc ON uc.id = a.closed_by
     WHERE a.equipment_id = $1 ORDER BY a.date_affectation DESC, a.id DESC`, [equipmentId]);
}

module.exports = { list, getById, stats, create, update, softDelete, assignments, EQ_SELECT };
