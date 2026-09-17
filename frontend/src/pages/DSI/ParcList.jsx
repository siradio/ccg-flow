import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import DsiSubnav from './DsiSubnav';
import EquipmentForm from './EquipmentForm.jsx';
import { EquipStatutBadge, EQUIP_STATUTS } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));

export default function ParcList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.parc', 'edition');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ q: '', category_id: '', statut: '', entity_id: '', site_id: '', brand_id: '' });
  const [lists, setLists] = useState({ categories: [], types: [], brands: [], entities: [], sites: [], suppliers: [] });

  const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  useEffect(() => {
    Promise.all([
      client.get('/dsi/referentials/categories').then(r => r.data.map(c => ({ id: c.id, nom: c.libelle }))).catch(() => []),
      client.get('/dsi/referentials/types').then(r => r.data.map(x => ({ id: x.id, nom: x.libelle, category_id: x.category_id }))).catch(() => []),
      client.get('/dsi/referentials/brands').then(r => r.data.map(x => ({ id: x.id, nom: x.nom }))).catch(() => []),
      client.get('/entities').then(r => r.data).catch(() => []),
      client.get('/sites').then(r => r.data).catch(() => []),
      client.get('/suppliers').then(r => r.data.map(s => ({ id: s.id, nom: s.nom }))).catch(() => []),
    ]).then(([categories, types, brands, entities, sites, suppliers]) =>
      setLists({ categories, types, brands, entities, sites, suppliers }));
  }, []);

  useEffect(() => {
    setError('');
    const params = { page, pageSize: 20 };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    const timer = setTimeout(() => {
      client.get('/dsi/equipment', { params }).then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur de chargement.'));
      client.get('/dsi/equipment/stats', { params: filters.entity_id ? { entity_id: filters.entity_id } : {} }).then(r => setStats(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [page, filters]);

  const sites = useMemo(() => (lists.sites || []).filter(s => !filters.entity_id || String(s.entity_id) === String(filters.entity_id)), [lists.sites, filters.entity_id]);
  const items = data?.items || [];

  async function createEquipment(payload) {
    await client.post('/dsi/equipment', payload);
    setShowForm(false);
    setPage(1);
    setFilters(f => ({ ...f })); // relance le chargement
  }

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.parc.title')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('dsi.parc.new')}</button>}
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatCard label={t('dsi.stat.total')} value={stats.total} />
          <StatCard label={t('dsi.stat.disponibles')} value={stats.disponibles} accent="var(--status-green-fg,#15803d)" />
          <StatCard label={t('dsi.stat.affectes')} value={stats.affectes} />
          <StatCard label={t('dsi.stat.maintenance')} value={stats.en_maintenance} accent="var(--status-amber-fg,#b45309)" />
          <StatCard label={t('dsi.stat.panne')} value={stats.en_panne} accent="#b91c1c" />
          <StatCard label={t('dsi.stat.horsGarantie')} value={stats.hors_garantie} />
          <StatCard label={t('dsi.stat.valeur')} value={money(stats.valeur)} />
        </div>
      )}

      <div className="form-inline" style={{ marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)} placeholder={t('dsi.parc.search')} style={{ minWidth: 240 }} />
        <select value={filters.category_id} onChange={e => setF('category_id', e.target.value)}>
          <option value="">{t('dsi.f.allCategories')}</option>
          {lists.categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">{t('dsi.f.allStatuses')}</option>
          {EQUIP_STATUTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <select value={filters.brand_id} onChange={e => setF('brand_id', e.target.value)}>
          <option value="">{t('dsi.f.allBrands')}</option>
          {lists.brands.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select value={filters.entity_id} onChange={e => { setF('entity_id', e.target.value); setF('site_id', ''); }}>
          <option value="">{t('dsi.f.allEntities')}</option>
          {lists.entities.map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}
        </select>
        <select value={filters.site_id} onChange={e => setF('site_id', e.target.value)}>
          <option value="">{t('dsi.f.allSites')}</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {!data ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('dsi.eq.numero')}</th><th>{t('dsi.eq.designation')}</th><th>{t('dsi.eq.categorie')}</th>
                <th>{t('dsi.eq.marque')}</th><th>{t('dsi.eq.statut')}</th><th>{t('dsi.eq.entity')}</th>
                <th>{t('dsi.eq.site')}</th><th>{t('dsi.eq.assignedTo')}</th><th />
              </tr></thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td><Link to={`/dsi/parc/${e.id}`}><strong>{e.numero_inventaire}</strong></Link></td>
                    <td>{e.designation}</td>
                    <td>{e.categorie || '—'}</td>
                    <td>{e.marque || '—'}</td>
                    <td><EquipStatutBadge statut={e.statut} /></td>
                    <td>{e.entity_code || '—'}</td>
                    <td>{e.site_nom || '—'}</td>
                    <td>{e.assigned_employee_nom || e.assigned_bu_nom || e.assigned_entity_code || e.assigned_site_nom || '—'}</td>
                    <td><Link to={`/dsi/parc/${e.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={9}>{t('dsi.parc.empty')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}

      {showForm && <EquipmentForm lists={lists} onClose={() => setShowForm(false)} onSubmit={createEquipment} />}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card" style={{ minWidth: 120, flex: '1 1 130px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value ?? '—'}</div>
    </div>
  );
}
