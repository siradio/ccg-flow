// Carburant — calcul de consommation (plein à plein) et détection d'anomalies / fraude.
// La logique est centralisée ici pour être partagée par la liste, le rapport et le dashboard.
// `entries` d'un véhicule doivent être triées ASC par (compteur_km, date_plein, id).

const TOL_SURCONSO = 0.15;   // surconsommation : +15 % au-dessus de la référence L/100 km
const TOL_RESERVOIR = 1.02;  // volume > capacité réservoir × 1.02 (petite marge de tolérance)
const KM_RAPPROCHES = 20;    // deux pleins à moins de 20 km → suspicion double facturation
const TOL_PRIX = 1.15;       // prix/litre > médiane × 1.15 → prix aberrant
const TOL_MONTANT = 0.02;    // |montant − litres×prix| > 2 % → incohérence arithmétique

// Niveau le plus grave des anomalies d'une ligne.
const SEVERE = new Set(['surconso', 'volume_sup_reservoir', 'compteur_recule', 'distance_nulle']);

function median(nums) {
  const a = nums.filter(v => v != null && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Enrichit (en place) les pleins d'UN véhicule : distance, conso (plein à plein), anomalies, niveau.
function computeVehicle(entries, vehicle) {
  const prixMed = median(entries.map(e => Number(e.prix_unitaire)).filter(v => v > 0));
  const ref = Number(vehicle && vehicle.conso_reference_l_100) || 0;
  const cap = Number(vehicle && vehicle.capacite_reservoir) || 0;
  let lastFullKm = null, litresSinceFull = 0, lastKm = null, lastDate = null;

  for (const e of entries) {
    const km = e.compteur_km != null ? Number(e.compteur_km) : null;
    const litres = Number(e.litres) || 0;
    e.distance = (lastKm != null && km != null) ? km - lastKm : null;

    litresSinceFull += litres;
    e.conso = null;
    if (e.plein_complet) {
      if (lastFullKm != null && km != null && km > lastFullKm) {
        e.conso = Math.round((litresSinceFull / (km - lastFullKm)) * 100 * 100) / 100;
      }
      lastFullKm = km; litresSinceFull = 0;
    }

    const an = [];
    if (e.conso != null && ref > 0 && e.conso > ref * (1 + TOL_SURCONSO)) an.push('surconso');
    if (cap > 0 && litres > cap * TOL_RESERVOIR) an.push('volume_sup_reservoir');
    if (e.distance != null && e.distance < 0) an.push('compteur_recule');
    if (e.distance != null && e.distance >= 0 && e.distance <= 1 && litres > 2) an.push('distance_nulle');
    if (e.distance != null && e.distance >= 0 && e.distance < KM_RAPPROCHES && lastDate != null) an.push('pleins_rapproches');
    if (e.prix_unitaire && e.montant && Math.abs(Number(e.montant) - litres * Number(e.prix_unitaire)) > Number(e.montant) * TOL_MONTANT + 1) an.push('montant_incoherent');
    if (e.prix_unitaire && prixMed && Number(e.prix_unitaire) > prixMed * TOL_PRIX) an.push('prix_aberrant');

    e.anomalies = an;
    e.niveau_auto = an.some(a => SEVERE.has(a)) ? 'rouge' : (an.length ? 'orange' : 'vert');
    // Statut manuel prioritaire : « justifié » blanchit (vert), « fraude » force rouge.
    e.niveau = e.statut_anomalie === 'fraude' ? 'rouge'
      : e.statut_anomalie === 'justifie' ? 'vert'
      : e.niveau_auto;

    if (km != null) lastKm = km;
    lastDate = e.date_plein;
  }
  return entries;
}

// Calcule sur un lot multi-véhicules : regroupe par véhicule, trie, enrichit. `vehicleById` = map
// id → { conso_reference_l_100, capacite_reservoir, ... }. Retourne la liste à plat enrichie.
function computeAll(rows, vehicleById) {
  const byVeh = new Map();
  for (const r of rows) {
    if (!byVeh.has(r.vehicle_id)) byVeh.set(r.vehicle_id, []);
    byVeh.get(r.vehicle_id).push(r);
  }
  const out = [];
  for (const [vid, list] of byVeh) {
    list.sort((a, b) => (Number(a.compteur_km || 0) - Number(b.compteur_km || 0))
      || String(a.date_plein).localeCompare(String(b.date_plein))
      || (a.id - b.id));
    computeVehicle(list, vehicleById.get(vid) || {});
    out.push(...list);
  }
  return out;
}

module.exports = { computeVehicle, computeAll, median, TOL_SURCONSO };
