import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import CommerceSubnav, { firstCommerceTarget } from './CommerceSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Module Commerce — Phase D. Réutilise la page CRUD générique des référentiels sous une sous-nav
// propre. Les commerciaux réutilisent le référentiel Employés (interne) et les BU/produits existants.
const fullEmp = e => `${e.matricule ? e.matricule + ' — ' : ''}${e.prenom || ''} ${e.nom || ''}`.trim();

const CONFIGS = {
  commerciaux: {
    title: 'Commerciaux', endpoint: '/commerce/commerciaux', subModuleKey: 'commerce.commerciaux',
    filters: ['business_unit_id', 'statut', 'type'],
    fields: [
      // 1) On choisit d'abord le type. 2) Si interne, on sélectionne l'employé (recherche par nom/
      // matricule) et l'identité se pré-remplit depuis la fiche employé. Le reste se complète à la main.
      { key: 'type', label: 'Type', type: 'select', options: ['interne', 'externe'], default: 'interne',
        optionLabels: { interne: 'Interne', externe: 'Externe' } },
      { key: 'employee_id', label: 'Employé (interne)', type: 'fkSelect', listKey: 'employees', searchable: true,
        showIf: { field: 'type', equals: 'interne' },
        autofill: { code: '_matricule', nom: '_nom', prenom: '_prenom', telephone: '_telephone', email: '_email', adresse: '_adresse' } },
      { key: 'code', label: 'Code', required: true },
      // Identité : pré-remplie depuis l'employé (interne) ou saisie (externe).
      { key: 'nom', label: 'Nom' },
      { key: 'prenom', label: 'Prénom' },
      { key: 'telephone', label: 'Téléphone' },
      { key: 'email', label: 'Email' },
      { key: 'adresse', label: 'Adresse' },
      { key: 'business_unit_id', label: 'Business Unit', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'zone_id', label: 'Zone', type: 'fkSelect', listKey: 'zones' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'date_debut', label: "Date de début d'activité", type: 'date' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['actif', 'inactif'], default: 'actif',
        optionLabels: { actif: 'Actif', inactif: 'Inactif' } },
      { key: 'observations', label: 'Observations', type: 'textarea' },
    ],
  },
  affectations: {
    title: 'Affectations commerciales', endpoint: '/commerce/assignments', subModuleKey: 'commerce.commerciaux',
    filters: ['commercial_id', 'business_unit_id', 'actif'],
    fields: [
      { key: 'commercial_id', label: 'Commercial', type: 'fkSelect', listKey: 'commerciaux', required: true },
      { key: 'business_unit_id', label: 'Business Unit', type: 'fkSelect', listKey: 'businessUnits', required: true },
      { key: 'product_id', label: 'Produit (facultatif)', type: 'fkSelect', listKey: 'productsFinis' },
      { key: 'zone_id', label: 'Zone (facultatif)', type: 'fkSelect', listKey: 'zones' },
      { key: 'date_debut', label: 'Date de début', type: 'date' },
      { key: 'date_fin', label: 'Date de fin', type: 'date' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  moyens: {
    title: 'Moyens de versement', endpoint: '/commerce/payment-methods', subModuleKey: 'commerce.parametres',
    filters: ['actif'],
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'libelle', label: 'Libellé', required: true },
      { key: 'description', label: 'Description' },
      { key: 'requiert_reference', label: 'Référence obligatoire', type: 'checkbox' },
      { key: 'requiert_justificatif', label: 'Justificatif obligatoire', type: 'checkbox' },
      { key: 'ordre', label: 'Ordre', type: 'number' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  banques: {
    title: 'Banques', endpoint: '/commerce/banks', subModuleKey: 'commerce.parametres',
    filters: ['actif'],
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  zones: {
    title: 'Zones commerciales', endpoint: '/commerce/zones', subModuleKey: 'commerce.parametres',
    filters: ['actif'],
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
};

export default function CommerceIndex() {
  const { type } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [employees, setEmployees] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [zones, setZones] = useState([]);
  const [products, setProducts] = useState([]);
  const [commerciaux, setCommerciaux] = useState([]);

  useEffect(() => {
    client.get('/business-units/mine').then(r => setBusinessUnits(r.data)).catch(() => {});
    client.get('/commerce/zones').then(r => setZones(r.data.map(z => ({ id: z.id, nom: z.nom })))).catch(() => {});
    // Employés (pour les commerciaux internes) — dégradé gracieux sans accès RH (liste vide). Les
    // champs `_*` alimentent l'auto-remplissage (voir `autofill` sur le champ employee_id).
    client.get('/employees').then(r => setEmployees(r.data.map(e => ({
      id: e.id, nom: fullEmp(e), search: `${e.prenom || ''} ${e.nom || ''} ${e.matricule || ''}`,
      _matricule: e.matricule || '', _nom: e.nom || '', _prenom: e.prenom || '',
      _telephone: e.telephone || '', _email: e.email || '', _adresse: e.adresse || '',
    })))).catch(() => {});
    client.get('/products').then(r => setProducts(r.data.map(p => ({
      id: p.id, nom: p.designation, type_article: p.type_article, business_unit_id: p.business_unit_id,
    })))).catch(() => {});
    client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data.map(c => ({ id: c.id, nom: `${c.code} — ${c.prenom_affiche || ''} ${c.nom_affiche || ''}`.trim() })))).catch(() => {});
  }, []);

  // Produits pour les affectations : uniquement les PRODUITS FINIS, rangés par Business Unit (optgroup).
  const productsFinis = useMemo(() => {
    const buName = Object.fromEntries(businessUnits.map(b => [b.id, b.nom || b.code]));
    return products
      .filter(p => p.type_article === 'produit_fini')
      .map(p => ({ id: p.id, nom: p.nom, group: buName[p.business_unit_id] || 'Sans BU' }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.nom.localeCompare(b.nom));
  }, [products, businessUnits]);

  const lists = useMemo(() => ({ employees, businessUnits, zones, products, productsFinis, commerciaux }),
    [employees, businessUnits, zones, products, productsFinis, commerciaux]);

  const config = CONFIGS[type];
  if (!config) {
    const target = firstCommerceTarget(user);
    return target ? <Navigate to={target} replace /> : <p style={{ padding: 16 }}>{t('com.access.commerceDenied')}</p>;
  }
  if (!hasSubModuleLevel(user, config.subModuleKey)) {
    const target = firstCommerceTarget(user);
    return target ? <Navigate to={target} replace /> : <p style={{ padding: 16 }}>{t('com.access.denied')}</p>;
  }

  // Traduction à la volée : libellés de champ (via `com.f.<type>.<key>`) et libellés d'options de
  // select (via `com.opt.<key>.<valeur>`). Les valeurs stockées restent inchangées.
  const tFields = config.fields.map(f => ({
    ...f,
    label: t(`com.f.${type}.${f.key}`),
    ...(f.optionLabels ? { optionLabels: Object.fromEntries(Object.keys(f.optionLabels).map(o => [o, t(`com.opt.${f.key}.${o}`)])) } : {}),
  }));

  return (
    <div>
      <CommerceSubnav />
      <ReferentialPage
        key={type} title={t(`com.title.${type}`)} endpoint={config.endpoint} fields={tFields}
        filters={config.filters || []}
        lists={lists}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
        rowLink={type === 'commerciaux' ? (item) => `/commerce/commerciaux/${item.id}` : null}
        rowLinkLabel={t('com.rowLink.fiche')}
      />
    </div>
  );
}
