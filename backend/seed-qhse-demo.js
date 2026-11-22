// Seed de DÉMONSTRATION du module QHSE — à exécuter MANUELLEMENT sur l'environnement DEV
// uniquement, pour alimenter les graphiques du tableau de bord. N'est jamais appelé automatiquement
// (ni par les migrations, ni par le serveur) : aucune donnée démo ne part en production tant que
// personne ne lance ce script là-bas.
//
//   Usage :   node seed-qhse-demo.js --confirm      (insère ~6 mois de données de démo)
//             node seed-qhse-demo.js --purge         (supprime les données de démo)
//
// Les enregistrements sont marqués (motif/critère/responsable/détecteur = repères ci-dessous) pour
// être repérables et purgeables sans toucher aux vraies données.
const { pool, all, one, run } = require('./src/db');
const { conformiteResultat, criteriaConformite, conformiteGlobale } = require('./src/modules/qhse/qhse.conformite');

const MARK_SPEC = 'SEED_DEMO';        // qhse_specifications.critere
const MARK_MOTIF = 'SEED_DEMO';       // qhse_samples.motif
const MARK_RESP = 'Démo QHSE';        // production/shipment.responsable
const MARK_DETECT = 'Démo QHSE';      // nonconformities.detecteur
const MARK_DECID = 'Démo QHSE';       // lot_releases.decideur

// Seuils de DÉMO par code de paramètre (physico : [min,max] ; micro : max seul → « non détecté » = conforme).
const PHYS = { ph: [3.5, 4.5], acidite: [0, 2], brix: [8, 18], ms_humidite: [10, 90], ir: [1.3, 1.5], visc_d: [100, 5000], visc_f: [100, 5000] };
const MICRO = { fmat: 100000, lm: 1000, ct: 100, cf: 10, ecoli: 10, entero: 100 };

const rnd = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const pad = n => String(n).padStart(5, '0');
function dateInMonth(monthsAgo) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1 + Math.floor(Math.random() * 27), 9, 0, 0);
}
const iso = d => d.toISOString();
const ymd = d => d.toISOString().slice(0, 10);

async function purge() {
  console.log('Purge des données de démo QHSE…');
  await run(`UPDATE stock_lots SET statut_qualite = NULL WHERE id IN (SELECT stock_lot_id FROM qhse_lot_releases WHERE decideur = $1)`, [MARK_DECID]);
  await run(`DELETE FROM qhse_lot_releases WHERE decideur = $1`, [MARK_DECID]);
  await run(`DELETE FROM qhse_nonconformities WHERE detecteur = $1`, [MARK_DETECT]); // cascade causes/actions
  await run(`DELETE FROM qhse_production_controls WHERE responsable = $1`, [MARK_RESP]); // cascade readings
  await run(`DELETE FROM qhse_shipment_controls WHERE responsable = $1`, [MARK_RESP]);   // cascade checks
  await run(`DELETE FROM qhse_samples WHERE motif = $1`, [MARK_MOTIF]);                   // cascade analyses/results
  await run(`DELETE FROM qhse_specifications WHERE critere = $1`, [MARK_SPEC]);
  console.log('Purge terminée.');
}

async function seed() {
  const existing = await one(`SELECT COUNT(*)::int AS n FROM qhse_samples WHERE motif = $1`, [MARK_MOTIF]);
  if (existing.n > 0) {
    console.log(`Données de démo déjà présentes (${existing.n} échantillons). Rien à faire. (Utilisez --purge pour réinitialiser.)`);
    return;
  }

  const userRow = await one('SELECT id FROM users ORDER BY id LIMIT 1');
  if (!userRow) throw new Error('Aucun utilisateur en base.');
  const userId = userRow.id;
  const products = await all('SELECT id, category_id FROM products ORDER BY id LIMIT 6');
  if (!products.length) throw new Error('Aucun produit en base — seedez d\'abord les référentiels.');
  const bus = await all('SELECT id FROM business_units ORDER BY id');
  const formats = await all('SELECT id FROM qhse_formats ORDER BY id');
  const lines = await all('SELECT id FROM qhse_conditioning_lines ORDER BY id');
  const severities = await all('SELECT id FROM qhse_nc_severities ORDER BY id');
  const physType = await one(`SELECT id FROM qhse_analysis_types WHERE code = 'physico_chimique' LIMIT 1`);
  const microType = await one(`SELECT id FROM qhse_analysis_types WHERE code = 'microbiologique' LIMIT 1`);
  const prodCrit = await all('SELECT * FROM qhse_production_criteria WHERE actif = true ORDER BY ordre, id');
  const shipCrit = await all('SELECT * FROM qhse_shipment_criteria WHERE actif = true ORDER BY ordre, id');
  const physParams = physType ? await all('SELECT id, code FROM qhse_parameters WHERE analysis_type_id = $1 AND actif = true', [physType.id]) : [];
  const microParams = microType ? await all('SELECT id, code FROM qhse_parameters WHERE analysis_type_id = $1 AND actif = true', [microType.id]) : [];
  const buId = () => (bus.length ? pick(bus).id : null);

  // 1) Spécifications de démo (une par paramètre connu), pour que les résultats aient un verdict.
  const specByParam = {};
  async function ensureSpec(paramId, min, max) {
    const row = await one(
      `INSERT INTO qhse_specifications (parameter_id, seuil_min, seuil_max, critere, version, date_effet, actif, created_by)
       VALUES ($1,$2,$3,$4,1,CURRENT_DATE,true,$5) RETURNING id`,
      [paramId, min, max, MARK_SPEC, userId]);
    specByParam[paramId] = { id: row.id, seuil_min: min, seuil_max: max };
  }
  for (const p of physParams) if (PHYS[p.code]) await ensureSpec(p.id, PHYS[p.code][0], PHYS[p.code][1]);
  for (const p of microParams) if (MICRO[p.code] != null) await ensureSpec(p.id, null, MICRO[p.code]);

  const counts = { samples: 0, analyses: 0, results: 0, prod: 0, ship: 0, nc: 0, releases: 0 };
  const nonConformeLots = []; // pour relier des NC à des analyses non conformes

  // 2) Échantillons + analyses + résultats, répartis sur 6 mois (tendance croissante).
  for (let mAgo = 5; mAgo >= 0; mAgo--) {
    const nb = 4 + (5 - mAgo); // 4 → 9 par mois (tendance montante)
    for (let i = 0; i < nb; i++) {
      const d = dateInMonth(mAgo);
      const prod = pick(products);
      const lot = `L${ymd(d).replace(/-/g, '')}-${Math.floor(rnd(100, 999))}`;
      const s = await one(
        `INSERT INTO qhse_samples (product_id, format_id, business_unit_id, numero_lot, nature, motif, statut, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'ouvert',$7,$8) RETURNING id`,
        [prod.id, formats.length ? pick(formats).id : null, buId(), lot, 'Produit fini', MARK_MOTIF, userId, iso(d)]);
      await run('UPDATE qhse_samples SET numero = $1 WHERE id = $2', ['ECH-' + pad(s.id), s.id]);
      counts.samples++;

      // Analyse physico-chimique
      const analyses = [[physType, physParams, 'phys']];
      if (microType && chance(0.45)) analyses.push([microType, microParams, 'micro']);
      for (const [type, params, kind] of analyses) {
        if (!type) continue;
        const confs = [];
        const rows = [];
        for (const p of params) {
          const spec = specByParam[p.id];
          if (!spec) continue;
          let flag = 'numerique', valeur = null;
          if (kind === 'micro' && chance(0.25)) { flag = 'non_detecte'; }
          else if (chance(0.08)) { flag = 'en_attente'; }
          else if (spec.seuil_min != null) { // physico : dans ou hors [min,max]
            valeur = chance(0.72) ? rnd(spec.seuil_min, spec.seuil_max)
              : (chance(0.5) ? rnd(spec.seuil_min * 0.6, spec.seuil_min * 0.95) : rnd(spec.seuil_max * 1.05, spec.seuil_max * 1.4));
          } else { // micro : max seul
            valeur = chance(0.75) ? rnd(0, spec.seuil_max * 0.8) : rnd(spec.seuil_max * 1.1, spec.seuil_max * 2);
          }
          const result = { result_flag: flag, valeur_num: valeur == null ? null : Number(valeur.toFixed(4)) };
          const conf = conformiteResultat(result, spec);
          confs.push(conf);
          rows.push({ pid: p.id, ...result, conf, spec_id: spec.id });
        }
        if (!rows.length) continue;
        const gConf = conformiteGlobale(confs);
        const statut = confs.includes('en_attente') ? 'saisi' : 'valide';
        const a = await one(
          `INSERT INTO qhse_analyses (sample_id, analysis_type_id, technicien_id, date_analyse, statut, conformite, validated_by, validated_at, created_by, created_at)
           VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [s.id, type.id, ymd(d), statut, gConf, statut === 'valide' ? userId : null, statut === 'valide' ? iso(d) : null, userId, iso(d)]);
        counts.analyses++;
        for (const r of rows) {
          await run(
            `INSERT INTO qhse_results (analysis_id, parameter_id, valeur_num, valeur_text, result_flag, conformite, spec_id)
             VALUES ($1,$2,$3,NULL,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [a.id, r.pid, r.valeur_num, r.result_flag, r.conf, r.spec_id]);
          counts.results++;
        }
        if (gConf === 'non_conforme') nonConformeLots.push({ product_id: prod.id, numero_lot: lot, bu: null, date: d });
      }
    }

    // 3) Contrôles de production (3/mois)
    for (let i = 0; i < 3; i++) {
      const d = dateInMonth(mAgo);
      const prod = pick(products);
      const c = await one(
        `INSERT INTO qhse_production_controls (date_controle, business_unit_id, product_id, format_id, conditioning_line_id, numero_lot, equipe, responsable, statut, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ymd(d), buId(), prod.id, formats.length ? pick(formats).id : null, lines.length ? pick(lines).id : null,
          `L${Math.floor(rnd(1000, 9999))}`, chance(0.5) ? 'matin' : 'soir', MARK_RESP, mAgo > 0 ? 'cloture' : 'brouillon', userId, iso(d)]);
      const confs = [];
      let ordre = 0;
      for (let h = 8; h <= 16; h += 4) {
        for (const crit of prodCrit) {
          let vbool = null, vnum = null;
          if (crit.type_critere === 'booleen') vbool = chance(0.85);
          else vnum = Number(rnd(120, 130).toFixed(1));
          const conf = criteriaConformite({ valeur_bool: vbool, valeur_num: vnum }, crit);
          confs.push(conf);
          await run(
            `INSERT INTO qhse_production_readings (control_id, heure, criteria_id, valeur_num, valeur_bool, conforme, ordre)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [c.id, `${String(h).padStart(2, '0')}:00`, crit.id, vnum, vbool, conf, ordre++]);
        }
      }
      await run('UPDATE qhse_production_controls SET numero = $1, conformite = $2 WHERE id = $3', ['CTRLP-' + pad(c.id), conformiteGlobale(confs), c.id]);
      counts.prod++;
    }

    // 4) Contrôles d'expédition (3/mois)
    for (let i = 0; i < 3; i++) {
      const d = dateInMonth(mAgo);
      const prod = pick(products);
      const c = await one(
        `INSERT INTO qhse_shipment_controls (date_controle, business_unit_id, destination, transporteur, vehicule, product_id, numero_lot, responsable, statut, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ymd(d), buId(), pick(['Conakry', 'Kindia', 'Kankan', 'Labé', 'N\'Zérékoré']), pick(['Transit SA', 'Fret Express', 'GN Logistics']),
          `RC-${Math.floor(rnd(1000, 9999))}`, prod.id, `L${Math.floor(rnd(1000, 9999))}`, MARK_RESP, mAgo > 0 ? 'cloture' : 'brouillon', userId, iso(d)]);
      const confs = [];
      let ordre = 0;
      for (const crit of shipCrit) {
        let vbool = null, vnum = null;
        if (crit.type_critere === 'booleen') vbool = chance(0.88);
        else vnum = Number(rnd(2, 8).toFixed(1));
        const conf = criteriaConformite({ valeur_bool: vbool, valeur_num: vnum }, crit);
        confs.push(conf);
        await run(
          `INSERT INTO qhse_shipment_checks (control_id, criteria_id, valeur_num, valeur_bool, conforme, ordre)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [c.id, crit.id, vnum, vbool, conf, ordre++]);
      }
      await run('UPDATE qhse_shipment_controls SET numero = $1, conformite = $2 WHERE id = $3', ['EXP-' + pad(c.id), conformiteGlobale(confs), c.id]);
      counts.ship++;
    }

    // 5) Non-conformités (2/mois) — récentes ouvertes avec CAPA en retard, anciennes clôturées.
    for (let i = 0; i < 2; i++) {
      const d = dateInMonth(mAgo);
      const src = nonConformeLots.length && chance(0.6) ? pick(nonConformeLots) : null;
      const prod = src ? src.product_id : pick(products).id;
      const closed = mAgo >= 3; // anciennes clôturées
      const statut = closed ? 'cloturee' : pick(['ouverte', 'analyse', 'action', 'verification']);
      const nc = await one(
        `INSERT INTO qhse_nonconformities (date_detection, detecteur, source, severity_id, business_unit_id, product_id, numero_lot, description, risque, action_immediate, statut, created_by, created_at, closed_by, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [ymd(d), MARK_DETECT, pick(['production', 'réception', 'laboratoire', 'réclamation client']),
          severities.length ? pick(severities).id : null, buId(), prod, src ? src.numero_lot : `L${Math.floor(rnd(1000, 9999))}`,
          pick(['Écart de poids détecté', 'Soudure défectueuse sur lot', 'Résultat microbiologique hors seuil', 'Étiquetage non conforme', 'Rupture de la chaîne du froid']),
          'Risque qualité à évaluer', 'Produit isolé / mis en quarantaine', statut, userId, iso(d),
          closed ? userId : null, closed ? iso(new Date(d.getTime() + 10 * 86400000)) : null]);
      await run('UPDATE qhse_nonconformities SET numero = $1 WHERE id = $2', ['NC-' + pad(nc.id), nc.id]);
      counts.nc++;
      // Causes 5M
      const cats = ['matiere', 'main_oeuvre', 'methode', 'milieu', 'materiel'];
      for (let k = 0; k < 3; k++) await run(
        `INSERT INTO qhse_nc_causes (nc_id, categorie, description, ordre) VALUES ($1,$2,$3,$4)`,
        [nc.id, pick(cats), 'Cause identifiée lors de l\'analyse', k]);
      // Actions CAPA (certaines en retard si NC ouverte)
      for (let k = 0; k < 2; k++) {
        const done = closed || chance(0.4);
        const echeance = new Date(d.getTime() + Math.floor(rnd(5, 30)) * 86400000);
        await run(
          `INSERT INTO qhse_nc_actions (nc_id, type_action, description, responsable, echeance, statut, date_realisation, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [nc.id, chance(0.6) ? 'corrective' : 'preventive', pick(['Reformer les opérateurs', 'Réviser le réglage machine', 'Renforcer le contrôle réception', 'Mettre à jour la procédure']),
            pick(['RQU', 'Chef de ligne', 'Resp. maintenance']), ymd(echeance),
            done ? 'faite' : pick(['a_faire', 'en_cours']), done ? ymd(echeance) : null, k]);
      }
    }
  }

  // 6) Libération des lots (si des lots stock existent)
  const stockLots = await all('SELECT id FROM stock_lots ORDER BY id DESC LIMIT 10');
  for (const l of stockLots) {
    const d = dateInMonth(Math.floor(rnd(0, 5)));
    const decision = pick(['libere', 'libere', 'libere', 'bloque', 'rebut', 'derogation']);
    const rel = await one(
      `INSERT INTO qhse_lot_releases (stock_lot_id, decision, statut_qualite_applique, motif, decideur, date_decision, created_by, created_at)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [l.id, decision, 'Décision qualité de démonstration', MARK_DECID, ymd(d), userId, iso(d)]);
    if (rel) { await run('UPDATE stock_lots SET statut_qualite = $1 WHERE id = $2', [decision, l.id]); counts.releases++; }
  }

  console.log('Seed de démo QHSE terminé :', JSON.stringify(counts));
}

(async () => {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--purge')) await purge();
    else if (args.includes('--confirm')) await seed();
    else {
      console.log('Rien fait. Options :');
      console.log('  node seed-qhse-demo.js --confirm   # insère les données de démo');
      console.log('  node seed-qhse-demo.js --purge     # supprime les données de démo');
    }
  } catch (e) {
    console.error('Erreur:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
