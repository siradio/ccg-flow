import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 1) — Tableau de bord de base, calculé à partir du solde dérivé et des
// derniers mouvements. Le tableau de bord DG complet sera reconstruit sur cette base (Lot 2+).
const fmt = n => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const STATUT_STYLE = { Alerte: '#b45309', Critique: '#c2410c', Rupture: '#b91c1c', Surstock: '#1d4ed8' };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

function Kpi({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'inherit', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default function StockTableauBord() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canView = hasSubModuleLevel(user, 'stock.tableau_bord');
  const [stock, setStock] = useState([]);
  const [mvts, setMvts] = useState([]);
  const [echeances, setEcheances] = useState([]);

  useEffect(() => {
    if (!canView) return;
    client.get('/stock-actuel').then(r => setStock(r.data)).catch(() => {});
    client.get('/stock-mouvements').then(r => setMvts(r.data.slice(0, 8))).catch(() => {});
    client.get('/stock-lots/echeances?jours=30').then(r => setEcheances(r.data)).catch(() => {});
  }, [canView]);

  const kpi = useMemo(() => {
    const valeur = stock.reduce((s, r) => s + (Number(r.valeur_stock) || 0), 0);
    const count = st => stock.filter(r => r.statut === st).length;
    return { lignes: stock.length, valeur, alerte: count('Alerte') + count('Critique'), rupture: count('Rupture'), surstock: count('Surstock') };
  }, [stock]);

  const valeurParBu = useMemo(() => {
    const m = {};
    stock.forEach(r => { const k = r.bu_nom || '—'; m[k] = (m[k] || 0) + (Number(r.valeur_stock) || 0); });
    return Object.entries(m).map(([bu, valeur]) => ({ bu, valeur })).sort((a, b) => b.valeur - a.valeur);
  }, [stock]);

  const alertes = useMemo(() => stock.filter(r => ['Alerte', 'Critique', 'Rupture'].includes(r.statut))
    .sort((a, b) => Number(a.stock_actuel) - Number(b.stock_actuel)).slice(0, 10), [stock]);

  if (!canView) return <div><StockSectionNav /><p>{t('stbord.notAllowed')}</p></div>;

  return (
    <div>
      <StockSectionNav />
      <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('stbord.title')}</h1>
      <p className="page-subtitle" style={{ margin: '0 0 12px' }}>{t('stbord.subtitle')}</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Kpi label={t('stbord.kpi.rows')} value={fmt(kpi.lignes)} />
        <Kpi label={t('stbord.kpi.totalValue')} value={fmt(kpi.valeur)} />
        <Kpi label={t('stbord.kpi.alert')} value={fmt(kpi.alerte)} color={STATUT_STYLE.Alerte} />
        <Kpi label={t('stbord.kpi.rupture')} value={fmt(kpi.rupture)} color={STATUT_STYLE.Rupture} />
        <Kpi label={t('stbord.kpi.overstock')} value={fmt(kpi.surstock)} color={STATUT_STYLE.Surstock} />
        <Kpi label={t('stbord.kpi.expiring')} value={fmt(echeances.length)} color={echeances.length ? STATUT_STYLE.Alerte : undefined} />
      </div>

      {stock.length === 0 && <p className="empty-row">{t('stbord.empty')}</p>}

      {valeurParBu.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('stbord.valueByBu')}</h2>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={valeurParBu} margin={{ top: 6, right: 10, bottom: 6, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="bu" fontSize={12} />
                <YAxis fontSize={11} tickFormatter={fmt} width={70} />
                <Tooltip formatter={v => fmt(v) + ' GNF'} />
                <Bar dataKey="valeur" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('stbord.alertProducts')}</h2>
          {alertes.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>{t('stbord.noAlert')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('stbord.th.product')}</th><th className="num">{t('stbord.th.stock')}</th><th>{t('stbord.th.status')}</th></tr></thead>
              <tbody>{alertes.map(r => (
                <tr key={`${r.product_id}-${r.location_id}`}><td>{r.designation}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.stock_actuel)}</td>
                  <td><span style={{ color: STATUT_STYLE[r.statut], fontWeight: 700 }}>{t('stockstatut.' + r.statut)}</span></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <section className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('stbord.expiring')}</h2>
          {echeances.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>{t('stbord.noExpiring')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('stbord.th.product')}</th><th>{t('stbord.th.batch')}</th><th className="num">{t('stbord.th.remaining')}</th><th>{t('stbord.th.deadline')}</th></tr></thead>
              <tbody>{echeances.slice(0, 10).map(l => (
                <tr key={l.id}><td>{l.designation}</td><td>{l.numero_lot}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(l.quantite_restante)}</td>
                  <td style={{ color: Number(l.jours_avant_peremption) < 0 ? '#b91c1c' : '#b45309', fontWeight: 600 }}>{Number(l.jours_avant_peremption) < 0 ? t('stbord.expired', { n: -l.jours_avant_peremption }) : t('stbord.days', { n: l.jours_avant_peremption })}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <section className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('stbord.lastMoves')}</h2>
          {mvts.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>{t('mvt.empty')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('mvt.th.ref')}</th><th>{t('mvt.th.date')}</th><th>{t('mvt.th.type')}</th><th className="num">{t('mvt.th.qty')}</th></tr></thead>
              <tbody>{mvts.map(m => (
                <tr key={m.id}><td>{m.reference}</td><td>{d10(m.date_mouvement)}</td>
                  <td style={{ color: m.sens === 'entree' ? '#15803d' : m.sens === 'sortie' ? '#b91c1c' : '#6b7280' }}>{m.type_libelle}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(m.total_quantite)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </div>
  );
}
