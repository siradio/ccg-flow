// Normalisation de casse des saisies de référentiel (voir demande utilisateur) :
// - texte courant  -> « Première Lettre De Chaque Mot En Majuscule » (Title Case)
// - codes          -> laissés tels quels (l'utilisateur choisit le format)
// - unités         -> tout en minuscule (kg, l, pièce…)
// - e-mails / tél. -> laissés tels quels (une majuscule casserait l'adresse)
// - champs libres multi-lignes (textarea) -> laissés tels quels (une phrase ne se met pas en Title Case)

// Un sigle tout en majuscules de 2 à 4 lettres (BU, CCG, SARL, PBIC…) est préservé tel quel.
const isAcronym = (w) => w.length >= 2 && w.length <= 4 && /^\p{Lu}+$/u.test(w);
const titleWord = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

// Met une majuscule à la 1re lettre de chaque mot (suite de lettres/chiffres), le reste en
// minuscule. Un sigle isolé dans un texte en casse mixte est préservé (ex. « Guinée Emballages
// SARL »). MAIS si TOUTE la valeur est en majuscules (ex. « LAIT EN POUDRE », « ADEMAT »), on
// considère qu'il s'agit d'une saisie tout-capitales et on applique le Title Case complet — sinon
// des mots courts (LAIT, EN…) seraient pris à tort pour des sigles. Séparateurs conservés.
export function toTitleCase(str) {
  if (str == null) return str;
  const s = String(str);
  const alphaWords = s.match(/\p{L}+/gu) || [];
  const allCaps = alphaWords.length > 0 && alphaWords.every(w => w === w.toUpperCase());
  return s.replace(/[\p{L}\p{N}]+/gu, (w) => ((!allCaps && isAcronym(w)) ? w : titleWord(w)));
}

// Détermine le mode de normalisation d'un champ : 'title' | 'lower' | 'none'.
// Un champ peut forcer explicitement son mode via `field.casing`.
export function fieldCasing(field = {}) {
  if (field.casing) return field.casing;
  const key = field.key || '';
  const type = field.type || 'text';
  // Seuls les vrais champs de saisie texte sont concernés.
  if (!['text', 'textarea', undefined, ''].includes(type)) return 'none';
  if (/code/i.test(key) || /email/i.test(key) || /tel|phone/i.test(key)) return 'none';
  if (/^unite/i.test(key)) return 'lower';
  if (type === 'textarea') return 'none'; // texte libre multi-lignes : pas de Title Case
  return 'title';
}

// Applique la normalisation à une valeur pour un champ donné (no-op si non-chaîne ou vide).
export function normalizeFieldValue(field, value) {
  if (typeof value !== 'string' || value === '') return value;
  const mode = fieldCasing(field);
  if (mode === 'title') return toTitleCase(value);
  if (mode === 'lower') return value.toLowerCase();
  return value;
}

// Normalise tout un objet de formulaire selon la définition des champs.
export function normalizeForm(fields, form) {
  const out = { ...form };
  for (const f of fields) {
    if (f.key in out) out[f.key] = normalizeFieldValue(f, out[f.key]);
  }
  return out;
}
