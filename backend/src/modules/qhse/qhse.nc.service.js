// Module QHSE — Lot 3. Non-conformités / CAPA (diagramme IN-CQ06). Fiche NC + analyse des causes
// (5M) + actions correctives/préventives + vérification + clôture. Aucune règle inventée : la
// gravité vient du référentiel, les statuts sont explicites, la clôture est manuelle.
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function listNC() {
  return all(
    `SELECT n.*, sv.libelle AS severity_libelle, p.designation AS product_nom, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_nc_actions a WHERE a.nc_id = n.id) AS nb_actions,
            (SELECT COUNT(*)::int FROM qhse_nc_actions a WHERE a.nc_id = n.id AND a.statut <> 'faite') AS nb_actions_ouvertes
       FROM qhse_nonconformities n
       LEFT JOIN qhse_nc_severities sv ON sv.id = n.severity_id
       LEFT JOIN products p ON p.id = n.product_id
       LEFT JOIN business_units bu ON bu.id = n.business_unit_id
      ORDER BY n.created_at DESC`
  );
}

async function createNC(user, b) {
  const n = await one(
    `INSERT INTO qhse_nonconformities
       (date_detection, detecteur, source, severity_id, business_unit_id, product_id, format_id,
        numero_lot, sample_id, analysis_id, stock_lot_id, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [b.date_detection || null, b.detecteur || null, b.source || null, b.severity_id || null,
      b.business_unit_id || null, b.product_id || null, b.format_id || null, b.numero_lot || null,
      b.sample_id || null, b.analysis_id || null, b.stock_lot_id || null, b.description || null, user.id]
  );
  const numero = 'NC-' + String(n.id).padStart(5, '0');
  await run('UPDATE qhse_nonconformities SET numero = $1 WHERE id = $2', [numero, n.id]);
  return { ...n, numero };
}

async function getNCDetail(id) {
  const nc = await one(
    `SELECT n.*, sv.libelle AS severity_libelle, p.designation AS product_nom, f.libelle AS format_libelle,
            bu.nom AS bu_nom
       FROM qhse_nonconformities n
       LEFT JOIN qhse_nc_severities sv ON sv.id = n.severity_id
       LEFT JOIN products p ON p.id = n.product_id
       LEFT JOIN qhse_formats f ON f.id = n.format_id
       LEFT JOIN business_units bu ON bu.id = n.business_unit_id
      WHERE n.id = $1`, [id]);
  if (!nc) return null;
  const causes = await all('SELECT * FROM qhse_nc_causes WHERE nc_id = $1 ORDER BY ordre, id', [id]);
  const actions = await all('SELECT * FROM qhse_nc_actions WHERE nc_id = $1 ORDER BY ordre, id', [id]);
  return { ...nc, causes, actions };
}

const STATUTS = ['ouverte', 'analyse', 'action', 'verification', 'cloturee'];

// Met à jour les champs d'en-tête (risque, action immédiate, efficacité, conclusion, statut…).
// Bloqué si déjà clôturée. La clôture passe par closeNC (trace closed_by/at).
async function updateNC(user, id, b) {
  const nc = await one('SELECT statut FROM qhse_nonconformities WHERE id = $1', [id]);
  if (!nc) throw httpError(404, 'Non-conformité introuvable.');
  if (nc.statut === 'cloturee') throw httpError(409, 'Non-conformité clôturée : non modifiable.');
  const statut = b.statut && STATUTS.includes(b.statut) && b.statut !== 'cloturee' ? b.statut : nc.statut;
  await run(
    `UPDATE qhse_nonconformities SET
       date_detection = $1, detecteur = $2, source = $3, severity_id = $4, business_unit_id = $5,
       product_id = $6, format_id = $7, numero_lot = $8, description = $9, risque = $10,
       action_immediate = $11, efficacite = $12, conclusion = $13, statut = $14
     WHERE id = $15`,
    [b.date_detection || null, b.detecteur || null, b.source || null, b.severity_id || null,
      b.business_unit_id || null, b.product_id || null, b.format_id || null, b.numero_lot || null,
      b.description || null, b.risque || null, b.action_immediate || null, b.efficacite || null,
      b.conclusion || null, statut, id]
  );
  return getNCDetail(id);
}

async function saveCauses(user, id, rows) {
  const nc = await one('SELECT statut FROM qhse_nonconformities WHERE id = $1', [id]);
  if (!nc) throw httpError(404, 'Non-conformité introuvable.');
  if (nc.statut === 'cloturee') throw httpError(409, 'Non-conformité clôturée : non modifiable.');
  await run('DELETE FROM qhse_nc_causes WHERE nc_id = $1', [id]);
  let i = 0;
  for (const c of rows || []) {
    await run('INSERT INTO qhse_nc_causes (nc_id, categorie, description, ordre) VALUES ($1,$2,$3,$4)',
      [id, c.categorie || null, c.description || null, i++]);
  }
  return getNCDetail(id);
}

async function saveActions(user, id, rows) {
  const nc = await one('SELECT statut FROM qhse_nonconformities WHERE id = $1', [id]);
  if (!nc) throw httpError(404, 'Non-conformité introuvable.');
  if (nc.statut === 'cloturee') throw httpError(409, 'Non-conformité clôturée : non modifiable.');
  await run('DELETE FROM qhse_nc_actions WHERE nc_id = $1', [id]);
  let i = 0;
  for (const a of rows || []) {
    await run(
      `INSERT INTO qhse_nc_actions (nc_id, type_action, description, responsable, echeance, statut, date_realisation, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, a.type_action || null, a.description || null, a.responsable || null, a.echeance || null,
        a.statut || 'a_faire', a.date_realisation || null, i++]
    );
  }
  return getNCDetail(id);
}

// Clôture (verrou). Réservée au niveau édition (voir routes).
async function closeNC(user, id) {
  const nc = await one('SELECT statut FROM qhse_nonconformities WHERE id = $1', [id]);
  if (!nc) throw httpError(404, 'Non-conformité introuvable.');
  if (nc.statut === 'cloturee') throw httpError(409, 'Non-conformité déjà clôturée.');
  await run(`UPDATE qhse_nonconformities SET statut = 'cloturee', closed_by = $1, closed_at = now() WHERE id = $2`,
    [user.id, id]);
  return getNCDetail(id);
}

module.exports = { listNC, createNC, getNCDetail, updateNC, saveCauses, saveActions, closeNC };
