const { all, one } = require('../../db');
const { isSuperAdmin } = require('../../middleware/permissions');

async function getMyRequestStats(userId) {
  const rows = await all(
    `SELECT status, COUNT(*)::int AS count FROM purchase_requests WHERE requester_user_id = $1 GROUP BY status`,
    [userId]
  );
  const byStatus = {};
  let total = 0;
  for (const r of rows) { byStatus[r.status] = r.count; total += r.count; }
  return { total, byStatus };
}

// Pour chaque rôle de validation détenu par l'utilisateur (hors demandeur/super_admin), compte
// les demandes actuellement en attente de son action sur l'entité correspondante.
async function getPendingAction(user) {
  const items = [];
  for (const r of user.roles || []) {
    if (!r.entity_id || r.role_code === 'demandeur') continue;
    let count;
    if (r.role_code === 'service_achat') {
      const row = await one(
        `SELECT COUNT(*)::int AS count FROM purchase_requests
         WHERE entity_id = $1 AND status IN ('soumise', 'en_analyse_achat', 'devis_en_cours', 'devis_selectionne')`,
        [r.entity_id]
      );
      count = row.count;
    } else if (r.role_code === 'dga') {
      // Même double point d'action que listPendingAction() côté demandes d'achat : expression
      // de besoin en amont + étape finale si elle existe encore dans le circuit configuré.
      const row = await one(
        `SELECT COUNT(*)::int AS count FROM purchase_requests pr
         LEFT JOIN workflow_steps ws ON ws.id = pr.current_step_id
         WHERE pr.entity_id = $1 AND (pr.status = 'en_attente_validation_besoin' OR (pr.status = 'en_validation' AND ws.role_code_requis = $2))`,
        [r.entity_id, r.role_code]
      );
      count = row.count;
    } else {
      const row = await one(
        `SELECT COUNT(*)::int AS count FROM purchase_requests pr
         JOIN workflow_steps ws ON ws.id = pr.current_step_id
         WHERE pr.entity_id = $1 AND pr.status = 'en_validation' AND ws.role_code_requis = $2`,
        [r.entity_id, r.role_code]
      );
      count = row.count;
    }
    items.push({ role_code: r.role_code, entity_id: r.entity_id, entity_code: r.entity_code, count });
  }
  const total = items.reduce((sum, i) => sum + i.count, 0);
  return { total, items };
}

// Comptage jour par jour sur une fenêtre glissante, jours sans activité inclus (sinon un jour à
// zéro disparaîtrait de la série au lieu d'y apparaître comme un vrai creux) — `table`/`dateColumn`
// sont toujours des constantes internes ci-dessous, jamais dérivées d'une entrée utilisateur.
async function getDailyCounts(table, dateColumn, days = 14) {
  const rows = await all(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day')::date AS day
     )
     SELECT d.day, COALESCE(COUNT(t.id), 0)::int AS count
     FROM days d
     LEFT JOIN ${table} t ON t.${dateColumn}::date = d.day
     GROUP BY d.day
     ORDER BY d.day`,
    [days]
  );
  return rows.map(r => r.count);
}

// 7 derniers jours vs les 7 précédents — pas de comparaison "statut par statut dans le temps"
// (non reconstituible : une demande change de statut, aucune table ne garde l'historique des
// comptages), seulement des compteurs d'événements datés (création, génération de BC), qui eux
// se prêtent honnêtement à une tendance.
function trendFromDaily(daily) {
  const last7 = daily.slice(-7);
  const prev7 = daily.slice(-14, -7);
  const total = last7.reduce((s, c) => s + c, 0);
  const previousTotal = prev7.reduce((s, c) => s + c, 0);
  return { total, delta: total - previousTotal, sparkline: last7 };
}

async function getAdminStats() {
  const [employees, products, suppliers, sites, warehouses, machines, users] = await Promise.all([
    one('SELECT COUNT(*)::int AS c FROM employees'),
    one('SELECT COUNT(*)::int AS c FROM products'),
    one('SELECT COUNT(*)::int AS c FROM suppliers'),
    one('SELECT COUNT(*)::int AS c FROM sites'),
    one('SELECT COUNT(*)::int AS c FROM warehouses'),
    one('SELECT COUNT(*)::int AS c FROM machines'),
    one('SELECT COUNT(*)::int AS c FROM users'),
  ]);

  const prByStatusRows = await all('SELECT status, COUNT(*)::int AS count FROM purchase_requests GROUP BY status');
  const prByStatus = {};
  for (const r of prByStatusRows) prByStatus[r.status] = r.count;

  const prByEntity = await all(
    `SELECT e.code AS entity_code, COUNT(pr.id)::int AS count
     FROM entities e LEFT JOIN purchase_requests pr ON pr.entity_id = e.id
     GROUP BY e.code ORDER BY e.code`
  );

  // Sommé par devise : additionner des montants GNF/USD/EUR ensemble n'aurait aucun sens.
  const montantParDevise = await all(
    `SELECT devise, COALESCE(SUM(montant_final), 0)::float AS total
     FROM purchase_requests WHERE status = 'bon_commande_genere' GROUP BY devise`
  );

  const [newRequestsDaily, ordersDaily] = await Promise.all([
    getDailyCounts('purchase_requests', 'created_at'),
    getDailyCounts('purchase_orders', 'generated_at'),
  ]);
  const activity = {
    newRequests: trendFromDaily(newRequestsDaily),
    ordersGenerated: trendFromDaily(ordersDaily),
  };

  return {
    activity,
    counts: {
      employees: employees.c, products: products.c, suppliers: suppliers.c,
      sites: sites.c, warehouses: warehouses.c, machines: machines.c, users: users.c,
    },
    prByStatus,
    prByEntity,
    montantParDevise,
  };
}

async function getDashboard(user) {
  const admin = isSuperAdmin(user);
  const [myRequests, pendingAction, adminStats] = await Promise.all([
    getMyRequestStats(user.id),
    getPendingAction(user),
    admin ? getAdminStats() : Promise.resolve(null),
  ]);
  return { isAdmin: admin, myRequests, pendingAction, admin: adminStats };
}

module.exports = { getDashboard };
