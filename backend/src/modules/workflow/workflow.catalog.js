// Catalogue des workflows configurables depuis le module « Workflows » (Admin → Paramètres).
// Centralise ici tout workflow présent ou futur : il suffit d'ajouter une entrée pour qu'il
// apparaisse dans l'éditeur. Chaque entrée déclare :
//   - label            : nom affiché dans le sélecteur ;
//   - locked           : true = circuit figé (étapes pilotées par le code du moteur) → seuls le
//                        nom affiché, le SLA et l'obligation de commentaire sont modifiables ;
//                        false = circuit librement éditable (ajout/suppression/réordonnancement) ;
//   - roleOptions      : rôles proposables sur une étape ;
//   - protectedCodes   : codes d'étapes dont le `code` et la position sont verrouillés ;
//   - usage            : tables/colonnes référençant workflow_steps(id) — sert au versionnement
//                        (si une étape retirée est déjà utilisée, on archive l'ancien circuit).
const CATALOG = {
  demande_achat: {
    label: "Demande d'achat",
    locked: false,
    roleOptions: ['service_achat', 'controle_gestion', 'finances', 'validateur_besoin'],
    protectedCodes: ['expression_besoin', 'soumission', 'analyse_achat', 'devis', 'validation_achat'],
    usage: [
      { table: 'approvals', col: 'workflow_step_id' },
      { table: 'purchase_requests', col: 'current_step_id' },
    ],
  },
  bon_commande_commercial: {
    label: 'Bon de commande commercial',
    // Circuit figé : le moteur (commande.workflow.js) s'appuie sur les CODES des étapes
    // (controle_stock = éventail par BU, generation_bc = étape système, etc.). On n'autorise donc
    // que le renommage, le SLA et l'obligation de commentaire — pas de restructuration.
    locked: true,
    roleOptions: ['responsable_commercial', 'controle_gestion', 'gestionnaire_stock'],
    protectedCodes: ['validation_resp_commercial', 'controle_gestion', 'controle_stock', 'generation_bc'],
    usage: [
      { table: 'commande_validations', col: 'step_id' },
      { table: 'commandes_commerciales', col: 'current_step_id' },
    ],
  },
};

function getEntry(moduleCode) {
  return Object.prototype.hasOwnProperty.call(CATALOG, moduleCode) ? CATALOG[moduleCode] : null;
}

module.exports = { CATALOG, getEntry };
