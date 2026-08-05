const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, requireSuperAdmin } = require('../../middleware/permissions');
const alerts = require('./echeance-alerts');

// Documents & échéances véhicule (métadonnées + lien, pas de fichier). CRUD explicite (plutôt que la
// factory) pour exposer l'endpoint /echeances agrégé. Rattaché au sous-module Parc.
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('logistique.parc');
const COLS = ['vehicle_id', 'type', 'numero', 'date_debut', 'date_fin', 'lien', 'notes'];
const clean = v => (v === '' || v === undefined ? null : v);

// Vue Échéances : tous les documents datés, du plus urgent au moins urgent, avec le nb de jours
// restants (négatif = déjà expiré). Défini AVANT /:id pour ne pas être capté par la route dynamique.
router.get('/echeances', requireSubModule('logistique.parc'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT d.id, d.type, d.numero, d.date_fin, d.lien, d.vehicle_id,
              v.immatriculation AS vehicle_immat,
              (d.date_fin - CURRENT_DATE) AS jours_restants
       FROM vehicle_documents d
       JOIN vehicles v ON v.id = d.vehicle_id
       WHERE d.date_fin IS NOT NULL
       ORDER BY d.date_fin ASC`
    ));
  } catch (e) { next(e); }
});

// Envoi immédiat du récap des échéances (test / relance manuelle), aux destinataires configurés
// ou, à défaut, à l'utilisateur connecté. Réservé au super_admin (config d'alerte = niveau admin).
router.post('/echeances/test-alert', requireSuperAdmin, async (req, res, next) => {
  try {
    const { jours, emails } = await alerts.getConfig();
    const to = emails.length ? emails : [req.user.email].filter(Boolean);
    if (!to.length) return res.status(400).json({ error: 'Aucun destinataire (configurez des emails ou ayez une adresse sur votre compte).' });
    const r = await alerts.sendDigestTo(to, jours || 30);
    res.json({ ...r, to });
  } catch (e) { next(e); }
});

router.get('/', requireSubModule('logistique.parc'), async (req, res, next) => {
  try {
    const params = []; let where = '';
    if (req.query.vehicle_id) { params.push(Number(req.query.vehicle_id)); where = 'WHERE vehicle_id = $1'; }
    res.json(await all(`SELECT id, ${COLS.join(', ')} FROM vehicle_documents ${where} ORDER BY date_fin NULLS LAST, id DESC`, params));
  } catch (e) { next(e); }
});

router.get('/:id', requireSubModule('logistique.parc'), async (req, res, next) => {
  try {
    const row = await one(`SELECT id, ${COLS.join(', ')} FROM vehicle_documents WHERE id = $1`, [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Document introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', requireCreate, async (req, res, next) => {
  try {
    if (!req.body || !req.body.vehicle_id) return res.status(400).json({ error: 'Véhicule requis.' });
    if (!req.body.type) return res.status(400).json({ error: 'Type de document requis.' });
    const values = COLS.map(c => clean(req.body[c]));
    const row = await one(
      `INSERT INTO vehicle_documents (${COLS.join(', ')}) VALUES (${COLS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, ${COLS.join(', ')}`,
      values
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireEdit, async (req, res, next) => {
  try {
    const existing = await one(`SELECT id, ${COLS.join(', ')} FROM vehicle_documents WHERE id = $1`, [Number(req.params.id)]);
    if (!existing) return res.status(404).json({ error: 'Document introuvable.' });
    const values = COLS.map(c => (req.body[c] === undefined ? existing[c] : clean(req.body[c])));
    const setClause = COLS.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const row = await one(
      `UPDATE vehicle_documents SET ${setClause} WHERE id = $${COLS.length + 1} RETURNING id, ${COLS.join(', ')}`,
      [...values, Number(req.params.id)]
    );
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireEdit, async (req, res, next) => {
  try { await run('DELETE FROM vehicle_documents WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

module.exports = router;
