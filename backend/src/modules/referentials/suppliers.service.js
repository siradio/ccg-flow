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

  return one(
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
}

async function linkSupplierToEntity(supplierId, entityId) {
  await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2)', [supplierId, entityId]);
}

module.exports = { withEntityIds, createSupplier, linkSupplierToEntity };
