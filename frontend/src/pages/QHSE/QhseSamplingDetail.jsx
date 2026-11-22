import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Détail d'une session d'échantillonnage : rappel du plan (n/c/m/M) + grille des prélèvements
// Début / Milieu / Fin. Clôture (verrou) réservée au niveau édition.
export default function QhseSamplingDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.sampling', 'edition');
  const [s, setS] = useState(null);
  const [types, setTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => { setS(d); setRows((d.items || []).map(x => ({ ...x }))); };
  useEffect(() => {
    client.get(`/qhse/samplings/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/qhse/referentials/sampling-types').then(r => setTypes(r.data)).catch(() => {});
  }, [id]);

  const locked = s?.statut === 'cloture';
  const setRow = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows(rs => [...rs, { sampling_type_id: types[0]?.id || '', heure: '', numero_echantillon: '', observation: '' }]);
  const delRow = i => setRows(rs => rs.filter((_, j) => j !== i));

  async function save() {
    setMsg(''); setErr('');
    try {
      const payload = { items: rows.map(r => ({ sampling_type_id: r.sampling_type_id, heure: r.heure, numero_echantillon: r.numero_echantillon, sample_id: r.sample_id, observation: r.observation })) };
      const r = await client.put(`/qhse/samplings/${id}/items`, payload); apply(r.data); setMsg(t('qhse.ana.saved'));
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }
  async function close() {
    setMsg(''); setErr('');
    try { const r = await client.post(`/qhse/samplings/${id}/close`); apply(r.data); setMsg(t('qhse.samp.closed')); }
    catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }

  if (!s) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  const hasPlan = s.plan_id != null;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{s.numero} · {s.product_nom || ''}</h1>
      <div className="card" style={{ maxWidth: 680, marginBottom: 14 }}>
        <div className="kv"><b>{t('qhse.samp.date')}</b><span>{s.date_prelevement || '—'}</span></div>
        <div className="kv"><b>{t('qhse.ana.product')}</b><span>{s.product_nom || '—'}{s.format_libelle ? ` · ${s.format_libelle}` : ''}</span></div>
        <div className="kv"><b>{t('qhse.prod.ligne')}</b><span>{s.ligne_libelle || '—'}</span></div>
        <div className="kv"><b>{t('qhse.ana.lot')}</b><span>{s.numero_lot || '—'}</span></div>
        <div className="kv"><b>{t('qhse.samp.plan')}</b>
          <span>{s.plan_libelle || '—'}{hasPlan ? ` · n=${s.taille_n ?? '—'} c=${s.acceptation_c ?? '—'} m=${s.seuil_m ?? '—'} M=${s.seuil_grand_m ?? '—'}` : ''}</span></div>
        <div className="kv"><b>{t('qhse.ana.statut')}</b><span>{t('qhse.status.' + s.statut)}</span></div>
      </div>

      {err && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{err}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.samp.moment')}</th><th>{t('qhse.prod.heure')}</th><th>{t('qhse.samp.echNum')}</th><th>{t('qhse.samp.labo')}</th><th>{t('qhse.ana.obs')}</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <select value={r.sampling_type_id || ''} disabled={locked} onChange={e => setRow(i, 'sampling_type_id', e.target.value)}>
                    <option value="">—</option>{types.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                  </select>
                </td>
                <td><input style={{ width: 70 }} value={r.heure || ''} disabled={locked} placeholder="08:00" onChange={e => setRow(i, 'heure', e.target.value)} /></td>
                <td><input style={{ width: 130 }} value={r.numero_echantillon || ''} disabled={locked} onChange={e => setRow(i, 'numero_echantillon', e.target.value)} /></td>
                <td>{r.sample_numero || '—'}</td>
                <td><input value={r.observation || ''} disabled={locked} onChange={e => setRow(i, 'observation', e.target.value)} /></td>
                <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => delRow(i)}>✕</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="empty-row">{t('qhse.samp.noItem')}</td></tr>}
          </tbody>
        </table>
      </div>
      {!locked && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addRow}>+ {t('qhse.samp.addItem')}</button>}

      {msg && <div className="alert" style={{ marginTop: 10, maxWidth: 680 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {!locked && <button className="btn btn-primary" onClick={save}>{t('qhse.ana.save')}</button>}
        {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.samp.close')}</button>}
      </div>
      <p style={{ marginTop: 14 }}><Link to="/qhse/echantillonnage">← {t('qhse.samp.backList')}</Link></p>
    </div>
  );
}
