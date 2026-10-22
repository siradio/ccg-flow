const express = require('express');
const { all, one, run, withTransaction } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { isSuperAdmin } = require('../../../middleware/permissions');
const { logAction } = require('../../audit/audit.service');
const { nextRef } = require('../../dsi/dsi.numbering');
const { notify, notifyRoleOnEntity } = require('../../notifications/notifications.service');
const evalPdf = require('./evaluation.pdf');

// Fiches d'évaluation annuelle. Circuit : brouillon → auto_evaluation (employé, ou manager si pas de
// compte) → evaluation_manager → avis_rh → cloturee. Autorisation par acteur/étape, notifications.
const router = express.Router();
router.use(requireAuth);

const LIEN = (id) => `/rh/evaluation/fiches/${id}`;
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isRh = (u) => isSuperAdmin(u) || (u.roles || []).some(r => r.role_code === 'rh');

async function empUserId(employeeId) {
  const u = await one('SELECT id FROM users WHERE employee_id = $1 AND actif = true ORDER BY id LIMIT 1', [employeeId]);
  return u ? u.id : null;
}
async function resolveManagerUser(employeeId) {
  const r = await one(
    `SELECT u.id FROM employees e JOIN users u ON u.employee_id = e.manager_employee_id AND u.actif = true WHERE e.id = $1 LIMIT 1`,
    [employeeId]);
  return r ? r.id : null;
}
const isManager = (e, u) => Number(e.manager_user_id) === Number(u.id);

async function canAct(e, user) {
  if (isSuperAdmin(user) || isRh(user)) return true;
  if (e.statut === 'brouillon' || e.statut === 'evaluation_manager') return isManager(e, user);
  if (e.statut === 'auto_evaluation') {
    if (e.auto_par_manager) return isManager(e, user);
    const euid = await empUserId(e.employee_id);
    return euid != null && Number(euid) === Number(user.id);
  }
  return false; // avis_rh : RH/super_admin uniquement (déjà couvert ci-dessus)
}
async function canView(e, user) {
  if (isSuperAdmin(user) || isRh(user) || isManager(e, user)) return true;
  const euid = await empUserId(e.employee_id);
  return euid != null && Number(euid) === Number(user.id);
}

const DETAIL = `
  SELECT e.*,
         emp.nom AS employe_nom, emp.prenom AS employe_prenom, emp.matricule, emp.poste,
         TRIM(CONCAT(mu.prenom,' ',mu.nom)) AS manager_nom,
         camp.libelle AS campagne_libelle, camp.annee AS campagne_annee
    FROM rh_evaluations e
    LEFT JOIN employees emp ON emp.id = e.employee_id
    LEFT JOIN users mu ON mu.id = e.manager_user_id
    LEFT JOIN rh_eval_campaigns camp ON camp.id = e.campaign_id`;

// Liste : mine (je suis l'évalué) / team (je suis le manager) / all (RH).
router.get('/', async (req, res, next) => {
  try {
    const scope = req.query.scope || 'team';
    const where = []; const params = [];
    if (scope === 'mine') {
      const me = await one('SELECT employee_id FROM users WHERE id = $1', [req.user.id]);
      if (!me || !me.employee_id) return res.json([]);
      params.push(me.employee_id); where.push(`e.employee_id = $${params.length}`);
    } else if (scope === 'all') {
      if (!isRh(req.user)) return res.status(403).json({ error: 'Réservé aux RH.' });
    } else { // team
      params.push(req.user.id); where.push(`e.manager_user_id = $${params.length}`);
    }
    if (req.query.campaign_id) { params.push(Number(req.query.campaign_id)); where.push(`e.campaign_id = $${params.length}`); }
    res.json(await all(DETAIL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY e.created_at DESC', params));
  } catch (e) { next(e); }
});

// Fiches d'un employé (onglet « Évaluations » de la fiche employé). Accès : RH, manager, ou l'employé.
router.get('/by-employee/:employeeId', async (req, res, next) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!(isRh(req.user) || isSuperAdmin(req.user))) {
      const mgr = await resolveManagerUser(employeeId);
      const me = await one('SELECT employee_id FROM users WHERE id = $1', [req.user.id]);
      const isSelf = me && Number(me.employee_id) === employeeId;
      if (Number(mgr) !== Number(req.user.id) && !isSelf) return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    res.json(await all(DETAIL + ' WHERE e.employee_id = $1 ORDER BY e.annee DESC, e.id DESC', [employeeId]));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const e = await one(DETAIL + ' WHERE e.id = $1', [Number(req.params.id)]);
    if (!e) return res.status(404).json({ error: 'Fiche introuvable.' });
    if (!await canView(e, req.user)) return res.status(403).json({ error: 'Accès non autorisé à cette fiche.' });
    e.lignes = await all('SELECT * FROM rh_evaluation_lignes WHERE evaluation_id = $1 ORDER BY ordre, id', [e.id]);
    e.history = await all(
      `SELECT h.action, h.commentaire, h.created_at, TRIM(CONCAT(u.prenom,' ',u.nom)) AS acteur_nom
         FROM rh_evaluation_history h LEFT JOIN users u ON u.id = h.user_id
        WHERE h.evaluation_id = $1 ORDER BY h.id`, [e.id]);
    const euid = await empUserId(e.employee_id);
    e.can_act = await canAct(e, req.user);
    e.is_manager = isManager(e, req.user);
    e.is_employe = euid != null && Number(euid) === Number(req.user.id);
    e.is_rh = isRh(req.user);
    res.json(e);
  } catch (e) { next(e); }
});

// Téléchargement du PDF de la fiche finalisée (régénéré si absent).
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const e = await one('SELECT id, numero, statut, employee_id, manager_user_id FROM rh_evaluations WHERE id = $1', [id]);
    if (!e) return res.status(404).json({ error: 'Fiche introuvable.' });
    if (!await canView(e, req.user)) return res.status(403).json({ error: 'Accès non autorisé.' });
    let docu = await evalPdf.getStored(id);
    if (!docu || !docu.contenu) {
      if (e.statut !== 'cloturee') return res.status(409).json({ error: 'Le PDF est disponible après finalisation.' });
      await evalPdf.generateAndStore(id, req.user.id);
      docu = await evalPdf.getStored(id);
    }
    if (!docu || !docu.contenu) return res.status(404).json({ error: 'Document indisponible.' });
    res.setHeader('Content-Type', docu.mime || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(e.numero || 'EVL_' + id).replace(/\s+/g, '_')}.pdf"`);
    res.send(docu.contenu);
  } catch (e) { next(e); }
});

// Création d'une fiche par le manager (ou RH) à partir d'un modèle, dans une campagne.
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.employee_id) return res.status(400).json({ error: 'Employé obligatoire.' });
    if (!b.template_id) return res.status(400).json({ error: 'Modèle obligatoire.' });
    if (!isSuperAdmin(req.user) && !isRh(req.user)) {
      // Un manager ne crée que pour un membre de son équipe.
      const mgr = await resolveManagerUser(b.employee_id);
      if (Number(mgr) !== Number(req.user.id)) return res.status(403).json({ error: 'Vous n\'êtes pas le responsable de cet employé.' });
    }
    const emp = await one('SELECT id, entity_id, business_unit_id FROM employees WHERE id = $1', [Number(b.employee_id)]);
    if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
    const tpl = await one('SELECT * FROM rh_eval_templates WHERE id = $1', [Number(b.template_id)]);
    if (!tpl) return res.status(400).json({ error: 'Modèle introuvable.' });
    const camp = b.campaign_id ? await one('SELECT * FROM rh_eval_campaigns WHERE id = $1', [Number(b.campaign_id)]) : null;
    const items = await all('SELECT * FROM rh_eval_template_items WHERE template_id = $1 ORDER BY ordre, id', [tpl.id]);
    const managerUserId = await resolveManagerUser(emp.id) || req.user.id;
    const euid = await empUserId(emp.id);
    const echelle = (camp && camp.echelle_max) || tpl.echelle_max || 5;
    const annee = (camp && camp.annee) || b.annee || new Date().getFullYear();

    const id = await withTransaction(async (tx) => {
      const numero = await nextRef(tx, { scope: 'rh_evaluation', prefix: 'EVL', pad: 4 });
      const row = await tx.one(
        `INSERT INTO rh_evaluations
           (numero, campaign_id, employee_id, manager_user_id, template_id, entity_id, business_unit_id,
            annee, echelle_max, statut, auto_par_manager, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'brouillon',$10,$11) RETURNING id`,
        [numero, camp ? camp.id : null, emp.id, managerUserId, tpl.id, emp.entity_id, emp.business_unit_id,
         annee, echelle, euid == null, req.user.id]);
      for (const it of items) {
        await tx.run(
          `INSERT INTO rh_evaluation_lignes (evaluation_id, competence_id, categorie_libelle, libelle, ordre)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.id, it.competence_id, it.categorie_libelle, it.libelle, it.ordre]);
      }
      await tx.run(`INSERT INTO rh_evaluation_history (evaluation_id, action, user_id) VALUES ($1,'creation',$2)`, [row.id, req.user.id]);
      return row.id;
    });
    await logAction({ tableName: 'rh_evaluations', recordId: id, action: 'creation', userId: req.user.id, details: { employee_id: emp.id } });
    res.status(201).json(await one(DETAIL + ' WHERE e.id = $1', [id]));
  } catch (e) { next(e); }
});

// Enregistre les champs autorisés à l'étape courante (brouillon = structure déjà posée).
router.post('/:id/save', async (req, res, next) => {
  try {
    const e = await one('SELECT * FROM rh_evaluations WHERE id = $1', [Number(req.params.id)]);
    if (!e) return res.status(404).json({ error: 'Fiche introuvable.' });
    if (!await canAct(e, req.user)) return res.status(403).json({ error: 'Vous ne pouvez pas modifier cette fiche à cette étape.' });
    const b = req.body || {};
    const lignes = Array.isArray(b.lignes) ? b.lignes : [];
    await withTransaction(async (tx) => {
      if (e.statut === 'auto_evaluation') {
        for (const l of lignes) {
          if (l.note_employe !== undefined) await tx.run('UPDATE rh_evaluation_lignes SET note_employe = $1 WHERE id = $2 AND evaluation_id = $3', [l.note_employe === '' ? null : Number(l.note_employe), l.id, e.id]);
        }
        await tx.run('UPDATE rh_evaluations SET axes_amelioration = $1, plan_carriere = $2, updated_at = now() WHERE id = $3',
          [b.axes_amelioration ?? e.axes_amelioration, b.plan_carriere ?? e.plan_carriere, e.id]);
      } else if (e.statut === 'evaluation_manager') {
        for (const l of lignes) {
          if (l.note_manager !== undefined) await tx.run('UPDATE rh_evaluation_lignes SET note_manager = $1 WHERE id = $2 AND evaluation_id = $3', [l.note_manager === '' ? null : Number(l.note_manager), l.id, e.id]);
          if (l.commentaire_manager !== undefined) await tx.run('UPDATE rh_evaluation_lignes SET commentaire_manager = $1 WHERE id = $2 AND evaluation_id = $3', [l.commentaire_manager || null, l.id, e.id]);
        }
        await tx.run('UPDATE rh_evaluations SET points_forts = $1, conclusion_manager = $2, updated_at = now() WHERE id = $3',
          [b.points_forts ?? e.points_forts, b.conclusion_manager ?? e.conclusion_manager, e.id]);
      } else if (e.statut === 'avis_rh') {
        await tx.run('UPDATE rh_evaluations SET avis_rh = $1, updated_at = now() WHERE id = $2', [b.avis_rh ?? e.avis_rh, e.id]);
      }
    });
    res.json(await one(DETAIL + ' WHERE e.id = $1', [e.id]));
  } catch (e) { next(e); }
});

const NEXT = { brouillon: 'auto_evaluation', auto_evaluation: 'evaluation_manager', evaluation_manager: 'avis_rh', avis_rh: 'cloturee' };

async function avgNote(tx, evaluationId, col) {
  const r = await tx.one(`SELECT AVG(${col})::numeric(5,2) AS m FROM rh_evaluation_lignes WHERE evaluation_id = $1 AND ${col} IS NOT NULL`, [evaluationId]);
  return r && r.m != null ? r.m : null;
}

// Soumet l'étape courante → étape suivante (ou clôture). Notifie la bonne cible.
router.post('/:id/submit', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const out = await withTransaction(async (tx) => {
      const e = await tx.one('SELECT * FROM rh_evaluations WHERE id = $1 FOR UPDATE', [id]);
      if (!e) throw err('Fiche introuvable.', 404);
      if (!(e.statut in NEXT)) throw err('Cette fiche n\'est plus modifiable.', 409);
      if (!await canAct(e, req.user)) throw err('Vous ne pouvez pas soumettre cette étape.', 403);
      const nextStatut = NEXT[e.statut];
      if (e.statut === 'auto_evaluation') await tx.run('UPDATE rh_evaluations SET note_globale_employe = $1 WHERE id = $2', [await avgNote(tx, id, 'note_employe'), id]);
      if (e.statut === 'evaluation_manager') await tx.run('UPDATE rh_evaluations SET note_globale_manager = $1 WHERE id = $2', [await avgNote(tx, id, 'note_manager'), id]);
      const patch = nextStatut === 'cloturee'
        ? "statut = $1, decided_at = now(), updated_at = now()"
        : (e.statut === 'brouillon' ? "statut = $1, submitted_at = now(), updated_at = now()" : "statut = $1, updated_at = now()");
      await tx.run(`UPDATE rh_evaluations SET ${patch} WHERE id = $2`, [nextStatut, id]);
      await tx.run(`INSERT INTO rh_evaluation_history (evaluation_id, action, user_id, commentaire) VALUES ($1,$2,$3,$4)`,
        [id, 'passage_' + nextStatut, req.user.id, (req.body && req.body.commentaire) || null]);
      return { e, nextStatut };
    });
    // Notifications après commit.
    try {
      const { e, nextStatut: next } = out;
      if (next === 'auto_evaluation') {
        const euid = e.auto_par_manager ? e.manager_user_id : await empUserId(e.employee_id);
        if (euid) await notify(euid, 'Évaluation à compléter', `Votre auto-évaluation ${e.numero} est à remplir.`, LIEN(id));
      } else if (next === 'evaluation_manager') {
        if (e.manager_user_id) await notify(e.manager_user_id, 'Évaluation à compléter', `L'évaluation ${e.numero} attend votre appréciation.`, LIEN(id));
      } else if (next === 'avis_rh') {
        await notifyRoleOnEntity(e.entity_id, 'rh', 'Évaluation — avis RH', `L'évaluation ${e.numero} attend l'avis RH.`, LIEN(id));
      } else if (next === 'cloturee') {
        const euid = await empUserId(e.employee_id);
        if (euid) await notify(euid, 'Évaluation finalisée', `Votre évaluation ${e.numero} est finalisée.`, LIEN(id));
        if (e.manager_user_id) await notify(e.manager_user_id, 'Évaluation finalisée', `L'évaluation ${e.numero} est finalisée.`, LIEN(id));
      }
    } catch (ne) { console.error('[eval notif]', ne.message); }
    if (out.nextStatut === 'cloturee') { try { await evalPdf.generateAndStore(id, req.user.id); } catch (pe) { console.error('[eval pdf]', pe.message); } }
    res.json(await one(DETAIL + ' WHERE e.id = $1', [id]));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// Retour à une étape précédente (motif obligatoire).
router.post('/:id/return', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const commentaire = (req.body && req.body.commentaire) || '';
    if (!commentaire.trim()) return res.status(400).json({ error: 'Un motif est obligatoire pour un retour.' });
    const target = req.body.target; // 'brouillon' | 'auto_evaluation' | 'evaluation_manager'
    const ORDER = ['brouillon', 'auto_evaluation', 'evaluation_manager', 'avis_rh', 'cloturee'];
    const e = await one('SELECT * FROM rh_evaluations WHERE id = $1', [id]);
    if (!e) return res.status(404).json({ error: 'Fiche introuvable.' });
    if (!await canAct(e, req.user) && !isRh(req.user) && !isSuperAdmin(req.user)) return res.status(403).json({ error: 'Action non autorisée.' });
    if (!ORDER.includes(target) || ORDER.indexOf(target) >= ORDER.indexOf(e.statut)) return res.status(400).json({ error: 'Étape de retour invalide.' });
    await run('UPDATE rh_evaluations SET statut = $1, updated_at = now() WHERE id = $2', [target, id]);
    await run(`INSERT INTO rh_evaluation_history (evaluation_id, action, user_id, commentaire) VALUES ($1,'retour',$2,$3)`, [id, req.user.id, commentaire.trim()]);
    res.json(await one(DETAIL + ' WHERE e.id = $1', [id]));
  } catch (e) { next(e); }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const motif = (req.body && req.body.motif) || '';
    if (!motif.trim()) return res.status(400).json({ error: 'Un motif d\'annulation est obligatoire.' });
    const e = await one('SELECT * FROM rh_evaluations WHERE id = $1', [id]);
    if (!e) return res.status(404).json({ error: 'Fiche introuvable.' });
    if (!(isManager(e, req.user) || isRh(req.user) || isSuperAdmin(req.user))) return res.status(403).json({ error: 'Action non autorisée.' });
    if (e.statut === 'cloturee' || e.statut === 'annulee') return res.status(409).json({ error: 'Fiche déjà close.' });
    await run('UPDATE rh_evaluations SET statut = $1, motif_annulation = $2, updated_at = now() WHERE id = $3', ['annulee', motif.trim(), id]);
    await run(`INSERT INTO rh_evaluation_history (evaluation_id, action, user_id, commentaire) VALUES ($1,'annulation',$2,$3)`, [id, req.user.id, motif.trim()]);
    res.json(await one(DETAIL + ' WHERE e.id = $1', [id]));
  } catch (e) { next(e); }
});

module.exports = router;
