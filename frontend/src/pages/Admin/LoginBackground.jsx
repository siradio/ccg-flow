import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';

// Aperçu d'une image servie par un endpoint authentifié : on télécharge les octets avec le
// token (impossible via <img src> direct) puis on crée une URL objet locale. Même approche que
// les vignettes des référentiels.
function AuthImage({ src, alt, style }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoke = null;
    client.get(src, { responseType: 'blob' })
      .then(res => { const u = URL.createObjectURL(res.data); revoke = u; setUrl(u); })
      .catch(() => setUrl(null));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [src]);
  if (!url) return null;
  return <img src={url} alt={alt} style={style} />;
}

export default function LoginBackground() {
  const { t } = useI18n();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [nom, setNom] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputs = useRef({});

  function load() {
    client.get('/login-backgrounds')
      .then(res => setItems(res.data))
      .catch(() => setError(t('adm.common.loading')));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault();
    if (!nom.trim()) return;
    setBusy(true);
    try {
      await client.post('/login-backgrounds', { nom, message });
      setNom(''); setMessage('');
      load();
    } finally { setBusy(false); }
  }

  async function saveRow(it) {
    await client.put(`/login-backgrounds/${it.id}`, { nom: it.nom, message: it.message || '' });
    load();
  }

  async function toggleActive(it) {
    setError('');
    if (!it.actif && !it.has_image && !(it.message || '').trim()) { setError(t('adm.loginBg.activeNeedsContent')); return; }
    await client.put(`/login-backgrounds/${it.id}/active`, { actif: !it.actif });
    load();
  }

  async function uploadImage(it, file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await client.put(`/login-backgrounds/${it.id}/image`, fd);
    load();
  }

  async function remove(it) {
    if (!window.confirm(t('adm.loginBg.confirmDelete'))) return;
    await client.delete(`/login-backgrounds/${it.id}`);
    load();
  }

  function patch(id, field, value) {
    setItems(list => list.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  if (items === null && !error) return <p>{t('adm.common.loading')}</p>;

  return (
    <div>
      <h1 className="page-title">{t('adm.loginBg.title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 680, marginTop: 0 }}>
        {t('adm.loginBg.intro')}
      </p>
      {error && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 680, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>{t('adm.loginBg.addTitle')}</h2>
        <form onSubmit={add} className="form-grid" style={{ maxWidth: 'none' }}>
          <label className="field">
            {t('adm.loginBg.name')}
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder={t('adm.loginBg.namePlaceholder')} required />
          </label>
          <label className="field">
            {t('adm.loginBg.message')}
            <input value={message} onChange={e => setMessage(e.target.value)} placeholder={t('adm.loginBg.messagePlaceholder')} />
          </label>
          <button type="submit" disabled={busy || !nom.trim()} className="btn btn-primary btn-sm" style={{ justifySelf: 'start' }}>
            {t('adm.loginBg.add')}
          </button>
        </form>
      </section>

      <h2 style={{ fontSize: 16 }}>{t('adm.loginBg.list')}</h2>
      {items && items.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>{t('adm.loginBg.empty')}</p>}

      <div style={{ display: 'grid', gap: 14 }}>
        {(items || []).map(it => (
          <section key={it.id} className="card" style={{ maxWidth: 680, borderColor: it.actif ? 'var(--color-primary)' : undefined }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ width: 160, flexShrink: 0 }}>
                {it.has_image ? (
                  <AuthImage src={`/login-backgrounds/${it.id}/image`} alt={it.nom}
                    style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                ) : (
                  <div style={{ width: '100%', height: 90, borderRadius: 8, border: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {t('adm.loginBg.noImage')}
                  </div>
                )}
                <input
                  ref={el => { fileInputs.current[it.id] = el; }}
                  type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                  onChange={e => { uploadImage(it, e.target.files[0]); e.target.value = ''; }}
                />
                <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }}
                  onClick={() => fileInputs.current[it.id]?.click()}>
                  {it.has_image ? t('adm.loginBg.replaceImage') : t('adm.loginBg.chooseImage')}
                </button>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>{t('adm.loginBg.imageHint')}</div>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {it.actif && (
                    <span className="badge" style={{ background: 'var(--color-success, #128a54)', color: '#fff' }}>
                      {t('adm.loginBg.active')}
                    </span>
                  )}
                </div>
                <label className="field">
                  {t('adm.loginBg.name')}
                  <input value={it.nom} onChange={e => patch(it.id, 'nom', e.target.value)} />
                </label>
                <label className="field" style={{ marginTop: 8 }}>
                  {t('adm.loginBg.message')}
                  <input value={it.message || ''} onChange={e => patch(it.id, 'message', e.target.value)} placeholder={t('adm.loginBg.messagePlaceholder')} />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveRow(it)}>{t('adm.loginBg.save')}</button>
                  <button type="button" className={`btn btn-sm ${it.actif ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleActive(it)}>
                    {it.actif ? t('adm.loginBg.deactivate') : t('adm.loginBg.activate')}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(it)}>{t('adm.loginBg.delete')}</button>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
