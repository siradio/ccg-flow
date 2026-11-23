// Test unitaire PUR (sans base de données) du moteur de conformité QHSE — campagne TC01→TC12.
// Vérifie les règles métier documentées : « non détecté ≠ 0 », pas de conformité sans spécification
// applicable, priorité à la spécification la plus spécifique, et verdict global.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  specScore, mostSpecific, conformiteResultat, criteriaConformite, conformiteGlobale,
} = require('../src/modules/qhse/qhse.conformite');

const num = (valeur_num, spec) => conformiteResultat({ result_flag: 'numerique', valeur_num }, spec);

test('TC01 — résultat numérique dans [min, max] = conforme', () => {
  assert.equal(num(5, { seuil_min: 2, seuil_max: 8 }), 'conforme');
  assert.equal(num(2, { seuil_min: 2, seuil_max: 8 }), 'conforme'); // borne incluse
  assert.equal(num(8, { seuil_min: 2, seuil_max: 8 }), 'conforme'); // borne incluse
});

test('TC02 — résultat numérique au-dessus du max = non conforme', () => {
  assert.equal(num(9, { seuil_max: 8 }), 'non_conforme');
});

test('TC03 — résultat numérique sous le min = non conforme', () => {
  assert.equal(num(1, { seuil_min: 2 }), 'non_conforme');
});

test('TC04 — aucune spécification applicable = sans_spec (jamais conforme par défaut)', () => {
  assert.equal(num(5, null), 'sans_spec');
  assert.equal(num(5, { seuil_min: null, seuil_max: null }), 'sans_spec');
});

test('TC05 — « non détecté » avec un seuil max seul = conforme (clairement sous le max)', () => {
  const nd = { result_flag: 'non_detecte' };
  assert.equal(conformiteResultat(nd, { seuil_max: 10 }), 'conforme');
  assert.equal(conformiteResultat({ result_flag: 'inf_lq' }, { seuil_max: 10 }), 'conforme');
});

test('TC06 — « non détecté » avec un seuil min = en_attente (minimum non confirmable)', () => {
  assert.equal(conformiteResultat({ result_flag: 'non_detecte' }, { seuil_min: 2 }), 'en_attente');
  // min ET max présents : on ne peut pas confirmer le minimum -> en_attente
  assert.equal(conformiteResultat({ result_flag: 'non_detecte' }, { seuil_min: 2, seuil_max: 10 }), 'en_attente');
});

test('TC07 — résultat en_attente / invalide = en_attente (verdict non rendu)', () => {
  assert.equal(conformiteResultat({ result_flag: 'en_attente' }, { seuil_max: 8 }), 'en_attente');
  assert.equal(conformiteResultat({ result_flag: 'invalide' }, { seuil_max: 8 }), 'en_attente');
  // valeur numérique non saisie
  assert.equal(num('', { seuil_max: 8 }), 'en_attente');
  assert.equal(num(null, { seuil_max: 8 }), 'en_attente');
});

test('TC08 — verdict global : une seule non-conformité rend l’ensemble non conforme', () => {
  assert.equal(conformiteGlobale(['conforme', 'non_conforme', 'en_attente']), 'non_conforme');
});

test('TC09 — verdict global : en_attente > conforme ; tout sans_spec = sans_spec', () => {
  assert.equal(conformiteGlobale(['conforme', 'en_attente', 'conforme']), 'en_attente');
  assert.equal(conformiteGlobale(['conforme', 'conforme']), 'conforme');
  assert.equal(conformiteGlobale(['sans_spec', 'sans_spec']), 'sans_spec');
  assert.equal(conformiteGlobale([]), 'sans_spec');
});

test('TC10 — résolution : la spécification la plus spécifique l’emporte', () => {
  const famille = { id: 1, category_id: 3 };                 // score 2
  const produit = { id: 2, product_id: 1 };                  // score 4
  const produitFormat = { id: 3, product_id: 1, format_id: 2 }; // score 5
  assert.equal(specScore(produitFormat), 5);
  assert.equal(mostSpecific([famille, produit, produitFormat]).id, 3);
  assert.equal(mostSpecific([famille, produit]).id, 2);
  assert.equal(mostSpecific([famille]).id, 1);
  assert.equal(mostSpecific([]), null);
});

test('TC11 — critère de contrôle booléen : OUI conforme, NON non conforme, vide en_attente', () => {
  const crit = { type_critere: 'booleen' };
  assert.equal(criteriaConformite({ valeur_bool: 'true' }, crit), 'conforme');
  assert.equal(criteriaConformite({ valeur_bool: true }, crit), 'conforme');
  assert.equal(criteriaConformite({ valeur_bool: 'false' }, crit), 'non_conforme');
  assert.equal(criteriaConformite({ valeur_bool: '' }, crit), 'en_attente');
  assert.equal(criteriaConformite({ valeur_bool: 'true' }, null), 'en_attente'); // critère introuvable
});

test('TC12 — critère de contrôle numérique : seuils respectés/violés ; sans seuil = sans_spec', () => {
  const avecSeuils = { type_critere: 'numerique', seuil_min: 0, seuil_max: 4 };
  assert.equal(criteriaConformite({ valeur_num: 3 }, avecSeuils), 'conforme');
  assert.equal(criteriaConformite({ valeur_num: 5 }, avecSeuils), 'non_conforme');
  assert.equal(criteriaConformite({ valeur_num: 3 }, { type_critere: 'numerique' }), 'sans_spec');
  assert.equal(criteriaConformite({ valeur_num: '' }, avecSeuils), 'en_attente');
});
