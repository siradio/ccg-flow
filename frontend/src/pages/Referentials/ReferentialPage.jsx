import { useEffect, useState } from 'react';
import client from '../../api/client';

// Page CRUD générique pour un référentiel "simple" (une table, champs plats + éventuels entity_ids).
// Évite de dupliquer 7 fois la même page pour sites/entrepôts/machines/produits/fournisseurs/entités.
// canAdd/canEdit reflètent les niveaux ajout/edition du sous-module (§2.3 SPEC.md) — même
// distinction que sur Prix (Prices/HistoryPage.jsx), désormais généralisée à tous les référentiels.
export default function ReferentialPage({ title, endpoint, fields, entities = [], sites = [], lists = {}, canAdd = false, canEdit = false }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => emptyForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  // Visible dès qu'on peut créer, OU qu'on est en train d'éditer un élément existant (le seul
  // moyen d'entrer en édition est le bouton "Éditer", lui-même gaté par canEdit).
  const showForm = canAdd || editingId !== null;

  function load() {
    client.get(endpoint).then(res => setItems(res.data));
  }
  useEffect(load, [endpoint]);

  function startEdit(item) {
    setEditingId(item.id);
    const next = {};
    for (const f of fields) next[f.key] = item[f.key] ?? (f.type === 'multiEntity' ? [] : '');
    setForm(next);
    // Le formulaire est en bas de page, après le tableau — sans ça, cliquer "Éditer" sur une
    // ligne du haut d'une longue liste (ex. Fournisseurs) ne montre visuellement aucun effet tant
    // qu'on n'a pas fait défiler manuellement jusqu'en bas (même pattern que Prices/HistoryPage.jsx).
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await client.put(`${endpoint}/${editingId}`, form);
      else await client.post(endpoint, form);
      setForm(emptyForm(fields));
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur.');
    }
  }

  async function onDelete(id) {
    if (!window.confirm('Supprimer cet élément ?')) return;
    await client.delete(`${endpoint}/${id}`);
    load();
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>{title}</h1>

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {fields.map(f => <th key={f.key}>{f.label}</th>)}
                {canEdit && <th className="sticky-col" />}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  {fields.map(f => <td key={f.key}>{renderValue(f, item, entities, sites, lists)}</td>)}
                  {canEdit && (
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => startEdit(item)} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}>Éditer</button>
                      <button onClick={() => onDelete(item.id)} className="btn btn-danger btn-sm">Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && <tr><td className="empty-row" colSpan={fields.length + 1}>Aucun élément.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="card form-inline" style={{ maxWidth: 'none' }}>
          <strong style={{ width: '100%', fontSize: 15 }}>{editingId ? 'Modifier' : 'Ajouter'}</strong>
          {fields.map(f => (
            <FieldInput key={f.key} field={f} value={form[f.key]} onChange={v => setForm({ ...form, [f.key]: v })} entities={entities} sites={sites} lists={lists} />
          ))}
          {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
          <button type="submit" className="btn btn-primary">{editingId ? 'Enregistrer' : 'Ajouter'}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm(fields)); }} className="btn btn-secondary">Annuler</button>}
        </form>
      )}
    </div>
  );
}

export function emptyForm(fields) {
  const f = {};
  for (const field of fields) f[field.key] = field.type === 'multiEntity' ? [] : field.type === 'checkbox' ? !!field.default : '';
  return f;
}

function renderValue(field, item, entities, sites, lists = {}) {
  const value = item[field.key];
  if (field.type === 'entitySelect') return entities.find(e => e.id === value)?.nom || value;
  if (field.type === 'siteSelect') return sites.find(s => s.id === value)?.nom || value;
  if (field.type === 'fkSelect') return (lists[field.listKey] || []).find(o => o.id === value)?.nom || (value ? value : '—');
  if (field.type === 'multiEntity') return (item.entity_ids || []).map(id => entities.find(e => e.id === id)?.code).filter(Boolean).join(', ');
  if (field.type === 'checkbox') return value ? 'Oui' : 'Non';
  return value;
}

export function FieldInput({ field, value, onChange, entities, sites, lists = {} }) {
  if (field.type === 'entitySelect') {
    return (
      <select required={field.required} value={value || ''} onChange={e => onChange(Number(e.target.value))}>
        <option value="" disabled>{field.label}…</option>
        {entities.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
      </select>
    );
  }
  if (field.type === 'siteSelect') {
    return (
      <select required={field.required} value={value || ''} onChange={e => onChange(Number(e.target.value))}>
        <option value="" disabled>{field.label}…</option>
        {sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
      </select>
    );
  }
  if (field.type === 'fkSelect') {
    return (
      <select required={field.required} value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{field.required ? `${field.label}…` : '—'}</option>
        {(lists[field.listKey] || []).map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
      </select>
    );
  }
  if (field.type === 'multiEntity') {
    return (
      <span>
        {entities.map(e => (
          <label key={e.id} style={{ marginRight: 10, fontSize: 13 }}>
            <input type="checkbox" checked={(value || []).includes(e.id)}
              onChange={ev => onChange(ev.target.checked ? [...(value || []), e.id] : (value || []).filter(id => id !== e.id))} />
            {' '}{e.code}
          </label>
        ))}
      </span>
    );
  }
  if (field.type === 'select') {
    return (
      <select required={field.required} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="" disabled>{field.label}…</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'checkbox') {
    return <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {field.label}</label>;
  }
  if (field.type === 'textarea') {
    return (
      <textarea placeholder={field.label} required={field.required} rows={2} style={{ minWidth: 220 }}
        value={value || ''} onChange={e => onChange(e.target.value)} />
    );
  }
  return (
    <input placeholder={field.label} required={field.required} type={field.type || 'text'} value={value || ''}
      onChange={e => onChange(e.target.value)} />
  );
}
