import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';
import { useI18n } from '../../i18n/I18nContext';

const CONTRATS = ['CDI', 'CDD', 'Stage', 'Consultant', 'Journalier'];

export default function RecrutementForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [bus, setBus] = useState([]);
  const [form, setForm] = useState({
    type_id: '', poste: '', departement: '', business_unit_id: '', type_contrat: '',
    nombre_postes: '1', date_prise_poste: '', profil: '', remuneration: '', motif: '', justification: '', commentaire: '',
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.get('/rh/types?domaine=recrutement').then(r => setTypes(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e, andSubmit) {
    e.preventDefault();
    if (!form.poste.trim()) { setError(t('rh.recrutement.posteRequired')); return; }
    setError(''); setSaving(true);
    try {
      const res = await client.post('/rh/requests/recrutement', form);
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
      <h1 className="page-title">{t('rh.recrutement.newTitle')}</h1>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}
      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={e => submit(e, true)} className="form-grid" style={{ maxWidth: 'none' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 220px' }}>{t('rh.recrutement.type')}
              <select value={form.type_id} onChange={e => set('type_id', e.target.value)} required>
                <option value="" disabled>{t('rh.absence.typeDots')}</option>
                {types.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '2 1 300px' }}>{t('rh.recrutement.poste')}
              <input value={form.poste} onChange={e => set('poste', e.target.value)} required placeholder={t('rh.recrutement.postePlaceholder')} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 200px' }}>{t('rh.recrutement.departement')}
              <input value={form.departement} onChange={e => set('departement', e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>{t('stockreleve.bu')}
              <select value={form.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                <option value="">—</option>
                {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 160px' }}>{t('rh.recrutement.contrat')}
              <select value={form.type_contrat} onChange={e => set('type_contrat', e.target.value)}>
                <option value="">—</option>
                {CONTRATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 120px' }}>{t('rh.recrutement.nombre')}
              <input type="number" min="1" value={form.nombre_postes} onChange={e => set('nombre_postes', e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 180px' }}>{t('rh.recrutement.datePrise')}
              <input type="date" value={form.date_prise_poste} onChange={e => set('date_prise_poste', e.target.value)} />
            </label>
          </div>
          <label className="field">{t('rh.recrutement.motif')}
            <input value={form.motif} onChange={e => set('motif', e.target.value)} placeholder={t('rh.recrutement.motifPlaceholder')} />
          </label>
          <label className="field">{t('rh.recrutement.profil')}
            <textarea rows={2} value={form.profil} onChange={e => set('profil', e.target.value)} placeholder={t('rh.recrutement.profilPlaceholder')} />
          </label>
          <label className="field">{t('rh.recrutement.remuneration')}
            <input value={form.remuneration} onChange={e => set('remuneration', e.target.value)} placeholder={t('rh.recrutement.remunerationPlaceholder')} />
          </label>
          <label className="field">{t('rh.recrutement.justification')}
            <textarea rows={2} value={form.justification} onChange={e => set('justification', e.target.value)} />
          </label>
          <label className="field">{t('rh.recrutement.piece')}
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
