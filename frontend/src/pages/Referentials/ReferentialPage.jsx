import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';

// Page CRUD générique pour un référentiel "simple" (une table, champs plats + éventuels entity_ids).
// Évite de dupliquer 7 fois la même page pour sites/entrepôts/machines/produits/fournisseurs/entités.
// canAdd/canEdit reflètent les niveaux ajout/edition du sous-module (§2.3 SPEC.md) — même
// distinction que sur Prix (Prices/HistoryPage.jsx), désormais généralisée à tous les référentiels.
export default function ReferentialPage({ title, endpoint, fields, filters = [], entities = [], sites = [], lists = {}, canAdd = false, canEdit = false, duplicable = false }) {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => emptyForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState({});

  // Filtres = sous-ensemble des champs déclaré par référentiel (voir CONFIGS.filters). On récupère
  // la définition complète du champ pour connaître sa source d'options (entités, sites, liste FK,
  // options d'un select, ou valeurs distinctes des items pour un champ texte libre).
  const filterDefs = filters.map(key => fields.find(f => f.key === key)).filter(Boolean);

  // Visible dès qu'on peut créer, OU qu'on est en train d'éditer un élément existant (le seul
  // moyen d'entrer en édition est le bouton "Éditer", lui-même gaté par canEdit).
  const showForm = canAdd || editingId !== null;

  function load() {
    client.get(endpoint).then(res => setItems(res.data));
  }
  useEffect(load, [endpoint]);

  // Construit les valeurs du formulaire à partir d'un enregistrement existant (édition ou duplication).
  function formFromItem(item) {
    const next = {};
    for (const f of fields) {
      if (f.type === 'multiEntity') next[f.key] = item[f.key] ?? [];
      // Une DATE revient en ISO ("2020-01-15T00:00:00.000Z") ; on la ramène à YYYY-MM-DD, format
      // attendu par <input type="date"> et par la colonne PG (évite tout décalage de fuseau).
      else if (f.type === 'date') next[f.key] = item[f.key] ? String(item[f.key]).slice(0, 10) : '';
      else next[f.key] = item[f.key] ?? '';
    }
    return next;
  }

  // Le formulaire est en bas de page, après le tableau — sans ce défilement, cliquer "Éditer"/
  // "Dupliquer" sur une ligne du haut ne montre visuellement aucun effet (même pattern que Prices).
  function scrollToForm() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }

  function startEdit(item) {
    setEditingId(item.id);
    setForm(formFromItem(item));
    scrollToForm();
  }

  // Duplication : pré-remplit le formulaire avec une fiche existante SANS editingId → le submit crée
  // un nouvel enregistrement. Utile pour les missions récurrentes (on reprend tout, on change la date).
  function startDuplicate(item) {
    setEditingId(null);
    setForm(formFromItem(item));
    scrollToForm();
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
    if (!(await confirm('Supprimer cet élément ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    await client.delete(`${endpoint}/${id}`);
    load();
  }

  // Filtrage entièrement côté client (les référentiels sont chargés en entier) : recherche texte
  // sur tous les champs textuels + chaque filtre déroulant actif. `hasActiveFilter` sert à n'afficher
  // le bouton "Réinitialiser" que quand il y a quelque chose à réinitialiser.
  const hasActiveFilter = search.trim() !== '' || Object.values(filterValues).some(v => v !== '' && v != null);
  const visibleItems = items.filter(item =>
    matchesSearch(item, fields, search) &&
    filterDefs.every(f => matchesFilter(f, item, filterValues[f.key]))
  );

  function resetFilters() {
    setSearch('');
    setFilterValues({});
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>{title}</h1>

      {items.length > 0 && (
        <div className="form-inline" style={{ marginBottom: 16 }}>
          <input
            type="search"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 200 }}
          />
          {filterDefs.map(f => (
            <select
              key={f.key}
              value={filterValues[f.key] ?? ''}
              onChange={e => setFilterValues(fv => ({ ...fv, [f.key]: e.target.value }))}
            >
              <option value="">{f.label} : tous</option>
              {filterOptions(f, items, entities, sites, lists).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
          {hasActiveFilter && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>Réinitialiser</button>
          )}
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {visibleItems.length} / {items.length}
          </span>
        </div>
      )}

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {fields.map(f => <th key={f.key}>{f.label}</th>)}
                {(canEdit || (canAdd && duplicable)) && <th className="sticky-col" />}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => (
                <tr key={item.id}>
                  {fields.map(f => <td key={f.key}>{renderValue(f, item, entities, sites, lists, endpoint)}</td>)}
                  {(canEdit || (canAdd && duplicable)) && (
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      {canAdd && duplicable && <button onClick={() => startDuplicate(item)} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}>Dupliquer</button>}
                      {canEdit && <button onClick={() => startEdit(item)} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}>Éditer</button>}
                      {canEdit && <button onClick={() => onDelete(item.id)} className="btn btn-danger btn-sm">Supprimer</button>}
                    </td>
                  )}
                </tr>
              ))}
              {visibleItems.length === 0 && (
                <tr><td className="empty-row" colSpan={fields.length + 1}>
                  {items.length === 0 ? 'Aucun élément.' : 'Aucun élément ne correspond aux filtres.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="card form-inline" style={{ maxWidth: 'none' }}>
          <strong style={{ width: '100%', fontSize: 15 }}>{editingId ? 'Modifier' : 'Ajouter'}</strong>
          {fields.filter(f => fieldVisible(f, form)).map(f => {
            if (f.type === 'photo') {
              return <PhotoField key={f.key} endpoint={endpoint} editingId={editingId}
                hasPhoto={!!items.find(i => i.id === editingId)?.has_photo} onChanged={load} />;
            }
            const input = <FieldInput field={f} value={form[f.key]}
              onChange={v => setForm(prev => applyFieldChange(prev, f, v, lists))}
              entities={entities} sites={sites} lists={lists} />;
            // La case à cocher porte déjà son propre libellé à côté d'elle.
            if (f.type === 'checkbox') return <span key={f.key} style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>{input}</span>;
            // Un libellé au-dessus de chaque champ : sans ça, les placeholders (tronqués sur les
            // menus, absents sur un select facultatif « — ») ne disent pas ce que le champ attend.
            return (
              <label key={f.key} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {f.label}{f.required ? ' *' : ''}
                {input}
              </label>
            );
          })}
          {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
          <button type="submit" className="btn btn-primary">{editingId ? 'Enregistrer' : 'Ajouter'}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm(fields)); }} className="btn btn-secondary">Annuler</button>}
        </form>
      )}
    </div>
  );
}

// Affichage conditionnel d'un champ du formulaire : `showIf { field, equals }` ou `{ field, in:[…] }`
// n'affiche le champ que si la valeur d'un autre champ correspond (ex. « Société » seulement pour un
// conducteur de type Prestataire). Sans showIf, toujours visible.
function fieldVisible(field, form) {
  const c = field.showIf;
  if (!c) return true;
  const v = form[c.field];
  if (Array.isArray(c.in)) return c.in.includes(v);
  return v === c.equals;
}

// Applique un changement de champ, avec auto-remplissage optionnel : un champ `fkSelect` porteur
// d'un `autofill { champCible: propOption }` recopie, à la sélection, des propriétés de l'option
// choisie vers d'autres champs (ex. choisir un employé pré-remplit nom/prénom/téléphone du
// conducteur). Les valeurs restent modifiables ; désélectionner ne réécrase pas la saisie manuelle.
function applyFieldChange(prev, field, value, lists = {}) {
  const next = { ...prev, [field.key]: value };
  if (field.autofill && value !== '' && value != null) {
    const opt = (lists[field.listKey] || []).find(o => String(o.id) === String(value));
    if (opt) for (const [target, src] of Object.entries(field.autofill)) next[target] = opt[src] ?? '';
  }
  return next;
}

export function emptyForm(fields) {
  const f = {};
  for (const field of fields) {
    f[field.key] = field.type === 'multiEntity' ? []
      : field.type === 'checkbox' ? !!field.default
      : (field.default ?? ''); // honore une valeur par défaut (ex. statut = 'actif' sur un select)
  }
  return f;
}

// Recherche texte : vrai si la requête (insensible à la casse) est incluse dans n'importe quel
// champ dont la valeur est une chaîne (code, nom, désignation, ville…). Les champs numériques,
// cases à cocher et listes d'entités sont ignorés par la recherche libre (ils ont leurs filtres).
function matchesSearch(item, fields, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => {
    const v = item[f.key];
    return typeof v === 'string' && v.toLowerCase().includes(q);
  });
}

// Un filtre déroulant actif : l'item doit correspondre à la valeur sélectionnée. Les FK (entité,
// site, liste) comparent en numérique ; multiEntity teste l'appartenance à entity_ids ; le reste
// compare en chaîne.
function matchesFilter(field, item, selected) {
  if (selected === '' || selected == null) return true;
  if (field.type === 'multiEntity') return (item.entity_ids || []).includes(Number(selected));
  const value = item[field.key];
  if (field.type === 'entitySelect' || field.type === 'siteSelect' || field.type === 'fkSelect') {
    return Number(value) === Number(selected);
  }
  if (field.type === 'checkbox') return String(!!value) === String(selected);
  return String(value) === String(selected);
}

// Options d'un filtre selon le type du champ : entités/sites/liste FK depuis les données de
// référence chargées, options figées pour un select, sinon les valeurs distinctes présentes dans
// les items (utile pour un champ texte libre comme la catégorie d'une machine ou le pays d'un
// fournisseur).
function filterOptions(field, items, entities, sites, lists = {}) {
  if (field.type === 'entitySelect' || field.type === 'multiEntity') {
    return entities.map(e => ({ value: e.id, label: e.code || e.nom }));
  }
  if (field.type === 'siteSelect') return sites.map(s => ({ value: s.id, label: s.nom }));
  if (field.type === 'fkSelect') return (lists[field.listKey] || []).map(o => ({ value: o.id, label: o.nom }));
  if (field.type === 'select') return field.options.map(o => ({ value: o, label: o }));
  if (field.type === 'checkbox') return [{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }];
  const seen = [...new Set(items.map(i => i[field.key]).filter(v => v !== null && v !== undefined && v !== ''))];
  return seen.sort((a, b) => String(a).localeCompare(String(b))).map(v => ({ value: v, label: String(v) }));
}

function renderValue(field, item, entities, sites, lists = {}, endpoint = '') {
  const value = item[field.key];
  if (field.type === 'entitySelect') return entities.find(e => e.id === value)?.nom || value;
  if (field.type === 'siteSelect') return sites.find(s => s.id === value)?.nom || value;
  if (field.type === 'fkSelect') return (lists[field.listKey] || []).find(o => o.id === value)?.nom || (value ? value : '—');
  if (field.type === 'multiEntity') return (item.entity_ids || []).map(id => entities.find(e => e.id === id)?.code).filter(Boolean).join(', ');
  if (field.type === 'checkbox') return value ? 'Oui' : 'Non';
  // Affichage localisé JJ/MM/AAAA depuis la portion date (sans reparser en Date → pas de décalage TZ).
  if (field.type === 'date') return value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
  if (field.type === 'photo') {
    return item.has_photo
      ? <AuthImage src={`${endpoint}/${item.id}/photo`} alt="Photo" style={{ height: 34, borderRadius: 4, border: '1px solid var(--color-border)', display: 'block' }} />
      : <span style={{ color: 'var(--color-text-faint)' }}>—</span>;
  }
  return value;
}

// Affiche une image protégée par authentification : <img src="/api/…"> ne porterait pas le token,
// donc on récupère les octets en blob puis on crée une URL d'objet (révoquée au démontage).
// `refreshKey` force un rechargement après remplacement/suppression.
function AuthImage({ src, alt, style, refreshKey }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objUrl;
    let cancelled = false;
    client.get(src, { responseType: 'blob' })
      .then(res => { if (!cancelled) { objUrl = URL.createObjectURL(res.data); setUrl(objUrl); } })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [src, refreshKey]);
  if (!url) return null;
  return <img src={url} alt={alt || ''} style={style} />;
}

// Contrôle photo (référentiel machines) : upload / remplacement / suppression via l'endpoint dédié
// multipart. L'upload cible /:id/photo, donc n'est possible qu'en édition d'une machine existante.
function PhotoField({ endpoint, editingId, hasPhoto, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(0);

  if (!editingId) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: '100%' }}>
        Photo : enregistrez d'abord la fiche, puis rouvrez « Éditer » pour en ajouter une.
      </span>
    );
  }

  async function upload(file) {
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await client.put(`${endpoint}/${editingId}/photo`, fd);
      setKey(k => k + 1);
      if (onChanged) onChanged();
    } catch (e) { setErr(e.response?.data?.error || 'Échec du téléversement.'); }
    finally { setBusy(false); }
  }

  async function remove() {
    setErr(''); setBusy(true);
    try {
      await client.delete(`${endpoint}/${editingId}/photo`);
      setKey(k => k + 1);
      if (onChanged) onChanged();
    } catch (e) { setErr(e.response?.data?.error || 'Échec de la suppression.'); }
    finally { setBusy(false); }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {hasPhoto && (
        <AuthImage src={`${endpoint}/${editingId}/photo`} refreshKey={key} alt="Photo machine"
          style={{ height: 48, borderRadius: 6, border: '1px solid var(--color-border)' }} />
      )}
      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
        {busy ? '…' : (hasPhoto ? 'Remplacer la photo' : 'Ajouter une photo')}
        <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
          onChange={e => upload(e.target.files?.[0])} />
      </label>
      {hasPhoto && <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Retirer</button>}
      {err && <span style={{ color: 'var(--color-danger, #dc2626)', fontSize: 12 }}>{err}</span>}
    </span>
  );
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
