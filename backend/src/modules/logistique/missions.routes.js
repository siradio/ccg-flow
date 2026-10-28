const express = require('express');
const { simpleCrudRouter } = require('../referentials/crud.factory');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

// Missions (déplacements) — sous-module logistique.missions. Véhicule + chauffeur obligatoires,
// commercial accompagnateur facultatif. Le CRUD est générique ; on ajoute un endpoint /carte qui
// géolocalise les missions actives (géocodage des lieux texte via Nominatim, mis en cache en base).
const crud = simpleCrudRouter({
  table: 'missions',
  columns: [
    'objet', 'vehicle_id', 'driver_id', 'commercial_employee_id',
    'depart', 'arrivee', 'date_debut', 'date_fin', 'km_depart', 'km_retour', 'statut',
  ],
  filterColumn: 'vehicle_id',
  orderBy: 'date_debut DESC NULLS LAST, id DESC',
  subModuleKey: 'logistique.missions',
});

const router = express.Router();

// --- Géocodage (Nominatim / OpenStreetMap) ----------------------------------------------------
// Politique d'usage Nominatim : 1 req/s max, User-Agent descriptif obligatoire. On espace les
// appels, on plafonne le nombre de résolutions par requête HTTP (le reste se complètera au prochain
// chargement) et on met le résultat en cache dans la table missions.
const GEO_UA = 'CCG-Flow-Logistique/1.0 (contact: logistique@ccggroupe.com)';
const MAX_LOOKUPS_PER_CALL = 6;   // bornes la latence de /carte
const LOOKUP_SPACING_MS = 1100;   // ≥ 1 s entre deux appels Nominatim
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocodeOne(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=fr&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': GEO_UA }, signal: ctrl.signal });
    if (!resp.ok) return null;
    const arr = await resp.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = Number(arr[0].lat); const lng = Number(arr[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch (_e) {
    return null; // réseau / timeout / abort → on laissera les coords nulles (réessai au prochain load)
  } finally {
    clearTimeout(to);
  }
}

// Vue carte : missions actives (planifiées ou en cours) avec, pour chacune, les coordonnées de
// départ et d'arrivée. On (re)géocode à la volée les lieux non encore résolus ou dont le texte a
// changé depuis le dernier géocodage, dans la limite de MAX_LOOKUPS_PER_CALL.
router.get('/carte', requireAuth, requireSubModule('logistique.suivi'), async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT m.id, m.objet, m.depart, m.arrivee, m.statut, m.date_debut, m.date_fin,
             m.depart_lat, m.depart_lng, m.arrivee_lat, m.arrivee_lng, m.depart_label, m.arrivee_label,
             v.immatriculation AS vehicle_immat, v.marque,
             TRIM(CONCAT(d.prenom, ' ', d.nom)) AS driver_nom
        FROM missions m
        JOIN vehicles v ON v.id = m.vehicle_id
        LEFT JOIN drivers d ON d.id = m.driver_id
       WHERE m.statut IN ('Planifiée', 'En cours')
       ORDER BY m.date_debut DESC NULLS LAST, m.id DESC`);

    let lookups = 0;
    for (const m of rows) {
      // Départ : géocode si texte présent et (pas de coords OU texte modifié depuis le cache).
      const needDep = m.depart && (m.depart_lat == null || m.depart_label !== m.depart);
      if (needDep && lookups < MAX_LOOKUPS_PER_CALL) {
        if (lookups > 0) await sleep(LOOKUP_SPACING_MS);
        lookups += 1;
        const g = await geocodeOne(m.depart);
        if (g) {
          await run('UPDATE missions SET depart_lat=$1, depart_lng=$2, depart_label=$3, geocoded_at=now() WHERE id=$4',
            [g.lat, g.lng, m.depart, m.id]);
          m.depart_lat = g.lat; m.depart_lng = g.lng; m.depart_label = m.depart;
        }
      }
      const needArr = m.arrivee && (m.arrivee_lat == null || m.arrivee_label !== m.arrivee);
      if (needArr && lookups < MAX_LOOKUPS_PER_CALL) {
        if (lookups > 0) await sleep(LOOKUP_SPACING_MS);
        lookups += 1;
        const g = await geocodeOne(m.arrivee);
        if (g) {
          await run('UPDATE missions SET arrivee_lat=$1, arrivee_lng=$2, arrivee_label=$3, geocoded_at=now() WHERE id=$4',
            [g.lat, g.lng, m.arrivee, m.id]);
          m.arrivee_lat = g.lat; m.arrivee_lng = g.lng; m.arrivee_label = m.arrivee;
        }
      }
    }

    // On renvoie toutes les missions actives (même non géolocalisées) : le front place celles qui ont
    // au moins un point, et peut signaler les lieux non résolus.
    res.json(rows.map(m => ({
      id: m.id, objet: m.objet, depart: m.depart, arrivee: m.arrivee, statut: m.statut,
      date_debut: m.date_debut, date_fin: m.date_fin,
      vehicle_immat: m.vehicle_immat, marque: m.marque, driver_nom: m.driver_nom,
      depart_lat: m.depart_lat != null ? Number(m.depart_lat) : null,
      depart_lng: m.depart_lng != null ? Number(m.depart_lng) : null,
      arrivee_lat: m.arrivee_lat != null ? Number(m.arrivee_lat) : null,
      arrivee_lng: m.arrivee_lng != null ? Number(m.arrivee_lng) : null,
    })));
  } catch (e) { next(e); }
});

router.use(crud);
module.exports = router;
