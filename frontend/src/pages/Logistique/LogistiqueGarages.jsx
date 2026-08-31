import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import { useSort, SortTh } from '../../components/useSort.jsx';
import { useI18n } from '../../i18n/I18nContext';

const emptyForm = () => ({ id: null, nom: '', ville: '', sous_contrat: false, specialites: '', efficacite_pct: '', telephone: '', notes: '', actif: true });
const nb = (n, lang) => (n == null ? '—' : Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR'));

export default function LogistiqueGarages() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { sort, by, apply } = useSort();
  const canView = hasSubModuleLevel(user, 'logistique.maintenance');
  const canAdd = hasSubModuleLevel(user, 'logistique.maintenance', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.maintenance', 'edition');

  const [garages, setGarages] = useState([]);
  const [reparations, setReparations] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function load() {
    client.get('/garages/with-stats').then(r => setGarages(r.data)).catch(() => {});
    client.get('/reparations', { params: { en_cours: true } }).then(r => setReparations(r.data)).catch(() => {});
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  if (!canView) return <div><LogistiqueSubnav /><p>{t('log.notGranted')}</p></div>;

  function startCreate() { setForm(emptyForm()); setShowForm(true); setError(''); }
  function startEdit(g) { setForm({ ...emptyForm(), ...g, efficacite_pct: g.efficacite_pct ?? '' }); setShowForm(true); setError(''); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  function cancel() { setShowForm(false); setForm(emptyForm()); setError(''); }

  async function save(e) {
    e.preventDefault();
    if (!form.nom.trim()) { setError(t('log.gar.nameRequired')); return; }
    setError('');
    const body = { nom: form.nom, ville: form.ville, sous_contrat: form.sous_contrat, specialites: form.specialites, efficacite_pct: form.efficacite_pct === '' ? null : Number(form.efficacite_pct), telephone: form.telephone, notes: form.notes, actif: form.actif };
    try {
      if (form.id) await client.put(`/garages/${form.id}`, body);
      else await client.post('/garages', body);
      cancel(); load();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }
  async function remove(g) {
    if (!window.confirm(t('log.gar.confirmDelete', { nom: g.nom }))) return;
    await client.delete(`/garages/${g.id}`);
    load();
  }
  async function closeReparation(r) {
    const cout = window.prompt(t('log.gar.finalCostPrompt'), r.cout ?? '');
    if (cout === null) return;
    await client.post(`/reparations/${r.id}/close`, cout.trim() ? { cout: Number(cout) } : {});
    load();
  }

  const totalCout = garages.reduce((s, g) => s + (g.cout_total || 0), 0);
  const enReparation = reparations.length;
  const sousContrat = garages.filter(g => g.sous_contrat).length;

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('log.gar.title')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('log.gar.subtitle')}</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={showForm && !form.id ? cancel : startCreate}>{showForm && !form.id ? t('common.cancel') : t('log.gar.newGarage')}</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('log.gar.partners')}</div><div style={{ fontSize: 26, fontWeight: 800 }}>{garages.length}</div><div style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{t('log.gar.underContractCount', { n: sousContrat })}</div></div>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('log.gar.vehInRepair')}</div><div style={{ fontSize: 26, fontWeight: 800, color: enReparation ? 'var(--status-amber-fg)' : 'var(--color-text)' }}>{enReparation}</div></div>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('log.gar.totalCost')}</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-primary)' }}>{nb(totalCout, lang)}</div></div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <SortTh label={t('log.garage')} colKey="nom" get={r => r.nom} sort={sort} by={by} />
              <SortTh label={t('log.gar.city')} colKey="ville" get={r => r.ville} sort={sort} by={by} />
              <SortTh label={t('log.gar.contract')} colKey="contrat" get={r => (r.sous_contrat ? 1 : 0)} sort={sort} by={by} />
              <SortTh label={t('log.gar.inRepair')} colKey="enrep" get={r => Number(r.en_reparation) || 0} sort={sort} by={by} />
              <SortTh label={t('log.gar.avgDuration')} colKey="duree" get={r => (r.duree_moy_jours == null ? null : Number(r.duree_moy_jours))} sort={sort} by={by} />
              <SortTh label={t('log.gar.totalCostShort')} colKey="cout" get={r => (r.cout_total == null ? null : Number(r.cout_total))} sort={sort} by={by} />
              <SortTh label={t('log.gar.efficiency')} colKey="eff" get={r => (r.efficacite_pct == null ? null : Number(r.efficacite_pct))} sort={sort} by={by} />
              {canEdit && <th className="sticky-col" />}
            </tr></thead>
            <tbody>
              {apply(garages).map(g => (
                <tr key={g.id}>
                  <td><strong>{g.nom}</strong>{g.specialites ? <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.specialites}</div> : null}</td>
                  <td>{g.ville || '—'}</td>
                  <td>{g.sous_contrat ? <span className="badge" style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-fg)' }}>{t('log.gar.underContract')}</span> : <span style={{ color: 'var(--color-text-faint)' }}>{t('log.gar.noContract')}</span>}</td>
                  <td>{g.en_reparation > 0 ? <span className="badge" style={{ background: 'var(--status-amber-bg)', color: 'var(--status-amber-fg)' }}>{g.en_reparation}</span> : '—'}</td>
                  <td>{g.duree_moy_jours != null ? `${g.duree_moy_jours.toFixed(1)} ${t('log.dayAbbr')}` : '—'}</td>
                  <td>{nb(g.cout_total, lang)}</td>
                  <td>{g.efficacite_pct != null ? `${g.efficacite_pct} %` : '—'}</td>
                  {canEdit && (
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => startEdit(g)}>{t('common.edit')}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(g)}>{t('common.delete')}</button>
                    </td>
                  )}
                </tr>
              ))}
              {garages.length === 0 && <tr><td className="empty-row" colSpan={8}>{t('log.gar.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h2 style={{ margin: '0 0 8px' }}>{t('log.gar.ongoingRepairs')}</h2>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('log.f.vehicle_id')}</th><th>{t('log.garage')}</th><th>{t('log.gar.breakdown')}</th><th>{t('log.gar.since')}</th>{canEdit && <th className="sticky-col" />}</tr></thead>
            <tbody>
              {reparations.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.vehicle_immat || '—'}</strong></td>
                  <td>{r.garage_nom || '—'}</td>
                  <td>{r.panne_ref || '—'}</td>
                  <td>{new Date(r.date_debut).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}</td>
                  {canEdit && <td className="sticky-col"><button className="btn btn-secondary btn-sm" onClick={() => closeReparation(r)}>{t('log.gar.closeRepair')}</button></td>}
                </tr>
              ))}
              {reparations.length === 0 && <tr><td className="empty-row" colSpan={5}>{t('log.gar.noOngoing')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (canAdd || (form.id && canEdit)) && (
        <section className="card" style={{ marginTop: 16 }}>
          <form onSubmit={save} className="form-inline" style={{ flexWrap: 'wrap', maxWidth: 'none' }}>
            <strong style={{ width: '100%', fontSize: 15 }}>{form.id ? t('log.gar.editGarage') : t('log.gar.newGarageTitle')}</strong>
            <label className="field">{t('log.name')}<input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required /></label>
            <label className="field">{t('log.gar.city')}<input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} /></label>
            <label className="field">{t('log.gar.specialties')}<input value={form.specialites} onChange={e => setForm(f => ({ ...f, specialites: e.target.value }))} placeholder={t('log.gar.specialtiesPh')} /></label>
            <label className="field">{t('log.gar.efficiencyPct')}<input type="number" value={form.efficacite_pct} onChange={e => setForm(f => ({ ...f, efficacite_pct: e.target.value }))} /></label>
            <label className="field">{t('log.f.telephone')}<input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.sous_contrat} onChange={e => setForm(f => ({ ...f, sous_contrat: e.target.checked }))} /> {t('log.gar.underContract')}</label>
            {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
            <button type="submit" className="btn btn-primary">{form.id ? t('common.save') : t('log.gar.createGarage')}</button>
            <button type="button" className="btn btn-secondary" onClick={cancel}>{t('common.cancel')}</button>
          </form>
        </section>
      )}
    </div>
  );
}
