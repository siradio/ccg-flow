import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import CommerceSubnav from './CommerceSubnav';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

const curMonth = () => new Date().toISOString().slice(0, 7);
const monthStart = (m) => `${m}-01`;
const monthEnd = (m) => { const [y, mm] = m.split('-').map(Number); return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`; };

// [clé, libellé, mode de période]
const REPORTS = [
  ['versements_commercial', 'Versements par commercial', 'range'],
  ['versements_bu', 'Versements par BU', 'range'],
  ['versements_produit', 'Versements par produit', 'range'],
  ['versements_jour', 'Versements journaliers', 'range'],
  ['objectifs_realise', 'Objectifs vs Réalisé', 'month'],
  ['commissions', 'Commissions', 'month'],
  ['absence', 'Absence de versement', 'range'],
  ['consolide', 'Consolidé Direction (par BU)', 'month'],
];

export default function RapportsPage() {
  const { t } = useI18n();
  const [type, setType] = useState('versements_commercial');
  const [mois, setMois] = useState(curMonth());
  const [df, setDf] = useState(monthStart(curMonth()));
  const [dt, setDt] = useState(monthEnd(curMonth()));
  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const periodMode = REPORTS.find(r => r[0] === type)[2];

  useEffect(() => { client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setError(''); setData(null);
    const p = new URLSearchParams({ type });
    if (periodMode === 'month') p.append('mois', mois);
    else { p.append('date_from', df); p.append('date_to', dt); }
    if (buId) p.append('business_unit_id', buId);
    client.get('/commerce/rapports?' + p.toString()).then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || t('com.rap.error')));
  }, [type, mois, df, dt, buId, periodMode]);

  function fmt(col, v) {
    if (v == null || v === '') return col.key === 'taux' ? '—' : '';
    if (col.key === 'taux') return `${v} %`;
    if (col.key === 'tauxPct') return `${v} %`;
    if (col.type === 'number' && col.key !== 'nb') return Number(v).toLocaleString('fr-FR') + ' GNF';
    if (col.type === 'date') return String(v).slice(0, 10).split('-').reverse().join('/');
    return v;
  }

  // Totaux des colonnes monétaires.
  const totals = useMemo(() => {
    if (!data) return {};
    const acc = {};
    for (const c of data.columns) {
      if (c.type === 'number' && !['nb', 'taux'].includes(c.key)) acc[c.key] = data.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      if (c.key === 'nb') acc[c.key] = data.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
    return acc;
  }, [data]);
  const hasTotals = data && Object.keys(totals).length > 0;

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('com.rap.title')}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {data && <ExportButtons filename={type + (periodMode === 'month' ? '_' + mois : '')} columns={data.columns} rows={data.rows} />}
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>{t('com.rap.print')}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ minWidth: 240 }}>
          {REPORTS.map(([k]) => <option key={k} value={k}>{t('com.rap.type.' + k)}</option>)}
        </select>
        {periodMode === 'month' ? (
          <input type="month" value={mois} onChange={e => setMois(e.target.value)} />
        ) : (
          <>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('com.rap.from')} <input type="date" value={df} onChange={e => setDf(e.target.value)} /></label>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('com.rap.to')} <input type="date" value={dt} onChange={e => setDt(e.target.value)} /></label>
          </>
        )}
        <select value={buId} onChange={e => setBuId(e.target.value)}>
          <option value="">{t('com.rap.allBu')}</option>
          {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {data && (
        <>
          <h2 style={{ fontSize: 15 }}>{data.title} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{t('com.rap.lineCount', { n: data.rows.length })}</span></h2>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>{data.columns.map(c => <th key={c.key} style={{ textAlign: c.type === 'number' ? 'right' : 'left' }}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {data.columns.map(c => <td key={c.key} style={{ textAlign: c.type === 'number' ? 'right' : 'left', fontVariantNumeric: c.type === 'number' ? 'tabular-nums' : undefined }}>{fmt(c, r[c.key])}</td>)}
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={data.columns.length} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>{t('com.rap.empty')}</td></tr>}
              </tbody>
              {hasTotals && data.rows.length > 0 && (
                <tfoot>
                  <tr>
                    {data.columns.map((c, idx) => (
                      <td key={c.key} style={{ fontWeight: 700, textAlign: c.type === 'number' ? 'right' : 'left', fontVariantNumeric: c.type === 'number' ? 'tabular-nums' : undefined }}>
                        {idx === 0 ? t('com.rap.total') : (totals[c.key] != null ? fmt(c, totals[c.key]) : '')}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
