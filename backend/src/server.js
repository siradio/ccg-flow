const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { runMigrations } = require('./db');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/users', require('./modules/users/users.routes'));
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
app.use('/api/stock', require('./modules/stock/stock.routes'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

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
