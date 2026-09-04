// Logique de création/liaison d'un fournisseur, partagée entre le référentiel complet
// (suppliers.routes.js) et l'ajout rapide depuis une demande d'achat
// (purchase-requests.service.js#quickAddSupplier) — une seule liste de champs, jamais deux
// formulaires qui divergent sur ce qu'un fournisseur peut porter.
const { all, one, run } = require('../../db');
const { httpError } = require('../../utils/httpError');

async function withEntityIds(supplier) {
  const rows = await all('SELECT entity_id FROM supplier_entities WHERE supplier_id = $1', [supplier.id]);
  return { ...supplier, entity_ids: rows.map(r => r.entity_id) };
}

// Code fournisseur auto-généré : FRN-### (suivant = plus grand numéro FRN existant + 1). Le code
// saisi côté formulaire est ignoré (le code est géré par le système, cf. migration 072).
async function nextSupplierCode() {
  const r = await one(`SELECT COALESCE(MAX((SUBSTRING(code FROM '^FRN-([0-9]+)$'))::int), 0) + 1 AS n FROM suppliers`);
  return 'FRN-' + String(r.n).padStart(3, '0');
}

async function createSupplier(fields) {
  const {
    nom, contact_nom, contact_email, contact_tel, adresse, actif,
    origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires,
    date_engagement, devises,
  } = fields;
  if (!nom) throw httpError(400, 'nom obligatoire.');

  try {
    const code = await nextSupplierCode();
    return await one(
      `INSERT INTO suppliers
         (nom, contact_nom, contact_email, contact_tel, adresse, actif,
          code, origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires,
          date_engagement, devises)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        nom, contact_nom || null, contact_email || null, contact_tel || null, adresse || null,
        actif === undefined || actif === '' ? true : !!actif,
        code, origine || null, pays || null, categorie || null, produits_offres || null,
        mode_paiement || null, conditions_paiement || null,
        a_contrat === undefined || a_contrat === '' ? null : !!a_contrat, commentaires || null,
        date_engagement || null, Array.isArray(devises) ? devises : null,
      ]
    );
  } catch (e) {
    // Traduit les erreurs de contrainte PostgreSQL en messages clairs, au lieu d'un "Erreur
    // serveur" 500 générique (ex. code fournisseur déjà utilisé, origine hors liste).
    if (e.code === '23505') throw httpError(409, 'Ce code fournisseur est déjà utilisé — choisissez-en un autre (ou laissez-le vide).');
    if (e.code === '23514') throw httpError(400, 'Origine invalide : choisissez « Import » ou « Local ».');
    if (e.code === '22P02') throw httpError(400, 'Une valeur du formulaire est invalide — vérifiez les champs et réessayez.');
    throw e;
  }
}

async function linkSupplierToEntity(supplierId, entityId) {
  await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2)', [supplierId, entityId]);
}

module.exports = { withEntityIds, createSupplier, linkSupplierToEntity };
