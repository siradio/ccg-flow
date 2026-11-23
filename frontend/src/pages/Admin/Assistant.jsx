import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { MODULE_SUB_KEYS } from '../../config/modules';

// Administration de l'assistant « CCG Flow » (super_admin). Trois sections :
//  1. Personnage : nom, genre (fille/garçon/neutre), avatar (emoji), message d'accueil, activation.
//  2. Nouveautés : annonces diffusées dans le widget.
//  3. FAQ : base de connaissances interrogée par le moteur de score (sans IA).

const MODULE_OPTIONS = ['', ...Object.keys(MODULE_SUB_KEYS), 'achats', 'rh', 'liens']
  .filter((v, i, a) => a.indexOf(v) === i);
const AVATARS = ['🤖', '🧑‍💼', '👩‍💼', '👨‍💼', '🦉', '🐧', '🦊', '🌟', '💡', '🛟', '🧭', '🐥'];

function Saved({ show, t }) {
  return show ? <span style={{ color: 'var(--color-success-fg, #128a54)', fontSize: 13 }}>{t('adm.common.savedShort')}</span> : null;
}

export default function AdminAssistant() {
  const { t } = useI18n();
  const [persona, setPersona] = useState(null);
  const [personaSaved, setPersonaSaved] = useState(false);
  const [news, setNews] = useState([]);
  const [faq, setFaq] = useState([]);
  const [error, setError] = useState('');

  function loadNews() { client.get('/assistant/admin/news').then(r => setNews(r.data)).catch(() => {}); }
  function loadFaq() { client.get('/assistant/admin/faq').then(r => setFaq(r.data)).catch(() => {}); }
  useEffect(() => {
    client.get('/assistant/admin/persona').then(r => setPersona(r.data)).catch(() => setError(t('adm.common.loading')));
    loadNews();
    loadFaq();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePersona() {
    setPersonaSaved(false);
    const r = await client.put('/assistant/admin/persona', persona);
    setPersona(r.data);
    setPersonaSaved(true);
  }

  // ─── Nouveautés ───────────────────────────────────────────────────────────────
  function patchNews(id, field, value) { setNews(list => list.map(x => x.id === id ? { ...x, [field]: value } : x)); }
  async function addNews() {
    const r = await client.post('/assistant/admin/news', { titre: t('adm.assistant.news.newTitle'), contenu: '', type: 'nouveau', actif: false });
    setNews(list => [r.data, ...list]);
  }
  async function saveNews(it) { await client.put(`/assistant/admin/news/${it.id}`, it); loadNews(); }
  async function removeNews(it) {
    if (!window.confirm(t('adm.assistant.confirmDelete'))) return;
    await client.delete(`/assistant/admin/news/${it.id}`); loadNews();
  }

  // ─── FAQ ──────────────────────────────────────────────────────────────────────
  function patchFaq(id, field, value) { setFaq(list => list.map(x => x.id === id ? { ...x, [field]: value } : x)); }
  async function addFaq() {
    const r = await client.post('/assistant/admin/faq', { question: t('adm.assistant.faq.newQuestion'), reponse: '', mots_cles: '', ordre: 100, actif: false });
    setFaq(list => [...list, r.data]);
  }
  async function saveFaq(it) { await client.put(`/assistant/admin/faq/${it.id}`, it); loadFaq(); }
  async function removeFaq(it) {
    if (!window.confirm(t('adm.assistant.confirmDelete'))) return;
    await client.delete(`/assistant/admin/faq/${it.id}`); loadFaq();
  }

  if (!persona && !error) return <p>{t('adm.common.loading')}</p>;

  return (
    <div>
      <h1 className="page-title">{t('adm.assistant.title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 720, marginTop: 0 }}>{t('adm.assistant.intro')}</p>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      {/* 1. Personnage */}
      {persona && (
        <section className="card" style={{ maxWidth: 720, marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>{t('adm.assistant.persona.title')}</h2>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 12 }}>
            <input type="checkbox" checked={persona.enabled} onChange={e => { setPersona(p => ({ ...p, enabled: e.target.checked })); setPersonaSaved(false); }} />
            {t('adm.assistant.persona.enabled')}
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 200px' }}>
              {t('adm.assistant.persona.name')}
              <input value={persona.name} maxLength={40} onChange={e => { setPersona(p => ({ ...p, name: e.target.value })); setPersonaSaved(false); }} />
            </label>
            <label className="field" style={{ flex: '1 1 160px' }}>
              {t('adm.assistant.persona.gender')}
              <select value={persona.gender} onChange={e => { setPersona(p => ({ ...p, gender: e.target.value })); setPersonaSaved(false); }}>
                <option value="fille">{t('adm.assistant.persona.gender.fille')}</option>
                <option value="garcon">{t('adm.assistant.persona.gender.garcon')}</option>
                <option value="neutre">{t('adm.assistant.persona.gender.neutre')}</option>
              </select>
            </label>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            {t('adm.assistant.persona.avatar')}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {AVATARS.map(a => (
                <button key={a} type="button" onClick={() => { setPersona(p => ({ ...p, avatar: a })); setPersonaSaved(false); }}
                  style={{ fontSize: 22, width: 42, height: 42, borderRadius: 10, cursor: 'pointer',
                    border: persona.avatar === a ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: 'var(--color-bg)' }}>{a}</button>
              ))}
              <input value={persona.avatar} maxLength={16} onChange={e => { setPersona(p => ({ ...p, avatar: e.target.value })); setPersonaSaved(false); }}
                style={{ width: 70, textAlign: 'center', fontSize: 20 }} aria-label={t('adm.assistant.persona.avatar')} />
            </div>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            {t('adm.assistant.persona.greeting')}
            <textarea rows={2} value={persona.greeting} maxLength={400} placeholder={t('adm.assistant.persona.greetingPlaceholder')}
              onChange={e => { setPersona(p => ({ ...p, greeting: e.target.value })); setPersonaSaved(false); }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('adm.assistant.persona.greetingHint')}</span>
          </label>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={savePersona}>{t('adm.assistant.save')}</button>
            <Saved show={personaSaved} t={t} />
          </div>
        </section>
      )}

      {/* 2. Nouveautés */}
      <section className="card" style={{ maxWidth: 720, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>{t('adm.assistant.news.title')}</h2>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={addNews}>{t('adm.assistant.news.add')}</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>{t('adm.assistant.news.intro')}</p>
        {news.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>{t('adm.assistant.news.empty')}</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {news.map(it => (
            <div key={it.id} className="card" style={{ borderColor: it.actif ? 'var(--color-primary)' : undefined }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: '2 1 240px' }}>
                  {t('adm.assistant.news.fieldTitle')}
                  <input value={it.titre} onChange={e => patchNews(it.id, 'titre', e.target.value)} />
                </label>
                <label className="field" style={{ flex: '1 1 140px' }}>
                  {t('adm.assistant.news.type')}
                  <select value={it.type} onChange={e => patchNews(it.id, 'type', e.target.value)}>
                    <option value="nouveau">{t('assistant.type.nouveau')}</option>
                    <option value="amelioration">{t('assistant.type.amelioration')}</option>
                    <option value="correctif">{t('assistant.type.correctif')}</option>
                  </select>
                </label>
              </div>
              <label className="field" style={{ marginTop: 8 }}>
                {t('adm.assistant.news.content')}
                <textarea rows={3} value={it.contenu || ''} onChange={e => patchNews(it.id, 'contenu', e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <label className="field" style={{ flex: '1 1 150px' }}>
                  {t('adm.assistant.module')}
                  <select value={it.module_key || ''} onChange={e => patchNews(it.id, 'module_key', e.target.value || null)}>
                    {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m || t('adm.assistant.moduleNone')}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: '1 1 150px' }}>
                  {t('adm.assistant.link')}
                  <input value={it.lien || ''} placeholder="/qhse" onChange={e => patchNews(it.id, 'lien', e.target.value || null)} />
                </label>
                <label className="field" style={{ flex: '1 1 140px' }}>
                  {t('adm.assistant.news.date')}
                  <input type="date" value={(it.date_pub || '').slice(0, 10)} onChange={e => patchNews(it.id, 'date_pub', e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={it.actif} onChange={e => patchNews(it.id, 'actif', e.target.checked)} /> {t('adm.assistant.active')}
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={it.epingle} onChange={e => patchNews(it.id, 'epingle', e.target.checked)} /> {t('adm.assistant.news.pin')}
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => saveNews(it)}>{t('adm.assistant.save')}</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeNews(it)}>{t('adm.assistant.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. FAQ */}
      <section className="card" style={{ maxWidth: 720, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>{t('adm.assistant.faq.title')}</h2>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={addFaq}>{t('adm.assistant.faq.add')}</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>{t('adm.assistant.faq.intro')}</p>
        {faq.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>{t('adm.assistant.faq.empty')}</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {faq.map(it => (
            <div key={it.id} className="card" style={{ borderColor: it.actif ? 'var(--color-primary)' : undefined }}>
              <label className="field">
                {t('adm.assistant.faq.question')}
                <input value={it.question} onChange={e => patchFaq(it.id, 'question', e.target.value)} />
              </label>
              <label className="field" style={{ marginTop: 8 }}>
                {t('adm.assistant.faq.answer')}
                <textarea rows={3} value={it.reponse || ''} onChange={e => patchFaq(it.id, 'reponse', e.target.value)} />
              </label>
              <label className="field" style={{ marginTop: 8 }}>
                {t('adm.assistant.faq.keywords')}
                <input value={it.mots_cles || ''} placeholder={t('adm.assistant.faq.keywordsPlaceholder')} onChange={e => patchFaq(it.id, 'mots_cles', e.target.value)} />
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('adm.assistant.faq.keywordsHint')}</span>
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <label className="field" style={{ flex: '1 1 150px' }}>
                  {t('adm.assistant.module')}
                  <select value={it.module_key || ''} onChange={e => patchFaq(it.id, 'module_key', e.target.value || null)}>
                    {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m || t('adm.assistant.moduleNone')}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: '1 1 150px' }}>
                  {t('adm.assistant.link')}
                  <input value={it.lien || ''} placeholder="/stock/etat" onChange={e => patchFaq(it.id, 'lien', e.target.value || null)} />
                </label>
                <label className="field" style={{ flex: '0 1 110px' }}>
                  {t('adm.assistant.faq.order')}
                  <input type="number" value={it.ordre} onChange={e => patchFaq(it.id, 'ordre', Number(e.target.value))} />
                </label>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <input type="checkbox" checked={it.actif} onChange={e => patchFaq(it.id, 'actif', e.target.checked)} /> {t('adm.assistant.active')}
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => saveFaq(it)}>{t('adm.assistant.save')}</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeFaq(it)}>{t('adm.assistant.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
