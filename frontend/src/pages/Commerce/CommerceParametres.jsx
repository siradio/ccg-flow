import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav, { firstCommerceTarget } from './CommerceSubnav';

// Paramètres Commerce — workflow de validation OPTIONNEL (global + surcharge par BU).
// Désactivé par défaut : la saisie d'un versement vaut enregistrement immédiat (reprise Excel).
// Les règles avancées (seuils, obligation par moyen…) seront ajoutées en Phase F.
const KEY = 'workflow_actif';

export default function CommerceParametres() {
  const { user } = useAuth();
  const [settings, setSettings] = useState([]);
  const [bus, setBus] = useState([]);
  const [msg, setMsg] = useState('');
  const canEdit = hasSubModuleLevel(user, 'commerce.parametres', 'edition');

  function load() {
    client.get('/commerce/settings').then(r => setSettings(r.data)).catch(() => {});
  }
  useEffect(() => {
    load();
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
  }, []);

  if (!hasSubModuleLevel(user, 'commerce.parametres')) {
    const target = firstCommerceTarget(user);
    return target ? <Navigate to={target} replace /> : <p style={{ padding: 16 }}>Accès non accordé.</p>;
  }

  // Valeur effective : override BU si présent, sinon valeur globale.
  const globalVal = settings.find(s => s.business_unit_id === null && s.cle === KEY)?.valeur === 'true';
  const buVal = (buId) => {
    const row = settings.find(s => s.business_unit_id === buId && s.cle === KEY);
    return row ? row.valeur === 'true' : null; // null = hérite du global
  };

  async function save(buId, valeur) {
    setMsg('');
    await client.put('/commerce/settings', { business_unit_id: buId, cle: KEY, valeur: String(valeur) });
    setMsg('Enregistré.');
    load();
  }

  return (
    <div>
      <CommerceSubnav />
      <h1 className="page-title">Paramètres Commerce</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 680, marginTop: 0 }}>
        Le <strong>workflow de validation des versements est optionnel</strong>. Désactivé, la saisie
        vaut enregistrement immédiat (le versement alimente aussitôt réalisé, dashboard, objectifs).
        Activé, un versement passe par Brouillon → Soumis → Validé. Réglable globalement ou par BU.
      </p>
      {msg && <div className="alert alert-success" style={{ maxWidth: 680 }}>{msg}</div>}

      <section className="card" style={{ maxWidth: 680 }}>
        <h2 style={{ marginTop: 0 }}>Workflow de validation</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
          <div><strong>Global (défaut)</strong><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>S'applique à toutes les BU sans réglage propre.</div></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={globalVal} disabled={!canEdit} onChange={e => save(null, e.target.checked)} />
            {globalVal ? 'Activé' : 'Désactivé'}
          </label>
        </div>
        {bus.map(bu => {
          const v = buVal(bu.id);
          return (
            <div key={bu.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>{bu.nom} <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>({bu.code})</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {v === null ? `hérite (${globalVal ? 'activé' : 'désactivé'})` : (v ? 'activé' : 'désactivé')}
                </span>
                <select value={v === null ? '' : String(v)} disabled={!canEdit}
                  onChange={e => save(bu.id, e.target.value === 'true')}>
                  <option value="">Hériter du global</option>
                  <option value="true">Activé</option>
                  <option value="false">Désactivé</option>
                </select>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
