const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const { logAction } = require('../audit/audit.service');
const { computeAll } = require('./fuel.service');

// Module Logistique — Carburant. Pleins en station externe, saisis par le gestionnaire logistique.
// Consommation « plein à plein » + détection d'anomalies (voir fuel.service). Lecture ouverte au
// sous-module ; écriture par niveau. Parc global → pas de scoping BU ici.
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('logistique.carburant');
const canRead = requireSubModule('logistique.carburant');

const COLS = ['date_plein', 'vehicle_id', 'driver_id', 'compteur_km', 'litres', 'prix_unitaire',
  'montant', 'plein_complet', 'station', 'mode_paiement', 'reference', 'commentaire'];
const NUMERIC = new Set(['vehicle_id', 'driver_id', 'compteur_km', 'litres', 'prix_unitaire']);
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
const emptyToNull = v => (v === '' || v === null || v === undefined ? null : v);
const isDate = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
const inPeriod = (d, from, to) => { const s = String(d).slice(0, 10); return s >= from && s <= to; };

// Charge tous les pleins (éventuellement d'un véhicule), enrichis (distance/conso/anomalies/niveau)
// sur l'HISTORIQUE COMPLET du véhicule — nécessaire pour un calcul plein à plein correct.
async function loadComputed(vehicleId) {
  const vehs = await all('SELECT id, immatriculation, marque, conso_reference_l_100, capacite_reservoir, type_carburant FROM vehicles');
  const vehicleById = new Map(vehs.map(v => [v.id, v]));
  const params = []; let where = '';
  if (vehicleId) { params.push(vehicleId); where = 'WHERE f.vehicle_id = $1'; }
  const rows = await all(
    `SELECT f.*, TRIM(CONCAT(d.prenom, ' ', d.nom)) AS driver_nom
       FROM vehicle_fuel_entries f LEFT JOIN drivers d ON d.id = f.driver_id ${where}`, params);
  const enriched = computeAll(rows, vehicleById);
  for (const e of enriched) {
    const v = vehicleById.get(e.vehicle_id);
    e.vehicle_immat = v ? v.immatriculation : null;
    e.vehicle_marque = v ? v.marque : null;
    e.conso_reference_l_100 = v ? v.conso_reference_l_100 : null;
  }
  return enriched;
}

// Liste des pleins (filtrable par véhicule + période), triée du plus récent au plus ancien.
router.get('/', canRead, async (req, res, next) => {
  try {
    const vid = req.query.vehicle_id ? Number(req.query.vehicle_id) : null;
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : null;
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : null;
    let rows = await loadComputed(vid);
    if (from && to) rows = rows.filter(r => inPeriod(r.date_plein, from, to));
    rows.sort((a, b) => String(b.date_plein).localeCompare(String(a.date_plein)) || (Number(b.compteur_km || 0) - Number(a.compteur_km || 0)));
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.vehicle_id || !isDate(b.date_plein) || num(b.litres) == null || Number(b.litres) <= 0) {
      return res.status(400).json({ error: 'Véhicule, date et litres (> 0) sont obligatoires.' });
    }
    // Montant déduit si absent (litres × prix) — pratique à la saisie.
    let montant = num(b.montant);
    if (montant == null && num(b.litres) != null && num(b.prix_unitaire) != null) montant = Number(b.litres) * Number(b.prix_unitaire);
    const vals = COLS.map(c => {
      if (c === 'montant') return montant;
      if (c === 'plein_complet') return b[c] === false ? false : true;
      if (NUMERIC.has(c)) return num(b[c]);
      return emptyToNull(b[c]); // date_plein, station, mode_paiement, reference, commentaire
    });
    const placeholders = COLS.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(
      `INSERT INTO vehicle_fuel_entries (${COLS.join(', ')}, created_by, updated_by)
       VALUES (${placeholders}, $${COLS.length + 1}, $${COLS.length + 1}) RETURNING *`,
      [...vals, req.user.id]);
    // Met à jour le compteur du véhicule si ce plein est plus récent/élevé.
    if (num(b.compteur_km) != null) {
      await run('UPDATE vehicles SET compteur_km = $1 WHERE id = $2 AND (compteur_km IS NULL OR compteur_km < $1)', [Number(b.compteur_km), Number(b.vehicle_id)]);
    }
    await logAction({ tableName: 'vehicle_fuel_entries', recordId: row.id, action: 'creation', userId: req.user.id, details: { vehicle_id: b.vehicle_id, litres: b.litres } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ex = await one('SELECT * FROM vehicle_fuel_entries WHERE id = $1', [id]);
    if (!ex) return res.status(404).json({ error: 'Plein introuvable.' });
    const b = req.body || {};
    let montant = b.montant !== undefined ? num(b.montant) : ex.montant;
    if (b.montant === undefined && b.litres !== undefined && b.prix_unitaire !== undefined && num(b.litres) != null && num(b.prix_unitaire) != null) {
      montant = Number(b.litres) * Number(b.prix_unitaire);
    }
    const vals = COLS.map(c => {
      if (c === 'montant') return montant;
      if (b[c] === undefined) return ex[c];
      if (c === 'plein_complet') return b[c] === false ? false : true;
      if (NUMERIC.has(c)) return num(b[c]);
      return emptyToNull(b[c]);
    });
    const setClause = COLS.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const row = await one(
      `UPDATE vehicle_fuel_entries SET ${setClause}, updated_by = $${COLS.length + 1}, updated_at = now() WHERE id = $${COLS.length + 2} RETURNING *`,
      [...vals, req.user.id, id]);
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireEdit, async (req, res, next) => {
  try {
    await run('DELETE FROM vehicle_fuel_entries WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Workflow de traitement d'une anomalie : marquer « à vérifier » / « justifié » / « fraude » + note.
router.put('/:id/anomalie', requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const statut = req.body && req.body.statut_anomalie;
    if (!['ras', 'a_verifier', 'justifie', 'fraude'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
    const row = await one(
      `UPDATE vehicle_fuel_entries SET statut_anomalie = $1, anomalie_note = $2, anomalie_par = $3, anomalie_le = now(), updated_by = $3, updated_at = now()
       WHERE id = $4 RETURNING *`, [statut, (req.body.note || '').trim() || null, req.user.id, id]);
    if (!row) return res.status(404).json({ error: 'Plein introuvable.' });
    await logAction({ tableName: 'vehicle_fuel_entries', recordId: id, action: 'anomalie_' + statut, userId: req.user.id, details: { note: req.body.note || '' } });
    res.json(row);
  } catch (e) { next(e); }
});

// Rapport de consommation : agrégats par véhicule sur une période.
router.get('/report', canRead, async (req, res, next) => {
  try {
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : new Date().toISOString().slice(0, 8) + '01';
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const rows = (await loadComputed(req.query.vehicle_id ? Number(req.query.vehicle_id) : null)).filter(r => inPeriod(r.date_plein, from, to));
    const byVeh = new Map();
    for (const r of rows) {
      if (!byVeh.has(r.vehicle_id)) byVeh.set(r.vehicle_id, { vehicle_id: r.vehicle_id, vehicle_immat: r.vehicle_immat, vehicle_marque: r.vehicle_marque, conso_reference_l_100: r.conso_reference_l_100, litres: 0, montant: 0, km: 0, nb_pleins: 0, nb_rouge: 0, nb_orange: 0 });
      const a = byVeh.get(r.vehicle_id);
      a.litres += Number(r.litres) || 0;
      a.montant += Number(r.montant) || 0;
      if (r.distance != null && r.distance > 0) a.km += r.distance;
      a.nb_pleins += 1;
      if (r.niveau === 'rouge') a.nb_rouge += 1; else if (r.niveau === 'orange') a.nb_orange += 1;
    }
    const report = [...byVeh.values()].map(a => ({
      ...a,
      conso_moyenne: a.km > 0 ? Math.round((a.litres / a.km) * 100 * 100) / 100 : null,
      cout_km: a.km > 0 ? Math.round((a.montant / a.km) * 100) / 100 : null,
    })).sort((x, y) => (y.conso_moyenne || 0) - (x.conso_moyenne || 0));
    res.json({ from, to, report });
  } catch (e) { next(e); }
});

// Dashboard carburant : KPIs flotte, top surconsommation, évolution mensuelle, anomalies à traiter.
router.get('/dashboard', canRead, async (req, res, next) => {
  try {
    const from = isDate(req.query.date_from) ? String(req.query.date_from).slice(0, 10) : new Date().toISOString().slice(0, 8) + '01';
    const to = isDate(req.query.date_to) ? String(req.query.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const rows = (await loadComputed(null)).filter(r => inPeriod(r.date_plein, from, to));

    let litres = 0, montant = 0, km = 0, nbRouge = 0, nbOrange = 0;
    const byVeh = new Map(); const byMonth = new Map(); const byStation = new Map(); const byPaiement = new Map();
    for (const r of rows) {
      litres += Number(r.litres) || 0; montant += Number(r.montant) || 0;
      if (r.distance != null && r.distance > 0) km += r.distance;
      if (r.niveau === 'rouge') nbRouge += 1; else if (r.niveau === 'orange') nbOrange += 1;
      if (!byVeh.has(r.vehicle_id)) byVeh.set(r.vehicle_id, { vehicle_id: r.vehicle_id, vehicle_immat: r.vehicle_immat, conso_reference_l_100: r.conso_reference_l_100, litres: 0, km: 0 });
      const v = byVeh.get(r.vehicle_id); v.litres += Number(r.litres) || 0; if (r.distance > 0) v.km += r.distance;
      const m = String(r.date_plein).slice(0, 7);
      const mm = byMonth.get(m) || { mois: m, litres: 0, montant: 0 }; mm.litres += Number(r.litres) || 0; mm.montant += Number(r.montant) || 0; byMonth.set(m, mm);
      if (r.station) { const s = byStation.get(r.station) || { station: r.station, montant: 0 }; s.montant += Number(r.montant) || 0; byStation.set(r.station, s); }
      const pk = r.mode_paiement || 'non précisé'; const pp = byPaiement.get(pk) || { mode: pk, montant: 0 }; pp.montant += Number(r.montant) || 0; byPaiement.set(pk, pp);
    }
    const topConso = [...byVeh.values()].map(v => ({ ...v, conso_moyenne: v.km > 0 ? Math.round((v.litres / v.km) * 100 * 100) / 100 : null }))
      .filter(v => v.conso_moyenne != null).sort((a, b) => b.conso_moyenne - a.conso_moyenne).slice(0, 8);
    const anomalies = rows.filter(r => r.niveau !== 'vert' && r.statut_anomalie !== 'justifie')
      .sort((a, b) => (a.niveau === 'rouge' ? 0 : 1) - (b.niveau === 'rouge' ? 0 : 1) || String(b.date_plein).localeCompare(String(a.date_plein)))
      .slice(0, 50);

    res.json({
      from, to,
      kpi: {
        litres: Math.round(litres), montant: Math.round(montant),
        conso_moyenne: km > 0 ? Math.round((litres / km) * 100 * 100) / 100 : null,
        cout_km: km > 0 ? Math.round((montant / km) * 100) / 100 : null,
        nb_rouge: nbRouge, nb_orange: nbOrange, nb_pleins: rows.length,
      },
      top_conso: topConso,
      evolution: [...byMonth.values()].sort((a, b) => a.mois.localeCompare(b.mois)),
      stations: [...byStation.values()].sort((a, b) => b.montant - a.montant).slice(0, 8),
      paiements: [...byPaiement.values()].sort((a, b) => b.montant - a.montant),
      anomalies,
    });
  } catch (e) { next(e); }
});

module.exports = router;
