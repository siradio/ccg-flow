// Importe le référentiel produits finis extrait des fichiers PILCO par BU
// (voir extract_pilco_products.py) dans la base CCG Flow. À lancer depuis backend/ :
//   node scripts/import-pilco-products.js scripts/produits_bu_import.json
const fs = require('fs');
const path = require('path');
const { pool, all, one, run } = require('../src/db');

async function main() {
  const jsonPath = process.argv[2] || path.join(__dirname, 'produits_bu_import.json');
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const soguipal = await one("SELECT id FROM entities WHERE code = 'SOGUIPAL'");
  const category = await one("SELECT id FROM product_categories WHERE code = 'produit_fini'");
  const bus = await all('SELECT id, code FROM business_units');
  const buIdByCode = Object.fromEntries(bus.map(b => [b.code, b.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const r of rows) {
    const businessUnitId = buIdByCode[r.business_unit_code];
    if (!businessUnitId) {
      console.warn(`  ! BU inconnue ignorée : "${r.business_unit_code}" (${r.designation})`);
      skipped++;
      continue;
    }

    const existing = r.code
      ? await one('SELECT id FROM products WHERE code = $1', [r.code])
      : await one('SELECT id FROM products WHERE designation = $1 AND business_unit_id = $2', [r.designation, businessUnitId]);

    if (existing) {
      await run(
        `UPDATE products SET designation=$1, category_id=$2, unite=$3, business_unit_id=$4,
           conditionnement=$5, format_taille=$6, contenu_par_carton=$7, kg_equivalent_carton=$8, prix_suggere_gnf=$9
         WHERE id=$10`,
        [r.designation, category.id, r.unite, businessUnitId,
          r.conditionnement, r.format_taille, r.contenu_par_carton, r.kg_equivalent_carton, r.prix_suggere_gnf,
          existing.id]
      );
      await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [existing.id, soguipal.id]);
      updated++;
      continue;
    }

    const product = await one(
      `INSERT INTO products
         (code, designation, category_id, unite, business_unit_id, conditionnement, format_taille, contenu_par_carton, kg_equivalent_carton, prix_suggere_gnf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [r.code, r.designation, category.id, r.unite, businessUnitId,
        r.conditionnement, r.format_taille, r.contenu_par_carton, r.kg_equivalent_carton, r.prix_suggere_gnf]
    );
    await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2)', [product.id, soguipal.id]);
    created++;
  }

  console.log(`\n${created} produit(s) créé(s), ${updated} mis à jour, ${skipped} ignoré(s).`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
