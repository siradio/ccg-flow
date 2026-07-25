import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasModule } from '../../auth/AuthContext';
import { StatutBadge } from './statutBadge.jsx';

export default function ListPage() {
  const { user } = useAuth();
  const canWrite = hasModule(user, 'rh');
  const [employees, setEmployees] = useState([]);
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', entity_id: '', business_unit_id: '', statut: '' });

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.q) params.q = filters.q;
    if (filters.entity_id) params.entity_id = filters.entity_id;
    if (filters.business_unit_id) params.business_unit_id = filters.business_unit_id;
    if (filters.statut) params.statut = filters.statut;
    const timer = setTimeout(() => {
      client.get('/employees', { params }).then(res => setEmployees(res.data)).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [filters]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employés</h1>
          <p className="page-subtitle">{employees.length} employé(s){loading ? '…' : ''}</p>
        </div>
        {canWrite && <Link to="/employees/new" className="btn btn-primary">+ Nouvel employé</Link>}
      </div>

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <input
          placeholder="Rechercher (nom, matricule, poste)…"
          value={filters.q}
          onChange={e => setFilter('q', e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={filters.entity_id} onChange={e => setFilter('entity_id', e.target.value)}>
          <option value="">Toutes les entités</option>
          {entities.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <select value={filters.business_unit_id} onChange={e => setFilter('business_unit_id', e.target.value)}>
          <option value="">Toutes les BU</option>
          {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select value={filters.statut} onChange={e => setFilter('statut', e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
          <option value="sorti">Sorti</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Nom</th>
                <th>Poste</th>
                <th>Département</th>
                <th>Entité</th>
                <th>Business Unit</th>
                <th>Site</th>
                <th>Statut</th>
                <th>Ancienneté</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td>{emp.matricule || '—'}</td>
                  <td>{emp.prenom} {emp.nom}</td>
                  <td>{emp.poste || '—'}</td>
                  <td>{emp.departement || '—'}</td>
                  <td>{emp.entity_code}</td>
                  <td>{emp.business_unit_nom || '—'}</td>
                  <td>{emp.site_nom || '—'}</td>
                  <td><StatutBadge statut={emp.statut} /></td>
                  <td>{emp.anciennete_annees != null ? `${emp.anciennete_annees} an(s)` : '—'}</td>
                  {canWrite && <td><Link to={`/employees/${emp.id}`} className="btn btn-secondary btn-sm">Éditer</Link></td>}
                </tr>
              ))}
              {!loading && employees.length === 0 && (
                <tr><td className="empty-row" colSpan={canWrite ? 10 : 9}>Aucun employé ne correspond à ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
