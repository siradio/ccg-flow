const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');

// Cartographie / suivi GPS. Alimenté manuellement aujourd'hui, par le prestataire SAT demain
// (même endpoint POST /). La carte consomme /latest (dernière position par véhicule) ; l'historique
// par véhicule prépare le tracé des trajets de mission.
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate } = requireSubModuleWrite('logistique.suivi');

const num = v => (v === '' || v === null || v === undefined ? null : Number(v));

// Dernière position connue de chaque véhicule (pour les marqueurs de la carte).
router.get('/latest', requireSubModule('logistique.suivi'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT DISTINCT ON (vp.vehicle_id)
              vp.vehicle_id, vp.lat, vp.lng, vp.speed, vp.heading, vp.ignition, vp.source, vp.recorded_at,
              v.immatriculation AS vehicle_immat, v.marque, v.statut AS vehicle_statut
       FROM vehicle_positions vp
       JOIN vehicles v ON v.id = vp.vehicle_id
       ORDER BY vp.vehicle_id, vp.recorded_at DESC`
    ));
  } catch (e) { next(e); }
});

// Historique (trajet) d'un véhicule, du plus ancien au plus récent — pour tracer une polyline.
router.get('/vehicle/:vehicleId', requireSubModule('logistique.suivi'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT id, lat, lng, speed, heading, ignition, source, recorded_at
       FROM vehicle_positions WHERE vehicle_id = $1
       ORDER BY recorded_at ASC LIMIT 1000`,
      [Number(req.params.vehicleId)]
    ));
  } catch (e) { next(e); }
});

// Enregistre une position. Utilisé par la saisie manuelle et, à terme, par le connecteur SAT.
router.post('/', requireCreate, async (req, res, next) => {
  try {
    const { vehicle_id, lat, lng, speed, heading, ignition, odometer, source } = req.body || {};
    if (!vehicle_id) return res.status(400).json({ error: 'Véhicule requis.' });
    const la = num(lat); const lo = num(lng);
    if (la === null || lo === null || Number.isNaN(la) || Number.isNaN(lo)) {
      return res.status(400).json({ error: 'Latitude et longitude requises.' });
    }
    if (la < -90 || la > 90 || lo < -180 || lo > 180) {
      return res.status(400).json({ error: 'Coordonnées hors limites.' });
    }
    const row = await one(
      `INSERT INTO vehicle_positions (vehicle_id, lat, lng, speed, heading, ignition, odometer, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [Number(vehicle_id), la, lo, num(speed), num(heading),
       ignition === undefined ? null : !!ignition, num(odometer),
       source === 'sat' ? 'sat' : 'manuel']
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

module.exports = router;
