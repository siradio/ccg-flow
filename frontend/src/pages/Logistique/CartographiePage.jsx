import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Conakry par défaut quand aucune position n'est encore connue.
const DEFAULT_CENTER = [9.5092, -13.7122];
const DEFAULT_ZOOM = 12;

// Couleur du marqueur selon le statut véhicule (mêmes sémantiques que le reste du module).
const STATUT_COLOR = {
  'Disponible': '#16a34a',
  'En mission': '#2563eb',
  'Maintenance': '#d97706',
  'Immobilisé': '#dc2626',
  'Réformé': '#6b7280',
};
const colorFor = s => STATUT_COLOR[s] || '#2563eb';

function fmtTime(ts, lang) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CartographiePage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canView = hasSubModuleLevel(user, 'logistique.suivi');
  const canAdd = hasSubModuleLevel(user, 'logistique.suivi', 'ajout');

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const placeRef = useRef(false); // mode "placement" actif (lecture dans le handler de clic)

  const [positions, setPositions] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState(null); // { lat, lng } cliqué sur la carte
  const [form, setForm] = useState({ vehicle_id: '', speed: '' });
  const [error, setError] = useState('');

  function load() {
    client.get('/positions/latest').then(r => setPositions(r.data)).catch(() => {});
  }

  // Init de la carte (une seule fois).
  useEffect(() => {
    if (!canView || mapRef.current || !mapEl.current) return;
    const map = L.map(mapEl.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', e => {
      if (!placeRef.current) return;
      setPending({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    load();
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
    // Leaflet a besoin d'un recalcul de taille après le montage du conteneur.
    setTimeout(() => map.invalidateSize(), 0);
  }, [canView]);

  useEffect(() => { placeRef.current = placing; }, [placing]);

  // (Re)dessine les marqueurs des véhicules à chaque mise à jour des positions.
  useEffect(() => {
    const map = mapRef.current; const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts = [];
    positions.forEach(p => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: colorFor(p.vehicle_statut), fillOpacity: 1,
      });
      m.bindPopup(
        `<strong>${p.vehicle_immat || t('log.carto.vehicleFallback')}</strong>${p.marque ? ' — ' + p.marque : ''}<br/>` +
        `${p.vehicle_statut ? t('log.vehStatut.' + p.vehicle_statut) : ''}${p.speed != null ? ' · ' + Math.round(p.speed) + ' km/h' : ''}<br/>` +
        `<small>${fmtTime(p.recorded_at, lang)} · ${p.source === 'sat' ? t('log.carto.sat') : t('log.carto.manual')}</small>`
      );
      m.addTo(layer);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
  }, [positions, lang]);

  // Marqueur temporaire du point en cours de saisie.
  const pendingMarkerRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (pendingMarkerRef.current) { map.removeLayer(pendingMarkerRef.current); pendingMarkerRef.current = null; }
    if (pending) {
      pendingMarkerRef.current = L.circleMarker([pending.lat, pending.lng], {
        radius: 9, color: '#111827', weight: 2, fillColor: '#fbbf24', fillOpacity: 0.9,
      }).addTo(map);
    }
  }, [pending]);

  if (!canView) return <div><LogistiqueSubnav /><p>{t('log.notGranted')}</p></div>;

  async function savePosition(e) {
    e.preventDefault();
    if (!form.vehicle_id) { setError(t('log.carto.chooseVehicleErr')); return; }
    if (!pending) { setError(t('log.carto.clickErr')); return; }
    setError('');
    try {
      await client.post('/positions', {
        vehicle_id: Number(form.vehicle_id), lat: pending.lat, lng: pending.lng,
        speed: form.speed === '' ? null : Number(form.speed), source: 'manuel',
      });
      setPending(null); setForm({ vehicle_id: '', speed: '' }); setPlacing(false);
      load();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }

  const vLabel = v => `${v.immatriculation}${v.marque ? ' — ' + v.marque : ''}`;

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('log.nav.cartographie')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('log.carto.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={load}>{t('log.carto.refresh')}</button>
          {canAdd && (
            <button className={`btn ${placing ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPlacing(p => !p); setPending(null); setError(''); }}>
              {placing ? t('log.carto.cancelInput') : t('log.carto.manualPos')}
            </button>
          )}
        </div>
      </div>

      {placing && canAdd && (
        <section className="card" style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 10px', color: 'var(--color-text-muted)' }}>
            {t('log.carto.clickToPlace')}{pending ? ` (${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)})` : '…'}
          </p>
          <form onSubmit={savePosition} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 220 }}>{t('log.f.vehicle_id')}
              <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))} required>
                <option value="" disabled>{t('log.chooseVehicle')}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{vLabel(v)}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 130 }}>{t('log.carto.speed')}
              <input type="number" min="0" value={form.speed} onChange={e => setForm(f => ({ ...f, speed: e.target.value }))} placeholder={t('log.optional')} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!pending}>{t('log.carto.savePos')}</button>
          </form>
          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
        </section>
      )}

      <div ref={mapEl} style={{ height: 520, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)' }} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '10px 2px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
        {Object.entries(STATUT_COLOR).map(([s, c]) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} /> {t('log.vehStatut.' + s)}
          </span>
        ))}
      </div>

      {positions.length === 0 && (
        <p className="empty-row" style={{ marginTop: 12 }}>{t('log.carto.noPos')}</p>
      )}
      {positions.length > 0 && (
        <div className="card" style={{ padding: 0, marginTop: 12 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('log.f.vehicle_id')}</th><th>{t('log.f.statut')}</th><th>{t('log.carto.speedShort')}</th><th>{t('log.carto.position')}</th><th>{t('log.carto.source')}</th><th>{t('log.carto.lastPoint')}</th></tr></thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.vehicle_id}>
                    <td><strong>{p.vehicle_immat}</strong>{p.marque ? ` — ${p.marque}` : ''}</td>
                    <td>{p.vehicle_statut ? t('log.vehStatut.' + p.vehicle_statut) : ''}</td>
                    <td>{p.speed != null ? `${Math.round(p.speed)} km/h` : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(p.lat).toFixed(4)}, {Number(p.lng).toFixed(4)}</td>
                    <td>{p.source === 'sat' ? t('log.carto.sat') : t('log.carto.manualCap')}</td>
                    <td>{fmtTime(p.recorded_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
