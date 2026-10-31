import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmProvider';
import { exportXlsx } from '../../utils/exportData';

// Module Logistique — Carburant : pleins (station externe), consommation « plein à plein »,
// détection d'anomalies/fraude et tableau de bord. Interface en français (langue d'exploitation).
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';
const nf = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const gnf = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }));
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

const ANO_LABEL = {
  surconso: 'Surconsommation', volume_sup_reservoir: 'Volume > réservoir', compteur_recule: 'Compteur reculé',
  distance_nulle: 'Distance ~0', pleins_rapproches: 'Pleins rapprochés', montant_incoherent: 'Montant incohérent', prix_aberrant: 'Prix aberrant',
};
const STATUT_LABEL = { ras: '—', a_verifier: 'À vérifier', justifie: 'Justifié', fraude: 'Fraude' };
const NIVEAU_STYLE = {
  rouge: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
  orange: { bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  vert: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
};
const emptyForm = () => ({ date_plein: today(), vehicle_id: '', driver_id: '', compteur_km: '', litres: '', prix_unitaire: '', montant: '', plein_complet: true, station: '', mode_paiement: '', reference: '', commentaire: '' });

function Badge({ niveau, children }) {
  const s = NIVEAU_STYLE[niveau] || NIVEAU_STYLE.vert;
  return <span className="badge" style={{ background: s.bg, color: s.fg, fontWeight: 700 }}>{children}</span>;
}
function Kpi({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ flex: '1 1 150px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || 'var(--color-text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function CarburantPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const canView = hasSubModuleLevel(user, 'logistique.carburant');
  const canAdd = hasSubModuleLevel(user, 'logistique.carburant', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.carburant', 'edition');

  const [tab, setTab] = useState('pleins');
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [period, setPeriod] = useState({ from: monthStart(), to: today(), vehicle: '' });
  const [rows, setRows] = useState([]);
  const [dash, setDash] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [anoFor, setAnoFor] = useState(null); // ligne dont on traite l'anomalie

  useEffect(() => {
    if (!canView) return;
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
    client.get('/drivers').then(r => setDrivers(r.data)).catch(() => {});
  }, [canView]);

  function loadList() {
    const qs = `date_from=${period.from}&date_to=${period.to}${period.vehicle ? `&vehicle_id=${period.vehicle}` : ''}`;
    client.get(`/fuel?${qs}`).then(r => setRows(r.data)).catch(() => {});
  }
  function loadDash() {
    const qs = `date_from=${period.from}&date_to=${period.to}`;
    client.get(`/fuel/dashboard?${qs}`).then(r => setDash(r.data)).catch(() => {});
  }
  useEffect(() => { if (canView && tab === 'pleins') loadList(); /* eslint-disable-next-line */ }, [canView, tab, period]);
  useEffect(() => { if (canView && tab === 'dashboard') loadDash(); /* eslint-disable-next-line */ }, [canView, tab, period]);

  if (!canView) return <div><LogistiqueSubnav /><p>Accès non accordé.</p></div>;

  const vLabel = v => `${v.immatriculation}${v.marque ? ' — ' + v.marque : ''}`;
  const montantApercu = (form.montant === '' && form.litres && form.prix_unitaire) ? Number(form.litres) * Number(form.prix_unitaire) : null;

  function openAdd() { setEditingId(null); setForm(emptyForm()); setError(''); setFormOpen(true); }
  function openEdit(r) {
    setEditingId(r.id);
    setForm({ date_plein: String(r.date_plein).slice(0, 10), vehicle_id: r.vehicle_id || '', driver_id: r.driver_id || '', compteur_km: r.compteur_km ?? '', litres: r.litres ?? '', prix_unitaire: r.prix_unitaire ?? '', montant: r.montant ?? '', plein_complet: r.plein_complet !== false, station: r.station || '', mode_paiement: r.mode_paiement || '', reference: r.reference || '', commentaire: r.commentaire || '' });
    setError(''); setFormOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.vehicle_id || !form.date_plein || !form.litres || Number(form.litres) <= 0) { setError('Véhicule, date et litres (> 0) sont obligatoires.'); return; }
    setSaving(true); setError('');
    try {
      const body = { ...form, vehicle_id: Number(form.vehicle_id), driver_id: form.driver_id || null };
      if (editingId) await client.put(`/fuel/${editingId}`, body);
      else await client.post('/fuel', body);
      setFormOpen(false); loadList();
    } catch (err) { setError(err.response?.data?.error || 'Erreur serveur.'); }
    finally { setSaving(false); }
  }

  async function remove(r) {
    if (!(await confirm('Supprimer ce plein ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    await client.delete(`/fuel/${r.id}`); loadList();
  }

  async function saveAno(statut, note) {
    try { await client.put(`/fuel/${anoFor.id}/anomalie`, { statut_anomalie: statut, note }); setAnoFor(null); loadList(); if (tab === 'dashboard') loadDash(); }
    catch (err) { setError(err.response?.data?.error || 'Erreur serveur.'); }
  }

  function exportReport() {
    const qs = `date_from=${period.from}&date_to=${period.to}${period.vehicle ? `&vehicle_id=${period.vehicle}` : ''}`;
    client.get(`/fuel/report?${qs}`).then(r => {
      const cols = [
        { key: 'vehicle_immat', label: 'Véhicule' }, { key: 'litres', label: 'Litres', type: 'number' },
        { key: 'montant', label: 'Montant (GNF)', type: 'number' }, { key: 'km', label: 'Km parcourus', type: 'number' },
        { key: 'conso_moyenne', label: 'Conso (L/100km)', type: 'number' }, { key: 'conso_reference_l_100', label: 'Réf. (L/100km)', type: 'number' },
        { key: 'cout_km', label: 'Coût/km (GNF)', type: 'number' }, { key: 'nb_pleins', label: 'Nb pleins', type: 'number' },
        { key: 'nb_rouge', label: 'Anomalies 🔴', type: 'number' }, { key: 'nb_orange', label: 'Anomalies 🟠', type: 'number' },
      ];
      exportXlsx(`carburant_conso_${period.from}_${period.to}`, cols, r.data.report);
    }).catch(() => {});
  }

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Carburant</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Pleins, consommation (plein à plein) et détection de fraude.</p>
        </div>
        {tab === 'pleins' && canAdd && <button className="btn btn-primary" onClick={openAdd}>+ Nouveau plein</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['pleins', 'Pleins'], ['dashboard', 'Tableau de bord']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field">Du<input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
        <label className="field">Au<input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
        {tab === 'pleins' && (
          <label className="field" style={{ minWidth: 200 }}>Véhicule
            <select value={period.vehicle} onChange={e => setPeriod(p => ({ ...p, vehicle: e.target.value }))}>
              <option value="">Tous</option>{vehicles.map(v => <option key={v.id} value={v.id}>{vLabel(v)}</option>)}
            </select>
          </label>
        )}
        {tab === 'pleins' && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={exportReport} disabled={rows.length === 0}>⬇ Rapport conso (Excel)</button>}
      </div>

      {tab === 'pleins' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>Véhicule</th><th>Chauffeur</th><th className="num">Km</th><th className="num">Litres</th>
                <th className="num">Prix/L</th><th className="num">Montant</th><th className="num">Dist.</th><th className="num">Conso</th><th>Statut</th><th></th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td className="empty-row" colSpan={11}>Aucun plein sur la période.</td></tr>}
                {rows.map(r => (
                  <tr key={r.id} style={r.niveau === 'rouge' ? { background: 'var(--status-red-bg)' } : undefined}>
                    <td>{d10(r.date_plein)}</td>
                    <td><strong>{r.vehicle_immat}</strong>{r.vehicle_marque ? ` — ${r.vehicle_marque}` : ''}</td>
                    <td>{r.driver_nom || '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.compteur_km != null ? nf(r.compteur_km) : '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{nf(r.litres)}{r.plein_complet ? '' : ' *'}</td>
                    <td className="num">{r.prix_unitaire != null ? gnf(r.prix_unitaire) : '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{gnf(r.montant)}</td>
                    <td className="num">{r.distance != null ? nf(r.distance) : '—'}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{r.conso != null ? nf(r.conso) : '—'}</td>
                    <td>
                      {r.niveau === 'vert' && r.anomalies.length === 0
                        ? <Badge niveau="vert">OK</Badge>
                        : (
                          <button type="button" onClick={() => canEdit && setAnoFor(r)} title={r.anomalies.map(a => ANO_LABEL[a] || a).join(', ')}
                            style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', padding: 0 }}>
                            <Badge niveau={r.niveau}>{r.statut_anomalie !== 'ras' ? STATUT_LABEL[r.statut_anomalie] : (r.anomalies.length + ' alerte' + (r.anomalies.length > 1 ? 's' : ''))}</Badge>
                          </button>
                        )}
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)} style={{ marginRight: 6 }}>Éditer</button>}
                      {canEdit && <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Suppr.</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'dashboard' && dash && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="Litres" value={nf(dash.kpi.litres)} sub={`${dash.kpi.nb_pleins} plein(s)`} />
            <Kpi label="Coût total" value={gnf(dash.kpi.montant) + ' GNF'} />
            <Kpi label="Conso moyenne" value={dash.kpi.conso_moyenne != null ? nf(dash.kpi.conso_moyenne) + ' L/100' : '—'} />
            <Kpi label="Coût / km" value={dash.kpi.cout_km != null ? gnf(dash.kpi.cout_km) + ' GNF' : '—'} />
            <Kpi label="Anomalies critiques" value={dash.kpi.nb_rouge} tone="var(--status-red-fg)" sub={`${dash.kpi.nb_orange} à surveiller`} />
          </div>

          <section className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Top consommation (L/100 km)</h2>
            {dash.top_conso.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>Pas de données.</p> : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={dash.top_conso.map(v => ({ nom: v.vehicle_immat, conso: v.conso_moyenne, ref: v.conso_reference_l_100 ? Number(v.conso_reference_l_100) : null }))} margin={{ top: 6, right: 10, bottom: 6, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="nom" fontSize={11} /><YAxis fontSize={11} width={44} />
                    <Tooltip formatter={v => nf(v)} />
                    <Bar dataKey="conso" fill="#b45309" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Évolution mensuelle</h2>
            {dash.evolution.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>Pas de données.</p> : (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={dash.evolution.map(m => ({ x: m.mois.split('-').reverse().join('/'), litres: m.litres, montant: m.montant }))} margin={{ top: 6, right: 12, bottom: 6, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="x" fontSize={11} /><YAxis fontSize={11} width={54} tickFormatter={nf} />
                    <Tooltip formatter={v => nf(v)} />
                    <Line type="monotone" dataKey="litres" name="Litres" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="card" style={{ padding: 0, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, padding: '12px 14px' }}>Anomalies à traiter ({dash.anomalies.length})</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Véhicule</th><th>Niveau</th><th>Anomalies</th><th className="num">Conso</th><th>Statut</th><th></th></tr></thead>
                <tbody>
                  {dash.anomalies.length === 0 && <tr><td className="empty-row" colSpan={7}>Aucune anomalie 👍</td></tr>}
                  {dash.anomalies.map(r => (
                    <tr key={r.id}>
                      <td>{d10(r.date_plein)}</td>
                      <td><strong>{r.vehicle_immat}</strong></td>
                      <td><Badge niveau={r.niveau}>{r.niveau === 'rouge' ? 'Critique' : 'À surveiller'}</Badge></td>
                      <td style={{ fontSize: 12 }}>{r.anomalies.map(a => ANO_LABEL[a] || a).join(', ')}</td>
                      <td className="num">{r.conso != null ? nf(r.conso) : '—'}</td>
                      <td>{STATUT_LABEL[r.statut_anomalie]}</td>
                      <td className="num">{canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setAnoFor(r)}>Traiter</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(dash.stations.length > 0 || dash.paiements.length > 0) && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <section className="card" style={{ flex: '1 1 260px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Dépenses par station</h3>
                {dash.stations.map(s => <div key={s.station} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>{s.station}</span><strong>{gnf(s.montant)} GNF</strong></div>)}
              </section>
              <section className="card" style={{ flex: '1 1 260px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Dépenses par mode de paiement</h3>
                {dash.paiements.map(p => <div key={p.mode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>{p.mode}</span><strong>{gnf(p.montant)} GNF</strong></div>)}
              </section>
            </div>
          )}
        </>
      )}

      {formOpen && (
        <Modal title={editingId ? 'Modifier le plein' : 'Nouveau plein'} onClose={() => setFormOpen(false)} wide>
          <form onSubmit={save} className="form-inline" style={{ maxWidth: 'none' }}>
            <label className="field">Date *<input type="date" value={form.date_plein} onChange={e => setForm(f => ({ ...f, date_plein: e.target.value }))} required /></label>
            <label className="field" style={{ minWidth: 200 }}>Véhicule *
              <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))} required>
                <option value="" disabled>Choisir…</option>{vehicles.map(v => <option key={v.id} value={v.id}>{vLabel(v)}</option>)}
              </select>
            </label>
            <label className="field" style={{ minWidth: 180 }}>Chauffeur
              <select value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}>
                <option value="">—</option>{drivers.map(d => <option key={d.id} value={d.id}>{`${d.prenom || ''} ${d.nom || ''}`.trim()}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 120 }}>Compteur (km)<input type="number" min="0" value={form.compteur_km} onChange={e => setForm(f => ({ ...f, compteur_km: e.target.value }))} /></label>
            <label className="field" style={{ width: 110 }}>Litres *<input type="number" min="0" step="0.01" value={form.litres} onChange={e => setForm(f => ({ ...f, litres: e.target.value }))} required /></label>
            <label className="field" style={{ width: 120 }}>Prix / litre<input type="number" min="0" step="0.01" value={form.prix_unitaire} onChange={e => setForm(f => ({ ...f, prix_unitaire: e.target.value }))} /></label>
            <label className="field" style={{ width: 130 }}>Montant (GNF)<input type="number" min="0" step="0.01" value={form.montant} placeholder={montantApercu != null ? gnf(montantApercu) : ''} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} /></label>
            <label className="field" style={{ width: 140 }}>Station<input value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} /></label>
            <label className="field" style={{ width: 140 }}>Mode de paiement
              <select value={form.mode_paiement} onChange={e => setForm(f => ({ ...f, mode_paiement: e.target.value }))}>
                <option value="">—</option><option value="especes">Espèces</option><option value="carte">Carte</option><option value="bon">Bon</option>
              </select>
            </label>
            <label className="field" style={{ width: 130 }}>N° bon / carte<input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></label>
            <label style={{ alignSelf: 'flex-end', paddingBottom: 6, display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.plein_complet} onChange={e => setForm(f => ({ ...f, plein_complet: e.target.checked }))} /> Plein complet
            </label>
            <label className="field" style={{ flex: 1, minWidth: 220 }}>Commentaire<input value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} /></label>
            {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
            <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : (editingId ? 'Enregistrer' : 'Ajouter')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>Annuler</button>
            </div>
          </form>
        </Modal>
      )}

      {anoFor && <AnomalieModal row={anoFor} onClose={() => setAnoFor(null)} onSave={saveAno} />}
    </div>
  );
}

// Modale de traitement d'une anomalie : statut + note.
function AnomalieModal({ row, onClose, onSave }) {
  const [statut, setStatut] = useState(row.statut_anomalie === 'ras' ? 'a_verifier' : row.statut_anomalie);
  const [note, setNote] = useState(row.anomalie_note || '');
  return (
    <Modal title="Traiter l'anomalie" onClose={onClose}>
      <p style={{ margin: '0 0 8px', fontSize: 13 }}><strong>{row.vehicle_immat}</strong> · {d10(row.date_plein)}</p>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--status-red-fg)' }}>{row.anomalies.map(a => ANO_LABEL[a] || a).join(', ')}</p>
      <label className="field" style={{ display: 'block', marginBottom: 10 }}>Décision
        <select value={statut} onChange={e => setStatut(e.target.value)}>
          <option value="a_verifier">À vérifier</option>
          <option value="justifie">Justifié (écart expliqué)</option>
          <option value="fraude">Fraude confirmée</option>
          <option value="ras">Annuler (RAS)</option>
        </select>
      </label>
      <label className="field" style={{ display: 'block', marginBottom: 12 }}>Note
        <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%' }} placeholder="Justification / décision…" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={() => onSave(statut, note)}>Enregistrer</button>
        <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
      </div>
    </Modal>
  );
}
