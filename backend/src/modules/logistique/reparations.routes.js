const express = require('express');
const { pool, all, one } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');

// Réparations : lien panne ↔ garage, avec auto-statut du véhicule (Maintenance ↔ Disponible).
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('logistique.maintenance');

// Réparations en cours (pour l'écran Garages) : véhicule, garage, panne, depuis.
router.get('/', requireSubModule('logistique.maintenance'), async (req, res, next) => {
  try {
    const enCours = req.query.en_cours === 'true';
    res.json(await all(
      `SELECT r.id, r.cout, r.date_debut, r.date_fin, r.statut,
              p.reference AS panne_ref, v.immatriculation AS vehicle_immat, g.nom AS garage_nom
       FROM reparations r
       LEFT JOIN pannes p ON p.id = r.panne_id
       LEFT JOIN vehicles v ON v.id = p.vehicle_id
       LEFT JOIN garages g ON g.id = r.garage_id
       ${enCours ? "WHERE r.statut = 'En cours'" : ''}
       ORDER BY r.date_debut DESC`
    ));
  } catch (e) { next(e); }
});

// Ouvre une réparation : panne → « En réparation », véhicule → « Maintenance ».
router.post('/', requireCreate, async (req, res, next) => {
  const { panne_id, garage_id, cout, notes } = req.body || {};
  if (!panne_id || !garage_id) return res.status(400).json({ error: 'Panne et garage requis.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [panne] } = await client.query('SELECT id, vehicle_id FROM pannes WHERE id = $1', [Number(panne_id)]);
    if (!panne) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Panne introuvable.' }); }
    const { rows: [r] } = await client.query(
      `INSERT INTO reparations (panne_id, garage_id, cout, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [Number(panne_id), Number(garage_id), cout === '' || cout == null ? null : Number(cout), (notes || '').trim() || null, req.user.id]
    );
    await client.query("UPDATE pannes SET statut = 'En réparation' WHERE id = $1", [Number(panne_id)]);
    await client.query("UPDATE vehicles SET statut = 'Maintenance' WHERE id = $1", [panne.vehicle_id]);
    await client.query('COMMIT');
    res.status(201).json(r);
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// Clôture une réparation : panne → « Réparée », véhicule → « Disponible ».
router.post('/:id/close', requireEdit, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [rep] } = await client.query('SELECT * FROM reparations WHERE id = $1', [Number(req.params.id)]);
    if (!rep) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Réparation introuvable.' }); }
    const { cout } = req.body || {};
    await client.query(
      "UPDATE reparations SET statut = 'Clôturée', date_fin = now(), cout = COALESCE($1, cout) WHERE id = $2",
      [cout === '' || cout == null ? null : Number(cout), rep.id]
    );
    if (rep.panne_id) {
      const { rows: [panne] } = await client.query("UPDATE pannes SET statut = 'Réparée' WHERE id = $1 RETURNING vehicle_id", [rep.panne_id]);
      if (panne) await client.query("UPDATE vehicles SET statut = 'Disponible' WHERE id = $1", [panne.vehicle_id]);
    }
    await client.query('COMMIT');
    res.json(await one('SELECT * FROM reparations WHERE id = $1', [rep.id]));
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

module.exports = router;
