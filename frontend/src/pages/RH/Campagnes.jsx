import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import Modal from '../../components/Modal.jsx';
import RhSubnav, { canManageRhTypes } from './RhSubnav';

// Campagnes d'évaluation — ouvertes/clôturées par les RH. La génération des fiches est CIBLÉE
// (choix du modèle + sélection des employés, filtrables par poste) : une évaluation ne concerne pas
// forcément tout le monde et un modèle peut n'être applicable qu'à certains métiers.
export default function Campagnes() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const isRh = canManageRhTypes(user);
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ libelle: '', annee: new Date().getFullYear(), date_debut: '', date_fin: '', echelle_max: 5, template_defaut_id: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [report, setReport] = useState(null);

  // Modale de génération ciblée.
  const [gen, setGen] = useState(null); // { campaign, loading, eligibles, templateId, selected:{}, posteFilter, buFilter, busy }

  function load() { client.get('/rh/evaluation/campaigns').then(r => setRows(r.data)).catch(() => setRows([])); }
  useEffect(() => { load(); client.get('/rh/evaluation/templates', { params: { actif: 1 } }).then(r => setTemplates(r.data)).catch(() => {}); }, []);

  async function create() {
    setError('');
    if (!form.libelle.trim()) { setError('Libellé obligatoire.'); return; }
    try {
      await client.post('/rh/evaluation/campaigns', { ...form, template_defaut_id: form.template_defaut_id || null });
      setShow(false); setForm({ libelle: '', annee: new Date().getFullYear(), date_debut: '', date_fin: '', echelle_max: 5, template_defaut_id: '' }); load();
    } catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
  }
  async function remove(c) {
    const ok = await confirm(`Supprimer la campagne « ${c.libelle} » ? Cette action est définitive.`, { danger: true, confirmLabel: 'Supprimer' });
    if (!ok) return;
    try { await client.delete(`/rh/evaluation/campaigns/${c.id}`); setNotice({ type: 'success', text: 'Campagne supprimée.' }); load(); }
    catch (e) { setNotice({ type: 'warning', text: e?.response?.data?.error || 'Erreur.' }); }
  }
  async function toggleStatut(c) {
    const ok = await confirm(`${c.statut === 'ouverte' ? 'Clôturer' : 'Rouvrir'} la campagne « ${c.libelle} » ?`, { confirmLabel: c.statut === 'ouverte' ? 'Clôturer' : 'Rouvrir' });
    if (!ok) return;
    try { await client.put(`/rh/evaluation/campaigns/${c.id}`, { statut: c.statut === 'ouverte' ? 'close' : 'ouverte' }); load(); }
    catch (e) { setNotice({ type: 'warning', text: e?.response?.data?.error || 'Erreur.' }); }
  }

  // --- Génération ciblée ---
  function openGen(c) {
    setReport(null);
    setGen({ campaign: c, loading: true, eligibles: [], templateId: c.template_defaut_id ? String(c.template_defaut_id) : '', selected: {}, posteFilter: '', buFilter: '', busy: false });
    client.get(`/rh/evaluation/campaigns/${c.id}/eligibles`).then(r => {
      const sel = {};
      for (const e of r.data) if (!e.deja_fiche) sel[e.id] = true; // présélection par défaut (hors fiches déjà créées)
      setGen(g => g && g.campaign.id === c.id ? { ...g, loading: false, eligibles: r.data, selected: sel } : g);
    }).catch(() => setGen(g => g ? { ...g, loading: false } : g));
  }

  const filteredEligibles = useMemo(() => {
    if (!gen) return [];
    const pf = gen.posteFilter.trim().toLowerCase();
    return gen.eligibles.filter(e =>
      (!pf || (e.poste || '').toLowerCase().includes(pf)) &&
      (!gen.buFilter || String(e.business_unit_id) === String(gen.buFilter)));
  }, [gen]);

  function setSel(id, v) { setGen(g => ({ ...g, selected: { ...g.selected, [id]: v } })); }
  function setAll(v) {
    setGen(g => {
      const sel = { ...g.selected };
      for (const e of filteredEligibles) if (!e.deja_fiche) sel[e.id] = v;
      return { ...g, selected: sel };
    });
  }
  function selectPosteCible() {
    const tpl = templates.find(t => String(t.id) === String(gen.templateId));
    const cible = (tpl?.poste_cible || '').trim().toLowerCase();
    if (!cible) { setNotice({ type: 'warning', text: 'Ce modèle n\'a pas de « poste cible » renseigné.' }); return; }
    setGen(g => {
      const sel = {};
      for (const e of g.eligibles) if (!e.deja_fiche && (e.poste || '').toLowerCase().includes(cible)) sel[e.id] = true;
      return { ...g, selected: sel };
    });
  }
  const selectedCount = gen ? Object.values(gen.selected).filter(Boolean).length : 0;

  async function runGenerate() {
    if (!gen) return;
    if (!gen.templateId) { setNotice({ type: 'warning', text: 'Sélectionnez un modèle.' }); return; }
    const ids = Object.keys(gen.selected).filter(k => gen.selected[k]).map(Number);
    if (ids.length === 0) { setNotice({ type: 'warning', text: 'Sélectionnez au moins un employé.' }); return; }
    setGen(g => ({ ...g, busy: true }));
    try {
      const r = await client.post(`/rh/evaluation/campaigns/${gen.campaign.id}/generate`, { employee_ids: ids, template_id: Number(gen.templateId) });
      setReport({ campagne: gen.campaign.libelle, ...r.data });
      setGen(null); load();
    } catch (e) {
      setNotice({ type: 'warning', text: e?.response?.data?.error || 'Erreur.' });
      setGen(g => g ? { ...g, busy: false } : g);
    }
  }

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Campagnes d'évaluation</h2>
          {isRh && <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShow(s => !s)}>{show ? 'Annuler' : '+ Nouvelle campagne'}</button>}
        </div>

        {notice && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{notice.text}</span><button onClick={() => setNotice(null)} className="btn-icon" aria-label="Fermer">×</button></div>}

        {show && isRh && (
          <div className="card" style={{ marginBottom: 16, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <label>Libellé<input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} style={{ display: 'block', width: '100%' }} /></label>
            <label>Année<input type="number" value={form.annee} onChange={e => setForm({ ...form, annee: e.target.value })} style={{ display: 'block', width: 110 }} /></label>
            <label>Barème (max)<input type="number" min="2" max="10" value={form.echelle_max} onChange={e => setForm({ ...form, echelle_max: e.target.value })} style={{ display: 'block', width: 90 }} /></label>
            <label>Du<input type="date" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })} style={{ display: 'block' }} /></label>
            <label>Au<input type="date" value={form.date_fin} onChange={e => setForm({ ...form, date_fin: e.target.value })} style={{ display: 'block' }} /></label>
            <label>Modèle par défaut<select value={form.template_defaut_id} onChange={e => setForm({ ...form, template_defaut_id: e.target.value })} style={{ display: 'block', width: '100%' }}>
              <option value="">— aucun —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select></label>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={create}>Créer la campagne</button>
              {error && <span style={{ color: 'var(--color-danger)' }}>{error}</span>}
            </div>
          </div>
        )}

        {report && (
          <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div><strong>Campagne « {report.campagne} »</strong> — {report.created} fiche(s) créée(s), {report.skipped} ignorée(s) sur {report.total}.</div>
            <button onClick={() => setReport(null)} className="btn-icon" aria-label="Fermer">×</button>
          </div>
        )}

        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Libellé</th><th>Année</th><th>Période</th><th>Barème</th><th>Modèle défaut</th><th>Fiches</th><th>Statut</th>{isRh && <th></th>}</tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={isRh ? 8 : 7}>Aucune campagne.</td></tr>
                : rows.map(c => (
                  <tr key={c.id}>
                    <td>{c.libelle}</td><td>{c.annee}</td>
                    <td style={{ fontSize: 13 }}>{(c.date_debut || '—')} → {(c.date_fin || '—')}</td>
                    <td>1 → {c.echelle_max}</td><td>{c.template_defaut_nom || '—'}</td><td>{c.nb_fiches}</td>
                    <td><span className="badge" style={{ background: c.statut === 'ouverte' ? '#128a54' : '#6b7280', color: '#fff' }}>{c.statut === 'ouverte' ? 'Ouverte' : 'Close'}</span></td>
                    {isRh && <td style={{ whiteSpace: 'nowrap' }}>
                      {c.statut === 'ouverte' && <button className="btn btn-primary btn-sm" onClick={() => openGen(c)}>Générer les fiches</button>}{' '}
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleStatut(c)}>{c.statut === 'ouverte' ? 'Clôturer' : 'Rouvrir'}</button>{' '}
                      {c.statut === 'ouverte' && c.nb_fiches === 0 && <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(c)}>Supprimer</button>}
                    </td>}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {gen && (
        <Modal wide title={`Générer les fiches — ${gen.campaign.libelle}`} onClose={() => !gen.busy && setGen(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
              Choisissez le modèle et les employés concernés. Une fiche brouillon sera créée pour chaque employé sélectionné.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
              <label>Modèle appliqué
                <select value={gen.templateId} onChange={e => setGen(g => ({ ...g, templateId: e.target.value }))} style={{ display: 'block', minWidth: 200 }}>
                  <option value="">— choisir —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.nom}{t.poste_cible ? ` (${t.poste_cible})` : ''}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={selectPosteCible}>Sélectionner le poste cible du modèle</button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
              <label>Filtrer par poste
                <input value={gen.posteFilter} onChange={e => setGen(g => ({ ...g, posteFilter: e.target.value }))} placeholder="ex. opérateur, chef…" style={{ display: 'block' }} />
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll(true)}>Tout cocher (filtrés)</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll(false)}>Tout décocher</button>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{selectedCount} sélectionné(s)</span>
            </div>

            {gen.loading ? <p>Chargement…</p> : (
              <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th></th><th>Employé</th><th>Poste</th><th>BU</th><th>Manager</th></tr></thead>
                  <tbody>
                    {filteredEligibles.length === 0 ? <tr><td colSpan={5}>Aucun employé éligible.</td></tr>
                      : filteredEligibles.map(e => {
                        const bloque = e.deja_fiche;
                        return (
                          <tr key={e.id} style={bloque ? { color: 'var(--color-text-muted)' } : undefined}>
                            <td><input type="checkbox" disabled={bloque} checked={!!gen.selected[e.id]} onChange={ev => setSel(e.id, ev.target.checked)} /></td>
                            <td>{e.matricule ? e.matricule + ' — ' : ''}{e.prenom} {e.nom}{e.deja_fiche && <span style={{ fontSize: 11 }}> (fiche déjà créée)</span>}</td>
                            <td>{e.poste || '—'}</td>
                            <td>{e.business_unit_nom || '—'}</td>
                            <td>{e.manager_nom || <span style={{ fontSize: 11, color: 'var(--color-warning-fg)' }}>sans manager → RH</span>}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setGen(null)} disabled={gen.busy}>Annuler</button>
              <button className="btn btn-primary" onClick={runGenerate} disabled={gen.busy || gen.loading}>{gen.busy ? '…' : `Générer (${selectedCount})`}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
