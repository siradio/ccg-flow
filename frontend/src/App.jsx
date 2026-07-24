import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard/Dashboard';
import ListPage from './pages/PurchaseRequests/ListPage';
import CreatePage from './pages/PurchaseRequests/CreatePage';
import DetailPage from './pages/PurchaseRequests/DetailPage';
import ReferentialsIndex from './pages/Referentials/ReferentialsIndex';
import Users from './pages/Admin/Users';
import WorkflowConfig from './pages/Admin/WorkflowConfig';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="purchase-requests" element={<ListPage />} />
        <Route path="purchase-requests/new" element={<CreatePage />} />
        <Route path="purchase-requests/:id" element={<DetailPage />} />
        <Route path="referentials/:type" element={<ReferentialsIndex />} />
        <Route path="admin/users" element={<Users />} />
        <Route path="admin/workflow" element={<WorkflowConfig />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
