// Normalisation de casse des saisies de référentiel (voir demande utilisateur) :
// - texte courant  -> « Première Lettre De Chaque Mot En Majuscule » (Title Case)
// - codes          -> laissés tels quels (l'utilisateur choisit le format)
// - unités         -> tout en minuscule (kg, l, pièce…)
// - e-mails / tél. -> laissés tels quels (une majuscule casserait l'adresse)
// - champs libres multi-lignes (textarea) -> laissés tels quels (une phrase ne se met pas en Title Case)

// Met une majuscule à la 1re lettre de chaque mot (séparé par espace, tiret ou barre oblique),
// le reste en minuscule. Gère les lettres accentuées via \p{L} (Unicode).
export function toTitleCase(str) {
  if (str == null) return str;
  return String(str)
    .toLowerCase()
    .replace(/(^|[\s\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
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
