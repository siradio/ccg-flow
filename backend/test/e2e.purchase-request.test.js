// Scénario de vérification de bout en bout du module Demande d'achat — voir SPEC.md §7.
// Nécessite une base PostgreSQL de test accessible via DATABASE_URL (docker-compose up -d).
//
// IMPORTANT : doit tourner sur une base dédiée (.env.test), JAMAIS celle de développement —
// ce test fait un DROP SCHEMA CASCADE. On force NODE_ENV=test ici, avant tout autre require,
// pour que ça marche quel que soit le shell (la syntaxe "VAR=val commande" ne marche pas sous
// PowerShell/cmd.exe).
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

// Vérifie que les actions attendues apparaissent bien, dans cet ordre relatif, au sein de l'historique complet.
function assertSubsequenceInOrder(actions, expectedSubsequence) {
  let cursor = 0;
  for (const expected of expectedSubsequence) {
    const idx = actions.indexOf(expected, cursor);
    assert.ok(idx >= cursor, `Action "${expected}" absente ou hors ordre dans l'historique : ${JSON.stringify(actions)}`);
    cursor = idx + 1;
  }
}

// Soumet une demande ET fait valider l'expression de besoin par la DGA, pour obtenir directement
// une demande au statut "soumise" comme avant l'ajout de cette étape (§3.1bis SPEC.md) — le
// scénario de l'expression de besoin elle-même a son propre test dédié plus bas.
async function createFundedDraft(demandeurToken, entityId, productId) {
  const createRes = await request(app).post('/api/purchase-requests')
    .set('Authorization', auth(demandeurToken))
    .send({ entityId, objet: "Achat sacs d'emballage", justification: 'Stock bas' });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
  const prId = createRes.body.id;

  const lineRes = await request(app).post(`/api/purchase-requests/${prId}/lines`)
    .set('Authorization', auth(demandeurToken))
    .send({ productId, quantite: 500, unite: 'unité' });
  assert.equal(lineRes.status, 201, JSON.stringify(lineRes.body));

  const submitRes = await request(app).post(`/api/purchase-requests/${prId}/submit`)
    .set('Authorization', auth(demandeurToken));
  assert.equal(submitRes.status, 200, JSON.stringify(submitRes.body));
  assert.equal(submitRes.body.status, 'en_attente_validation_besoin');

  const dgaToken = await login('dga.sog@test');
  const validateBesoinRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(dgaToken)).send({});
  assert.equal(validateBesoinRes.status, 200, JSON.stringify(validateBesoinRes.body));
  assert.equal(validateBesoinRes.body.status, 'soumise');

  return prId;
}

async function runQuoteCycle(achatToken, prId, supplierIds, montants) {
  const qrRes = await request(app).post(`/api/purchase-requests/${prId}/quote-requests`)
    .set('Authorization', auth(achatToken))
    .send({ supplierIds, message: 'Merci de nous transmettre votre meilleure offre.' });
  assert.equal(qrRes.status, 201, JSON.stringify(qrRes.body));
  const qrId = qrRes.body.id;

  const sendRes = await request(app).post(`/api/purchase-requests/${prId}/quote-requests/${qrId}/send`)
    .set('Authorization', auth(achatToken));
  assert.equal(sendRes.status, 200, JSON.stringify(sendRes.body));
  assert.equal(sendRes.body.length, supplierIds.length);
  assert.ok(sendRes.body.every(r => r.sent), 'tous les envois de demande de devis doivent réussir');

  const detail = await request(app).get(`/api/purchase-requests/${prId}`).set('Authorization', auth(achatToken));
  const qrsList = detail.body.quote_requests.find(q => q.id === qrId).suppliers;
  assert.equal(qrsList.length, supplierIds.length);

  const quoteIds = [];
  for (let i = 0; i < qrsList.length; i++) {
    const quoteRes = await request(app).post(`/api/purchase-requests/${prId}/quotes`)
      .set('Authorization', auth(achatToken))
      .send({ quoteRequestSupplierId: qrsList[i].id, montant: montants[i], devise: 'GNF' });
    assert.equal(quoteRes.status, 201, JSON.stringify(quoteRes.body));
    quoteIds.push(quoteRes.body.id);
  }
  return quoteIds;
}

test('scénario nominal : création -> devis -> validations en cascade -> bon de commande', async () => {
  const { soguipal } = seeded.entities;
  const demandeurToken = await login('demandeur.sog@test');
  const achatToken = await login('achat.sog@test');
  const cgToken = await login('cg.sog@test');
  const financesToken = await login('finances.sog@test');

  const prId = await createFundedDraft(demandeurToken, soguipal.id, seeded.productId);
  const quoteIds = await runQuoteCycle(achatToken, prId, seeded.supplierIds, [50_000_000, 45_000_000]);

  // Le moins-disant (45M) est retenu.
  const selectRes = await request(app).post(`/api/purchase-requests/${prId}/quotes/${quoteIds[1]}/select`)
    .set('Authorization', auth(achatToken));
  assert.equal(selectRes.status, 200, JSON.stringify(selectRes.body));
  assert.equal(Number(selectRes.body.montant_final), 45_000_000);
  assert.ok(selectRes.body.lines.every(l => l.fournisseur_retenu_id === selectRes.body.lines[0].fournisseur_retenu_id));

  const validateAchatRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(achatToken)).send({});
  assert.equal(validateAchatRes.status, 200, JSON.stringify(validateAchatRes.body));
  assert.equal(validateAchatRes.body.current_step_code, 'controle_gestion');

  // Un demandeur ne peut pas valider l'étape Contrôle de Gestion.
  const forbidden = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(demandeurToken)).send({});
  assert.equal(forbidden.status, 403);

  const cgRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(cgToken)).send({});
  assert.equal(cgRes.status, 200, JSON.stringify(cgRes.body));
  assert.equal(cgRes.body.current_step_code, 'finances');

  // "finances" est désormais la dernière étape humaine du circuit (expression_besoin, la seule
  // étape côté DGA, est passée en tête) — sa validation enchaîne directement, en interne, sur
  // l'étape système "generation_bc", sans validation humaine supplémentaire à attendre.
  const financesRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(financesToken)).send({});
  assert.equal(financesRes.status, 200, JSON.stringify(financesRes.body));
  assert.equal(financesRes.body.status, 'bon_commande_genere');
  assert.ok(financesRes.body.purchase_order, 'un bon de commande doit être généré');

  const poId = financesRes.body.purchase_order.id;
  const poRes = await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', auth(financesToken));
  assert.equal(poRes.status, 200);
  assert.equal(Number(poRes.body.montant), 45_000_000);
  assert.match(poRes.body.numero, /^BC-SOGUIPAL-/);

  const pdfRes = await request(app).get(`/api/purchase-orders/${poId}/pdf`).set('Authorization', auth(financesToken));
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(Buffer.byteLength(pdfRes.body) > 100, 'le PDF du bon de commande ne doit pas être vide');

  const historyRes = await request(app).get(`/api/purchase-requests/${prId}/history`).set('Authorization', auth(achatToken));
  assert.equal(historyRes.status, 200);
  const actions = historyRes.body.map(h => h.action);
  assertSubsequenceInOrder(actions, [
    'create', 'submit', 'validation_besoin', 'quote_request_created', 'quote_request_sent', 'quote_selected',
    'validation_achat', 'validation_controle_gestion', 'validation_finances', 'bon_commande_genere',
  ]);
});

test("expression de besoin : validée par la DGA avant le service achat, refusable avec retour en brouillon", async () => {
  const { soguipal } = seeded.entities;
  const demandeurToken = await login('demandeur.sog@test');
  const achatToken = await login('achat.sog@test');
  const dgaToken = await login('dga.sog@test');

  const createRes = await request(app).post('/api/purchase-requests')
    .set('Authorization', auth(demandeurToken))
    .send({ entityId: soguipal.id, objet: 'Achat matériel bureau', justification: 'Renouvellement' });
  const prId = createRes.body.id;
  await request(app).post(`/api/purchase-requests/${prId}/lines`)
    .set('Authorization', auth(demandeurToken))
    .send({ productId: seeded.productId, quantite: 10, unite: 'unité' });

  const submitRes = await request(app).post(`/api/purchase-requests/${prId}/submit`)
    .set('Authorization', auth(demandeurToken));
  assert.equal(submitRes.status, 200, JSON.stringify(submitRes.body));
  assert.equal(submitRes.body.status, 'en_attente_validation_besoin');

  // Le service achat ne peut rien faire tant que l'expression de besoin n'est pas validée.
  const tooEarly = await request(app).post(`/api/purchase-requests/${prId}/quote-requests`)
    .set('Authorization', auth(achatToken)).send({ supplierIds: seeded.supplierIds });
  assert.equal(tooEarly.status, 400);

  // Un rôle demandeur ne peut pas valider l'expression de besoin.
  const forbidden = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(demandeurToken)).send({});
  assert.equal(forbidden.status, 403);

  // Refus sans commentaire bloqué.
  const rejectNoComment = await request(app).post(`/api/purchase-requests/${prId}/reject-step`)
    .set('Authorization', auth(dgaToken)).send({});
  assert.equal(rejectNoComment.status, 400);

  // Refus avec commentaire : retour en brouillon, jamais d'annulation définitive (§3.2 SPEC.md).
  const rejectRes = await request(app).post(`/api/purchase-requests/${prId}/reject-step`)
    .set('Authorization', auth(dgaToken)).send({ comment: 'Achat non prioritaire ce trimestre' });
  assert.equal(rejectRes.status, 200, JSON.stringify(rejectRes.body));
  assert.equal(rejectRes.body.status, 'brouillon');

  const notifRes = await request(app).get('/api/notifications').set('Authorization', auth(demandeurToken));
  assert.ok(
    notifRes.body.some(n => n.message.includes('Achat non prioritaire ce trimestre')),
    'le demandeur doit être notifié du motif de refus'
  );

  // Le demandeur resoumet : validée cette fois, le circuit reprend normalement (service achat notifié).
  const resubmitRes = await request(app).post(`/api/purchase-requests/${prId}/submit`)
    .set('Authorization', auth(demandeurToken));
  assert.equal(resubmitRes.body.status, 'en_attente_validation_besoin');

  const validateRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(dgaToken)).send({});
  assert.equal(validateRes.status, 200, JSON.stringify(validateRes.body));
  assert.equal(validateRes.body.status, 'soumise');

  const canActNow = await request(app).post(`/api/purchase-requests/${prId}/quote-requests`)
    .set('Authorization', auth(achatToken)).send({ supplierIds: seeded.supplierIds, message: 'Merci' });
  assert.equal(canActNow.status, 201, JSON.stringify(canActNow.body));
});

test('scénario de rejet : retour à l\'étape précédente, pas d\'annulation', async () => {
  const { soguipal } = seeded.entities;
  const demandeurToken = await login('demandeur.sog@test');
  const achatToken = await login('achat.sog@test');
  const cgToken = await login('cg.sog@test');

  const prId = await createFundedDraft(demandeurToken, soguipal.id, seeded.productId);
  const quoteIds = await runQuoteCycle(achatToken, prId, seeded.supplierIds, [50_000_000, 45_000_000]);
  await request(app).post(`/api/purchase-requests/${prId}/quotes/${quoteIds[1]}/select`).set('Authorization', auth(achatToken));
  await request(app).post(`/api/purchase-requests/${prId}/validate-step`).set('Authorization', auth(achatToken)).send({});

  const rejectNoComment = await request(app).post(`/api/purchase-requests/${prId}/reject-step`)
    .set('Authorization', auth(cgToken)).send({});
  assert.equal(rejectNoComment.status, 400, 'le refus sans commentaire doit être bloqué');

  const rejectRes = await request(app).post(`/api/purchase-requests/${prId}/reject-step`)
    .set('Authorization', auth(cgToken)).send({ comment: 'Prix trop élevé par rapport au marché' });
  assert.equal(rejectRes.status, 200, JSON.stringify(rejectRes.body));
  assert.equal(rejectRes.body.status, 'devis_selectionne', 'le workflow doit revenir en arrière, pas s\'annuler');
  assert.equal(rejectRes.body.current_step_code, 'validation_achat');
  assert.notEqual(rejectRes.body.status, 'rejetee');

  // Le service achat peut revalider directement (même devis) et le circuit reprend normalement.
  const revalidateRes = await request(app).post(`/api/purchase-requests/${prId}/validate-step`)
    .set('Authorization', auth(achatToken)).send({});
  assert.equal(revalidateRes.status, 200, JSON.stringify(revalidateRes.body));
  assert.equal(revalidateRes.body.current_step_code, 'controle_gestion');

  const historyRes = await request(app).get(`/api/purchase-requests/${prId}/history`).set('Authorization', auth(achatToken));
  const actions = historyRes.body.map(h => h.action);
  assert.ok(actions.includes('refus_controle_gestion'));
  assert.ok(actions.includes('retour_service_achat'));
});

test('isolation multi-entité : un rôle PBIC ne donne aucun accès aux demandes Soguipal', async () => {
  const { soguipal, pbic } = seeded.entities;
  const demandeurToken = await login('demandeur.sog@test');
  const adminToken = await login('admin@test');

  const prId = await createFundedDraft(demandeurToken, soguipal.id, seeded.productId);

  const newUserRes = await request(app).post('/api/users')
    .set('Authorization', auth(adminToken))
    .send({ nom: 'Test', prenom: 'PBIC', email: 'achat.pbic@test', password: seeded.password });
  assert.equal(newUserRes.status, 201, JSON.stringify(newUserRes.body));

  await request(app).post(`/api/users/${newUserRes.body.id}/roles`)
    .set('Authorization', auth(adminToken))
    .send({ entity_id: pbic.id, role_code: 'service_achat' });
  // Accès sous-module accordé explicitement : sans ça, le test vérifierait le gate de
  // sous-module (achats non accordé) plutôt que l'isolation par entité qu'il est censé prouver.
  const grantRes = await request(app).put(`/api/users/${newUserRes.body.id}/sub-modules/achats`)
    .set('Authorization', auth(adminToken))
    .send({ niveau: 'edition' });
  assert.equal(grantRes.status, 201, JSON.stringify(grantRes.body));

  const pbicToken = await login('achat.pbic@test');

  const listRes = await request(app).get('/api/purchase-requests').set('Authorization', auth(pbicToken)).query({ entityId: soguipal.id });
  assert.equal(listRes.status, 403, 'un utilisateur PBIC ne doit pas pouvoir lister les demandes Soguipal');

  const detailRes = await request(app).get(`/api/purchase-requests/${prId}`).set('Authorization', auth(pbicToken));
  assert.equal(detailRes.status, 403, 'un utilisateur PBIC ne doit pas pouvoir consulter une demande Soguipal');

  const actionRes = await request(app).post(`/api/purchase-requests/${prId}/quote-requests`)
    .set('Authorization', auth(pbicToken))
    .send({ supplierIds: seeded.supplierIds });
  assert.equal(actionRes.status, 403, 'un utilisateur PBIC ne doit pouvoir agir sur aucune demande Soguipal');
});
