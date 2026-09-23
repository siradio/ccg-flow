import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

const CRIT = { faible: ['Faible', 'var(--color-hover)', 'var(--color-text-muted)'], moyen: ['Moyen', '#dbeafe', '#1d4ed8'], eleve: ['Élevé', '#fef3c7', '#b45309'], critique: ['Critique', '#fee2e2', '#b91c1c'] };
function CritBadge({ v }) { const c = CRIT[v] || CRIT.faible; return <span style={{ background: c[1], color: c[2], padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{c[0]}</span>; }
const R_STATUTS = [['ouvert', 'Ouvert'], ['en_cours', 'En cours'], ['maitrise', 'Maîtrisé'], ['clos', 'Clos']];

// Défini au niveau module (identité stable) : sinon React remonte les champs à chaque frappe → perte du focus.
const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>);

export default function RisquesList() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.risques', 'edition');
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ q: '', statut: '', criticite: '' });
  const [form, setForm] = useState(null);
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const reload = () => setFilters(f => ({ ...f }));
  useEffect(() => {
    const params = {}; Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    const timer = setTimeout(() => {
      client.get('/dsi/risks', { params }).then(r => setRows(r.data)).catch(() => setRows([]));
      client.get('/dsi/risks/stats').then(r => setStats(r.data)).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [filters]);
  const list = rows || [];
  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.risk.title')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}>{t('dsi.risk.new')}</button>}
      </div>
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatCard label={t('dsi.risk.stat.open')} value={stats.ouverts} />
          <StatCard label={t('dsi.risk.stat.critical')} value={stats.critiques} accent="#b91c1c" />
          <StatCard label={t('dsi.risk.stat.high')} value={stats.eleves} accent="var(--status-amber-fg,#b45309)" />
          <StatCard label={t('dsi.risk.stat.overdue')} value={stats.en_retard} />
        </div>
      )}
      <div className="form-inline" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)} placeholder={t('dsi.risk.search')} style={{ minWidth: 240 }} />
        <select value={filters.criticite} onChange={e => setF('criticite', e.target.value)}><option value="">{t('dsi.risk.allCrit')}</option>{Object.entries(CRIT).map(([v, c]) => <option key={v} value={v}>{c[0]}</option>)}</select>
        <select value={filters.statut} onChange={e => setF('statut', e.target.value)}><option value="">{t('dsi.f.allStatuses')}</option>{R_STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {rows === null ? <Loading /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dsi.risk.ref')}</th><th>{t('dsi.risk.sujet')}</th><th>{t('dsi.risk.categorie')}</th><th>{t('dsi.risk.criticite')}</th><th>{t('dsi.risk.responsable')}</th><th>{t('dsi.risk.echeance')}</th><th>{t('dsi.risk.statut')}</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.reference}</strong></td><td>{r.sujet}</td><td>{r.categorie || '—'}</td>
                    <td><CritBadge v={r.criticite} /></td><td>{r.responsable_nom || '—'}</td><td>{dfmt(r.echeance)}</td>
                    <td>{R_STATUTS.find(s => s[0] === r.statut)?.[1] || r.statut}</td>
                    {canEdit && <td><button className="btn btn-secondary btn-sm" onClick={() => setForm({ initial: r })}>{t('common.edit')}</button></td>}
                  </tr>
                ))}
                {list.length === 0 && <tr><td className="empty-row" colSpan={canEdit ? 8 : 7}>{t('dsi.risk.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {form && <RisqueForm initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}

function RisqueForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const [cats, setCats] = useState([]); const [users, setUsers] = useState([]); const [projects, setProjects] = useState([]);
  const [f, setF] = useState({
    sujet: initial?.sujet || '', description: initial?.description || '', category_id: initial?.category_id || '',
    probabilite: initial?.probabilite || 2, impact: initial?.impact || 2, responsable_id: initial?.responsable_id || '',
    mitigation: initial?.mitigation || '', echeance: initial?.echeance ? String(initial.echeance).slice(0, 10) : '',
    statut: initial?.statut || 'ouvert', project_id: initial?.project_id || '', commentaire: initial?.commentaire || '',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  useEffect(() => {
    client.get('/dsi/referentials/risk-categories').then(r => setCats(r.data.map(x => ({ id: x.id, nom: x.libelle })))).catch(() => {});
    client.get('/dsi/risks/users').then(r => setUsers(r.data)).catch(() => {});
    client.get('/dsi/projects').then(r => setProjects(r.data.map(p => ({ id: p.id, nom: `${p.code} — ${p.nom}` })))).catch(() => {});
  }, []);
  async function submit(e) { e.preventDefault(); if (busy) return; if (!f.sujet.trim()) { setErr('Sujet requis.'); return; } setBusy(true); setErr(''); try { if (initial?.id) await client.put(`/dsi/risks/${initial.id}`, f); else await client.post('/dsi/risks', f); onSaved(); } catch (e2) { setErr(e2.response?.data?.error || 'Erreur.'); setBusy(false); } }
  const scale = [1, 2, 3, 4];
  return (
    <Modal title={initial?.id ? t('dsi.risk.edit') : t('dsi.risk.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label={t('dsi.risk.sujet') + ' *'}><input value={f.sujet} onChange={e => set('sujet', e.target.value)} required /></Field>
          <Field label={t('dsi.risk.categorie')}><SearchableSelect value={f.category_id} onChange={v => set('category_id', v ?? '')} options={cats} getLabel={o => o.nom} placeholder="—" /></Field>
          <Field label={t('dsi.risk.probabilite')}><select value={f.probabilite} onChange={e => set('probabilite', e.target.value)}>{scale.map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label={t('dsi.risk.impact')}><select value={f.impact} onChange={e => set('impact', e.target.value)}>{scale.map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label={t('dsi.risk.responsable')}><SearchableSelect value={f.responsable_id} onChange={v => set('responsable_id', v ?? '')} options={users} getLabel={o => o.nom} placeholder="—" /></Field>
          <Field label={t('dsi.risk.echeance')}><input type="date" value={f.echeance} onChange={e => set('echeance', e.target.value)} /></Field>
          <Field label={t('dsi.risk.statut')}><select value={f.statut} onChange={e => set('statut', e.target.value)}>{R_STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label={t('dsi.risk.projet')}><SearchableSelect value={f.project_id} onChange={v => set('project_id', v ?? '')} options={projects} getLabel={o => o.nom} placeholder="—" /></Field>
        </div>
        <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>{t('dsi.risk.mitigation')}<textarea rows={2} value={f.mitigation} onChange={e => set('mitigation', e.target.value)} /></label>
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
    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value ?? '—'}</div>
  </div>);
}
