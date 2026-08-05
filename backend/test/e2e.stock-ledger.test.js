// Refonte Stock — vérifie le cœur du nouveau module : grand livre de mouvements comme source de
// vérité, solde DÉRIVÉ (entrées − sorties), quantité toujours positive, workflow de validation.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { resetDatabase } = require('./helpers/resetDb');
const { seed } = require('../seed');
const { app } = require('../src/server');
const { pool } = require('../src/db');

let seeded;
let typeEntree;
let typeSortie;
let typeDon;
let locationId;

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
const auth = token => `Bearer ${token}`;

async function balance(token, productId, locId) {
  const res = await request(app).get('/api/stock-actuel').set('Authorization', auth(token)).query({ product_id: productId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = res.body.find(r => r.location_id === locId);
  return row ? Number(row.stock_actuel) : 0;
}

test('sans le sous-module stock, aucun accès aux mouvements', async () => {
  const token = await login('demandeur.sog@test');
  const res = await request(app).get('/api/stock-mouvements').set('Authorization', auth(token));
  assert.equal(res.status, 403);
});

test('les 24 types de mouvement sont seedés avec leur sens', async () => {
  const token = await login('admin@test');
  const res = await request(app).get('/api/stock-movement-types').set('Authorization', auth(token));
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 24, `attendu >= 24 types, reçu ${res.body.length}`);
  typeEntree = res.body.find(t => t.code === 'entree');
  typeSortie = res.body.find(t => t.code === 'sortie');
  typeDon = res.body.find(t => t.code === 'don');
  assert.equal(typeEntree.sens, 'entree');
  assert.equal(typeSortie.sens, 'sortie');
  assert.equal(typeDon.requiert_validation, true, 'le don nécessite une validation');
});

test('une localisation peut être créée', async () => {
  const token = await login('admin@test');
  const res = await request(app).post('/api/stock-locations').set('Authorization', auth(token))
    .send({ code: 'TEST-ENT', nom: 'Entrepôt Test', type: 'entrepot', business_unit_id: seeded.businessUnitId, actif: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  locationId = res.body.id;
});

test('entrée + sortie → le solde se dérive (100 − 30 = 70) ; quantité négative refusée', async () => {
  const token = await login('admin@test');
  const base = { business_unit_id: seeded.businessUnitId, location_id: locationId, product_id: seeded.stockProductId };

  const entree = await request(app).post('/api/stock-mouvements').set('Authorization', auth(token))
    .send({ ...base, type_id: typeEntree.id, quantite: 100, prix_unitaire: 1000 });
  assert.equal(entree.status, 201, JSON.stringify(entree.body));
  assert.match(entree.body.reference, /^MV-\d{5}$/);

  const sortie = await request(app).post('/api/stock-mouvements').set('Authorization', auth(token))
    .send({ ...base, type_id: typeSortie.id, quantite: 30 });
  assert.equal(sortie.status, 201);

  assert.equal(await balance(token, seeded.stockProductId, locationId), 70, 'solde dérivé attendu 70');

  const negatif = await request(app).post('/api/stock-mouvements').set('Authorization', auth(token))
    .send({ ...base, type_id: typeSortie.id, quantite: -5 });
  assert.equal(negatif.status, 400, 'une quantité négative doit être refusée');
});

test('workflow : un type « nécessite validation » reste hors solde jusqu\'à validation', async () => {
  const token = await login('admin@test');
  const base = { business_unit_id: seeded.businessUnitId, location_id: locationId, product_id: seeded.stockProductId };

  const don = await request(app).post('/api/stock-mouvements').set('Authorization', auth(token))
    .send({ ...base, type_id: typeDon.id, quantite: 20 });
  assert.equal(don.status, 201);
  assert.equal(don.body.statut, 'a_valider', 'le don doit être créé en attente de validation');

  // Hors solde tant qu'il n'est pas validé.
  assert.equal(await balance(token, seeded.stockProductId, locationId), 70, 'un mouvement à valider ne doit pas impacter le solde');

  const valide = await request(app).post(`/api/stock-mouvements/${don.body.id}/valider`).set('Authorization', auth(token)).send({});
  assert.equal(valide.status, 200);
  assert.equal(valide.body.statut, 'valide');

  assert.equal(await balance(token, seeded.stockProductId, locationId), 50, 'après validation, le don (sortie 20) impacte le solde → 50');
});

test('un mouvement validé ne se supprime pas (405), il s\'annule', async () => {
  const token = await login('admin@test');
  const list = await request(app).get('/api/stock-mouvements').set('Authorization', auth(token)).query({ product_id: seeded.stockProductId });
  const m = list.body.find(x => x.statut === 'valide');
  const del = await request(app).delete(`/api/stock-mouvements/${m.id}`).set('Authorization', auth(token));
  assert.equal(del.status, 405);
  const annul = await request(app).post(`/api/stock-mouvements/${m.id}/annuler`).set('Authorization', auth(token)).send({});
  assert.equal(annul.status, 200);
  assert.equal(annul.body.statut, 'annule');
});
