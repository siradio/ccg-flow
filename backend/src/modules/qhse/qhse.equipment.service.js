// Module QHSE — Volet Qualité (QUA-10). Équipements de mesure : inventaire + vérifications/étalonnages.
// Lors de l'ajout d'une vérification, on met à jour derniere_verif + prochaine_verif de l'équipement.
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function listEquipment() {
  return all(
    `SELECT e.*, bu.nom AS bu_nom
       FROM qhse_equipment e
       LEFT JOIN business_units bu ON bu.id = e.business_unit_id
      ORDER BY (e.prochaine_verif IS NULL), e.prochaine_verif ASC, e.libelle`
  );
}

function cleanEquip(b) {
  return {
    code: b.code || null, libelle: (b.libelle || '').trim() || null, type: b.type || null,
    localisation: b.localisation || null,
    business_unit_id: b.business_unit_id ? Number(b.business_unit_id) : null,
    criticite: b.criticite === 'critique' || b.criticite === 'normale' ? b.criticite : null,
    frequence_mois: b.frequence_mois === '' || b.frequence_mois == null ? null : Number(b.frequence_mois),
    derniere_verif: b.derniere_verif || null, prochaine_verif: b.prochaine_verif || null,
    statut: ['en_service', 'hors_service', 'reforme'].includes(b.statut) ? b.statut : 'en_service',
    commentaire: b.commentaire || null,
    actif: b.actif == null ? true : !!b.actif,
  };
}

async function createEquipment(b) {
  const c = cleanEquip(b);
  if (!c.libelle) throw httpError(400, 'Libellé requis.');
  return one(
    `INSERT INTO qhse_equipment (code, libelle, type, localisation, business_unit_id, criticite, frequence_mois, derniere_verif, prochaine_verif, statut, commentaire, actif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [c.code, c.libelle, c.type, c.localisation, c.business_unit_id, c.criticite, c.frequence_mois, c.derniere_verif, c.prochaine_verif, c.statut, c.commentaire, c.actif]
  );
}

async function updateEquipment(id, b) {
  const c = cleanEquip(b);
  if (!c.libelle) throw httpError(400, 'Libellé requis.');
  const row = await one(
    `UPDATE qhse_equipment SET code=$1, libelle=$2, type=$3, localisation=$4, business_unit_id=$5, criticite=$6,
            frequence_mois=$7, derniere_verif=$8, prochaine_verif=$9, statut=$10, commentaire=$11, actif=$12, updated_at=now()
      WHERE id=$13 RETURNING *`,
    [c.code, c.libelle, c.type, c.localisation, c.business_unit_id, c.criticite, c.frequence_mois, c.derniere_verif, c.prochaine_verif, c.statut, c.commentaire, c.actif, id]
  );
  if (!row) throw httpError(404, 'Équipement introuvable.');
  return row;
}

async function getEquipmentDetail(id) {
  const e = await one(`SELECT e.*, bu.nom AS bu_nom FROM qhse_equipment e LEFT JOIN business_units bu ON bu.id = e.business_unit_id WHERE e.id = $1`, [id]);
  if (!e) return null;
  const verifications = await all('SELECT * FROM qhse_equipment_verifications WHERE equipment_id = $1 ORDER BY date_verif DESC NULLS LAST, id DESC', [id]);
  return { ...e, verifications };
}

async function addVerification(user, id, b) {
  const e = await one('SELECT id FROM qhse_equipment WHERE id = $1', [id]);
  if (!e) throw httpError(404, 'Équipement introuvable.');
  await run(
    `INSERT INTO qhse_equipment_verifications (equipment_id, date_verif, type_verif, resultat, prochaine_echeance, operateur, organisme, commentaire, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, b.date_verif || null, b.type_verif || null, b.resultat || null, b.prochaine_echeance || null,
      b.operateur || null, b.organisme || null, b.commentaire || null, user.id]
  );
  // Met à jour l'équipement : dernière vérif = date saisie, prochaine = échéance saisie (si fournie).
  await run('UPDATE qhse_equipment SET derniere_verif = COALESCE($2, derniere_verif), prochaine_verif = COALESCE($3, prochaine_verif), updated_at = now() WHERE id = $1',
    [id, b.date_verif || null, b.prochaine_echeance || null]);
  return getEquipmentDetail(id);
}

async function deleteVerification(id, verifId) {
  await run('DELETE FROM qhse_equipment_verifications WHERE id = $1 AND equipment_id = $2', [verifId, id]);
  return getEquipmentDetail(id);
}

async function removeEquipment(id) { await run('DELETE FROM qhse_equipment WHERE id = $1', [id]); }

module.exports = { listEquipment, createEquipment, updateEquipment, getEquipmentDetail, addVerification, deleteVerification, removeEquipment };
