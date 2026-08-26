import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const dfmt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const STATUT_COLOR = { brouillon: '#6b7280', soumis: '#b45309', valide: '#128a54', rejete: '#dc2626', annule: '#6b7280' };

export default function VersementDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const statutLabel = (s) => t('com.statut.' + s);
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canAdd = hasSubModuleLevel(user, 'commerce.versements', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'commerce.versements', 'edition');

  function load() { client.get(`/commerce/versements/${id}`).then(r => setV(r.data)).catch(() => setError(t('com.det.notFound'))); }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path, body) {
    setBusy(true); setError('');
    try { await client.post(`/commerce/versements/${id}/${path}`, body || {}); load(); }
    catch (e) { setError(e.response?.data?.error || t('com.det.actionError')); }
    finally { setBusy(false); }
  }

  async function uploadJustif(file) {
    if (!file) return;
    setBusy(true); setError('');
    try { const fd = new FormData(); fd.append('file', file); await client.post(`/commerce/versements/${id}/attachments`, fd); load(); }
    catch (e) { setError(e.response?.data?.error || t('com.det.uploadError')); }
    finally { setBusy(false); }
  }

  async function openJustif(attId, filename) {
    try {
      const res = await client.get(`/commerce/versements/attachments/${attId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError(t('com.det.openError')); }
  }

  async function delJustif(attId) {
    if (!window.confirm(t('com.det.confirmDeleteAtt'))) return;
    try { await client.delete(`/commerce/versements/attachments/${attId}`); load(); }
    catch (e) { setError(e.response?.data?.error || t('com.det.deleteError')); }
  }

  if (error && !v) return <div><CommerceSubnav /><div className="alert alert-danger">{error}</div></div>;
  if (!v) return <div><CommerceSubnav /><p>{t('com.det.loading')}</p></div>;

  const locked = ['valide', 'annule'].includes(v.status);
  const editable = !locked && (canEdit || canAdd);

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {t('com.det.versement', { ref: v.reference })}{' '}
          <span className="badge" style={{ background: STATUT_COLOR[v.status], color: '#fff', verticalAlign: 'middle' }}>{statutLabel(v.status)}</span>
        </h1>
        <Link to="/commerce/versements" className="btn btn-secondary btn-sm">{t('com.det.backToList')}</Link>
      </div>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', fontSize: 14 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.date')}</span><span style={{ fontWeight: 600 }}>{dfmt(v.payment_date)}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.commercial')}</span><span style={{ fontWeight: 600 }}>{v.commercial_code} — {v.commercial_prenom || ''} {v.commercial_nom || ''}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.bu')}</span><span style={{ fontWeight: 600 }}>{v.business_unit_nom || '—'}</span>
          {v.product_nom && <><span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.product')}</span><span style={{ fontWeight: 600 }}>{v.product_nom}</span></>}
          {v.reference_generale && <><span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.reference')}</span><span>{v.reference_generale}</span></>}
          {v.commentaire && <><span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.comment')}</span><span>{v.commentaire}</span></>}
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.createdBy')}</span><span>{v.cree_par || '—'}</span>
          {v.valide_par && <><span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.validatedBy')}</span><span>{v.valide_par}</span></>}
          {v.motif && <><span style={{ color: 'var(--color-text-muted)' }}>{t('com.det.motif')}</span><span>{v.motif}</span></>}
        </div>
      </section>

      <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('com.det.methods')}</h2>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>{t('com.det.thMethod')}</th><th>{t('com.det.thBank')}</th><th>{t('com.det.thReference')}</th><th style={{ textAlign: 'right' }}>{t('com.det.thAmount')}</th></tr></thead>
          <tbody>
            {v.lines.map(l => (
              <tr key={l.id}>
                <td>{l.method_libelle}</td><td>{l.bank_nom || '—'}</td><td>{l.transaction_reference || '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3} style={{ fontWeight: 700 }}>{t('com.det.total')}</td><td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(v.total_amount)}</td></tr></tfoot>
        </table>
      </section>

      <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('com.det.attachments')}</h2>
        {v.attachments.length === 0 && <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>{t('com.det.noAttachment')}</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {v.attachments.map(a => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
              <button className="link-button" onClick={() => openJustif(a.id, a.filename)}>{a.filename}</button>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{Math.round((a.taille || 0) / 1024)} {t('com.det.kb')}</span>
              {canEdit && v.status !== 'annule' && <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => delJustif(a.id)}>{t('com.det.delete')}</button>}
            </li>
          ))}
        </ul>
        {canAdd && v.status !== 'annule' && (
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginTop: 10 }}>
            {t('com.det.addAttachment')}
            <input type="file" accept=".pdf,image/png,image/jpeg" style={{ display: 'none' }} onChange={e => uploadJustif(e.target.files?.[0])} />
          </label>
        )}
      </section>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {editable && <Link to={`/commerce/versements/${id}/edit`} className="btn btn-secondary">{t('com.det.modify')}</Link>}
        {canAdd && ['brouillon', 'rejete'].includes(v.status) && <button className="btn btn-primary" disabled={busy} onClick={() => act('submit')}>{t('com.det.submit')}</button>}
        {canEdit && v.status === 'soumis' && <button className="btn btn-primary" disabled={busy} onClick={() => act('validate')}>{t('com.det.validate')}</button>}
        {canEdit && v.status === 'soumis' && <button className="btn btn-danger" disabled={busy} onClick={() => { const m = window.prompt(t('com.det.rejectPrompt')); if (m !== null) act('reject', { motif: m }); }}>{t('com.det.reject')}</button>}
        {canEdit && !['annule'].includes(v.status) && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => { const m = window.prompt(t('com.det.cancelPrompt')); if (m !== null) act('cancel', { motif: m }); }}>{t('com.det.cancel')}</button>}
      </div>
    </div>
  );
}
