const { all, one, run } = require('../../../db');
const { generateCommandeCommercialePdf } = require('../../../utils/pdf');

// Génération + archivage du bon de commande commercial (PDF). Appelé à la validation finale
// (étape système) et au téléchargement si l'archive n'existe pas encore. Document en français.

async function buildBuffer(commandeId) {
  const c = await one(`
    SELECT c.*,
           co.code AS commercial_code,
           TRIM(CONCAT(COALESCE(ce.prenom, co.prenom), ' ', COALESCE(ce.nom, co.nom))) AS commercial_nom,
           g.code AS grossiste_code, g.raison_sociale AS grossiste_nom,
           v.immatriculation AS vehicle_immatriculation, v.marque AS vehicle_marque
      FROM commandes_commerciales c
      LEFT JOIN commerciaux co ON co.id = c.commercial_id
      LEFT JOIN employees ce   ON ce.id = co.employee_id
      LEFT JOIN grossistes g   ON g.id = c.grossiste_id
      LEFT JOIN vehicles v     ON v.id = c.vehicle_id
     WHERE c.id = $1`, [commandeId]);
  if (!c) return null;
  const lignes = await all('SELECT * FROM commande_lignes WHERE commande_id = $1 ORDER BY id', [commandeId]);
  const beneficiaireLabel = c.beneficiaire_type === 'commercial'
    ? `${c.commercial_code || ''} ${c.commercial_nom || ''}`.trim()
    : `${c.grossiste_code || ''} ${c.grossiste_nom || ''}`.trim();
  return generateCommandeCommercialePdf({ commande: c, lignes, beneficiaireLabel, logoBuffer: null });
}

async function generateAndStore(commandeId, userId) {
  const buf = await buildBuffer(commandeId);
  if (!buf) return null;
  await run(
    `INSERT INTO commande_documents (commande_id, type, contenu, mime, genere_par)
     VALUES ($1, 'bon_commande', $2, 'application/pdf', $3)
     ON CONFLICT (commande_id, type)
       DO UPDATE SET contenu = EXCLUDED.contenu, genere_par = EXCLUDED.genere_par, genere_at = now()`,
    [commandeId, buf, userId || null]);
  return buf;
}

async function getStored(commandeId) {
  return one(`SELECT contenu, mime FROM commande_documents WHERE commande_id = $1 AND type = 'bon_commande'`, [commandeId]);
}

module.exports = { buildBuffer, generateAndStore, getStored };
