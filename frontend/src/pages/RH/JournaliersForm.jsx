import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';

// Demande de journaliers — grille hebdomadaire : lignes = types de tâches (config RH), colonnes =
// Lun→Dim, cellules = nombre de journaliers. Circuit DAF → DGA → RH. Interface en français.
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

function nextMonday() {
  const d = new Date(); const dow = d.getDay();
  const add = ((8 - dow) % 7) || 7; // lundi de la semaine suivante
  d.setDate(d.getDate() + add); d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00'); const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export default function JournaliersForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const editId = sp.get('id');

  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [semaine, setSemaine] = useState(nextMonday());
  const [tasks, setTasks] = useState([]);
  const [cells, setCells] = useState({}); // `${taskId}_${jour}` -> nombre
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.get('/business-units/mine').then(r => { setBus(r.data); if (!editId && r.data[0]) setBuId(String(r.data[0].id)); }).catch(() => {});
    client.get('/rh/journaliers/task-types').then(r => setTasks(r.data.filter(x => x.actif))).catch(() => {});
    if (editId) {
      client.get(`/rh/requests/${editId}`).then(r => {
        const d = r.data; setBuId(String(d.business_unit_id || '')); setSemaine(mondayOf(d.date_debut));
        const c = {}; (d.journaliers_lines || []).forEach(l => { c[`${l.task_type_id}_${l.jour}`] = l.nombre; }); setCells(c);
      }).catch(() => {});
    }
  }, [editId]);

  const lundi = mondayOf(semaine);
  const setCell = (tid, jour, v) => setCells(c => ({ ...c, [`${tid}_${jour}`]: v }));
  const totJour = useMemo(() => JOURS.map((_, i) => tasks.reduce((s, t) => s + (Number(cells[`${t.id}_${i + 1}`]) || 0), 0)), [cells, tasks]);
  const totTask = t => JOURS.reduce((s, _, i) => s + (Number(cells[`${t.id}_${i + 1}`]) || 0), 0);
  const totSemaine = totJour.reduce((a, b) => a + b, 0);

  function buildLines() {
    const lines = [];
    for (const t of tasks) for (let j = 1; j <= 7; j++) { const n = Number(cells[`${t.id}_${j}`]) || 0; if (n > 0) lines.push({ jour: j, task_type_id: t.id, nombre: n }); }
    return lines;
  }

  async function persist() {
    const body = { business_unit_id: Number(buId), semaine_debut: lundi, lines: buildLines() };
    if (editId) { await client.put(`/rh/journaliers/${editId}`, body); return editId; }
    const r = await client.post('/rh/journaliers', body); return r.data.id;
  }

  async function save(submit) {
    if (saving) return;
    if (!buId) { setError('Choisissez une Business Unit.'); return; }
    if (totSemaine === 0) { setError('Indiquez au moins un journalier.'); return; }
    setSaving(true); setError('');
    try {
      const id = await persist();
      if (submit) await client.post(`/rh/requests/${id}/submit`, {});
      nav(`/rh/demandes/${id}`);
    } catch (e) { setError(e.response?.data?.error || 'Erreur serveur.'); setSaving(false); }
  }

  return (
    <div>
      <RhSubnav />
      <h1 className="page-title" style={{ margin: '4px 0' }}>Demande de journaliers</h1>
      <p className="page-subtitle" style={{ margin: '0 0 14px' }}>Nombre de journaliers par jour et par tâche, pour la semaine. Circuit : DAF → DGA → RH.</p>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 200 }}>Business Unit
          <select value={buId} onChange={e => setBuId(e.target.value)}>
            <option value="" disabled>Choisir…</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field">Semaine (un jour de la semaine cible)<input type="date" value={semaine} onChange={e => setSemaine(e.target.value)} /></label>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Semaine du <strong>{d10(lundi)}</strong> au <strong>{d10(addDays(lundi, 6))}</strong></div>
      </div>

      {tasks.length === 0 ? (
        <p className="empty-row">Aucun type de tâche configuré. Les RH doivent les paramétrer (RH → Paramètres).</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tâche</th>{JOURS.map((j, i) => <th key={j} className="num">{j}<div style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-muted)' }}>{d10(addDays(lundi, i)).slice(0, 5)}</div></th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.nom}</strong></td>
                    {JOURS.map((_, i) => (
                      <td key={i} className="num">
                        <input type="number" min="0" value={cells[`${t.id}_${i + 1}`] ?? ''} style={{ width: 54, textAlign: 'right' }}
                          onChange={e => setCell(t.id, i + 1, e.target.value)} />
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 700 }}>{totTask(t) || ''}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--color-bg-muted, #f3f4f6)' }}>
                  <td><strong>Total / jour</strong></td>
                  {totJour.map((n, i) => <td key={i} className="num" style={{ fontWeight: 700 }}>{n || ''}</td>)}
                  <td className="num" style={{ fontWeight: 800 }}>{totSemaine || ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>{saving ? 'Envoi…' : 'Soumettre au circuit (DAF → DGA → RH)'}</button>
        <button className="btn btn-secondary" disabled={saving} onClick={() => save(false)}>Enregistrer en brouillon</button>
        <button className="btn btn-secondary" onClick={() => nav('/rh/mes-demandes')}>Annuler</button>
      </div>
    </div>
  );
}
