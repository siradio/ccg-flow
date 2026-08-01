// Peuple la base avec les données nécessaires au scénario de vérification (SPEC.md §7).
const bcrypt = require('bcryptjs');
const { pool, one, run, runMigrations } = require('./src/db');
const usersService = require('./src/modules/users/users.service');

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

  // Circuit à jour (huit étapes, expression de besoin en tête) — aligné sur bootstrap-prod.js.
  // La migration 014 qui a introduit "expression_besoin" et retiré le "dga" final ne fait rien
  // sur une base vide (elle ne fait que UPDATE/INSERT...SELECT des lignes déjà existantes), donc
  // une base neuve doit partir directement de la structure finale, pas de l'ancien seed pré-014.
  const steps = [
    [1, 'expression_besoin', "Validation de l'expression de besoin (DGA)", 'dga', true, null, null],
    [2, 'soumission', 'Soumission par le demandeur', 'demandeur', false, null, null],
    [3, 'analyse_achat', 'Analyse par le service achat', 'service_achat', false, null, null],
    [4, 'devis', 'Consultation fournisseurs', 'service_achat', false, null, null],
    [5, 'validation_achat', 'Validation du service achat', 'service_achat', false, null, null],
    [6, 'controle_gestion', 'Validation Contrôle de Gestion', 'controle_gestion', true, 'retour_etape_precedente', 'validation_achat'],
    [7, 'finances', 'Validation Finances', 'finances', true, 'retour_etape_precedente', 'validation_achat'],
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
    // L'accès au module "Demandes d'achat" est une couche indépendante du rôle métier
    // (voir SPEC.md §2.3) : sans elle, même un service_achat ne verrait pas le module.
    await usersService.setSubModuleAccess(user.id, 'achats', 'edition');
  }
  const admin = await one(
    "INSERT INTO users (nom, prenom, email, password_hash) VALUES ('Admin', 'Système', 'admin@test', $1) RETURNING id",
    [hash]
  );
  await run("INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1, NULL, 'super_admin')", [admin.id]);

  // Deux comptes illustrant l'accès par module (indépendant des rôles du workflow achat) :
  // un profil RH qui ne voit que le module RH, un profil Stock qui ne voit que Stock (réservé)
  // + le référentiel Produits — exactement les deux cas d'usage évoqués pour ce système d'accès.
  const rhUser = await one(
    "INSERT INTO users (nom, prenom, email, password_hash) VALUES ('Bah', 'Aissatou', 'rh.sog@test', $1) RETURNING id",
    [hash]
  );
  await usersService.setSubModuleAccess(rhUser.id, 'rh', 'edition');

  const stockUser = await one(
    "INSERT INTO users (nom, prenom, email, password_hash) VALUES ('Diallo', 'Ousmane', 'stock.sog@test', $1) RETURNING id",
    [hash]
  );
  // Fan-out sur les deux sous-modules Stock (§3.9 SPEC.md) : ce compte de démo doit garder une
  // couverture complète (Stock du Jour + Mouvement Stock) pour les e2e existants.
  await usersService.setSubModuleAccess(stockUser.id, 'stock.saisie_jour', 'edition');
  await usersService.setSubModuleAccess(stockUser.id, 'stock.mouvements', 'edition');
  await usersService.setSubModuleAccess(stockUser.id, 'referentiels.products', 'edition');

  const directionUser = await one(
    "INSERT INTO users (nom, prenom, email, password_hash) VALUES ('Camara', 'Fatoumata', 'direction@test', $1) RETURNING id",
    [hash]
  );
  await usersService.setSubModuleAccess(directionUser.id, 'kpi', 'edition');

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

  // Business Unit + produit rattaché — nécessaire pour tester Stock du Jour et Prix (ces deux
  // modules exigent un produit avec business_unit_id, voir §3.5/§3.8 SPEC.md), absent du reste
  // du seed ci-dessus qui ne couvre que le circuit Demande d'achat.
  const businessUnit = await one(
    "INSERT INTO business_units (code, nom) VALUES ('bu_test', 'BU Test') RETURNING id"
  );
  const stockProduct = await one(
    `INSERT INTO products (code, designation, category_id, unite, business_unit_id)
     VALUES ('STK-001', 'Produit Stock Test', (SELECT id FROM product_categories WHERE code = 'produit_fini'), 'unité', $1)
     RETURNING id`,
    [businessUnit.id]
  );
  await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2)', [stockProduct.id, soguipal.id]);

  console.log('✅ Base peuplée.');
  console.log(`Entités : CCG=${ccg.id}, Soguipal=${soguipal.id}, PBIC=${pbic.id}`);
  console.log(`Fournisseurs Soguipal : ${supplier1.id}, ${supplier2.id} — Produit : ${product.id}`);
  console.log('Comptes de démo (mot de passe pour tous : Test1234!) :');
  demoUsers.forEach(([nom, prenom, email, role]) => console.log(`  - ${email}  — rôle: ${role} (module achats)`));
  console.log('  - admin@test  — rôle: super_admin (tous modules)');
  console.log('  - rh.sog@test  — module: rh (aucun rôle workflow achat)');
  console.log('  - stock.sog@test  — sous-modules: stock.saisie_jour, stock.mouvements, referentiels.products (aucun rôle workflow achat)');
  console.log('  - direction@test  — module: kpi (aucun rôle workflow achat)');

  if (closePool) await pool.end();
  return {
    entities: { ccg, soguipal, pbic },
    supplierIds: [supplier1.id, supplier2.id],
    productId: product.id,
    businessUnitId: businessUnit.id,
    stockProductId: stockProduct.id,
    password,
  };
}

if (require.main === module) {
  seed().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
