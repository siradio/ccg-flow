import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import { EQUIP_STATUTS, ETATS } from './dsiLabels.jsx';

const DATE = (v) => (v ? String(v).slice(0, 10) : '');

// Formulaire création/édition d'un équipement (modale). `lists` = {categories, types, brands,
// entities, sites, suppliers}. onSubmit(payload) doit renvoyer une promesse.
export default function EquipmentForm({ initial, lists, onClose, onSubmit }) {
  const isEdit = !!initial?.id;
  const [f, setF] = useState({
    numero_inventaire: initial?.numero_inventaire || '',
    category_id: initial?.category_id || '', type_id: initial?.type_id || '',
    designation: initial?.designation || '', brand_id: initial?.brand_id || '',
    modele: initial?.modele || '', num_serie: initial?.num_serie || '',
    entity_id: initial?.entity_id || '', site_id: initial?.site_id || '',
    localisation: initial?.localisation || '', supplier_id: initial?.supplier_id || '',
    date_achat: DATE(initial?.date_achat), prix_achat: initial?.prix_achat || '',
    date_mise_service: DATE(initial?.date_mise_service), fin_garantie: DATE(initial?.fin_garantie),
    etat: initial?.etat || '', statut: initial?.statut || 'en_stock', commentaire: initial?.commentaire || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sites = (lists.sites || []).filter(s => !f.entity_id || String(s.entity_id) === String(f.entity_id));
  const types = (lists.types || []).filter(t => !f.category_id || String(t.category_id) === String(f.category_id));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!f.designation.trim()) { setErr('La désignation est obligatoire.'); return; }
    setBusy(true); setErr('');
    try { await onSubmit(f); } catch (e2) { setErr(e2.response?.data?.error || 'Erreur lors de l’enregistrement.'); setBusy(false); }
  }

  const Field = ({ label, children }) => (
    <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>
  );

  return (
    <Modal title={isEdit ? 'Modifier l’équipement' : 'Nouvel équipement'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field label="N° d'inventaire">
            <input value={f.numero_inventaire} onChange={e => set('numero_inventaire', e.target.value)} placeholder={isEdit ? '' : 'Auto si vide (INV-…)'} />
          </Field>
          <Field label="Désignation *"><input value={f.designation} onChange={e => set('designation', e.target.value)} required /></Field>
          <Field label="Catégorie">
            <SearchableSelect value={f.category_id} onChange={v => { set('category_id', v ?? ''); set('type_id', ''); }} options={lists.categories || []} getLabel={o => o.nom} placeholder="Catégorie…" />
          </Field>
          <Field label="Type">
            <SearchableSelect value={f.type_id} onChange={v => set('type_id', v ?? '')} options={types} getLabel={o => o.nom} placeholder="Type…" />
          </Field>
          <Field label="Marque">
            <SearchableSelect value={f.brand_id} onChange={v => set('brand_id', v ?? '')} options={lists.brands || []} getLabel={o => o.nom} placeholder="Marque…" />
          </Field>
          <Field label="Modèle"><input value={f.modele} onChange={e => set('modele', e.target.value)} /></Field>
          <Field label="N° de série"><input value={f.num_serie} onChange={e => set('num_serie', e.target.value)} /></Field>
          <Field label="Filiale">
            <select value={f.entity_id} onChange={e => { set('entity_id', e.target.value); set('site_id', ''); }}>
              <option value="">—</option>
              {(lists.entities || []).map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}
            </select>
          </Field>
          <Field label="Site">
            <select value={f.site_id} onChange={e => set('site_id', e.target.value)}>
              <option value="">—</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </Field>
          <Field label="Localisation"><input value={f.localisation} onChange={e => set('localisation', e.target.value)} /></Field>
          <Field label="Fournisseur">
            <SearchableSelect value={f.supplier_id} onChange={v => set('supplier_id', v ?? '')} options={lists.suppliers || []} getLabel={o => o.nom} placeholder="Fournisseur…" />
          </Field>
          <Field label="Date d'achat"><input type="date" value={f.date_achat} onChange={e => set('date_achat', e.target.value)} /></Field>
          <Field label="Prix d'achat"><input type="number" step="0.01" value={f.prix_achat} onChange={e => set('prix_achat', e.target.value)} /></Field>
          <Field label="Mise en service"><input type="date" value={f.date_mise_service} onChange={e => set('date_mise_service', e.target.value)} /></Field>
          <Field label="Fin de garantie"><input type="date" value={f.fin_garantie} onChange={e => set('fin_garantie', e.target.value)} /></Field>
          <Field label="État">
            <select value={f.etat} onChange={e => set('etat', e.target.value)}><option value="">—</option>{ETATS.map(x => <option key={x} value={x}>{x}</option>)}</select>
          </Field>
          <Field label="Statut">
            <select value={f.statut} onChange={e => set('statut', e.target.value)}>{EQUIP_STATUTS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
          </Field>
        </div>
        <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>Commentaire
          <textarea rows={2} value={f.commentaire} onChange={e => set('commentaire', e.target.value)} />
        </label>
        {err && <div className="alert alert-danger" style={{ marginTop: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer')}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
