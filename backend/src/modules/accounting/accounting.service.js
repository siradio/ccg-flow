const repo = require('./accounting.repository');
const audit = require('../audit/audit.service');
const { httpError } = require('../../utils/httpError');

async function listPurchaseOrders(user, filters) {
  return repo.listPurchaseOrders({ ...filters, userId: user.id });
}

async function getPurchaseOrder(user, poId) {
  const row = await repo.getPurchaseOrder(poId);
  if (!row) throw httpError(404, 'Bon de commande introuvable.');
  return row;
}

// Prise en charge : l'ouverture d'un BDC non traité depuis la file vaut prise en charge (pas de
// bouton « commencer »). Atomique côté base ; en cas de conflit réel -> 409.
async function takeOver(user, poId) {
  const po = await repo.getPurchaseOrder(poId);
  if (!po) throw httpError(404, 'Bon de commande introuvable.');
  const created = await repo.takeOver(poId, user.id, { companyId: po.entity_id, reference: po.bdc_numero });
  if (created) {
    await audit.logAction({
      tableName: 'accounting_processing', recordId: created.id, purchaseRequestId: po.pr_id,
      action: 'compta_prise_en_charge', userId: user.id, details: { bdc: po.bdc_numero },
    });
    return { processing: created };
  }
  // Conflit d'insertion : une ligne existe déjà. On lit l'état réel.
  const existing = await repo.getProcessingByPo(poId);
  if (existing && existing.assigned_to === user.id) return { processing: existing }; // c'est déjà le mien
  if (existing && existing.status === 'PROCESSED') return { processing: existing }; // déjà traité (lecture seule)
  throw httpError(409, `Ce bon de commande est déjà en cours de traitement par un autre agent${existing && existing.assigned_nom ? ` (${existing.assigned_nom})` : ''}.`);
}

async function complete(user, poId) {
  const po = await repo.getPurchaseOrder(poId);
  if (!po) throw httpError(404, 'Bon de commande introuvable.');
  const { row, rowCount } = await repo.complete(poId, user.id);
  if (rowCount === 0) {
    const existing = await repo.getProcessingByPo(poId);
    if (!existing || existing.status === 'NOT_PROCESSED') throw httpError(400, "Ce bon de commande n'a pas encore été pris en charge.");
    if (existing.status === 'PROCESSED') throw httpError(400, 'Ce bon de commande est déjà traité.');
    throw httpError(403, "Seul l'agent en charge peut finaliser ce traitement.");
  }
  await audit.logAction({
    tableName: 'accounting_processing', recordId: row.id, purchaseRequestId: po.pr_id,
    action: 'compta_traite', userId: user.id, details: { bdc: po.bdc_numero },
  });
  return row;
}

async function stats(user, filters) {
  return repo.stats(filters || {});
}

module.exports = { listPurchaseOrders, getPurchaseOrder, takeOver, complete, stats };
