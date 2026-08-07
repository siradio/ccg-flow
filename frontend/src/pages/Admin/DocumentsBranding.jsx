import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Branding par entité (logo d'entête, signature, cachet) appliqué aux documents générés
// (demande de devis, bon de commande). Réservé au super_admin. Les libellés sont traduits à
// l'affichage (labelKey/hintKey), la clé technique (key) ne change pas.
const KINDS = [
  { key: 'logo', labelKey: 'adm.brand.kind.logo', hintKey: 'adm.brand.kind.logoHint' },
  { key: 'signature', labelKey: 'adm.brand.kind.signature', hintKey: 'adm.brand.kind.signatureHint' },
  { key: 'stamp', labelKey: 'adm.brand.kind.stamp', hintKey: 'adm.brand.kind.stampHint' },
];

// Aperçu d'une image protégée : récupérée en blob (avec le jeton), pas via <img src> direct.
function BrandingPreview({ entityId, kind, present, reloadKey }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let obj = null;
    if (!present) { setUrl(null); return; }
    client.get(`/entities/${entityId}/branding/${kind}`, { responseType: 'blob' })
      .then(res => { if (!cancelled) { obj = URL.createObjectURL(res.data); setUrl(obj); } })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; if (obj) URL.revokeObjectURL(obj); };
  }, [entityId, kind, present, reloadKey]);

  if (!present) return <span style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>{t('adm.brand.noImage')}</span>;
  if (!url) return <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>…</span>;
  return (
    <img
      src={url}
      alt={kind}
      style={{ maxHeight: 64, maxWidth: 180, objectFit: 'contain', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, padding: 4 }}
    />
  );
}

export default function DocumentsBranding() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [entities, setEntities] = useState([]);
  const [flags, setFlags] = useState({}); // { [entityId]: { logo, signature, stamp } }
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(null); // `${entityId}-${kind}` en cours
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data)).catch(() => setError(t('adm.brand.loadError')));
  }, [t]);

  useEffect(() => {
    entities.forEach(e => {
      client.get(`/entities/${e.id}/branding`).then(r => setFlags(f => ({ ...f, [e.id]: r.data }))).catch(() => {});
    });
  }, [entities, reloadKey]);

  async function upload(entityId, kind, file) {
    if (!file) return;
    setError('');
    setBusy(`${entityId}-${kind}`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await client.put(`/entities/${entityId}/branding/${kind}`, fd);
      setReloadKey(k => k + 1);
    } catch (err) {
      setError(err.response?.data?.error || t('ref.uploadFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(entityId, kind) {
    if (!(await confirm(t('adm.brand.confirmRemove'), { danger: true, confirmLabel: t('common.delete') }))) return;
    setError('');
    setBusy(`${entityId}-${kind}`);
    try {
      await client.delete(`/entities/${entityId}/branding/${kind}`);
      setReloadKey(k => k + 1);
    } catch (err) {
      setError(err.response?.data?.error || t('ref.deleteFailed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('adm.brand.title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 640, marginTop: 0 }}>
        {t('adm.brand.introPre')}<strong>{t('adm.brand.perEntity')}</strong>{t('adm.brand.introPost')}
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      {entities.map(e => (
        <section className="card" key={e.id}>
          <h2 style={{ marginTop: 0 }}>{e.nom} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 14 }}>({e.code})</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {KINDS.map(k => {
              const present = !!(flags[e.id] && flags[e.id][k.key]);
              const isBusy = busy === `${e.id}-${k.key}`;
              return (
                <div key={k.key} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t(k.labelKey)}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>{t(k.hintKey)}</div>
                  <div style={{ minHeight: 72, display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                    <BrandingPreview entityId={e.id} kind={k.key} present={present} reloadKey={reloadKey} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                      {isBusy ? '…' : (present ? t('adm.brand.replace') : t('adm.brand.upload'))}
                      <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} disabled={isBusy}
                        onChange={ev => { upload(e.id, k.key, ev.target.files[0]); ev.target.value = ''; }} />
                    </label>
                    {present && (
                      <button className="btn btn-danger-ghost btn-sm" disabled={isBusy} onClick={() => remove(e.id, k.key)}>
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
