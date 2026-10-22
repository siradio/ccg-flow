import { Fragment, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';

const STATUT_LABEL = { brouillon: 'Brouillon', auto_evaluation: 'Auto-évaluation', evaluation_manager: 'Évaluation manager', avis_rh: 'Avis RH', cloturee: 'Finalisée', annulee: 'Annulée' };
const STATUT_COLOR = { brouillon: '#6b7280', auto_evaluation: '#b45309', evaluation_manager: '#2454e0', avis_rh: '#7c3aed', cloturee: '#128a54', annulee: '#6b7280' };
const STEPS = [['auto_evaluation', 'Auto-évaluation'], ['evaluation_manager', 'Évaluation manager'], ['avis_rh', 'Avis RH'], ['cloturee', 'Finalisée']];
const SUBMIT_LABEL = { brouillon: "Lancer l'auto-évaluation", auto_evaluation: 'Soumettre au manager', evaluation_manager: 'Transmettre aux RH', avis_rh: 'Finaliser' };
const ORDER = ['brouillon', 'auto_evaluation', 'evaluation_manager', 'avis_rh', 'cloturee'];

export default function EvaluationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [fields, setFields] = useState({ axes_amelioration: '', plan_carriere: '', points_forts: '', conclusion_manager: '', avis_rh: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function hydrate(data) {
    setE(data);
    setLignes((data.lignes || []).map(l => ({ ...l })));
    setFields({
      axes_amelioration: data.axes_amelioration || '', plan_carriere: data.plan_carriere || '',
      points_forts: data.points_forts || '', conclusion_manager: data.conclusion_manager || '', avis_rh: data.avis_rh || '',
    });
  }
  function load() { client.get(`/rh/evaluation/fiches/${id}`).then(r => hydrate(r.data)).catch(() => setError('Fiche introuvable ou accès refusé.')); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (error && !e) return <div><RhSubnav /><p style={{ padding: 16, color: 'var(--color-danger)' }}>{error}</p></div>;
  if (!e) return <div><RhSubnav /><p style={{ padding: 16 }}>Chargement…</p></div>;

  const editEmp = e.statut === 'auto_evaluation' && e.can_act;
  const editMgr = e.statut === 'evaluation_manager' && e.can_act;
  const editRh = e.statut === 'avis_rh' && e.can_act;
  const noteOpts = Array.from({ length: e.echelle_max }, (_, i) => i + 1);

  function setLigne(lid, field, val) { setLignes(ls => ls.map(l => l.id === lid ? { ...l, [field]: val } : l)); }

  function payload() {
    const p = {};
    if (editEmp) { p.axes_amelioration = fields.axes_amelioration; p.plan_carriere = fields.plan_carriere; p.lignes = lignes.map(l => ({ id: l.id, note_employe: l.note_employe })); }
    if (editMgr) { p.points_forts = fields.points_forts; p.conclusion_manager = fields.conclusion_manager; p.lignes = lignes.map(l => ({ id: l.id, note_manager: l.note_manager, commentaire_manager: l.commentaire_manager })); }
    if (editRh) { p.avis_rh = fields.avis_rh; }
    return p;
  }
  async function save() { setBusy(true); setError(''); try { const r = await client.post(`/rh/evaluation/fiches/${id}/save`, payload()); hydrate(r.data); } catch (err) { setError(err?.response?.data?.error || 'Erreur.'); } finally { setBusy(false); } }
  async function submit() {
    setBusy(true); setError('');
    try { if (e.statut !== 'brouillon') await client.post(`/rh/evaluation/fiches/${id}/save`, payload()); await client.post(`/rh/evaluation/fiches/${id}/submit`, {}); load(); }
    catch (err) { setError(err?.response?.data?.error || 'Erreur.'); } finally { setBusy(false); }
  }
  async function doReturn() {
    const prev = ORDER.slice(0, ORDER.indexOf(e.statut)).filter(s => s !== 'brouillon' || e.is_manager || e.is_rh);
    const target = window.prompt(`Retourner à quelle étape ? (${prev.join(', ')})`, prev[prev.length - 1] || 'brouillon');
    if (!target || !prev.includes(target)) return;
    const c = window.prompt('Motif du retour (obligatoire) :'); if (!c || !c.trim()) return;
    try { await client.post(`/rh/evaluation/fiches/${id}/return`, { target, commentaire: c.trim() }); load(); } catch (err) { setError(err?.response?.data?.error || 'Erreur.'); }
  }
  async function cancel() {
    const m = window.prompt("Motif d'annulation (obligatoire) :"); if (!m || !m.trim()) return;
    try { await client.post(`/rh/evaluation/fiches/${id}/cancel`, { motif: m.trim() }); load(); } catch (err) { setError(err?.response?.data?.error || 'Erreur.'); }
  }
  async function openPdf() {
    try { const r = await client.get(`/rh/evaluation/fiches/${id}/pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(r.data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (err) { setError('PDF indisponible (disponible après finalisation).'); }
  }

  // Regroupe les lignes par catégorie.
  const groups = []; const byCat = {};
  for (const l of lignes) { const g = l.categorie_libelle || 'Autres'; if (!byCat[g]) { byCat[g] = []; groups.push(g); } byCat[g].push(l); }
  const Section = ({ label, who, value, onChange, editable }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 12 }}>({who})</span></div>
      {editable ? <textarea value={value} onChange={onChange} rows={2} style={{ display: 'block', width: '100%' }} />
        : <div style={{ whiteSpace: 'pre-wrap', color: value ? 'var(--color-text)' : 'var(--color-text-muted)' }}>{value || '—'}</div>}
    </div>
  );

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{e.numero} — {e.employe_prenom} {e.employe_nom}</h2>
          <span className="badge" style={{ background: STATUT_COLOR[e.statut] || '#6b7280', color: '#fff' }}>{STATUT_LABEL[e.statut] || e.statut}</span>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => nav('/rh/evaluation/fiches')}>← Liste</button>
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>Poste : {e.poste || '—'}</span><span>Manager : {e.manager_nom || '—'}</span>
          <span>Campagne : {e.campagne_libelle || '—'}</span><span>Année : {e.annee}</span><span>Barème : 1 → {e.echelle_max}</span>
          {e.auto_par_manager && <span style={{ color: 'var(--color-warning-fg)' }}>Auto-évaluation remplie par le manager (employé sans compte)</span>}
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {STEPS.map(([code, label]) => {
            const done = ORDER.indexOf(e.statut) > ORDER.indexOf(code) || e.statut === 'cloturee' && code === 'cloturee';
            const cur = e.statut === code;
            const color = cur ? STATUT_COLOR[code] : done ? '#128a54' : '#9ca3af';
            return <div key={code} style={{ flex: '1 1 150px', minWidth: 140, border: `1px solid ${color}`, borderRadius: 8, padding: '6px 10px' }}>
              <div style={{ fontWeight: 600 }}>{label}</div>
              <span className="badge" style={{ background: color, color: '#fff', marginTop: 3 }}>{cur ? 'En cours' : done ? 'Fait' : 'À venir'}</span>
            </div>;
          })}
        </div>

        {/* Grille de compétences */}
        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Compétence</th><th style={{ width: 120 }}>Note employé</th><th style={{ width: 120 }}>Note manager</th><th>Commentaire manager</th></tr></thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g}>
                  <tr><td colSpan={4} style={{ fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-soft)' }}>{g}</td></tr>
                  {byCat[g].map(l => (
                    <tr key={l.id}>
                      <td>{l.libelle}</td>
                      <td>{editEmp
                        ? <select value={l.note_employe ?? ''} onChange={ev => setLigne(l.id, 'note_employe', ev.target.value)}><option value="">—</option>{noteOpts.map(n => <option key={n} value={n}>{n}</option>)}</select>
                        : (l.note_employe ?? '—')}</td>
                      <td>{editMgr
                        ? <select value={l.note_manager ?? ''} onChange={ev => setLigne(l.id, 'note_manager', ev.target.value)}><option value="">—</option>{noteOpts.map(n => <option key={n} value={n}>{n}</option>)}</select>
                        : (l.note_manager ?? '—')}</td>
                      <td>{editMgr
                        ? <input value={l.commentaire_manager ?? ''} onChange={ev => setLigne(l.id, 'commentaire_manager', ev.target.value)} style={{ width: '100%' }} />
                        : (l.commentaire_manager || '—')}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {lignes.length === 0 && <tr><td colSpan={4}>Aucune compétence sur cette fiche.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Sections texte */}
        <div style={{ marginTop: 16 }}>
          <Section label="Points forts" who="manager" value={fields.points_forts} editable={editMgr} onChange={ev => setFields({ ...fields, points_forts: ev.target.value })} />
          <Section label="Axes d'amélioration" who="employé" value={fields.axes_amelioration} editable={editEmp} onChange={ev => setFields({ ...fields, axes_amelioration: ev.target.value })} />
          <Section label="Plan de carrière" who="employé" value={fields.plan_carriere} editable={editEmp} onChange={ev => setFields({ ...fields, plan_carriere: ev.target.value })} />
          <Section label="Conclusion" who="manager" value={fields.conclusion_manager} editable={editMgr} onChange={ev => setFields({ ...fields, conclusion_manager: ev.target.value })} />
          <Section label="Avis RH" who="RH" value={fields.avis_rh} editable={editRh} onChange={ev => setFields({ ...fields, avis_rh: ev.target.value })} />
        </div>

        {e.motif_annulation && <p style={{ color: 'var(--color-danger)' }}>Annulée : {e.motif_annulation}</p>}
        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(editEmp || editMgr || editRh) && <button className="btn" onClick={save} disabled={busy}>Enregistrer</button>}
          {e.can_act && e.statut in SUBMIT_LABEL && <button className="btn btn-primary" onClick={submit} disabled={busy}>{SUBMIT_LABEL[e.statut]}</button>}
          {e.can_act && e.statut !== 'brouillon' && e.statut !== 'cloturee' && e.statut !== 'annulee' && <button className="btn btn-secondary" onClick={doReturn} disabled={busy}>Retourner</button>}
          {(e.is_manager || e.is_rh) && e.statut !== 'cloturee' && e.statut !== 'annulee' && <button className="btn btn-danger-ghost" onClick={cancel} disabled={busy}>Annuler la fiche</button>}
          {e.statut === 'cloturee' && <button className="btn btn-primary" onClick={openPdf}>Télécharger le PDF</button>}
        </div>

        {/* Historique */}
        {(e.history || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 6 }}>Historique</h3>
            <ul style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {e.history.map((h, i) => <li key={i}>{(h.created_at || '').slice(0, 16).replace('T', ' ')} — <strong>{h.action}</strong>{h.acteur_nom ? ` par ${h.acteur_nom}` : ''}{h.commentaire ? ` : ${h.commentaire}` : ''}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
