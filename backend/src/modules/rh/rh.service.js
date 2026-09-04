const { one } = require('../../db');
const repo = require('./rh.repository');
const notifications = require('../notifications/notifications.service');
const numbering = require('../../utils/numbering');
const { hasRoleOnEntity, isSuperAdmin } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');

// Circuit de validation par rôle (MVP) : Collaborateur → Responsable → RH.
// (Codé simplement ici ; passera au moteur configurable dans un lot ultérieur.)
const CHAIN = ['responsable', 'rh'];
const PREFIX = { absence: 'ABS', conge: 'CNG', recrutement: 'REC', cdi: 'CDI' };

function nextRole(current) {
  const i = CHAIN.indexOf(current);
  return (i >= 0 && i < CHAIN.length - 1) ? CHAIN[i + 1] : null;
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

async function createAbsence(user, body) {
  const emp = await resolveRequesterEmployee(user);
  const jours = await workingDays(body.date_debut, body.date_fin);
  let req = await repo.create({
    type: 'absence', employeeId: emp.id, createdBy: user.id, entityId: emp.entity_id,
    businessUnitId: emp.business_unit_id, typeId: body.type_id || null,
    dateDebut: body.date_debut || null, dateFin: body.date_fin || null, jours,
    motif: body.motif || null, commentaire: body.commentaire || null,
  });
  req = await repo.setNumero(req.id, numbering.formatRhNumber(PREFIX.absence, emp.entity_code || 'CCG', req.id));
  await repo.logHistory(req.id, 'creation', user.id, null);
  return getDetail(req.id);
}

async function getDetail(id) {
  const req = await repo.getById(id);
  if (!req) return null;
  const [history, attachments] = await Promise.all([repo.getHistory(id), repo.getAttachments(id)]);
  return { ...req, history, attachments };
}

function assertOwner(user, req) {
  if (req.created_by !== user.id && !isSuperAdmin(user)) throw httpError(403, 'Action réservée au demandeur.');
}

async function submit(user, id) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  assertOwner(user, req);
  if (req.statut !== 'brouillon') throw httpError(400, `Soumission impossible depuis le statut "${req.statut}".`);
  await repo.update(id, { statut: 'en_validation', current_role: CHAIN[0] });
  await repo.logHistory(id, 'soumission', user.id, null);
  await notifications.notifyRoleOnEntity(req.entity_id, CHAIN[0], 'Demande RH à valider',
    `La demande ${req.numero} attend votre validation.`, `/rh/demandes/${id}`);
  return getDetail(id);
}

async function validate(user, id, commentaire) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  if (req.statut !== 'en_validation' || !req.current_role) throw httpError(400, 'Aucune validation en attente.');
  await assertRoleOr403(user, req.current_role, req.entity_id);
  const suivant = nextRole(req.current_role);
  if (suivant) {
    await repo.update(id, { current_role: suivant });
    await repo.logHistory(id, `validation_${req.current_role}`, user.id, commentaire);
    await notifications.notifyRoleOnEntity(req.entity_id, suivant, 'Demande RH à valider',
      `La demande ${req.numero} attend votre validation.`, `/rh/demandes/${id}`);
  } else {
    await repo.update(id, { statut: 'validee', current_role: null, decided_by: user.id, decided_at: new Date() });
    await repo.logHistory(id, `validation_${req.current_role}`, user.id, commentaire);
    await notifyRequester(req, 'Demande RH validée', `Votre demande ${req.numero} a été validée.`);
  }
  return getDetail(id);
}

async function reject(user, id, commentaire) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  if (req.statut !== 'en_validation' || !req.current_role) throw httpError(400, 'Aucune validation en attente.');
  await assertRoleOr403(user, req.current_role, req.entity_id);
  if (!commentaire || !commentaire.trim()) throw httpError(400, 'Un commentaire est obligatoire pour refuser.');
  await repo.update(id, { statut: 'refusee', current_role: null, decided_by: user.id, decided_at: new Date() });
  await repo.logHistory(id, 'refus', user.id, commentaire);
  await notifyRequester(req, 'Demande RH refusée', `Votre demande ${req.numero} a été refusée : ${commentaire}`);
  return getDetail(id);
}

async function cancel(user, id, commentaire) {
  const req = await repo.getById(id);
  if (!req) throw httpError(404, 'Demande introuvable.');
  assertOwner(user, req);
  if (!['brouillon', 'en_validation'].includes(req.statut)) throw httpError(400, `Annulation impossible depuis le statut "${req.statut}".`);
  await repo.update(id, { statut: 'annulee', current_role: null });
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
    .filter(r => CHAIN.includes(r.role_code) && r.entity_id)
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

module.exports = {
  createAbsence, getDetail, submit, validate, reject, cancel,
  listMine, listPending, listAll, canSeeAll, workingDays,
};
