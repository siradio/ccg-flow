import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { ExportButtons } from '../../utils/exportData';

const EXPORT_COLS = [
  { key: 'reference', label: 'Référence' }, { key: 'date_mouvement', label: 'Date' },
  { key: 'type_libelle', label: 'Type' }, { key: 'bu_nom', label: 'Business Unit' },
  { key: 'location_nom', label: 'Localisation' }, { key: 'total_quantite', label: 'Quantité' },
  { key: 'statut', label: 'Statut' }, { key: 'cree_par', label: 'Créé par' },
];

// Refonte Stock (Lot 1) — Journal / consultation des mouvements du grand livre. Filtrable.
// Une écriture validée ne se supprime pas : on l'annule (elle sort du solde mais reste ici).
const SENS_COLOR = { entree: '#15803d', sortie: '#b91c1c', neutre: '#6b7280' };
const STATUT_COLOR = { valide: '#15803d', annule: '#b91c1c', brouillon: '#6b7280', soumis: '#b45309', a_valider: '#b45309', refuse: '#b91c1c' };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmt = n => (n == null ? '' : Number(n).toLocaleString('fr-FR'));

export default function MouvementsJournal() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'stock.consultation');
  const canEdit = hasSubModuleLevel(user, 'stock.consultation', 'edition') || hasSubModuleLevel(user, 'stock.saisie', 'edition');

  const [rows, setRows] = useState([]);
  const [bus, setBus] = useState([]);
  const [types, setTypes] = useState([]);
  const [filters, setFilters] = useState({ business_unit_id: '', type_id: '', statut: '', date_from: '', date_to: '' });
  const [detail, setDetail] = useState(null);

  function load() {
    const qs = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    client.get('/stock-mouvements' + (qs ? '?' + qs : '')).then(r => setRows(r.data)).catch(() => {});
  }
  useEffect(() => {
    if (!canView) return;
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
    client.get('/stock-movement-types').then(r => setTypes(r.data)).catch(() => {});
  }, [canView]);
  useEffect(() => { if (canView) load(); /* eslint-disable-next-line */ }, [canView, filters]);

  if (!canView) return <div><StockSectionNav /><p>La consultation des mouvements ne vous a pas été accordée.</p></div>;

  async function openDetail(id) { const { data } = await client.get('/stock-mouvements/' + id); setDetail(data); }
  async function annuler(m) {
    if (!window.confirm(`Annuler le mouvement ${m.reference} ? Il sortira du solde mais restera dans l'historique.`)) return;
    await client.post(`/stock-mouvements/${m.id}/annuler`, {}); load(); if (detail?.id === m.id) openDetail(m.id);
  }
  async function valider(m) { await client.post(`/stock-mouvements/${m.id}/valider`, {}); load(); if (detail?.id === m.id) openDetail(m.id); }
  async function refuser(m) { if (!window.confirm(`Refuser le mouvement ${m.reference} ?`)) return; await client.post(`/stock-mouvements/${m.id}/refuser`, {}); load(); if (detail?.id === m.id) openDetail(m.id); }

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>Mouvements de stock</h1>
          <p className="page-subtitle" style={{ margin: '0 0 12px' }}>Journal du grand livre — filtrable, traçable.</p>
        </div>
        <ExportButtons filename="mouvements_stock" columns={EXPORT_COLS} rows={rows} />
      </div>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 150 }}>Business Unit
          <select value={filters.business_unit_id} onChange={e => setFilters(f => ({ ...f, business_unit_id: e.target.value }))}>
            <option value="">Toutes</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 160 }}>Type
          <select value={filters.type_id} onChange={e => setFilters(f => ({ ...f, type_id: e.target.value }))}>
            <option value="">Tous</option>{types.map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 120 }}>Statut
          <select value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}>
            <option value="">Tous</option><option value="a_valider">À valider</option><option value="valide">Validé</option><option value="annule">Annulé</option><option value="refuse">Refusé</option>
          </select>
        </label>
        <label className="field">Du<input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} /></label>
        <label className="field">Au<input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} /></label>
        <button className="btn btn-secondary" onClick={() => setFilters({ business_unit_id: '', type_id: '', statut: '', date_from: '', date_to: '' })}>Réinitialiser</button>
      </div>

      {rows.length === 0 && <p className="empty-row">Aucun mouvement.</p>}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Réf.</th><th>Date</th><th>Type</th><th>BU</th><th>Localisation</th><th className="num">Qté</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.id}>
                    <td><strong>{m.reference}</strong></td>
                    <td>{d10(m.date_mouvement)}</td>
                    <td><span style={{ color: SENS_COLOR[m.sens], fontWeight: 600 }}>{m.type_libelle}</span></td>
                    <td>{m.bu_nom || '—'}</td>
                    <td>{m.location_nom || '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.sens === 'sortie' ? '−' : m.sens === 'entree' ? '+' : ''}{fmt(m.total_quantite)}</td>
                    <td><span style={{ color: STATUT_COLOR[m.statut] || '#6b7280', fontWeight: 600, textTransform: 'capitalize' }}>{m.statut}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => openDetail(m.id)}>Détail</button>
                      {canEdit && m.statut === 'a_valider' && <>
                        <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => valider(m)}>Valider</button>
                        <button className="btn btn-danger btn-sm" onClick={() => refuser(m)}>Refuser</button>
                      </>}
                      {canEdit && m.statut === 'valide' && <button className="btn btn-danger btn-sm" onClick={() => annuler(m)}>Annuler</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{detail.reference} — {detail.type_libelle}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>Fermer</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>
            {d10(detail.date_mouvement)} · {detail.bu_nom || '—'} · {detail.location_nom || 'sans localisation'} · {detail.statut}
            {detail.reference_document ? ` · doc ${detail.reference_document}` : ''}{detail.cree_par ? ` · par ${detail.cree_par}` : ''}
          </p>
          {(detail.ordre_fabrication || detail.produit_fini_designation || detail.lot_fournisseur || detail.statut_qualite) && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-muted)' }}>
              <strong>Production :</strong>
              {detail.ordre_fabrication ? ` OF ${detail.ordre_fabrication}` : ''}
              {detail.ligne_production ? ` · ligne ${detail.ligne_production}` : ''}
              {detail.produit_fini_designation ? ` · → ${detail.produit_fini_designation}` : ''}
              {detail.lot_fournisseur ? ` · lot fourn. ${detail.lot_fournisseur}` : ''}
              {detail.statut_qualite ? ` · qualité : ${detail.statut_qualite}` : ''}
            </p>
          )}
          {detail.commentaire && <p style={{ margin: '0 0 10px' }}>{detail.commentaire}</p>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produit</th><th className="num">Quantité</th><th className="num">Prix unit.</th><th className="num">Valeur</th></tr></thead>
              <tbody>
                {(detail.lines || []).map(l => (
                  <tr key={l.id}><td>{l.product_code ? l.product_code + ' — ' : ''}{l.designation}</td>
                    <td className="num">{fmt(l.quantite)} {l.unite || ''}</td><td className="num">{fmt(l.prix_unitaire)}</td><td className="num">{fmt(l.valeur)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
