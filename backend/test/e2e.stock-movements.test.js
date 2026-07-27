// Vérifie les bases du module Mouvement Stock (§3.9 SPEC.md — base posée, pas finalisé) :
// mêmes droits d'accès par Business Unit que Stock du Jour, journal append-only.
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

test("sans le module stock, aucun accès aux mouvements", async () => {
  const token = await login('demandeur.sog@test');
  const res = await request(app).get('/api/stock-movements').set('Authorization', auth(token));
  assert.equal(res.status, 403);
});

test("sans octroi de BU, écriture refusée ; avec octroi, un mouvement peut être créé et listé", async () => {
  const adminToken = await login('admin@test');
  const usersRes = await request(app).get('/api/users').set('Authorization', auth(adminToken));
  const stockUser = usersRes.body.find(u => u.email === 'stock.sog@test');

  const tokenBefore = await login('stock.sog@test');
  const refusedRes = await request(app).post('/api/stock-movements')
    .set('Authorization', auth(tokenBefore))
    .send({ productId: seeded.stockProductId, typeMouvement: 'entree', quantite: 20, dateMouvement: '2026-03-01' });
  assert.equal(refusedRes.status, 403, "sans octroi de BU, l'écriture doit être refusée");

  await request(app).post(`/api/users/${stockUser.id}/business-units`)
    .set('Authorization', auth(adminToken))
    .send({ business_unit_id: seeded.businessUnitId });

  const addRes = await request(app).post('/api/stock-movements')
    .set('Authorization', auth(tokenBefore))
    .send({
      productId: seeded.stockProductId, typeMouvement: 'entree', quantite: 20,
      dateMouvement: '2026-03-01', motif: 'Réception fournisseur', referenceDocument: 'BC-TEST-0001',
    });
  assert.equal(addRes.status, 201, JSON.stringify(addRes.body));
  assert.equal(addRes.body.type_mouvement, 'entree');

  const listRes = await request(app).get('/api/stock-movements')
    .set('Authorization', auth(tokenBefore))
    .query({ product_id: seeded.stockProductId });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].reference_document, 'BC-TEST-0001');
});

test("deux mouvements le même jour pour le même produit coexistent (journal, pas un relevé)", async () => {
  const token = await login('stock.sog@test'); // déjà accordé sur la BU de test par le test précédent

  const first = await request(app).post('/api/stock-movements')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, typeMouvement: 'entree', quantite: 10, dateMouvement: '2026-03-02' });
  assert.equal(first.status, 201);

  const second = await request(app).post('/api/stock-movements')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, typeMouvement: 'sortie', quantite: 4, dateMouvement: '2026-03-02', motif: 'Livraison client' });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.id, first.body.id);

  const listRes = await request(app).get('/api/stock-movements')
    .set('Authorization', auth(token))
    .query({ product_id: seeded.stockProductId, date_from: '2026-03-02', date_to: '2026-03-02' });
  assert.equal(listRes.body.length, 2, 'entrée et sortie du même jour doivent coexister comme deux lignes distinctes');
});

test('quantite négative ou nulle refusée, type_mouvement invalide refusé', async () => {
  const token = await login('stock.sog@test');

  const negativeRes = await request(app).post('/api/stock-movements')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, typeMouvement: 'entree', quantite: -5, dateMouvement: '2026-03-03' });
  assert.equal(negativeRes.status, 400);

  const badTypeRes = await request(app).post('/api/stock-movements')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, typeMouvement: 'transfert', quantite: 5, dateMouvement: '2026-03-03' });
  assert.equal(badTypeRes.status, 400);
});
