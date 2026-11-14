import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel, isSuperAdmin } from '../../auth/AuthContext';

// Référentiel paramétrable des « Types de frais » annexes des devis (TVA, Freight, Mise à FOB,
// Transport, Autres…). Lecture pour tout accès au module achats ; écriture = super_admin ou niveau
// edition sur le sous-module achats. Documents/exports restent en français.
export default function FeeTypesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = isSuperAdmin(user) || hasSubModuleLevel(user, 'achats', 'edition');
  const [items, setItems] = useState(null);
  const [nouveau, setNouveau] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    client.get('/purchase-requests/fee-types').then(r => setItems(r.data)).catch(() => setError('Chargement impossible.'));
  }
  useEffect(load, []);

  async function add(e) {
    e.preventDefault();
    const libelle = nouveau.trim();
    if (!libelle) return;
    setBusy(true); setError('');
    try { await client.post('/purchase-requests/fee-types', { libelle }); setNouveau(''); load(); }
    catch (err) { setError(err.response?.data?.error || 'Ajout impossible.'); }
    finally { setBusy(false); }
  }
  async function rename(it) {
    const libelle = window.prompt('Nouveau libellé :', it.libelle);
    if (libelle == null || !libelle.trim()) return;
    await client.put(`/purchase-requests/fee-types/${it.id}`, { libelle: libelle.trim() });
    load();
  }
  async function toggle(it) {
    await client.put(`/purchase-requests/fee-types/${it.id}`, { actif: !it.actif });
    load();
  }
  async function remove(it) {
    if (!window.confirm(`Supprimer « ${it.libelle} » ?`)) return;
    await client.delete(`/purchase-requests/fee-types/${it.id}`);
    load();
  }

  return (
    <div>
      <button onClick={() => navigate('/purchase-requests')} style={{ background: 'none', border: 'none', color: 'var(--status-blue-fg)', cursor: 'pointer', padding: 0, marginBottom: 6, fontSize: 13 }}>← Demandes d'achat</button>
      <h1 className="page-title" style={{ margin: 0 }}>Types de frais annexes</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 680, marginTop: 4 }}>
        Liste des <strong>frais</strong> proposés à la saisie d'un devis (TVA, Freight, Mise à FOB, Transport, Autres…),
        pour séparer les charges et analyser le coût complet.
      </p>
      {error && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{error}</div>}

      {canEdit && (
        <section className="card" style={{ maxWidth: 680, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Nouveau type de frais</h2>
          <form onSubmit={add} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 220 }}>Libellé
              <input value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder="Ex. Assurance transport" />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !nouveau.trim()}>Ajouter</button>
          </form>
        </section>
      )}

      <section className="card" style={{ maxWidth: 680, padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Libellé</th><th>Statut</th>{canEdit && <th style={{ width: 200 }} />}</tr></thead>
            <tbody>
              {(items || []).map(it => (
                <tr key={it.id}>
                  <td>{it.libelle}</td>
                  <td>
                    <span className="badge" style={it.actif
                      ? { background: 'var(--status-green-bg, #dcfce7)', color: 'var(--status-green-fg, #15803d)' }
                      : { background: 'var(--color-hover)', color: 'var(--color-text-muted)' }}>
                      {it.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  {canEdit && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => rename(it)}>Renommer</button>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => toggle(it)}>{it.actif ? 'Désactiver' : 'Activer'}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(it)}>Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
              {items && items.length === 0 && <tr><td className="empty-row" colSpan={canEdit ? 3 : 2}>Aucun type de frais.</td></tr>}
              {items === null && !error && <tr><td className="empty-row" colSpan={canEdit ? 3 : 2}>Chargement…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
