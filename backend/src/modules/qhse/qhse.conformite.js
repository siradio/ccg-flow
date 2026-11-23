// Module QHSE — moteur de conformité PUR (sans base de données). Centralise les règles de verdict
// jusqu'ici dupliquées dans qhse.analyses / qhse.production / qhse.shipment, pour qu'elles soient
// testables unitairement (voir test/unit.qhse-conformite.test.js, TC01→TC12).
//
// Principes (documentés) : « non détecté / < LD / < LQ » ne valent JAMAIS 0 ; un résultat n'est
// conforme que si une spécification applicable existe (sinon « sans_spec ») ; la spécification la
// plus spécifique l'emporte (produit+format > produit > famille+format > famille > générique).

const boolOrNull = v => (v === '' || v == null ? null : (v === true || v === 'true'));

// Score de spécificité d'une spécification : produit (4) > famille (2) > format (1), cumulables.
function specScore(s) {
  return (s.product_id ? 4 : 0) + (s.category_id ? 2 : 0) + (s.format_id ? 1 : 0);
}

// Parmi des spécifications déjà filtrées comme applicables, retient la plus spécifique.
function mostSpecific(specs) {
  if (!specs || !specs.length) return null;
  return specs.slice().sort((a, b) => specScore(b) - specScore(a))[0];
}

// Conformité d'un résultat d'analyse vs sa spécification.
function conformiteResultat(result, spec) {
  const flag = result.result_flag || 'numerique';
  if (flag === 'en_attente' || flag === 'invalide') return 'en_attente';
  if (!spec) return 'sans_spec';
  const min = spec.seuil_min != null ? Number(spec.seuil_min) : null;
  const max = spec.seuil_max != null ? Number(spec.seuil_max) : null;
  if (flag === 'non_detecte' || flag === 'inf_ld' || flag === 'inf_lq') {
    if (max != null && min == null) return 'conforme';   // clairement sous le seuil max
    return 'en_attente';                                  // on ne peut pas confirmer un minimum
  }
  // numérique
  if (result.valeur_num == null || result.valeur_num === '') return 'en_attente';
  if (min == null && max == null) return 'sans_spec';
  const v = Number(result.valeur_num);
  const ok = (min == null || v >= min) && (max == null || v <= max);
  return ok ? 'conforme' : 'non_conforme';
}

// Conformité d'un point de contrôle (production / expédition) vs son critère paramétré.
// Booléen : OUI = conforme. Numérique : dans [min, max] si des seuils existent, sinon « sans_spec ».
function criteriaConformite(reading, criteria) {
  if (!criteria) return 'en_attente';
  if (criteria.type_critere === 'booleen') {
    const b = boolOrNull(reading.valeur_bool);
    if (b == null) return 'en_attente';
    return b ? 'conforme' : 'non_conforme';
  }
  if (reading.valeur_num == null || reading.valeur_num === '') return 'en_attente';
  const min = criteria.seuil_min != null ? Number(criteria.seuil_min) : null;
  const max = criteria.seuil_max != null ? Number(criteria.seuil_max) : null;
  if (min == null && max == null) return 'sans_spec';
  const v = Number(reading.valeur_num);
  const ok = (min == null || v >= min) && (max == null || v <= max);
  return ok ? 'conforme' : 'non_conforme';
}

// Verdict global : une seule non-conformité → non conforme ; sinon en_attente > conforme > sans_spec.
function conformiteGlobale(list) {
  if (list.includes('non_conforme')) return 'non_conforme';
  if (list.includes('en_attente')) return 'en_attente';
  if (list.includes('conforme')) return 'conforme';
  return 'sans_spec';
}

module.exports = { boolOrNull, specScore, mostSpecific, conformiteResultat, criteriaConformite, conformiteGlobale };
