import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/layout/Layout';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/admin/Dashboard';
import Apartments from '../pages/admin/Apartments';
import Periods from '../pages/admin/Periods';
import Collections from '../pages/admin/Collections';
import OwnerDashboard from '../pages/owner/OwnerDashboard';

function RootRedirect() {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={isAdmin ? '/admin' : '/mi-consumo'} replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Register />} />

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout title="Administración" />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="apartamentos" element={<Apartments />} />
          <Route path="periodos" element={<Periods />} />
          <Route path="cobros" element={<Collections />} />
        </Route>

        {/* Owner Routes */}
        <Route path="/mi-consumo" element={
          <ProtectedRoute roles={['OWNER']}>
            <Layout title="Mi Consumo" />
          </ProtectedRoute>
        }>
          <Route index element={<OwnerDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
