// Vérifie l'administration des utilisateurs : réservé au super_admin, désactivation, et fraîcheur
// des droits de module (même principe que la fraîcheur des BU testée dans e2e.stock.test.js) —
// SPEC.md §2.3, §2.5.
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

async function login(email, password = seeded.password) {
  return request(app).post('/api/auth/login').send({ email, password });
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

test('un utilisateur non super_admin ne peut pas administrer les autres comptes', async () => {
  const loginRes = await login('demandeur.sog@test');
  const token = loginRes.body.token;

  const listRes = await request(app).get('/api/users').set('Authorization', auth(token));
  assert.equal(listRes.status, 403);

  const grantRes = await request(app).post('/api/users/1/modules')
    .set('Authorization', auth(token))
    .send({ module_key: 'kpi' });
  assert.equal(grantRes.status, 403);
});

test("l'octroi d'un module prend effet immédiatement, sans reconnexion (§2.5)", async () => {
  const adminLogin = await login('admin@test');
  const adminToken = adminLogin.body.token;
  const userId = await findUserId(adminToken, 'demandeur.sog@test');

  // Token émis AVANT l'octroi du module kpi.
  const staleLogin = await login('demandeur.sog@test');
  const staleToken = staleLogin.body.token;

  const beforeGrant = await request(app).get('/api/kpi/achats').set('Authorization', auth(staleToken));
  assert.equal(beforeGrant.status, 403, "le module kpi ne doit pas encore être accordé");

  await request(app).post(`/api/users/${userId}/modules`)
    .set('Authorization', auth(adminToken))
    .send({ module_key: 'kpi' });

  // Même token, sans reconnexion : doit maintenant fonctionner.
  const afterGrant = await request(app).get('/api/kpi/achats').set('Authorization', auth(staleToken));
  assert.equal(afterGrant.status, 200, "l'octroi doit être visible immédiatement avec le même token");
});

test('désactiver un compte bloque la connexion, réactiver la débloque', async () => {
  const adminLogin = await login('admin@test');
  const adminToken = adminLogin.body.token;
  const userId = await findUserId(adminToken, 'rh.sog@test');

  const beforeDeactivate = await login('rh.sog@test');
  assert.equal(beforeDeactivate.status, 200, 'la connexion doit fonctionner avant désactivation');

  const deactivateRes = await request(app).put(`/api/users/${userId}`)
    .set('Authorization', auth(adminToken))
    .send({ actif: false });
  assert.equal(deactivateRes.status, 200, JSON.stringify(deactivateRes.body));

  const afterDeactivate = await login('rh.sog@test');
  assert.equal(afterDeactivate.status, 401, 'la connexion doit être refusée une fois le compte désactivé');

  const reactivateRes = await request(app).put(`/api/users/${userId}`)
    .set('Authorization', auth(adminToken))
    .send({ actif: true });
  assert.equal(reactivateRes.status, 200);

  const afterReactivate = await login('rh.sog@test');
  assert.equal(afterReactivate.status, 200, 'la connexion doit refonctionner après réactivation');
});

test('un token émis avant désactivation cesse de fonctionner immédiatement (pas seulement au prochain login)', async () => {
  const adminLogin = await login('admin@test');
  const adminToken = adminLogin.body.token;
  const userId = await findUserId(adminToken, 'rh.sog@test');

  const activeLogin = await login('rh.sog@test');
  assert.equal(activeLogin.status, 200);
  const activeToken = activeLogin.body.token;

  const beforeDeactivate = await request(app).get('/api/auth/me').set('Authorization', auth(activeToken));
  assert.equal(beforeDeactivate.status, 200);

  await request(app).put(`/api/users/${userId}`).set('Authorization', auth(adminToken)).send({ actif: false });

  const afterDeactivate = await request(app).get('/api/auth/me').set('Authorization', auth(activeToken));
  assert.equal(afterDeactivate.status, 401, 'le token déjà émis doit être rejeté dès la prochaine requête, sans attendre son expiration');

  // Remise en état pour ne pas affecter d'éventuels tests suivants dans ce fichier.
  await request(app).put(`/api/users/${userId}`).set('Authorization', auth(adminToken)).send({ actif: true });
});
