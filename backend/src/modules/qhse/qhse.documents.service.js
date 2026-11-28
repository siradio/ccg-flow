// Module QHSE — Maîtrise documentaire (GED). Registre des documents contrôlés + journal des
// révisions. Un document « en_vigueur » dont la date de révision est dépassée est signalé « à réviser »
// (champ calculé a_reviser). Changer de version enregistre une ligne de révision et replace en vigueur.
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const TYPES = ['politique', 'manuel', 'procedure', 'instruction', 'formulaire', 'enregistrement', 'plan', 'autre'];
const STATUTS = ['brouillon', 'en_vigueur', 'obsolete'];

function withFlags(d) {
  const aReviser = d.statut === 'en_vigueur' && d.date_revision && String(d.date_revision).slice(0, 10) < new Date().toISOString().slice(0, 10);
  return { ...d, a_reviser: !!aReviser };
}

async function listDocuments() {
  const rows = await all(
    `SELECT d.*, bu.nom AS bu_nom FROM qhse_documents d
       LEFT JOIN business_units bu ON bu.id = d.business_unit_id
      ORDER BY d.statut, d.type_document, d.titre`
  );
  return rows.map(withFlags);
}

function sanitize(b) {
  return {
    reference: b.reference || null,
    titre: b.titre || null,
    type_document: TYPES.includes(b.type_document) ? b.type_document : 'procedure',
    domaine: b.domaine || null,
    business_unit_id: b.business_unit_id || null,
    version: b.version || '1',
    date_application: b.date_application || null,
    date_revision: b.date_revision || null,
    redacteur: b.redacteur || null,
    verificateur: b.verificateur || null,
    approbateur: b.approbateur || null,
    emplacement: b.emplacement || null,
    diffusion: b.diffusion || null,
    observations: b.observations || null,
  };
}

async function createDocument(user, b) {
  if (!b.titre) throw httpError(400, 'Titre requis.');
  const s = sanitize(b);
  const statut = STATUTS.includes(b.statut) ? b.statut : 'brouillon';
  const d = await one(
    `INSERT INTO qhse_documents (reference, titre, type_document, domaine, business_unit_id, version,
            statut, date_application, date_revision, redacteur, verificateur, approbateur, emplacement,
            diffusion, observations, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [s.reference, s.titre, s.type_document, s.domaine, s.business_unit_id, s.version, statut,
      s.date_application, s.date_revision, s.redacteur, s.verificateur, s.approbateur, s.emplacement,
      s.diffusion, s.observations, user.id]
  );
  return withFlags(d);
}

async function getDocumentDetail(id) {
  const d = await one(`SELECT d.*, bu.nom AS bu_nom FROM qhse_documents d LEFT JOIN business_units bu ON bu.id = d.business_unit_id WHERE d.id = $1`, [id]);
  if (!d) return null;
  const revisions = await all('SELECT * FROM qhse_document_revisions WHERE document_id = $1 ORDER BY id DESC', [id]);
  return { ...withFlags(d), revisions };
}

async function updateDocument(user, id, b) {
  const cur = await one('SELECT * FROM qhse_documents WHERE id = $1', [id]);
  if (!cur) throw httpError(404, 'Document introuvable.');
  const s = sanitize(b);
  const statut = STATUTS.includes(b.statut) ? b.statut : cur.statut;
  // Journaliser un changement de version.
  if (s.version && s.version !== cur.version) {
    await run('INSERT INTO qhse_document_revisions (document_id, version, date_revision, motif, par) VALUES ($1,$2,$3,$4,$5)',
      [id, s.version, s.date_application || new Date().toISOString().slice(0, 10), b.motif_revision || null, s.redacteur || null]);
  }
  await run(
    `UPDATE qhse_documents SET reference=$1, titre=$2, type_document=$3, domaine=$4, business_unit_id=$5,
            version=$6, statut=$7, date_application=$8, date_revision=$9, redacteur=$10, verificateur=$11,
            approbateur=$12, emplacement=$13, diffusion=$14, observations=$15, updated_at=now() WHERE id=$16`,
    [s.reference, s.titre, s.type_document, s.domaine, s.business_unit_id, s.version, statut,
      s.date_application, s.date_revision, s.redacteur, s.verificateur, s.approbateur, s.emplacement,
      s.diffusion, s.observations, id]
  );
  return getDocumentDetail(id);
}

async function deleteDocument(user, id) {
  const cur = await one('SELECT id FROM qhse_documents WHERE id = $1', [id]);
  if (!cur) throw httpError(404, 'Document introuvable.');
  await run('DELETE FROM qhse_documents WHERE id = $1', [id]);
  return { ok: true };
}

module.exports = { listDocuments, createDocument, getDocumentDetail, updateDocument, deleteDocument };
