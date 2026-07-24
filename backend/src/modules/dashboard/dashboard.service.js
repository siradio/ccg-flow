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

  return {
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
