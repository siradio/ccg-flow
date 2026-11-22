import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { ConfBadge } from './qhseConformite';

// Détail d'un échantillon : informations + ses analyses + ajout d'une analyse (par type).
export default function QhseSampleDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState('');

  const load = () => client.get(`/qhse/analyses/samples/${id}`).then(r => setS(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/qhse/referentials/analysis-types').then(r => setTypes(r.data)).catch(() => {});
  }, [id]);

  async function addAnalysis() {
    if (!typeId) return;
    await client.post('/qhse/analyses/analyses', { sample_id: Number(id), analysis_type_id: Number(typeId), technicien_id: user?.employee_id || null });
    setTypeId(''); load();
  }

  if (!s) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{s.numero} — {s.product_nom || s.nature || ''}</h1>
      <div className="card" style={{ maxWidth: 680, marginBottom: 16 }}>
        <div className="kv"><b>{t('qhse.ana.product')}</b><span>{s.product_nom || '—'}{s.format_libelle ? ` · ${s.format_libelle}` : ''}</span></div>
        <div className="kv"><b>{t('qhse.ana.lot')}</b><span>{s.numero_lot || '—'}</span></div>
        <div className="kv"><b>DP / DE</b><span>{s.dp || '—'} / {s.de || '—'}</span></div>
        <div className="kv"><b>{t('qhse.ana.nature')}</b><span>{s.nature || '—'}</span></div>
        <div className="kv"><b>{t('qhse.ana.motif')}</b><span>{s.motif || '—'}</span></div>
      </div>

      <div className="form-inline" style={{ marginBottom: 12, gap: 8 }}>
        <select value={typeId} onChange={e => setTypeId(e.target.value)}>
          <option value="">{t('qhse.ana.addType')}</option>
          {types.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={addAnalysis} disabled={!typeId}>{t('qhse.ana.addAnalysis')}</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('qhse.ana.type')}</th><th>{t('qhse.ana.statut')}</th><th>{t('qhse.ana.conf')}</th><th>{t('qhse.ana.tech')}</th><th></th></tr></thead>
          <tbody>
            {(s.analyses || []).map(a => (
              <tr key={a.id}>
                <td>{a.type_libelle}</td>
                <td>{t('qhse.status.' + a.statut)}</td>
                <td><ConfBadge value={a.conformite} t={t} /></td>
                <td>{a.tech_prenom ? `${a.tech_prenom} ${a.tech_nom}` : '—'}</td>
                <td><Link to={`/qhse/analyses/${a.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {(s.analyses || []).length === 0 && <tr><td colSpan={5} className="empty-row">{t('qhse.ana.noAnalysis')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 14 }}><Link to="/qhse/analyses">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
