import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import RhSubnav from './RhSubnav';

// Référentiel de compétences (module Évaluation annuelle) — géré par les RH. Deux onglets :
// Compétences (avec leur catégorie) et Catégories. Les managers y piochent pour bâtir les fiches.
const CAT_FIELDS = [
  { key: 'libelle', label: 'Catégorie', required: true },
  { key: 'code', label: 'Code' },
  { key: 'ordre', label: 'Ordre', type: 'number' },
  { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
];
const COMP_FIELDS = [
  { key: 'category_id', label: 'Catégorie', type: 'fkSelect', listKey: 'categories', required: true },
  { key: 'libelle', label: 'Compétence', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'code', label: 'Code' },
  { key: 'ordre', label: 'Ordre', type: 'number' },
  { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
];

export default function Competences() {
  const { user } = useAuth();
  const canAdd = hasSubModuleLevel(user, 'rh', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'rh', 'edition');
  const [tab, setTab] = useState('competences');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    client.get('/rh/evaluation/categories')
      .then(r => setCategories(r.data.map(c => ({ id: c.id, nom: c.libelle }))))
      .catch(() => {});
  }, [tab]);

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Référentiel de compétences</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['competences', 'Compétences'], ['categories', 'Catégories']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === 'categories' ? (
          <ReferentialPage key="cat" title="Catégories de compétences" endpoint="/rh/evaluation/categories"
            fields={CAT_FIELDS} filters={['actif']} lists={{}} canAdd={canAdd} canEdit={canEdit} />
        ) : (
          <ReferentialPage key="comp" title="Compétences" endpoint="/rh/evaluation/competences"
            fields={COMP_FIELDS} filters={['category_id', 'actif']} lists={{ categories }} canAdd={canAdd} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}
