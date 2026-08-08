import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

const EXPORT_COLS = [
  { key: 'product_code', label: 'Code' }, { key: 'designation', label: 'Désignation' },
  { key: 'bu_nom', label: 'Business Unit' }, { key: 'location_nom', label: 'Localisation' },
  { key: 'total_entrees', label: 'Entrées', type: 'number' }, { key: 'total_sorties', label: 'Sorties', type: 'number' },
  { key: 'stock_actuel', label: 'Stock actuel', type: 'number' }, { key: 'seuil_alerte_stock', label: 'Seuil', type: 'number' },
  { key: 'valeur_stock', label: 'Valeur', type: 'number' }, { key: 'statut', label: 'Statut' },
];

// Refonte Stock (Lot 1) — Stock actuel : solde dérivé du grand livre, par produit × localisation,
// avec statut calculé (OK / Alerte / Critique / Rupture / Surstock) et valorisation.
const STATUT_STYLE = {
  OK: { c: '#15803d', b: '#dcfce7' }, Alerte: { c: '#b45309', b: '#fef3c7' },
  Critique: { c: '#c2410c', b: '#ffedd5' }, Rupture: { c: '#b91c1c', b: '#fee2e2' },
  Surstock: { c: '#1d4ed8', b: '#dbeafe' },
};
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

function Badge({ statut }) {
  const { t } = useI18n();
  const s = STATUT_STYLE[statut] || { c: '#6b7280', b: '#e5e7eb' };
  return <span style={{ background: s.b, color: s.c, fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>{t('stockstatut.' + statut)}</span>;
}

export default function StockActuel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canView = hasSubModuleLevel(user, 'stock.consultation');
  const [rows, setRows] = useState([]);
  const [bus, setBus] = useState([]);
  const [filters, setFilters] = useState({ business_unit_id: '', statut: '', q: '' });

  function load() {
    const qs = [];
    if (filters.business_unit_id) qs.push('business_unit_id=' + filters.business_unit_id);
    client.get('/stock-actuel' + (qs.length ? '?' + qs.join('&') : '')).then(r => setRows(r.data)).catch(() => {});
  }
  useEffect(() => { if (canView) client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, [canView]);
  useEffect(() => { if (canView) load(); /* eslint-disable-next-line */ }, [canView, filters.business_unit_id]);

  const filtered = useMemo(() => rows.filter(r =>
    (!filters.statut || r.statut === filters.statut) &&
    (!filters.q || `${r.product_code} ${r.designation}`.toLowerCase().includes(filters.q.toLowerCase()))
  ), [rows, filters.statut, filters.q]);

  const totalValeur = filtered.reduce((s, r) => s + (Number(r.valeur_stock) || 0), 0);

  if (!canView) return <div><StockSectionNav /><p>{t('stockactuel.notAllowed')}</p></div>;

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('stockactuel.title')}</h1>
          <p className="page-subtitle" style={{ margin: '0 0 12px' }}>{t('stockactuel.subtitle')}</p>
        </div>
        <ExportButtons filename="stock_actuel" columns={EXPORT_COLS} rows={filtered} />
      </div>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 160 }}>{t('stockcommon.bu')}
          <select value={filters.business_unit_id} onChange={e => setFilters(f => ({ ...f, business_unit_id: e.target.value }))}>
            <option value="">{t('stockcommon.all')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 130 }}>{t('stockactuel.statusFilter')}
          <select value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}>
            <option value="">{t('stockcommon.allM')}</option>{['OK', 'Alerte', 'Critique', 'Rupture', 'Surstock'].map(s => <option key={s} value={s}>{t('stockstatut.' + s)}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>{t('stockactuel.searchProduct')}
          <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder={t('stockactuel.searchPlaceholder')} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="card" style={{ padding: '10px 16px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('stockactuel.rows')}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{filtered.length}</div></div>
        <div className="card" style={{ padding: '10px 16px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('stockactuel.totalValue')}</div><div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalValeur)}</div></div>
      </div>

      {filtered.length === 0 && <p className="empty-row">{t('stockactuel.empty')}</p>}
      {filtered.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('stockactuel.th.product')}</th><th>{t('stockreleve.th.bu')}</th><th>{t('stockactuel.th.location')}</th><th className="num">{t('stockactuel.th.entries')}</th><th className="num">{t('stockactuel.th.exits')}</th><th className="num">{t('stockactuel.th.stock')}</th><th className="num">{t('stockactuel.th.threshold')}</th><th className="num">{t('stockactuel.th.value')}</th><th>{t('stockactuel.th.status')}</th></tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={`${r.product_id}-${r.location_id}`}>
                    <td><strong>{r.product_code || ''}</strong>{r.product_code ? ' — ' : ''}{r.designation}<div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.unite || ''}</div></td>
                    <td>{r.bu_nom || '—'}</td>
                    <td>{r.location_nom || '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>{fmt(r.total_entrees)}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums', color: '#b91c1c' }}>{fmt(r.total_sorties)}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(r.stock_actuel)}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>{r.seuil_alerte_stock != null ? fmt(r.seuil_alerte_stock) : '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.valeur_stock)}</td>
                    <td><Badge statut={r.statut} /></td>
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
