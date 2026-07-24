// Peuple la base avec les données nécessaires au scénario de vérification (SPEC.md §7).
const bcrypt = require('bcryptjs');
const { pool, one, run, runMigrations } = require('./src/db');

async function alreadySeeded() {
  const row = await one('SELECT COUNT(*) AS n FROM entities');
  return Number(row.n) > 0;
}

async function seed({ closePool = true } = {}) {
  await runMigrations();

  if (await alreadySeeded()) {
    console.log('La base contient déjà des données — seed ignoré.');
    if (closePool) await pool.end();
    return;
  }

  const [ccg, soguipal, pbic] = await Promise.all([
    one("INSERT INTO entities (code, nom) VALUES ('CCG', 'Comptoir Commercial Général') RETURNING id"),
    one("INSERT INTO entities (code, nom) VALUES ('SOGUIPAL', 'Société Guinéenne de la Production Alimentaire') RETURNING id"),
    one("INSERT INTO entities (code, nom) VALUES ('PBIC', 'Prestige Business Center') RETURNING id"),
  ]);

  const template = await one(
    "INSERT INTO workflow_templates (module_code, nom) VALUES ('demande_achat', 'Demande d''achat') RETURNING id"
  );

  const steps = [
    [1, 'soumission', 'Soumission par le demandeur', 'demandeur', false, null, null],
    [2, 'analyse_achat', 'Analyse par le service achat', 'service_achat', false, null, null],
    [3, 'devis', 'Consultation fournisseurs', 'service_achat', false, null, null],
    [4, 'validation_achat', 'Validation du service achat', 'service_achat', false, null, null],
    [5, 'controle_gestion', 'Validation Contrôle de Gestion', 'controle_gestion', true, 'retour_etape_precedente', 'validation_achat'],
    [6, 'finances', 'Validation Finances', 'finances', true, 'retour_etape_precedente', 'validation_achat'],
    [7, 'dga', 'Validation DGA', 'dga', true, 'retour_etape_precedente', 'validation_achat'],
    [8, 'generation_bc', 'Génération automatique du bon de commande', null, false, null, null],
  ];
  for (const s of steps) {
    await run(
      `INSERT INTO workflow_steps
         (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [template.id, ...s]
    );
  }

  const demoUsers = [
    ['Diallo', 'Amadou', 'demandeur.sog@test', 'demandeur'],
    ['Bah', 'Fatoumata', 'achat.sog@test', 'service_achat'],
    ['Camara', 'Sekou', 'cg.sog@test', 'controle_gestion'],
    ['Barry', 'Mariam', 'finances.sog@test', 'finances'],
    ['Sylla', 'Ibrahima', 'dga.sog@test', 'dga'],
  ];
  const password = 'Test1234!';
  const hash = bcrypt.hashSync(password, 10);
  for (const [nom, prenom, email, roleCode] of demoUsers) {
    const user = await one(
      'INSERT INTO users (nom, prenom, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
      [nom, prenom, email, hash]
    );
    await run(
      'INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1,$2,$3)',
      [user.id, soguipal.id, roleCode]
    );
  }
  const admin = await one(
    "INSERT INTO users (nom, prenom, email, password_hash) VALUES ('Admin', 'Système', 'admin@test', $1) RETURNING id",
    [hash]
  );
  await run("INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1, NULL, 'super_admin')", [admin.id]);

  const supplier1 = await one(
    "INSERT INTO suppliers (nom, contact_nom, contact_email, contact_tel) VALUES ('Fournisseur Atlantique', 'M. Keita', 'contact@atlantique-gn.test', '+224 620 000 001') RETURNING id"
  );
  const supplier2 = await one(
    "INSERT INTO suppliers (nom, contact_nom, contact_email, contact_tel) VALUES ('Guinée Emballages SARL', 'Mme Touré', 'contact@guinee-emballages.test', '+224 620 000 002') RETURNING id"
  );
  await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2), ($3,$2)', [supplier1.id, soguipal.id, supplier2.id]);

  const product = await one(
    `INSERT INTO products (code, designation, category_id, unite)
     VALUES ('EMB-001', 'Sac d''emballage 25kg', (SELECT id FROM product_categories WHERE code = 'consommable'), 'unité')
     RETURNING id`
  );
  await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2)', [product.id, soguipal.id]);

  console.log('✅ Base peuplée.');
  console.log(`Entités : CCG=${ccg.id}, Soguipal=${soguipal.id}, PBIC=${pbic.id}`);
  console.log(`Fournisseurs Soguipal : ${supplier1.id}, ${supplier2.id} — Produit : ${product.id}`);
  console.log('Comptes de démo (mot de passe pour tous : Test1234!) :');
  demoUsers.forEach(([nom, prenom, email, role]) => console.log(`  - ${email}  — rôle: ${role}`));
  console.log('  - admin@test  — rôle: super_admin');

  if (closePool) await pool.end();
  return { entities: { ccg, soguipal, pbic }, supplierIds: [supplier1.id, supplier2.id], productId: product.id, password };
}

if (require.main === module) {
  seed().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
