import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));
export const PROJ_STATUTS = [['planifie', 'Planifié'], ['en_cours', 'En cours'], ['en_attente', 'En attente'], ['termine', 'Terminé'], ['annule', 'Annulé']];
const statutLabel = (v) => (PROJ_STATUTS.find(s => s[0] === v)?.[1] || v);

export default function ProjetsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.projets', 'edition');
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('list');
  const [filters, setFilters] = useState({ q: '', statut: '' });
  const [showForm, setShowForm] = useState(false);
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const reload = () => setFilters(f => ({ ...f }));

  useEffect(() => {
    const params = {}; if (filters.q) params.q = filters.q; if (filters.statut) params.statut = filters.statut;
    const timer = setTimeout(() => {
      client.get('/dsi/projects', { params }).then(r => setRows(r.data)).catch(() => setRows([]));
      client.get('/dsi/projects/stats').then(r => setStats(r.data)).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [filters]);

  const list = rows || [];
  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.proj.title')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setView(view === 'list' ? 'kanban' : 'list')}>{view === 'list' ? t('dsi.proj.kanban') : t('dsi.proj.list')}</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('dsi.proj.new')}</button>}
        </div>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatCard label={t('dsi.proj.stat.active')} value={stats.actifs} />
          <StatCard label={t('dsi.proj.stat.overdue')} value={stats.en_retard} accent="#b91c1c" />
          <StatCard label={t('dsi.proj.stat.done')} value={stats.termines} accent="var(--status-green-fg,#15803d)" />
          <StatCard label={t('dsi.proj.stat.avg')} value={(stats.avancement_moyen ?? 0) + ' %'} />
          <StatCard label={t('dsi.proj.stat.budgetPrev')} value={money(stats.budget_prevu)} />
          <StatCard label={t('dsi.proj.stat.budgetCons')} value={money(stats.budget_consomme)} />
        </div>
      )}

      <div className="form-inline" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)} placeholder={t('dsi.proj.search')} style={{ minWidth: 240 }} />
        <select value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">{t('dsi.f.allStatuses')}</option>
          {PROJ_STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {rows === null ? <Loading /> : view === 'kanban' ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {PROJ_STATUTS.filter(s => s[0] !== 'annule').map(([v, l]) => (
            <div key={v} style={{ minWidth: 240, flex: '1 1 240px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{l} <span style={{ color: 'var(--color-text-muted)' }}>({list.filter(p => p.statut === v).length})</span></div>
              {list.filter(p => p.statut === v).map(p => (
                <Link key={p.id} to={`/dsi/projets/${p.id}`} className="card" style={{ display: 'block', marginBottom: 8, textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{p.code} · {p.responsable_nom || '—'}</div>
                  <ProgressBar pct={p.avancement_pct} />
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dsi.proj.code')}</th><th>{t('dsi.proj.nom')}</th><th>{t('dsi.proj.responsable')}</th><th>{t('dsi.proj.statut')}</th><th>{t('dsi.proj.avancement')}</th><th>{t('dsi.proj.echeance')}</th><th /></tr></thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id}>
                    <td><Link to={`/dsi/projets/${p.id}`}><strong>{p.code}</strong></Link></td>
                    <td>{p.nom}</td><td>{p.responsable_nom || '—'}</td><td>{statutLabel(p.statut)}</td>
                    <td style={{ minWidth: 120 }}><ProgressBar pct={p.avancement_pct} /></td>
                    <td>{p.date_fin_prevue ? String(p.date_fin_prevue).slice(0, 10) : '—'}</td>
                    <td><Link to={`/dsi/projets/${p.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td className="empty-row" colSpan={7}>{t('dsi.proj.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && <ProjetForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload(); }} />}
    </div>
  );
}

export function ProgressBar({ pct }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--color-hover)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: v + '%', height: '100%', background: v >= 100 ? 'var(--status-green-fg,#15803d)' : 'var(--color-primary)' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 32, textAlign: 'right' }}>{v}%</span>
    </div>
  );
}

export function ProjetForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [entities, setEntities] = useState([]);
  const [bus, setBus] = useState([]);
  const [f, setF] = useState({
    code: initial?.code || '', nom: initial?.nom || '', description: initial?.description || '',
    responsable_id: initial?.responsable_id || '', sponsor_id: initial?.sponsor_id || '', entity_id: initial?.entity_id || '', business_unit_id: initial?.business_unit_id || '',
    date_debut: initial?.date_debut ? String(initial.date_debut).slice(0, 10) : '', date_fin_prevue: initial?.date_fin_prevue ? String(initial.date_fin_prevue).slice(0, 10) : '',
    budget_prevu: initial?.budget_prevu || '', budget_consomme: initial?.budget_consomme || '', avancement_pct: initial?.avancement_pct ?? 0,
    statut: initial?.statut || 'planifie', commentaire: initial?.commentaire || '',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  useEffect(() => {
    client.get('/dsi/projects/users').then(r => setUsers(r.data)).catch(() => {});
    client.get('/entities').then(r => setEntities(r.data)).catch(() => {});
    client.get('/business-units/mine').then(r => setBus(r.data.map(b => ({ id: b.id, nom: b.nom || b.code })))).catch(() => {});
  }, []);
  const soguipalId = entities.find(en => en.code === 'SOGUIPAL')?.id;
  async function submit(e) {
    e.preventDefault(); if (busy) return; if (!f.nom.trim()) { setErr('Nom requis.'); return; }
    setBusy(true); setErr('');
    try { if (initial?.id) await client.put(`/dsi/projects/${initial.id}`, f); else await client.post('/dsi/projects', f); onSaved(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Erreur.'); setBusy(false); }
  }
  const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>);
  return (
    <Modal title={initial?.id ? t('dsi.proj.edit') : t('dsi.proj.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label={t('dsi.proj.code')}><input value={f.code} onChange={e => set('code', e.target.value)} placeholder={initial ? '' : 'Auto si vide (PRJ-…)'} /></Field>
          <Field label={t('dsi.proj.nom') + ' *'}><input value={f.nom} onChange={e => set('nom', e.target.value)} required /></Field>
          <Field label={t('dsi.proj.responsable')}><SearchableSelect value={f.responsable_id} onChange={v => set('responsable_id', v ?? '')} options={users} getLabel={o => o.nom} placeholder="—" /></Field>
          <Field label={t('dsi.proj.sponsor')}><SearchableSelect value={f.sponsor_id} onChange={v => set('sponsor_id', v ?? '')} options={users} getLabel={o => o.nom} placeholder="—" /></Field>
          <Field label={t('dsi.eq.entity')}><select value={f.entity_id} onChange={e => { set('entity_id', e.target.value); set('business_unit_id', ''); }}><option value="">—</option>{entities.map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}</select></Field>
          {soguipalId && String(f.entity_id) === String(soguipalId) && <Field label={t('dsi.eq.bu')}><SearchableSelect value={f.business_unit_id} onChange={v => set('business_unit_id', v ?? '')} options={bus} getLabel={o => o.nom} placeholder="BU concernée…" /></Field>}
          <Field label={t('dsi.proj.statut')}><select value={f.statut} onChange={e => set('statut', e.target.value)}>{PROJ_STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label={t('dsi.proj.dateDebut')}><input type="date" value={f.date_debut} onChange={e => set('date_debut', e.target.value)} /></Field>
          <Field label={t('dsi.proj.echeance')}><input type="date" value={f.date_fin_prevue} onChange={e => set('date_fin_prevue', e.target.value)} /></Field>
          <Field label={t('dsi.proj.budgetPrev')}><input type="number" step="0.01" value={f.budget_prevu} onChange={e => set('budget_prevu', e.target.value)} /></Field>
          <Field label={t('dsi.proj.budgetCons')}><input type="number" step="0.01" value={f.budget_consomme} onChange={e => set('budget_consomme', e.target.value)} /></Field>
          <Field label={t('dsi.proj.avancement') + ' (%)'}><input type="number" min="0" max="100" value={f.avancement_pct} onChange={e => set('avancement_pct', e.target.value)} /></Field>
        </div>
        <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>{t('dsi.proj.description')}<textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></label>
        {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : (initial?.id ? t('common.save') : t('common.add'))}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

function StatCard({ label, value, accent }) {
  return (<div className="card" style={{ minWidth: 120, flex: '1 1 130px' }}>
    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value ?? '—'}</div>
  </div>);
}
