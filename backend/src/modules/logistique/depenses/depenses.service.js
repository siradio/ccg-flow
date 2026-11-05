const { one, withTransaction } = require('../../../db');
const repo = require('./depenses.repository');
const workflowEngine = require('../../workflow/workflow.engine');
const notifications = require('../../notifications/notifications.service');
const branding = require('../../referentials/entity-branding.service');
const pdf = require('../../../utils/pdf');
const numbering = require('../../../utils/numbering');
const { hasRoleOnEntity, hasAnyRoleOnEntity, isSuperAdmin, hasSubModuleLevel } = require('../../../middleware/permissions');
const { httpError } = require('../../../utils/httpError');

const MODULE_CODE = 'autorisation_depense';
const SUB_MODULE = 'logistique.depenses';

// ─── Visibilité / accès ───────────────────────────────────────────────────
// Un utilisateur voit une fiche s'il : est super_admin, a la consultation du sous-module, détient
// un rôle sur l'entité de la fiche, ou en est le créateur.
function canSeeAll(user) {
  return isSuperAdmin(user) || hasSubModuleLevel(user, SUB_MODULE, 'consultation');
}
function assertCanSee(user, a) {
  if (canSeeAll(user)) return;
  if (hasAnyRoleOnEntity(user, a.entity_id)) return;
  if (a.created_by === user.id) return;
  throw httpError(403, "Vous n'avez pas accès à cette autorisation.");
}

async function entityCode(entityId) {
  const row = await one('SELECT code FROM entities WHERE id = $1', [entityId]);
  return row ? row.code : 'GRP';
}

async function getFullDetail(id) {
  const a = await repo.getById(id);
  if (!a) return null;
  const [lignes, approvals] = await Promise.all([repo.getLines(id), repo.getApprovals(id)]);
  return { ...a, lignes, approvals };
}

async function getFullDetailForUser(user, id) {
  const a = await repo.getById(id);
  if (!a) return null;
  assertCanSee(user, a);
  return getFullDetail(id);
}

// ─── Création / édition (brouillon) ─────────────────────────────────────────
function normalizeLines(lignes) {
  return (Array.isArray(lignes) ? lignes : [])
    .map(l => ({
      designation: (l.designation || '').trim(),
      quantite: Number(l.quantite) || 0,
      prixUnitaire: Number(l.prixUnitaire ?? l.prix_unitaire) || 0,
    }))
    .filter(l => l.designation);
}

async function create(user, { entityId, businessUnitId, service, objet, expenseTypeId, devise, demandeurNom, avance, montantTotal, lignes }) {
  if (!entityId) throw httpError(400, 'Entité requise.');
  if (!objet || !objet.trim()) throw httpError(400, 'Objet requis.');

  const code = await entityCode(entityId);
  const buId = code === 'SOGUIPAL' && businessUnitId ? Number(businessUnitId) : null;

  const detail = await withTransaction(async (tx) => {
    const created = await tx.one(
      `INSERT INTO expense_authorizations
         (entity_id, business_unit_id, service, objet, expense_type_id, devise, demandeur_nom, avance, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [entityId, buId, (service || '').trim() || null, objet.trim(), expenseTypeId || null,
       devise || 'GNF', (demandeurNom || '').trim() || null, Number(avance) || 0, user.id]
    );
    const numero = numbering.formatExpenseNumber(code, created.id);
    await tx.run('UPDATE expense_authorizations SET numero = $2 WHERE id = $1', [created.id, numero]);
    const rows = normalizeLines(lignes);
    if (rows.length) {
      await repo.replaceLines(created.id, rows, tx);
      await repo.recomputeTotals(created.id, tx);
    } else if (montantTotal != null) {
      await repo.setMontantTotal(created.id, montantTotal, tx);
    }
    return created.id;
  });
  return getFullDetail(detail);
}

async function update(user, id, { businessUnitId, service, objet, expenseTypeId, devise, demandeurNom, avance, montantTotal, lignes }) {
  const a = await repo.getById(id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  if (a.created_by !== user.id && !isSuperAdmin(user)) throw httpError(403, "Seul le créateur peut modifier cette autorisation.");
  if (a.statut !== 'brouillon') throw httpError(400, 'Seule une autorisation en brouillon peut être modifiée.');
  if (!objet || !objet.trim()) throw httpError(400, 'Objet requis.');

  const code = a.entity_code || await entityCode(a.entity_id);
  const buId = code === 'SOGUIPAL' && businessUnitId ? Number(businessUnitId) : null;

  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE expense_authorizations SET
         business_unit_id = $2, service = $3, objet = $4, expense_type_id = $5,
         devise = $6, demandeur_nom = $7, avance = $8, updated_at = now()
       WHERE id = $1`,
      [id, buId, (service || '').trim() || null, objet.trim(), expenseTypeId || null,
       devise || 'GNF', (demandeurNom || '').trim() || null, Number(avance) || 0]
    );
    const rows = normalizeLines(lignes);
    if (rows.length) {
      await repo.replaceLines(id, rows, tx);
      await repo.recomputeTotals(id, tx);
    } else {
      await repo.replaceLines(id, [], tx);
      await repo.setMontantTotal(id, Number(montantTotal) || 0, tx);
    }
  });
  return getFullDetail(id);
}

async function remove(user, id) {
  const a = await repo.getById(id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  if (a.created_by !== user.id && !isSuperAdmin(user)) throw httpError(403, "Seul le créateur peut supprimer cette autorisation.");
  if (a.statut !== 'brouillon') throw httpError(400, 'Seule une autorisation en brouillon peut être supprimée.');
  await repo.remove(id);
  return { ok: true };
}

// ─── Soumission dans le circuit configurable ────────────────────────────────
async function submit(user, id) {
  const a = await repo.getById(id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  if (a.created_by !== user.id && !isSuperAdmin(user)) throw httpError(403, "Seul le créateur peut soumettre cette autorisation.");
  if (a.statut !== 'brouillon') throw httpError(400, 'Cette autorisation a déjà été soumise.');
  const lignes = await repo.getLines(id);
  if (!lignes.length && Number(a.montant_total) <= 0) throw httpError(400, 'Renseignez au moins une ligne ou un montant total avant de soumettre.');

  const template = await workflowEngine.getTemplate(MODULE_CODE);
  if (!template) throw httpError(500, 'Workflow "autorisation_depense" non configuré.');
  const first = await workflowEngine.getFirstStep(template.id);
  if (!first) throw httpError(500, 'Le circuit de validation est vide.');

  await withTransaction(async (tx) => {
    await repo.updateStatusAndStep(id, 'en_validation', first.id, tx);
    await repo.createApproval(id, first.id, tx);
  });
  if (first.role_code_requis) {
    await notifications.notifyRoleOnEntity(a.entity_id, first.role_code_requis, 'Autorisation de dépense à valider',
      `L'autorisation ${a.numero} (${a.objet}) attend votre validation.`, `/logistique/depenses/${id}`);
  }
  return getFullDetail(id);
}

// Récupère l'étape courante (par son id) : on s'appuie sur SON template pour trouver l'étape
// suivante / de retour, robuste même si l'admin a versionné le circuit entre-temps.
async function currentStepOf(a) {
  if (!a.current_step_id) return null;
  return one('SELECT * FROM workflow_steps WHERE id = $1', [a.current_step_id]);
}

async function validateStep(user, id, commentaire) {
  const a = await repo.getById(id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  if (a.statut !== 'en_validation' || !a.current_step_id) throw httpError(400, `Aucune validation possible depuis le statut "${a.statut}".`);
  const step = await currentStepOf(a);
  if (!step) throw httpError(500, 'Étape courante introuvable.');
  if (!hasRoleOnEntity(user, step.role_code_requis, a.entity_id)) {
    throw httpError(403, `Rôle "${step.role_code_requis}" requis sur cette entité pour valider cette étape.`);
  }
  const approval = await repo.getPendingApproval(id, step.id);
  if (!approval) throw httpError(500, 'Aucune validation en attente pour cette étape.');

  const next = await workflowEngine.getNextStep(step.workflow_template_id, step.ordre);
  await withTransaction(async (tx) => {
    await repo.decideApproval(approval.id, 'valide', user.id, commentaire, tx);
    if (!next) {
      await repo.updateStatusAndStep(id, 'validee', null, tx);
    } else {
      await repo.updateStatusAndStep(id, 'en_validation', next.id, tx);
      await repo.createApproval(id, next.id, tx);
    }
  });

  if (!next) {
    await notifications.notify(a.created_by, 'Autorisation de dépense approuvée',
      `L'autorisation ${a.numero} a été approuvée (circuit complet).`, `/logistique/depenses/${id}`);
  } else if (next.role_code_requis) {
    await notifications.notifyRoleOnEntity(a.entity_id, next.role_code_requis, 'Autorisation de dépense à valider',
      `L'autorisation ${a.numero} (${a.objet}) attend votre validation.`, `/logistique/depenses/${id}`);
  }
  return getFullDetail(id);
}

async function rejectStep(user, id, commentaire) {
  const a = await repo.getById(id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  if (a.statut !== 'en_validation' || !a.current_step_id) throw httpError(400, `Aucun refus possible depuis le statut "${a.statut}".`);
  const step = await currentStepOf(a);
  if (!step) throw httpError(500, 'Étape courante introuvable.');
  if (!hasRoleOnEntity(user, step.role_code_requis, a.entity_id)) {
    throw httpError(403, `Rôle "${step.role_code_requis}" requis sur cette entité pour refuser cette étape.`);
  }
  if (step.commentaire_obligatoire_si_refus && !(commentaire || '').trim()) {
    throw httpError(400, 'Un commentaire est obligatoire pour refuser cette étape.');
  }
  const approval = await repo.getPendingApproval(id, step.id);
  if (!approval) throw httpError(500, 'Aucune validation en attente pour cette étape.');

  // Comportement au refus (configurable dans Admin → Workflows) :
  //  - 'annulation'               → fiche refusée (terminal) ;
  //  - 'retour_etape_precedente'  → revient à l'étape de retour, ou au créateur (brouillon) si aucune.
  let returnStep = null;
  if (step.comportement_si_refus === 'retour_etape_precedente' && step.retour_step_code) {
    returnStep = await workflowEngine.getStepByCode(step.workflow_template_id, step.retour_step_code);
  }
  const toDraft = step.comportement_si_refus !== 'annulation' && !returnStep;

  await withTransaction(async (tx) => {
    await repo.decideApproval(approval.id, 'refuse', user.id, commentaire, tx);
    if (step.comportement_si_refus === 'annulation') {
      await repo.updateStatusAndStep(id, 'rejetee', null, tx);
    } else if (returnStep) {
      await repo.updateStatusAndStep(id, 'en_validation', returnStep.id, tx);
      await repo.createApproval(id, returnStep.id, tx);
    } else {
      await repo.updateStatusAndStep(id, 'brouillon', null, tx); // retour au créateur pour révision
    }
  });

  if (step.comportement_si_refus === 'annulation') {
    await notifications.notify(a.created_by, 'Autorisation de dépense refusée',
      `L'autorisation ${a.numero} a été refusée${commentaire ? ' : ' + commentaire : ''}.`, `/logistique/depenses/${id}`);
  } else if (returnStep && returnStep.role_code_requis) {
    await notifications.notifyRoleOnEntity(a.entity_id, returnStep.role_code_requis, 'Autorisation de dépense renvoyée',
      `L'autorisation ${a.numero} vous est renvoyée${commentaire ? ' : ' + commentaire : ''}.`, `/logistique/depenses/${id}`);
  } else if (toDraft) {
    await notifications.notify(a.created_by, 'Autorisation de dépense renvoyée',
      `L'autorisation ${a.numero} vous est renvoyée pour révision${commentaire ? ' : ' + commentaire : ''}.`, `/logistique/depenses/${id}`);
  }
  return getFullDetail(id);
}

// Le créateur reprend une fiche refusée pour la corriger et la re-soumettre.
async function reopen(user, id) {
  const a = await repo.getById(id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  if (a.created_by !== user.id && !isSuperAdmin(user)) throw httpError(403, "Seul le créateur peut reprendre cette autorisation.");
  if (a.statut !== 'rejetee') throw httpError(400, 'Seule une autorisation refusée peut être reprise.');
  await withTransaction(async (tx) => {
    await repo.deletePendingApprovals(id, tx);
    await repo.updateStatusAndStep(id, 'brouillon', null, tx);
  });
  return getFullDetail(id);
}

// ─── Liste ──────────────────────────────────────────────────────────────────
function scopeFor(user) {
  if (canSeeAll(user)) return null; // tout voir
  const entityIds = [...new Set((user.roles || []).map(r => r.entity_id).filter(Boolean))];
  return { entityIds, createdBy: user.id };
}

async function list(user, filters) {
  return repo.list({ ...filters, scope: scopeFor(user) });
}

// ─── PDF de la fiche ──────────────────────────────────────────────────────
async function generatePdf(user, id) {
  const a = await getFullDetailForUser(user, id);
  if (!a) throw httpError(404, 'Autorisation introuvable.');
  const { logo, signature, stamp } = await branding.getEntityImages(a.entity_id);
  return pdf.generateExpenseAuthorizationPdf({ authorization: a, lignes: a.lignes, approvals: a.approvals, logoBuffer: logo, signatureBuffer: signature, stampBuffer: stamp });
}

module.exports = {
  getFullDetail, getFullDetailForUser, create, update, remove, submit,
  validateStep, rejectStep, reopen, list, generatePdf,
};
