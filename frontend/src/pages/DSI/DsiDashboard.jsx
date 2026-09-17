import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import Loading from '../../components/Loading';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const HEALTH = { vert: ['🟢', 'Normal', '#15803d'], orange: ['🟠', 'Attention', '#b45309'], rouge: ['🔴', 'Critique', '#b91c1c'] };

export default function DsiDashboard() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [entities, setEntities] = useState([]);
  const [entity, setEntity] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { client.get('/entities').then(r => setEntities(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setD(null);
    client.get('/dsi/dashboard', { params: entity ? { entity_id: entity } : {} }).then(r => setD(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  }, [entity]);

  if (error) return <div><DsiSubnav /><div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div></div>;

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.dash.title')}</h1>
        <select value={entity} onChange={e => setEntity(e.target.value)}>
          <option value="">{t('dsi.f.allEntities')}</option>
          {entities.map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}
        </select>
      </div>

      {!d ? <Loading /> : (
        <>
          {/* Indicateur de santé du SI */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0' }}>
            {[['parc', t('dsi.nav.parc')], ['support', t('dsi.dash.support')], ['sla', 'SLA'], ['maintenance', t('dsi.nav.maintenance')], ['projets', t('dsi.nav.projets')], ['securite', t('dsi.dash.security')]].map(([k, label]) => {
              const h = HEALTH[d.health?.[k]] || HEALTH.vert;
              return (
                <div key={k} className="card" style={{ minWidth: 140, flex: '1 1 150px', borderLeft: `4px solid ${h[2]}` }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{h[0]} {h[1]}</div>
                </div>
              );
            })}
          </div>

          <Section title={t('dsi.dash.parc')} onClick={() => nav('/dsi/parc')}>
            <KPI label={t('dsi.stat.total')} v={d.parc.total} />
            <KPI label={t('dsi.stat.disponibles')} v={d.parc.disponibles} />
            <KPI label={t('dsi.stat.affectes')} v={d.parc.affectes} />
            <KPI label={t('dsi.stat.maintenance')} v={d.parc.en_maintenance} />
            <KPI label={t('dsi.stat.panne')} v={d.parc.en_panne} accent="#b91c1c" />
            <KPI label={t('dsi.stat.horsGarantie')} v={d.parc.hors_garantie} />
            <KPI label={t('dsi.stat.valeur')} v={money(d.parc.valeur)} />
          </Section>
          <Charts data={d.parc.parCategorie} title={t('dsi.dash.parcByCat')} />

          <Section title={t('dsi.dash.support')} onClick={() => nav('/dsi/tickets')}>
            <KPI label={t('dsi.tk.stat.open')} v={d.support.ouverts} />
            <KPI label={t('dsi.tk.stat.inProgress')} v={d.support.en_cours} />
            <KPI label={t('dsi.tk.stat.waiting')} v={d.support.en_attente} />
            <KPI label={t('dsi.tk.stat.critical')} v={d.support.critiques} accent="#b91c1c" />
            <KPI label={t('dsi.tk.stat.createdToday')} v={d.support.crees_aujourdhui} />
            <KPI label={t('dsi.tk.stat.resolvedToday')} v={d.support.resolus_aujourdhui} />
          </Section>
          <Section title={t('dsi.dash.perf')}>
            <KPI label={t('dsi.dash.sla')} v={d.perf.sla_pct == null ? '—' : d.perf.sla_pct + ' %'} accent={d.perf.sla_pct != null && d.perf.sla_pct < 90 ? '#b45309' : undefined} />
            <KPI label={t('dsi.dash.mtta')} v={d.perf.mtta_min == null ? '—' : d.perf.mtta_min + ' min'} />
            <KPI label={t('dsi.dash.mttr')} v={d.perf.mttr_min == null ? '—' : d.perf.mttr_min + ' min'} />
            <KPI label={t('dsi.dash.resolved')} v={d.perf.resolus} />
          </Section>
          <Charts data={d.support.parCategorie} title={t('dsi.dash.ticketsByCat')} />

          <Section title={t('dsi.nav.maintenance')} onClick={() => nav('/dsi/maintenance')}>
            <KPI label={t('dsi.maint.stat.inProgress')} v={d.maintenance.en_cours} />
            <KPI label={t('dsi.maint.stat.planned')} v={d.maintenance.planifiees} />
            <KPI label={t('dsi.maint.stat.overdue')} v={d.maintenance.en_retard} accent="#b91c1c" />
            <KPI label={t('dsi.maint.stat.cost')} v={money(d.maintenance.cout_total)} />
          </Section>

          <Section title={t('dsi.nav.projets')} onClick={() => nav('/dsi/projets')}>
            <KPI label={t('dsi.proj.stat.active')} v={d.projets.actifs} />
            <KPI label={t('dsi.proj.stat.overdue')} v={d.projets.en_retard} accent="#b91c1c" />
            <KPI label={t('dsi.proj.stat.done')} v={d.projets.termines} />
            <KPI label={t('dsi.proj.stat.avg')} v={(d.projets.avancement_moyen ?? 0) + ' %'} />
            <KPI label={t('dsi.proj.stat.budgetCons')} v={money(d.projets.budget_consomme)} />
          </Section>

          <Section title={t('dsi.nav.risques')} onClick={() => nav('/dsi/risques')}>
            <KPI label={t('dsi.risk.stat.open')} v={d.risques.ouverts} />
            <KPI label={t('dsi.risk.stat.critical')} v={d.risques.critiques} accent="#b91c1c" />
            <KPI label={t('dsi.risk.stat.high')} v={d.risques.eleves} accent="#b45309" />
            <KPI label={t('dsi.risk.stat.overdue')} v={d.risques.en_retard} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, onClick, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 15, marginBottom: 8, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>{title}{onClick && <span style={{ color: 'var(--color-text-muted)', fontSize: 12, marginLeft: 8 }}>→</span>}</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}
function KPI({ label, v, accent }) {
  return (
    <div className="card" style={{ minWidth: 110, flex: '1 1 120px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{v ?? '—'}</div>
    </div>
  );
}
function Charts({ data, title }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="value" fill="var(--color-primary, #2563eb)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
