import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ClientDashboard from './pages/ClientDashboard';
import LojistaDashboard from './pages/LojistaDashboard';
import AdminDashboard from './pages/AdminDashboard';
import CreateRequest from './pages/CreateRequest';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Rota Inicial e Login */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Rotas do Cliente */}
        <Route path="/client-dashboard" element={<ClientDashboard />} />
        <Route path="/my-requests" element={<ClientDashboard />} />
        <Route path="/create-request" element={<CreateRequest />} />

        {/* Rotas do Lojista */}
        <Route path="/lojista-dashboard" element={<LojistaDashboard />} />

        {/* Rotas do Administrador */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />

        {/* Redirecionamento padrão */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
