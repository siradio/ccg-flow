import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import './AssistantWidget.css';

// Assistant « CCG Flow » — widget flottant, à base de règles (AUCUNE clé IA). Deux onglets :
//  • Nouveautés : annonces éditées par le super_admin, avec pastille de non-lu (mémorisée par
//    appareil dans localStorage).
//  • Poser une question : FAQ interrogée côté serveur (score par mots-clés). Affichage « chat ».
// Visible par tout utilisateur authentifié (monté dans Layout), sans octroi de sous-module.

const NEWS_READ_KEY = 'ccg-flow-assistant-news-read'; // dernier id d'annonce vu sur cet appareil

function readLastSeen() {
  try { return Number(localStorage.getItem(NEWS_READ_KEY)) || 0; } catch { return 0; }
}
function writeLastSeen(id) {
  try { localStorage.setItem(NEWS_READ_KEY, String(id)); } catch { /* stockage indispo */ }
}

// Mot de rôle selon le genre choisi pour le personnage.
function roleWord(gender, t) {
  if (gender === 'fille') return t('assistant.role.fille');
  if (gender === 'garcon') return t('assistant.role.garcon');
  return t('assistant.role.neutre');
}

// Message d'accueil : celui saisi par l'admin s'il existe, sinon un message dérivé du nom/genre
// qui mentionne « CCG Flow » (ex. « Bonjour ! Je suis Flo, votre assistant CCG Flow. … »).
function defaultGreeting(persona, t) {
  if (persona?.greeting && persona.greeting.trim()) return persona.greeting.trim();
  const name = persona?.name || 'Flo';
  return `${t('assistant.ask.hello')} ${name}, ${roleWord(persona?.gender, t)} CCG Flow. ${t('assistant.ask.intro')}`;
}

export default function AssistantWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [persona, setPersona] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('news');
  const [news, setNews] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [lastSeen, setLastSeen] = useState(readLastSeen());
  const [thread, setThread] = useState([]); // [{ from:'user'|'bot', text?, items?, suggests? }]
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [greetBubble, setGreetBubble] = useState(false); // bulle d'accueil à la connexion
  const bodyRef = useRef(null);

  // Charge le personnage ; si l'assistant est désactivé par l'admin, on ne monte rien.
  useEffect(() => {
    client.get('/assistant/persona').then(r => setPersona(r.data)).catch(() => setPersona({ enabled: false }));
  }, []);

  // Charge nouveautés + suggestions dès que l'assistant est actif (pour calculer la pastille de non-lu).
  useEffect(() => {
    if (!persona?.enabled) return;
    client.get('/assistant/news').then(r => setNews(r.data || [])).catch(() => {});
    client.get('/assistant/faq/suggestions').then(r => setSuggestions(r.data || [])).catch(() => {});
  }, [persona?.enabled]);

  // Présentation à la connexion : si une connexion fraîche a été signalée (voir AuthContext.login),
  // l'assistant se présente d'une bulle d'accueil, une seule fois. Auto-masquée après ~11 s.
  useEffect(() => {
    if (!persona?.enabled) return;
    let shouldGreet = false;
    try {
      shouldGreet = sessionStorage.getItem('ccg-flow-assistant-greet') === '1';
      if (shouldGreet) sessionStorage.removeItem('ccg-flow-assistant-greet');
    } catch { /* stockage indispo */ }
    if (!shouldGreet) return;
    setGreetBubble(true);
    const id = setTimeout(() => setGreetBubble(false), 11000);
    return () => clearTimeout(id);
  }, [persona?.enabled]);

  const maxNewsId = news.length ? Math.max(...news.map(n => n.id)) : 0;
  const unread = news.filter(n => n.id > lastSeen).length;

  // Ouvre un lien interne et ferme le panneau.
  const go = useCallback((lien) => { if (lien) { setOpen(false); navigate(lien); } }, [navigate]);

  // Quand on ouvre l'onglet Nouveautés, on marque tout comme lu (pastille remise à zéro).
  useEffect(() => {
    if (open && tab === 'news' && maxNewsId > lastSeen) {
      writeLastSeen(maxNewsId);
      setLastSeen(maxNewsId);
    }
  }, [open, tab, maxNewsId, lastSeen]);

  // Auto-scroll du fil de discussion.
  useEffect(() => { if (bodyRef.current && tab === 'ask') bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [thread, tab]);

  const greeting = defaultGreeting(persona, t);

  async function ask(text) {
    const q = String(text ?? query).trim();
    if (!q || busy) return;
    setQuery('');
    setThread(prev => [...prev, { from: 'user', text: q }]);
    setBusy(true);
    try {
      const { data } = await client.get('/assistant/faq/search', { params: { q } });
      const matches = (data && data.matches) || [];
      if (matches.length) {
        setThread(prev => [...prev, { from: 'bot', items: matches }]);
      } else {
        setThread(prev => [...prev, { from: 'bot', text: t('assistant.ask.noMatch'), suggests: suggestions.slice(0, 4) }]);
      }
    } catch {
      setThread(prev => [...prev, { from: 'bot', text: t('assistant.ask.error') }]);
    } finally {
      setBusy(false);
    }
  }

  if (!persona || !persona.enabled) return null;

  const avatar = persona.avatar || '🤖';
  const name = persona.name || 'Flo';

  return (
    <>
      {!open && greetBubble && (
        <div className="assistant-greet" role="status">
          <button type="button" className="assistant-greet-close" aria-label={t('assistant.close')}
            onClick={e => { e.stopPropagation(); setGreetBubble(false); }}>×</button>
          <button type="button" className="assistant-greet-body"
            onClick={() => { setGreetBubble(false); setTab('ask'); setOpen(true); }}>
            <span className="assistant-greet-avatar" aria-hidden="true">{avatar}</span>
            <span className="assistant-greet-text">{greeting}</span>
          </button>
        </div>
      )}

      {!open && (
        <button type="button" className="assistant-fab" onClick={() => setOpen(true)}
          aria-label={t('assistant.open')} title={name}>
          <span aria-hidden="true">{avatar}</span>
          {unread > 0 && <span className="assistant-fab-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}

      {open && (
        <div className="assistant-panel" role="dialog" aria-label={name}>
          <div className="assistant-head">
            <span className="assistant-head-avatar" aria-hidden="true">{avatar}</span>
            <span>
              <span className="assistant-head-title" style={{ display: 'block' }}>{name}</span>
              <span className="assistant-head-sub">{roleWord(persona.gender, t)}</span>
            </span>
            <button type="button" className="assistant-head-close" onClick={() => setOpen(false)} aria-label={t('assistant.close')}>×</button>
          </div>

          <div className="assistant-tabs">
            <button type="button" className={`assistant-tab${tab === 'news' ? ' active' : ''}`} onClick={() => setTab('news')}>
              {t('assistant.tab.news')}
              {unread > 0 && <span className="assistant-tab-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <button type="button" className={`assistant-tab${tab === 'ask' ? ' active' : ''}`} onClick={() => setTab('ask')}>
              {t('assistant.tab.ask')}
            </button>
          </div>

          {tab === 'news' && (
            <div className="assistant-body" ref={bodyRef}>
              {news.length === 0 && <p className="assistant-empty">{t('assistant.news.empty')}</p>}
              {news.map(n => (
                <div key={n.id} className="assistant-news-item">
                  <div className="assistant-news-top">
                    <span className={`assistant-chip ${n.type}`}>{t(`assistant.type.${n.type}`)}</span>
                    {n.date_pub && <span className="assistant-news-date">{new Date(n.date_pub).toLocaleDateString('fr-FR')}</span>}
                  </div>
                  <div className="assistant-news-title">{n.titre}</div>
                  {n.contenu && <div className="assistant-news-body">{n.contenu}</div>}
                  {n.type === 'bientot' ? (
                    // Module pas encore ouvert : on n'affiche pas de lien d'ouverture (il ne mènerait
                    // nulle part), mais une mention claire « sera bientôt disponible ».
                    <div className="assistant-soon-note">⏳ {t('assistant.news.comingSoon')}</div>
                  ) : (
                    n.lien && <button type="button" className="assistant-link" onClick={() => go(n.lien)}>{t('assistant.news.open')} →</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'ask' && (
            <>
              <div className="assistant-body" ref={bodyRef}>
                <div className="assistant-thread">
                  <div className="assistant-bubble bot">{greeting}</div>
                  {thread.length === 0 && suggestions.length > 0 && (
                    <div className="assistant-suggests">
                      {suggestions.map(s => (
                        <button key={s.id} type="button" className="assistant-suggest" onClick={() => ask(s.question)}>{s.question}</button>
                      ))}
                    </div>
                  )}
                  {thread.map((m, i) => (
                    m.from === 'user' ? (
                      <div key={i} className="assistant-bubble user">{m.text}</div>
                    ) : (
                      <div key={i} className="assistant-bubble bot">
                        {m.text && <div>{m.text}</div>}
                        {m.items && m.items.map((it, j) => (
                          <div key={it.id} style={{ marginTop: j ? 10 : 0 }}>
                            <div className="qa-q">{it.question}</div>
                            <div>{it.reponse}</div>
                            {it.lien && <button type="button" className="assistant-link" onClick={() => go(it.lien)}>{t('assistant.ask.openScreen')} →</button>}
                          </div>
                        ))}
                        {m.suggests && m.suggests.length > 0 && (
                          <div className="assistant-suggests">
                            {m.suggests.map(s => (
                              <button key={s.id} type="button" className="assistant-suggest" onClick={() => ask(s.question)}>{s.question}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ))}
                  {busy && <div className="assistant-bubble bot">…</div>}
                </div>
              </div>
              <form className="assistant-ask-form" onSubmit={e => { e.preventDefault(); ask(); }}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('assistant.ask.placeholder')} aria-label={t('assistant.ask.placeholder')} />
                <button type="submit" className="assistant-ask-send" disabled={busy || !query.trim()} aria-label={t('assistant.ask.send')}>➤</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
