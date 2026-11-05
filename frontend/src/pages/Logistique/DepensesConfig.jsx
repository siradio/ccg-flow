import { useEffect, useState } from 'react';
import client from '../../api/client';
import LogistiqueSubnav from './LogistiqueSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

// Configuration du module Logistique → Autorisation de dépense : référentiel « Types de dépense »
// paramétrable ici même (pas dans l'admin global). Sélectionnable ensuite à la saisie d'une
// autorisation. Écriture réservée au niveau « edition » du sous-module logistique.depenses.
export default function DepensesConfig() {
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'logistique.depenses', 'edition');
  const [items, setItems] = useState(null);
  const [nouveau, setNouveau] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    client.get('/logistique/depenses/expense-types')
      .then(r => setItems(r.data))
      .catch(() => setError('Chargement impossible.'));
  }
  useEffect(load, []);

  async function add(e) {
    e.preventDefault();
    const libelle = nouveau.trim();
    if (!libelle) return;
    setBusy(true); setError('');
    try { await client.post('/logistique/depenses/expense-types', { libelle }); setNouveau(''); load(); }
    catch (err) { setError(err.response?.data?.error || 'Ajout impossible.'); }
    finally { setBusy(false); }
  }

  async function rename(it) {
    const libelle = window.prompt('Nouveau libellé :', it.libelle);
    if (libelle == null || !libelle.trim()) return;
    await client.put(`/logistique/depenses/expense-types/${it.id}`, { libelle: libelle.trim() });
    load();
  }
  async function toggle(it) {
    await client.put(`/logistique/depenses/expense-types/${it.id}`, { actif: !it.actif });
    load();
  }
  async function remove(it) {
    if (!window.confirm(`Supprimer « ${it.libelle} » ?`)) return;
    await client.delete(`/logistique/depenses/expense-types/${it.id}`);
    load();
  }

  return (
    <div>
      <LogistiqueSubnav />
      <h1 className="page-title">Autorisation de dépense — Configuration</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 680, marginTop: 0 }}>
        Liste des <strong>types de dépense</strong> proposés à la saisie d'une autorisation. Gérée ici,
        dans le module Logistique.
      </p>
      {error && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{error}</div>}

      {canEdit && (
        <section className="card" style={{ maxWidth: 680, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Nouveau type de dépense</h2>
          <form onSubmit={add} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 220 }}>Libellé
              <input value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder="Ex. Assurance véhicule" />
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
              {items && items.length === 0 && <tr><td className="empty-row" colSpan={canEdit ? 3 : 2}>Aucun type de dépense.</td></tr>}
              {items === null && !error && <tr><td className="empty-row" colSpan={canEdit ? 3 : 2}>Chargement…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
