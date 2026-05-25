'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, MessageSquare,
  Settings, Bot, Clock, Wrench, Shield, FileText,
  Database, LogOut, Bell, Wifi, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearToken } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useClinic } from '@/lib/auth';

const MAIN_NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Visão Geral' },
  { href: '/dashboard/appointments', icon: Calendar, label: 'Agendamentos' },
  { href: '/dashboard/patients', icon: Users, label: 'Pacientes' },
  { href: '/dashboard/conversations', icon: MessageSquare, label: 'Conversas' },
];

const SETTINGS_NAV = [
  { href: '/dashboard/settings', icon: Settings, label: 'Configurações', exact: true },
  { href: '/dashboard/settings/agent', icon: Bot, label: 'Agente IA' },
  { href: '/dashboard/settings/services', icon: Wrench, label: 'Serviços' },
  { href: '/dashboard/settings/hours', icon: Clock, label: 'Horários' },
  { href: '/dashboard/settings/whatsapp', icon: Wifi, label: 'WhatsApp' },
  { href: '/dashboard/settings/google', icon: Globe, label: 'Google Calendar' },
  { href: '/dashboard/settings/observability', icon: FileText, label: 'Observabilidade' },
  { href: '/dashboard/settings/blacklist', icon: Shield, label: 'Blacklist' },
  { href: '/dashboard/settings/backup', icon: Database, label: 'Backup' },
];

function NavItem({ href, icon: Icon, label, exact }: { href: string; icon: React.ElementType; label: string; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
        active
          ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_12px_rgba(0,212,255,0.08)]'
          : 'text-muted hover:bg-white/5 hover:text-white border border-transparent',
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const router = useRouter();
  const clinic = useClinic();

  const handleLogout = () => {
    clearToken();
    router.push('/login');
  };

  return (
    <aside className="flex flex-col rounded-2xl border border-border bg-surface shadow-[0_4px_32px_rgba(0,0,0,0.4)] overflow-hidden lg:sticky lg:top-5 lg:self-start lg:max-h-[calc(100vh-2.5rem)]">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9 flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/25 shadow-[0_0_16px_rgba(0,212,255,0.12)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-primary text-base font-bold font-mono">C</span>
            </div>
          </div>
          <div>
            <p className="font-bold tracking-wider text-white text-[15px] leading-none">
              CLINIC<span className="text-primary">BOT</span>
            </p>
            <p className="text-[10px] text-muted-subtle tracking-widest uppercase mt-1">Pro</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-subtle">
            Menu
          </p>
          <div className="space-y-0.5">
            {MAIN_NAV.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        </div>

        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-subtle">
            Configurações
          </p>
          <div className="space-y-0.5">
            {SETTINGS_NAV.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-3 space-y-2">
        {clinic && (
          <div className="px-3 py-2.5 rounded-xl bg-background border border-border">
            <p className="text-[10px] text-muted-subtle uppercase tracking-widest">Clínica</p>
            <p className="text-xs text-muted mt-0.5 truncate font-medium">{clinic.name}</p>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted font-medium transition-all hover:bg-danger/10 hover:text-danger border border-transparent hover:border-danger/20"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>

        <p className="text-center text-[10px] text-muted-subtle pb-1">
          ClinicBot <span className="text-primary/50 font-semibold">Pro</span>
        </p>
      </div>
    </aside>
  );
}
