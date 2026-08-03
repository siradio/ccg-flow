// Importe les employés réels extraits du fichier Excel RH (voir extract_employees.py)
// dans la base CCG Flow. À lancer depuis le dossier backend/ :
//   node scripts/import-employees.js scripts/employees_import.json
const fs = require('fs');
const path = require('path');
const { pool, all, one, run } = require('../src/db');

// Le fichier source mélange entité (CCG Groupe, Soguipal) et ligne de production précise
// (Yaourt, Tomate, Lait, Mayo/Margarine) dans une seule colonne "Business_Unit" — on les
// sépare ici en entity_id (toujours) + business_unit_id (seulement pour une ligne précise).
const BU_MAP = {
  'CCG Groupe': { entityCode: 'CCG', buCode: null },
  Soguipal: { entityCode: 'SOGUIPAL', buCode: null },
  Yaourt: { entityCode: 'SOGUIPAL', buCode: 'bu_yaourt' },
  Tomate: { entityCode: 'SOGUIPAL', buCode: 'bu_tomate' },
  Lait: { entityCode: 'SOGUIPAL', buCode: 'bu_lait' },
  'Mayo/Margarine': { entityCode: 'SOGUIPAL', buCode: 'bu_mayo_margarine' },
};

async function main() {
  const jsonPath = process.argv[2] || path.join(__dirname, 'employees_import.json');
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const entities = await all('SELECT id, code FROM entities');
  const entityIdByCode = Object.fromEntries(entities.map(e => [e.code, e.id]));

  const bus = await all('SELECT id, code FROM business_units');
  const buIdByCode = Object.fromEntries(bus.map(b => [b.code, b.id]));

  const siteCache = new Map();
  async function resolveSite(nom, entityId) {
    if (!nom) return null;
    const key = `${entityId}|${nom}`;
    if (siteCache.has(key)) return siteCache.get(key);
    let site = await one('SELECT id FROM sites WHERE entity_id = $1 AND nom = $2', [entityId, nom]);
    if (!site) {
      site = await one('INSERT INTO sites (entity_id, nom) VALUES ($1,$2) RETURNING id', [entityId, nom]);
      console.log(`  + site créé : "${nom}"`);
    }
    siteCache.set(key, site.id);
    return site.id;
  }

  let created = 0;
  let skippedUnknownBU = 0;
  let skippedExisting = 0;
  for (const r of rows) {
    const mapping = BU_MAP[r.business_unit_raw];
    if (!mapping) {
      console.warn(`  ! Business_Unit inconnue ignorée : "${r.business_unit_raw}" (${r.nom_complet_source})`);
      skippedUnknownBU++;
      continue;
    }
    const entityId = entityIdByCode[mapping.entityCode];
    const businessUnitId = mapping.buCode ? buIdByCode[mapping.buCode] : null;

    // Idempotence : ne réinsère pas un employé déjà présent (clé naturelle matricule + nom + prénom).
    // `IS NOT DISTINCT FROM` traite correctement un matricule NULL (~59 codes partagés dans la source,
    // certains vides). Rejouer le script sur une base déjà peuplée n'ajoute donc aucun doublon —
    // essentiel pour un import vers la prod qu'on ne veut surtout pas dupliquer par mégarde.
    const existing = await one(
      'SELECT 1 FROM employees WHERE matricule IS NOT DISTINCT FROM $1 AND nom = $2 AND prenom = $3 LIMIT 1',
      [r.matricule, r.nom, r.prenom]
    );
    if (existing) { skippedExisting++; continue; }

    const siteId = await resolveSite(r.site, entityId);
    await run(
      `INSERT INTO employees
         (matricule, nom, prenom, poste, departement, entity_id, site_id, business_unit_id,
          manager, date_embauche, type_contrat, statut, salaire_mensuel, telephone, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [r.matricule, r.nom, r.prenom, r.poste, r.departement, entityId, siteId, businessUnitId,
        r.manager, r.date_embauche, r.type_contrat, r.statut, r.salaire_mensuel, r.telephone, r.email]
    );
    created++;
  }

  console.log(`\n${created} employé(s) importé(s), ${skippedExisting} déjà présent(s) (ignorés), ${skippedUnknownBU} ignoré(s) (Business_Unit inconnue).`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
