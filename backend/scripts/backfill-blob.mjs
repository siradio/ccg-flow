/**
 * Backfill des médias BYTEA de ccgflow vers Azure Blob (container privé).
 *
 * Pour chaque table ciblée, lit les lignes dont le BYTEA est présent et la clé
 * absente, upload le binaire vers le Blob, écrit la clé, puis VIDE le BYTEA.
 * Idempotent. Ne migrer une table QUE si son serve lit déjà la clé (sinon on
 * casse la lecture). Pour l'instant : attachments seulement (pilote).
 *
 * DRY-RUN par défaut. --apply pour écrire.
 * Env : DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER
 */
import pg from 'pg';
import { BlobServiceClient } from '@azure/storage-blob';
import { randomUUID } from 'crypto';

const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge'); // vide le BYTEA après migration (sinon on le garde en filet)
const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
const container = process.env.AZURE_STORAGE_CONTAINER || 'ccgflow';
if (!conn) { console.error('AZURE_STORAGE_CONNECTION_STRING manquant.'); process.exit(1); }
const cc = BlobServiceClient.fromConnectionString(conn).getContainerClient(container);

// table, id, colonne BYTEA, colonne clé, colonne mime, préfixe blob
const TARGETS = [
  { table: 'attachments', id: 'id', col: 'content', keyCol: 'content_key', mimeCol: 'mimetype', prefix: 'attachments' },
  { table: 'entities', id: 'id', col: 'logo', keyCol: 'logo_key', mimeCol: 'logo_mime', prefix: 'branding' },
  { table: 'entities', id: 'id', col: 'signature', keyCol: 'signature_key', mimeCol: 'signature_mime', prefix: 'branding' },
  { table: 'entities', id: 'id', col: 'stamp', keyCol: 'stamp_key', mimeCol: 'stamp_mime', prefix: 'branding' },
  { table: 'machines', id: 'id', col: 'photo', keyCol: 'photo_key', mimeCol: 'photo_mime', prefix: 'machines' },
  { table: 'vehicles', id: 'id', col: 'photo', keyCol: 'photo_key', mimeCol: 'photo_mime', prefix: 'vehicles' },
  { table: 'checklist_run_items', id: 'id', col: 'photo', keyCol: 'photo_key', mimeCol: 'photo_mime', prefix: 'checklists' },
  { table: 'panne_photos', id: 'id', col: 'photo', keyCol: 'photo_key', mimeCol: 'photo_mime', prefix: 'pannes' },
  { table: 'accident_photos', id: 'id', col: 'photo', keyCol: 'photo_key', mimeCol: 'photo_mime', prefix: 'accidents' },
];

const ext = (m) => (m && m.split('/')[1] ? m.split('/')[1].split('+')[0].split(';')[0] : 'bin');

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(`Mode : ${APPLY ? 'APPLY' : 'DRY-RUN'}${APPLY ? (PURGE ? ' (+purge BYTEA)' : ' (garde BYTEA)') : ''} · container ${container}\n`);
  let total = 0;
  for (const t of TARGETS) {
    const rows = (await c.query(
      `SELECT "${t.id}" AS id, "${t.mimeCol}" AS mime, octet_length("${t.col}") AS len
       FROM "${t.table}" WHERE "${t.col}" IS NOT NULL AND "${t.keyCol}" IS NULL`,
    )).rows;
    console.log(`  ${t.table}: ${rows.length} ligne(s) à migrer`);
    for (const r of rows) {
      if (APPLY) {
        const buf = (await c.query(`SELECT "${t.col}" AS b FROM "${t.table}" WHERE "${t.id}" = $1`, [r.id])).rows[0].b;
        const key = `${t.prefix}/${randomUUID()}.${ext(r.mime)}`;
        await cc.getBlockBlobClient(key).uploadData(buf, { blobHTTPHeaders: { blobContentType: r.mime || 'application/octet-stream' } });
        // Par défaut on GARDE le BYTEA (filet de sécurité) ; --purge le vide.
        const set = PURGE ? `"${t.keyCol}" = $1, "${t.col}" = NULL` : `"${t.keyCol}" = $1`;
        await c.query(`UPDATE "${t.table}" SET ${set} WHERE "${t.id}" = $2`, [key, r.id]);
      }
      console.log(`    ${APPLY ? '↑' : '·'} id=${r.id} (${Math.round((r.len || 0) / 1024)} Ko)`);
      total++;
    }
  }
  console.log(`\n${APPLY ? 'Migré' : 'À migrer'} : ${total} ligne(s).`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
