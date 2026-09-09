import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import { useI18n } from '../../i18n/I18nContext';

export default function CdiForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    employee_id: '', date_passage: '', nouveau_poste: '', nouvelle_remuneration: '', justification: '', commentaire: '',
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { client.get('/rh/employees').then(r => setEmployees(r.data)).catch(() => {}); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const emp = employees.find(e => String(e.id) === String(form.employee_id));

  async function submit(e, andSubmit) {
    e.preventDefault();
    if (!form.employee_id) { setError(t('rh.cdi.employeeRequired')); return; }
    setError(''); setSaving(true);
    try {
      const res = await client.post('/rh/requests/cdi', form);
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
      <h1 className="page-title">{t('rh.cdi.newTitle')}</h1>
      {error && <div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={e => submit(e, true)} className="form-grid" style={{ maxWidth: 'none' }}>
          <label className="field">{t('rh.cdi.employee')}
            <SearchableSelect
              value={form.employee_id}
              onChange={v => set('employee_id', v ?? '')}
              options={employees}
              getLabel={e => `${e.prenom} ${e.nom}${e.matricule ? ` (${e.matricule})` : ''}${e.type_contrat ? ` — ${e.type_contrat}` : ''}`}
              getSearch={e => `${e.prenom} ${e.nom} ${e.matricule || ''}`}
              placeholder={t('rh.cdi.employeeSearch')}
            />
          </label>
          {emp && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -6 }}>
              {t('rh.cdi.current')}: {emp.type_contrat || '—'} · {emp.entity_code}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 200px' }}>{t('rh.cdi.datePassage')}
              <input type="date" value={form.date_passage} onChange={e => set('date_passage', e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>{t('rh.cdi.nouvelleRemuneration')}
              <input value={form.nouvelle_remuneration} onChange={e => set('nouvelle_remuneration', e.target.value)} placeholder={t('rh.cdi.remunerationPlaceholder')} />
            </label>
          </div>
          <label className="field">{t('rh.cdi.nouveauPoste')}
            <input value={form.nouveau_poste} onChange={e => set('nouveau_poste', e.target.value)} placeholder={t('rh.cdi.nouveauPostePlaceholder')} />
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
