const { all, one, withTransaction } = require('../../../db');
const { notify } = require('../../notifications/notifications.service');
const { hasRoleAnywhere, hasRoleOnEntity, isSuperAdmin, visibleBusinessUnitIds } = require('../../../middleware/permissions');
const pdf = require('./commande.pdf');

// Orchestration du workflow des bons de commande commerciaux.
// 3 étapes métier (responsable commercial cross-BU → contrôle de gestion → contrôle stock manuel
// en éventail par BU) + 1 étape système (génération du BC, Lot 4). Points clés :
//  - VERROU de ligne (SELECT ... FOR UPDATE) + garde sur le statut/étape : pas de double validation
//    concurrente (le moteur des achats n'a pas ce garde-fou).
//  - REPRISE INTELLIGENTE : à l'avancement, une étape déjà validée dont la « signature de contenu »
//    n'a pas changé est reportée automatiquement (pas de re-validation inutile).
//  - Notifications envoyées APRÈS commit (jamais si la transaction échoue).

const err = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });

// Autorisation d'agir sur une étape. Le contrôle de gestion est restreint à l'entité du bon ;
// les autres rôles du circuit (responsable_commercial, gestionnaire_stock) sont cross-BU/global.
// Repli « anywhere » si l'entité n'est pas renseignée (anciens bons), pour ne jamais bloquer.
function canActOnStep(user, step, c) {
  if (isSuperAdmin(user)) return true;
  if (!step || !step.role_code_requis) return false;
  if (step.code === 'controle_gestion' && c.entity_id) {
    return hasRoleOnEntity(user, 'controle_gestion', c.entity_id);
  }
  return hasRoleAnywhere(user, step.role_code_requis);
}
const LIEN = (id) => `/commerce/commandes/${id}`;
const TYPE_NOTIF = 'Bon de commande';

// ── Signatures de contenu (reprise intelligente) ──────────────────────────────
function signatureForStep(code, c, lines) {
  const L = [...lines].sort((a, b) => a.product_id - b.product_id);
  if (code === 'validation_resp_commercial') {
    return JSON.stringify({ l: L.map(x => [x.product_id, x.quantite, Number(x.prix_unitaire_fige)]),
      bt: c.beneficiaire_type, cid: c.commercial_id || null, gid: c.grossiste_id || null, bu: c.business_unit_id || null });
  }
  if (code === 'controle_gestion') {
    return JSON.stringify({ m: Number(c.montant_total), l: L.map(x => [x.product_id, x.quantite, Number(x.prix_unitaire_fige)]) });
  }
  if (code === 'controle_stock') {
    return JSON.stringify({ l: L.map(x => [x.product_id, x.quantite, x.business_unit_id || null]) });
  }
  return '';
}

async function loadSteps(exec, templateId) {
  return exec.all('SELECT id, ordre, code, nom, role_code_requis FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [templateId]);
}
async function loadLines(exec, commandeId) {
  return exec.all('SELECT product_id, quantite, prix_unitaire_fige, business_unit_id FROM commande_lignes WHERE commande_id = $1 ORDER BY product_id', [commandeId]);
}

async function logEvent(exec, { commandeId, eventType, fromStatut, toStatut, stepCode, actorId, commentaire, payload }) {
  await exec.run(
    `INSERT INTO commande_historique (commande_id, event_type, from_statut, to_statut, step_code, acteur_user_id, commentaire, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [commandeId, eventType, fromStatut || null, toStatut || null, stepCode || null, actorId || null, commentaire || null, payload ? JSON.stringify(payload) : null]);
}

// Ouvre une étape : crée la ligne de validation « en_attente » (+ les lignes de contrôle stock par BU).
async function openStepAuto(exec, c, step, lines) {
  const sig = signatureForStep(step.code, c, lines);
  await exec.run('DELETE FROM commande_validations WHERE commande_id = $1 AND step_id = $2 AND statut = $3', [c.id, step.id, 'en_attente']);
  await exec.run(
    `INSERT INTO commande_validations (commande_id, step_id, step_code, role_code, statut, signature_contenu)
     VALUES ($1,$2,$3,$4,'en_attente',$5)`,
    [c.id, step.id, step.code, step.role_code_requis, sig]);
  if (step.code === 'controle_stock') {
    await exec.run('DELETE FROM commande_controle_stock WHERE commande_id = $1', [c.id]);
    const bus = [...new Set(lines.map(l => l.business_unit_id).filter(Boolean))];
    for (const buId of bus) {
      await exec.run('INSERT INTO commande_controle_stock (commande_id, business_unit_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.id, buId]);
    }
  }
}

async function setState(exec, id, stepId, statut) {
  await exec.run('UPDATE commandes_commerciales SET current_step_id = $1, statut = $2, updated_at = now() WHERE id = $3', [stepId, statut, id]);
}

// Avance depuis l'étape `fromStep` (déjà validée). Reporte automatiquement les étapes aval dont la
// signature est inchangée ; s'arrête à la première étape à (re)faire ; finalise si plus d'étape métier.
// Retourne { statut, notifs:[{role,message}], stepCode }.
async function advance(exec, c, steps, fromStep, actorId) {
  const lines = await loadLines(exec, c.id);
  const notifs = [];
  const idx = steps.findIndex(s => s.id === fromStep.id);
  for (let i = idx + 1; i < steps.length; i++) {
    const step = steps[i];
    if (!step.role_code_requis) { // étape système → finalisation (PDF au Lot 4)
      await setState(exec, c.id, step.id, 'valide');
      await logEvent(exec, { commandeId: c.id, eventType: 'validation_finale', toStatut: 'valide', stepCode: step.code, actorId });
      notifs.push({ userId: c.created_by, message: `Votre bon ${c.numero || ''} est validé.` });
      return { statut: 'valide', notifs, stepCode: step.code, finalized: true };
    }
    const sig = signatureForStep(step.code, c, lines);
    const prior = await exec.one(
      `SELECT signature_contenu FROM commande_validations WHERE commande_id = $1 AND step_id = $2 AND statut = 'validee' ORDER BY id DESC LIMIT 1`, [c.id, step.id]);
    if (prior && prior.signature_contenu === sig) {
      // Reprise intelligente : périmètre inchangé → report automatique, on continue.
      await exec.run(
        `INSERT INTO commande_validations (commande_id, step_id, step_code, role_code, statut, decided_by, decided_at, commentaire, signature_contenu)
         VALUES ($1,$2,$3,$4,'validee',$5,now(),$6,$7)`,
        [c.id, step.id, step.code, step.role_code_requis, actorId, 'Report automatique (périmètre inchangé)', sig]);
      continue;
    }
    await openStepAuto(exec, c, step, lines);
    await setState(exec, c.id, step.id, 'en_validation');
    notifs.push({ role: step.role_code_requis, message: `Bon ${c.numero || ''} : votre validation est requise (${step.nom}).` });
    return { statut: 'en_validation', notifs, stepCode: step.code, finalized: false };
  }
  await setState(exec, c.id, null, 'valide');
  notifs.push({ userId: c.created_by, message: `Votre bon ${c.numero || ''} est validé.` });
  return { statut: 'valide', notifs, stepCode: null, finalized: true };
}

// Notifie tous les titulaires actifs d'un rôle (cross-entité).
async function notifyRole(roleCode, type, message, lien) {
  const holders = await all('SELECT DISTINCT u.id FROM users u JOIN user_entity_roles uer ON uer.user_id = u.id WHERE u.actif = true AND uer.role_code = $1', [roleCode]);
  for (const h of holders) await notify(h.id, type, message, lien);
}
async function dispatch(commandeId, notifs) {
  for (const n of (notifs || [])) {
    if (n.role) await notifyRole(n.role, TYPE_NOTIF, n.message, LIEN(commandeId));
    else if (n.userId) await notify(n.userId, TYPE_NOTIF, n.message, LIEN(commandeId));
  }
}

// ── Soumission (appelée par la route submit, DANS sa transaction) ─────────────
// Ouvre la 1re étape et journalise. Le reste (numéro, statut, capacité) est posé par la route.
async function openFirstStep(tx, commande, step1, lines, actorId) {
  await openStepAuto(tx, commande, step1, lines);
  await logEvent(tx, { commandeId: commande.id, eventType: 'soumission', toStatut: 'en_validation', stepCode: step1.code, actorId });
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function currentStep(exec, c) {
  if (!c.current_step_id) return null;
  return exec.one('SELECT id, ordre, code, nom, role_code_requis FROM workflow_steps WHERE id = $1', [c.current_step_id]);
}

async function validateStep(commandeId, user, { commentaire } = {}) {
  const out = await withTransaction(async (tx) => {
    const c = await tx.one('SELECT * FROM commandes_commerciales WHERE id = $1 FOR UPDATE', [commandeId]);
    if (!c) throw err('Commande introuvable.', 404);
    if (c.statut !== 'en_validation') throw err('Cette commande n\'est pas en cours de validation.', 409);
    const step = await currentStep(tx, c);
    if (!step || !step.role_code_requis) throw err('Aucune étape de validation active.', 409);
    if (step.code === 'controle_stock') throw err('Étape stock : utilisez la confirmation de disponibilité par BU.', 409);
    if (!canActOnStep(user, step, c)) throw err('Vous n\'avez pas le rôle requis (ou la bonne entité) pour valider cette étape.', 403);
    const pending = await tx.one(`SELECT id FROM commande_validations WHERE commande_id = $1 AND step_id = $2 AND statut = 'en_attente' ORDER BY id DESC LIMIT 1`, [c.id, step.id]);
    if (!pending) throw err('Étape déjà traitée.', 409);
    await tx.run('UPDATE commande_validations SET statut = $1, decided_by = $2, decided_at = now(), commentaire = $3 WHERE id = $4', ['validee', user.id, commentaire || null, pending.id]);
    await logEvent(tx, { commandeId: c.id, eventType: 'validation', stepCode: step.code, actorId: user.id, commentaire });
    const steps = await loadSteps(tx, c.workflow_template_id);
    const res = await advance(tx, c, steps, step, user.id);
    return { notifs: res.notifs, statut: res.statut, finalized: res.finalized };
  });
  await dispatch(commandeId, out.notifs);
  if (out.finalized) { try { await pdf.generateAndStore(commandeId, user.id); } catch (e) { console.error('[commande pdf]', e.message); } }
  return out;
}

async function confirmStock(commandeId, user, { business_unit_id, disponible, commentaire } = {}) {
  const out = await withTransaction(async (tx) => {
    const c = await tx.one('SELECT * FROM commandes_commerciales WHERE id = $1 FOR UPDATE', [commandeId]);
    if (!c) throw err('Commande introuvable.', 404);
    if (c.statut !== 'en_validation') throw err('Cette commande n\'est pas en cours de validation.', 409);
    const step = await currentStep(tx, c);
    if (!step || step.code !== 'controle_stock') throw err('La commande n\'est pas à l\'étape de contrôle stock.', 409);
    if (!hasRoleAnywhere(user, 'gestionnaire_stock')) throw err('Rôle gestionnaire de stock requis.', 403);
    // Restriction par BU : un gestionnaire avec des BU accordées ne confirme que CELLES-CI.
    // (Sans aucune BU accordée => non restreint, comportement inchangé ; super_admin partout.)
    const visible = visibleBusinessUnitIds(user);
    if (visible && !visible.includes(Number(business_unit_id))) throw err('Vous n\'êtes pas habilité sur cette Business Unit.', 403);
    const row = await tx.one('SELECT id FROM commande_controle_stock WHERE commande_id = $1 AND business_unit_id = $2', [c.id, Number(business_unit_id)]);
    if (!row) throw err('BU non concernée par ce bon.', 400);
    await tx.run('UPDATE commande_controle_stock SET disponible = $1, confirme_par = $2, commentaire = $3, confirmed_at = now() WHERE id = $4',
      [disponible === true, user.id, commentaire || null, row.id]);
    await logEvent(tx, { commandeId: c.id, eventType: 'controle_stock', stepCode: step.code, actorId: user.id, commentaire, payload: { business_unit_id: Number(business_unit_id), disponible: disponible === true } });
    // L'étape est validée seulement quand TOUTES les BU sont confirmées disponibles.
    const remaining = await tx.one('SELECT COUNT(*)::int AS n FROM commande_controle_stock WHERE commande_id = $1 AND (disponible IS DISTINCT FROM TRUE)', [c.id]);
    if (remaining.n > 0) return { notifs: [], statut: 'en_validation', pendingBU: remaining.n };
    const pending = await tx.one(`SELECT id FROM commande_validations WHERE commande_id = $1 AND step_id = $2 AND statut = 'en_attente' ORDER BY id DESC LIMIT 1`, [c.id, step.id]);
    if (pending) await tx.run('UPDATE commande_validations SET statut = $1, decided_by = $2, decided_at = now(), commentaire = $3 WHERE id = $4', ['validee', user.id, 'Toutes les BU confirmées disponibles', pending.id]);
    const steps = await loadSteps(tx, c.workflow_template_id);
    const res = await advance(tx, c, steps, step, user.id);
    return { notifs: res.notifs, statut: res.statut, finalized: res.finalized };
  });
  await dispatch(commandeId, out.notifs);
  if (out.finalized) { try { await pdf.generateAndStore(commandeId, user.id); } catch (e) { console.error('[commande pdf]', e.message); } }
  return out;
}

async function returnStep(commandeId, user, { target_step_code, commentaire } = {}) {
  if (!commentaire || !commentaire.trim()) throw err('Un motif est obligatoire pour un retour.', 400);
  const out = await withTransaction(async (tx) => {
    const c = await tx.one('SELECT * FROM commandes_commerciales WHERE id = $1 FOR UPDATE', [commandeId]);
    if (!c) throw err('Commande introuvable.', 404);
    if (c.statut !== 'en_validation') throw err('Cette commande n\'est pas en cours de validation.', 409);
    const step = await currentStep(tx, c);
    if (!step) throw err('Aucune étape active.', 409);
    if (!canActOnStep(user, step, c)) throw err('Vous ne pouvez pas retourner à cette étape.', 403);
    // Clôt la validation en attente de l'étape courante.
    await tx.run(`UPDATE commande_validations SET statut = 'retournee', decided_by = $1, decided_at = now(), commentaire = $2 WHERE commande_id = $3 AND step_id = $4 AND statut = 'en_attente'`, [user.id, commentaire, c.id, step.id]);

    if (target_step_code === 'createur') {
      await setState(tx, c.id, null, 'brouillon');
      await logEvent(tx, { commandeId: c.id, eventType: 'retour', fromStatut: 'en_validation', toStatut: 'brouillon', stepCode: step.code, actorId: user.id, commentaire });
      return { notifs: [{ userId: c.created_by, message: `Bon ${c.numero || ''} retourné pour complément : ${commentaire}` }], statut: 'brouillon' };
    }
    const steps = await loadSteps(tx, c.workflow_template_id);
    const target = steps.find(s => s.code === target_step_code);
    if (!target || target.ordre >= step.ordre) throw err('Étape cible de retour invalide (doit être une étape précédente).', 400);
    const lines = await loadLines(tx, c.id);
    await openStepAuto(tx, c, target, lines);
    await setState(tx, c.id, target.id, 'en_validation');
    await logEvent(tx, { commandeId: c.id, eventType: 'retour', stepCode: target.code, actorId: user.id, commentaire });
    return { notifs: [{ role: target.role_code_requis, message: `Bon ${c.numero || ''} retourné à l'étape « ${target.nom} » : ${commentaire}` }], statut: 'en_validation' };
  });
  await dispatch(commandeId, out.notifs);
  return out;
}

async function cancelOrder(commandeId, user, { motif } = {}) {
  if (!motif || !motif.trim()) throw err('Un motif d\'annulation est obligatoire.', 400);
  const out = await withTransaction(async (tx) => {
    const c = await tx.one('SELECT * FROM commandes_commerciales WHERE id = $1 FOR UPDATE', [commandeId]);
    if (!c) throw err('Commande introuvable.', 404);
    if (!['en_validation', 'brouillon'].includes(c.statut)) throw err('Cette commande ne peut plus être annulée.', 409);
    const step = await currentStep(tx, c);
    const allowed = c.created_by === user.id || canActOnStep(user, step, c);
    if (!allowed) throw err('Vous ne pouvez pas annuler ce bon.', 403);
    await tx.run(`UPDATE commande_validations SET statut = 'rejetee', decided_by = $1, decided_at = now() WHERE commande_id = $2 AND statut = 'en_attente'`, [user.id, c.id]);
    await tx.run('UPDATE commandes_commerciales SET statut = $1, motif_annulation = $2, updated_at = now() WHERE id = $3', ['annulee', motif, c.id]);
    await logEvent(tx, { commandeId: c.id, eventType: 'annulation', fromStatut: c.statut, toStatut: 'annulee', stepCode: step ? step.code : null, actorId: user.id, commentaire: motif });
    return { notifs: [{ userId: c.created_by, message: `Bon ${c.numero || ''} annulé : ${motif}` }], statut: 'annulee' };
  });
  await dispatch(commandeId, out.notifs);
  return out;
}

async function getWorkflow(commandeId) {
  const c = await one('SELECT id, statut, current_step_id, workflow_template_id FROM commandes_commerciales WHERE id = $1', [commandeId]);
  if (!c) return null;
  const steps = c.workflow_template_id
    ? await all('SELECT id, ordre, code, nom, role_code_requis FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre', [c.workflow_template_id]) : [];
  const validations = await all(
    `SELECT v.id, v.step_id, v.step_code, v.role_code, v.statut, v.commentaire, v.decided_at,
            TRIM(CONCAT(u.prenom,' ',u.nom)) AS decided_by_nom
       FROM commande_validations v LEFT JOIN users u ON u.id = v.decided_by
      WHERE v.commande_id = $1 ORDER BY v.id`, [commandeId]);
  const stock = await all(
    `SELECT s.business_unit_id, s.disponible, s.commentaire, s.confirmed_at, bu.nom AS business_unit_nom,
            TRIM(CONCAT(u.prenom,' ',u.nom)) AS confirme_par_nom
       FROM commande_controle_stock s
       LEFT JOIN business_units bu ON bu.id = s.business_unit_id
       LEFT JOIN users u ON u.id = s.confirme_par
      WHERE s.commande_id = $1 ORDER BY bu.nom`, [commandeId]);
  const historique = await all(
    `SELECT h.event_type, h.step_code, h.commentaire, h.to_statut, h.created_at,
            TRIM(CONCAT(u.prenom,' ',u.nom)) AS acteur_nom
       FROM commande_historique h LEFT JOIN users u ON u.id = h.acteur_user_id
      WHERE h.commande_id = $1 ORDER BY h.id`, [commandeId]);
  return { statut: c.statut, current_step_id: c.current_step_id, steps, validations, stock, historique };
}

module.exports = {
  signatureForStep, openFirstStep, validateStep, confirmStock, returnStep, cancelOrder, getWorkflow, notifyRole,
};
