import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY_FORM = {
  matricule: '', nom: '', prenom: '', poste: '', departement: '',
  entity_id: '', business_unit_id: '', site_id: '', manager: '',
  date_embauche: '', type_contrat: '', statut: 'actif',
  salaire_mensuel: '', telephone: '', email: '',
};

export default function FormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useI18n();

  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    client.get('/sites').then(res => setSites(res.data));
  }, []);

  useEffect(() => {
    if (isNew) return;
    client.get(`/employees/${id}`).then(res => {
      const e = res.data;
      setForm({
        matricule: e.matricule || '', nom: e.nom || '', prenom: e.prenom || '',
        poste: e.poste || '', departement: e.departement || '',
        entity_id: e.entity_id ?? '', business_unit_id: e.business_unit_id ?? '', site_id: e.site_id ?? '',
        manager: e.manager || '', date_embauche: e.date_embauche ? e.date_embauche.slice(0, 10) : '',
        type_contrat: e.type_contrat || '', statut: e.statut || 'actif',
        salaire_mensuel: e.salaire_mensuel ?? '', telephone: e.telephone || '', email: e.email || '',
      });
      setLoaded(true);
    });
  }, [id, isNew]);

  const sitesForEntity = useMemo(
    () => sites.filter(s => !form.entity_id || Number(s.entity_id) === Number(form.entity_id)),
    [sites, form.entity_id]
  );

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      ...form,
      entity_id: form.entity_id ? Number(form.entity_id) : null,
      business_unit_id: form.business_unit_id ? Number(form.business_unit_id) : null,
      site_id: form.site_id ? Number(form.site_id) : null,
      date_embauche: form.date_embauche || null,
      salaire_mensuel: form.salaire_mensuel ? Number(form.salaire_mensuel) : null,
      matricule: form.matricule || null,
      manager: form.manager || null,
      type_contrat: form.type_contrat || null,
      telephone: form.telephone || null,
      email: form.email || null,
    };
    try {
      if (isNew) {
        const res = await client.post('/employees', payload);
        navigate(`/employees/${res.data.id}`);
      } else {
        await client.put(`/employees/${id}`, payload);
        navigate('/employees');
      }
    } catch (err) {
      setError(err.response?.data?.error || t('emp.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!(await confirm(t('emp.confirmDelete'), { danger: true, confirmLabel: t('common.delete') }))) return;
    await client.delete(`/employees/${id}`);
    navigate('/employees');
  }

  if (!loaded) return <p>{t('prd.loading')}</p>;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>{isNew ? t('emp.newEmployeeTitle') : `${form.prenom} ${form.nom}`}</h1>
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={onSubmit} className="form-grid" style={{ maxWidth: 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label className="field">{t('emp.th.matricule')}
              <input value={form.matricule} onChange={e => set('matricule', e.target.value)} />
            </label>
            <label className="field">{t('emp.th.statut')}
              <select value={form.statut} onChange={e => set('statut', e.target.value)}>
                <option value="actif">{t('emp.statut.actif')}</option>
                <option value="inactif">{t('emp.statut.inactif')}</option>
                <option value="sorti">{t('emp.statut.sorti')}</option>
              </select>
            </label>
            <label className="field">{t('login.firstName')}
              <input value={form.prenom} onChange={e => set('prenom', e.target.value)} required />
            </label>
            <label className="field">{t('login.lastName')}
              <input value={form.nom} onChange={e => set('nom', e.target.value)} required />
            </label>
            <label className="field">{t('emp.th.poste')}
              <input value={form.poste} onChange={e => set('poste', e.target.value)} />
            </label>
            <label className="field">{t('emp.th.departement')}
              <input value={form.departement} onChange={e => set('departement', e.target.value)} />
            </label>
            <label className="field">{t('emp.th.entity')}
              <select value={form.entity_id} onChange={e => set('entity_id', e.target.value)} required>
                <option value="" disabled>{t('prc.select')}</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label className="field">{t('stockreleve.bu')}
              <select value={form.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                <option value="">—</option>
                {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <label className="field">{t('emp.th.site')}
              <select value={form.site_id} onChange={e => set('site_id', e.target.value)}>
                <option value="">—</option>
                {sitesForEntity.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </label>
            <label className="field">{t('emp.manager')}
              <input value={form.manager} onChange={e => set('manager', e.target.value)} />
            </label>
            <label className="field">{t('emp.hireDate')}
              <input type="date" value={form.date_embauche} onChange={e => set('date_embauche', e.target.value)} />
            </label>
            <label className="field">{t('emp.contractType')}
              <select value={form.type_contrat} onChange={e => set('type_contrat', e.target.value)}>
                <option value="">—</option>
                <option value="CDI">{t('emp.contract.CDI')}</option>
                <option value="CDD">{t('emp.contract.CDD')}</option>
                <option value="Stage">{t('emp.contract.Stage')}</option>
                <option value="Consultant">{t('emp.contract.Consultant')}</option>
                <option value="Journalier">{t('emp.contract.Journalier')}</option>
              </select>
            </label>
            <label className="field">{t('emp.monthlySalary')}
              <input type="number" value={form.salaire_mensuel} onChange={e => set('salaire_mensuel', e.target.value)} />
            </label>
            <label className="field">{t('login.phone')}
              <input value={form.telephone} onChange={e => set('telephone', e.target.value)} />
            </label>
            <label className="field">{t('login.email')}
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </label>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {!isNew && <button type="button" onClick={onDelete} className="btn btn-danger">{t('common.delete')}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
