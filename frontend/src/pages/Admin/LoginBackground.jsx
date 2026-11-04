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

  // Apparence de la connexion. tk = bandeau (messages un par ligne, période du/au). variant = fond.
  const [tk, setTk] = useState({ enabled: false, messages: '', speed: 'normal', from: '', to: '' });
  const [tkSaved, setTkSaved] = useState(false);
  const [variant, setVariant] = useState('combine');
  const [variantSaved, setVariantSaved] = useState(false);

  function load() {
    client.get('/login-backgrounds')
      .then(res => setItems(res.data))
      .catch(() => setError(t('adm.common.loading')));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    client.get('/login-backgrounds/ticker')
      .then(res => applyAppearance(res.data))
      .catch(() => {});
  }, []);

  function applyAppearance(d) {
    setTk({ enabled: !!d.enabled, messages: (d.messages || []).join('\n'), speed: d.speed || 'normal', from: d.from || '', to: d.to || '' });
    setVariant(d.variant || 'combine');
  }

  async function saveTicker() {
    setTkSaved(false);
    const messages = tk.messages.split('\n').map(s => s.trim()).filter(Boolean);
    const res = await client.put('/login-backgrounds/ticker', { enabled: tk.enabled, messages, speed: tk.speed, from: tk.from, to: tk.to });
    applyAppearance(res.data);
    setTkSaved(true);
  }

  async function saveVariant() {
    setVariantSaved(false);
    const res = await client.put('/login-backgrounds/ticker', { variant });
    applyAppearance(res.data);
    setVariantSaved(true);
  }

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

      {/* Bandeau d'informations défilant de la page de connexion. */}
      <section className="card" style={{ maxWidth: 680, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>{t('adm.loginBg.ticker.title')}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>{t('adm.loginBg.ticker.intro')}</p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 12 }}>
          <input type="checkbox" checked={tk.enabled} onChange={e => { setTk(s => ({ ...s, enabled: e.target.checked })); setTkSaved(false); }} />
          {t('adm.loginBg.ticker.enabled')}
        </label>
        <label className="field">
          {t('adm.loginBg.ticker.messages')}
          <textarea rows={4} value={tk.messages} onChange={e => { setTk(s => ({ ...s, messages: e.target.value })); setTkSaved(false); }}
            placeholder={t('adm.loginBg.ticker.messagesPlaceholder')} />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{t('adm.loginBg.ticker.messagesHint')}</span>
        </label>
        <label className="field" style={{ marginTop: 10, maxWidth: 220 }}>
          {t('adm.loginBg.ticker.speed')}
          <select value={tk.speed} onChange={e => { setTk(s => ({ ...s, speed: e.target.value })); setTkSaved(false); }}>
            <option value="slow">{t('adm.loginBg.ticker.slow')}</option>
            <option value="normal">{t('adm.loginBg.ticker.normal')}</option>
            <option value="fast">{t('adm.loginBg.ticker.fast')}</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <label className="field" style={{ flex: '1 1 160px' }}>
            {t('adm.loginBg.ticker.from')}
            <input type="date" value={tk.from} onChange={e => { setTk(s => ({ ...s, from: e.target.value })); setTkSaved(false); }} />
          </label>
          <label className="field" style={{ flex: '1 1 160px' }}>
            {t('adm.loginBg.ticker.to')}
            <input type="date" value={tk.to} min={tk.from || undefined} onChange={e => { setTk(s => ({ ...s, to: e.target.value })); setTkSaved(false); }} />
          </label>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginTop: 4 }}>{t('adm.loginBg.ticker.periodHint')}</span>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveTicker}>{t('adm.loginBg.save')}</button>
          {tkSaved && <span style={{ color: 'var(--color-success-fg, #128a54)', fontSize: 13 }}>{t('adm.common.savedShort')}</span>}
        </div>
      </section>

      {/* Variante d'animation du fond de la page de connexion. */}
      <section className="card" style={{ maxWidth: 680, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>{t('adm.loginBg.anim.title')}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>{t('adm.loginBg.anim.intro')}</p>
        <label className="field" style={{ maxWidth: 260 }}>
          {t('adm.loginBg.anim.variant')}
          <select value={variant} onChange={e => { setVariant(e.target.value); setVariantSaved(false); }}>
            <option value="reseau">{t('adm.loginBg.anim.reseau')}</option>
            <option value="aurore">{t('adm.loginBg.anim.aurore')}</option>
            <option value="combine">{t('adm.loginBg.anim.combine')}</option>
          </select>
        </label>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveVariant}>{t('adm.loginBg.save')}</button>
          {variantSaved && <span style={{ color: 'var(--color-success-fg, #128a54)', fontSize: 13 }}>{t('adm.common.savedShort')}</span>}
        </div>
      </section>

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
