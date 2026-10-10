// Test unitaire PUR (sans base de données) de la logique de « reprise intelligente » du workflow
// des bons de commande commerciaux : la signature de contenu d'une étape ne doit changer QUE si un
// élément de son périmètre change. C'est ce qui permet de reporter automatiquement une étape déjà
// validée dont rien d'important n'a bougé, et de re-déclencher celles réellement impactées.
const test = require('node:test');
const assert = require('node:assert/strict');
const { signatureForStep } = require('../src/modules/commerce/commandes/commande.workflow');

const c = { beneficiaire_type: 'commercial', commercial_id: 5, grossiste_id: null, business_unit_id: 3, montant_total: 1000 };
const lines = [
  { product_id: 2, quantite: 4, prix_unitaire_fige: 100, business_unit_id: 3 },
  { product_id: 1, quantite: 2, prix_unitaire_fige: 50, business_unit_id: 7 },
];

test('signature stable et indépendante de l\'ordre des lignes', () => {
  assert.equal(
    signatureForStep('validation_resp_commercial', c, lines),
    signatureForStep('validation_resp_commercial', c, [...lines].reverse()));
});

test('responsable commercial : sensible au bénéficiaire et au prix', () => {
  const base = signatureForStep('validation_resp_commercial', c, lines);
  assert.notEqual(base, signatureForStep('validation_resp_commercial', { ...c, commercial_id: 9 }, lines));
  assert.notEqual(base, signatureForStep('validation_resp_commercial', c, lines.map(l => ({ ...l, prix_unitaire_fige: l.prix_unitaire_fige + 1 }))));
});

test('contrôle de gestion : change si le montant change', () => {
  assert.notEqual(
    signatureForStep('controle_gestion', c, lines),
    signatureForStep('controle_gestion', { ...c, montant_total: 2000 }, lines));
});

test('contrôle stock : insensible au prix, sensible à la quantité et à la BU', () => {
  const base = signatureForStep('controle_stock', c, lines);
  assert.equal(base, signatureForStep('controle_stock', c, lines.map(l => ({ ...l, prix_unitaire_fige: l.prix_unitaire_fige + 10 }))));
  assert.notEqual(base, signatureForStep('controle_stock', c, lines.map(l => ({ ...l, quantite: l.quantite + 1 }))));
  assert.notEqual(base, signatureForStep('controle_stock', c, lines.map(l => ({ ...l, business_unit_id: 99 }))));
});
