import { useEffect, useState } from 'react';
import client from '../../api/client';

// Rapports planifiés (super_admin) : configuration des envois périodiques par e-mail
// (production/stock/achats) à une liste de diffusion, + « Envoyer maintenant » et historique.
const FREQ = [['quotidien', 'Quotidien'], ['hebdomadaire', 'Hebdomadaire'], ['mensuel', 'Mensuel']];
const JOURS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [7, 'Dimanche']];
const STATUT_COLOR = { ok: '#128a54', error: '#dc2626', skipped: '#b45309' };
const EMPTY = { libelle: '', code: 'production_bu', frequence: 'quotidien', jour_semaine: 1, jour_mois: 1, heure: '07:00', business_unit_id: '', format: 'pdf', destinataires: '', actif: true };

export default function ScheduledReports() {
  const [list, setList] = useState([]);
  const [types, setTypes] = useState([]);
  const [bus, setBus] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');
  const [runsFor, setRunsFor] = useState(null);
  const [runs, setRuns] = useState([]);

  function load() { client.get('/reporting').then(r => setList(r.data)).catch(() => {}); }
  useEffect(() => {
    load();
    client.get('/reporting/types').then(r => setTypes(r.data)).catch(() => {});
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
  }, []);

  const typeLabel = (code) => (types.find(t => t.code === code)?.libelle) || code;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function startNew() { setForm(EMPTY); setEditingId(null); setShowForm(true); setMsg(''); }
  function startEdit(s) {
    setForm({ ...EMPTY, ...s, business_unit_id: s.business_unit_id || '', jour_semaine: s.jour_semaine || 1, jour_mois: s.jour_mois || 1, heure: (s.heure || '07:00').slice(0, 5) });
    setEditingId(s.id); setShowForm(true); setMsg('');
  }
  function startDuplicate(s) {
    setForm({ ...EMPTY, ...s, id: undefined, libelle: `${s.libelle || ''} (copie)`, business_unit_id: s.business_unit_id || '', jour_semaine: s.jour_semaine || 1, jour_mois: s.jour_mois || 1, heure: (s.heure || '07:00').slice(0, 5) });
    setEditingId(null); setShowForm(true); setMsg('');
  }

  async function save() {
    setMsg('');
    const payload = { ...form, business_unit_id: form.business_unit_id || null };
    try {
      if (editingId) await client.put(`/reporting/${editingId}`, payload);
      else await client.post('/reporting', payload);
      setShowForm(false); setEditingId(null); load();
    } catch (e) { setMsg(e.response?.data?.error || 'Erreur à l’enregistrement.'); }
  }
  async function del(id) { if (window.confirm('Supprimer cette planification ?')) { await client.delete(`/reporting/${id}`); load(); } }
  async function runNow(id) {
    setMsg('Envoi en cours…');
    try { const r = await client.post(`/reporting/${id}/run`); setMsg(`Résultat : ${r.data.statut} — ${r.data.message}`); load(); if (runsFor === id) openRuns(id); }
    catch (e) { setMsg(e.response?.data?.error || 'Envoi impossible.'); }
  }
  async function openRuns(id) { setRunsFor(id); const r = await client.get(`/reporting/${id}/runs`); setRuns(r.data); }

  const dfmt = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—');

  return (
    <div>
      <h1 className="page-title">Rapports planifiés</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 720, marginTop: 0 }}>
        Envoi automatique de rapports par e-mail à une liste de diffusion (production avec courbe par BU,
        stock, achats). Les documents sont générés en français et joints en PDF.
      </p>
      {msg && <div className="alert alert-success" style={{ maxWidth: 720 }}>{msg}</div>}

      <div style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={startNew}>+ Nouvelle planification</button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Libellé</th><th>Rapport</th><th>Fréquence</th><th>Heure</th><th>BU</th><th>Destinataires</th><th>Actif</th><th>Dernier envoi</th><th></th></tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id}>
                <td>{s.libelle}</td>
                <td>{typeLabel(s.code)}</td>
                <td>{FREQ.find(f => f[0] === s.frequence)?.[1]}{s.frequence === 'hebdomadaire' ? ` (${JOURS.find(j => j[0] === s.jour_semaine)?.[1] || ''})` : s.frequence === 'mensuel' ? ` (le ${s.jour_mois})` : ''}</td>
                <td>{(s.heure || '').slice(0, 5)}</td>
                <td>{s.business_unit_nom || 'Toutes'}</td>
                <td style={{ fontSize: 12, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.destinataires}</td>
                <td>{s.actif ? 'Oui' : 'Non'}</td>
                <td style={{ fontSize: 12 }}>{s.last_run_at ? <span><span className="badge" style={{ background: STATUT_COLOR[s.last_status] || '#6b7280', color: '#fff' }}>{s.last_status}</span> {dfmt(s.last_run_at)}</span> : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => runNow(s.id)}>Envoyer</button>
                  <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => openRuns(s.id)}>Historique</button>
                  <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => startEdit(s)}>Éditer</button>
                  <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => startDuplicate(s)}>Dupliquer</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>Suppr.</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>Aucune planification.</td></tr>}
          </tbody>
        </table>
      </div>

      {runsFor && (
        <section className="card" style={{ marginTop: 14, maxWidth: 720 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2 style={{ marginTop: 0, fontSize: 15 }}>Historique des envois</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setRunsFor(null)}>Fermer</button>
          </div>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Date</th><th>Statut</th><th>Destinataires</th><th>Message</th></tr></thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}><td style={{ fontSize: 12 }}>{dfmt(r.run_at)}</td>
                  <td><span className="badge" style={{ background: STATUT_COLOR[r.statut] || '#6b7280', color: '#fff' }}>{r.statut}</span></td>
                  <td style={{ fontSize: 12 }}>{r.destinataires}</td><td style={{ fontSize: 12 }}>{r.message}</td></tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--color-text-muted)', padding: 12 }}>Aucun envoi.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {showForm && (
        <section className="card" style={{ marginTop: 14, maxWidth: 720 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>{editingId ? 'Modifier la planification' : 'Nouvelle planification'}</h2>
          <div className="form-grid" style={{ maxWidth: 'none' }}>
            <label className="field">Libellé
              <input value={form.libelle} onChange={e => set('libelle', e.target.value)} placeholder="Ex. Rapport production quotidien Direction" />
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 220px' }}>Rapport
                <select value={form.code} onChange={e => set('code', e.target.value)}>
                  {types.map(t => <option key={t.code} value={t.code}>{t.libelle}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 160px' }}>Fréquence
                <select value={form.frequence} onChange={e => set('frequence', e.target.value)}>
                  {FREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              {form.frequence === 'hebdomadaire' && (
                <label className="field" style={{ flex: '1 1 140px' }}>Jour
                  <select value={form.jour_semaine} onChange={e => set('jour_semaine', Number(e.target.value))}>
                    {JOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              )}
              {form.frequence === 'mensuel' && (
                <label className="field" style={{ flex: '1 1 140px' }}>Jour du mois
                  <input type="number" min="1" max="28" value={form.jour_mois} onChange={e => set('jour_mois', Number(e.target.value))} />
                </label>
              )}
              <label className="field" style={{ flex: '1 1 120px' }}>Heure
                <input type="time" value={form.heure} onChange={e => set('heure', e.target.value)} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 200px' }}>BU (facultatif)
                <select value={form.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                  <option value="">Toutes les BU</option>
                  {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 140px' }}>Format
                <select value={form.format} onChange={e => set('format', e.target.value)}>
                  <option value="pdf">PDF joint</option>
                  <option value="html">E-mail seul</option>
                </select>
              </label>
              <label className="field" style={{ alignSelf: 'flex-end' }}>
                <span><input type="checkbox" checked={form.actif} onChange={e => set('actif', e.target.checked)} /> Actif</span>
              </label>
            </div>
            <label className="field">Destinataires (liste de diffusion — séparés par , ; ou espace)
              <textarea rows={2} value={form.destinataires} onChange={e => set('destinataires', e.target.value)} placeholder="dg@ccg.com, production@ccg.com" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save}>Enregistrer</button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>Annuler</button>
          </div>
        </section>
      )}
    </div>
  );
}
