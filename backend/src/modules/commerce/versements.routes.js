const express = require('express');
const multer = require('multer');
const { all, one, run, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const {
  requireSubModule, visibleBusinessUnitIds, canWriteBusinessUnit,
} = require('../../middleware/permissions');
const { logAction } = require('../audit/audit.service');
const blob = require('../../storage/blob');

// Versements commerciaux. Modèle normalisé : en-tête (commercial_payments) + lignes par moyen
// (commercial_payment_details). Workflow de validation OPTIONNEL (paramètre global ou par BU) :
// désactivé → la saisie enregistre directement en statut « validé » ; activé → brouillon/soumis/validé.
// Aucune suppression physique : on annule (statut). Toutes les opérations sensibles sont auditées.
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Workflow actif pour une BU ? Surcharge BU sinon valeur globale (sinon false).
async function workflowActif(buId) {
  const rows = await all("SELECT business_unit_id, valeur FROM commerce_settings WHERE cle = 'workflow_actif'");
  const bu = rows.find(r => Number(r.business_unit_id) === Number(buId));
  if (bu) return bu.valeur === 'true';
  const g = rows.find(r => r.business_unit_id === null);
  return g ? g.valeur === 'true' : false;
}

const HEADER_SELECT = `
  SELECT cp.*,
         TO_CHAR(cp.payment_date, 'YYYY-MM-DD') AS payment_date,
         c.code AS commercial_code,
         COALESCE(e.nom, c.nom) AS commercial_nom, COALESCE(e.prenom, c.prenom) AS commercial_prenom,
         bu.code AS business_unit_code, bu.nom AS business_unit_nom,
         p.designation AS product_nom,
         TRIM(CONCAT(uc.prenom, ' ', uc.nom)) AS cree_par,
         TRIM(CONCAT(uv.prenom, ' ', uv.nom)) AS valide_par
    FROM commercial_payments cp
    JOIN commerciaux c        ON c.id = cp.commercial_id
    LEFT JOIN employees e     ON e.id = c.employee_id
    LEFT JOIN business_units bu ON bu.id = cp.business_unit_id
    LEFT JOIN products p      ON p.id = cp.product_id
    LEFT JOIN users uc        ON uc.id = cp.created_by
    LEFT JOIN users uv        ON uv.id = cp.validated_by`;

// Nettoie et valide les lignes de moyens. Renvoie { lines, total } ou lève une erreur 400.
async function normalizeLines(rawLines) {
  const methods = await all('SELECT id, code, libelle, requiert_reference FROM payment_methods');
  const byId = Object.fromEntries(methods.map(m => [m.id, m]));
  const lines = [];
  for (const l of rawLines || []) {
    const amount = Number(l.amount);
    if (!l.payment_method_id || !Number.isFinite(amount) || amount <= 0) continue; // ignore lignes vides
    const m = byId[Number(l.payment_method_id)];
    if (!m) { const e = new Error('Moyen de versement inconnu.'); e.status = 400; throw e; }
    if (m.requiert_reference && !(l.transaction_reference || '').trim()) {
      const e = new Error(`Référence obligatoire pour le moyen « ${m.libelle} ».`); e.status = 400; throw e;
    }
    if (m.code === 'banque' && !l.bank_id) {
      const e = new Error('Banque obligatoire pour un versement bancaire.'); e.status = 400; throw e;
    }
    lines.push({
      payment_method_id: Number(l.payment_method_id),
      amount,
      bank_id: l.bank_id ? Number(l.bank_id) : null,
      transaction_reference: (l.transaction_reference || '').trim() || null,
      transaction_date: l.transaction_date || null,
      commentaire: (l.commentaire || '').trim() || null,
    });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total };
}

// --- Lecture --------------------------------------------------------------------------------

router.get('/', requireAuth, requireSubModule('commerce.versements'), async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible) { params.push(visible); where.push(`cp.business_unit_id = ANY($${params.length})`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`cp.business_unit_id = $${params.length}`); }
    if (req.query.commercial_id) { params.push(Number(req.query.commercial_id)); where.push(`cp.commercial_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`cp.status = $${params.length}`); }
    if (req.query.date_from) { params.push(req.query.date_from); where.push(`cp.payment_date >= $${params.length}`); }
    if (req.query.date_to) { params.push(req.query.date_to); where.push(`cp.payment_date <= $${params.length}`); }
    const sql = HEADER_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '')
      + ' ORDER BY cp.payment_date DESC, cp.id DESC LIMIT 500';
    res.json(await all(sql, params));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, requireSubModule('commerce.versements'), async (req, res, next) => {
  try {
    const header = await one(HEADER_SELECT + ' WHERE cp.id = $1', [Number(req.params.id)]);
    if (!header) return res.status(404).json({ error: 'Versement introuvable.' });
    const visible = visibleBusinessUnitIds(req.user);
    if (visible && header.business_unit_id && !visible.includes(header.business_unit_id)) {
      return res.status(404).json({ error: 'Versement introuvable.' });
    }
    const lines = await all(`
      SELECT d.*, TO_CHAR(d.transaction_date, 'YYYY-MM-DD') AS transaction_date,
             pm.code AS method_code, pm.libelle AS method_libelle, b.nom AS bank_nom
        FROM commercial_payment_details d
        JOIN payment_methods pm ON pm.id = d.payment_method_id
        LEFT JOIN banks b ON b.id = d.bank_id
       WHERE d.commercial_payment_id = $1 ORDER BY d.id`, [header.id]);
    const attachments = await all(`
      SELECT id, filename, mimetype, taille, uploaded_at, commercial_payment_detail_id
        FROM attachments WHERE commercial_payment_id = $1 ORDER BY uploaded_at`, [header.id]);
    res.json({ ...header, lines, attachments });
  } catch (e) { next(e); }
});

// --- Création / modification ---------------------------------------------------------------

router.post('/', requireAuth, requireSubModule('commerce.versements', 'ajout'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.commercial_id) return res.status(400).json({ error: 'Commercial obligatoire.' });
    if (!b.payment_date) return res.status(400).json({ error: 'Date obligatoire.' });
    const commercial = await one('SELECT id, business_unit_id FROM commerciaux WHERE id = $1', [Number(b.commercial_id)]);
    if (!commercial) return res.status(400).json({ error: 'Commercial inconnu.' });
    const buId = b.business_unit_id ? Number(b.business_unit_id) : commercial.business_unit_id;
    if (!buId) return res.status(400).json({ error: 'BU obligatoire (le commercial n’a pas de BU).' });
    if (!canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: 'BU non autorisée.' });

    const { lines, total } = await normalizeLines(b.lines);
    if (!lines.length) return res.status(400).json({ error: 'Renseignez au moins un montant.' });

    const actif = await workflowActif(buId);
    const status = actif ? (b.soumettre ? 'soumis' : 'brouillon') : 'valide';

    const id = await withTransaction(async (tx) => {
      const h = await tx.one(`
        INSERT INTO commercial_payments
          (commercial_id, assignment_id, business_unit_id, product_id, payment_date, total_amount,
           reference_generale, commentaire, status, created_by, updated_by, submitted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) RETURNING id`,
        [Number(b.commercial_id), b.assignment_id || null, buId, b.product_id || null, b.payment_date, total,
         (b.reference_generale || '').trim() || null, (b.commentaire || '').trim() || null,
         status, req.user.id, status === 'soumis' ? new Date() : null]);
      await tx.run("UPDATE commercial_payments SET reference = 'VER-' || LPAD(id::text, 5, '0') WHERE id = $1", [h.id]);
      for (const l of lines) {
        await tx.run(`INSERT INTO commercial_payment_details
          (commercial_payment_id, payment_method_id, amount, bank_id, transaction_reference, transaction_date, commentaire)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [h.id, l.payment_method_id, l.amount, l.bank_id, l.transaction_reference, l.transaction_date, l.commentaire]);
      }
      return h.id;
    });
    await logAction({ tableName: 'commercial_payments', recordId: id, action: 'creation', userId: req.user.id, details: { total, status } });
    res.status(201).json(await one(HEADER_SELECT + ' WHERE cp.id = $1', [id]));
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Modification autorisée tant que le versement n'est pas verrouillé (validé/annulé) — sauf super_admin.
router.put('/:id', requireAuth, requireSubModule('commerce.versements', 'edition'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = await one('SELECT * FROM commercial_payments WHERE id = $1', [id]);
    if (!cur) return res.status(404).json({ error: 'Versement introuvable.' });
    if (!canWriteBusinessUnit(req.user, cur.business_unit_id)) return res.status(403).json({ error: 'BU non autorisée.' });
    if (['valide', 'annule'].includes(cur.status)) {
      return res.status(409).json({ error: 'Un versement validé ou annulé ne peut être modifié.' });
    }
    const b = req.body || {};
    const { lines, total } = await normalizeLines(b.lines);
    if (!lines.length) return res.status(400).json({ error: 'Renseignez au moins un montant.' });
    await withTransaction(async (tx) => {
      await tx.run(`UPDATE commercial_payments SET payment_date = $2, product_id = $3, reference_generale = $4,
                      commentaire = $5, total_amount = $6, updated_by = $7, updated_at = now() WHERE id = $1`,
        [id, b.payment_date || cur.payment_date, b.product_id || null,
         (b.reference_generale || '').trim() || null, (b.commentaire || '').trim() || null, total, req.user.id]);
      await tx.run('DELETE FROM commercial_payment_details WHERE commercial_payment_id = $1', [id]);
      for (const l of lines) {
        await tx.run(`INSERT INTO commercial_payment_details
          (commercial_payment_id, payment_method_id, amount, bank_id, transaction_reference, transaction_date, commentaire)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, l.payment_method_id, l.amount, l.bank_id, l.transaction_reference, l.transaction_date, l.commentaire]);
      }
    });
    await logAction({ tableName: 'commercial_payments', recordId: id, action: 'modification', userId: req.user.id, details: { total } });
    res.json(await one(HEADER_SELECT + ' WHERE cp.id = $1', [id]));
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// --- Transitions de statut (workflow) ------------------------------------------------------

async function transition(req, res, next, { from, to, setValidated, useMotif }) {
  try {
    const id = Number(req.params.id);
    const cur = await one('SELECT * FROM commercial_payments WHERE id = $1', [id]);
    if (!cur) return res.status(404).json({ error: 'Versement introuvable.' });
    if (!canWriteBusinessUnit(req.user, cur.business_unit_id)) return res.status(403).json({ error: 'BU non autorisée.' });
    if (from && !from.includes(cur.status)) return res.status(409).json({ error: `Transition impossible depuis « ${cur.status} ».` });
    const sets = ['status = $2', 'updated_by = $3', 'updated_at = now()'];
    const params = [id, to, req.user.id];
    if (to === 'soumis') sets.push('submitted_at = now()');
    if (setValidated) sets.push('validated_by = $3', 'validated_at = now()');
    if (useMotif) { params.push((req.body || {}).motif || null); sets.push(`motif = $${params.length}`); }
    await run(`UPDATE commercial_payments SET ${sets.join(', ')} WHERE id = $1`, params);
    await logAction({ tableName: 'commercial_payments', recordId: id, action: to, userId: req.user.id, details: { depuis: cur.status, motif: (req.body || {}).motif } });
    res.json(await one(HEADER_SELECT + ' WHERE cp.id = $1', [id]));
  } catch (e) { next(e); }
}

// Soumettre : brouillon/rejeté → soumis (ajout suffit).
router.post('/:id/submit', requireAuth, requireSubModule('commerce.versements', 'ajout'), (req, res, next) =>
  transition(req, res, next, { from: ['brouillon', 'rejete'], to: 'soumis' }));

// Valider : soumis → validé (niveau édition = droit de valider, cf. décision projet).
router.post('/:id/validate', requireAuth, requireSubModule('commerce.versements', 'edition'), (req, res, next) =>
  transition(req, res, next, { from: ['soumis'], to: 'valide', setValidated: true }));

// Rejeter : soumis → rejeté (motif conseillé).
router.post('/:id/reject', requireAuth, requireSubModule('commerce.versements', 'edition'), (req, res, next) =>
  transition(req, res, next, { from: ['soumis'], to: 'rejete', useMotif: true }));

// Annuler : jamais de suppression physique.
router.post('/:id/cancel', requireAuth, requireSubModule('commerce.versements', 'edition'), (req, res, next) =>
  transition(req, res, next, { from: ['brouillon', 'soumis', 'valide', 'rejete'], to: 'annule', useMotif: true }));

// --- Pièces justificatives -----------------------------------------------------------------

router.post('/:id/attachments', requireAuth, requireSubModule('commerce.versements', 'ajout'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    const id = Number(req.params.id);
    const cur = await one('SELECT id, business_unit_id FROM commercial_payments WHERE id = $1', [id]);
    if (!cur) return res.status(404).json({ error: 'Versement introuvable.' });
    if (!canWriteBusinessUnit(req.user, cur.business_unit_id)) return res.status(403).json({ error: 'BU non autorisée.' });
    const key = await blob.putBuffer(req.file.buffer, req.file.mimetype, 'commerce');
    const detailId = req.body.detail_id ? Number(req.body.detail_id) : null;
    const row = await one(`INSERT INTO attachments
        (commercial_payment_id, commercial_payment_detail_id, filename, mimetype, content, content_key, taille, uploaded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [id, detailId, req.file.originalname, req.file.mimetype, key ? null : req.file.buffer, key, req.file.size, req.user.id]);
    await logAction({ tableName: 'commercial_payments', recordId: id, action: 'justificatif_ajout', userId: req.user.id, details: { attachmentId: row.id, filename: req.file.originalname } });
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.get('/attachments/:attId', requireAuth, requireSubModule('commerce.versements'), async (req, res, next) => {
  try {
    const att = await one(`SELECT a.*, cp.business_unit_id FROM attachments a
        JOIN commercial_payments cp ON cp.id = a.commercial_payment_id WHERE a.id = $1`, [Number(req.params.attId)]);
    if (!att) return res.status(404).json({ error: 'Pièce introuvable.' });
    const visible = visibleBusinessUnitIds(req.user);
    if (visible && att.business_unit_id && !visible.includes(att.business_unit_id)) return res.status(404).json({ error: 'Pièce introuvable.' });
    const buf = att.content_key ? await blob.getBuffer(att.content_key) : att.content;
    res.setHeader('Content-Type', att.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${att.filename}"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.delete('/attachments/:attId', requireAuth, requireSubModule('commerce.versements', 'edition'), async (req, res, next) => {
  try {
    const att = await one(`SELECT a.content_key, a.commercial_payment_id, cp.business_unit_id, cp.status
        FROM attachments a JOIN commercial_payments cp ON cp.id = a.commercial_payment_id WHERE a.id = $1`, [Number(req.params.attId)]);
    if (!att) return res.status(404).json({ error: 'Pièce introuvable.' });
    if (!canWriteBusinessUnit(req.user, att.business_unit_id)) return res.status(403).json({ error: 'BU non autorisée.' });
    if (att.content_key) await blob.del(att.content_key);
    await run('DELETE FROM attachments WHERE id = $1', [Number(req.params.attId)]);
    await logAction({ tableName: 'commercial_payments', recordId: att.commercial_payment_id, action: 'justificatif_suppression', userId: req.user.id, details: {} });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
