const { all, one, run } = require('../../../db');

// Module Logistique → Autorisation de dépense — accès base de données.
// L'en-tête (expense_authorizations) + lignes (expense_authorization_lines) + validations
// (expense_authorization_approvals, adossées aux workflow_steps du circuit configurable).

// Expression SELECT commune : en-tête enrichi des libellés (entité, BU, type, étape courante).
const DETAIL_SELECT = `
  SELECT a.*,
         e.nom  AS entity_nom, e.code AS entity_code,
         bu.nom AS bu_nom,
         t.libelle AS expense_type_libelle,
         s.code AS current_step_code, s.nom AS current_step_nom,
         u.prenom AS created_by_prenom, u.nom AS created_by_nom
  FROM expense_authorizations a
  JOIN entities e            ON e.id = a.entity_id
  LEFT JOIN business_units bu ON bu.id = a.business_unit_id
  LEFT JOIN logistique_expense_types t ON t.id = a.expense_type_id
  LEFT JOIN workflow_steps s  ON s.id = a.current_step_id
  LEFT JOIN users u           ON u.id = a.created_by
`;

async function getById(id) {
  return one(`${DETAIL_SELECT} WHERE a.id = $1`, [id]);
}

async function createDraft({ entityId, businessUnitId, service, objet, expenseTypeId, devise, demandeurNom, createdBy }) {
  return one(
    `INSERT INTO expense_authorizations
       (entity_id, business_unit_id, service, objet, expense_type_id, devise, demandeur_nom, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [entityId, businessUnitId || null, service || null, objet, expenseTypeId || null,
     devise || 'GNF', demandeurNom || null, createdBy]
  );
}

async function setNumero(id, numero) {
  return one('UPDATE expense_authorizations SET numero = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, numero]);
}

// Mise à jour de l'en-tête (brouillon uniquement, vérifié côté service).
async function updateHeader(id, { businessUnitId, service, objet, expenseTypeId, devise, avance }, x = { run }) {
  await x.run(
    `UPDATE expense_authorizations SET
       business_unit_id = $2, service = $3, objet = $4, expense_type_id = $5, devise = $6, avance = $7, updated_at = now()
     WHERE id = $1`,
    [id, businessUnitId || null, service || null, objet, expenseTypeId || null, devise || 'GNF', Number(avance) || 0]
  );
}

// Totaux dérivés : montant_total = somme des lignes (ou valeur fournie si pas de lignes),
// reste_a_payer = total − avance (jamais négatif).
async function recomputeTotals(id, x = { one, run }) {
  const row = await x.one('SELECT COALESCE(SUM(montant),0) AS total, COUNT(*)::int AS n FROM expense_authorization_lines WHERE authorization_id = $1', [id]);
  const hdr = await x.one('SELECT montant_total, avance FROM expense_authorizations WHERE id = $1', [id]);
  const total = row.n > 0 ? Number(row.total) : Number(hdr.montant_total) || 0;
  const reste = Math.max(0, total - (Number(hdr.avance) || 0));
  await x.run('UPDATE expense_authorizations SET montant_total = $2, reste_a_payer = $3, updated_at = now() WHERE id = $1', [id, total, reste]);
  return { total, reste };
}

// Fixe directement le montant total (fiche sans lignes détaillées) puis recalcule le reste.
async function setMontantTotal(id, montant, x = { one, run }) {
  await x.run('UPDATE expense_authorizations SET montant_total = $2, updated_at = now() WHERE id = $1', [id, Number(montant) || 0]);
  return recomputeTotals(id, x);
}

async function getLines(id) {
  return all('SELECT * FROM expense_authorization_lines WHERE authorization_id = $1 ORDER BY ordre, id', [id]);
}

// Remplace toutes les lignes (brouillon) : simple et sûr pour un formulaire modal.
async function replaceLines(id, lignes, x = { run }) {
  await x.run('DELETE FROM expense_authorization_lines WHERE authorization_id = $1', [id]);
  let ordre = 0;
  for (const l of lignes) {
    const q = Number(l.quantite) || 0;
    const pu = Number(l.prixUnitaire) || 0;
    const montant = l.montant != null ? Number(l.montant) : q * pu;
    await x.run(
      `INSERT INTO expense_authorization_lines (authorization_id, designation, quantite, prix_unitaire, montant, ordre)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, (l.designation || '').trim(), q, pu, montant, ordre++]
    );
  }
}

async function updateStatusAndStep(id, statut, stepId, x = { run }) {
  await x.run('UPDATE expense_authorizations SET statut = $2, current_step_id = $3, updated_at = now() WHERE id = $1', [id, statut, stepId || null]);
}

async function remove(id) {
  await run('DELETE FROM expense_authorizations WHERE id = $1', [id]);
}

// ─── Validations (approvals) ────────────────────────────────────────────────
async function createApproval(authId, stepId, x = { one }) {
  return x.one(
    'INSERT INTO expense_authorization_approvals (authorization_id, workflow_step_id, statut) VALUES ($1,$2,$3) RETURNING *',
    [authId, stepId, 'en_attente']
  );
}

async function getPendingApproval(authId, stepId) {
  return one(
    "SELECT * FROM expense_authorization_approvals WHERE authorization_id = $1 AND workflow_step_id = $2 AND statut = 'en_attente' ORDER BY id DESC LIMIT 1",
    [authId, stepId]
  );
}

async function decideApproval(approvalId, statut, userId, commentaire, x = { run }) {
  await x.run(
    'UPDATE expense_authorization_approvals SET statut = $2, user_id = $3, commentaire = $4 WHERE id = $1',
    [approvalId, statut, userId || null, commentaire || null]
  );
}

async function deletePendingApprovals(authId, x = { run }) {
  await x.run("DELETE FROM expense_authorization_approvals WHERE authorization_id = $1 AND statut = 'en_attente'", [authId]);
}

// Historique des validations, du plus ancien au plus récent, avec libellés d'étape et de l'agent.
async function getApprovals(authId) {
  return all(
    `SELECT ap.id, ap.statut, ap.commentaire, ap.created_at,
            s.code AS step_code, s.nom AS step_nom, s.ordre AS step_ordre,
            u.prenom AS user_prenom, u.nom AS user_nom
     FROM expense_authorization_approvals ap
     JOIN workflow_steps s ON s.id = ap.workflow_step_id
     LEFT JOIN users u ON u.id = ap.user_id
     WHERE ap.authorization_id = $1
     ORDER BY ap.id`,
    [authId]
  );
}

// ─── Listes ─────────────────────────────────────────────────────────────────
// Construit la clause WHERE + params selon les filtres et la portée de visibilité.
function buildWhere({ statut, from, to, entityId, businessUnitId, expenseTypeId, q, scope }) {
  const where = [];
  const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('$?', `$${params.length}`)); };
  if (statut) add('a.statut = $?', statut);
  if (entityId) add('a.entity_id = $?', Number(entityId));
  if (businessUnitId) add('a.business_unit_id = $?', Number(businessUnitId));
  if (expenseTypeId) add('a.expense_type_id = $?', Number(expenseTypeId));
  if (from) add('a.created_at >= $?', from);
  if (to) add("a.created_at < ($?::date + INTERVAL '1 day')", to);
  if (q) add('(a.objet ILIKE $? OR a.numero ILIKE $?)', `%${q}%`); // deux placeholders : traité ci-dessous
  // Portée : null = tout voir ; sinon {entityIds, createdBy} → entités autorisées OU ses propres fiches.
  if (scope) {
    const ids = scope.entityIds && scope.entityIds.length ? scope.entityIds : [-1];
    params.push(ids); const pIds = `$${params.length}`;
    params.push(scope.createdBy); const pCreated = `$${params.length}`;
    where.push(`(a.entity_id = ANY(${pIds}::int[]) OR a.created_by = ${pCreated})`);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function list(filters) {
  // Le filtre texte utilise deux fois la même valeur : on le gère à part pour garder buildWhere simple.
  const f = { ...filters };
  let extraClause = '';
  const base = buildWhere({ ...f, q: null });
  const params = base.params;
  if (f.q) {
    params.push(`%${f.q}%`);
    const p = `$${params.length}`;
    extraClause = base.clause ? ` AND (a.objet ILIKE ${p} OR a.numero ILIKE ${p})` : `WHERE (a.objet ILIKE ${p} OR a.numero ILIKE ${p})`;
  }
  return all(`${DETAIL_SELECT} ${base.clause}${extraClause} ORDER BY a.created_at DESC, a.id DESC LIMIT 500`, params);
}

module.exports = {
  getById, createDraft, setNumero, updateHeader, recomputeTotals, setMontantTotal,
  getLines, replaceLines, updateStatusAndStep, remove,
  createApproval, getPendingApproval, decideApproval, deletePendingApprovals, getApprovals,
  list,
};
