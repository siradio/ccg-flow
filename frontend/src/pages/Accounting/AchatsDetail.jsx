import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ComptaSubnav, { ProcessingBadge } from './ComptaSubnav.jsx';
import { StatusBadge } from '../PurchaseRequests/statusLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

async function openAuthenticatedFile(path) {
  const res = await client.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));

export default function AchatsDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canProcess = hasSubModuleLevel(user, 'comptabilite.achats', 'edition');
  const [bdc, setBdc] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const tookOver = useRef(false);

  const load = () => client.get(`/accounting/purchase-orders/${id}`).then(r => { setBdc(r.data); return r.data; });
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const dtfmt = (d) => (d ? new Date(d).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');

  useEffect(() => {
    let cancelled = false;
    setError(''); setNotice(''); tookOver.current = false;
    client.get(`/accounting/purchase-orders/${id}`).then(async r => {
      if (cancelled) return;
      setBdc(r.data);
      // L'ouverture depuis la file vaut prise en charge (si non traité et droit de traitement).
      if (r.data.processing_status === 'NOT_PROCESSED' && canProcess && !tookOver.current) {
        tookOver.current = true;
        try { await client.post(`/accounting/purchase-orders/${id}/take`); if (!cancelled) await load(); }
        catch (e) {
          if (!cancelled && e.response?.status === 409) { setNotice(e.response.data.error); await load(); }
        }
      }
    }).catch(e => { if (!cancelled) setError(e.response?.data?.error || t('acc.loadError')); });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function complete() {
    setBusy(true); setError('');
    try { await client.post(`/accounting/purchase-orders/${id}/complete`); await load(); setNotice(t('acc.detail.completed')); }
    catch (e) { setError(e.response?.data?.error || t('acc.actionError')); }
    finally { setBusy(false); }
  }

  if (error && !bdc) return <div><ComptaSubnav /><div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div></div>;
  if (!bdc) return <div><ComptaSubnav /><p>{t('acc.loading')}</p></div>;

  const isMine = bdc.assigned_to === user.id;
  const canComplete = canProcess && bdc.processing_status === 'IN_PROGRESS' && isMine;
  const readOnlyByOther = bdc.processing_status === 'IN_PROGRESS' && !isMine;

  const Row = ({ label, children }) => (
    <>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span>{children}</span>
    </>
  );

  return (
    <div>
      <ComptaSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {bdc.bdc_numero} <span style={{ verticalAlign: 'middle' }}><ProcessingBadge status={bdc.processing_status} name={bdc.processing_status === 'PROCESSED' ? bdc.processed_nom : bdc.assigned_nom} /></span>
        </h1>
        <Link to="/comptabilite/traitement/achats" className="btn btn-secondary btn-sm">{t('acc.detail.back')}</Link>
      </div>

      {notice && <div className="alert alert-success" style={{ maxWidth: 720, marginTop: 12 }}>{notice}</div>}
      {readOnlyByOther && <div className="alert alert-danger" style={{ maxWidth: 720, marginTop: 12 }}>{t('acc.detail.lockedBy', { name: bdc.assigned_nom || '—' })}</div>}
      {error && <div className="alert alert-danger" style={{ maxWidth: 720, marginTop: 12 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 760, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('acc.detail.docTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', fontSize: 14 }}>
          <Row label={t('acc.th.da')}>{bdc.da_numero}</Row>
          <Row label={t('acc.detail.daDate')}>{dfmt(bdc.da_date)}</Row>
          <Row label={t('acc.th.bdcDate')}>{dfmt(bdc.generated_at)}</Row>
          <Row label={t('acc.th.entity')}>{bdc.entity_nom} ({bdc.entity_code}){bdc.business_unit_nom ? ` · ${bdc.business_unit_nom}` : ''}</Row>
          <Row label={t('acc.th.requester')}>{bdc.demandeur || '—'}{bdc.departement ? ` · ${bdc.departement}` : ''}</Row>
          <Row label={t('acc.th.supplier')}>{bdc.fournisseur || '—'}</Row>
          <Row label={t('acc.detail.object')}>{bdc.objet || '—'}</Row>
          <Row label={t('acc.th.amount')}><strong>{money(bdc.montant)} {bdc.devise}</strong></Row>
          {bdc.mode_paiement && <Row label={t('acc.detail.payMode')}>{bdc.mode_paiement}</Row>}
          <Row label={t('acc.detail.reception')}>{bdc.receptionnee ? t('acc.detail.received') : t('acc.detail.notReceived')}</Row>
          <Row label={t('acc.th.daStatus')}><StatusBadge status={bdc.da_status} /></Row>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openAuthenticatedFile(`/accounting/purchase-orders/${id}/pdf`)}>{t('acc.detail.viewPdf')}</button>
        </div>
      </section>

      <section className="card" style={{ maxWidth: 760, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('acc.detail.processingTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', fontSize: 14 }}>
          <Row label={t('acc.detail.status')}><ProcessingBadge status={bdc.processing_status} /></Row>
          <Row label={t('acc.detail.assignedTo')}>{bdc.assigned_nom || '—'}</Row>
          <Row label={t('acc.detail.startedAt')}>{dtfmt(bdc.processing_started_at)}</Row>
          {bdc.processing_status === 'PROCESSED' && <>
            <Row label={t('acc.detail.processedBy')}>{bdc.processed_nom || '—'}</Row>
            <Row label={t('acc.detail.processedAt')}>{dtfmt(bdc.processed_at)}</Row>
          </>}
        </div>
        {canComplete && (
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy} onClick={complete}>{busy ? t('common.saving') : t('acc.detail.markProcessed')}</button>
          </div>
        )}
        {bdc.processing_status === 'NOT_PROCESSED' && !canProcess && (
          <p style={{ color: 'var(--color-text-muted)', margin: '12px 0 0' }}>{t('acc.detail.noProcessRight')}</p>
        )}
      </section>
    </div>
  );
}
