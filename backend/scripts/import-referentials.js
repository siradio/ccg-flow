#!/usr/bin/env node
// Copie les référentiels (Business Units, Sites, Entrepôts, Machines, Produits, Fournisseurs) d'une
// base SOURCE vers une base CIBLE — pensé pour porter les vraies données déjà saisies en local vers
// un environnement neuf (prod/dev Azure) sans tout ressaisir à la main.
//
// NE touche PAS aux entités (entities) ni aux catégories de produits (product_categories) : ces
// deux tables doivent déjà exister côté cible (entities via bootstrap-prod.js, product_categories
// via les migrations) — on s'y raccroche par leur `code`, jamais par id brut (les id peuvent
// diverger entre les deux bases).
//
// Idempotent : peut être relancé sans risque, chaque table est vérifiée par sa clé naturelle
// (code, ou nom+parent à défaut de code) avant insertion — une ligne déjà présente côté cible est
// simplement resautée, jamais dupliquée ni écrasée.
//
// Usage (depuis backend/, sans jamais partager les chaînes de connexion) :
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/import-referentials.js
const readline = require('readline');
const { Pool } = require('pg');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

function host(url) {
  try { return new URL(url).host + new URL(url).pathname; }
  catch { return '(URL introuvable/invalide)'; }
}

function pool(url) {
  return new Pool({
    connectionString: url,
    ssl: /\bsslmode=require\b/.test(url || '') ? { rejectUnauthorized: false } : false,
  });
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    console.error('❌ SOURCE_DATABASE_URL et TARGET_DATABASE_URL doivent être positionnés.');
    process.exitCode = 1;
    return;
  }

  console.log(`Source : ${host(sourceUrl)}`);
  console.log(`Cible  : ${host(targetUrl)}`);
  const confirm = await ask('Copier les référentiels (BU, sites, entrepôts, machines, produits, fournisseurs) de la source vers la cible ? [y/N] ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Annulé.');
    return;
  }

  const src = pool(sourceUrl);
  const tgt = pool(targetUrl);
  const stats = {};
  function record(table, created, skipped) {
    stats[table] = { created, skipped };
  }

  try {
    // --- Entités et catégories de produits : déjà présentes côté cible, on s'y raccroche par code ---
    const entityRows = (await tgt.query('SELECT id, code FROM entities')).rows;
    const entityMap = new Map(entityRows.map(e => [e.code, e.id]));
    if (entityMap.size === 0) {
      throw new Error("La base cible n'a aucune entité — lance bootstrap-prod.js d'abord.");
    }

    const categoryRows = (await tgt.query('SELECT id, code FROM product_categories')).rows;
    const categoryMap = new Map(categoryRows.map(c => [c.code, c.id]));
    if (categoryMap.size === 0) {
      throw new Error("La base cible n'a aucune catégorie de produit — les migrations n'ont pas dû tourner.");
    }

    function mapEntity(code) {
      const id = entityMap.get(code);
      if (!id) throw new Error(`Entité "${code}" introuvable côté cible (source/cible désynchronisées ?).`);
      return id;
    }
    function mapCategory(code) {
      const id = categoryMap.get(code);
      if (!id) throw new Error(`Catégorie de produit "${code}" introuvable côté cible.`);
      return id;
    }

    // --- Business Units (clé naturelle : code) ---
    const srcEntityById = new Map((await src.query('SELECT id, code FROM entities')).rows.map(e => [e.id, e.code]));
    const srcCategoryById = new Map((await src.query('SELECT id, code FROM product_categories')).rows.map(c => [c.id, c.code]));

    const buMap = new Map(); // source id -> target id
    {
      let created = 0, skipped = 0;
      const rows = (await src.query('SELECT id, code, nom FROM business_units ORDER BY id')).rows;
      for (const r of rows) {
        const existing = await tgt.query('SELECT id FROM business_units WHERE code = $1', [r.code]);
        if (existing.rows[0]) { buMap.set(r.id, existing.rows[0].id); skipped++; continue; }
        const inserted = await tgt.query('INSERT INTO business_units (code, nom) VALUES ($1,$2) RETURNING id', [r.code, r.nom]);
        buMap.set(r.id, inserted.rows[0].id);
        created++;
      }
      record('business_units', created, skipped);
    }

    // --- Sites (clé naturelle : entité cible + nom) ---
    const siteMap = new Map();
    {
      let created = 0, skipped = 0;
      const rows = (await src.query('SELECT id, entity_id, nom, adresse, ville FROM sites ORDER BY id')).rows;
      for (const r of rows) {
        const entityId = mapEntity(srcEntityById.get(r.entity_id));
        const existing = await tgt.query('SELECT id FROM sites WHERE entity_id = $1 AND nom = $2', [entityId, r.nom]);
        if (existing.rows[0]) { siteMap.set(r.id, existing.rows[0].id); skipped++; continue; }
        const inserted = await tgt.query(
          'INSERT INTO sites (entity_id, nom, adresse, ville) VALUES ($1,$2,$3,$4) RETURNING id',
          [entityId, r.nom, r.adresse, r.ville]
        );
        siteMap.set(r.id, inserted.rows[0].id);
        created++;
      }
      record('sites', created, skipped);
    }

    // --- Entrepôts (clé naturelle : site cible + nom) ---
    {
      let created = 0, skipped = 0;
      const rows = (await src.query('SELECT site_id, nom, code FROM warehouses ORDER BY id')).rows;
      for (const r of rows) {
        const siteId = siteMap.get(r.site_id);
        const existing = await tgt.query('SELECT id FROM warehouses WHERE site_id = $1 AND nom = $2', [siteId, r.nom]);
        if (existing.rows[0]) { skipped++; continue; }
        await tgt.query('INSERT INTO warehouses (site_id, nom, code) VALUES ($1,$2,$3)', [siteId, r.nom, r.code]);
        created++;
      }
      record('warehouses', created, skipped);
    }

    // --- Machines (clé naturelle : site cible + nom) ---
    {
      let created = 0, skipped = 0;
      const rows = (await src.query(`
        SELECT site_id, nom, code, categorie, actif, calendrier_travail, capacite, efficacite_pct,
               temps_preparation_min, temps_nettoyage_min, cout_horaire, oee_cible_pct, description
        FROM machines ORDER BY id
      `)).rows;
      for (const r of rows) {
        const siteId = siteMap.get(r.site_id);
        const existing = await tgt.query('SELECT id FROM machines WHERE site_id = $1 AND nom = $2', [siteId, r.nom]);
        if (existing.rows[0]) { skipped++; continue; }
        await tgt.query(
          `INSERT INTO machines
             (site_id, nom, code, categorie, actif, calendrier_travail, capacite, efficacite_pct,
              temps_preparation_min, temps_nettoyage_min, cout_horaire, oee_cible_pct, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [siteId, r.nom, r.code, r.categorie, r.actif, r.calendrier_travail, r.capacite, r.efficacite_pct,
            r.temps_preparation_min, r.temps_nettoyage_min, r.cout_horaire, r.oee_cible_pct, r.description]
        );
        created++;
      }
      record('machines', created, skipped);
    }

    // --- Produits (clé naturelle : code si présent, sinon désignation) ---
    const productMap = new Map();
    {
      let created = 0, skipped = 0;
      const rows = (await src.query(`
        SELECT id, code, designation, unite, actif, category_id, business_unit_id, seuil_alerte_stock,
               conditionnement, format_taille, contenu_par_carton, kg_equivalent_carton, prix_suggere_gnf
        FROM products ORDER BY id
      `)).rows;
      for (const r of rows) {
        const existing = r.code
          ? await tgt.query('SELECT id FROM products WHERE code = $1', [r.code])
          : await tgt.query('SELECT id FROM products WHERE code IS NULL AND designation = $1', [r.designation]);
        if (existing.rows[0]) { productMap.set(r.id, existing.rows[0].id); skipped++; continue; }

        const categoryId = mapCategory(srcCategoryById.get(r.category_id));
        const businessUnitId = r.business_unit_id ? buMap.get(r.business_unit_id) : null;
        const inserted = await tgt.query(
          `INSERT INTO products
             (code, designation, unite, actif, category_id, business_unit_id, seuil_alerte_stock,
              conditionnement, format_taille, contenu_par_carton, kg_equivalent_carton, prix_suggere_gnf)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [r.code, r.designation, r.unite, r.actif, categoryId, businessUnitId, r.seuil_alerte_stock,
            r.conditionnement, r.format_taille, r.contenu_par_carton, r.kg_equivalent_carton, r.prix_suggere_gnf]
        );
        productMap.set(r.id, inserted.rows[0].id);
        created++;
      }
      record('products', created, skipped);
    }

    // --- Rattachement produits <-> entités ---
    {
      let created = 0, skipped = 0;
      const rows = (await src.query('SELECT product_id, entity_id FROM product_entities')).rows;
      for (const r of rows) {
        const productId = productMap.get(r.product_id);
        const entityId = mapEntity(srcEntityById.get(r.entity_id));
        const result = await tgt.query(
          'INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [productId, entityId]
        );
        if (result.rowCount > 0) created++; else skipped++;
      }
      record('product_entities', created, skipped);
    }

    // --- Fournisseurs (clé naturelle : code si présent, sinon nom) ---
    const supplierMap = new Map();
    {
      let created = 0, skipped = 0;
      const rows = (await src.query(`
        SELECT id, nom, contact_nom, contact_email, contact_tel, adresse, actif, origine, pays,
               categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires, code
        FROM suppliers ORDER BY id
      `)).rows;
      for (const r of rows) {
        const existing = r.code
          ? await tgt.query('SELECT id FROM suppliers WHERE code = $1', [r.code])
          : await tgt.query('SELECT id FROM suppliers WHERE code IS NULL AND nom = $1', [r.nom]);
        if (existing.rows[0]) { supplierMap.set(r.id, existing.rows[0].id); skipped++; continue; }

        const inserted = await tgt.query(
          `INSERT INTO suppliers
             (nom, contact_nom, contact_email, contact_tel, adresse, actif, origine, pays, categorie,
              produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires, code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [r.nom, r.contact_nom, r.contact_email, r.contact_tel, r.adresse, r.actif, r.origine, r.pays,
            r.categorie, r.produits_offres, r.mode_paiement, r.conditions_paiement, r.a_contrat, r.commentaires, r.code]
        );
        supplierMap.set(r.id, inserted.rows[0].id);
        created++;
      }
      record('suppliers', created, skipped);
    }

    // --- Rattachement fournisseurs <-> entités ---
    {
      let created = 0, skipped = 0;
      const rows = (await src.query('SELECT supplier_id, entity_id FROM supplier_entities')).rows;
      for (const r of rows) {
        const supplierId = supplierMap.get(r.supplier_id);
        const entityId = mapEntity(srcEntityById.get(r.entity_id));
        const result = await tgt.query(
          'INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [supplierId, entityId]
        );
        if (result.rowCount > 0) created++; else skipped++;
      }
      record('supplier_entities', created, skipped);
    }

    console.log('\n✅ Import terminé.');
    for (const [table, { created, skipped }] of Object.entries(stats)) {
      console.log(`  ${table} : ${created} créé(s), ${skipped} déjà présent(s)`);
    }
  } catch (e) {
    console.error('❌ Erreur :', e.message);
    process.exitCode = 1;
  } finally {
    await src.end();
    await tgt.end();
  }
}

main();
