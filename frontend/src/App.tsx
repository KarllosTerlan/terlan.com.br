import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Appointments from './pages/Appointments';
import CalendarPage from './pages/Calendar';
import WhatsAppSetup from './pages/WhatsAppSetup';
import Settings from './pages/Settings';
import Conversations from './pages/Conversations';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/whatsapp" element={<WhatsAppSetup />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
