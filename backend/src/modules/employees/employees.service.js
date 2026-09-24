const { all, one, run } = require('../../db');

const BASE_SELECT = `
  SELECT e.*,
         ent.code AS entity_code, ent.nom AS entity_nom,
         bu.code AS business_unit_code, bu.nom AS business_unit_nom,
         s.nom AS site_nom,
         DATE_PART('year', AGE(CURRENT_DATE, e.date_embauche)) AS anciennete_annees,
         lu.id AS linked_user_id, lu.email AS linked_user_email,
         TRIM(CONCAT(lu.prenom, ' ', lu.nom)) AS linked_user_nom
  FROM employees e
  JOIN entities ent ON ent.id = e.entity_id
  LEFT JOIN business_units bu ON bu.id = e.business_unit_id
  LEFT JOIN sites s ON s.id = e.site_id
  LEFT JOIN users lu ON lu.employee_id = e.id
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
  'manager', 'date_embauche', 'type_contrat', 'statut', 'salaire_mensuel', 'telephone', 'email', 'adresse',
  // RH complémentaires (migration 067)
  'date_naissance', 'nationalite', 'numero_cnss', 'situation_familiale',
  'contact_urgence_nom', 'contact_urgence_tel', 'permis_travail', 'permis_travail_expiration',
  // Responsable hiérarchique (module RH, Lot 0)
  'manager_employee_id',
  // Solde de congés (module RH, Lot 2) : amorçage du droit à congés
  'conge_solde_initial', 'conge_solde_date',
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

// Comptes utilisateurs actifs, pour lier un compte à une fiche employé depuis le référentiel RH
// (endpoint accessible aux gestionnaires RH, sans exposer l'administration complète des utilisateurs).
// `employee_id` indique si le compte est déjà relié à une (autre) fiche.
async function listLinkableUsers() {
  return all(`SELECT id, prenom, nom, email, employee_id FROM users WHERE actif = true ORDER BY nom, prenom`);
}

// Définit LE compte utilisateur relié à une fiche employé (relation 1‑1 via users.employee_id).
// userId falsy => on délie. Sinon on retire d'abord tout autre compte pointant vers cette fiche,
// puis on affecte le compte choisi (qui bascule ainsi son lien vers cette fiche).
async function setLinkedUser(employeeId, userId) {
  const uid = userId ? Number(userId) : null;
  await run('UPDATE users SET employee_id = NULL WHERE employee_id = $1', [employeeId]);
  if (uid) await run('UPDATE users SET employee_id = $1 WHERE id = $2', [employeeId, uid]);
}

// Rattachement automatique des comptes aux fiches employé, par correspondance d'identité :
// priorité à l'e-mail (le plus fiable), repli sur « prénom + nom » (accents/casse ignorés).
// On ne relie QUE les correspondances UNIQUES ; les homonymes et les comptes revendiqués par
// plusieurs fiches sont signalés comme « ambigus » pour traitement manuel. `apply=false` = aperçu.
// Cœur de l'appariement (fonction PURE, testable sans base) : pour chaque employé, propose l'unique
// compte correspondant (e-mail prioritaire, repli nom+prénom). Ne modifie rien ; retourne les listes.
function computeAutoLinks(employees, users) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byEmail = new Map();
  const byName = new Map();
  for (const u of users) {
    if (u.email) { const k = norm(u.email); (byEmail.get(k) || byEmail.set(k, []).get(k)).push(u); }
    const nk = norm(`${u.prenom} ${u.nom}`); (byName.get(nk) || byName.set(nk, []).get(nk)).push(u);
  }
  const uname = (u) => `${u.prenom} ${u.nom} (${u.email || '—'})`;
  const ename = (e) => `${e.prenom} ${e.nom}${e.matricule ? ` (${e.matricule})` : ''}`;

  const proposals = [];
  const ambiguous = [];
  const noMatch = [];
  const alreadyOk = [];

  for (const e of employees) {
    let cands = [];
    let via = null;
    if (e.email && byEmail.has(norm(e.email))) { cands = byEmail.get(norm(e.email)); via = 'email'; }
    if (cands.length === 0) { const nk = norm(`${e.prenom} ${e.nom}`); if (byName.has(nk)) { cands = byName.get(nk); via = 'nom'; } }
    if (cands.length === 0) { noMatch.push({ employee_id: e.id, employee: ename(e), email: e.email || null }); continue; }
    if (cands.length > 1) { ambiguous.push({ employee_id: e.id, employee: ename(e), via, candidates: cands.map(uname) }); continue; }
    const cand = cands[0];
    if (Number(e.linked_user_id) === Number(cand.id)) { alreadyOk.push({ employee_id: e.id, employee: ename(e), user: uname(cand) }); continue; }
    proposals.push({ e, cand, via });
  }

  // Conflit : un même compte proposé pour plusieurs fiches → ambigu (aucune décision automatique).
  const count = new Map();
  for (const p of proposals) count.set(p.cand.id, (count.get(p.cand.id) || 0) + 1);
  const linked = [];
  const toApply = []; // {employeeId, userId} à exécuter si apply
  for (const p of proposals) {
    if (count.get(p.cand.id) > 1) {
      ambiguous.push({ employee_id: p.e.id, employee: ename(p.e), via: p.via, candidates: [`${uname(p.cand)} — proposé pour plusieurs fiches`] });
      continue;
    }
    linked.push({ employee_id: p.e.id, employee: ename(p.e), user: uname(p.cand), via: p.via, was: p.e.linked_user_nom || null });
    toApply.push({ employeeId: p.e.id, userId: p.cand.id });
  }

  return {
    counts: { total: employees.length, aLier: linked.length, dejaOk: alreadyOk.length, ambigus: ambiguous.length, sansMatch: noMatch.length },
    linked, alreadyOk, ambiguous, noMatch, toApply,
  };
}

// Charge les données, calcule l'appariement et (si apply) l'exécute via setLinkedUser.
async function autoLinkUsersByIdentity({ apply = false } = {}) {
  const employees = await all(
    `SELECT e.id, e.matricule, e.prenom, e.nom, e.email,
            lu.id AS linked_user_id, TRIM(CONCAT(lu.prenom, ' ', lu.nom)) AS linked_user_nom
     FROM employees e LEFT JOIN users lu ON lu.employee_id = e.id
     ORDER BY e.nom, e.prenom`
  );
  const users = await all('SELECT id, prenom, nom, email, employee_id FROM users WHERE actif = true');
  const result = computeAutoLinks(employees, users);
  if (apply) {
    for (const { employeeId, userId } of result.toApply) await setLinkedUser(employeeId, userId);
  }
  const { toApply, ...rest } = result;
  return { applied: !!apply, ...rest };
}

module.exports = { list, getById, create, update, remove, listLinkableUsers, setLinkedUser, autoLinkUsersByIdentity, computeAutoLinks };
