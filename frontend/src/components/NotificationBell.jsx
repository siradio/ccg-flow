import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useI18n } from '../i18n/I18nContext';

function timeAgo(dateStr, t) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('notif.justNow');
  if (mins < 60) return t('notif.minAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notif.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return t('notif.daysAgo', { n: days });
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function NotificationBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  function loadUnreadCount() {
    client.get('/notifications', { params: { unread: 'true' } }).then(res => setUnreadCount(res.data.length));
  }

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggleOpen() {
    if (!open) {
      client.get('/notifications').then(res => setNotifications(res.data.slice(0, 15)));
    }
    setOpen(o => !o);
  }

  async function handleClick(n) {
    if (!n.lu) {
      await client.post(`/notifications/${n.id}/read`);
      setNotifications(list => list.map(x => (x.id === n.id ? { ...x, lu: true } : x)));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.lien) navigate(n.lien);
  }

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button className="notif-bell-btn" onClick={toggleOpen} aria-label={t('notif.title')} type="button">
        <BellIcon />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">{t('notif.title')}</div>
          {notifications === null ? (
            <div className="notif-empty">{t('prd.loading')}</div>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">{t('notif.empty')}</div>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                type="button"
                className={`notif-item${n.lu ? '' : ' notif-item-unread'}`}
                onClick={() => handleClick(n)}
              >
                <div className="notif-item-message">{n.message}</div>
                <div className="notif-item-meta">{timeAgo(n.created_at, t)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
