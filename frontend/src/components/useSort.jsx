import { useState } from 'react';

// Tri client générique par colonne, réutilisable sur n'importe quel tableau (référentiels au
// tableau « maison » qui ne passent pas par ReferentialPage). Comportement identique à celui de
// ReferentialPage : 1er clic = croissant, 2e = décroissant, 3e = retour à l'ordre d'origine.
// Chaque colonne triable fournit un accesseur `get(row)` → valeur comparable (gère les valeurs
// calculées, pas seulement les champs bruts). Valeurs vides toujours en dernier ; tri naturel
// (numeric) pour classer correctement codes alphanumériques et nombres.
export function useSort() {
  const [sort, setSort] = useState({ key: null, dir: 'asc', get: null });
  const by = (key, get) => setSort(s => (
    s.key !== key ? { key, dir: 'asc', get }
      : s.dir === 'asc' ? { key, dir: 'desc', get }
      : { key: null, dir: 'asc', get: null }
  ));
  const apply = (items) => {
    if (!sort.key || !sort.get) return items;
    return [...items].sort((a, b) => {
      const va = sort.get(a), vb = sort.get(b);
      const ea = va === null || va === undefined || va === '';
      const eb = vb === null || vb === undefined || vb === '';
      if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
      const r = (typeof va === 'number' && typeof vb === 'number')
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? r : -r;
    });
  };
  return { sort, by, apply };
}

// En-tête de colonne triable. `colKey` identifie la colonne, `get` extrait la valeur de tri.
// Les autres props (style, colSpan…) sont transmises au <th>.
export function SortTh({ label, colKey, get, sort, by, style, children, ...rest }) {
  const active = sort.key === colKey;
  return (
    <th
      onClick={() => by(colKey, get)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
      {...rest}
    >
      {label ?? children}
      {active && <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}
