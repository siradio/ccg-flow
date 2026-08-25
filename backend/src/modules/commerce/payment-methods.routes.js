const { simpleCrudRouter } = require('../referentials/crud.factory');

// Moyens de versement — référentiel paramétrable (Espèces, Orange Money, Banque, Crédit,
// Autres/Écart, et tout moyen ajouté ensuite : MTN, Chèque, Virement…). Géré dans Paramètres Commerce.
module.exports = simpleCrudRouter({
  table: 'payment_methods',
  columns: ['code', 'libelle', 'description', 'requiert_reference', 'requiert_justificatif', 'ordre', 'actif'],
  orderBy: 'ordre, libelle',
  subModuleKey: 'commerce.parametres',
});
