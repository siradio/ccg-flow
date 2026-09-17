import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import DsiSubnav from './DsiSubnav';
import { AssignForm } from './ParcDetail.jsx';
import { beneficiaireLabel } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Affectations en cours : vue centrée bénéficiaire. On peut créer une affectation directement ici
// (choix de l'équipement) ou depuis la fiche d'un équipement.
export default function Affectations() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canAssign = hasSubModuleLevel(user, 'dsi.affectations', 'edition');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lists, setLists] = useState({ entities: [], sites: [], employees: [], bus: [] });
  const [equipments, setEquipments] = useState([]);
  const [tick, setTick] = useState(0);
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');

  const reload = () => setTick(t => t + 1);
  useEffect(() => {
    const params = { statut: 'affecte', page, pageSize: 20 };
    if (q.trim()) params.q = q.trim();
    const timer = setTimeout(() => { client.get('/dsi/equipment', { params }).then(r => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 })); }, 250);
    return () => clearTimeout(timer);
  }, [page, q, tick]);

  async function openForm() {
    // Équipements affectables (non déjà affectés) + listes bénéficiaires.
    const [free, entities, sites, employees, bus] = await Promise.all([
      client.get('/dsi/equipment', { params: { pageSize: 200 } }).then(r => (r.data.items || []).filter(e => e.statut !== 'affecte').map(e => ({ id: e.id, nom: `${e.numero_inventaire} — ${e.designation}` }))).catch(() => []),
      client.get('/entities').then(r => r.data).catch(() => []),
      client.get('/sites').then(r => r.data).catch(() => []),
      client.get('/rh/employees').then(r => r.data.map(e => ({ id: e.id, nom: `${e.matricule ? e.matricule + ' — ' : ''}${e.prenom || ''} ${e.nom || ''}`.trim() }))).catch(() => []),
      client.get('/business-units/mine').then(r => r.data.map(b => ({ id: b.id, nom: b.nom || b.code }))).catch(() => []),
    ]);
    setEquipments(free); setLists({ entities, sites, employees, bus }); setShowForm(true);
  }

  const items = data?.items || [];
  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.nav.affectations')}</h1>
        {canAssign && <button className="btn btn-primary" onClick={openForm}>{t('dsi.assign.new')}</button>}
      </div>
      <div className="form-inline" style={{ margin: '12px 0' }}>
        <input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={t('dsi.parc.search')} style={{ minWidth: 260 }} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {!data ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('dsi.eq.numero')}</th><th>{t('dsi.eq.designation')}</th><th>{t('dsi.assign.beneficiaire')}</th>
                <th>{t('dsi.assign.type')}</th><th>{t('dsi.eq.entity')}</th><th>{t('dsi.eq.site')}</th><th />
              </tr></thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td><Link to={`/dsi/parc/${e.id}`}><strong>{e.numero_inventaire}</strong></Link></td>
                    <td>{e.designation}</td>
                    <td>{e.assigned_employee_nom || e.assigned_bu_nom || e.assigned_entity_code || e.assigned_site_nom || '—'}</td>
                    <td>{beneficiaireLabel(e.beneficiaire_type)}</td>
                    <td>{e.entity_code || '—'}</td>
                    <td>{e.site_nom || '—'}</td>
                    <td><Link to={`/dsi/parc/${e.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={7}>{t('dsi.assign.none')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}

      {showForm && (
        <AssignForm mode="assign" lists={lists} equipments={equipments} onClose={() => setShowForm(false)}
          onSubmit={async (f) => { const { equipment_id, ...rest } = f; await client.post(`/dsi/equipment/${equipment_id}/assign`, rest); setShowForm(false); reload(); }} />
      )}
    </div>
  );
}
