import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RequireModule from './components/RequireModule';
import RequireAdmin from './components/RequireAdmin';
import Dashboard from './pages/Dashboard/Dashboard';
import ListPage from './pages/PurchaseRequests/ListPage';
import CreatePage from './pages/PurchaseRequests/CreatePage';
import DetailPage from './pages/PurchaseRequests/DetailPage';
import ReferentialsIndex from './pages/Referentials/ReferentialsIndex';
import Users from './pages/Admin/Users';
import WorkflowConfig from './pages/Admin/WorkflowConfig';
import EmailSettings from './pages/Admin/EmailSettings';
import TestData from './pages/Admin/TestData';
import EmployeesListPage from './pages/Employees/ListPage';
import EmployeesFormPage from './pages/Employees/FormPage';
import StockEntryPage from './pages/Stock/EntryPage';
import StockHistoryPage from './pages/Stock/HistoryPage';
import StockChartsPage from './pages/Stock/ChartsPage';
import StockDgDashboardPage from './pages/Stock/DgDashboardPage';
import StockMovementsPage from './pages/Stock/MovementsPage';
import PricesHistoryPage from './pages/Prices/HistoryPage';
import PricesChartPage from './pages/Prices/ChartPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="purchase-requests" element={<RequireModule subModule="achats"><ListPage /></RequireModule>} />
        <Route path="purchase-requests/new" element={<RequireModule subModule="achats"><CreatePage /></RequireModule>} />
        <Route path="purchase-requests/:id" element={<RequireModule subModule="achats"><DetailPage /></RequireModule>} />
        <Route path="employees" element={<RequireModule subModule="rh"><EmployeesListPage /></RequireModule>} />
        <Route path="employees/new" element={<RequireModule subModule="rh" minNiveau="ajout"><EmployeesFormPage /></RequireModule>} />
        <Route path="employees/:id" element={<RequireModule subModule="rh"><EmployeesFormPage /></RequireModule>} />
        {/* Fusionné dans le Tableau de bord (onglets Vue globale/Achats/RH/Stock) — redirige les liens/habitudes existants. */}
        <Route path="kpi" element={<Navigate to="/" replace />} />
        <Route path="stock/saisie" element={<RequireModule subModule="stock.saisie_jour"><StockEntryPage /></RequireModule>} />
        <Route path="stock/historique" element={<RequireModule subModule="stock.saisie_jour"><StockHistoryPage /></RequireModule>} />
        <Route path="stock/graphiques" element={<RequireModule subModule="stock.saisie_jour"><StockChartsPage /></RequireModule>} />
        <Route path="stock/dashboard-dg" element={<RequireModule subModule="stock.saisie_jour"><StockDgDashboardPage /></RequireModule>} />
        <Route path="stock/mouvements" element={<RequireModule subModule="stock.mouvements"><StockMovementsPage /></RequireModule>} />
        <Route path="prices/historique" element={<RequireModule subModule="referentiels.prix"><PricesHistoryPage /></RequireModule>} />
        <Route path="prices/graphique" element={<RequireModule subModule="referentiels.prix"><PricesChartPage /></RequireModule>} />
        <Route path="referentials/:type" element={<ReferentialsIndex />} />
        <Route path="admin/users" element={<RequireAdmin level="user"><Users /></RequireAdmin>} />
        <Route path="admin/workflow" element={<RequireAdmin><WorkflowConfig /></RequireAdmin>} />
        <Route path="admin/email" element={<RequireAdmin><EmailSettings /></RequireAdmin>} />
        <Route path="admin/test-data" element={<RequireAdmin><TestData /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
