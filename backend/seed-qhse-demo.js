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
const MARK_RESP = 'Démo QHSE';        // production/shipment.responsable, audits.auditeur, sst_risks/inspections.responsable
const MARK_DETECT = 'Démo QHSE';      // nonconformities.detecteur
const MARK_DECID = 'Démo QHSE';       // lot_releases.decideur
const MARK_COMMENT = 'SEED_DEMO';     // equipment/supplier/inspection/document/action (champ commentaire/observations)
const MARK_DESC = '[SEED_DEMO]';      // complaints/accidents : suffixe de description (pas de champ commentaire)

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
  // Extension (nouveaux modules)
  await run(`DELETE FROM qhse_complaints WHERE description LIKE '%' || $1 || '%'`, [MARK_DESC]);      // cascade actions
  await run(`DELETE FROM qhse_supplier_evaluations WHERE commentaire = $1`, [MARK_COMMENT]);
  await run(`DELETE FROM qhse_equipment WHERE commentaire = $1`, [MARK_COMMENT]);                     // cascade verifications
  await run(`DELETE FROM qhse_audits WHERE auditeur = $1`, [MARK_RESP]);                              // cascade findings
  await run(`DELETE FROM qhse_inspections WHERE commentaire = $1`, [MARK_COMMENT]);                   // cascade results
  await run(`DELETE FROM qhse_sst_risks WHERE responsable = $1`, [MARK_RESP]);
  await run(`DELETE FROM qhse_sst_accidents WHERE description LIKE '%' || $1 || '%'`, [MARK_DESC]);    // cascade actions
  await run(`DELETE FROM qhse_documents WHERE observations = $1`, [MARK_COMMENT]);                    // cascade revisions
  await run(`DELETE FROM qhse_actions WHERE observations = $1`, [MARK_COMMENT]);
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

  // 7) EXTENSION — nouveaux modules QHSE (réclamations, fournisseurs, métrologie, audits, hygiène,
  //    SST risques/accidents, GED, plan d'actions). Données réparties sur ~6 mois, avec des cas « à
  //    traiter » (en retard, à réviser) pour animer le tableau de bord.
  const ext = await seedExtension({ userId, products, bus, formats, severities, buId });
  Object.assign(counts, ext);

  console.log('Seed de démo QHSE terminé :', JSON.stringify(counts));
}

async function seedExtension({ userId, products, bus, formats, severities, buId }) {
  const c = { complaints: 0, supplierEval: 0, equipment: 0, audits: 0, inspections: 0, sstRisks: 0, sstAccidents: 0, documents: 0, actions: 0 };
  const sevId = () => (severities.length ? pick(severities).id : null);
  const prodId = () => pick(products).id;
  const fmtId = () => (formats.length ? pick(formats).id : null);

  // 7a) Réclamations clients
  const clients = ['Supermarché Belle Vie', 'Épicerie Kaloum', 'Distribution Madina', 'Boutique Ratoma', 'Grossiste Matoto', 'Commerce Dixinn'];
  const canaux = ['e-mail', 'téléphone', 'courrier', 'visite'];
  const typesRec = ['Qualité produit', 'Emballage', 'Livraison', 'Étiquetage'];
  for (let mAgo = 5; mAgo >= 0; mAgo--) {
    for (let i = 0; i < (mAgo >= 3 ? 1 : 2); i++) {
      const d = dateInMonth(mAgo);
      const closed = mAgo >= 2;
      const statut = closed ? 'cloturee' : pick(['ouverte', 'investigation', 'reponse']);
      const r = await one(
        `INSERT INTO qhse_complaints (date_reclamation, client, canal, type_reclamation, severity_id, business_unit_id, product_id, format_id, numero_lot, quantite_concernee, description, investigation, reponse_client, statut, created_by, created_at, closed_by, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [ymd(d), pick(clients), pick(canaux), pick(typesRec), sevId(), buId(), prodId(), fmtId(),
          `L${Math.floor(rnd(1000, 9999))}`, `${Math.floor(rnd(1, 50))} cartons`,
          `${pick(['Goût anormal signalé', 'Opercule non étanche', 'Retard de livraison', 'Date illisible', 'Produit gonflé'])} ${MARK_DESC}`,
          closed ? 'Analyse menée, cause identifiée.' : null, closed ? 'Réponse transmise au client, geste commercial.' : null,
          statut, userId, iso(d), closed ? userId : null, closed ? iso(new Date(d.getTime() + 8 * 86400000)) : null]);
      await run('UPDATE qhse_complaints SET numero = $1 WHERE id = $2', ['REC-' + pad(r.id), r.id]);
      c.complaints++;
      for (let k = 0; k < (closed ? 2 : 1); k++) {
        const done = closed || chance(0.3);
        const ech = new Date(d.getTime() + Math.floor(rnd(5, 25)) * 86400000);
        await run(
          `INSERT INTO qhse_complaint_actions (complaint_id, type_action, description, responsable, echeance, statut, date_realisation, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [r.id, chance(0.6) ? 'corrective' : 'preventive', pick(['Renforcer le contrôle final', 'Former le personnel', 'Revoir le fournisseur d\'emballage']),
            pick(['RQU', 'Resp. production', 'Resp. logistique']), ymd(ech), done ? 'faite' : pick(['a_faire', 'en_cours']), done ? ymd(ech) : null, k]);
      }
    }
  }

  // 7b) Évaluation des fournisseurs
  const suppliers = await all('SELECT id FROM suppliers ORDER BY id');
  for (const s of suppliers) {
    for (let j = 0; j < 3; j++) {
      const d = dateInMonth(5 - j * 2);
      const note = Number(rnd(55, 95).toFixed(1));
      const statut = note >= 80 ? 'qualifie' : note >= 65 ? 'sous_reserve' : 'rejete';
      const criteria = [
        { label: 'Qualité produit', note: Number(rnd(12, 25).toFixed(1)), note_max: 25 },
        { label: 'Respect des délais', note: Number(rnd(12, 25).toFixed(1)), note_max: 25 },
        { label: 'Conformité documentaire', note: Number(rnd(10, 25).toFixed(1)), note_max: 25 },
        { label: 'Réactivité / SAV', note: Number(rnd(10, 25).toFixed(1)), note_max: 25 },
      ];
      await run(
        `INSERT INTO qhse_supplier_evaluations (supplier_id, date_evaluation, type, note, note_max, statut, criteria, commentaire, evaluated_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id, ymd(d), j === 0 ? 'qualification' : 'periodique', note, 100, statut, JSON.stringify(criteria), MARK_COMMENT, userId, iso(d)]);
      c.supplierEval++;
    }
  }

  // 7c) Équipements de mesure (métrologie) — quelques-uns en retard de vérification
  const equip = [
    ['BAL-01', 'Balance de précision', 'Balance', 'critique', 6],
    ['PH-01', 'pH-mètre labo', 'pH-mètre', 'critique', 6],
    ['ETU-01', 'Étuve microbiologie', 'Étuve', 'critique', 12],
    ['THE-01', 'Thermomètre chambre froide', 'Thermomètre', 'normale', 12],
    ['REF-01', 'Réfractomètre (Brix)', 'Réfractomètre', 'normale', 12],
    ['VIS-01', 'Viscosimètre', 'Viscosimètre', 'normale', 12],
    ['BAL-02', 'Balance de réception', 'Balance', 'normale', 12],
    ['AUT-01', 'Autoclave labo', 'Autoclave', 'critique', 6],
  ];
  for (let i = 0; i < equip.length; i++) {
    const [code, libelle, type, criticite, freq] = equip[i];
    const overdue = i < 3; // 3 en retard
    const derniere = new Date();
    derniere.setMonth(derniere.getMonth() - (overdue ? freq + 2 : Math.floor(freq / 2)));
    const prochaine = new Date(derniere); prochaine.setMonth(prochaine.getMonth() + freq);
    const eq = await one(
      `INSERT INTO qhse_equipment (code, libelle, type, localisation, business_unit_id, criticite, frequence_mois, derniere_verif, prochaine_verif, statut, commentaire, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [code, libelle, type, pick(['Laboratoire', 'Réception', 'Production']), buId(), criticite, freq, ymd(derniere), ymd(prochaine),
        i === equip.length - 1 ? 'hors_service' : 'en_service', MARK_COMMENT, iso(derniere)]);
    c.equipment++;
    await run(
      `INSERT INTO qhse_equipment_verifications (equipment_id, date_verif, type_verif, resultat, prochaine_echeance, operateur, organisme, commentaire, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [eq.id, ymd(derniere), pick(['etalonnage', 'verification']), 'conforme', ymd(prochaine), 'Démo QHSE', pick(['Bureau Veritas', 'Interne', 'SGS']), MARK_COMMENT, userId, iso(derniere)]);
  }

  // 7d) Audits
  const auditTypes = ['interne', 'externe', 'fournisseur'];
  const perimetres = ['Ligne yaourt', 'Réception matières', 'Chaîne du froid', 'Hygiène ateliers', 'Fournisseur emballage', 'Système HACCP'];
  for (let mAgo = 5; mAgo >= 0; mAgo--) {
    const d = dateInMonth(mAgo);
    const statut = mAgo >= 2 ? 'cloture' : mAgo === 1 ? 'realise' : 'planifie';
    const a = await one(
      `INSERT INTO qhse_audits (date_audit, type_audit, perimetre, auditeur, referentiel, business_unit_id, statut, synthese, created_by, created_at, closed_by, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [ymd(d), pick(auditTypes), pick(perimetres), MARK_RESP, pick(['ISO 9001', 'ISO 22000', 'Référentiel interne']), buId(), statut,
        statut === 'planifie' ? null : 'Audit réalisé, constats enregistrés.', userId, iso(d),
        statut === 'cloture' ? userId : null, statut === 'cloture' ? iso(new Date(d.getTime() + 5 * 86400000)) : null]);
    await run('UPDATE qhse_audits SET numero = $1 WHERE id = $2', ['AUD-' + pad(a.id), a.id]);
    c.audits++;
    if (statut !== 'planifie') {
      const nbf = 2 + Math.floor(rnd(0, 3));
      for (let k = 0; k < nbf; k++) {
        const done = statut === 'cloture' && chance(0.5);
        const ech = new Date(d.getTime() + Math.floor(rnd(10, 40)) * 86400000);
        const tc = pick(['non_conformite', 'observation', 'point_fort', 'observation']);
        await run(
          `INSERT INTO qhse_audit_findings (audit_id, type_constat, description, reference, action, responsable, echeance, statut, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [a.id, tc, pick(['Enregistrement manquant', 'Procédure non suivie', 'Bonne maîtrise du process', 'Traçabilité incomplète']),
            pick(['§7.5', '§8.2', '§6.1', '']), tc === 'point_fort' ? null : 'Mettre en place une action corrective',
            tc === 'point_fort' ? null : pick(['RQU', 'Chef d\'atelier']), tc === 'point_fort' ? null : ymd(ech),
            done ? 'faite' : pick(['a_faire', 'en_cours']), k]);
      }
    }
  }

  // 7e) Hygiène — critères (si absents) puis inspections
  const inspTypes = await all('SELECT id, code FROM qhse_inspection_types ORDER BY ordre, id');
  const critDefs = {
    PND: [['Surfaces nettoyées', 'booleen'], ['Produits de nettoyage conformes', 'booleen'], ['Fiche de nettoyage remplie', 'booleen']],
    PERSONNEL: [['Tenue propre & complète', 'booleen'], ['Lavage des mains respecté', 'booleen'], ['Absence de bijoux', 'booleen']],
    LOCAUX: [['Sols & murs propres', 'booleen'], ['Éclairage fonctionnel', 'booleen'], ['Température ambiante (°C)', 'numerique', 10, 25]],
    NUISIBLES: [['Appâts en place', 'booleen'], ['Absence de traces', 'booleen']],
    DECHETS: [['Bacs fermés', 'booleen'], ['Évacuation régulière', 'booleen']],
    STOCKAGE: [['Stockage surélevé', 'booleen'], ['FIFO respecté', 'booleen']],
  };
  for (const it of inspTypes) {
    const has = await one('SELECT COUNT(*)::int n FROM qhse_inspection_criteria WHERE inspection_type_id = $1', [it.id]);
    if (has.n > 0) continue;
    const defs = critDefs[it.code] || [['Critère conforme', 'booleen']];
    let ordre = 0;
    for (const def of defs) {
      await run(
        `INSERT INTO qhse_inspection_criteria (inspection_type_id, libelle, type_critere, unite, seuil_min, seuil_max, ordre, actif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [it.id, def[0], def[1], def[1] === 'numerique' ? '°C' : null, def[2] ?? null, def[3] ?? null, ordre++]);
    }
  }
  const inspZones = ['Atelier yaourt', 'Chambre froide', 'Zone réception', 'Vestiaires', 'Stockage emballages', 'Quai d\'expédition'];
  for (let mAgo = 5; mAgo >= 0; mAgo--) {
    for (let i = 0; i < 2; i++) {
      const d = dateInMonth(mAgo);
      const it = pick(inspTypes);
      const crits = await all('SELECT * FROM qhse_inspection_criteria WHERE inspection_type_id = $1 AND actif = true ORDER BY ordre, id', [it.id]);
      const statut = mAgo > 0 ? 'cloture' : 'brouillon';
      const insp = await one(
        `INSERT INTO qhse_inspections (date_inspection, inspection_type_id, zone, business_unit_id, responsable, statut, commentaire, created_by, created_at, closed_by, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ymd(d), it.id, pick(inspZones), buId(), MARK_RESP, statut, MARK_COMMENT, userId, iso(d),
          statut === 'cloture' ? userId : null, statut === 'cloture' ? iso(d) : null]);
      const confs = [];
      for (const crit of crits) {
        let vbool = null, vnum = null;
        if (crit.type_critere === 'booleen') vbool = chance(0.85);
        else vnum = Number(rnd(8, 27).toFixed(1));
        const conf = criteriaConformite({ valeur_bool: vbool, valeur_num: vnum }, crit);
        confs.push(conf);
        await run(
          `INSERT INTO qhse_inspection_results (inspection_id, criteria_id, valeur_bool, valeur_num, conformite) VALUES ($1,$2,$3,$4,$5)`,
          [insp.id, crit.id, vbool, vnum, conf]);
      }
      await run('UPDATE qhse_inspections SET conformite = $1 WHERE id = $2', [conformiteGlobale(confs), insp.id]);
      c.inspections++;
    }
  }

  // 7f) SST — risques professionnels
  const unites = ['Ligne de production', 'Maintenance', 'Magasin', 'Chaufferie', 'Quai de chargement', 'Laboratoire'];
  const dangers = [['Bruit machine', 'Surdité professionnelle'], ['Charge lourde', 'TMS / lombalgie'], ['Produit chimique', 'Brûlure / inhalation'],
    ['Sol glissant', 'Chute de plain-pied'], ['Pièce mobile', 'Happement / coupure'], ['Travail au froid', 'Hypothermie'], ['Électricité', 'Électrisation']];
  for (let i = 0; i < 10; i++) {
    const dg = pick(dangers);
    const g = Math.ceil(rnd(1, 4)), p = Math.ceil(rnd(1, 4)), e = Math.ceil(rnd(1, 4));
    const score = g * p * e;
    const niveau = score <= 8 ? 'faible' : score <= 16 ? 'modere' : score <= 32 ? 'eleve' : 'critique';
    const ech = new Date(); ech.setMonth(ech.getMonth() + Math.floor(rnd(1, 6)));
    await run(
      `INSERT INTO qhse_sst_risks (unite_travail, business_unit_id, danger, risque, personnes_exposees, gravite, probabilite, exposition, score, niveau, mesures_existantes, mesures_prevues, responsable, echeance, statut, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [pick(unites), buId(), dg[0], dg[1], Math.floor(rnd(1, 20)), g, p, e, score, niveau,
        'EPI fournis, consignes affichées', score > 16 ? 'Renforcer la protection / formation' : null,
        MARK_RESP, ymd(ech), chance(0.35) ? 'maitrise' : 'ouvert', userId]);
    c.sstRisks++;
  }

  // 7g) SST — accidents / incidents
  const accTypes = ['presque_accident', 'presque_accident', 'situation_dangereuse', 'accident_sans_arret', 'accident_arret'];
  const accLieux = ['Atelier', 'Quai', 'Magasin', 'Escalier', 'Parking'];
  for (let mAgo = 5; mAgo >= 0; mAgo--) {
    for (let i = 0; i < (mAgo % 2 === 0 ? 2 : 1); i++) {
      const d = dateInMonth(mAgo);
      const type = pick(accTypes);
      const arret = type === 'accident_arret';
      const statut = mAgo >= 2 ? 'cloture' : pick(['declare', 'enquete']);
      const acc = await one(
        `INSERT INTO qhse_sst_accidents (date_evenement, type_evenement, business_unit_id, unite_travail, lieu, description, jours_perdus, enquete, causes, statut, created_by, created_at, closed_by, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [ymd(d), type, buId(), pick(unites), pick(accLieux),
          `${pick(['Glissade sans gravité', 'Doigt coincé', 'Chute d\'un carton', 'Contact produit chaud', 'Quasi-collision chariot'])} ${MARK_DESC}`,
          arret ? Math.floor(rnd(1, 15)) : null, statut !== 'declare' ? 'Enquête menée sur site.' : null,
          statut === 'cloture' ? 'Cause: EPI non porté / signalisation insuffisante.' : null, statut, userId, iso(d),
          statut === 'cloture' ? userId : null, statut === 'cloture' ? iso(new Date(d.getTime() + 7 * 86400000)) : null]);
      await run('UPDATE qhse_sst_accidents SET numero = $1 WHERE id = $2', ['SST-' + pad(acc.id), acc.id]);
      c.sstAccidents++;
      for (let k = 0; k < (statut === 'declare' ? 1 : 2); k++) {
        const done = statut === 'cloture';
        const ech = new Date(d.getTime() + Math.floor(rnd(5, 30)) * 86400000);
        await run(
          `INSERT INTO qhse_sst_accident_actions (accident_id, type_action, description, responsable, echeance, statut, date_realisation, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [acc.id, pick(['corrective', 'preventive']), pick(['Rappel des consignes', 'Ajouter une signalisation', 'Réparer le sol', 'Fournir les EPI']),
            pick(['Resp. HSE', 'Chef d\'équipe']), ymd(ech), done ? 'faite' : pick(['a_faire', 'en_cours']), done ? ymd(ech) : null, k]);
      }
    }
  }

  // 7h) GED — documents (dont quelques-uns à réviser)
  const docs = [
    ['MQ-01', 'Manuel Qualité', 'manuel', 'qualite'],
    ['PR-QUA-01', 'Procédure de maîtrise documentaire', 'procedure', 'qualite'],
    ['PR-HYG-01', 'Procédure de nettoyage & désinfection', 'procedure', 'hygiene'],
    ['IN-LAB-01', 'Instruction analyse physico-chimique', 'instruction', 'qualite'],
    ['PR-SEC-01', 'Plan de prévention des risques', 'plan', 'securite'],
    ['FO-REC-01', 'Formulaire réception matières', 'formulaire', 'qualite'],
    ['PR-ENV-01', 'Procédure gestion des déchets', 'procedure', 'environnement'],
    ['PO-QHSE-01', 'Politique QHSE', 'politique', 'transverse'],
    ['IN-HYG-02', 'Instruction lavage des mains', 'instruction', 'hygiene'],
    ['PR-SEC-02', 'Procédure enquête accident', 'procedure', 'securite'],
  ];
  for (let i = 0; i < docs.length; i++) {
    const [ref, titre, type, domaine] = docs[i];
    const overdue = i < 3;
    const app = new Date(); app.setMonth(app.getMonth() - Math.floor(rnd(8, 24)));
    const rev = new Date(); rev.setMonth(rev.getMonth() + (overdue ? -Math.floor(rnd(1, 4)) : Math.floor(rnd(2, 10))));
    const statut = i >= docs.length - 2 ? pick(['brouillon', 'obsolete']) : 'en_vigueur';
    const version = String(1 + Math.floor(rnd(0, 3)));
    const doc = await one(
      `INSERT INTO qhse_documents (reference, titre, type_document, domaine, business_unit_id, version, statut, date_application, date_revision, redacteur, verificateur, approbateur, emplacement, diffusion, observations, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [ref, titre, type, domaine, chance(0.3) ? buId() : null, version, statut, ymd(app), statut === 'en_vigueur' ? ymd(rev) : null,
        'RQU', 'Resp. Qualité', 'Direction', pick(['Serveur Qualité/Documents', 'Classeur Labo', 'SharePoint QHSE']),
        pick(['Tous services', 'Production + Labo', 'Direction + RQU']), MARK_COMMENT, userId, iso(app)]);
    c.documents++;
    if (Number(version) > 1) {
      await run(
        `INSERT INTO qhse_document_revisions (document_id, version, date_revision, motif, par, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [doc.id, String(Number(version) - 1), ymd(app), 'Mise à jour suite à audit', 'RQU', iso(app)]);
    }
  }

  // 7i) Plan d'actions QHSE (registre transverse) — dont plusieurs en retard
  const origines = ['audit', 'reclamation', 'accident', 'inspection', 'non_conformite', 'revue_direction', 'reglementaire'];
  const domaines = ['qualite', 'hygiene', 'securite', 'environnement', 'transverse'];
  const descA = ['Former le personnel', 'Réviser la procédure', 'Mettre en place un contrôle', 'Réparer l\'équipement',
    'Renforcer la signalisation', 'Auditer le fournisseur', 'Mettre à jour l\'affichage réglementaire'];
  for (let i = 0; i < 15; i++) {
    const origine = pick(origines);
    const overdue = i < 5;
    const dCreate = dateInMonth(Math.floor(rnd(0, 5)));
    const ech = new Date();
    ech.setDate(ech.getDate() + (overdue ? -Math.floor(rnd(2, 40)) : Math.floor(rnd(5, 45))));
    const faite = !overdue && chance(0.35);
    const statut = faite ? 'faite' : overdue ? pick(['a_faire', 'en_cours']) : pick(['a_faire', 'en_cours']);
    const a = await one(
      `INSERT INTO qhse_actions (origine, reference_origine, domaine, business_unit_id, type_action, description, responsable, echeance, statut, date_realisation, efficacite, observations, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [origine, pick(['AUD-00001', 'REC-00002', 'SST-00003', 'NC-00004', '']), pick(domaines), chance(0.4) ? buId() : null,
        pick(['corrective', 'preventive', 'amelioration']), pick(descA), pick(['RQU', 'Resp. HSE', 'Chef de ligne', 'DAF']),
        ymd(ech), statut, faite ? ymd(ech) : null, faite ? pick(['non_evaluee', 'efficace', 'efficace']) : 'non_evaluee', MARK_COMMENT, userId, iso(dCreate)]);
    await run('UPDATE qhse_actions SET numero = $1 WHERE id = $2', ['ACT-' + pad(a.id), a.id]);
    c.actions++;
  }

  return c;
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
