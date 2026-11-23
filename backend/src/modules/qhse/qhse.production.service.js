// Module QHSE — Lot 2. Contrôles de production (CQ-PR003) : relevés horaires de critères
// paramétrables (poids, soudure, étiquetage, dates, visuel…) par équipe. La conformité d'un relevé
// découle du type du critère : booléen → OUI = conforme ; numérique → dans [min, max] si des seuils
// sont renseignés sur le critère, sinon « sans_spec » (on n'invente pas de seuil).
const { all, one, run } = require('../../db');
const { boolOrNull, criteriaConformite, conformiteGlobale } = require('./qhse.conformite');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

const numOrNull = v => (v === '' || v == null ? null : v);

async function listControls() {
  return all(
    `SELECT c.*, p.designation AS product_nom, f.libelle AS format_libelle,
            l.libelle AS ligne_libelle, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_production_readings r WHERE r.control_id = c.id) AS nb_releves
       FROM qhse_production_controls c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN qhse_formats f ON f.id = c.format_id
       LEFT JOIN qhse_conditioning_lines l ON l.id = c.conditioning_line_id
       LEFT JOIN business_units bu ON bu.id = c.business_unit_id
      ORDER BY c.date_controle DESC NULLS LAST, c.created_at DESC`
  );
}

async function createControl(user, b) {
  const c = await one(
    `INSERT INTO qhse_production_controls
       (date_controle, business_unit_id, product_id, format_id, conditioning_line_id, numero_lot, equipe, responsable, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.date_controle || null, b.business_unit_id || null, b.product_id || null, b.format_id || null,
      b.conditioning_line_id || null, b.numero_lot || null, b.equipe || null, b.responsable || null, user.id]
  );
  const numero = 'CTRLP-' + String(c.id).padStart(5, '0');
  await run('UPDATE qhse_production_controls SET numero = $1 WHERE id = $2', [numero, c.id]);
  return { ...c, numero };
}

async function getControlDetail(id) {
  const control = await one(
    `SELECT c.*, p.designation AS product_nom, f.libelle AS format_libelle,
            l.libelle AS ligne_libelle, bu.nom AS bu_nom
       FROM qhse_production_controls c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN qhse_formats f ON f.id = c.format_id
       LEFT JOIN qhse_conditioning_lines l ON l.id = c.conditioning_line_id
       LEFT JOIN business_units bu ON bu.id = c.business_unit_id
      WHERE c.id = $1`, [id]);
  if (!control) return null;
  const readings = await all(
    `SELECT r.*, cr.libelle AS criteria_libelle, cr.type_critere, cr.unite
       FROM qhse_production_readings r
       LEFT JOIN qhse_production_criteria cr ON cr.id = r.criteria_id
      WHERE r.control_id = $1 ORDER BY r.ordre, r.id`, [id]);
  return { ...control, readings };
}

// Enregistre les relevés (remplace l'ensemble) et recalcule la conformité. Bloqué si clôturé.
async function saveReadings(user, controlId, rows) {
  const c = await one('SELECT statut FROM qhse_production_controls WHERE id = $1', [controlId]);
  if (!c) throw httpError(404, 'Contrôle introuvable.');
  if (c.statut === 'cloture') throw httpError(409, 'Contrôle clôturé : non modifiable.');
  const criteria = await all('SELECT * FROM qhse_production_criteria');
  const byId = new Map(criteria.map(x => [x.id, x]));
  await run('DELETE FROM qhse_production_readings WHERE control_id = $1', [controlId]);
  const conformites = [];
  let i = 0;
  for (const row of rows || []) {
    const crit = byId.get(Number(row.criteria_id));
    const conf = criteriaConformite(row, crit);
    conformites.push(conf);
    await run(
      `INSERT INTO qhse_production_readings
         (control_id, heure, criteria_id, valeur_num, valeur_bool, conforme, observation, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [controlId, row.heure || null, row.criteria_id || null, numOrNull(row.valeur_num),
        boolOrNull(row.valeur_bool), conf, row.observation || null, i++]
    );
  }
  await run('UPDATE qhse_production_controls SET conformite = $1 WHERE id = $2',
    [conformiteGlobale(conformites), controlId]);
  return getControlDetail(controlId);
}

async function closeControl(user, controlId) {
  const c = await one('SELECT statut FROM qhse_production_controls WHERE id = $1', [controlId]);
  if (!c) throw httpError(404, 'Contrôle introuvable.');
  if (c.statut === 'cloture') throw httpError(409, 'Contrôle déjà clôturé.');
  await run(`UPDATE qhse_production_controls SET statut = 'cloture' WHERE id = $1`, [controlId]);
  return getControlDetail(controlId);
}

module.exports = { listControls, createControl, getControlDetail, saveReadings, closeControl };
