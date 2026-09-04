import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';
import { useI18n } from '../../i18n/I18nContext';

const today = () => new Date().toISOString().slice(0, 10);

export default function AbsenceForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({ type_id: '', date_debut: today(), date_fin: today(), motif: '', commentaire: '' });
  const [jours, setJours] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { client.get('/rh/types?domaine=absence').then(r => setTypes(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!form.date_debut || !form.date_fin) { setJours(null); return; }
    client.get(`/rh/working-days?from=${form.date_debut}&to=${form.date_fin}`).then(r => setJours(r.data.jours)).catch(() => setJours(null));
  }, [form.date_debut, form.date_fin]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e, andSubmit) {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const res = await client.post('/rh/requests/absence', form);
      const id = res.data.id;
      if (file) { const fd = new FormData(); fd.append('file', file); await client.post(`/rh/requests/${id}/attachments`, fd); }
      if (andSubmit) await client.post(`/rh/requests/${id}/submit`);
      navigate(`/rh/demandes/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || t('rh.saveError'));
    } finally { setSaving(false); }
  }

  const selectedType = types.find(x => String(x.id) === String(form.type_id));

  return (
    <div>
      <RhSubnav />
      <h1 className="page-title">{t('rh.absence.newTitle')}</h1>
      {error && <div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={e => submit(e, true)} className="form-grid" style={{ maxWidth: 'none' }}>
          <label className="field">{t('rh.absence.type')}
            <select value={form.type_id} onChange={e => set('type_id', e.target.value)} required>
              <option value="" disabled>{t('rh.absence.typeDots')}</option>
              {types.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
            </select>
          </label>
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
          <label className="field">{t('rh.absence.motif')}
            <input value={form.motif} onChange={e => set('motif', e.target.value)} placeholder={t('rh.absence.motifPlaceholder')} />
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
