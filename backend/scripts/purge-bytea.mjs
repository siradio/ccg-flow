/**
 * Purge sécurisée du BYTEA après migration Blob (récupère l'espace en base).
 *
 * Pour chaque ligne ayant une clé blob ET encore un BYTEA, on TÉLÉCHARGE le blob
 * et on vérifie qu'il est présent ET de la MÊME TAILLE que le BYTEA. Seulement
 * si c'est confirmé, on met le BYTEA à NULL. Sinon on laisse (log d'alerte).
 *
 * DRY-RUN par défaut (vérifie sans vider). --apply pour vider réellement.
 * Env : DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER
 */
import pg from 'pg';
import { BlobServiceClient } from '@azure/storage-blob';

const APPLY = process.argv.includes('--apply');
const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
const container = process.env.AZURE_STORAGE_CONTAINER || 'ccgflow';
if (!conn) { console.error('AZURE_STORAGE_CONNECTION_STRING manquant.'); process.exit(1); }
const cc = BlobServiceClient.fromConnectionString(conn).getContainerClient(container);

const TARGETS = [
  { table: 'attachments', id: 'id', col: 'content', keyCol: 'content_key' },
  { table: 'entities', id: 'id', col: 'logo', keyCol: 'logo_key' },
  { table: 'entities', id: 'id', col: 'signature', keyCol: 'signature_key' },
  { table: 'entities', id: 'id', col: 'stamp', keyCol: 'stamp_key' },
  { table: 'machines', id: 'id', col: 'photo', keyCol: 'photo_key' },
  { table: 'vehicles', id: 'id', col: 'photo', keyCol: 'photo_key' },
  { table: 'checklist_run_items', id: 'id', col: 'photo', keyCol: 'photo_key' },
  { table: 'panne_photos', id: 'id', col: 'photo', keyCol: 'photo_key' },
  { table: 'accident_photos', id: 'id', col: 'photo', keyCol: 'photo_key' },
];

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(`Mode : ${APPLY ? 'APPLY (vide le BYTEA)' : 'DRY-RUN (vérifie seulement)'} · container ${container}\n`);
  let purged = 0, skipped = 0, checked = 0;
  for (const t of TARGETS) {
    const rows = (await c.query(
      `SELECT "${t.id}" AS id, "${t.keyCol}" AS key, octet_length("${t.col}") AS len
       FROM "${t.table}" WHERE "${t.keyCol}" IS NOT NULL AND "${t.col}" IS NOT NULL`,
    )).rows;
    if (rows.length === 0) continue;
    console.log(`  ${t.table}.${t.col} : ${rows.length} ligne(s) à vérifier`);
    for (const r of rows) {
      checked++;
      let ok = false, blobLen = -1;
      try {
        const buf = await cc.getBlockBlobClient(r.key).downloadToBuffer();
        blobLen = buf.length;
        ok = blobLen === Number(r.len) && blobLen > 0;
      } catch (e) {
        ok = false;
      }
      if (ok) {
        if (APPLY) await c.query(`UPDATE "${t.table}" SET "${t.col}" = NULL WHERE "${t.id}" = $1`, [r.id]);
        purged++;
      } else {
        skipped++;
        console.log(`    ⚠️ id=${r.id} : blob ${blobLen < 0 ? 'INTROUVABLE' : `taille ${blobLen}≠BYTEA ${r.len}`} → BYTEA CONSERVÉ`);
      }
    }
  }
  console.log(`\nVérifiées : ${checked} · ${APPLY ? 'vidées' : 'prêtes à vider'} : ${purged} · conservées (alerte) : ${skipped}`);
  if (!APPLY) console.log('Relance avec --apply pour vider le BYTEA des lignes vérifiées.');
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
