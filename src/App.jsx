import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import CreateRequest from './pages/CreateRequest';
import ClientDashboard from './pages/ClientDashboard';
import LojistaDashboard from './pages/LojistaDashboard';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/create-request" element={<CreateRequest />} />
        <Route path="/my-requests" element={<ClientDashboard />} />
        <Route path="/lojista-dashboard" element={<LojistaDashboard />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}