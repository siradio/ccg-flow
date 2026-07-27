// Vérifie les 3 niveaux d'accès du module Prix (consultation < ajout < edition) — SPEC.md §2.6/§3.8.
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

async function findUserId(adminToken, email) {
  const res = await request(app).get('/api/users').set('Authorization', auth(adminToken));
  const user = res.body.find(u => u.email === email);
  assert.ok(user, `utilisateur ${email} introuvable`);
  return user.id;
}

test("sans le module 'prix', tout accès est refusé", async () => {
  // direction@test n'a que le module 'kpi' (voir seed.js).
  const token = await login('direction@test');
  const res = await request(app).get('/api/prices/history').set('Authorization', auth(token));
  assert.equal(res.status, 403);
});

test('niveau consultation (défaut dès que le module est accordé) : lecture ok, écriture refusée', async () => {
  const adminToken = await login('admin@test');
  const userId = await findUserId(adminToken, 'direction@test');
  await request(app).post(`/api/users/${userId}/modules`).set('Authorization', auth(adminToken)).send({ module_key: 'prix' });

  const token = await login('direction@test');

  const readRes = await request(app).get('/api/prices/history').set('Authorization', auth(token));
  assert.equal(readRes.status, 200);

  const writeRes = await request(app).post('/api/prices')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, prix: 1000, dateEffet: '2026-01-01' });
  assert.equal(writeRes.status, 403, "niveau consultation (défaut) ne doit pas pouvoir ajouter un prix");
});

test("niveau 'ajout' : peut ajouter un nouveau prix, mais pas corriger/supprimer", async () => {
  const adminToken = await login('admin@test');
  const userId = await findUserId(adminToken, 'direction@test');
  const setNiveauRes = await request(app).put(`/api/users/${userId}/prix-niveau`)
    .set('Authorization', auth(adminToken))
    .send({ niveau: 'ajout' });
  assert.equal(setNiveauRes.status, 200, JSON.stringify(setNiveauRes.body));
  assert.equal(setNiveauRes.body.prixNiveau, 'ajout');

  const token = await login('direction@test');
  const addRes = await request(app).post('/api/prices')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, prix: 1500, dateEffet: '2026-01-02', commentaire: 'premier prix' });
  assert.equal(addRes.status, 201, JSON.stringify(addRes.body));
  const priceId = addRes.body.id;

  const editRes = await request(app).put(`/api/prices/${priceId}`)
    .set('Authorization', auth(token))
    .send({ prix: 9999 });
  assert.equal(editRes.status, 403, "niveau ajout ne doit pas pouvoir corriger une ligne existante");

  const deleteRes = await request(app).delete(`/api/prices/${priceId}`).set('Authorization', auth(token));
  assert.equal(deleteRes.status, 403, "niveau ajout ne doit pas pouvoir supprimer une ligne existante");
});

test("niveau 'edition' : peut corriger et supprimer une ligne d'historique", async () => {
  const adminToken = await login('admin@test');
  const userId = await findUserId(adminToken, 'direction@test');
  await request(app).put(`/api/users/${userId}/prix-niveau`).set('Authorization', auth(adminToken)).send({ niveau: 'edition' });

  const token = await login('direction@test');
  const addRes = await request(app).post('/api/prices')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, prix: 2000, dateEffet: '2026-01-03' });
  assert.equal(addRes.status, 201);
  const priceId = addRes.body.id;

  const editRes = await request(app).put(`/api/prices/${priceId}`)
    .set('Authorization', auth(token))
    .send({ prix: 2500, commentaire: 'correction' });
  assert.equal(editRes.status, 200, JSON.stringify(editRes.body));
  assert.equal(Number(editRes.body.prix), 2500);

  const deleteRes = await request(app).delete(`/api/prices/${priceId}`).set('Authorization', auth(token));
  assert.equal(deleteRes.status, 200);

  const historyRes = await request(app).get('/api/prices/history')
    .set('Authorization', auth(token))
    .query({ product_id: seeded.stockProductId });
  assert.ok(!historyRes.body.some(p => p.id === priceId), 'la ligne supprimée ne doit plus apparaître dans l\'historique');
});

test("l'ajout de prix ne fait jamais d'upsert : deux ajouts le même jour créent deux lignes distinctes", async () => {
  const adminToken = await login('admin@test');
  const token = await login('admin@test'); // super_admin = toujours niveau edition

  const first = await request(app).post('/api/prices')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, prix: 100, dateEffet: '2026-02-01', commentaire: 'premier' });
  assert.equal(first.status, 201);

  const second = await request(app).post('/api/prices')
    .set('Authorization', auth(token))
    .send({ productId: seeded.stockProductId, prix: 110, dateEffet: '2026-02-01', commentaire: 'correction même jour' });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.id, first.body.id, 'contrairement au stock, un second ajout le même jour doit créer une NOUVELLE ligne');

  const historyRes = await request(app).get('/api/prices/history')
    .set('Authorization', auth(adminToken))
    .query({ product_id: seeded.stockProductId, date_from: '2026-02-01', date_to: '2026-02-01' });
  assert.equal(historyRes.body.length, 2, 'les deux lignes doivent coexister (journal, pas un relevé)');
});
