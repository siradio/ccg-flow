import { useEffect, useState } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import { useI18n } from '../../i18n/I18nContext';

const DATE = (v) => (v ? String(v).slice(0, 10) : '');
const STATUTS = [['planifiee', 'Planifiée'], ['en_cours', 'En cours'], ['terminee', 'Terminée'], ['annulee', 'Annulée']];

// Formulaire création/édition d'une maintenance. `fixedEquipment` = {id, nom} pré-sélectionné
// (depuis la fiche d'un équipement) ; sinon on charge la liste des équipements.
export default function MaintenanceForm({ initial, fixedEquipment, onClose, onSubmit }) {
  const { t } = useI18n();
  const isEdit = !!initial?.id;
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [f, setF] = useState({
    equipment_id: initial?.equipment_id || fixedEquipment?.id || '',
    type_id: initial?.type_id || '', statut: initial?.statut || 'planifiee',
    technician_id: initial?.technician_id || '', prestataire: initial?.prestataire || '',
    date_debut: DATE(initial?.date_debut), date_fin: DATE(initial?.date_fin), next_date: DATE(initial?.next_date),
    cout: initial?.cout || '', probleme: initial?.probleme || '', diagnostic: initial?.diagnostic || '',
    intervention: initial?.intervention || '', pieces_remplacees: initial?.pieces_remplacees || '',
    resultat: initial?.resultat || '', commentaire: initial?.commentaire || '',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    client.get('/dsi/referentials/maintenance-types').then(r => setTypes(r.data.map(x => ({ id: x.id, nom: x.libelle })))).catch(() => {});
    client.get('/dsi/maintenance/users').then(r => setUsers(r.data)).catch(() => {});
    if (!fixedEquipment) client.get('/dsi/equipment', { params: { pageSize: 100 } }).then(r => setEquipments((r.data.items || []).map(e => ({ id: e.id, nom: `${e.numero_inventaire} — ${e.designation}` })))).catch(() => {});
  }, [fixedEquipment]);

  async function submit(e) {
    e.preventDefault(); if (busy) return;
    if (!f.equipment_id) { setErr('Équipement requis.'); return; }
    setBusy(true); setErr('');
    try { await onSubmit(f); } catch (e2) { setErr(e2.response?.data?.error || 'Erreur.'); setBusy(false); }
  }
  const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>);

  return (
    <Modal title={isEdit ? t('dsi.maint.edit') : t('dsi.maint.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          {fixedEquipment ? <Field label={t('dsi.maint.equipment')}><input value={fixedEquipment.nom} disabled /></Field>
            : <Field label={t('dsi.maint.equipment') + ' *'}><SearchableSelect value={f.equipment_id} onChange={v => set('equipment_id', v ?? '')} options={equipments} getLabel={o => o.nom} placeholder="Équipement…" /></Field>}
          <Field label={t('dsi.maint.type')}><SearchableSelect value={f.type_id} onChange={v => set('type_id', v ?? '')} options={types} getLabel={o => o.nom} placeholder="Type…" /></Field>
          <Field label={t('dsi.maint.statut')}><select value={f.statut} onChange={e => set('statut', e.target.value)}>{STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label={t('dsi.maint.technician')}><SearchableSelect value={f.technician_id} onChange={v => set('technician_id', v ?? '')} options={users} getLabel={o => o.nom} placeholder="Technicien…" /></Field>
          <Field label={t('dsi.maint.prestataire')}><input value={f.prestataire} onChange={e => set('prestataire', e.target.value)} /></Field>
          <Field label={t('dsi.maint.dateDebut')}><input type="date" value={f.date_debut} onChange={e => set('date_debut', e.target.value)} /></Field>
          <Field label={t('dsi.maint.dateFin')}><input type="date" value={f.date_fin} onChange={e => set('date_fin', e.target.value)} /></Field>
          <Field label={t('dsi.maint.cout')}><input type="number" step="0.01" value={f.cout} onChange={e => set('cout', e.target.value)} /></Field>
          <Field label={t('dsi.maint.nextDate')}><input type="date" value={f.next_date} onChange={e => set('next_date', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, marginTop: 12 }}>
          <Field label={t('dsi.maint.probleme')}><textarea rows={2} value={f.probleme} onChange={e => set('probleme', e.target.value)} /></Field>
          <Field label={t('dsi.maint.diagnostic')}><textarea rows={2} value={f.diagnostic} onChange={e => set('diagnostic', e.target.value)} /></Field>
          <Field label={t('dsi.maint.intervention')}><textarea rows={2} value={f.intervention} onChange={e => set('intervention', e.target.value)} /></Field>
          <Field label={t('dsi.maint.pieces')}><input value={f.pieces_remplacees} onChange={e => set('pieces_remplacees', e.target.value)} /></Field>
          <Field label={t('dsi.maint.resultat')}><input value={f.resultat} onChange={e => set('resultat', e.target.value)} /></Field>
        </div>
        {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : (isEdit ? t('common.save') : t('common.add'))}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}
