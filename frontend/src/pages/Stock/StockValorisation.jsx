import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 2) — Valorisation du stock (méthode par produit, CMP par défaut). Agrégation
// par Business Unit et par catégorie à partir du solde valorisé (stock-actuel).
const fmt = n => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

function groupSum(rows, keyFn) {
  const m = {};
  rows.forEach(r => { const k = keyFn(r) || '—'; m[k] = (m[k] || 0) + (Number(r.valeur_stock) || 0); });
  return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
}

export default function StockValorisation() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canView = hasSubModuleLevel(user, 'stock.valorisation') || hasSubModuleLevel(user, 'stock.consultation');
  const [rows, setRows] = useState([]);

  useEffect(() => { if (canView) client.get('/stock-actuel').then(r => setRows(r.data)).catch(() => {}); }, [canView]);

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.valeur_stock) || 0), 0), [rows]);
  const parBu = useMemo(() => groupSum(rows, r => r.bu_nom), [rows]);
  const parCat = useMemo(() => groupSum(rows, r => r.categorie), [rows]);
  // Libellés de type traduits (re-groupe si la langue change).
  const parType = useMemo(() => groupSum(rows, r => (['produit_fini', 'matiere_premiere', 'consommable'].includes(r.type_article) ? t('type.' + r.type_article) : t('type.autre'))), [rows, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canView) return <div><StockSectionNav /><p>{t('val.notAllowed')}</p></div>;

  return (
    <div>
      <StockSectionNav />
      <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('val.title')}</h1>
      <p className="page-subtitle" style={{ margin: '0 0 12px' }}>{t('val.subtitle')}</p>

      <div className="card" style={{ padding: '12px 18px', marginBottom: 16, display: 'inline-block' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('val.totalValue')}</div>
        <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</div>
      </div>

      {rows.length === 0 && <p className="empty-row">{t('val.empty')}</p>}

      {parBu.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('val.byBu')}</h2>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={parBu.map(x => ({ bu: x.k, valeur: x.v }))} margin={{ top: 6, right: 10, bottom: 6, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="bu" fontSize={12} /><YAxis fontSize={11} tickFormatter={fmt} width={70} />
                <Tooltip formatter={v => fmt(v) + ' GNF'} />
                <Bar dataKey="valeur" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {[[t('val.byType'), t('val.type'), parType], [t('val.byCat'), t('val.cat'), parCat]].map(([sectionTitle, colHeader, data]) => (
          <section className="card" key={sectionTitle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{sectionTitle}</h2>
            {data.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>—</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{colHeader}</th><th className="num">{t('val.value')}</th><th className="num">%</th></tr></thead>
                <tbody>{data.map(d => (
                  <tr key={d.k}><td>{d.k}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(d.v)}</td>
                    <td className="num" style={{ color: 'var(--color-text-muted)' }}>{total ? Math.round(d.v / total * 100) : 0}%</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
