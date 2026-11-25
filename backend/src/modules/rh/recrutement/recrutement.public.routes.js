const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { all, one, run, withTransaction } = require('../../../db');
const env = require('../../../config/env');
const { publicWriteLimiter } = require('../../../middleware/rateLimiters');

// Portail EXTERNE du candidat (sous-module Tests de recrutement). Monté sur /api/public/recrutement,
// SANS requireAuth : le candidat n'a pas de compte interne. Authentification par un token candidat
// dédié (JWT `kind:'recrutement'`), distinct du JWT des utilisateurs CCG Flow. La correction et le
// chronomètre sont contrôlés CÔTÉ SERVEUR ; les bonnes réponses ne sont JAMAIS envoyées au candidat.
const router = express.Router();

function signCandidate(inv) {
  return jwt.sign({ kind: 'recrutement', inv: inv.id, cand: inv.candidate_id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '6h' });
}
function requireCandidate(req, res, next) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const p = jwt.verify(tok, env.jwtSecret, { algorithms: ['HS256'] });
    if (p.kind !== 'recrutement') throw new Error('bad kind');
    req.cand = { invId: p.inv, candidateId: p.cand };
    next();
  } catch { return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' }); }
}

// ── Connexion candidat ────────────────────────────────────────────────────────────────────────────
router.post('/login', publicWriteLimiter, async (req, res, next) => {
  try {
    const { token, login, password } = req.body || {};
    if (!token || !login || !password) return res.status(400).json({ error: 'Lien, identifiant et mot de passe requis.' });
    const inv = await one('SELECT * FROM rh_recrutement_invitations WHERE token = $1', [String(token)]);
    // Message volontairement générique (anti-énumération), sauf cas « expiré/révoqué » explicites.
    if (!inv) return res.status(401).json({ error: 'Accès invalide.' });
    if (!inv.actif) return res.status(403).json({ error: 'Cet accès a été suspendu. Contactez le service RH.' });
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return res.status(403).json({ error: 'Le délai de passage du test est dépassé.' });
    const okLogin = String(login).trim().toLowerCase() === String(inv.login).toLowerCase();
    const okPwd = await bcrypt.compare(String(password), inv.password_hash);
    if (!okLogin || !okPwd) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    res.json({ token: signCandidate(inv) });
  } catch (e) { next(e); }
});

// Charge l'invitation + candidat + campagne + modèle à partir du token candidat.
async function loadContext(req) {
  return one(
    `SELECT i.id AS invitation_id, i.expires_at, i.duree_min, i.variant_id, i.template_id, i.actif,
            ca.id AS candidate_id, ca.prenom, ca.nom, ca.poste,
            cp.intitule AS campagne, cp.poste AS campagne_poste, e.nom AS entity_nom,
            t.titre AS test_titre, t.consignes, t.afficher_resultat_candidat, t.melange_questions, t.melange_reponses,
            v.code AS variant_code,
            (SELECT COUNT(*)::int FROM rh_recrutement_variant_questions vq WHERE vq.variant_id = i.variant_id) AS nb_questions
       FROM rh_recrutement_invitations i
       JOIN rh_recrutement_candidates ca ON ca.id = i.candidate_id
       JOIN rh_recrutement_campaigns cp ON cp.id = ca.campaign_id
       LEFT JOIN entities e ON e.id = cp.entity_id
       LEFT JOIN rh_recrutement_templates t ON t.id = i.template_id
       LEFT JOIN rh_recrutement_template_variants v ON v.id = i.variant_id
      WHERE i.id = $1`, [req.cand.invId]);
}

// ── Présentation du test ──────────────────────────────────────────────────────────────────────────
router.get('/session', requireCandidate, async (req, res, next) => {
  try {
    const ctx = await loadContext(req);
    if (!ctx) return res.status(404).json({ error: 'Invitation introuvable.' });
    const attempt = await one('SELECT id, statut, started_at, expires_at, submitted_at, score_auto, score_max, note_sur_20 FROM rh_recrutement_attempts WHERE candidate_id = $1', [ctx.candidate_id]);
    let etat = 'non_commence';
    if (attempt) etat = attempt.statut === 'en_cours' ? (new Date(attempt.expires_at) < new Date() ? 'expire' : 'en_cours') : attempt.statut;
    const out = {
      candidat: { prenom: ctx.prenom, nom: ctx.nom },
      poste: ctx.poste || ctx.campagne_poste || ctx.campagne,
      societe: ctx.entity_nom, campagne: ctx.campagne,
      test: { titre: ctx.test_titre, consignes: ctx.consignes, duree_min: ctx.duree_min, nb_questions: ctx.nb_questions, variante: ctx.variant_code },
      date_limite: ctx.expires_at, etat,
    };
    if ((etat === 'soumis' || etat === 'expire') && ctx.afficher_resultat_candidat && attempt) {
      out.resultat = { score: Number(attempt.score_auto), max: Number(attempt.score_max), note_sur_20: Number(attempt.note_sur_20) };
    }
    res.json(out);
  } catch (e) { next(e); }
});

// Vue candidat d'une question (SANS les bonnes réponses).
function candidateView(aq) {
  const s = aq.snapshot;
  return { id: aq.id, ordre: aq.ordre, type: s.type, intitule: s.intitule, description: s.description || null, points: Number(s.points),
    options: (s.options || []).map((o, i) => ({ idx: i, libelle: o.libelle })) };
}
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function remainingSec(attempt) { return Math.max(0, Math.round((new Date(attempt.expires_at) - Date.now()) / 1000)); }

async function serveAttempt(candidateId) {
  const attempt = await one('SELECT * FROM rh_recrutement_attempts WHERE candidate_id = $1', [candidateId]);
  if (!attempt) return null;
  const aqs = await all('SELECT id, ordre, snapshot FROM rh_recrutement_attempt_questions WHERE attempt_id = $1 ORDER BY ordre, id', [attempt.id]);
  const answers = await all(
    `SELECT aq.id AS attempt_question_id, a.value, a.marque_a_revoir
       FROM rh_recrutement_attempt_questions aq LEFT JOIN rh_recrutement_attempt_answers a ON a.attempt_question_id = aq.id
      WHERE aq.attempt_id = $1`, [attempt.id]);
  const byId = Object.fromEntries(answers.map(r => [r.attempt_question_id, { value: r.value, marque_a_revoir: r.marque_a_revoir }]));
  return {
    statut: attempt.statut,
    remaining_sec: remainingSec(attempt),
    duree_min: attempt.duree_min,
    questions: aqs.map(candidateView),
    answers: byId,
  };
}

// ── Démarrage du test (le chronomètre démarre ICI, côté serveur) ──────────────────────────────────
router.post('/start', requireCandidate, async (req, res, next) => {
  try {
    const ctx = await loadContext(req);
    if (!ctx) return res.status(404).json({ error: 'Invitation introuvable.' });
    if (!ctx.actif) return res.status(403).json({ error: 'Accès suspendu.' });
    if (ctx.expires_at && new Date(ctx.expires_at) < new Date()) return res.status(403).json({ error: 'Délai dépassé.' });

    const existing = await one('SELECT * FROM rh_recrutement_attempts WHERE candidate_id = $1', [ctx.candidate_id]);
    if (existing) {
      if (existing.statut !== 'en_cours' || new Date(existing.expires_at) < new Date()) {
        await finalizeIfExpired(existing);
        return res.status(409).json({ error: 'Le test a déjà été passé.' });
      }
      return res.json(await serveAttempt(ctx.candidate_id)); // reprise : même tentative, même chrono
    }

    const vqs = await all('SELECT question_id, snapshot FROM rh_recrutement_variant_questions WHERE variant_id = $1 ORDER BY ordre, id', [ctx.variant_id]);
    if (!vqs.length) return res.status(400).json({ error: 'Le test ne contient aucune question. Contactez le service RH.' });
    const ordered = ctx.melange_questions ? shuffle(vqs) : vqs;

    const durationSec = (ctx.duree_min || 40) * 60;
    let expires = new Date(Date.now() + durationSec * 1000);
    if (ctx.expires_at && new Date(ctx.expires_at) < expires) expires = new Date(ctx.expires_at); // borne par la date limite

    await withTransaction(async (tx) => {
      const at = await tx.one(
        `INSERT INTO rh_recrutement_attempts (candidate_id, invitation_id, template_id, variant_id, duree_min, started_at, expires_at)
         VALUES ($1,$2,$3,$4,$5, now(), $6) RETURNING id`,
        [ctx.candidate_id, ctx.invitation_id, ctx.template_id, ctx.variant_id, ctx.duree_min, expires]);
      let ordre = 0;
      for (const vq of ordered) {
        const snap = { ...vq.snapshot };
        if (ctx.melange_reponses && Array.isArray(snap.options)) snap.options = shuffle(snap.options);
        await tx.run('INSERT INTO rh_recrutement_attempt_questions (attempt_id, ordre, snapshot) VALUES ($1,$2,$3)', [at.id, ordre++, JSON.stringify(snap)]);
      }
      await tx.run("UPDATE rh_recrutement_candidates SET statut='test_en_cours', updated_at=now() WHERE id=$1", [ctx.candidate_id]);
    });
    res.json(await serveAttempt(ctx.candidate_id));
  } catch (e) { next(e); }
});

// ── État de la tentative (reprise après rafraîchissement / reconnexion) ───────────────────────────
router.get('/attempt', requireCandidate, async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM rh_recrutement_attempts WHERE candidate_id = $1', [req.cand.candidateId]);
    if (!attempt) return res.status(404).json({ error: 'Test non démarré.' });
    if (attempt.statut === 'en_cours' && new Date(attempt.expires_at) < new Date()) await finalizeIfExpired(attempt);
    res.json(await serveAttempt(req.cand.candidateId));
  } catch (e) { next(e); }
});

// ── Sauvegarde automatique d'une réponse ──────────────────────────────────────────────────────────
router.post('/answer', requireCandidate, async (req, res, next) => {
  try {
    const { attempt_question_id, value, marque_a_revoir } = req.body || {};
    const aq = await one(
      `SELECT aq.id, at.id AS attempt_id, at.statut, at.expires_at
         FROM rh_recrutement_attempt_questions aq JOIN rh_recrutement_attempts at ON at.id = aq.attempt_id
        WHERE aq.id = $1 AND at.candidate_id = $2`, [Number(attempt_question_id), req.cand.candidateId]);
    if (!aq) return res.status(404).json({ error: 'Question introuvable.' });
    if (aq.statut !== 'en_cours') return res.status(409).json({ error: 'Le test est clôturé.' });
    if (new Date(aq.expires_at) < new Date()) { await finalizeIfExpired({ id: aq.attempt_id }); return res.status(409).json({ error: 'Temps écoulé.' }); }
    await run(
      `INSERT INTO rh_recrutement_attempt_answers (attempt_question_id, value, marque_a_revoir)
       VALUES ($1,$2,$3)
       ON CONFLICT (attempt_question_id) DO UPDATE SET value = EXCLUDED.value, marque_a_revoir = EXCLUDED.marque_a_revoir, updated_at = now()`,
      [aq.id, value == null ? null : JSON.stringify(value), !!marque_a_revoir]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Correction automatique (serveur) ──────────────────────────────────────────────────────────────
function norm(v) { return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function correct(snapshot, value) {
  const type = snapshot.type; const opts = snapshot.options || []; const pts = Number(snapshot.points) || 0;
  const selected = value && Array.isArray(value.selected) ? value.selected : [];
  if (type === 'qcm_unique' || type === 'vrai_faux') {
    const ci = opts.findIndex(o => o.bon);
    const ok = selected.length === 1 && selected[0] === ci;
    return { auto: true, is_correct: ok, points: ok ? pts : 0 };
  }
  if (type === 'qcm_multiple') {
    const good = new Set(opts.map((o, i) => (o.bon ? i : -1)).filter(i => i >= 0));
    const sel = new Set(selected);
    const ok = good.size === sel.size && [...good].every(i => sel.has(i));
    return { auto: true, is_correct: ok, points: ok ? pts : 0 };
  }
  if (type === 'numerique' || type === 'texte_court') {
    const accepted = opts.map(o => norm(o.libelle));
    const v = norm(value && (value.text != null ? value.text : value.number));
    const ok = v !== '' && accepted.includes(v);
    return { auto: true, is_correct: ok, points: ok ? pts : 0 };
  }
  return { auto: false, is_correct: null, points: 0 }; // ouverte → correction manuelle (lot 5)
}

// Finalise une tentative : corrige l'auto, calcule les scores, fige le statut. `expired` => 'expire'.
async function finalizeAttempt(attemptId, { expired } = {}) {
  await withTransaction(async (tx) => {
    const at = await tx.one("SELECT * FROM rh_recrutement_attempts WHERE id=$1 FOR UPDATE", [attemptId]);
    if (!at || at.statut !== 'en_cours') return; // idempotent
    const rows = await tx.all(
      `SELECT aq.id, aq.snapshot, a.value
         FROM rh_recrutement_attempt_questions aq LEFT JOIN rh_recrutement_attempt_answers a ON a.attempt_question_id = aq.id
        WHERE aq.attempt_id = $1`, [attemptId]);
    let scoreAuto = 0, scoreMax = 0, manuel = false;
    for (const r of rows) {
      const c = correct(r.snapshot, r.value);
      scoreMax += Number(r.snapshot.points) || 0;
      if (c.auto) scoreAuto += c.points; else manuel = true;
      await tx.run(
        `INSERT INTO rh_recrutement_attempt_answers (attempt_question_id, is_correct, points_obtenus, corrige_manuel)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (attempt_question_id) DO UPDATE SET is_correct=EXCLUDED.is_correct, points_obtenus=EXCLUDED.points_obtenus, corrige_manuel=EXCLUDED.corrige_manuel, updated_at=now()`,
        [r.id, c.is_correct, c.points, !c.auto]);
    }
    const note20 = scoreMax > 0 ? Math.round((scoreAuto / scoreMax) * 200) / 10 : 0;
    const temps = Math.max(0, Math.round((Date.now() - new Date(at.started_at)) / 1000));
    await tx.run(
      `UPDATE rh_recrutement_attempts SET statut=$1, submitted_at=now(), temps_utilise_sec=$2, score_auto=$3,
              score_max=$4, note_sur_20=$5, corrige_manuel_requis=$6, updated_at=now() WHERE id=$7`,
      [expired ? 'expire' : 'soumis', temps, scoreAuto, scoreMax, note20, manuel, attemptId]);
    await tx.run(
      "UPDATE rh_recrutement_candidates SET statut=$1, updated_at=now() WHERE id=$2",
      [manuel ? 'correction_en_attente' : 'test_soumis', at.candidate_id]);
  });
}
async function finalizeIfExpired(attempt) { try { await finalizeAttempt(attempt.id, { expired: true }); } catch (e) { console.error('finalizeIfExpired', e.message); } }

// ── Soumission définitive (idempotente) ───────────────────────────────────────────────────────────
router.post('/submit', requireCandidate, async (req, res, next) => {
  try {
    const at = await one('SELECT * FROM rh_recrutement_attempts WHERE candidate_id = $1', [req.cand.candidateId]);
    if (!at) return res.status(404).json({ error: 'Test non démarré.' });
    if (at.statut === 'en_cours') await finalizeAttempt(at.id, { expired: new Date(at.expires_at) < new Date() });
    res.json({ ok: true, statut: 'soumis' });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.finalizeAttempt = finalizeAttempt;
