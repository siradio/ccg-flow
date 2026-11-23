// Module QHSE — Lot 2. Échantillonnage en ligne (CQ-PR003) : sessions de prélèvement rattachées à
// un plan (n/c/m/M, référentiel) avec prélèvements Début / Milieu / Fin par format. Pas de calcul
// d'acceptation ici (il dépend des résultats d'analyses) : ce lot assure la traçabilité des
// prélèvements. La colonne sample_id relie un prélèvement à un échantillon de laboratoire (ultérieur).
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function listSamplings() {
  return all(
    `SELECT s.*, p.designation AS product_nom, f.libelle AS format_libelle,
            l.libelle AS ligne_libelle, bu.nom AS bu_nom, pl.libelle AS plan_libelle,
            (SELECT COUNT(*)::int FROM qhse_sampling_items i WHERE i.sampling_id = s.id) AS nb_prelevements
       FROM qhse_samplings s
       LEFT JOIN products p ON p.id = s.product_id
       LEFT JOIN qhse_formats f ON f.id = s.format_id
       LEFT JOIN qhse_conditioning_lines l ON l.id = s.conditioning_line_id
       LEFT JOIN business_units bu ON bu.id = s.business_unit_id
       LEFT JOIN qhse_sampling_plans pl ON pl.id = s.plan_id
      ORDER BY s.date_prelevement DESC NULLS LAST, s.created_at DESC`
  );
}

async function createSampling(user, b) {
  const s = await one(
    `INSERT INTO qhse_samplings
       (date_prelevement, business_unit_id, product_id, format_id, conditioning_line_id, plan_id, numero_lot, responsable, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.date_prelevement || null, b.business_unit_id || null, b.product_id || null, b.format_id || null,
      b.conditioning_line_id || null, b.plan_id || null, b.numero_lot || null, b.responsable || null, user.id]
  );
  const numero = 'PREL-' + String(s.id).padStart(5, '0');
  await run('UPDATE qhse_samplings SET numero = $1 WHERE id = $2', [numero, s.id]);
  return { ...s, numero };
}

async function getSamplingDetail(id) {
  const sampling = await one(
    `SELECT s.*, p.designation AS product_nom, f.libelle AS format_libelle,
            l.libelle AS ligne_libelle, bu.nom AS bu_nom,
            pl.libelle AS plan_libelle, pl.taille_n, pl.acceptation_c, pl.seuil_m, pl.seuil_grand_m
       FROM qhse_samplings s
       LEFT JOIN products p ON p.id = s.product_id
       LEFT JOIN qhse_formats f ON f.id = s.format_id
       LEFT JOIN qhse_conditioning_lines l ON l.id = s.conditioning_line_id
       LEFT JOIN business_units bu ON bu.id = s.business_unit_id
       LEFT JOIN qhse_sampling_plans pl ON pl.id = s.plan_id
      WHERE s.id = $1`, [id]);
  if (!sampling) return null;
  const items = await all(
    `SELECT i.*, st.libelle AS type_libelle, sm.numero AS sample_numero
       FROM qhse_sampling_items i
       LEFT JOIN qhse_sampling_types st ON st.id = i.sampling_type_id
       LEFT JOIN qhse_samples sm ON sm.id = i.sample_id
      WHERE i.sampling_id = $1 ORDER BY i.ordre, i.id`, [id]);
  return { ...sampling, items };
}

// Remplace l'ensemble des prélèvements. Bloqué si la session est clôturée. sample_id conservé s'il
// est transmis (le front renvoie les prélèvements chargés, lien labo compris).
async function saveItems(user, samplingId, rows) {
  const s = await one('SELECT statut FROM qhse_samplings WHERE id = $1', [samplingId]);
  if (!s) throw httpError(404, 'Session introuvable.');
  if (s.statut === 'cloture') throw httpError(409, 'Session clôturée : non modifiable.');
  await run('DELETE FROM qhse_sampling_items WHERE sampling_id = $1', [samplingId]);
  let i = 0;
  for (const row of rows || []) {
    await run(
      `INSERT INTO qhse_sampling_items
         (sampling_id, sampling_type_id, heure, numero_echantillon, sample_id, observation, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [samplingId, row.sampling_type_id || null, row.heure || null, row.numero_echantillon || null,
        row.sample_id || null, row.observation || null, i++]
    );
  }
  return getSamplingDetail(samplingId);
}

async function closeSampling(user, samplingId) {
  const s = await one('SELECT statut FROM qhse_samplings WHERE id = $1', [samplingId]);
  if (!s) throw httpError(404, 'Session introuvable.');
  if (s.statut === 'cloture') throw httpError(409, 'Session déjà clôturée.');
  await run(`UPDATE qhse_samplings SET statut = 'cloture' WHERE id = $1`, [samplingId]);
  return getSamplingDetail(samplingId);
}

module.exports = { listSamplings, createSampling, getSamplingDetail, saveItems, closeSampling };
