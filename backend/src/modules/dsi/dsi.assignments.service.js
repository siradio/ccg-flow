const { one, withTransaction } = require('../../db');
const audit = require('../audit/audit.service');
const { httpError } = require('../../utils/httpError');
const eqRepo = require('./dsi.equipment.repository');

// Validation du bénéficiaire selon le type d'affectation.
function beneficiaryFields(body) {
  const type = body.beneficiaire_type;
  const map = { employe: 'employee_id', service: 'business_unit_id', filiale: 'entity_id', site: 'site_id' };
  const col = map[type];
  if (!col) throw httpError(400, 'Type de bénéficiaire invalide.');
  const val = body[col];
  if (!val) throw httpError(400, 'Bénéficiaire requis pour ce type d’affectation.');
  return {
    beneficiaire_type: type,
    employee_id: type === 'employe' ? Number(val) : null,
    business_unit_id: type === 'service' ? Number(val) : null,
    entity_id: type === 'filiale' ? Number(val) : null,
    site_id: type === 'site' ? Number(val) : null,
  };
}

async function activeAssignment(tx, equipmentId) {
  return tx.one(`SELECT * FROM dsi_assignments WHERE equipment_id = $1 AND statut = 'active'`, [equipmentId]);
}

async function insertAssignment(tx, equipmentId, b, userId) {
  const bf = beneficiaryFields(b);
  return tx.one(
    `INSERT INTO dsi_assignments
       (equipment_id, beneficiaire_type, employee_id, business_unit_id, entity_id, site_id,
        date_affectation, affecte_par, etat_remise, accessoires_remis, retour_prevu, commentaire)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7, CURRENT_DATE), $8,$9,$10,$11,$12) RETURNING *`,
    [equipmentId, bf.beneficiaire_type, bf.employee_id, bf.business_unit_id, bf.entity_id, bf.site_id,
     b.date_affectation || null, userId, b.etat_remise || null, b.accessoires_remis || null,
     b.retour_prevu || null, b.commentaire || null]);
}

// Affecter un équipement libre. Refuse si une affectation active existe (→ Transférer/Restituer).
async function assign(user, equipmentId, body) {
  const eq = await eqRepo.getById(equipmentId);
  if (!eq) throw httpError(404, 'Équipement introuvable.');
  return withTransaction(async (tx) => {
    if (await activeAssignment(tx, equipmentId)) {
      throw httpError(409, 'Cet équipement est déjà affecté. Utilisez « Transférer » ou « Restituer ».');
    }
    const a = await insertAssignment(tx, equipmentId, body, user.id);
    await tx.run(`UPDATE dsi_equipment SET statut = 'affecte', updated_at = now() WHERE id = $1`, [equipmentId]);
    await audit.logAction({ tableName: 'dsi_assignments', recordId: a.id, action: 'dsi_affectation', userId: user.id, details: { equipment: eq.numero_inventaire, type: a.beneficiaire_type } });
    return a;
  });
}

// Transférer / réaffecter : clôture l'affectation active (si présente) puis en crée une nouvelle.
async function transfer(user, equipmentId, body) {
  const eq = await eqRepo.getById(equipmentId);
  if (!eq) throw httpError(404, 'Équipement introuvable.');
  return withTransaction(async (tx) => {
    const cur = await activeAssignment(tx, equipmentId);
    if (cur) {
      await tx.run(
        `UPDATE dsi_assignments SET statut='cloturee', motif_cloture='transfert',
           date_restitution=COALESCE($2, CURRENT_DATE), closed_by=$3, updated_at=now() WHERE id=$1`,
        [cur.id, body.date_affectation || null, user.id]);
    }
    const a = await insertAssignment(tx, equipmentId, body, user.id);
    await tx.run(`UPDATE dsi_equipment SET statut='affecte', updated_at=now() WHERE id=$1`, [equipmentId]);
    await audit.logAction({ tableName: 'dsi_assignments', recordId: a.id, action: 'dsi_transfert', userId: user.id, details: { equipment: eq.numero_inventaire, from: cur?.id || null } });
    return a;
  });
}

// Restituer : clôture l'affectation active et remet l'équipement disponible (ou statut fourni).
async function restituer(user, equipmentId, body) {
  const eq = await eqRepo.getById(equipmentId);
  if (!eq) throw httpError(404, 'Équipement introuvable.');
  const newStatut = ['disponible', 'en_stock', 'en_maintenance', 'en_panne', 'reforme', 'perdu', 'vole'].includes(body.new_statut)
    ? body.new_statut : 'disponible';
  return withTransaction(async (tx) => {
    const cur = await activeAssignment(tx, equipmentId);
    if (!cur) throw httpError(400, 'Aucune affectation active à restituer.');
    await tx.run(
      `UPDATE dsi_assignments SET statut='cloturee', motif_cloture='restitution',
         date_restitution=COALESCE($2, CURRENT_DATE), etat_restitution=$3, accessoires_restitues=$4,
         anomalies=$5, commentaire=COALESCE($6, commentaire), closed_by=$7, updated_at=now() WHERE id=$1`,
      [cur.id, body.date_restitution || null, body.etat_restitution || null, body.accessoires_restitues || null,
       body.anomalies || null, body.commentaire || null, user.id]);
    await tx.run(`UPDATE dsi_equipment SET statut=$2, updated_at=now() WHERE id=$1`, [equipmentId, newStatut]);
    await audit.logAction({ tableName: 'dsi_assignments', recordId: cur.id, action: 'dsi_restitution', userId: user.id, details: { equipment: eq.numero_inventaire, new_statut: newStatut } });
    return { id: cur.id, new_statut: newStatut };
  });
}

module.exports = { assign, transfer, restituer };
