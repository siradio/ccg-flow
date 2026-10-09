import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import { useI18n } from '../../i18n/I18nContext';

const today = () => new Date().toISOString().slice(0, 10);

export default function CongeForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [solde, setSolde] = useState(null);
  const [team, setTeam] = useState([]);        // membres de l'équipe (demande pour autrui)
  const [onBehalf, setOnBehalf] = useState(false);
  const [form, setForm] = useState({ type_id: '', date_debut: today(), date_fin: today(), motif: '', commentaire: '', remplacement: '', on_behalf_employee_id: '' });
  const [jours, setJours] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { client.get('/rh/types?domaine=conge').then(r => setTypes(r.data)).catch(() => {}); }, []);
  useEffect(() => { client.get('/rh/my-team').then(r => setTeam(r.data)).catch(() => setTeam([])); }, []);
  // Solde : celui du membre choisi si demande « pour autrui », sinon le sien.
  useEffect(() => {
    const url = (onBehalf && form.on_behalf_employee_id) ? `/rh/conge-solde?employee_id=${form.on_behalf_employee_id}` : '/rh/conge-solde';
    client.get(url).then(r => setSolde(r.data)).catch(() => setSolde(null));
  }, [onBehalf, form.on_behalf_employee_id]);
  useEffect(() => {
    if (!form.date_debut || !form.date_fin) { setJours(null); return; }
    client.get(`/rh/working-days?from=${form.date_debut}&to=${form.date_fin}`).then(r => setJours(r.data.jours)).catch(() => setJours(null));
  }, [form.date_debut, form.date_fin]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedType = types.find(x => String(x.id) === String(form.type_id));
  const imputable = !!selectedType?.imputable_solde;
  // Dépassement de solde : seulement pour les congés imputables, quand on a le solde et le nb de jours.
  const depasse = imputable && solde && jours != null && jours > solde.disponible;

  async function submit(e, andSubmit) {
    e.preventDefault();
    if (onBehalf && !form.on_behalf_employee_id) { setError(t('rh.team.selectMember')); return; }
    setError(''); setSaving(true);
    try {
      const payload = { ...form, on_behalf_employee_id: onBehalf ? form.on_behalf_employee_id : '' };
      const res = await client.post('/rh/requests/conge', payload);
      const id = res.data.id;
      if (file) { const fd = new FormData(); fd.append('file', file); await client.post(`/rh/requests/${id}/attachments`, fd); }
      if (andSubmit) await client.post(`/rh/requests/${id}/submit`);
      navigate(`/rh/demandes/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || t('rh.saveError'));
    } finally { setSaving(false); }
  }

  return (
    <div>
      <RhSubnav />
      <h1 className="page-title">{t('rh.conge.newTitle')}</h1>

      {solde && (
        <div className="card" style={{ maxWidth: 640, marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('rh.solde.available')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: solde.disponible > 0 ? 'var(--status-green-fg, #15803d)' : 'var(--status-red-fg, #b91c1c)' }}>{solde.disponible} {t('rh.daysUnit')}</div></div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {t('rh.solde.acquired')}: <strong>{solde.acquis}</strong> · {t('rh.solde.taken')}: <strong>{solde.pris}</strong> · {t('rh.solde.pending')}: <strong>{solde.enAttente}</strong>
            <div style={{ marginTop: 2 }}>{t('rh.solde.rate', { taux: solde.taux })}</div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={e => submit(e, true)} className="form-grid" style={{ maxWidth: 'none' }}>
          {team.length > 0 && (
            <div className="field" style={{ background: 'var(--color-hover)', padding: 10, borderRadius: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <input type="checkbox" checked={onBehalf} onChange={e => { setOnBehalf(e.target.checked); if (!e.target.checked) set('on_behalf_employee_id', ''); }} />
                {t('rh.team.forMember')}
              </label>
              {onBehalf && (
                <div style={{ marginTop: 8 }}>
                  <SearchableSelect value={form.on_behalf_employee_id} onChange={v => set('on_behalf_employee_id', v ?? '')}
                    options={team} getLabel={m => `${m.prenom} ${m.nom}${m.matricule ? ` (${m.matricule})` : ''}`}
                    getSearch={m => `${m.prenom} ${m.nom} ${m.matricule || ''}`} placeholder={t('rh.team.selectMember')} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginTop: 4 }}>{t('rh.team.bypassHint')}</span>
                </div>
              )}
            </div>
          )}
          <label className="field">{t('rh.conge.type')}
            <select value={form.type_id} onChange={e => set('type_id', e.target.value)} required>
              <option value="" disabled>{t('rh.absence.typeDots')}</option>
              {types.map(x => <option key={x.id} value={x.id}>{x.libelle}{x.imputable_solde ? '' : ` (${t('rh.solde.notCounted')})`}</option>)}
            </select>
          </label>
          {selectedType?.jours_accordes != null && (
            <div className="alert" style={{ background: 'var(--color-hover)', color: 'var(--color-text-muted)', margin: 0 }}>
              {t('rh.form.joursAccordes', { jours: selectedType.jours_accordes })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 160px' }}>{t('rh.absence.from')}
              <input type="date" value={form.date_debut} onChange={e => set('date_debut', e.target.value)} required />
            </label>
            <label className="field" style={{ flex: '1 1 160px' }}>{t('rh.absence.to')}
              <input type="date" value={form.date_fin} min={form.date_debut} onChange={e => set('date_fin', e.target.value)} required />
            </label>
            <div className="field" style={{ flex: '1 1 120px' }}>{t('rh.absence.days')}
              <div style={{ padding: '8px 0', fontWeight: 700, fontSize: 18 }}>{jours != null ? jours : '—'}</div>
            </div>
          </div>
          {depasse && (
            <div className="alert alert-danger" style={{ margin: 0 }}>{t('rh.solde.exceeded', { jours, dispo: solde.disponible })}</div>
          )}
          <label className="field">{t('rh.absence.motif')}
            <input value={form.motif} onChange={e => set('motif', e.target.value)} placeholder={t('rh.absence.motifPlaceholder')} />
          </label>
          <label className="field">{t('rh.remplacement')}
            <textarea rows={2} value={form.remplacement} onChange={e => set('remplacement', e.target.value)} placeholder={t('rh.remplacementPlaceholder')} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('rh.remplacementHint')}</span>
          </label>
          <label className="field">{t('rh.absence.comment')}
            <textarea rows={2} value={form.commentaire} onChange={e => set('commentaire', e.target.value)} />
          </label>
          <label className="field">{t('rh.absence.justificatif')}{selectedType?.justificatif_requis ? ' *' : ''}
            <input type="file" accept=".pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('common.saving') : t('rh.submit')}</button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={e => submit(e, false)}>{t('rh.saveDraft')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/rh/mes-demandes')}>{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
