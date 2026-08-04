const { all, one } = require('../../db');

// Nombre de connexions par utilisateur + dernière connexion (tous les comptes, même ceux jamais
// connectés, grâce au LEFT JOIN), triés du plus actif au moins actif.
async function getPerUserLogins() {
  return all(
    `SELECT u.id, u.nom, u.prenom, u.email, u.actif, u.access_status,
            COUNT(le.id)::int AS login_count,
            MAX(le.created_at) AS last_login
     FROM users u
     LEFT JOIN login_events le ON le.user_id = u.id
     GROUP BY u.id
     ORDER BY login_count DESC, u.nom, u.prenom`
  );
}

// Indicateurs globaux : total de connexions, actifs sur 7/30 jours (utilisateurs distincts), et
// nombre de comptes ne s'étant jamais connectés (depuis le début du suivi).
async function getTotals() {
  const totals = await one(
    `SELECT
       COUNT(*)::int AS total_logins,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS logins_7d,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS logins_30d,
       COUNT(DISTINCT user_id) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS active_7d,
       COUNT(DISTINCT user_id) FILTER (WHERE created_at >= now() - interval '30 days')::int AS active_30d,
       COUNT(DISTINCT user_id)::int AS ever_connected
     FROM login_events`
  );
  const users = await one('SELECT COUNT(*)::int AS c FROM users');
  return {
    total_logins: totals.total_logins,
    logins_7d: totals.logins_7d,
    logins_30d: totals.logins_30d,
    active_7d: totals.active_7d,
    active_30d: totals.active_30d,
    total_users: users.c,
    never_connected: users.c - totals.ever_connected,
  };
}

async function getLoginStats() {
  const [totals, perUser] = await Promise.all([getTotals(), getPerUserLogins()]);
  return { totals, perUser };
}

// Connexions jour par jour sur une fenêtre glissante, jours creux inclus (generate_series +
// LEFT JOIN, même approche que dashboard.getDailyCounts) pour un graphe sans trous.
async function getDailyLogins(days = 30) {
  return all(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(COUNT(le.id), 0)::int AS count
     FROM days d
     LEFT JOIN login_events le ON le.created_at::date = d.day
     GROUP BY d.day
     ORDER BY d.day`,
    [days]
  );
}

module.exports = { getLoginStats, getDailyLogins };
