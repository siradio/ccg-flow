const { all, one, run } = require('../../db');
const settings = require('../settings/settings.service');

// Assistant « CCG Flow » — logique 100 % à base de règles, AUCUN appel à un modèle d'IA.
//  • Personnage : nom / genre / avatar / message d'accueil, stockés dans app_settings.
//  • Nouveautés : annonces éditées par le super_admin (table assistant_news).
//  • FAQ : base de connaissances interrogée par un moteur de SCORE par mots-clés (table assistant_faq).
// Le « moteur » ne comprend pas le langage : il normalise la question (minuscules, sans accents),
// la découpe en mots, écarte les mots vides, étend quelques synonymes métier, puis classe les
// entrées FAQ par recouvrement pondéré (mots-clés > question > réponse).

// ─── Personnage (app_settings) ──────────────────────────────────────────────────────────────────
const KEYS = {
  enabled: 'assistant_enabled', name: 'assistant_name', gender: 'assistant_gender',
  avatar: 'assistant_avatar', greeting: 'assistant_greeting',
};
const GENDERS = ['fille', 'garcon', 'neutre'];

async function getPersona() {
  const enabled = (await settings.getValue(KEYS.enabled, 'true')) !== 'false';
  const name = (await settings.getValue(KEYS.name, 'Flo')) || 'Flo';
  let gender = (await settings.getValue(KEYS.gender, 'neutre')) || 'neutre';
  if (!GENDERS.includes(gender)) gender = 'neutre';
  const avatar = (await settings.getValue(KEYS.avatar, '🤖')) || '🤖';
  const greeting = (await settings.getValue(KEYS.greeting, '')) || '';
  return { enabled, name, gender, avatar, greeting };
}

async function setPersona(fields = {}) {
  if (fields.enabled !== undefined) await settings.setValue(KEYS.enabled, fields.enabled ? 'true' : 'false');
  if (fields.name !== undefined) await settings.setValue(KEYS.name, String(fields.name || '').trim().slice(0, 40) || 'Flo');
  if (fields.gender !== undefined) await settings.setValue(KEYS.gender, GENDERS.includes(fields.gender) ? fields.gender : 'neutre');
  if (fields.avatar !== undefined) await settings.setValue(KEYS.avatar, String(fields.avatar || '🤖').trim().slice(0, 16) || '🤖');
  if (fields.greeting !== undefined) await settings.setValue(KEYS.greeting, String(fields.greeting || '').trim().slice(0, 400));
  return getPersona();
}

// ─── Nouveautés ───────────────────────────────────────────────────────────────────────────────────
const NEWS_TYPES = ['nouveau', 'amelioration', 'correctif'];
function cleanNewsType(v) { return NEWS_TYPES.includes(v) ? v : 'nouveau'; }
// Une date vide ('') venant du formulaire casserait le cast ::date — on la ramène à null (le SQL
// retombe alors sur CURRENT_DATE à la création, ou garde la valeur existante à la mise à jour).
function cleanDate(v) { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }

// Liste publique (dans l'app) : uniquement les annonces actives, épinglées en tête puis par date.
async function listNews() {
  return all(
    `SELECT id, titre, contenu, type, module_key, lien, date_pub, epingle
       FROM assistant_news WHERE actif = true
       ORDER BY epingle DESC, date_pub DESC, id DESC`
  );
}

// Vue admin : tout, y compris les annonces inactives.
async function adminListNews() {
  return all(
    `SELECT id, titre, contenu, type, module_key, lien, date_pub, epingle, actif
       FROM assistant_news ORDER BY epingle DESC, date_pub DESC, id DESC`
  );
}

async function createNews(d = {}) {
  return one(
    `INSERT INTO assistant_news (titre, contenu, type, module_key, lien, date_pub, epingle, actif)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7, $8)
     RETURNING id, titre, contenu, type, module_key, lien, date_pub, epingle, actif`,
    [String(d.titre || '').trim(), String(d.contenu || '').trim(), cleanNewsType(d.type),
     d.module_key || null, d.lien || null, cleanDate(d.date_pub), !!d.epingle, d.actif === undefined ? true : !!d.actif]
  );
}

async function updateNews(id, d = {}) {
  await run(
    `UPDATE assistant_news SET titre=$2, contenu=$3, type=$4, module_key=$5, lien=$6,
            date_pub=COALESCE($7, date_pub), epingle=$8, actif=$9, updated_at=now()
      WHERE id=$1`,
    [id, String(d.titre || '').trim(), String(d.contenu || '').trim(), cleanNewsType(d.type),
     d.module_key || null, d.lien || null, cleanDate(d.date_pub), !!d.epingle, d.actif === undefined ? true : !!d.actif]
  );
  return one(`SELECT id, titre, contenu, type, module_key, lien, date_pub, epingle, actif FROM assistant_news WHERE id=$1`, [id]);
}

async function removeNews(id) { await run('DELETE FROM assistant_news WHERE id = $1', [id]); }

// ─── FAQ ────────────────────────────────────────────────────────────────────────────────────────
async function adminListFaq() {
  return all(
    `SELECT id, question, reponse, mots_cles, module_key, lien, ordre, actif
       FROM assistant_faq ORDER BY ordre, id`
  );
}

// Suggestions de départ (chips affichées quand la zone de recherche est vide) : les premières
// entrées actives selon l'ordre défini par l'admin.
async function faqSuggestions(limit = 6) {
  return all(
    `SELECT id, question, lien, module_key FROM assistant_faq
      WHERE actif = true ORDER BY ordre, id LIMIT $1`, [limit]
  );
}

async function createFaq(d = {}) {
  return one(
    `INSERT INTO assistant_faq (question, reponse, mots_cles, module_key, lien, ordre, actif)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, question, reponse, mots_cles, module_key, lien, ordre, actif`,
    [String(d.question || '').trim(), String(d.reponse || '').trim(), String(d.mots_cles || '').trim(),
     d.module_key || null, d.lien || null, Number.isFinite(Number(d.ordre)) ? Number(d.ordre) : 100,
     d.actif === undefined ? true : !!d.actif]
  );
}

async function updateFaq(id, d = {}) {
  await run(
    `UPDATE assistant_faq SET question=$2, reponse=$3, mots_cles=$4, module_key=$5, lien=$6,
            ordre=$7, actif=$8, updated_at=now() WHERE id=$1`,
    [id, String(d.question || '').trim(), String(d.reponse || '').trim(), String(d.mots_cles || '').trim(),
     d.module_key || null, d.lien || null, Number.isFinite(Number(d.ordre)) ? Number(d.ordre) : 100,
     d.actif === undefined ? true : !!d.actif]
  );
  return one(`SELECT id, question, reponse, mots_cles, module_key, lien, ordre, actif FROM assistant_faq WHERE id=$1`, [id]);
}

async function removeFaq(id) { await run('DELETE FROM assistant_faq WHERE id = $1', [id]); }

// ─── Moteur de recherche FAQ (score par mots-clés, sans IA) ──────────────────────────────────────

// Normalisation : minuscules + suppression des accents (NFD) + ne garde que lettres/chiffres/espaces.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mots vides français/anglais courants — ils ne doivent pas peser dans le score.
const STOPWORDS = new Set((
  'le la les un une des du de d l au aux et ou where a as est sont ce cet cette ces mon ma mes ' +
  'je tu il elle on nous vous ils elles me te se y en que qui quoi dont ou comment pourquoi quand ' +
  'quel quelle quels quelles pour par sur dans avec sans vers chez afin faire fait puis plus moins ' +
  'the of to in is are how what why when which with for and or my your can do does i'
).split(' '));

// Synonymes / sigles métier : un mot de la question est étendu par ces équivalents avant le score.
const SYNONYMS = {
  da: ['demande', 'achat'], bdc: ['bon', 'commande'], bc: ['bon', 'commande'],
  bu: ['business', 'unit'], ca: ['chiffre', 'affaires'], pf: ['produit', 'fini'],
  mp: ['matiere', 'premiere'], rh: ['ressources', 'humaines'], qhse: ['qualite', 'laboratoire'],
  conge: ['conges', 'absence'], motdepasse: ['mot', 'passe', 'password'], password: ['mot', 'passe'],
  stock: ['stock', 'inventaire'], prod: ['production'], commande: ['commande', 'bon'],
};

function tokenize(s) {
  const base = normalize(s).split(' ').filter(w => w && w.length > 1 && !STOPWORDS.has(w));
  const out = [];
  for (const w of base) {
    out.push(w);
    if (SYNONYMS[w]) out.push(...SYNONYMS[w]);
  }
  return out;
}

// Score d'une entrée FAQ vis-à-vis des tokens de la question. Pondération : un mot trouvé dans les
// mots-clés compte le plus (3), dans la question (2), dans la réponse (1). Bonus si la question de
// l'utilisateur est quasi contenue telle quelle dans la question de la FAQ.
function scoreEntry(entry, qTokens, qNorm) {
  const kw = new Set(tokenize(entry.mots_cles));
  const inQuestion = new Set(tokenize(entry.question));
  const inAnswer = new Set(tokenize(entry.reponse));
  let score = 0;
  let matched = 0;
  for (const tok of qTokens) {
    let s = 0;
    if (kw.has(tok)) s += 3;
    if (inQuestion.has(tok)) s += 2;
    if (inAnswer.has(tok)) s += 1;
    if (s > 0) matched++;
    score += s;
  }
  // Bonus de « phrase » : la question saisie apparaît littéralement dans la question de la FAQ.
  const faqQNorm = normalize(entry.question);
  if (qNorm.length >= 4 && faqQNorm.includes(qNorm)) score += 5;
  // Normalise un peu par le nombre de mots de la requête (évite d'avantager les requêtes longues).
  const coverage = qTokens.length ? matched / qTokens.length : 0;
  return { score, matched, coverage };
}

// Recherche : renvoie les meilleures entrées (score décroissant) au-dessus d'un seuil. `limit`
// réponses max. Renvoie aussi un drapeau si rien ne correspond vraiment (pour proposer des suggestions).
async function searchFaq(query, limit = 3) {
  const qNorm = normalize(query);
  const qTokens = tokenize(query);
  const rows = await all(
    `SELECT id, question, reponse, mots_cles, module_key, lien FROM assistant_faq WHERE actif = true`
  );
  if (!qTokens.length) return { matches: [], query: qNorm };
  const scored = rows
    .map(r => ({ r, ...scoreEntry(r, qTokens, qNorm) }))
    // Il faut au moins un vrai recouvrement de mot-clé/question (score ≥ 2) pour être proposé.
    .filter(x => x.score >= 2 && x.matched >= 1)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage)
    .slice(0, limit)
    .map(x => ({ id: x.r.id, question: x.r.question, reponse: x.r.reponse, lien: x.r.lien, module_key: x.r.module_key, score: x.score }));
  return { matches: scored, query: qNorm };
}

module.exports = {
  getPersona, setPersona,
  listNews, adminListNews, createNews, updateNews, removeNews,
  adminListFaq, faqSuggestions, createFaq, updateFaq, removeFaq, searchFaq,
  GENDERS, NEWS_TYPES,
};
