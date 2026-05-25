'use client';

import Link from 'next/link';
import { Bot, Clock, Wrench, Wifi, Globe, FileText, Shield, Database, Settings } from 'lucide-react';

const SETTINGS_CARDS = [
  {
    href: '/dashboard/settings/agent',
    icon: Bot,
    title: 'Agente IA',
    description: 'Prompt, FAQ, modelo, temperatura e simulador',
    color: 'text-primary',
    bg: 'bg-primary/10 border-primary/20',
  },
  {
    href: '/dashboard/settings/services',
    icon: Wrench,
    title: 'Serviços',
    description: 'Procedimentos, duração e preços',
    color: 'text-success',
    bg: 'bg-success/10 border-success/20',
  },
  {
    href: '/dashboard/settings/hours',
    icon: Clock,
    title: 'Horários',
    description: 'Funcionamento por dia, intervalos e feriados',
    color: 'text-warning',
    bg: 'bg-warning/10 border-warning/20',
  },
  {
    href: '/dashboard/settings/whatsapp',
    icon: Wifi,
    title: 'WhatsApp',
    description: 'Instância Evolution API, QR code, status',
    color: 'text-success',
    bg: 'bg-success/10 border-success/20',
  },
  {
    href: '/dashboard/settings/google',
    icon: Globe,
    title: 'Google Calendar',
    description: 'Sincronização automática de agendamentos',
    color: 'text-primary',
    bg: 'bg-primary/10 border-primary/20',
  },
  {
    href: '/dashboard/settings/observability',
    icon: FileText,
    title: 'Observabilidade',
    description: 'Logs do sistema, erros e avisos',
    color: 'text-warning',
    bg: 'bg-warning/10 border-warning/20',
  },
  {
    href: '/dashboard/settings/blacklist',
    icon: Shield,
    title: 'Blacklist',
    description: 'Números bloqueados de usar o agente',
    color: 'text-danger',
    bg: 'bg-danger/10 border-danger/20',
  },
  {
    href: '/dashboard/settings/backup',
    icon: Database,
    title: 'Backup',
    description: 'Backup automático e histórico de execuções',
    color: 'text-muted',
    bg: 'bg-white/5 border-white/10',
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Configurações
        </h1>
        <p className="text-sm text-muted mt-1">Gerencie todos os aspectos do sistema</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SETTINGS_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="card p-5 hover:border-white/20 transition-all group hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
          >
            <div className={`inline-flex rounded-xl p-2.5 border mb-4 ${card.bg}`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <h3 className="font-semibold text-white text-sm group-hover:text-primary transition-colors">
              {card.title}
            </h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
