import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Calendar,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  QrCode,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/appointments', label: 'Agendamentos', icon: ListChecks },
  { to: '/calendar', label: 'Calendário', icon: Calendar },
  { to: '/conversations', label: 'Conversas', icon: MessageCircle },
  { to: '/whatsapp', label: 'WhatsApp', icon: QrCode },
  { to: '/settings', label: 'Configurações', icon: SettingsIcon },
];

export default function Layout() {
  const navigate = useNavigate();
  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="p-4 text-xl font-bold text-brand-600">
          <Link to="/">Clinic Bot</Link>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              <n.icon size={16} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          <LogOut size={16} /> Sair
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
