import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RequireModule from './components/RequireModule';
import RequireAdmin from './components/RequireAdmin';
import Dashboard from './pages/Dashboard/Dashboard';
import DirectionDashboard from './pages/Direction/DirectionDashboard';
import ListPage from './pages/PurchaseRequests/ListPage';
import CreatePage from './pages/PurchaseRequests/CreatePage';
import DetailPage from './pages/PurchaseRequests/DetailPage';
import ReferentialsIndex from './pages/Referentials/ReferentialsIndex';
import LogistiqueIndex from './pages/Logistique/LogistiqueIndex';
import ChecklistsPage from './pages/Logistique/ChecklistsPage';
import LogistiqueDocuments from './pages/Logistique/LogistiqueDocuments';
import PannesPage from './pages/Logistique/PannesPage';
import LogistiqueGarages from './pages/Logistique/LogistiqueGarages';
import AccidentsPage from './pages/Logistique/AccidentsPage';
import CartographiePage from './pages/Logistique/CartographiePage';
import LiensPage from './pages/Liens/LiensPage';
import UsersListPage from './pages/Admin/Users/ListPage';
import UsersDetailPage from './pages/Admin/Users/DetailPage';
import Statistiques from './pages/Admin/Statistiques';
import WorkflowConfig from './pages/Admin/WorkflowConfig';
import EmailSettings from './pages/Admin/EmailSettings';
import DocumentsBranding from './pages/Admin/DocumentsBranding';
import LoginBackground from './pages/Admin/LoginBackground';
import TestData from './pages/Admin/TestData';
import EmployeesListPage from './pages/Employees/ListPage';
import EmployeesFormPage from './pages/Employees/FormPage';
import StockReferentiels from './pages/Stock/StockReferentiels';
import StockTableauBord from './pages/Stock/StockTableauBord';
import MouvementForm from './pages/Stock/MouvementForm';
import MouvementMP from './pages/Stock/MouvementMP';
import MouvementsJournal from './pages/Stock/MouvementsJournal';
import StockActuel from './pages/Stock/StockActuel';
import StockLots from './pages/Stock/StockLots';
import StockValorisation from './pages/Stock/StockValorisation';
import StockTransferts from './pages/Stock/StockTransferts';
import StockInventaires from './pages/Stock/StockInventaires';
import StockImport from './pages/Stock/StockImport';
import StockReleveJour from './pages/Stock/StockReleveJour';
import ProductionReleve from './pages/Production/ProductionReleve';
import PricesHistoryPage from './pages/Prices/HistoryPage';
import PricesChartPage from './pages/Prices/ChartPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="direction" element={<RequireModule subModule="direction"><DirectionDashboard /></RequireModule>} />
        <Route path="purchase-requests" element={<RequireModule subModule="achats"><ListPage /></RequireModule>} />
        <Route path="purchase-requests/new" element={<RequireModule subModule="achats"><CreatePage /></RequireModule>} />
        <Route path="purchase-requests/:id" element={<RequireModule subModule="achats"><DetailPage /></RequireModule>} />
        <Route path="liens" element={<RequireModule subModule="liens"><LiensPage /></RequireModule>} />
        <Route path="liens/:categorie" element={<RequireModule subModule="liens"><LiensPage /></RequireModule>} />
        <Route path="employees" element={<RequireModule subModule="rh"><EmployeesListPage /></RequireModule>} />
        <Route path="employees/new" element={<RequireModule subModule="rh" minNiveau="ajout"><EmployeesFormPage /></RequireModule>} />
        <Route path="employees/:id" element={<RequireModule subModule="rh"><EmployeesFormPage /></RequireModule>} />
        {/* Fusionné dans le Tableau de bord (onglets Vue globale/Achats/RH/Stock) — redirige les liens/habitudes existants. */}
        <Route path="kpi" element={<Navigate to="/" replace />} />
        <Route path="stock/referentiels" element={<RequireModule subModule="stock.referentiels"><StockReferentiels /></RequireModule>} />
        <Route path="stock/tableau-bord" element={<RequireModule subModule="stock.tableau_bord"><StockTableauBord /></RequireModule>} />
        <Route path="stock/releve-jour" element={<RequireModule subModule="stock.releve_jour"><StockReleveJour /></RequireModule>} />
        <Route path="stock/saisie-mouvement" element={<RequireModule subModule="stock.saisie"><MouvementForm /></RequireModule>} />
        <Route path="stock/saisie-mp" element={<RequireModule subModule="stock.saisie"><MouvementMP /></RequireModule>} />
        <Route path="stock/journal" element={<RequireModule subModule="stock.consultation"><MouvementsJournal /></RequireModule>} />
        <Route path="stock/etat" element={<RequireModule subModule="stock.consultation"><StockActuel /></RequireModule>} />
        <Route path="stock/lots" element={<RequireModule subModule="stock.consultation"><StockLots /></RequireModule>} />
        <Route path="stock/valorisation" element={<RequireModule subModule="stock.valorisation"><StockValorisation /></RequireModule>} />
        <Route path="stock/transferts" element={<RequireModule subModule="stock.transferts"><StockTransferts /></RequireModule>} />
        <Route path="stock/inventaires" element={<RequireModule subModule="stock.inventaires"><StockInventaires /></RequireModule>} />
        <Route path="stock/import" element={<RequireModule subModule="stock.import"><StockImport /></RequireModule>} />
        <Route path="production/releve" element={<RequireModule subModule="production.releve"><ProductionReleve /></RequireModule>} />
        <Route path="production/suivi" element={<RequireModule subModule="production.suivi"><ProductionReleve /></RequireModule>} />
        <Route path="prices/historique" element={<RequireModule subModule="referentiels.prix"><PricesHistoryPage /></RequireModule>} />
        <Route path="prices/graphique" element={<RequireModule subModule="referentiels.prix"><PricesChartPage /></RequireModule>} />
        <Route path="referentials/:type" element={<ReferentialsIndex />} />
        <Route path="logistique/checklists" element={<ChecklistsPage />} />
        <Route path="logistique/documents" element={<LogistiqueDocuments />} />
        <Route path="logistique/pannes" element={<PannesPage />} />
        <Route path="logistique/garages" element={<LogistiqueGarages />} />
        <Route path="logistique/accidents" element={<AccidentsPage />} />
        <Route path="logistique/cartographie" element={<CartographiePage />} />
        <Route path="logistique/:type" element={<LogistiqueIndex />} />
        <Route path="admin/users" element={<RequireAdmin level="user"><UsersListPage /></RequireAdmin>} />
        <Route path="admin/users/:id" element={<RequireAdmin level="user"><UsersDetailPage /></RequireAdmin>} />
        <Route path="admin/stats" element={<RequireAdmin level="user"><Statistiques /></RequireAdmin>} />
        <Route path="admin/workflow" element={<RequireAdmin><WorkflowConfig /></RequireAdmin>} />
        <Route path="admin/email" element={<RequireAdmin><EmailSettings /></RequireAdmin>} />
        <Route path="admin/documents" element={<RequireAdmin><DocumentsBranding /></RequireAdmin>} />
        <Route path="admin/login-background" element={<RequireAdmin><LoginBackground /></RequireAdmin>} />
        <Route path="admin/test-data" element={<RequireAdmin><TestData /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
