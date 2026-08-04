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

async function createSupplier(fields) {
  const {
    nom, contact_nom, contact_email, contact_tel, adresse, actif,
    code, origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires,
  } = fields;
  if (!nom) throw httpError(400, 'nom obligatoire.');

  try {
    return await one(
      `INSERT INTO suppliers
         (nom, contact_nom, contact_email, contact_tel, adresse, actif,
          code, origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        nom, contact_nom || null, contact_email || null, contact_tel || null, adresse || null,
        actif === undefined ? true : actif,
        code || null, origine || null, pays || null, categorie || null, produits_offres || null,
        mode_paiement || null, conditions_paiement || null,
        a_contrat === undefined ? null : a_contrat, commentaires || null,
      ]
    );
  } catch (e) {
    // Traduit les erreurs de contrainte PostgreSQL en messages clairs, au lieu d'un "Erreur
    // serveur" 500 générique (ex. code fournisseur déjà utilisé, origine hors liste).
    if (e.code === '23505') throw httpError(409, 'Ce code fournisseur est déjà utilisé — choisissez-en un autre (ou laissez-le vide).');
    if (e.code === '23514') throw httpError(400, 'Origine invalide : choisissez « Import » ou « Local ».');
    throw e;
  }
}

async function linkSupplierToEntity(supplierId, entityId) {
  await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2)', [supplierId, entityId]);
}

module.exports = { withEntityIds, createSupplier, linkSupplierToEntity };
