import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Défini au niveau module (identité stable) : sinon React remonte l'<input> à chaque frappe → perte du focus.
const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>{label}{children}</label>);

// Espace salarié — formulaire volontairement simple pour déclarer un incident / une demande IT.
export default function SignalerIncident() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [cats, setCats] = useState([]);
  const [myEq, setMyEq] = useState([]);
  const [f, setF] = useState({ category_id: '', objet: '', description: '', impact: '', equipment_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    client.get('/dsi/referentials/ticket-categories').then(r => setCats(r.data)).catch(() => {});
    client.get('/dsi/equipment/mine').then(r => setMyEq(r.data.map(e => ({ id: e.id, nom: `${e.numero_inventaire} — ${e.designation}` })))).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!f.objet.trim()) { setError(t('dsi.tk.objetRequired')); return; }
    setBusy(true); setError('');
    try {
      const r = await client.post('/dsi/my/tickets', f);
      nav(`/dsi/mes-tickets/${r.data.id}`);
    } catch (e2) { setError(e2.response?.data?.error || 'Erreur.'); setBusy(false); }
  }

  return (
    <div>
      <DsiSubnav />
      <h1 className="page-title" style={{ marginBottom: 6 }}>{t('dsi.report.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 14 }}>{t('dsi.report.subtitle')}</p>
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <Field label={t('dsi.tk.categorie')}>
            <select value={f.category_id} onChange={e => set('category_id', e.target.value)}>
              <option value="">—</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select>
          </Field>
          <Field label={t('dsi.tk.objet') + ' *'}><input value={f.objet} onChange={e => set('objet', e.target.value)} required placeholder={t('dsi.report.objetPlaceholder')} /></Field>
          <Field label={t('dsi.tk.description')}><textarea rows={4} value={f.description} onChange={e => set('description', e.target.value)} placeholder={t('dsi.report.descPlaceholder')} /></Field>
          <Field label={t('dsi.tk.impact')}>
            <select value={f.impact} onChange={e => set('impact', e.target.value)}>
              <option value="">—</option>
              <option value="bloquant">{t('dsi.impact.blocking')}</option>
              <option value="gene">{t('dsi.impact.hindrance')}</option>
              <option value="mineur">{t('dsi.impact.minor')}</option>
            </select>
          </Field>
          {myEq.length > 0 && (
            <Field label={t('dsi.report.equipConcerned')}>
              <SearchableSelect value={f.equipment_id} onChange={v => set('equipment_id', v ?? '')} options={myEq} getLabel={o => o.nom} placeholder="—" />
            </Field>
          )}
          {error && <div className="alert alert-danger">{error}</div>}
          <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : t('dsi.report.submit')}</button></div>
        </form>
      </div>
    </div>
  );
}
