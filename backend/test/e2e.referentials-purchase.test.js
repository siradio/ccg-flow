// Scénario de bout en bout : SAISIE DES RÉFÉRENTIELS (catégorie, site, fournisseurs, produit) via
// l'API, puis DEMANDE D'ACHAT complète s'appuyant sur ces référentiels fraîchement saisis —
// jusqu'à la génération du bon de commande (SPEC.md §2.3 pour l'écriture gatée par sous-module,
// §3 pour le circuit d'achat).
//
// IMPORTANT : base dédiée (.env.test) uniquement — ce test fait un DROP SCHEMA CASCADE. On force
// NODE_ENV=test avant tout require (cf. e2e.purchase-request.test.js).
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { resetDatabase } = require('./helpers/resetDb');
const { seed } = require('../seed');
const { app } = require('../src/server');
const { pool } = require('../src/db');

let seeded;

test.before(async () => {
  await resetDatabase();
  seeded = await seed({ closePool: false });
});

test.after(async () => {
  await pool.end();
});

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: seeded.password });
  assert.equal(res.status, 200, `login échoué pour ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

function auth(token) {
  return `Bearer ${token}`;
}

// Crée un jeu complet de référentiels rattachés à Soguipal via l'API (super_admin), avec des codes
// uniques (`tag`) pour que chaque test parte de données neuves sans collision d'unicité.
async function createReferentials(adminToken, tag) {
  const { soguipal } = seeded.entities;
  const A = auth(adminToken);

  const catRes = await request(app).post('/api/product-categories')
    .set('Authorization', A).send({ code: `CAT-${tag}`, nom: `Catégorie ${tag}` });
  assert.equal(catRes.status, 201, JSON.stringify(catRes.body));

  const siteRes = await request(app).post('/api/sites')
    .set('Authorization', A)
    .send({ entity_id: soguipal.id, nom: `Entrepôt ${tag}`, adresse: 'Zone industrielle', ville: 'Conakry' });
  assert.equal(siteRes.status, 201, JSON.stringify(siteRes.body));
  assert.equal(siteRes.body.entity_id, soguipal.id);

  const supplierIds = [];
  for (const s of ['A', 'B']) {
    const supRes = await request(app).post('/api/suppliers')
      .set('Authorization', A)
      .send({
        nom: `Fournisseur ${tag}-${s}`, code: `FRN-${tag}-${s}`, origine: 'Local', pays: 'Guinée',
        contact_email: `contact.${tag}.${s}@example.test`, categorie: 'Emballage',
        entity_ids: [soguipal.id],
      });
    assert.equal(supRes.status, 201, JSON.stringify(supRes.body));
    assert.ok((supRes.body.entity_ids || []).includes(soguipal.id), 'le fournisseur doit être rattaché à Soguipal');
    supplierIds.push(supRes.body.id);
  }

  const prodRes = await request(app).post('/api/products')
    .set('Authorization', A)
    .send({
      code: `PRD-${tag}`, designation: `Produit ${tag}`, category_id: catRes.body.id,
      unite: 'unité', entity_ids: [soguipal.id],
    });
  assert.equal(prodRes.status, 201, JSON.stringify(prodRes.body));

  return { categoryId: catRes.body.id, siteId: siteRes.body.id, supplierIds, productId: prodRes.body.id };
}

test('saisie référentiel : écriture réservée aux administrateurs et données retrouvables', async () => {
  const { soguipal } = seeded.entities;
  const adminToken = await login('admin@test');
  const demandeurToken = await login('demandeur.sog@test');

  // Un simple demandeur (aucun droit d'écriture sur les référentiels) ne peut pas créer.
  const forbidden = await request(app).post('/api/suppliers')
    .set('Authorization', auth(demandeurToken))
    .send({ nom: 'Fournisseur pirate', entity_ids: [soguipal.id] });
  assert.equal(forbidden.status, 403, 'un demandeur ne doit pas pouvoir créer un fournisseur');

  // Le super_admin saisit le jeu complet.
  const ref = await createReferentials(adminToken, 'SAISIE');

  // Tout est retrouvable via les endpoints de lecture (ouverts à tout utilisateur authentifié).
  const cats = await request(app).get('/api/product-categories').set('Authorization', auth(demandeurToken));
  assert.ok(cats.body.some(c => c.id === ref.categoryId), 'la catégorie créée doit être listée');

  const sites = await request(app).get('/api/sites').set('Authorization', auth(demandeurToken)).query({ entity_id: soguipal.id });
  assert.ok(sites.body.some(s => s.id === ref.siteId), 'le site créé doit apparaître pour Soguipal');

  const suppliers = await request(app).get('/api/suppliers').set('Authorization', auth(demandeurToken));
  for (const id of ref.supplierIds) {
    assert.ok(suppliers.body.some(s => s.id === id), `le fournisseur ${id} doit être listé`);
  }

  const products = await request(app).get('/api/products').set('Authorization', auth(demandeurToken)).query({ entity_id: soguipal.id });
  assert.ok(products.body.some(p => p.id === ref.productId), 'le produit créé doit apparaître pour Soguipal');
});

test('demande d\'achat de bout en bout sur des référentiels fraîchement saisis', async () => {
  const { soguipal } = seeded.entities;
  const adminToken = await login('admin@test');
  const demandeurToken = await login('demandeur.sog@test');
  const achatToken = await login('achat.sog@test');
  const cgToken = await login('cg.sog@test');
  const financesToken = await login('finances.sog@test');
  const dgaToken = await login('dga.sog@test');

  // 1) Saisie des référentiels (site + produit + 2 fournisseurs, tous sur Soguipal).
  const ref = await createReferentials(adminToken, 'ACHAT');

  // 2) Création de la demande sur le site créé, avec une ligne portant le produit créé.
  const createRes = await request(app).post('/api/purchase-requests')
    .set('Authorization', auth(demandeurToken))
    .send({ entityId: soguipal.id, siteId: ref.siteId, objet: 'Réapprovisionnement emballages', justification: 'Rupture imminente', devise: 'GNF' });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
  const prId = createRes.body.id;

  const detail = await request(app).get(`/api/purchase-requests/${prId}`).set('Authorization', auth(demandeurToken));
  assert.equal(detail.body.site_id, ref.siteId, 'la demande doit référencer le site saisi');

  const lineRes = await request(app).post(`/api/purchase-requests/${prId}/lines`)
    .set('Authorization', auth(demandeurToken))
    .send({ productId: ref.productId, quantite: 300, unite: 'unité' });
  assert.equal(lineRes.status, 201, JSON.stringify(lineRes.body));

  // 3) Expression de besoin : soumission puis validation par le validateur du besoin.
  const submitRes = await request(app).post(`/api/purchase-requests/${prId}/submit`).set('Authorization', auth(demandeurToken));
  assert.equal(submitRes.body.status, 'en_attente_validation_besoin');
  const besoinRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`).set('Authorization', auth(dgaToken)).send({});
  assert.equal(besoinRes.body.status, 'soumise');

  // 4) Demande de devis aux 2 fournisseurs saisis (min_suppliers_devis = 2 par défaut).
  const qrRes = await request(app).post(`/api/purchase-requests/${prId}/quote-requests`)
    .set('Authorization', auth(achatToken))
    .send({ supplierIds: ref.supplierIds, message: 'Merci de nous transmettre votre meilleure offre.' });
  assert.equal(qrRes.status, 201, JSON.stringify(qrRes.body));
  const qrId = qrRes.body.id;

  const sendRes = await request(app).post(`/api/purchase-requests/${prId}/quote-requests/${qrId}/send`).set('Authorization', auth(achatToken));
  assert.equal(sendRes.status, 200, JSON.stringify(sendRes.body));
  assert.ok(sendRes.body.every(r => r.sent), 'les demandes de devis doivent partir aux 2 fournisseurs');

  // 5) Saisie des devis reçus (le 2e est le moins-disant) et sélection du moins cher.
  const full = await request(app).get(`/api/purchase-requests/${prId}`).set('Authorization', auth(achatToken));
  const qrSuppliers = full.body.quote_requests.find(q => q.id === qrId).suppliers;
  assert.equal(qrSuppliers.length, 2);

  const montants = [12_000_000, 9_500_000];
  const quoteIds = [];
  for (let i = 0; i < qrSuppliers.length; i++) {
    const qRes = await request(app).post(`/api/purchase-requests/${prId}/quotes`)
      .set('Authorization', auth(achatToken))
      .send({ quoteRequestSupplierId: qrSuppliers[i].id, montant: montants[i], devise: 'GNF' });
    assert.equal(qRes.status, 201, JSON.stringify(qRes.body));
    quoteIds.push(qRes.body.id);
  }

  const cheapestIdx = montants[0] <= montants[1] ? 0 : 1;
  const selectRes = await request(app).post(`/api/purchase-requests/${prId}/quotes/${quoteIds[cheapestIdx]}/select`).set('Authorization', auth(achatToken));
  assert.equal(selectRes.status, 200, JSON.stringify(selectRes.body));
  assert.equal(Number(selectRes.body.montant_final), 9_500_000);
  // La ligne doit pointer sur l'un des fournisseurs saisis.
  const retenu = selectRes.body.lines[0].fournisseur_retenu_id;
  assert.ok(ref.supplierIds.includes(retenu), 'le fournisseur retenu doit être un fournisseur fraîchement saisi');

  // 6) Validation en cascade : service achat -> contrôle de gestion -> finances -> bon de commande.
  const vAchat = await request(app).post(`/api/purchase-requests/${prId}/validate-step`).set('Authorization', auth(achatToken)).send({});
  assert.equal(vAchat.body.current_step_code, 'controle_gestion');
  const vCg = await request(app).post(`/api/purchase-requests/${prId}/validate-step`).set('Authorization', auth(cgToken)).send({});
  assert.equal(vCg.body.current_step_code, 'finances');
  const vFin = await request(app).post(`/api/purchase-requests/${prId}/validate-step`).set('Authorization', auth(financesToken)).send({});
  assert.equal(vFin.body.status, 'bon_commande_genere');
  assert.ok(vFin.body.purchase_order, 'un bon de commande doit être généré');

  // 7) Le bon de commande reflète le référentiel et le montant retenus.
  const poId = vFin.body.purchase_order.id;
  const poRes = await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', auth(financesToken));
  assert.equal(poRes.status, 200);
  assert.equal(Number(poRes.body.montant), 9_500_000);
  assert.match(poRes.body.numero, /^BC-SOGUIPAL-/);
});
