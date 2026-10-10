// Interface d'extension pour la disponibilité stock des bons de commande commerciaux.
//
// Exigence non-négociable : l'intégration automatique avec le module Stock est une évolution FUTURE.
// Elle est anticipée ici architecturalement, mais ne doit ni retarder ni bloquer la V1.
//
// V1 — ManualStockProvider : ne consulte RIEN, délègue toujours à la vérification humaine
//       (gestionnaire de stock, en éventail par BU). Aucune donnée simulée, aucune réservation,
//       aucun décrément de stock.
// Futur — LedgerStockProvider : interrogera le grand livre du module Stock et pourra renvoyer des
//       disponibilités autoritatives (pré-remplir / signaler), voire réserver. Il se branchera via
//       setStockProvider() SANS toucher au formulaire ni au workflow.
//
// Ce fichier n'est pas encore importé par les routes : socle posé au Lot 0, câblé au Lot 3.

class StockAvailabilityProvider {
  // Retourne la disponibilité pour un ensemble de lignes d'une BU donnée.
  //   lines : [{ product_id, quantite, unite }]
  //   -> { mode: 'manual' }                       → exige une confirmation humaine
  //   -> { mode: 'auto', disponible, details }     → disponibilité autoritative (évolution future)
  // eslint-disable-next-line no-unused-vars
  async checkAvailability({ businessUnitId, lines }) {
    throw new Error('StockAvailabilityProvider.checkAvailability : non implémenté');
  }
}

// Fournisseur par défaut : tout passe par la validation manuelle du gestionnaire de stock.
class ManualStockProvider extends StockAvailabilityProvider {
  // eslint-disable-next-line no-unused-vars
  async checkAvailability({ businessUnitId, lines } = {}) {
    return { mode: 'manual' };
  }
}

let current = new ManualStockProvider();

function getStockProvider() { return current; }
function setStockProvider(provider) {
  if (!(provider instanceof StockAvailabilityProvider)) {
    throw new Error('setStockProvider : instance de StockAvailabilityProvider attendue');
  }
  current = provider;
}

module.exports = { StockAvailabilityProvider, ManualStockProvider, getStockProvider, setStockProvider };
