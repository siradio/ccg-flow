const { all, one, run, withTransaction } = require('../../db');
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

  const demo = await loadDashboardDemo(user);
  return { created: created.length, skipped, demo };
}

// ---------------------------------------------------------------------------------------------
// Données de démo pour le TABLEAU DE BORD DIRECTION (relevé stock du jour, production journalière,
// valeur de stock, RH). Génère ~90 jours d'historique par produit fini rattaché à une BU, pour que
// les cartes, les détails par produit ET les courbes d'évolution (12 semaines) soient remplis dès
// l'ouverture. Idempotent : relevés/production en upsert (1 ligne par produit et par jour), entrée
// initiale au grand livre dédupliquée par référence `DEMO-INIT-<produit>`, employés seulement si la
// table est vide. À vider avec clearTestData().
const DEMO_DAYS = 90;

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function noise(min, max) {
  return min + Math.random() * (max - min);
}

// Upsert groupé (par lots) d'une grille flux : rows = [dateISO, productId, quantite].
async function upsertGrid(tx, table, dateCol, rows, userId) {
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    slice.forEach((r, j) => {
      const b = j * 4;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 4})`);
      params.push(r[0], r[1], r[2], userId);
    });
    await tx.run(
      `INSERT INTO ${table} (${dateCol}, product_id, quantite, created_by, updated_by)
       VALUES ${values.join(',')}
       ON CONFLICT (${dateCol}, product_id)
       DO UPDATE SET quantite = EXCLUDED.quantite, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      params);
  }
  return rows.length;
}

// Pour une démo « toutes BU », chaque Business Unit doit avoir des produits finis : on complète
// celles qui en manquent avec des produits finis de démo (code `DEMO-PF-<bu>-<n>`, effaçables).
// Sans ça, une BU sans produit fini rattaché reste vide sur le dashboard.
const TARGET_PF_PER_BU = 4;
const DEMO_PF_SUFFIXES = ['500 g', '1 kg', 'Pack 6', 'Format familial', 'Sachet 250 g', 'Bouteille 1 L'];

async function ensureFinishedProductsPerBu() {
  const pfCat = (await one("SELECT id FROM product_categories WHERE code = 'produit_fini' ORDER BY id LIMIT 1"))
    || (await one('SELECT id FROM product_categories ORDER BY id LIMIT 1'));
  if (!pfCat) return 0; // pas de catégorie -> on ne peut pas créer de produit
  const bus = await all(
    `SELECT bu.id, bu.nom,
            (SELECT COUNT(*) FROM products p
             WHERE p.business_unit_id = bu.id AND p.actif = true
               AND p.type_article IS DISTINCT FROM 'matiere_premiere')::int AS nb
     FROM business_units bu ORDER BY bu.id`);
  let created = 0;
  for (const bu of bus) {
    for (let n = bu.nb + 1; n <= TARGET_PF_PER_BU; n++) {
      const code = `DEMO-PF-${bu.id}-${n}`;
      const suffix = DEMO_PF_SUFFIXES[(n - 1) % DEMO_PF_SUFFIXES.length];
      const cost = Math.round(noise(1500, 25000) / 100) * 100;
      const nomLisible = String(bu.nom || '').replace(/^BU\s+/i, '').trim() || 'Produit';
      const r = await run(
        `INSERT INTO products (code, designation, category_id, type_article, business_unit_id, unite, cout_standard, actif)
         VALUES ($1, $2, $3, 'produit_fini', $4, 'carton', $5, true)
         ON CONFLICT (code) DO NOTHING`,
        [code, `${nomLisible} ${suffix}`, pfCat.id, bu.id, cost]);
      if (r.rowCount > 0) created++;
    }
  }
  return created;
}

async function loadDashboardDemo(user) {
  // Complète chaque BU en produits finis pour que TOUTES les BU soient représentées.
  const produitsCrees = await ensureFinishedProductsPerBu();

  const products = await all(
    `SELECT p.id, p.business_unit_id AS bu, p.seuil_alerte_stock AS seuil,
            COALESCE(p.cout_moyen_pondere, p.cout_standard, p.prix_suggere_gnf) AS cost
     FROM products p
     WHERE p.actif = true AND p.type_article IS DISTINCT FROM 'matiere_premiere'
       AND p.business_unit_id IS NOT NULL`);
  if (!products.length) {
    return { produits: 0, produitsCrees, releves: 0, production: 0, note: "Aucune Business Unit dans le référentiel — créez au moins une BU pour alimenter le dashboard." };
  }
  const initType = await one("SELECT id FROM stock_movement_types WHERE code = 'stock_initial'");

  // Solde actuel du grand livre par produit (état avant seeding) : on ancre dessus pour que
  // l'écart relevé/théorique du jour reste petit et réaliste, quel que soit l'existant.
  const balMap = new Map((await all(
    'SELECT product_id, SUM(stock_actuel)::float AS qty FROM v_stock_balances GROUP BY product_id'
  )).map(r => [r.product_id, Number(r.qty)]));

  let releves = 0, production = 0, stockInitial = 0;

  await withTransaction(async (tx) => {
    for (const p of products) {
      // Valorisation : garantir un coût, sinon la valeur de stock du DG serait nulle.
      let cost = Number(p.cost);
      if (!cost || Number.isNaN(cost)) {
        cost = Math.round(noise(1500, 25000) / 100) * 100;
        await tx.run(
          `UPDATE products SET cout_standard = $1
           WHERE id = $2 AND cout_standard IS NULL AND cout_moyen_pondere IS NULL AND prix_suggere_gnf IS NULL`,
          [cost, p.id]);
      }

      // Niveau de stock CIBLE (= solde théorique visé). Entrée initiale au grand livre (dédupliquée)
      // pour porter le solde jusqu'à cette cible : jamais en dessous de l'existant (une entrée ne peut
      // qu'ajouter), d'où max(existant, ...). Le relevé du jour est ensuite calé sur cette cible.
      const existing = balMap.get(p.id) || 0;
      const ref = `DEMO-INIT-${p.id}`;
      const alreadyInit = await tx.one('SELECT 1 FROM stock_ledger WHERE reference = $1', [ref]);
      let target;
      if (alreadyInit || !initType) {
        target = existing > 0 ? existing : Math.round(noise(300, 2500));
      } else {
        target = Math.max(existing + Math.round(noise(80, 500)), Math.round(noise(300, 2500)));
        const openQ = Math.max(1, Math.round(target - existing));
        const hdr = await tx.one(
          `INSERT INTO stock_ledger (reference, date_mouvement, type_id, business_unit_id, statut, commentaire, created_by)
           VALUES ($1, $2, $3, $4, 'valide', 'Données de démo (stock initial)', $5) RETURNING id`,
          [ref, isoDaysAgo(DEMO_DAYS).toISOString().slice(0, 10), initType.id, p.bu, user.id]);
        await tx.run(
          `INSERT INTO stock_ledger_lines (movement_id, product_id, quantite, prix_unitaire, valeur)
           VALUES ($1, $2, $3, $4, $5)`,
          [hdr.id, p.id, openQ, cost, Math.round(openQ * cost)]);
        target = existing + openQ;
        stockInitial++;
      }

      const baseProd = Math.round(noise(40, 600)); // production journalière de référence
      const step = Math.max(5, Math.round(target * 0.03));

      const releveRows = [];
      const prodRows = [];
      let level = Math.max(1, Math.round(target * noise(0.9, 1.05)));
      for (let d = DEMO_DAYS; d >= 0; d--) {
        const day = isoDaysAgo(d);
        const dateStr = day.toISOString().slice(0, 10);
        // Production (flux) : tendance haussière douce + bruit, repos le dimanche.
        const trend = 1 + 0.20 * ((DEMO_DAYS - d) / DEMO_DAYS);
        const prodQ = day.getUTCDay() === 0 ? 0 : Math.max(0, Math.round(baseProd * trend * noise(0.7, 1.3)));
        prodRows.push([dateStr, p.id, prodQ]);
        // Relevé (niveau) : dérive lente ; le jour même est calé sur la cible -> écart réaliste (± ~5 %).
        level = d === 0
          ? Math.max(1, Math.round(target * noise(0.95, 1.03)))
          : Math.max(1, Math.round(level + noise(-step, step)));
        releveRows.push([dateStr, p.id, level]);
      }
      releves += await upsertGrid(tx, 'stock_entries', 'date_stock', releveRows, user.id);
      production += await upsertGrid(tx, 'production_entries', 'date_production', prodRows, user.id);
    }
  });

  const employes = await seedEmployeesIfEmpty();
  return { produits: products.length, produitsCrees, jours: DEMO_DAYS + 1, releves, production, stockInitial, employes };
}

// RH : quelques employés répartis par BU, avec date d'embauche étalée sur 24 mois (pour la courbe
// d'évolution RH) — seulement si la table est quasi vide, pour ne jamais écraser un RH réel.
const DEMO_PRENOMS = ['Mamadou', 'Fatoumata', 'Ibrahima', 'Aïssatou', 'Ousmane', 'Mariama', 'Alpha', 'Kadiatou', 'Sékou', 'Hadja', 'Thierno', 'Bineta', 'Amadou', 'Ramatoulaye', 'Boubacar', 'Djénabou'];
const DEMO_NOMS = ['Diallo', 'Barry', 'Bah', 'Sow', 'Camara', 'Touré', 'Keïta', 'Condé', 'Baldé', 'Sylla', 'Cissé', 'Kaba'];
const DEMO_POSTES = [['Production', 'Opérateur de production'], ['Production', 'Chef d\'équipe'], ['Logistique', 'Cariste'], ['Qualité', 'Contrôleur qualité'], ['Maintenance', 'Technicien de maintenance'], ['Commercial', 'Commercial'], ['Administration', 'Assistant administratif'], ['Finance', 'Comptable']];
const DEMO_CONTRATS = ['CDI', 'CDI', 'CDI', 'CDD', 'Journalier', 'Consultant'];

async function seedEmployeesIfEmpty() {
  const { c } = await one('SELECT COUNT(*)::int AS c FROM employees');
  if (c >= 5) return 0;
  const entity = await one('SELECT id FROM entities ORDER BY id LIMIT 1');
  if (!entity) return 0;
  const bus = await all('SELECT id FROM business_units ORDER BY id');
  const N = 30;
  const values = [];
  const params = [];
  for (let i = 0; i < N; i++) {
    const bu = bus.length ? bus[i % bus.length].id : null;
    const [dep, poste] = DEMO_POSTES[i % DEMO_POSTES.length];
    const emb = isoDaysAgo(Math.floor(noise(15, 730))).toISOString().slice(0, 10);
    const statut = i % 12 === 0 ? 'sorti' : (i % 15 === 0 ? 'inactif' : 'actif');
    const contrat = DEMO_CONTRATS[i % DEMO_CONTRATS.length];
    const salaire = Math.round(noise(1_500_000, 8_000_000) / 50_000) * 50_000;
    const b = i * 11;
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`);
    params.push(
      `DEMO-${String(1000 + i)}`,
      DEMO_NOMS[i % DEMO_NOMS.length],
      DEMO_PRENOMS[i % DEMO_PRENOMS.length],
      poste, dep, entity.id, bu, emb, contrat, statut, salaire);
  }
  await run(
    `INSERT INTO employees (matricule, nom, prenom, poste, departement, entity_id, business_unit_id, date_embauche, type_contrat, statut, salaire_mensuel)
     VALUES ${values.join(',')}`, params);
  return N;
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
    stock_entries, stock_movements, production_entries, product_prices
    RESTART IDENTITY CASCADE`);
  // Données de démo dashboard ciblées (jamais les référentiels ni le grand livre réel) :
  // entrées initiales de stock et employés générés, repérés par leur préfixe.
  await run("DELETE FROM stock_ledger WHERE reference LIKE 'DEMO-%'"); // lignes en cascade
  await run("DELETE FROM employees WHERE matricule LIKE 'DEMO-%'");
  await run("DELETE FROM products WHERE code LIKE 'DEMO-PF-%'"); // produits finis de démo créés par BU
}

module.exports = { loadSampleData, clearTestData, loadDashboardDemo };
