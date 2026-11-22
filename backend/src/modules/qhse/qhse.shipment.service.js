// Module QHSE — Lot 4. Contrôle des expéditions / livraisons (ENR-CQ03). Même moteur de conformité
// que les contrôles de production : booléen OUI = conforme ; numérique dans [min, max] si des seuils
// sont renseignés sur le critère, sinon « sans_spec ». Rien d'inventé.
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const boolOrNull = v => (v === '' || v == null ? null : (v === true || v === 'true'));
const numOrNull = v => (v === '' || v == null ? null : v);

function checkConformite(check, criteria) {
  if (!criteria) return 'en_attente';
  if (criteria.type_critere === 'booleen') {
    const b = boolOrNull(check.valeur_bool);
    if (b == null) return 'en_attente';
    return b ? 'conforme' : 'non_conforme';
  }
  if (check.valeur_num == null || check.valeur_num === '') return 'en_attente';
  const min = criteria.seuil_min != null ? Number(criteria.seuil_min) : null;
  const max = criteria.seuil_max != null ? Number(criteria.seuil_max) : null;
  if (min == null && max == null) return 'sans_spec';
  const v = Number(check.valeur_num);
  const ok = (min == null || v >= min) && (max == null || v <= max);
  return ok ? 'conforme' : 'non_conforme';
}

function conformiteGlobale(list) {
  if (list.includes('non_conforme')) return 'non_conforme';
  if (list.includes('en_attente')) return 'en_attente';
  if (list.includes('conforme')) return 'conforme';
  return 'sans_spec';
}

async function listControls() {
  return all(
    `SELECT c.*, p.designation AS product_nom, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_shipment_checks k WHERE k.control_id = c.id) AS nb_checks
       FROM qhse_shipment_controls c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN business_units bu ON bu.id = c.business_unit_id
      ORDER BY c.date_controle DESC NULLS LAST, c.created_at DESC`
  );
}

async function createControl(user, b) {
  const c = await one(
    `INSERT INTO qhse_shipment_controls
       (date_controle, business_unit_id, destination, transporteur, vehicule, product_id, numero_lot, responsable, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.date_controle || null, b.business_unit_id || null, b.destination || null, b.transporteur || null,
      b.vehicule || null, b.product_id || null, b.numero_lot || null, b.responsable || null, user.id]
  );
  const numero = 'EXP-' + String(c.id).padStart(5, '0');
  await run('UPDATE qhse_shipment_controls SET numero = $1 WHERE id = $2', [numero, c.id]);
  return { ...c, numero };
}

async function getControlDetail(id) {
  const control = await one(
    `SELECT c.*, p.designation AS product_nom, bu.nom AS bu_nom
       FROM qhse_shipment_controls c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN business_units bu ON bu.id = c.business_unit_id
      WHERE c.id = $1`, [id]);
  if (!control) return null;
  const checks = await all(
    `SELECT k.*, cr.libelle AS criteria_libelle, cr.type_critere, cr.unite
       FROM qhse_shipment_checks k
       LEFT JOIN qhse_shipment_criteria cr ON cr.id = k.criteria_id
      WHERE k.control_id = $1 ORDER BY k.ordre, k.id`, [id]);
  return { ...control, checks };
}

// Enregistre/remplace les points de contrôle et recalcule la conformité. Bloqué si clôturé.
async function saveChecks(user, controlId, rows) {
  const c = await one('SELECT statut FROM qhse_shipment_controls WHERE id = $1', [controlId]);
  if (!c) throw httpError(404, 'Contrôle introuvable.');
  if (c.statut === 'cloture') throw httpError(409, 'Contrôle clôturé : non modifiable.');
  const criteria = await all('SELECT * FROM qhse_shipment_criteria');
  const byId = new Map(criteria.map(x => [x.id, x]));
  await run('DELETE FROM qhse_shipment_checks WHERE control_id = $1', [controlId]);
  const conformites = [];
  let i = 0;
  for (const row of rows || []) {
    const crit = byId.get(Number(row.criteria_id));
    const conf = checkConformite(row, crit);
    conformites.push(conf);
    await run(
      `INSERT INTO qhse_shipment_checks (control_id, criteria_id, valeur_num, valeur_bool, conforme, observation, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [controlId, row.criteria_id || null, numOrNull(row.valeur_num), boolOrNull(row.valeur_bool), conf, row.observation || null, i++]
    );
  }
  await run('UPDATE qhse_shipment_controls SET conformite = $1 WHERE id = $2', [conformiteGlobale(conformites), controlId]);
  return getControlDetail(controlId);
}

async function closeControl(user, controlId) {
  const c = await one('SELECT statut FROM qhse_shipment_controls WHERE id = $1', [controlId]);
  if (!c) throw httpError(404, 'Contrôle introuvable.');
  if (c.statut === 'cloture') throw httpError(409, 'Contrôle déjà clôturé.');
  await run(`UPDATE qhse_shipment_controls SET statut = 'cloture' WHERE id = $1`, [controlId]);
  return getControlDetail(controlId);
}

module.exports = { listControls, createControl, getControlDetail, saveChecks, closeControl };
