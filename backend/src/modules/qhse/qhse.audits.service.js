// Module QHSE — Volet Qualité (QUA-11). Audits : en-tête + constats (avec action/responsable/échéance)
// + clôture manuelle (verrou).
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const STATUTS = ['planifie', 'realise', 'cloture'];

async function listAudits() {
  return all(
    `SELECT a.*, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_audit_findings f WHERE f.audit_id = a.id AND f.type_constat = 'non_conformite') AS nb_nc,
            (SELECT COUNT(*)::int FROM qhse_audit_findings f WHERE f.audit_id = a.id) AS nb_constats
       FROM qhse_audits a
       LEFT JOIN business_units bu ON bu.id = a.business_unit_id
      ORDER BY a.date_audit DESC NULLS LAST, a.id DESC`
  );
}

async function createAudit(user, b) {
  const a = await one(
    `INSERT INTO qhse_audits (date_audit, type_audit, perimetre, auditeur, referentiel, business_unit_id, synthese, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.date_audit || null, b.type_audit || null, b.perimetre || null, b.auditeur || null,
      b.referentiel || null, b.business_unit_id || null, b.synthese || null, user.id]
  );
  const numero = 'AUD-' + String(a.id).padStart(5, '0');
  await run('UPDATE qhse_audits SET numero = $1 WHERE id = $2', [numero, a.id]);
  return { ...a, numero };
}

async function getAuditDetail(id) {
  const a = await one(`SELECT a.*, bu.nom AS bu_nom FROM qhse_audits a LEFT JOIN business_units bu ON bu.id = a.business_unit_id WHERE a.id = $1`, [id]);
  if (!a) return null;
  const findings = await all('SELECT * FROM qhse_audit_findings WHERE audit_id = $1 ORDER BY ordre, id', [id]);
  return { ...a, findings };
}

async function updateAudit(user, id, b) {
  const a = await one('SELECT statut FROM qhse_audits WHERE id = $1', [id]);
  if (!a) throw httpError(404, 'Audit introuvable.');
  if (a.statut === 'cloture') throw httpError(409, 'Audit clôturé : non modifiable.');
  const statut = b.statut && STATUTS.includes(b.statut) && b.statut !== 'cloture' ? b.statut : a.statut;
  await run(
    `UPDATE qhse_audits SET date_audit=$1, type_audit=$2, perimetre=$3, auditeur=$4, referentiel=$5,
            business_unit_id=$6, synthese=$7, statut=$8, updated_at=now() WHERE id=$9`,
    [b.date_audit || null, b.type_audit || null, b.perimetre || null, b.auditeur || null,
      b.referentiel || null, b.business_unit_id || null, b.synthese || null, statut, id]
  );
  return getAuditDetail(id);
}

async function saveFindings(user, id, rows) {
  const a = await one('SELECT statut FROM qhse_audits WHERE id = $1', [id]);
  if (!a) throw httpError(404, 'Audit introuvable.');
  if (a.statut === 'cloture') throw httpError(409, 'Audit clôturé : non modifiable.');
  await run('DELETE FROM qhse_audit_findings WHERE audit_id = $1', [id]);
  let i = 0;
  for (const f of rows || []) {
    await run(
      `INSERT INTO qhse_audit_findings (audit_id, type_constat, description, reference, action, responsable, echeance, statut, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, f.type_constat || null, f.description || null, f.reference || null, f.action || null,
        f.responsable || null, f.echeance || null, f.statut || 'a_faire', i++]
    );
  }
  return getAuditDetail(id);
}

async function closeAudit(user, id) {
  const a = await one('SELECT statut FROM qhse_audits WHERE id = $1', [id]);
  if (!a) throw httpError(404, 'Audit introuvable.');
  if (a.statut === 'cloture') throw httpError(409, 'Audit déjà clôturé.');
  await run(`UPDATE qhse_audits SET statut='cloture', closed_by=$1, closed_at=now(), updated_at=now() WHERE id=$2`, [user.id, id]);
  return getAuditDetail(id);
}

module.exports = { listAudits, createAudit, getAuditDetail, updateAudit, saveFindings, closeAudit };
