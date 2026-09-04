import { useState, useEffect } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import { FieldInput, emptyForm } from './ReferentialPage.jsx';
import { SUPPLIER_FIELDS } from './ReferentialsIndex.jsx';
import { normalizeForm } from '../../utils/casing.js';
import { useI18n } from '../../i18n/I18nContext';

// Modale d'ajout rapide d'un fournisseur (mêmes champs que le référentiel), réutilisable depuis
// n'importe quelle page (liste des demandes d'achat, etc.). `defaultEntityId` pré-coche une entité ;
// sinon toutes les entités sont pré-cochées (defaultAll de SUPPLIER_FIELDS) dès qu'elles sont chargées.
export default function SupplierFormModal({ onClose, onCreated, defaultEntityId = null }) {
  const { t } = useI18n();
  const [entities, setEntities] = useState([]);
  const [form, setForm] = useState(() => {
    const base = emptyForm(SUPPLIER_FIELDS, []);
    return defaultEntityId ? { ...base, entity_ids: [defaultEntityId] } : base;
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { client.get('/entities').then(res => setEntities(res.data)).catch(() => {}); }, []);

  // emptyForm ne peut pas pré-cocher « toutes les entités » tant qu'elles ne sont pas chargées :
  // on complète une fois la liste arrivée (sauf si une entité par défaut a été imposée).
  useEffect(() => {
    if (!defaultEntityId && entities.length) {
      setForm(f => (Array.isArray(f.entity_ids) && f.entity_ids.length === 0
        ? { ...f, entity_ids: entities.map(e => e.id) } : f));
    }
  }, [entities, defaultEntityId]);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.nom?.trim()) { setError(t('refx.nomRequired')); return; }
    setError('');
    setSaving(true);
    try {
      const payload = normalizeForm(SUPPLIER_FIELDS, form);
      const res = await client.post('/suppliers', payload);
      onCreated?.(res.data);
    } catch (err) {
      setError(err.response?.data?.error || t('prd.addSupplierError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('refx.addSupplierTitle')} onClose={onClose} wide>
      <form onSubmit={submit} className="form-inline" style={{ maxWidth: 'none' }}>
        {SUPPLIER_FIELDS.map(f => {
          const input = <FieldInput field={f} value={form[f.key]}
            onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} entities={entities} />;
          if (f.type === 'checkbox') return <span key={f.key} style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>{input}</span>;
          return (
            <label key={f.key} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {t(f.labelKey)}{f.required ? ' *' : ''}
              {input}
            </label>
          );
        })}
        {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
        <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.add')}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}
