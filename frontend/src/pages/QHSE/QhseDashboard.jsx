import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, BarChart,
} from 'recharts';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Couleurs de statut (cohérentes avec les badges de conformité QHSE).
const CONF_COLORS = { conforme: '#15803d', non_conforme: '#b91c1c', en_attente: '#b45309', sans_spec: '#94a3b8' };
const DEC_COLORS = { libere: '#15803d', bloque: '#b91c1c', rebut: '#7f1d1d', derogation: '#b45309' };
const PRIMARY = 'var(--color-primary, #2563eb)';

// Taux de conformité = conformes / (conformes + non conformes) ; « en attente / sans spec » exclus.
function tauxConformite(map) {
  const ok = map.conforme || 0, ko = map.non_conforme || 0;
  if (ok + ko === 0) return null;
  return Math.round((ok / (ok + ko)) * 100);
}
const toPie = (map, labeler) => Object.entries(map || {}).map(([k, v]) => ({ key: k, name: labeler(k), value: v }));

function Tile({ label, value, hint, tone }) {
  const color = tone === 'bad' ? '#b91c1c' : tone === 'warn' ? '#b45309' : tone === 'good' ? '#15803d' : 'var(--color-text)';
  return (
    <div className="card" style={{ flex: '1 1 150px', minWidth: 140 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function ChartCard({ title, children, flex = '1 1 360px', height = 240 }) {
  return (
    <div className="card" style={{ flex, minWidth: 300 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}

function Donut({ data, colors, labeler }) {
  if (!data.length) return <EmptyChart />;
  return (
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
        {data.map(d => <Cell key={d.key} fill={(colors && colors[d.key]) || PRIMARY} />)}
      </Pie>
      <Tooltip formatter={(v, n) => [v, labeler ? labeler(n) : n]} />
      <Legend />
    </PieChart>
  );
}
function EmptyChart() {
  const { t } = useI18n();
  return <div className="muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>{t('qhse.dash.rien')}</div>;
}

export default function QhseDashboard() {
  const { t } = useI18n();
  const [d, setD] = useState(null);

  useEffect(() => { client.get('/qhse/dashboard').then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;

  const tAna = tauxConformite(d.analyses.parConformite);
  const tProd = tauxConformite(d.production.parConformite);
  const tExp = tauxConformite(d.expeditions.parConformite);
  const confData = toPie(d.analyses.parConformite, k => t('qhse.conf.' + k));
  const lotsData = toPie(d.lots, k => (t('qhse.dec.' + k).startsWith('qhse.') ? k : t('qhse.dec.' + k)));
  const graviteData = (d.nc.parGravite || []).map(x => ({ name: x.k, value: x.n }));

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.dash.title')}</h1>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Tile label={t('qhse.dash.analyses')} value={d.analyses.total}
          hint={tAna == null ? t('qhse.dash.noVerdict') : `${tAna}% ${t('qhse.dash.conformes')}`}
          tone={tAna == null ? null : tAna >= 90 ? 'good' : tAna >= 70 ? 'warn' : 'bad'} />
        <Tile label={t('qhse.dash.production')} value={d.production.total}
          hint={tProd == null ? '—' : `${tProd}% ${t('qhse.dash.conformes')}`} tone={tProd == null ? null : tProd >= 90 ? 'good' : 'warn'} />
        <Tile label={t('qhse.dash.expeditions')} value={d.expeditions.total}
          hint={tExp == null ? '—' : `${tExp}% ${t('qhse.dash.conformes')}`} tone={tExp == null ? null : tExp >= 90 ? 'good' : 'warn'} />
        <Tile label={t('qhse.dash.ncOuvertes')} value={d.nc.ouvertes} hint={`${d.nc.total} ${t('qhse.dash.total')}`} tone={d.nc.ouvertes > 0 ? 'warn' : 'good'} />
        <Tile label={t('qhse.dash.capaRetard')} value={d.capaRetard.length} tone={d.capaRetard.length > 0 ? 'bad' : 'good'} />
      </div>

      {/* Graphiques */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <ChartCard title={t('qhse.dash.tendance')} flex="2 1 520px" height={260}>
          <ComposedChart data={d.tendance} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="analyses" name={t('qhse.dash.analyses')} fill={PRIMARY} radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="analyses_nc" name={t('qhse.dash.nonConformes')} fill="#b91c1c" radius={[4, 4, 0, 0]} barSize={18} />
            <Line dataKey="nc" name={t('qhse.dash.ncOuvertes')} stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ChartCard>

        <ChartCard title={t('qhse.dash.confAnalyses')} flex="1 1 300px" height={260}>
          <Donut data={confData} colors={CONF_COLORS} labeler={n => n} />
        </ChartCard>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <ChartCard title={t('qhse.dash.ncGravite')}>
          {graviteData.length
            ? <BarChart data={graviteData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name={t('qhse.dash.ncOuvertes')} fill="#b45309" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            : <EmptyChart />}
        </ChartCard>

        <ChartCard title={t('qhse.dash.lots')}>
          <Donut data={lotsData} colors={DEC_COLORS} labeler={n => n} />
        </ChartCard>
      </div>

      {/* Listes de suivi */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px' }}>
          <h3>{t('qhse.dash.ncOuvertes')}</h3>
          <div className="table-wrap"><table><thead><tr>
            <th>N°</th><th>{t('qhse.nc.date')}</th><th>{t('qhse.nc.gravite')}</th><th>{t('qhse.ana.statut')}</th>
          </tr></thead><tbody>
            {d.ncOuvertes.map(n => (
              <tr key={n.id}>
                <td><Link to={`/qhse/non-conformites/${n.id}`}>{n.numero}</Link></td>
                <td>{n.date_detection || '—'}</td><td>{n.severity_libelle || '—'}</td><td>{t('qhse.ncstatut.' + n.statut)}</td>
              </tr>
            ))}
            {d.ncOuvertes.length === 0 && <tr><td colSpan={4} className="empty-row">{t('qhse.dash.rien')}</td></tr>}
          </tbody></table></div>
        </div>

        <div style={{ flex: '1 1 380px' }}>
          <h3>{t('qhse.dash.capaRetard')}</h3>
          <div className="table-wrap"><table><thead><tr>
            <th>NC</th><th>{t('qhse.nc.action')}</th><th>{t('qhse.nc.responsable')}</th><th>{t('qhse.nc.echeance')}</th>
          </tr></thead><tbody>
            {d.capaRetard.map(a => (
              <tr key={a.id}>
                <td><Link to={`/qhse/non-conformites/${a.nc_id}`}>{a.nc_numero}</Link></td>
                <td>{a.description || '—'}</td><td>{a.responsable || '—'}</td>
                <td style={{ color: '#b91c1c' }}>{a.echeance}</td>
              </tr>
            ))}
            {d.capaRetard.length === 0 && <tr><td colSpan={4} className="empty-row">{t('qhse.dash.rien')}</td></tr>}
          </tbody></table></div>
        </div>
      </div>
    </div>
  );
}
