import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { ConfBadge } from './qhseConformite';
import QhseMicroForm from './QhseMicroForm';

const FLAGS = ['numerique', 'non_detecte', 'inf_ld', 'inf_lq', 'invalide', 'en_attente'];

async function openAuthenticatedFile(path) {
  const res = await client.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Grille de saisie des résultats d'une analyse + verdict de conformité + validation.
// Séparation saisie / validation : la validation requiert l'habilitation (niveau édition).
export default function QhseAnalyseDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canValidate = hasSubModuleLevel(user, 'qhse.labo', 'edition');
  const [a, setA] = useState(null);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => { setA(d); setRows(d.results.map(x => ({ ...x }))); };
  useEffect(() => { client.get(`/qhse/analyses/${id}`).then(r => apply(r.data)).catch(() => {}); }, [id]);
  const setRow = (pid, k, v) => setRows(rs => rs.map(r => (r.parameter_id === pid ? { ...r, [k]: v } : r)));
  const locked = a?.statut === 'valide';

  async function save() {
    setMsg(''); setErr('');
    try {
      const payload = { results: rows.map(r => ({ parameter_id: r.parameter_id, valeur_num: r.valeur_num, valeur_text: r.valeur_text, result_flag: r.result_flag, observation: r.observation })) };
      const r = await client.put(`/qhse/analyses/${id}/results`, payload); apply(r.data); setMsg(t('qhse.ana.saved'));
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }
  async function validate() {
    setMsg(''); setErr('');
    try { const r = await client.post(`/qhse/analyses/${id}/validate`); apply(r.data); setMsg(t('qhse.ana.validated')); }
    catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }

  if (!a) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{a.sample?.numero} · {a.type_libelle}</h1>
      <div style={{ marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{t('qhse.ana.verdict')} : <ConfBadge value={a.conformite} t={t} /></span>
        <span className="muted">{t('qhse.status.' + a.statut)}</span>
      </div>

      {err && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{err}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.ana.param')}</th><th>{t('qhse.ana.value')}</th><th>{t('qhse.ana.flag')}</th><th>{t('qhse.ana.conf')}</th><th>{t('qhse.ana.obs')}</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.parameter_id}>
                <td>{r.param_libelle}{r.unite ? ` (${r.unite})` : ''}</td>
                <td>
                  {r.type_resultat === 'numerique'
                    ? <input type="number" step="any" style={{ width: 120 }} value={r.valeur_num ?? ''} disabled={locked || r.result_flag !== 'numerique'} onChange={e => setRow(r.parameter_id, 'valeur_num', e.target.value)} />
                    : <input value={r.valeur_text ?? ''} disabled={locked} onChange={e => setRow(r.parameter_id, 'valeur_text', e.target.value)} />}
                </td>
                <td>
                  <select value={r.result_flag} disabled={locked} onChange={e => setRow(r.parameter_id, 'result_flag', e.target.value)}>
                    {FLAGS.map(x => <option key={x} value={x}>{t('qhse.flag.' + x)}</option>)}
                  </select>
                </td>
                <td><ConfBadge value={r.conformite} t={t} /></td>
                <td><input value={r.observation ?? ''} disabled={locked} onChange={e => setRow(r.parameter_id, 'observation', e.target.value)} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="empty-row">{t('qhse.ana.noParam')}</td></tr>}
          </tbody>
        </table>
      </div>

      {a.type_code === 'microbiologique' && <QhseMicroForm analysisId={id} locked={locked} />}

      {msg && <div className="alert" style={{ marginTop: 10, maxWidth: 680 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {!locked && <button className="btn btn-primary" onClick={save}>{t('qhse.ana.save')}</button>}
        {!locked && canValidate && <button className="btn btn-secondary" onClick={validate}>{t('qhse.ana.validate')}</button>}
        <button className="btn btn-secondary" onClick={() => openAuthenticatedFile(`/qhse/analyses/${id}/pdf`)}>{t('qhse.ana.pdf')}</button>
      </div>
      <p style={{ marginTop: 14 }}><Link to={`/qhse/analyses/echantillon/${a.sample_id}`}>← {t('qhse.ana.backSample')}</Link></p>
    </div>
  );
}
