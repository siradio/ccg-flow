import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const STATUTS = ['brouillon', 'soumis', 'valide', 'rejete', 'annule'];
const STATUT_COLOR = { brouillon: '#6b7280', soumis: '#b45309', valide: '#128a54', rejete: '#dc2626', annule: '#6b7280' };

export default function VersementsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const statutLabel = (s) => t('com.statut.' + s);
  const [rows, setRows] = useState([]);
  const [bus, setBus] = useState([]);
  const [commerciaux, setCommerciaux] = useState([]);
  const [f, setF] = useState({ business_unit_id: '', commercial_id: '', status: '', date_from: '', date_to: '' });
  const canAdd = hasSubModuleLevel(user, 'commerce.versements', 'ajout');

  function load() {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) params.append(k, v); });
    client.get('/commerce/versements?' + params.toString()).then(r => setRows(r.data)).catch(() => {});
  }
  useEffect(() => { load(); }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
    client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data)).catch(() => {});
  }, []);

  const totalSum = useMemo(() => rows.reduce((s, r) => s + Number(r.total_amount || 0), 0), [rows]);
  const exportCols = [
    { key: 'payment_date', label: 'Date', type: 'date' }, { key: 'reference', label: 'Référence' },
    { key: 'commercial_code', label: 'Code' }, { key: 'commercial_nom', label: 'Commercial' },
    { key: 'business_unit_nom', label: 'BU' }, { key: 'total_amount', label: 'Total', type: 'number' },
    { key: 'status', label: 'Statut' },
  ];

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('com.list.title')}</h1>
        {canAdd && <Link to="/commerce/versements/new" className="btn btn-primary">{t('com.list.new')}</Link>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
        <select value={f.business_unit_id} onChange={e => setF(x => ({ ...x, business_unit_id: e.target.value }))}>
          <option value="">{t('com.list.buAll')}</option>
          {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select value={f.commercial_id} onChange={e => setF(x => ({ ...x, commercial_id: e.target.value }))}>
          <option value="">{t('com.list.commercialAll')}</option>
          {commerciaux.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom_affiche || ''} {c.nom_affiche || ''}</option>)}
        </select>
        <select value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value }))}>
          <option value="">{t('com.list.statusAll')}</option>
          {STATUTS.map(s => <option key={s} value={s}>{statutLabel(s)}</option>)}
        </select>
        <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('com.list.from')} <input type="date" value={f.date_from} onChange={e => setF(x => ({ ...x, date_from: e.target.value }))} /></label>
        <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('com.list.to')} <input type="date" value={f.date_to} onChange={e => setF(x => ({ ...x, date_to: e.target.value }))} /></label>
        <ExportButtons filename="versements" columns={exportCols} rows={rows} />
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>{t('com.list.thDate')}</th><th>{t('com.list.thReference')}</th><th>{t('com.list.thCommercial')}</th><th>{t('com.list.thBu')}</th>
              <th style={{ textAlign: 'right' }}>{t('com.list.thTotal')}</th><th>{t('com.list.thStatus')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.payment_date?.slice(0, 10).split('-').reverse().join('/')}</td>
                <td>{r.reference}</td>
                <td>{r.commercial_code} — {r.commercial_prenom || ''} {r.commercial_nom || ''}</td>
                <td>{r.business_unit_nom || '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.total_amount)}</td>
                <td><span className="badge" style={{ background: STATUT_COLOR[r.status], color: '#fff' }}>{statutLabel(r.status)}</span></td>
                <td><Link to={`/commerce/versements/${r.id}`} className="btn btn-secondary btn-sm">{t('com.list.open')}</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>{t('com.list.empty')}</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight: 700 }}>{t('com.list.count', { n: rows.length })}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(totalSum)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
