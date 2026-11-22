const { all, one, run } = require('../../db');
const { mostSpecific, conformiteResultat, conformiteGlobale } = require('./qhse.conformite');

// ---- Moteur de conformité (logique pure dans qhse.conformite.js) ----------------------------
// Résout la spécification en vigueur pour un paramètre donné et un échantillon (produit / famille /
// format). La plus spécifique l'emporte : produit+format > produit > famille+format > famille > générique.
async function resolveSpec(parameterId, sample) {
  const specs = await all(
    `SELECT * FROM qhse_specifications
      WHERE parameter_id = $1 AND actif = true
        AND (product_id IS NULL OR product_id = $2)
        AND (category_id IS NULL OR category_id = $3)
        AND (format_id  IS NULL OR format_id  = $4)
      ORDER BY version DESC, id DESC`,
    [parameterId, sample.product_id || null, sample.category_id || null, sample.format_id || null]
  );
  return mostSpecific(specs);
}

// ---- Échantillons ---------------------------------------------------------------------------
async function listSamples() {
  return all(
    `SELECT s.*, p.designation AS product_nom, f.libelle AS format_libelle, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_analyses a WHERE a.sample_id = s.id) AS nb_analyses
       FROM qhse_samples s
       LEFT JOIN products p ON p.id = s.product_id
       LEFT JOIN qhse_formats f ON f.id = s.format_id
       LEFT JOIN business_units bu ON bu.id = s.business_unit_id
      ORDER BY s.created_at DESC`
  );
}

async function createSample(user, b) {
  const s = await one(
    `INSERT INTO qhse_samples (product_id, format_id, business_unit_id, numero_lot, nature, dp, de, motif, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.product_id || null, b.format_id || null, b.business_unit_id || null, b.numero_lot || null,
      b.nature || null, b.dp || null, b.de || null, b.motif || null, user.id]
  );
  const numero = 'ECH-' + String(s.id).padStart(5, '0');
  await run('UPDATE qhse_samples SET numero = $1 WHERE id = $2', [numero, s.id]);
  return { ...s, numero };
}

// Catégorie du produit (pour la résolution de spécification par famille).
async function sampleWithCategory(sampleId) {
  return one(
    `SELECT s.*, p.category_id FROM qhse_samples s
      LEFT JOIN products p ON p.id = s.product_id WHERE s.id = $1`, [sampleId]);
}

async function getSampleDetail(id) {
  const sample = await sampleWithCategory(id);
  if (!sample) return null;
  const analyses = await all(
    `SELECT a.*, t.libelle AS type_libelle, e.prenom AS tech_prenom, e.nom AS tech_nom
       FROM qhse_analyses a
       JOIN qhse_analysis_types t ON t.id = a.analysis_type_id
       LEFT JOIN employees e ON e.id = a.technicien_id
      WHERE a.sample_id = $1 ORDER BY a.created_at`, [id]);
  return { ...sample, analyses };
}

// ---- Analyses -------------------------------------------------------------------------------
// Crée une analyse et pré-crée une ligne de résultat (vide) par paramètre actif de ce type, pour
// que la grille de saisie soit prête.
async function createAnalysis(user, b) {
  if (!b.sample_id || !b.analysis_type_id) throw httpError(400, 'Échantillon et type requis.');
  const a = await one(
    `INSERT INTO qhse_analyses (sample_id, analysis_type_id, technicien_id, date_analyse, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.sample_id, b.analysis_type_id, b.technicien_id || null, b.date_analyse || null, user.id]
  );
  const params = await all('SELECT id FROM qhse_parameters WHERE analysis_type_id = $1 AND actif = true ORDER BY ordre, libelle', [b.analysis_type_id]);
  for (const p of params) {
    await run('INSERT INTO qhse_results (analysis_id, parameter_id, result_flag) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [a.id, p.id, 'en_attente']);
  }
  return getAnalysisDetail(a.id);
}

async function getAnalysisDetail(id) {
  const a = await one(
    `SELECT a.*, t.libelle AS type_libelle, t.code AS type_code
       FROM qhse_analyses a JOIN qhse_analysis_types t ON t.id = a.analysis_type_id WHERE a.id = $1`, [id]);
  if (!a) return null;
  const sample = await sampleWithCategory(a.sample_id);
  const results = await all(
    `SELECT r.*, p.libelle AS param_libelle, p.unite, p.type_resultat, p.ordre
       FROM qhse_results r JOIN qhse_parameters p ON p.id = r.parameter_id
      WHERE r.analysis_id = $1 ORDER BY p.ordre, p.libelle`, [id]);
  return { ...a, sample, results };
}

// Enregistre/ met à jour les résultats et recalcule la conformité (sans figer la version de spéc :
// le figeage a lieu à la validation). Bloqué si l'analyse est déjà validée.
async function saveResults(user, analysisId, rows) {
  const a = await one('SELECT * FROM qhse_analyses WHERE id = $1', [analysisId]);
  if (!a) throw httpError(404, 'Analyse introuvable.');
  if (a.statut === 'valide') throw httpError(409, 'Analyse déjà validée : non modifiable.');
  const sample = await sampleWithCategory(a.sample_id);
  const conformites = [];
  for (const row of rows || []) {
    const spec = await resolveSpec(row.parameter_id, sample);
    const conf = conformiteResultat(row, spec);
    conformites.push(conf);
    await run(
      `UPDATE qhse_results SET valeur_num = $1, valeur_text = $2, result_flag = $3, observation = $4, conformite = $5
        WHERE analysis_id = $6 AND parameter_id = $7`,
      [row.valeur_num === '' || row.valeur_num == null ? null : row.valeur_num,
        row.valeur_text || null, row.result_flag || 'numerique', row.observation || null, conf,
        analysisId, row.parameter_id]
    );
  }
  await run('UPDATE qhse_analyses SET statut = $1, conformite = $2 WHERE id = $3',
    ['saisi', conformiteGlobale(conformites), analysisId]);
  return getAnalysisDetail(analysisId);
}

// Validation : fige la version de spécification utilisée (spec_id) pour chaque résultat et verrouille.
async function validateAnalysis(user, analysisId) {
  const a = await one('SELECT * FROM qhse_analyses WHERE id = $1', [analysisId]);
  if (!a) throw httpError(404, 'Analyse introuvable.');
  if (a.statut === 'valide') throw httpError(409, 'Analyse déjà validée.');
  const sample = await sampleWithCategory(a.sample_id);
  const results = await all('SELECT * FROM qhse_results WHERE analysis_id = $1', [analysisId]);
  const conformites = [];
  for (const r of results) {
    const spec = await resolveSpec(r.parameter_id, sample);
    const conf = conformiteResultat(r, spec);
    conformites.push(conf);
    await run('UPDATE qhse_results SET conformite = $1, spec_id = $2 WHERE id = $3', [conf, spec ? spec.id : null, r.id]);
  }
  await run(
    `UPDATE qhse_analyses SET statut = 'valide', conformite = $1, validated_by = $2, validated_at = now() WHERE id = $3`,
    [conformiteGlobale(conformites), user.id, analysisId]
  );
  return getAnalysisDetail(analysisId);
}

// ---- Sections opératoires microbiologie (suspension mère, milieux, incubation) ---------------
const boolOrNull = v => (v === '' || v == null ? null : (v === true || v === 'true'));

async function getMicroOps(analysisId) {
  const operations = await one('SELECT * FROM qhse_micro_operations WHERE analysis_id = $1', [analysisId]);
  const media = await all('SELECT * FROM qhse_micro_media WHERE analysis_id = $1 ORDER BY ordre, id', [analysisId]);
  const incubations = await all('SELECT * FROM qhse_micro_incubations WHERE analysis_id = $1 ORDER BY ordre, id', [analysisId]);
  return { operations: operations || null, media, incubations };
}

async function saveMicroOps(user, analysisId, b) {
  const a = await one('SELECT statut FROM qhse_analyses WHERE id = $1', [analysisId]);
  if (!a) throw httpError(404, 'Analyse introuvable.');
  if (a.statut === 'valide') throw httpError(409, 'Analyse déjà validée : non modifiable.');
  const o = b.operations || {};
  await run(
    `INSERT INTO qhse_micro_operations (analysis_id, facteur_dilution, type_diluant, suspension_tech, suspension_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (analysis_id) DO UPDATE SET facteur_dilution=$2, type_diluant=$3, suspension_tech=$4, suspension_date=$5, notes=$6`,
    [analysisId, o.facteur_dilution || null, o.type_diluant || null, o.suspension_tech || null, o.suspension_date || null, o.notes || null]
  );
  await run('DELETE FROM qhse_micro_media WHERE analysis_id = $1', [analysisId]);
  let i = 0;
  for (const m of (b.media || [])) {
    await run(
      `INSERT INTO qhse_micro_media (analysis_id, culture_media_id, pesee, ph_ok, repartition, chauffage_ok, autoclavage_ok, controle_ok, date_prep, preparateur, lot_milieu, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [analysisId, m.culture_media_id || null, m.pesee || null, boolOrNull(m.ph_ok), m.repartition || null,
        boolOrNull(m.chauffage_ok), boolOrNull(m.autoclavage_ok), boolOrNull(m.controle_ok), m.date_prep || null,
        m.preparateur || null, m.lot_milieu || null, i++]
    );
  }
  await run('DELETE FROM qhse_micro_incubations WHERE analysis_id = $1', [analysisId]);
  i = 0;
  for (const inc of (b.incubations || [])) {
    await run(
      `INSERT INTO qhse_micro_incubations (analysis_id, germ_id, germ_libre, temperature, duree, oxygenation, equipement, debut, fin, lot_bp, technicien, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [analysisId, inc.germ_id || null, inc.germ_libre || null, inc.temperature || null, inc.duree || null,
        inc.oxygenation || null, inc.equipement || null, inc.debut || null, inc.fin || null, inc.lot_bp || null,
        inc.technicien || null, i++]
    );
  }
  return getMicroOps(analysisId);
}

// Données complètes d'une analyse pour le bulletin PDF (noms résolus).
async function getAnalysisForPdf(id) {
  const a = await one(
    `SELECT a.*, t.libelle AS type_libelle,
            e.prenom AS tech_prenom, e.nom AS tech_nom,
            vu.prenom AS val_prenom, vu.nom AS val_nom
       FROM qhse_analyses a
       JOIN qhse_analysis_types t ON t.id = a.analysis_type_id
       LEFT JOIN employees e ON e.id = a.technicien_id
       LEFT JOIN users vu ON vu.id = a.validated_by
      WHERE a.id = $1`, [id]);
  if (!a) return null;
  const sample = await one(
    `SELECT s.*, p.designation AS product_nom, f.libelle AS format_libelle
       FROM qhse_samples s
       LEFT JOIN products p ON p.id = s.product_id
       LEFT JOIN qhse_formats f ON f.id = s.format_id
      WHERE s.id = $1`, [a.sample_id]);
  const results = await all(
    `SELECT r.*, p.libelle AS param_libelle, p.unite, p.ordre
       FROM qhse_results r JOIN qhse_parameters p ON p.id = r.parameter_id
      WHERE r.analysis_id = $1 ORDER BY p.ordre, p.libelle`, [id]);
  return {
    analysis: a, sample, results,
    techNom: a.tech_prenom ? `${a.tech_prenom} ${a.tech_nom}` : null,
    validatorNom: a.val_prenom ? `${a.val_prenom} ${a.val_nom}` : null,
  };
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = {
  listSamples, createSample, getSampleDetail,
  createAnalysis, getAnalysisDetail, saveResults, validateAnalysis, getAnalysisForPdf,
  getMicroOps, saveMicroOps,
};
