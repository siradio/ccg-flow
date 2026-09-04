import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import RhSubnav from './RhSubnav';
import { RhStatusBadge, RH_TYPE_LABELS } from './rhStatus.jsx';
import { useI18n } from '../../i18n/I18nContext';

const CHAIN = ['responsable', 'rh'];

export default function DemandeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  function load() { return client.get(`/rh/demandes/${id}`).then(res => setR(res.data)).catch(e => setError(e.response?.data?.error || t('rh.loadError'))); }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dfmt = (d) => d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—';
  const dtfmt = (d) => d ? new Date(d).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') : '—';

  async function act(path, body) {
    setBusy(true); setError('');
    try { await client.post(`/rh/requests/${id}/${path}`, body || {}); setComment(''); await load(); }
    catch (e) { setError(e.response?.data?.error || t('rh.actionError')); }
    finally { setBusy(false); }
  }
  async function openAtt(attId) {
    try { const res = await client.get(`/rh/attachments/${attId}`, { responseType: 'blob' }); const url = URL.createObjectURL(res.data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch { setError(t('rh.openError')); }
  }
  async function addAtt(f) {
    if (!f) return; setBusy(true); setError('');
    try { const fd = new FormData(); fd.append('file', f); await client.post(`/rh/requests/${id}/attachments`, fd); await load(); }
    catch (e) { setError(e.response?.data?.error || t('rh.uploadError')); }
    finally { setBusy(false); }
  }

  if (error && !r) return <div><RhSubnav /><div className="alert alert-danger">{error}</div></div>;
  if (!r) return <div><RhSubnav /><p>{t('rh.loading')}</p></div>;

  const isOwner = r.created_by === user.id;
  const canValidate = r.statut === 'en_validation' && r.current_role
    && (user.roles || []).some(role => role.role_code === r.current_role && Number(role.entity_id) === Number(r.entity_id));
  const empName = `${r.employee_prenom || ''} ${r.employee_nom || ''}`.trim();

  return (
    <div>
      <RhSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {r.numero || `#${r.id}`} <span style={{ verticalAlign: 'middle' }}><RhStatusBadge statut={r.statut} /></span>
        </h1>
        <Link to="/rh/mes-demandes" className="btn btn-secondary btn-sm">{t('rh.backToList')}</Link>
      </div>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', fontSize: 14 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('rh.th.type')}</span><span style={{ fontWeight: 600 }}>{r.type_libelle || t(RH_TYPE_LABELS[r.type])}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('rh.th.employee')}</span><span style={{ fontWeight: 600 }}>{empName} {r.employee_matricule ? `(${r.employee_matricule})` : ''}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('rh.f.dept')}</span><span>{r.employee_departement || '—'} · {r.entity_code}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('rh.th.period')}</span><span style={{ fontWeight: 600 }}>{dfmt(r.date_debut)} → {dfmt(r.date_fin)} ({r.jours ?? '—'} {t('rh.daysUnit')})</span>
          {r.motif && <><span style={{ color: 'var(--color-text-muted)' }}>{t('rh.absence.motif')}</span><span>{r.motif}</span></>}
          {r.commentaire && <><span style={{ color: 'var(--color-text-muted)' }}>{t('rh.absence.comment')}</span><span>{r.commentaire}</span></>}
        </div>
      </section>

      <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('rh.attachments')}</h2>
        {r.attachments.length === 0 && <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>{t('rh.noAttachment')}</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {r.attachments.map(a => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <button className="link-button" onClick={() => openAtt(a.id)}>{a.filename}</button>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{Math.round((a.taille || 0) / 1024)} Ko</span>
            </li>
          ))}
        </ul>
        {isOwner && r.statut !== 'annulee' && (
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginTop: 8 }}>
            {t('rh.addAttachment')}
            <input type="file" accept=".pdf,image/png,image/jpeg" style={{ display: 'none' }} onChange={e => addAtt(e.target.files?.[0])} />
          </label>
        )}
      </section>

      {(canValidate || isOwner) && (
        <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('rh.actions')}</h2>
          {(canValidate || (isOwner && ['brouillon', 'en_validation'].includes(r.statut))) && (
            <textarea placeholder={t('rh.commentPlaceholder')} value={comment} onChange={e => setComment(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isOwner && r.statut === 'brouillon' && <button className="btn btn-primary" disabled={busy} onClick={() => act('submit')}>{t('rh.submit')}</button>}
            {canValidate && <button className="btn btn-primary" disabled={busy} onClick={() => act('validate', { comment })}>{t('rh.validate')}</button>}
            {canValidate && <button className="btn btn-danger" disabled={busy} onClick={() => act('reject', { comment })}>{t('rh.reject')}</button>}
            {isOwner && ['brouillon', 'en_validation'].includes(r.statut) && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => act('cancel', { comment })}>{t('rh.cancel')}</button>}
          </div>
        </section>
      )}

      <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('rh.history')}</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {r.history.map(h => (
            <li key={h.id} style={{ fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{dtfmt(h.created_at)}</span> — <strong>{t('rh.action.' + h.action, h.action)}</strong>
              {h.user_nom && ` · ${h.user_prenom} ${h.user_nom}`}{h.commentaire && ` : "${h.commentaire}"`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
