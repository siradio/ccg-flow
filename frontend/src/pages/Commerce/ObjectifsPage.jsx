import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const curMonth = () => new Date().toISOString().slice(0, 7);

// Saisie des objectifs par mois : une ligne par commercial (visible), objectif éditable, upsert en lot.
export default function ObjectifsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [mois, setMois] = useState(curMonth());
  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = hasSubModuleLevel(user, 'commerce.objectifs', 'edition');

  useEffect(() => { client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, []);
  function load() {
    setMsg('');
    const p = new URLSearchParams({ mois });
    if (buId) p.append('business_unit_id', buId);
    client.get('/commerce/objectifs/grid?' + p.toString()).then(r => setRows(r.data)).catch(() => {});
  }
  useEffect(load, [mois, buId]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.objectif_montant) || 0), 0), [rows]);
  function setObjectif(id, v) { setRows(rs => rs.map(r => r.commercial_id === id ? { ...r, objectif_montant: v } : r)); }

  async function save() {
    setBusy(true); setMsg('');
    try {
      await client.put('/commerce/objectifs/grid', {
        mois,
        lines: rows.map(r => ({ commercial_id: r.commercial_id, business_unit_id: r.business_unit_id, objectif_montant: Number(r.objectif_montant) || 0 })),
      });
      setMsg(t('com.obj.saved'));
      load();
    } catch (e) { setMsg(e.response?.data?.error || t('com.obj.error')); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('com.obj.title')}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={mois} onChange={e => setMois(e.target.value)} />
          <select value={buId} onChange={e => setBuId(e.target.value)}>
            <option value="">{t('com.obj.allBu')}</option>
            {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </div>
      </div>
      {msg && <div className="alert alert-success" style={{ maxWidth: 680 }}>{msg}</div>}

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginTop: 12 }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>{t('com.obj.thCommercial')}</th><th>{t('com.obj.thBu')}</th><th style={{ textAlign: 'right', width: 260 }}>{t('com.obj.thObjectif')}</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.commercial_id}>
                <td>{r.code} — {r.prenom_affiche || ''} {r.nom_affiche || ''}</td>
                <td>{r.business_unit_nom || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <input type="number" min="0" step="1000" value={r.objectif_montant ?? 0} disabled={!canEdit}
                    onChange={e => setObjectif(r.commercial_id, e.target.value)}
                    style={{ width: 200, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>{t('com.obj.empty')}</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td colSpan={2} style={{ fontWeight: 700 }}>{t('com.obj.totalObjectifs')}</td><td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</td></tr></tfoot>}
        </table>
      </div>

      {canEdit && rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{t('com.obj.save')}</button>
        </div>
      )}
    </div>
  );
}
