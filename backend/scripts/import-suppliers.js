#!/usr/bin/env node
// Importe/synchronise des fournisseurs depuis un JSON produit par xlsx-to-suppliers-json.py
// (voir ce script pour le format attendu et pour regénérer le JSON à partir d'un export Excel).
//
// Usage : node scripts/import-suppliers.js <fichier.json> [--entity=SOGUIPAL]
// (depuis backend/, avec DATABASE_URL déjà positionné sur la base cible — dev ou prod — dans
// l'environnement du terminal).
//
// Idempotent : rejouable sans créer de doublons. Un fournisseur est retrouvé par son `code` s'il
// en a un, sinon par son nom (insensible à la casse) — cohérent avec le fait que `code` est
// UNIQUE mais nullable en base (migration 012).
const fs = require('fs');
const { one, run, pool, runMigrations } = require('../src/db');

const FIELDS = [
  'code', 'nom', 'origine', 'pays', 'categorie', 'produits_offres',
  'contact_nom', 'contact_email', 'contact_tel', 'mode_paiement', 'conditions_paiement',
  'a_contrat', 'commentaires',
];

async function findExisting(rec) {
  if (rec.code) return one('SELECT * FROM suppliers WHERE code = $1', [rec.code]);
  return one('SELECT * FROM suppliers WHERE code IS NULL AND lower(nom) = lower($1)', [rec.nom]);
}

async function main() {
  const [, , jsonPath, ...rest] = process.argv;
  const entityFlag = rest.find(a => a.startsWith('--entity='));
  const entityCode = entityFlag ? entityFlag.split('=')[1] : 'SOGUIPAL';

  if (!jsonPath) {
    console.error('Usage : node scripts/import-suppliers.js <fichier.json> [--entity=SOGUIPAL]');
    process.exitCode = 1;
    return;
  }

  await runMigrations();

  const records = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const entity = await one('SELECT id FROM entities WHERE code = $1', [entityCode]);
  if (!entity) {
    console.error(`❌ Entité "${entityCode}" introuvable.`);
    process.exitCode = 1;
    return pool.end();
  }

  let created = 0, updated = 0, linked = 0;
  for (const rec of records) {
    if (!rec.nom) continue;
    const existing = await findExisting(rec);
    let supplierId;
    if (existing) {
      await run(
        `UPDATE suppliers SET ${FIELDS.map((f, i) => `${f}=$${i + 1}`).join(', ')} WHERE id=$${FIELDS.length + 1}`,
        [...FIELDS.map(f => rec[f] ?? null), existing.id]
      );
      supplierId = existing.id;
      updated++;
    } else {
      const inserted = await one(
        `INSERT INTO suppliers (${FIELDS.join(', ')}) VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        FIELDS.map(f => rec[f] ?? null)
      );
      supplierId = inserted.id;
      created++;
    }
    const link = await run(
      'INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [supplierId, entity.id]
    );
    if (link.rowCount > 0) linked++;
  }

  console.log(`✅ ${created} fournisseur(s) créé(s), ${updated} mis à jour, ${linked} nouveau(x) lien(s) vers ${entityCode}.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exitCode = 1; return pool.end(); });
