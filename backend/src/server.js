const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { runMigrations } = require('./db');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/access-requests', require('./modules/access-requests/access-requests.routes'));
app.use('/api/users', require('./modules/users/users.routes'));
app.use('/api/access-profiles', require('./modules/access-profiles/access-profiles.routes'));
app.use('/api/stats', require('./modules/stats/stats.routes'));
app.use('/api/entities', require('./modules/referentials/entities.routes'));
app.use('/api/sites', require('./modules/referentials/sites.routes'));
app.use('/api/warehouses', require('./modules/referentials/warehouses.routes'));
app.use('/api/machines', require('./modules/referentials/machines.routes'));
app.use('/api/employees', require('./modules/employees/employees.routes'));
app.use('/api/products', require('./modules/referentials/products.routes'));
app.use('/api/product-categories', require('./modules/referentials/product-categories.routes'));
app.use('/api/business-units', require('./modules/referentials/business-units.routes'));
app.use('/api/suppliers', require('./modules/referentials/suppliers.routes'));
app.use('/api/workflows', require('./modules/workflow/workflow.routes'));
app.use('/api/purchase-requests', require('./modules/purchase-requests/purchase-requests.routes'));
app.use('/api/purchase-orders', require('./modules/purchase-orders/purchase-orders.routes'));
app.use('/api/attachments', require('./modules/attachments/attachments.routes'));
app.use('/api/notifications', require('./modules/notifications/notifications.routes'));
app.use('/api/dashboard', require('./modules/dashboard/dashboard.routes'));
app.use('/api/settings', require('./modules/settings/settings.routes'));
app.use('/api/kpi', require('./modules/kpi/kpi.routes'));
app.use('/api/documents', require('./modules/documents/documents.routes'));
app.use('/api/announcements', require('./modules/announcements/announcements.routes'));
app.use('/api/stock', require('./modules/stock/stock.routes'));
app.use('/api/prices', require('./modules/prices/prices.routes'));
app.use('/api/stock-movements', require('./modules/stock-movements/stock-movements.routes'));
app.use('/api/vehicle-types', require('./modules/logistique/vehicle-types.routes'));
app.use('/api/vehicles', require('./modules/logistique/vehicles.routes'));
app.use('/api/drivers', require('./modules/logistique/drivers.routes'));
app.use('/api/test-data', require('./modules/test-data/test-data.routes'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// En production, un seul App Service sert à la fois l'API et le build React (§ déploiement Azure,
// SPEC.md) — évite un second service/CORS/domaine à gérer. N'a d'effet que si un build existe :
// en dev local, le frontend tourne séparément via `vite` sur le port 5173.
// - `../public` : structure de déploiement Azure — le CI copie frontend/dist dans backend/public
//   pour que le paquet déployé (juste le dossier backend/) soit autonome.
// - `../../frontend/dist` : repli pour tester un build de prod en local sans cette copie.
const frontendDist = [path.join(__dirname, '../public'), path.join(__dirname, '../../frontend/dist')]
  .find(p => fs.existsSync(p));
if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = env.port;

async function start() {
  console.log('Application des migrations...');
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`✅ CCG Flow API démarrée sur http://localhost:${PORT}`);
    console.log('   Pense à lancer "npm run seed" la première fois pour peupler la base.');
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error('❌ Impossible de démarrer :', err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
