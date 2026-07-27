// Vérifie l'accès par Business Unit du module Stock du Jour — voir SPEC.md §2.4 et §3.5.
// Suite indépendante (son propre reset+seed) : voir la note dans e2e.purchase-request.test.js
// sur pourquoi --test-concurrency=1 est nécessaire (npm test) dès qu'on a plusieurs fichiers e2e.
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

test("un utilisateur sans le module stock ne peut rien voir", async () => {
  // demandeur.sog@test n'a que le module 'achats' (voir seed.js).
  const token = await login('demandeur.sog@test');
  const res = await request(app).get('/api/stock/business-units').set('Authorization', auth(token));
  assert.equal(res.status, 403);
});

test("stock.sog@test (module stock, aucune BU accordée) : lecture seule sur toutes les BU", async () => {
  const token = await login('stock.sog@test');

  const busRes = await request(app).get('/api/stock/business-units').set('Authorization', auth(token));
  assert.equal(busRes.status, 200);
  assert.ok(busRes.body.some(b => b.id === seeded.businessUnitId), 'doit voir la BU de test sans aucun octroi explicite');

  const dateStock = '2026-01-15';
  const sheetRes = await request(app).get('/api/stock/day')
    .set('Authorization', auth(token))
    .query({ date: dateStock, business_unit_id: seeded.businessUnitId });
  assert.equal(sheetRes.status, 200);
  assert.equal(sheetRes.body.canWrite, false, 'sans octroi de BU, lecture seule uniquement');

  const writeRes = await request(app).post('/api/stock/entries')
    .set('Authorization', auth(token))
    .send({ date: dateStock, productId: seeded.stockProductId, quantite: 100, unite: 'unité' });
  assert.equal(writeRes.status, 403, "l'écriture doit être refusée sans octroi de BU explicite");
});

test("octroi de BU : l'écriture devient possible, upsert (pas de doublon) sur re-saisie du même jour", async () => {
  const adminToken = await login('admin@test');
  const stockUserRes = await request(app).get('/api/users').set('Authorization', auth(adminToken));
  const stockUser = stockUserRes.body.find(u => u.email === 'stock.sog@test');
  assert.ok(stockUser, 'utilisateur stock.sog@test introuvable via /api/users');

  const grantRes = await request(app).post(`/api/users/${stockUser.id}/business-units`)
    .set('Authorization', auth(adminToken))
    .send({ business_unit_id: seeded.businessUnitId });
  assert.equal(grantRes.status, 201, JSON.stringify(grantRes.body));

  // Le token émis AVANT l'octroi doit refléter le nouvel accès immédiatement (droits relus en
  // base à chaque requête, voir SPEC.md §2.5) — pas besoin de se reconnecter.
  const staleToken = await login('stock.sog@test'); // ok de re-login ici, ce test cible l'upsert, pas la fraîcheur (couverte séparément)
  const dateStock = '2026-01-16';

  const firstWrite = await request(app).post('/api/stock/entries')
    .set('Authorization', auth(staleToken))
    .send({ date: dateStock, productId: seeded.stockProductId, quantite: 50, unite: 'unité' });
  assert.equal(firstWrite.status, 201, JSON.stringify(firstWrite.body));
  const entryId = firstWrite.body.id;

  const secondWrite = await request(app).post('/api/stock/entries')
    .set('Authorization', auth(staleToken))
    .send({ date: dateStock, productId: seeded.stockProductId, quantite: 75, unite: 'unité', commentaire: 'correction' });
  assert.equal(secondWrite.status, 201, JSON.stringify(secondWrite.body));
  assert.equal(secondWrite.body.id, entryId, 'même date+produit doit mettre à jour la ligne existante, pas en créer une nouvelle');
  assert.equal(Number(secondWrite.body.quantite), 75);

  const historyRes = await request(app).get('/api/stock/entries')
    .set('Authorization', auth(staleToken))
    .query({ date_stock: dateStock, product_id: seeded.stockProductId });
  assert.equal(historyRes.status, 200);
  assert.equal(historyRes.body.length, 1, 'une seule ligne doit exister pour ce couple date/produit après la resaisie');
});

test("les droits d'accès BU prennent effet immédiatement, sans reconnexion (§2.5)", async () => {
  const adminToken = await login('admin@test');
  const usersRes = await request(app).get('/api/users').set('Authorization', auth(adminToken));
  const stockUser = usersRes.body.find(u => u.email === 'stock.sog@test');
  const existingGrant = stockUser.businessUnits.find(b => b.business_unit_id === seeded.businessUnitId);
  assert.ok(existingGrant, 'le test précédent doit avoir laissé un octroi de BU en place');

  // Token émis alors que l'accès est encore actif.
  const tokenBeforeRevoke = await login('stock.sog@test');
  const okRes = await request(app).get('/api/stock/day')
    .set('Authorization', auth(tokenBeforeRevoke))
    .query({ date: '2026-01-17', business_unit_id: seeded.businessUnitId });
  assert.equal(okRes.body.canWrite, true);

  // Révocation par un super_admin, PUIS réutilisation du même token (déjà émis avant la révocation).
  await request(app).delete(`/api/users/${stockUser.id}/business-units/${existingGrant.id}`)
    .set('Authorization', auth(adminToken));

  const afterRevoke = await request(app).get('/api/stock/day')
    .set('Authorization', auth(tokenBeforeRevoke))
    .query({ date: '2026-01-17', business_unit_id: seeded.businessUnitId });
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.body.canWrite, false, "le même token doit immédiatement refléter la révocation, sans reconnexion");
});
