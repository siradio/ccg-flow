const { one, all } = require('../../db');
const repo = require('./rh.repository');
const notifications = require('../notifications/notifications.service');
const numbering = require('../../utils/numbering');
const { hasRoleOnEntity, isSuperAdmin } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');

// Circuits de validation par rôle (MVP ; passera au moteur configurable plus tard).
// - Absence / congé : Responsable → RH.
// - Recrutement REMPLACEMENT : Responsable → RH → DGA (rôle `dg`).
// - Recrutement CRÉATION de poste & autres : Responsable → RH → DAF → DGA (engagement budgétaire).
const DEFAULT_CHAIN = ['responsable', 'rh'];
// Passage CDD→CDI (engagement permanent) : Responsable → RH → DAF → DGA.
const CHAINS = { absence: DEFAULT_CHAIN, conge: DEFAULT_CHAIN, cdi: ['responsable', 'rh', 'daf', 'dg'] };
const RECRUTEMENT_REMPLACEMENT = ['responsable', 'rh', 'dg'];
const RECRUTEMENT_AUTRE = ['responsable', 'rh', 'daf', 'dg'];
// Union de tous les rôles pouvant valider (pour la liste « À valider », tous circuits confondus).
const ALL_VALIDATION_ROLES = ['responsable', 'rh', 'daf', 'dg'];
const PREFIX = { absence: 'ABS', conge: 'CNG', recrutement: 'REC', cdi: 'CDI' };

// Le circuit d'un recrutement dépend de son sous-type (code du rh_type : remplacement vs création…).
function chainForRequest(req) {
  if (req.type === 'recrutement') {
    return req.type_code === 'remplacement' ? RECRUTEMENT_REMPLACEMENT : RECRUTEMENT_AUTRE;
  }
  return CHAINS[req.type] || DEFAULT_CHAIN;
}
function nextRole(chain, current) {
  const i = chain.indexOf(current);
  return (i >= 0 && i < chain.length - 1) ? chain[i + 1] : null;
}

// Nombre de jours ouvrables entre deux dates incluses (hors week-end + jours fériés paramétrés).
async function workingDays(from, to) {
  if (!from || !to) return null;
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end) || end < start) return null;
  const feries = new Set((await repo.holidaysBetween(from, to)).map(r => String(r.date).slice(0, 10)));
  let count = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay(); // 0 dimanche, 6 samedi
    const iso = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !feries.has(iso)) count++;
  }
  return count;
}

async function resolveRequesterEmployee(user) {
  if (!user.employee_id) throw httpError(400, "Votre compte n'est pas relié à une fiche employé. Contactez les RH.");
  const emp = await one('SELECT * FROM employees WHERE id = $1', [user.employee_id]);
  if (!emp) throw httpError(400, 'Fiche employé introuvable pour votre compte.');
  return emp;
}

// Création générique d'une demande RH (absence, congé…) à partir de la fiche employé du demandeur.
async function createRequest(user, type, body) {
  const emp = await resolveRequesterEmployee(user);
  const jours = await workingDays(body.date_debut, body.date_fin);
  let req = await repo.create({
    type, employeeId: emp.id, createdBy: user.id, entityId: emp.entity_id,
    businessUnitId: emp.business_unit_id, typeId: body.type_id || null,
    dateDebut: body.date_debut || null, dateFin: body.date_fin || null, jours,
    motif: body.motif || null, commentaire: body.commentaire || null,
  });
  req = await repo.setNumero(req.id, numbering.formatRhNumber(PREFIX[type] || 'RH', emp.entity_code || 'CCG', req.id));
  await repo.logHistory(req.id, 'creation', user.id, null);
  return getDetail(req.id);
}
async function createAbsence(user, body) { return createRequest(user, 'absence', body); }
async function createConge(user, body) { return createRequest(user, 'conge', body); }

// Demande de recrutement (ouverture de poste) : les champs spécifiques vont dans `payload` (le
// recrutement ne concerne pas une fiche employé existante → employee_id nul, entité = celle du
// demandeur pour piloter le circuit responsable/RH/DAF/DGA).
async function createRecrutement(user, body) {
  const emp = await resolveRequesterEmployee(user);
  const payload = {
    poste: body.poste || null,
    departement: body.departement || null,
    business_unit_id: body.business_unit_id || null,
    type_contrat: body.type_contrat || null,
    nombre_postes: body.nombre_postes ? Number(body.nombre_postes) : null,
    date_prise_poste: body.date_prise_poste || null,
    profil: body.profil || null,
    remuneration: body.remuneration || null,
    justification: body.justification || null,
  };
  let req = await repo.create({
    type: 'recrutement', employeeId: null, createdBy: user.id, entityId: emp.entity_id,
    businessUnitId: body.business_unit_id || emp.business_unit_id, typeId: body.type_id || null,
    dateDebut: body.date_prise_poste || null, dateFin: null, jours: null,
    motif: body.motif || null, commentaire: body.commentaire || null, payload,
  });
  req = await repo.setNumero(req.id, numbering.formatRhNumber(PREFIX.recrutement, emp.entity_code || 'CCG', req.id));
  await repo.logHistory(req.id, 'creation', user.id, null);
  return getDetail(req.id);
}

// Passage CDD→CDI : concerne un EMPLOYÉ EXISTANT (celui en CDD). Le demandeur (created_by) est le
// manager ; l'entité de la demande = celle de l'employé concerné (pilote le circuit de validation).
async function createCdi(user, body) {
  if (!body.employee_id) throw httpError(400, "Sélectionnez l'employé concerné.");
  const emp = await one('SELECT * FROM employees WHERE id = $1', [body.employee_id]);
  if (!emp) throw httpError(400, 'Employé concerné introuvable.');
  const payload = {
    nouveau_poste: body.nouveau_poste || null,
    nouvelle_remuneration: body.nouvelle_remuneration || null,
    date_passage: body.date_passage || null,
    justification: body.justification || null,
  };
  let req = await repo.create({
    type: 'cdi', employeeId: emp.id, createdBy: user.id, entityId: emp.entity_id,
    businessUnitId: emp.business_unit_id, typeId: null,
    dateDebut: body.date_passage || null, dateFin: null, jours: null,
    motif: body.motif || null, commentaire: body.commentaire || null, payload,
  });
  const entRow = await one('SELECT code FROM entities WHERE id = $1', [emp.entity_id]).catch(() => null);
  req = await repo.setNumero(req.id, numbering.formatRhNumber(PREFIX.cdi, (entRow && entRow.code) || 'CCG', req.id));
  await repo.logHistory(req.id, 'creation', user.id, null);
  return getDetail(req.id);
}

// ─── Solde de congés (acquisition mensuelle) ──────────────────────────────────
const TAUX_ACQUISITION_MENSUEL = 2.5; // jours ouvrables acquis par mois (≈ 30 j/an)

// Formate une date PG (objet Date à minuit local) en 'YYYY-MM-DD' via ses composants locaux —
// robuste au fuseau du serveur (toISOString(), en UTC, décalerait d'un jour hors UTC).
function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Nombre de mois ENTIERS écoulés entre deux dates (un mois n'est acquis qu'au jour anniversaire).
function completeMonthsBetween(from, to) {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

// Solde de congés d'un employé : acquis = solde initial + 2,5 × mois complets depuis la date de
// référence (date de solde, sinon date d'embauche) ; pris = congés imputables validés ; en attente =
// congés imputables en cours de validation. Disponible = acquis − pris − en attente (prudent).
async function getCongeSolde(employeeId) {
  const emp = await one('SELECT id, prenom, nom, date_embauche, conge_solde_initial, conge_solde_date FROM employees WHERE id = $1', [employeeId]);
  if (!emp) throw httpError(404, 'Employé introuvable.');
  // pg peut renvoyer une colonne DATE en objet Date : on reformate en ISO 'YYYY-MM-DD' de façon
  // robuste (String(dateObj) donnerait « Fri May 08 » → cast ::date invalide côté SQL).
  const base = emp.conge_solde_date || emp.date_embauche || null;
  const baseD = base ? new Date(base) : null;
  const baseIso = (baseD && !isNaN(baseD)) ? toIsoDate(baseD) : null;
  const mois = baseIso ? completeMonthsBetween(new Date(baseIso + 'T00:00:00Z'), new Date()) : 0;
  const initial = Number(emp.conge_solde_initial) || 0;
  const acquis = Math.round((initial + TAUX_ACQUISITION_MENSUEL * mois) * 100) / 100;
  const t = await repo.congeImputableTaken(employeeId, baseIso);
  const pris = Number(t.valides) || 0;
  const enAttente = Number(t.en_attente) || 0;
  const disponible = Math.round((acquis - pris - enAttente) * 100) / 100;
  return { acquis, pris, enAttente, disponible, taux: TAUX_ACQUISITION_MENSUEL, moisAcquis: mois, baseDate: baseIso };
}

async function getMyCongeSolde(user) {
  const emp = await resolveRequesterEmployee(user);
  return getCongeSolde(emp.id);
}

async function getDetail(id) {
  const req = await repo.getById(id);
  if (!req) return null;
  const [history, attachments] = await Promise.all([repo.getHistory(id), repo.getAttachments(id)]);
  // Pour un congé, on joint le solde du demandeur (visible par lui et ses valideurs).
  const solde = (req.type === 'conge' && req.employee_id) ? await getCongeSolde(req.employee_id).catch(() => null) : null;
  return { ...req, history, attachments, solde };
}

function assertOwner(user, req) {
  if (req.created_by !== user.id && !isSuperAdmin(user)) throw httpError(403, 'Action réservée au demandeur.');
}

async function submit(user, id) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  assertOwner(user, req);
  if (req.statut !== 'brouillon') throw httpError(400, `Soumission impossible depuis le statut "${req.statut}".`);
  const premier = chainForRequest(req)[0];
  await repo.update(id, { statut: 'en_validation', role_courant: premier });
  await repo.logHistory(id, 'soumission', user.id, null);
  await notifications.notifyRoleOnEntity(req.entity_id, premier, 'Demande RH à valider',
    `La demande ${req.numero} attend votre validation.`, `/rh/demandes/${id}`);
  return getDetail(id);
}

async function validate(user, id, commentaire) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  if (req.statut !== 'en_validation' || !req.role_courant) throw httpError(400, 'Aucune validation en attente.');
  await assertRoleOr403(user, req.role_courant, req.entity_id);
  const suivant = nextRole(chainForRequest(req), req.role_courant);
  if (suivant) {
    await repo.update(id, { role_courant: suivant });
    await repo.logHistory(id, `validation_${req.role_courant}`, user.id, commentaire);
    await notifications.notifyRoleOnEntity(req.entity_id, suivant, 'Demande RH à valider',
      `La demande ${req.numero} attend votre validation.`, `/rh/demandes/${id}`);
  } else {
    await repo.update(id, { statut: 'validee', role_courant: null, decided_by: user.id, decided_at: new Date() });
    await repo.logHistory(id, `validation_${req.role_courant}`, user.id, commentaire);
    await notifyRequester(req, 'Demande RH validée', `Votre demande ${req.numero} a été validée.`);
  }
  return getDetail(id);
}

async function reject(user, id, commentaire) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  if (req.statut !== 'en_validation' || !req.role_courant) throw httpError(400, 'Aucune validation en attente.');
  await assertRoleOr403(user, req.role_courant, req.entity_id);
  if (!commentaire || !commentaire.trim()) throw httpError(400, 'Un commentaire est obligatoire pour refuser.');
  await repo.update(id, { statut: 'refusee', role_courant: null, decided_by: user.id, decided_at: new Date() });
  await repo.logHistory(id, 'refus', user.id, commentaire);
  await notifyRequester(req, 'Demande RH refusée', `Votre demande ${req.numero} a été refusée : ${commentaire}`);
  return getDetail(id);
}

async function cancel(user, id, commentaire) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  assertOwner(user, req);
  if (!['brouillon', 'en_validation'].includes(req.statut)) throw httpError(400, `Annulation impossible depuis le statut "${req.statut}".`);
  await repo.update(id, { statut: 'annulee', role_courant: null });
  await repo.logHistory(id, 'annulation', user.id, commentaire);
  return getDetail(id);
}

async function assertRoleOr403(user, roleCode, entityId) {
  if (!hasRoleOnEntity(user, roleCode, entityId)) throw httpError(403, `Rôle "${roleCode}" requis sur cette entité.`);
}
async function notifyRequester(req, title, message) {
  // Le demandeur est un compte utilisateur (created_by).
  if (req.created_by) await notifications.notify(req.created_by, title, message, `/rh/demandes/${req.id}`);
}

// ─── Listes ─────────────────────────────────────────────────────────────────
function pendingRolePairs(user) {
  return (user.roles || [])
    .filter(r => ALL_VALIDATION_ROLES.includes(r.role_code) && r.entity_id)
    .map(r => ({ roleCode: r.role_code, entityId: r.entity_id }));
}
async function listMine(user) { return repo.listMine(user.id); }
async function listPending(user) { return repo.listPending(pendingRolePairs(user)); }
async function listAll(user) {
  if (isSuperAdmin(user)) return repo.listAll(null);
  const entityIds = [...new Set((user.roles || []).filter(r => r.role_code === 'rh' && r.entity_id).map(r => r.entity_id))];
  return repo.listAll(entityIds);
}
function canSeeAll(user) {
  return isSuperAdmin(user) || (user.roles || []).some(r => r.role_code === 'rh');
}

// Accès au tableau de bord RH : super_admin ou tout détenteur d'un rôle de validation RH.
function canSeeDashboard(user) {
  return isSuperAdmin(user) || (user.roles || []).some(r => ALL_VALIDATION_ROLES.includes(r.role_code));
}
// Entités visibles sur le dashboard : null = toutes (super_admin ou RH global), sinon les entités où
// l'utilisateur détient un rôle de validation RH.
function dashboardScope(user) {
  if (isSuperAdmin(user) || (user.roles || []).some(r => r.role_code === 'rh' && !r.entity_id)) return null;
  return [...new Set((user.roles || [])
    .filter(r => ALL_VALIDATION_ROLES.includes(r.role_code) && r.entity_id)
    .map(r => r.entity_id))];
}

// Tableau de bord RH : agrégats (effectif, demandes en cours/à valider, absences & congés en cours et
// à venir, recrutements/CDI en cours), limités aux entités RH de l'utilisateur.
async function getDashboard(user) {
  const ent = dashboardScope(user);       // null = toutes ; [] = aucune
  const scoped = ent !== null;
  const empty = {
    effectif: { total: 0, parContrat: [], parEntite: [] },
    demandes: { enValidation: 0, parType: [], aValider: 0, recrutement: 0, cdi: 0 },
    enCours: [], aVenir: [],
  };
  if (scoped && ent.length === 0) return empty;
  const p = scoped ? [ent] : [];
  const w = (col) => (scoped ? ` AND ${col} = ANY($1)` : ''); // filtre entité optionnel

  const [empTotal, parContrat, parEntite, enValidation, parType, recrutement, cdi] = await Promise.all([
    one(`SELECT count(*)::int n FROM employees WHERE statut='actif'${w('entity_id')}`, p),
    all(`SELECT COALESCE(NULLIF(type_contrat,''),'—') AS type_contrat, count(*)::int n FROM employees WHERE statut='actif'${w('entity_id')} GROUP BY 1 ORDER BY n DESC`, p),
    all(`SELECT ent.code, count(*)::int n FROM employees e JOIN entities ent ON ent.id=e.entity_id WHERE e.statut='actif'${w('e.entity_id')} GROUP BY ent.code ORDER BY n DESC`, p),
    one(`SELECT count(*)::int n FROM rh_requests WHERE statut='en_validation'${w('entity_id')}`, p),
    all(`SELECT type, count(*)::int n FROM rh_requests WHERE statut='en_validation'${w('entity_id')} GROUP BY type`, p),
    one(`SELECT count(*)::int n FROM rh_requests WHERE type='recrutement' AND statut='en_validation'${w('entity_id')}`, p),
    one(`SELECT count(*)::int n FROM rh_requests WHERE type='cdi' AND statut='en_validation'${w('entity_id')}`, p),
  ]);

  const listSel = `SELECT r.id, r.numero, r.type, r.date_debut, r.date_fin, r.jours, ent.code AS entity_code,
      TRIM(CONCAT(emp.prenom, ' ', emp.nom)) AS employe, t.libelle AS type_libelle
    FROM rh_requests r JOIN entities ent ON ent.id = r.entity_id
    LEFT JOIN employees emp ON emp.id = r.employee_id LEFT JOIN rh_types t ON t.id = r.type_id`;
  const [enCours, aVenir] = await Promise.all([
    all(`${listSel} WHERE r.type IN ('absence','conge') AND r.statut='validee' AND r.date_debut <= CURRENT_DATE AND r.date_fin >= CURRENT_DATE${w('r.entity_id')} ORDER BY r.date_fin`, p),
    all(`${listSel} WHERE r.type IN ('absence','conge') AND r.statut='validee' AND r.date_debut > CURRENT_DATE AND r.date_debut <= CURRENT_DATE + INTERVAL '30 days'${w('r.entity_id')} ORDER BY r.date_debut`, p),
  ]);

  const aValider = (await listPending(user)).length;
  return {
    effectif: { total: empTotal.n, parContrat, parEntite },
    demandes: { enValidation: enValidation.n, parType, aValider, recrutement: recrutement.n, cdi: cdi.n },
    enCours, aVenir,
  };
}

module.exports = {
  createAbsence, createConge, createRecrutement, createCdi, getDetail, submit, validate, reject, cancel,
  listMine, listPending, listAll, canSeeAll, workingDays,
  getCongeSolde, getMyCongeSolde, getDashboard, canSeeDashboard,
};
