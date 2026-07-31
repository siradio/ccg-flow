const { all, run } = require('../../db');
const prService = require('../purchase-requests/purchase-requests.service');
const repo = require('../purchase-requests/purchase-requests.repository');
const settings = require('../settings/settings.service');

const SAMPLE_OBJETS = [
  "Achat de fournitures de bureau", 'Renouvellement de licences logicielles',
  'Maintenance équipement de production', "Commande d'emballages",
  'Achat de matière première', 'Prestation de nettoyage industriel',
  'Achat de pièces détachées', 'Renouvellement contrat de service',
  "Équipement de sécurité", 'Consommables informatiques',
  'Réparation véhicule de service', 'Achat de mobilier de bureau',
];

// Deux exemplaires de chaque statut clé du circuit, pour avoir tout de suite de quoi tester
// dashboard/KPI/filtres sans repasser à la main par chaque étape. Le dernier statut du circuit
// dépend de la configuration réelle du workflow (§ moteur générique) : bon_commande_genere est
// atteint en rejouant validateStep() jusqu'au bout, jamais un nombre d'étapes codé en dur.
const SCENARIOS = [
  'brouillon', 'brouillon',
  'en_attente_validation_besoin', 'en_attente_validation_besoin',
  'devis_en_cours', 'devis_en_cours',
  'devis_selectionne', 'devis_selectionne',
  'en_validation', 'en_validation',
  'bon_commande_genere', 'bon_commande_genere',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function randomMontant() {
  return Math.round((100000 + Math.random() * 900000) / 1000) * 1000;
}

// Génère un lot de demandes d'achat synthétiques, entraînées à travers le VRAI circuit (mêmes
// fonctions de service que les routes HTTP, donc mêmes règles métier, audit et notifications) —
// jamais des lignes insérées à la main, pour ne jamais dériver du schéma ou des contraintes
// réelles. L'acteur passé en paramètre doit être super_admin : il contourne ainsi tous les
// contrôles de rôle par entité (hasRoleOnEntity), donc pas besoin de connaître quel compte de
// démo a quel rôle sur quelle entité pour chaque étape.
async function loadSampleData(user) {
  const entities = await all('SELECT id, code FROM entities');
  const minSuppliers = await settings.getIntValue('min_suppliers_devis', 2);
  const created = [];
  const skipped = [];

  let objetIdx = 0;
  for (const scenario of SCENARIOS) {
    const entity = pick(entities);
    const products = await all(
      'SELECT p.id FROM products p JOIN product_entities pe ON pe.product_id = p.id WHERE pe.entity_id = $1 AND p.actif = true',
      [entity.id]
    );
    const suppliers = await all(
      'SELECT s.id FROM suppliers s JOIN supplier_entities se ON se.supplier_id = s.id WHERE se.entity_id = $1 AND s.actif = true',
      [entity.id]
    );

    const needsSuppliers = scenario !== 'brouillon' && scenario !== 'en_attente_validation_besoin';
    if (needsSuppliers && suppliers.length < minSuppliers) {
      skipped.push(`${scenario} (${entity.code}) — pas assez de fournisseurs référencés sur cette entité`);
      continue;
    }

    const objet = `${SAMPLE_OBJETS[objetIdx % SAMPLE_OBJETS.length]} (test)`;
    objetIdx++;

    let pr = await prService.createDraft(user, { entityId: entity.id, objet, justification: 'Généré automatiquement pour les tests.' });
    await prService.addLine(user, pr.id, products.length
      ? { productId: pick(products).id, quantite: 1 + Math.floor(Math.random() * 10), unite: 'unité' }
      : { descriptionLibre: 'Article de test', quantite: 1 + Math.floor(Math.random() * 10), unite: 'unité' });

    if (scenario === 'brouillon') { created.push(pr.id); continue; }

    await prService.submit(user, pr.id);
    if (scenario === 'en_attente_validation_besoin') { created.push(pr.id); continue; }

    // Valide l'expression de besoin (DGA) -> 'soumise'.
    await prService.validateStep(user, pr.id, null);

    const selected = shuffle(suppliers).slice(0, Math.max(minSuppliers, 2)).map(s => s.id);
    const qr = await prService.createQuoteRequest(user, pr.id, { supplierIds: selected });
    // Marque directement "envoyé" (données de test : pas d'envoi de mail réel).
    for (const s of qr.suppliers) {
      await repo.markQuoteRequestSupplierSent(s.id);
    }
    if (scenario === 'devis_en_cours') { created.push(pr.id); continue; }

    for (const s of qr.suppliers) {
      await prService.addQuote(user, pr.id, { quoteRequestSupplierId: s.id, montant: randomMontant(), devise: 'GNF' });
    }
    const full = await prService.getFullDetail(pr.id);
    await prService.selectQuote(user, pr.id, pick(full.quotes).id);
    if (scenario === 'devis_selectionne') { created.push(pr.id); continue; }

    // Valide l'étape achat -> 'en_validation' (première étape de la cascade générique).
    await prService.validateStep(user, pr.id, null);
    if (scenario === 'en_validation') { created.push(pr.id); continue; }

    // 'bon_commande_genere' : rejoue validateStep() jusqu'au bout du circuit configuré, quel
    // qu'il soit (garde-fou à 15 itérations pour ne jamais boucler indéfiniment sur une
    // configuration de workflow incomplète).
    for (let i = 0; i < 15; i++) {
      const current = await prService.getFullDetail(pr.id);
      if (current.status !== 'en_validation') break;
      await prService.validateStep(user, pr.id, null);
    }
    created.push(pr.id);
  }

  return { created: created.length, skipped };
}

// Vide toutes les données transactionnelles du circuit achat + stock + prix + notifications —
// jamais les référentiels (entités, sites, produits, fournisseurs réels...) ni les comptes
// utilisateurs. TRUNCATE ... CASCADE suit les FK vers ces tables précises (attachments, quotes,
// etc.) sans toucher aux tables hors de cette liste (aucune ne référence celles-ci en retour).
// RESTART IDENTITY : les numéros de demande/BC dérivent de l'id (numbering.js), donc repartent
// proprement de 0001 après un vidage.
async function clearTestData() {
  await run(`TRUNCATE TABLE
    purchase_requests, purchase_request_lines, quote_requests, quote_request_suppliers,
    quotes, approvals, purchase_orders, attachments, audit_log, notifications,
    stock_entries, stock_movements, product_prices
    RESTART IDENTITY CASCADE`);
}

module.exports = { loadSampleData, clearTestData };
