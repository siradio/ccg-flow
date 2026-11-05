import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal';

// Formulaire de saisie/édition d'une autorisation de dépense (partagé par la liste — création — et
// la fiche — édition d'un brouillon). Montant total = somme des lignes ; reste à payer = total − avance.
const money = n => (n == null || n === '' ? '0' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const DEVISES = ['GNF', 'USD', 'EUR', 'XOF'];

let _k = 0;
const emptyLine = () => ({ key: ++_k, designation: '', quantite: '1', prixUnitaire: '' });

function initialForm(existing, user) {
  if (existing) {
    return {
      entityId: existing.entity_id, businessUnitId: existing.business_unit_id || '', service: existing.service || '',
      expenseTypeId: existing.expense_type_id || '', objet: existing.objet || '', demandeurNom: existing.demandeur_nom || '',
      devise: existing.devise || 'GNF', avance: existing.avance ?? '',
      lignes: (existing.lignes && existing.lignes.length)
        ? existing.lignes.map(l => ({ key: ++_k, designation: l.designation, quantite: String(l.quantite), prixUnitaire: String(l.prix_unitaire) }))
        : [emptyLine()],
    };
  }
  return {
    entityId: '', businessUnitId: '', service: 'Logistique', expenseTypeId: '', objet: '',
    demandeurNom: user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '', devise: 'GNF', avance: '', lignes: [emptyLine()],
  };
}

export default function DepenseFormModal({ user, existing, onClose, onSaved }) {
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(() => initialForm(existing, user));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = !!existing;

  useEffect(() => {
    client.get('/entities').then(r => setEntities(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBusinessUnits(r.data)).catch(() => {});
    client.get('/logistique/depenses/expense-types?actifs=true').then(r => setTypes(r.data)).catch(() => {});
  }, []);

  const selectedEntity = entities.find(e => String(e.id) === String(form.entityId));
  const isSoguipal = selectedEntity?.code === 'SOGUIPAL';
  const total = useMemo(() => form.lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0), [form.lignes]);
  const reste = Math.max(0, total - (Number(form.avance) || 0));

  const setLine = (key, patch) => setForm(f => ({ ...f, lignes: f.lignes.map(l => (l.key === key ? { ...l, ...patch } : l)) }));
  const addLine = () => setForm(f => ({ ...f, lignes: [...f.lignes, emptyLine()] }));
  const removeLine = (key) => setForm(f => ({ ...f, lignes: f.lignes.length > 1 ? f.lignes.filter(l => l.key !== key) : f.lignes }));

  // `submitAfter` : enregistre PUIS soumet dans le circuit, en un seul geste (évite le détour
  // « enregistrer le brouillon d'abord, soumettre ensuite »).
  async function save(e, submitAfter = false) {
    e.preventDefault();
    if (saving) return;
    if (!form.entityId) { setError('Choisissez une entité.'); return; }
    if (!form.objet.trim()) { setError("L'objet est obligatoire."); return; }
    const lignes = form.lignes.filter(l => l.designation.trim()).map(l => ({ designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire }));
    if (!lignes.length) { setError('Ajoutez au moins une ligne de dépense.'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        entityId: Number(form.entityId),
        businessUnitId: isSoguipal && form.businessUnitId ? Number(form.businessUnitId) : null,
        service: form.service, expenseTypeId: form.expenseTypeId ? Number(form.expenseTypeId) : null,
        objet: form.objet, demandeurNom: form.demandeurNom, devise: form.devise, avance: Number(form.avance) || 0, lignes,
      };
      let r = editing
        ? await client.put(`/logistique/depenses/${existing.id}`, body)
        : await client.post('/logistique/depenses', body);
      if (submitAfter) r = await client.post(`/logistique/depenses/${r.data.id}/submit`);
      onSaved(r.data);
    } catch (err) { setError(err.response?.data?.error || 'Erreur serveur.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={editing ? `Modifier ${existing.numero || 'le brouillon'}` : 'Nouvelle autorisation de dépense'} onClose={onClose} wide>
      <form onSubmit={save}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 200 }}>Entité *
            <select value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: e.target.value, businessUnitId: '' }))} required disabled={editing}>
              <option value="" disabled>Choisir…</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.code || e.nom}</option>)}
            </select>
          </label>
          {isSoguipal && (
            <label className="field" style={{ minWidth: 180 }}>Business Unit
              <select value={form.businessUnitId} onChange={e => setForm(f => ({ ...f, businessUnitId: e.target.value }))}>
                <option value="">—</option>
                {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
          )}
          <label className="field" style={{ minWidth: 160 }}>Service<input value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))} placeholder="Ex. Logistique" /></label>
          <label className="field" style={{ minWidth: 190 }}>Type de dépense
            <select value={form.expenseTypeId} onChange={e => setForm(f => ({ ...f, expenseTypeId: e.target.value }))}>
              <option value="">—</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 180 }}>Demandeur<input value={form.demandeurNom} onChange={e => setForm(f => ({ ...f, demandeurNom: e.target.value }))} /></label>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>Objet *<input value={form.objet} onChange={e => setForm(f => ({ ...f, objet: e.target.value }))} placeholder="Motif de la dépense" required /></label>
        </div>

        <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Détail des dépenses</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Désignation</th><th style={{ width: 90 }} className="num">Quantité</th><th style={{ width: 130 }} className="num">Prix unitaire</th><th style={{ width: 130 }} className="num">Montant</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {form.lignes.map(l => (
                <tr key={l.key}>
                  <td><input value={l.designation} onChange={e => setLine(l.key, { designation: e.target.value })} placeholder="Désignation" style={{ width: '100%' }} /></td>
                  <td><input type="number" min="0" step="0.001" value={l.quantite} onChange={e => setLine(l.key, { quantite: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input type="number" min="0" step="0.01" value={l.prixUnitaire} onChange={e => setLine(l.key, { prixUnitaire: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money((Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0))}</td>
                  <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => removeLine(l.key)} title="Retirer">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 6 }}>+ Ajouter une ligne</button>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, justifyContent: 'flex-end' }}>
          <label className="field" style={{ width: 120 }}>Devise
            <select value={form.devise} onChange={e => setForm(f => ({ ...f, devise: e.target.value }))}>{DEVISES.map(d => <option key={d} value={d}>{d}</option>)}</select>
          </label>
          <label className="field" style={{ width: 150 }}>Avance<input type="number" min="0" step="0.01" value={form.avance} onChange={e => setForm(f => ({ ...f, avance: e.target.value }))} style={{ textAlign: 'right' }} /></label>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div>Montant total : <strong>{money(total)} {form.devise}</strong></div>
            <div style={{ marginTop: 2 }}>Reste à payer : <strong style={{ color: 'var(--status-blue-fg)' }}>{money(reste)} {form.devise}</strong></div>
          </div>
        </div>

        {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-secondary" disabled={saving}>{saving ? 'Enregistrement…' : (editing ? 'Enregistrer (brouillon)' : 'Enregistrer en brouillon')}</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={(e) => save(e, true)}>{editing ? 'Enregistrer et soumettre' : 'Créer et soumettre'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
