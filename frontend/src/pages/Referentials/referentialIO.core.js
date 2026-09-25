import { normalizeFieldValue } from '../../utils/casing.js';

// Logique PURE (sans React ni DOM) de l'import/export des référentiels : résolution des libellés
// ↔ identifiants, parsing des cellules, mapping des en-têtes. Isolée ici pour être testable.

export const fieldLabel = (f, t) => (f.labelKey ? t(f.labelKey) : f.label);
export const optLabel = (f, o) => (f.optionLabels && f.optionLabels[o] != null ? f.optionLabels[o] : o);
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Champs manipulables en Excel (on exclut les photos). L'import ignore en plus les champs en
// lecture seule (ex. code fournisseur auto-généré par le backend).
export const exportableFields = (fields) => fields.filter(f => f.type !== 'photo');
export const importableFields = (fields) => fields.filter(f => f.type !== 'photo' && !f.readOnly);

export const columnsFor = (fields, t) => fields.map(f => ({
  key: f.key, label: fieldLabel(f, t), type: f.type === 'number' ? 'number' : undefined,
}));

// Valeur exportée (id → libellé lisible), miroir de renderValue mais en texte brut.
export function exportValue(f, item, ctx) {
  const v = item[f.key];
  switch (f.type) {
    case 'entitySelect': return ctx.entities.find(e => e.id === v)?.nom || (v ?? '');
    case 'siteSelect': return ctx.sites.find(s => s.id === v)?.nom || (v ?? '');
    case 'fkSelect': return (ctx.lists[f.listKey] || []).find(o => o.id === v)?.nom || (v ?? '');
    case 'multiEntity': return (item.entity_ids || []).map(id => ctx.entities.find(e => e.id === id)?.code).filter(Boolean).join(', ');
    case 'multiCheck': return (v || []).map(x => optLabel(f, x)).join(', ');
    case 'select': return v ? optLabel(f, v) : '';
    case 'checkbox': return v ? 'Oui' : 'Non';
    case 'date': return v ? String(v).slice(0, 10) : '';
    default: return v ?? '';
  }
}

// Lignes d'aide du modèle : pour chaque colonne, les valeurs acceptées / le format attendu.
export function acceptedValuesRows(fields, ctx, t) {
  const rows = [];
  for (const f of importableFields(fields)) {
    let vals = null;
    if (f.type === 'select' || f.type === 'multiCheck') vals = (f.options || []).map(o => optLabel(f, o)).join(' · ');
    else if (f.type === 'checkbox') vals = 'Oui / Non';
    else if (f.type === 'entitySelect' || f.type === 'multiEntity') vals = ctx.entities.map(e => e.code || e.nom).join(' · ');
    else if (f.type === 'siteSelect') vals = ctx.sites.map(s => s.nom).join(' · ');
    else if (f.type === 'fkSelect') vals = (ctx.lists[f.listKey] || []).map(o => o.nom).join(' · ');
    else if (f.type === 'date') vals = 'AAAA-MM-JJ';
    else if (f.type === 'number') vals = t('ref.io.help.number');
    if (vals && (f.type === 'multiEntity' || f.type === 'multiCheck')) vals = `${vals} — ${t('ref.io.help.multi')}`;
    if (vals) rows.push({ col: fieldLabel(f, t) + (f.required ? ' *' : ''), val: vals });
  }
  return rows;
}

export function parseDate(cell) {
  if (cell instanceof Date && !isNaN(cell)) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
  }
  const s = String(cell).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s); // JJ/MM/AAAA
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
export function parseBool(cell) {
  const s = norm(cell);
  if (['oui', 'yes', 'true', '1', 'vrai', 'x'].includes(s)) return true;
  if (['non', 'no', 'false', '0', 'faux', ''].includes(s)) return false;
  return null;
}
// Résout une option de select : accepte la valeur brute (slug) OU son libellé traduit.
export function resolveOption(f, cell) {
  const s = norm(cell);
  const raw = (f.options || []).find(o => norm(o) === s);
  if (raw != null) return raw;
  const byLabel = (f.options || []).find(o => norm(optLabel(f, o)) === s);
  return byLabel != null ? byLabel : undefined;
}
export function resolveEntity(ctx, cell) {
  const s = norm(cell);
  const e = ctx.entities.find(x => norm(x.code) === s) || ctx.entities.find(x => norm(x.nom) === s);
  return e ? e.id : undefined;
}

// Construit le payload d'une ligne. Lève une Error au premier problème → la ligne part en échec.
export function rowToPayload(rowObj, fields, headerByField, ctx, t) {
  const payload = {};
  for (const f of importableFields(fields)) {
    const header = headerByField[f.key];
    const raw = header != null ? rowObj[header] : undefined;
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (empty) {
      if (f.required) throw new Error(t('ref.io.err.required', { col: fieldLabel(f, t) }));
      if (f.type === 'multiEntity') payload.entity_ids = f.defaultAll ? ctx.entities.map(e => e.id) : [];
      continue;
    }
    switch (f.type) {
      case 'number': { const n = Number(String(raw).replace(',', '.')); if (Number.isNaN(n)) throw new Error(t('ref.io.err.number', { col: fieldLabel(f, t) })); payload[f.key] = n; break; }
      case 'date': { const d = parseDate(raw); if (!d) throw new Error(t('ref.io.err.date', { col: fieldLabel(f, t) })); payload[f.key] = d; break; }
      case 'checkbox': { const b = parseBool(raw); if (b === null) throw new Error(t('ref.io.err.bool', { col: fieldLabel(f, t) })); payload[f.key] = b; break; }
      case 'select': { const v = resolveOption(f, raw); if (v === undefined) throw new Error(t('ref.io.err.option', { col: fieldLabel(f, t), val: raw })); payload[f.key] = v; break; }
      case 'multiCheck': {
        const arr = String(raw).split(/[;,]/).map(x => x.trim()).filter(Boolean).map(x => { const v = resolveOption(f, x); if (v === undefined) throw new Error(t('ref.io.err.option', { col: fieldLabel(f, t), val: x })); return v; });
        payload[f.key] = arr; break;
      }
      case 'entitySelect': { const id = resolveEntity(ctx, raw); if (id === undefined) throw new Error(t('ref.io.err.fk', { col: fieldLabel(f, t), val: raw })); payload[f.key] = id; break; }
      case 'siteSelect': { const s = ctx.sites.find(x => norm(x.nom) === norm(raw)); if (!s) throw new Error(t('ref.io.err.fk', { col: fieldLabel(f, t), val: raw })); payload[f.key] = s.id; break; }
      case 'fkSelect': { const o = (ctx.lists[f.listKey] || []).find(x => norm(x.nom) === norm(raw)); if (!o) throw new Error(t('ref.io.err.fk', { col: fieldLabel(f, t), val: raw })); payload[f.key] = o.id; break; }
      case 'multiEntity': {
        const ids = String(raw).split(/[;,]/).map(x => x.trim()).filter(Boolean).map(x => { const id = resolveEntity(ctx, x); if (id === undefined) throw new Error(t('ref.io.err.fk', { col: fieldLabel(f, t), val: x })); return id; });
        payload.entity_ids = ids; break;
      }
      default: { payload[f.key] = normalizeFieldValue(f, String(raw).trim()); }
    }
  }
  return payload;
}

// Associe chaque champ importable à l'en-tête du fichier (par libellé traduit, repli sur clé).
export function mapHeaders(fields, headers, t) {
  const byNorm = new Map(headers.map(h => [norm(h), h]));
  const headerByField = {};
  const missing = [];
  for (const f of importableFields(fields)) {
    const h = byNorm.get(norm(fieldLabel(f, t))) || byNorm.get(norm(f.label)) || byNorm.get(norm(f.key));
    if (h != null) headerByField[f.key] = h;
    else if (f.required) missing.push(f);
  }
  return { headerByField, missing };
}
