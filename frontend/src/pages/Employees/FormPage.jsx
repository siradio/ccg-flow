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
  // RH complémentaires
  date_naissance: '', nationalite: '', numero_cnss: '', situation_familiale: '',
  contact_urgence_nom: '', contact_urgence_tel: '', permis_travail: false, permis_travail_expiration: '',
  manager_employee_id: '',
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
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    client.get('/sites').then(res => setSites(res.data));
    client.get('/employees').then(res => setEmployees(res.data)).catch(() => {});
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
        date_naissance: e.date_naissance ? e.date_naissance.slice(0, 10) : '',
        nationalite: e.nationalite || '', numero_cnss: e.numero_cnss || '', situation_familiale: e.situation_familiale || '',
        contact_urgence_nom: e.contact_urgence_nom || '', contact_urgence_tel: e.contact_urgence_tel || '',
        permis_travail: !!e.permis_travail, permis_travail_expiration: e.permis_travail_expiration ? e.permis_travail_expiration.slice(0, 10) : '',
        manager_employee_id: e.manager_employee_id ?? '',
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
      date_naissance: form.date_naissance || null,
      nationalite: form.nationalite || null,
      numero_cnss: form.numero_cnss || null,
      situation_familiale: form.situation_familiale || null,
      contact_urgence_nom: form.contact_urgence_nom || null,
      contact_urgence_tel: form.contact_urgence_tel || null,
      permis_travail: !!form.permis_travail,
      permis_travail_expiration: (form.permis_travail && form.permis_travail_expiration) ? form.permis_travail_expiration : null,
      manager_employee_id: form.manager_employee_id ? Number(form.manager_employee_id) : null,
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
            <label className="field">{t('emp.managerEmployee')}
              <select value={form.manager_employee_id} onChange={e => set('manager_employee_id', e.target.value)}>
                <option value="">—</option>
                {employees.filter(emp => String(emp.id) !== String(id)).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom}{emp.matricule ? ` (${emp.matricule})` : ''}</option>
                ))}
              </select>
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
            <label className="field">{t('emp.birthDate')}
              <input type="date" value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
            </label>
            <label className="field">{t('emp.nationality')}
              <input value={form.nationalite} onChange={e => set('nationalite', e.target.value)} />
            </label>
            <label className="field">{t('emp.cnss')}
              <input value={form.numero_cnss} onChange={e => set('numero_cnss', e.target.value)} />
            </label>
            <label className="field">{t('emp.maritalStatus')}
              <select value={form.situation_familiale} onChange={e => set('situation_familiale', e.target.value)}>
                <option value="">—</option>
                <option value="Célibataire">{t('emp.marital.single')}</option>
                <option value="Marié(e)">{t('emp.marital.married')}</option>
                <option value="Divorcé(e)">{t('emp.marital.divorced')}</option>
                <option value="Veuf(ve)">{t('emp.marital.widowed')}</option>
              </select>
            </label>
            <label className="field">{t('emp.emergencyName')}
              <input value={form.contact_urgence_nom} onChange={e => set('contact_urgence_nom', e.target.value)} />
            </label>
            <label className="field">{t('emp.emergencyPhone')}
              <input value={form.contact_urgence_tel} onChange={e => set('contact_urgence_tel', e.target.value)} />
            </label>
            <label className="field" style={{ alignSelf: 'end' }}>
              <span><input type="checkbox" checked={form.permis_travail} onChange={e => set('permis_travail', e.target.checked)} /> {t('emp.workPermit')}</span>
            </label>
            {form.permis_travail && (
              <label className="field">{t('emp.workPermitExpiry')}
                <input type="date" value={form.permis_travail_expiration} onChange={e => set('permis_travail_expiration', e.target.value)} />
              </label>
            )}
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" onClick={() => navigate('/employees')} className="btn btn-secondary">{t('common.cancel')}</button>
            {!isNew && <button type="button" onClick={onDelete} className="btn btn-danger">{t('common.delete')}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
