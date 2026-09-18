const express = require('express');
const multer = require('multer');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { isSuperAdmin, hasRoleOnEntity } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');
const blob = require('../../storage/blob');
const service = require('./rh.service');
const repo = require('./rh.repository');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);
const CHAIN = ['responsable', 'rh'];

function canView(user, req) {
  if (req.created_by === user.id || isSuperAdmin(user)) return true;
  return (user.roles || []).some(r => (r.role_code === 'rh' || CHAIN.includes(r.role_code)) && Number(r.entity_id) === Number(req.entity_id));
}

// Types RH (congés / motifs d'absence / recrutement) — pour les formulaires.
router.get('/types', async (req, res, next) => {
  try {
    const domaine = req.query.domaine;
    const rows = domaine
      ? await all('SELECT * FROM rh_types WHERE actif = true AND domaine = $1 ORDER BY ordre, libelle', [domaine])
      : await all('SELECT * FROM rh_types WHERE actif = true ORDER BY domaine, ordre, libelle');
    res.json(rows);
  } catch (e) { next(e); }
});

// ── Paramètres RH : gestion des types (congé / absence / recrutement) ─────────────
// Réservé au RH (rôle `rh` sur une entité) et aux super_admin. La table rh_types est globale
// (non rattachée à une entité) : un seul jeu de types pour toute l'organisation.
function canManageTypes(user) {
  return isSuperAdmin(user) || (user.roles || []).some(r => r.role_code === 'rh');
}
const TYPE_DOMAINES = ['conge', 'absence', 'recrutement'];

function parseType(b) {
  const domaine = String(b.domaine || '').trim();
  const code = String(b.code || '').trim();
  const libelle = String(b.libelle || '').trim();
  if (!TYPE_DOMAINES.includes(domaine)) throw httpError(400, 'Domaine invalide.');
  if (!code) throw httpError(400, 'Le code est obligatoire.');
  if (!libelle) throw httpError(400, 'Le libellé est obligatoire.');
  let jours = b.jours_accordes;
  jours = (jours === '' || jours == null) ? null : Number(jours);
  if (jours != null && (!Number.isInteger(jours) || jours < 0)) throw httpError(400, 'Jours accordés : entier positif attendu.');
  return {
    domaine, code, libelle, jours_accordes: jours,
    imputable_solde: !!b.imputable_solde,
    justificatif_requis: !!b.justificatif_requis,
    actif: b.actif == null ? true : !!b.actif,
    ordre: Number(b.ordre) || 0,
  };
}

router.get('/admin/types', async (req, res, next) => {
  try {
    if (!canManageTypes(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
    res.json(await all('SELECT * FROM rh_types ORDER BY domaine, ordre, libelle'));
  } catch (e) { next(e); }
});

router.post('/admin/types', async (req, res, next) => {
  try {
    if (!canManageTypes(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
    const t = parseType(req.body || {});
    const row = await one(
      `INSERT INTO rh_types (domaine, code, libelle, jours_accordes, imputable_solde, justificatif_requis, actif, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [t.domaine, t.code, t.libelle, t.jours_accordes, t.imputable_solde, t.justificatif_requis, t.actif, t.ordre]);
    res.status(201).json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce couple domaine + code existe déjà.' }); next(e); }
});

router.put('/admin/types/:id', async (req, res, next) => {
  try {
    if (!canManageTypes(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
    const t = parseType(req.body || {});
    const row = await one(
      `UPDATE rh_types SET domaine=$1, code=$2, libelle=$3, jours_accordes=$4, imputable_solde=$5,
              justificatif_requis=$6, actif=$7, ordre=$8 WHERE id=$9 RETURNING *`,
      [t.domaine, t.code, t.libelle, t.jours_accordes, t.imputable_solde, t.justificatif_requis, t.actif, t.ordre, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Type introuvable.' });
    res.json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce couple domaine + code existe déjà.' }); next(e); }
});

router.delete('/admin/types/:id', async (req, res, next) => {
  try {
    if (!canManageTypes(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
    await run('DELETE FROM rh_types WHERE id=$1', [Number(req.params.id)]);
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Ce type est utilisé par des demandes : désactivez-le au lieu de le supprimer.' });
    next(e);
  }
});

// Jours ouvrables entre deux dates (calcul en direct côté formulaire).
router.get('/working-days', async (req, res, next) => {
  try { res.json({ jours: await service.workingDays(req.query.from, req.query.to) }); }
  catch (e) { next(e); }
});

// Listes : mine (mes demandes), pending (à valider), all (RH).
router.get('/requests', async (req, res, next) => {
  try {
    const scope = req.query.scope || 'mine';
    if (scope === 'pending') return res.json(await service.listPending(req.user));
    if (scope === 'all') {
      if (!service.canSeeAll(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
      return res.json(await service.listAll(req.user));
    }
    res.json(await service.listMine(req.user));
  } catch (e) { next(e); }
});

router.post('/requests/absence', async (req, res, next) => {
  try { res.status(201).json(await service.createAbsence(req.user, req.body || {})); }
  catch (e) { next(e); }
});

router.post('/requests/conge', async (req, res, next) => {
  try { res.status(201).json(await service.createConge(req.user, req.body || {})); }
  catch (e) { next(e); }
});

router.post('/requests/recrutement', async (req, res, next) => {
  try { res.status(201).json(await service.createRecrutement(req.user, req.body || {})); }
  catch (e) { next(e); }
});

router.post('/requests/cdi', async (req, res, next) => {
  try { res.status(201).json(await service.createCdi(req.user, req.body || {})); }
  catch (e) { next(e); }
});

// Liste légère d'employés pour les sélecteurs RH (ex. employé concerné par un passage CDD→CDI).
// Accessible à tout utilisateur authentifié du module RH (pas besoin du droit d'admin employés).
router.get('/employees', async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT e.id, e.matricule, e.nom, e.prenom, e.type_contrat, e.entity_id, ent.code AS entity_code
       FROM employees e JOIN entities ent ON ent.id = e.entity_id
       WHERE e.statut <> 'sorti' ORDER BY e.nom, e.prenom`
    ));
  } catch (e) { next(e); }
});

// Solde de congés du demandeur (pour le formulaire de demande de congé).
router.get('/conge-solde', async (req, res, next) => {
  try { res.json(await service.getMyCongeSolde(req.user)); }
  catch (e) { next(e); }
});

// Tableau de bord RH (agrégats) — réservé aux détenteurs d'un rôle de validation RH / super_admin.
router.get('/dashboard', async (req, res, next) => {
  try {
    if (!service.canSeeDashboard(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
    res.json(await service.getDashboard(req.user));
  } catch (e) { next(e); }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const detail = await service.getDetail(Number(req.params.id));
    if (!detail) return res.status(404).json({ error: 'Demande introuvable.' });
    if (!canView(req.user, detail)) return res.status(403).json({ error: 'Accès refusé.' });
    res.json({ ...detail, can_delete: service.canDelete(req.user, detail) });
  } catch (e) { next(e); }
});

router.post('/requests/:id/submit', async (req, res, next) => {
  try { res.json(await service.submit(req.user, Number(req.params.id))); } catch (e) { next(e); }
});
router.post('/requests/:id/validate', async (req, res, next) => {
  try { res.json(await service.validate(req.user, Number(req.params.id), (req.body || {}).comment)); } catch (e) { next(e); }
});
router.post('/requests/:id/reject', async (req, res, next) => {
  try { res.json(await service.reject(req.user, Number(req.params.id), (req.body || {}).comment)); } catch (e) { next(e); }
});
router.post('/requests/:id/cancel', async (req, res, next) => {
  try { res.json(await service.cancel(req.user, Number(req.params.id), (req.body || {}).comment)); } catch (e) { next(e); }
});
// Suppression définitive — réservée aux RH et aux administrateurs (voir service.canDelete).
router.delete('/requests/:id', async (req, res, next) => {
  try { res.json(await service.remove(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

// Pièces jointes (justificatifs).
router.post('/requests/:id/attachments', upload.single('file'), async (req, res, next) => {
  try {
    const reqRow = await repo.getById(Number(req.params.id));
    if (!reqRow) return res.status(404).json({ error: 'Demande introuvable.' });
    if (!canView(req.user, reqRow)) return res.status(403).json({ error: 'Accès refusé.' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PDF, PNG, JPEG.' });
    const key = await blob.putBuffer(req.file.buffer, req.file.mimetype, 'rh');
    const att = await repo.addAttachment({
      rhRequestId: reqRow.id, filename: req.file.originalname, mime: req.file.mimetype,
      taille: req.file.size, content: key ? null : req.file.buffer, contentKey: key, uploadedBy: req.user.id,
    });
    await repo.logHistory(reqRow.id, 'piece_jointe', req.user.id, req.file.originalname);
    res.status(201).json(att);
  } catch (e) { next(e); }
});

router.get('/attachments/:attId', async (req, res, next) => {
  try {
    const att = await repo.getAttachment(Number(req.params.attId));
    if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
    const reqRow = await repo.getById(att.rh_request_id);
    if (!reqRow || !canView(req.user, reqRow)) return res.status(403).json({ error: 'Accès refusé.' });
    const buf = att.content_key ? await blob.getBuffer(att.content_key) : att.content;
    res.setHeader('Content-Type', att.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.filename)}"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.delete('/attachments/:attId', async (req, res, next) => {
  try {
    const att = await repo.getAttachment(Number(req.params.attId));
    if (!att) return res.json({ ok: true });
    const reqRow = await repo.getById(att.rh_request_id);
    if (!reqRow || (reqRow.created_by !== req.user.id && !isSuperAdmin(req.user))) return res.status(403).json({ error: 'Action réservée au demandeur.' });
    if (att.content_key) await blob.del(att.content_key);
    await repo.deleteAttachment(att.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
