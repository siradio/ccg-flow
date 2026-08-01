#!/usr/bin/env node
// Amorce une base neuve (entités + circuit de workflow "demande_achat") — le strict nécessaire
// pour que l'appli soit utilisable, SANS comptes de démo ni faux fournisseurs (voir seed.js pour
// ceux-ci, réservés au développement local). Lancer create-admin.js juste après pour le premier
// vrai compte super_admin.
//
// Usage : node scripts/bootstrap-prod.js  (depuis backend/, avec DATABASE_URL déjà positionné sur
// la base cible dans l'environnement du terminal).
//
// Étapes du circuit reprises telles qu'elles existent réellement en base de dev aujourd'hui (huit
// étapes : la validation d'expression de besoin ajoutée par la migration 014, sans l'étape finale
// "dga" redondante retirée depuis) — pas recopiées depuis la version d'origine de seed.js, qui ne
// reflète plus plus l'état réel du circuit après les migrations ultérieures.
const readline = require('readline');
const { one, run, runMigrations, pool } = require('../src/db');

const ENTITIES = [
  ['CCG', 'Comptoir Commercial Général'],
  ['SOGUIPAL', 'Société Guinéenne de la Production Alimentaire'],
  ['PBIC', 'Prestige Business Center'],
];

const STEPS = [
  [1, 'expression_besoin', "Validation de l'expression de besoin (DGA)", 'dga', true, null, null],
  [2, 'soumission', 'Soumission par le demandeur', 'demandeur', false, null, null],
  [3, 'analyse_achat', 'Analyse par le service achat', 'service_achat', false, null, null],
  [4, 'devis', 'Consultation fournisseurs', 'service_achat', false, null, null],
  [5, 'validation_achat', 'Validation du service achat', 'service_achat', false, null, null],
  [6, 'controle_gestion', 'Validation Contrôle de Gestion', 'controle_gestion', true, 'retour_etape_precedente', 'validation_achat'],
  [7, 'finances', 'Validation Finances', 'finances', true, 'retour_etape_precedente', 'validation_achat'],
  [8, 'generation_bc', 'Génération automatique du bon de commande', null, false, null, null],
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

function targetHost() {
  try { return new URL(process.env.DATABASE_URL).host; }
  catch { return '(DATABASE_URL introuvable/invalide)'; }
}

async function main() {
  console.log(`Base ciblée : ${targetHost()}`);
  const confirm = await ask('Amorcer cette base (entités + circuit de workflow) ? [y/N] ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Annulé.');
    return pool.end();
  }

  await runMigrations();

  const existingEntities = await one('SELECT COUNT(*)::int AS n FROM entities');
  const existingTemplate = await one("SELECT id FROM workflow_templates WHERE module_code = 'demande_achat'");
  if (Number(existingEntities.n) > 0 || existingTemplate) {
    console.error('❌ Cette base a déjà des entités et/ou un workflow "demande_achat" — abandon pour ne rien dupliquer.');
    process.exitCode = 1;
    return pool.end();
  }

  const createdEntities = [];
  for (const [code, nom] of ENTITIES) {
    const e = await one('INSERT INTO entities (code, nom) VALUES ($1,$2) RETURNING id, code', [code, nom]);
    createdEntities.push(e);
  }

  const template = await one(
    "INSERT INTO workflow_templates (module_code, nom, actif) VALUES ('demande_achat', 'Demande d''achat', true) RETURNING id"
  );
  for (const s of STEPS) {
    await run(
      `INSERT INTO workflow_steps
         (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [template.id, ...s]
    );
  }

  console.log('\n✅ Base amorcée.');
  console.log(`Entités : ${createdEntities.map(e => `${e.code}=${e.id}`).join(', ')}`);
  console.log(`Circuit "demande_achat" créé (id ${template.id}, ${STEPS.length} étapes).`);
  console.log('\nProchaine étape : node scripts/create-admin.js pour créer ton compte super_admin.');
  await pool.end();
}

main().catch(err => {
  console.error('❌ Erreur :', err.message);
  process.exitCode = 1;
  return pool.end();
});
